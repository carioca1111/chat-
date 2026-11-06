"""Deterministic landscape ageing by channels, weathering and sediment transport.

The channel update uses the downstream-first, implicit n=1 stream-power form
described by Braun & Willett (2013). Drainage is periodically recomputed rather
than carved once into an obsolete heightfield. Conservative pairwise hillslope
creep and over-steep talus relaxation widen valleys and soften weathered crests.

This is a regional morphological model. ``model_years`` is model exposure, not a
claim that an uncalibrated fictional mountain has a measured geological age.
No random texture or hexagonal border enters this module.
"""
from __future__ import annotations

import math
import heapq
import numpy as np

from .hydrology import _accumulate, _route, _slices


DEFAULTS = {
    "boundary_mode": "ocean",
    "iterations": 12,
    "model_years": 100000.,
    "stream_power_k": 3e-6,
    "reroute_every": 3,
    "max_incision_per_stage_m": 120.,
    "hillslope_diffusivity_m2_yr": 120.,
    "talus_angle_degrees": 32.,
    "thermal_relaxation": .12,
    "max_deposition_per_stage_m": 8.,
}


def _route_open(height, active, dx, dy):
    """Priority-Flood with immutable outlets at their actual nonzero heights.

    Unlike a continental sea boundary, a mountain detail tile is surrounded by
    positive terrain that must keep matching its parent surface. Its boundary
    cells seed the flood at their actual elevations, not a fictitious sea zero.
    """
    h, w = height.shape
    size = height.size
    surface = np.asarray(height, dtype=float).copy().ravel()
    flat_active = active.ravel()
    seen = ~flat_active.copy()
    receiver = np.full(size, -1, dtype=np.int32)
    queue = [(float(surface[i]), int(i)) for i in np.flatnonzero(seen)]
    heapq.heapify(queue)
    order = np.empty(int(flat_active.sum()), dtype=np.int32)
    count = 0
    directions = ((-1, -1), (-1, 0), (-1, 1), (0, -1),
                  (0, 1), (1, -1), (1, 0), (1, 1))
    while queue:
        water, cell = heapq.heappop(queue)
        row, col = divmod(cell, w)
        if flat_active[cell]:
            order[count] = cell
            count += 1
        for dr, dc in directions:
            rr, cc = row + dr, col + dc
            if not (0 <= rr < h and 0 <= cc < w):
                continue
            neighbour = rr * w + cc
            if seen[neighbour]:
                continue
            seen[neighbour] = True
            receiver[neighbour] = cell
            surface[neighbour] = max(float(surface[neighbour]), water)
            heapq.heappush(queue, (float(surface[neighbour]), neighbour))
    if count != len(order):
        raise ValueError("Every active local cell must connect to a fixed boundary outlet.")
    rec = receiver.reshape(h, w)
    spill = surface.reshape(h, w)
    steepest = np.zeros_like(spill)
    indices = np.arange(size, dtype=np.int32).reshape(h, w)
    for dr, dc in directions:
        a, b = _slices(h, w, dr, dc)
        slope = (spill[a] - spill[b]) / math.hypot(dc * dx, dr * dy)
        choose = active[a] & (slope > steepest[a])
        rec[a][choose] = indices[b][choose]
        steepest[a][choose] = slope[choose]
    return spill.astype(np.float32), rec.copy(), order


def _hillslope_step(height, land, dx, dy, dt, settings, protection):
    """Bounded downhill fluxes whose donor loss equals recipient gain exactly.

    Four undirected D8 pairs are evaluated from a common stage snapshot. The
    0.08 per-pair bound keeps the explicit transport positive even when all eight
    neighbours are lower; metadata reports when this safety cap is active.
    Material crossing the coastline is excluded here (fluvial export handles
    ocean loss), so the prescribed shoreline and ocean bed remain unchanged.
    """
    loss = np.zeros_like(height)
    gain = np.zeros_like(height)
    capped = False
    critical = math.tan(math.radians(settings["talus_angle_degrees"]))
    for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
        a, b = _slices(*height.shape, dr, dc)
        distance = math.hypot(dc * dx, dr * dy)
        difference = height[a] - height[b]
        magnitude = np.abs(difference)
        creep_factor = dt * settings["hillslope_diffusivity_m2_yr"] / distance**2
        talus = settings["thermal_relaxation"] * np.maximum(magnitude - critical * distance, 0.)
        proposed = creep_factor * magnitude + talus
        flux = np.minimum(proposed, .08 * magnitude)
        flux *= land[a] & land[b]
        flux *= 1 - np.maximum(protection[a], protection[b])
        capped |= bool(np.any((proposed > .08 * magnitude + 1e-10) & (flux > 0)))
        toward_b = difference > 0
        loss[a] += np.where(toward_b, flux, 0.)
        gain[b] += np.where(toward_b, flux, 0.)
        loss[b] += np.where(toward_b, 0., flux)
        gain[a] += np.where(toward_b, 0., flux)
    return height - loss + gain, loss, gain, capped


def evolve_landscape(elevation_m, land, dx_m, dy_m, config,
                     *, precipitation_mm=None, protection=None):
    """Return aged height, cumulative numerical fields and model metadata.

    Input/output rasters are [north-first row, eastward column], metres. Ocean
    cells are immutable and land stays positive. ``boundary_mode='fixed_open'``
    also accepts entirely positive local tiles: outer rows/columns remain exact
    and route out at their actual terrain elevation. Config may be the complete
    world dict with nested ``erosion`` settings, or the erosion settings itself.
    ``protection`` is an optional 0..1 raster (1 prevents any local modification).
    Final river routing must still be computed on the returned landscape.
    """
    original = np.asarray(elevation_m, dtype=np.float32)
    terrestrial = np.asarray(land, dtype=bool).copy()
    if original.ndim != 2 or terrestrial.shape != original.shape:
        raise ValueError("Erosion needs matching two-dimensional elevation/land rasters.")
    if not np.isfinite(original).all() or min(dx_m, dy_m) <= 0:
        raise ValueError("Erosion requires finite heights and positive physical spacing.")
    if np.any(original[terrestrial] <= 0):
        raise ValueError("Terrestrial input heights must be positive.")
    supplied = config.get("erosion", config)
    settings = dict(DEFAULTS)
    settings.update({key: supplied[key] for key in DEFAULTS if key in supplied})
    mode = settings["boundary_mode"]
    if mode not in ("ocean", "fixed_open"):
        raise ValueError("Erosion boundary_mode must be 'ocean' or 'fixed_open'.")
    if mode == "ocean":
        if not terrestrial.any() or terrestrial.all():
            raise ValueError("Landscape erosion needs land surrounded by ocean.")
        if terrestrial[0].any() or terrestrial[-1].any() or terrestrial[:, 0].any() or terrestrial[:, -1].any():
            raise ValueError("Landscape erosion needs an ocean domain boundary.")
    else:
        terrestrial[0] = terrestrial[-1] = False
        terrestrial[:, 0] = terrestrial[:, -1] = False
        if not terrestrial.any():
            raise ValueError("A local tile needs positive active interior terrain.")
    iterations = int(settings["iterations"])
    reroute_every = int(settings["reroute_every"])
    if iterations < 1 or reroute_every < 1 or settings["model_years"] <= 0 or not np.isfinite(settings["model_years"]):
        raise ValueError("Erosion iterations, routing period and model years must be positive.")
    if not 0 < settings["talus_angle_degrees"] < 89:
        raise ValueError("Talus angle must lie between 0 and 89 degrees.")
    for key in ("stream_power_k", "max_incision_per_stage_m", "hillslope_diffusivity_m2_yr",
                "thermal_relaxation", "max_deposition_per_stage_m"):
        if settings[key] < 0 or not np.isfinite(settings[key]):
            raise ValueError(f"Invalid nonnegative erosion parameter: {key}")
    if precipitation_mm is None:
        rain = np.full(original.shape, 1400., dtype=np.float32)
    else:
        rain = np.asarray(precipitation_mm, dtype=np.float32)
        if rain.shape != original.shape or not np.isfinite(rain).all() or np.any(rain < 0):
            raise ValueError("Precipitation must be a matching finite nonnegative raster.")
    protected = np.zeros(original.shape) if protection is None else np.asarray(protection, dtype=float)
    if protected.shape != original.shape or not np.isfinite(protected).all() or np.any((protected < 0) | (protected > 1)):
        raise ValueError("Protection must be a matching fraction in [0,1].")

    dx, dy = float(dx_m), float(dy_m)
    cell_area = dx * dy
    dt = float(settings["model_years"]) / iterations
    height = original.astype(np.float64)
    erosion = np.zeros_like(height)
    deposition = np.zeros_like(height)
    fluvial = np.zeros_like(height)
    hillslope = np.zeros_like(height)
    total_exported = 0.
    capped_hillslope = False
    routing_passes = 0
    stage_records = []
    flat_land = terrestrial.ravel()
    freedom = (1 - protected).ravel()
    ids = np.arange(height.size)
    rows, cols = np.divmod(ids, height.shape[1])
    rainfall_factor = np.sqrt(np.clip(rain.ravel().astype(float) / 1400., 0., 3.))

    for stage in range(iterations):
        if stage % reroute_every == 0:
            router = _route if mode == "ocean" else _route_open
            spill, receiver, order = router(height, terrestrial, dx, dy)
            area, _ = _accumulate(receiver, order, rain, terrestrial, cell_area)
            rec = receiver.ravel()
            rr, cc = np.divmod(np.maximum(rec, 0), height.shape[1])
            distance = np.maximum(np.hypot((cols - cc) * dx, (rows - rr) * dy), min(dx, dy))
            # A in square metres, m=.5,n=1: K has inverse-model-year units.
            factor = (dt * float(settings["stream_power_k"])
                      * np.sqrt(area.ravel().astype(float) * 1e6) / distance
                      * rainfall_factor * freedom)
            # Reusing Python integer indices avoids millions of temporary
            # NumPy scalar objects in the inherently sequential DAG solves.
            ordered_cells = order.tolist()
            routing_passes += 1
        before = height.copy()
        h = height.ravel()
        removed = np.zeros(height.size, dtype=np.float64)
        # Priority-Flood order is downstream first. Using the already-updated
        # recipient is the implicit channel solve rather than explicit noise.
        for i in ordered_cells:
            j = int(rec[i])
            recipient = float(h[j]) if mode == "fixed_open" or flat_land[j] else 0.
            current = float(h[i])
            coefficient = float(factor[i])
            if current <= recipient or coefficient == 0:
                continue
            target = (current + coefficient * recipient) / (1 + coefficient)
            cut = min(current - target, settings["max_incision_per_stage_m"] * float(freedom[i]), current - .25)
            removed[i] = max(cut, 0.)
            h[i] = current - float(removed[i])
        removed = removed.reshape(height.shape)
        erosion += removed
        fluvial += removed

        # Transport the actual removed material over the drainage DAG. Low
        # slope/capacity reaches deposit bounded alluvium; the rest reaches sea.
        sediment = removed.ravel() * cell_area
        deposited = np.zeros(height.size, dtype=np.float64)
        slope = np.maximum(h - h[np.maximum(rec, 0)], 0.) / distance
        spill_flat = spill.ravel()
        previous_height = before.ravel()
        for i in reversed(ordered_cells):
            j = int(rec[i])
            fraction = (0.03 + .32 * math.exp(-float(slope[i]) / .008)) if h[i] < 1700 else .015
            if float(spill_flat[i]) - float(previous_height[i]) > 2:
                fraction = .65
            load = float(sediment[i])
            amount = min(load * fraction,
                         settings["max_deposition_per_stage_m"] * cell_area * float(freedom[i]))
            deposited[i] = amount / cell_area
            remainder = load - amount
            if j >= 0 and flat_land[j]:
                sediment[j] += remainder
            else:
                total_exported += remainder
        deposited = deposited.reshape(height.shape)
        height += deposited
        deposition += deposited

        height, loss, gain, capped = _hillslope_step(height, terrestrial, dx, dy, dt, settings, protected)
        erosion += loss
        deposition += gain
        hillslope += loss
        capped_hillslope |= capped
        height[~terrestrial] = original[~terrestrial]
        stage_records.append({"stage": stage + 1,
                              "mean_fluvial_incision_m": float(removed[terrestrial].mean()),
                              "maximum_stage_incision_m": float(removed.max()),
                              "mean_hillslope_outflow_m": float(loss[terrestrial].mean())})

    result = height.astype(np.float32)
    if not np.isfinite(result).all() or np.any(result[terrestrial] <= 0):
        raise RuntimeError("Landscape evolution produced invalid terrestrial elevations.")
    if not np.array_equal(result[~terrestrial], original[~terrestrial]):
        raise RuntimeError("Landscape evolution modified ocean elevations.")
    eroded_volume = float(erosion.sum() * cell_area)
    deposited_volume = float(deposition.sum() * cell_area)
    net_loss = float((original.astype(float) - result.astype(float)).sum() * cell_area)
    fields = {
        "geomorphic_erosion_m": erosion.astype(np.float32),
        "geomorphic_deposition_m": deposition.astype(np.float32),
        "geomorphic_fluvial_incision_m": fluvial.astype(np.float32),
        "geomorphic_hillslope_transport_m": hillslope.astype(np.float32),
        "geomorphic_net_change_m": (result - original).astype(np.float32),
    }
    metadata = {
        "method": "periodically rerouted implicit n=1 stream-power incision, conservative D8 sediment transport and pairwise hillslope creep/talus relaxation",
        "reference": "Braun & Willett (2013), doi:10.1016/j.geomorph.2012.10.008",
        "settings": settings,
        "routing_passes": routing_passes,
        "mean_cumulative_fluvial_incision_m": float(fluvial[terrestrial].mean()),
        "maximum_cumulative_fluvial_incision_m": float(fluvial.max()),
        "hillslope_numerical_flux_cap_used": capped_hillslope,
        "material_budget_m3": {"eroded": eroded_volume, "deposited": deposited_volume,
                               "fluvial_export_to_ocean": float(total_exported) if mode == "ocean" else 0.,
                               "fluvial_export_to_tile_boundary": float(total_exported) if mode == "fixed_open" else 0.,
                               "exported_out_of_active_domain": float(total_exported),
                               "transport_residual": float(eroded_volume - deposited_volume - total_exported),
                               "float32_height_residual": float(net_loss - total_exported)},
        "stages": stage_records,
        "limitations": ["Model exposure is uncalibrated; it does not measure the real age of fictional geology.",
                        "Regional D8 approximation; erosion between routing passes follows the preceding drainage tree.",
                        "Explicit hillslope fluxes are stability bounded; unresolvable slopes need a finer local terrain mesh."]
    }
    return result, fields, metadata
