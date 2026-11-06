"""Deterministic, hex-independent drainage and modest landscape adjustment.

Priority-Flood follows Barnes, Lehman & Mulla (2014), with a stable flat-index
tie break. The flooded surface routes water; it never replaces lake beds.
Natural D8 steepest descent is preferred wherever a positive gradient exists.
Equal-height depressions retain the acyclic Priority-Flood parent tree.

The model represents annual mean runoff, not a time-dependent hydraulic solve.
Erosion is a bounded stream-power approximation and sediment transport conserves
the excavated volume (deposited sediment + export to the ocean).
"""

from collections import deque
import heapq
import math

import numpy as np


_D8 = ((-1, -1), (-1, 0), (-1, 1), (0, -1),
       (0, 1), (1, -1), (1, 0), (1, 1))
_YEAR_SECONDS = 365.25 * 86400.0


def _slices(h, w, dr, dc):
    """Slices of cells and their corresponding, nonwrapping D8 neighbors."""
    return ((slice(max(0, -dr), min(h, h - dr)),
             slice(max(0, -dc), min(w, w - dc))),
            (slice(max(0, dr), min(h, h + dr)),
             slice(max(0, dc), min(w, w + dc))))


def _route(elevation, land, dx, dy):
    """Return spill surface, receiver and ascending topological visit order."""
    h, w = elevation.shape
    size = h * w
    flat_land = land.ravel()
    surface = np.maximum(elevation.astype(np.float64), 0.0).ravel()
    surface[flat_land] = elevation.ravel()[flat_land]
    visited = ~flat_land.copy()
    parent = np.full(size, -1, dtype=np.int32)
    coast = np.zeros((h, w), dtype=bool)
    for dr, dc in _D8:
        a, b = _slices(h, w, dr, dc)
        coast[a] |= (~land[a]) & land[b]
    heap = [(0.0, int(i)) for i in np.flatnonzero(coast)]
    heapq.heapify(heap)
    order = np.empty(int(flat_land.sum()), dtype=np.int32)
    n = 0
    while heap:
        spill, i = heapq.heappop(heap)
        row, col = divmod(i, w)
        if flat_land[i]:
            order[n] = i
            n += 1
        for dr, dc in _D8:
            rr, cc = row + dr, col + dc
            if rr < 0 or rr >= h or cc < 0 or cc >= w:
                continue
            j = rr * w + cc
            if visited[j]:
                continue
            visited[j] = True
            parent[j] = i
            surface[j] = max(surface[j], spill)
            heapq.heappush(heap, (float(surface[j]), j))
    if n != len(order):
        raise ValueError("Every land cell must connect to an ocean cell in D8.")

    # The parent gives a valid route through flat lakes. On all sloped terrain
    # replace it by the steepest physical descent, avoiding flood-tree artifacts.
    receiver = parent.reshape(h, w)
    s = surface.reshape(h, w)
    steepest = np.zeros((h, w), dtype=np.float64)
    ids = np.arange(size, dtype=np.int32).reshape(h, w)
    for dr, dc in _D8:
        a, b = _slices(h, w, dr, dc)
        gradient = (s[a] - s[b]) / math.hypot(dc * dx, dr * dy)
        choose = land[a] & (gradient > steepest[a])
        receiver[a][choose] = ids[b][choose]
        steepest[a][choose] = gradient[choose]
    return s.astype(np.float32), receiver.copy(), order


def _accumulate(receiver, order, rain, land, cell_area):
    area = land.astype(np.float64).ravel() * (cell_area / 1e6)
    # An explicit annual runoff fraction supplies units, rather than using
    # rainfall-weighted pixel count as a mislabeled physical discharge.
    runoff_fraction = 0.36
    discharge = (np.maximum(rain, 0).ravel().astype(np.float64) / 1000
                 * cell_area * runoff_fraction / _YEAR_SECONDS)
    discharge[~land.ravel()] = 0
    rec = receiver.ravel()
    for i in order[::-1]:
        j = rec[i]
        if j >= 0:
            area[j] += area[i]
            discharge[j] += discharge[i]
    return (area.reshape(land.shape).astype(np.float32),
            discharge.reshape(land.shape).astype(np.float32))


def _lake_components(depth, surface, receiver, accumulation, dx, dy):
    """Label resolvable lake interiors; shallow wetlands stay unclassified."""
    h, w = depth.shape
    wet = depth > 2.0
    seen = np.zeros(h * w, dtype=bool)
    labels = np.zeros(h * w, dtype=np.int32)
    wetf = wet.ravel()
    sf = surface.ravel()
    rec = receiver.ravel()
    df = depth.ravel()
    af = accumulation.ravel()
    lakes = []
    for start in np.flatnonzero(wetf):
        if seen[start]:
            continue
        seen[start] = True
        q = deque([int(start)])
        cells = []
        level = float(sf[start])
        while q:
            i = q.popleft()
            cells.append(i)
            r, c = divmod(i, w)
            for dr, dc in _D8:
                rr, cc = r + dr, c + dc
                if rr < 0 or rr >= h or cc < 0 or cc >= w:
                    continue
                j = rr * w + cc
                if (not seen[j] and wetf[j]
                        and abs(float(sf[j]) - level) < 0.05):
                    seen[j] = True
                    q.append(j)
        # Reject single-pixel numerical puddles but retain genuinely deep tarns.
        if len(cells) < 3 or float(df[cells].max()) < 6.0:
            continue
        lake_id = len(lakes) + 1
        labels[cells] = lake_id
        cell_set = set(cells)
        outlets = [i for i in cells if int(rec[i]) not in cell_set]
        outlet = max(outlets, key=lambda i: (float(af[i]), -i)) if outlets else cells[0]
        rows, cols = np.divmod(np.asarray(cells), w)
        lakes.append({
            "id": lake_id,
            "name": f"Lago {lake_id:03d}",
            "cell_count": len(cells),
            "cell_indices": sorted(cells),
            "area_km2": round(len(cells) * dx * dy / 1e6, 6),
            "volume_m3": round(float(df[cells].astype(np.float64).sum() * dx * dy), 3),
            "water_level_m": level,
            "max_depth_m": float(df[cells].max()),
            "outlet_cell": int(outlet),
            "outlet_receiver_cell": int(rec[outlet]),
            "boundary_outlet_cells": sorted(outlets),
            "bounds_m": [float(cols.min() * dx), float((h - 1 - rows.max()) * dy),
                         float((cols.max() + 1) * dx), float((h - rows.min()) * dy)],
        })
    return labels.reshape(h, w), lakes


def _rivers(receiver, surface, accumulation, discharge, land, lake_ids,
            dx, dy, threshold):
    h, w = land.shape
    rec = receiver.ravel()
    active = land.ravel() & (accumulation.ravel() >= threshold)
    active_ids = np.flatnonzero(active)
    indegree = np.zeros(h * w, dtype=np.int32)
    if active_ids.size:
        np.add.at(indegree, rec[active_ids], 1)
    starts = active_ids[indegree[active_ids] != 1]
    z = surface.ravel()
    a = accumulation.ravel()
    q = discharge.ravel()
    lf = lake_ids.ravel()

    def point(i):
        r, c = divmod(int(i), w)
        return [round((c + 0.5) * dx, 3), round((h - r - 0.5) * dy, 3),
                round(float(z[i]), 4)]

    edges = []
    node_cells = set()
    for start in starts:
        chain = [int(start)]
        cur = int(start)
        while rec[cur] >= 0:
            nxt = int(rec[cur])
            chain.append(nxt)
            if not active[nxt] or indegree[nxt] != 1:
                break
            cur = nxt
        if len(chain) < 2:
            continue
        node_cells.update((chain[0], chain[-1]))
        rr, cc = np.divmod(np.asarray(chain), w)
        length = np.hypot(np.diff(cc) * dx, np.diff(rr) * dy).sum()
        edges.append({
            "id": f"R{len(edges) + 1:05d}",
            "from_node": f"N{chain[0]}",
            "to_node": f"N{chain[-1]}",
            "downstream_id": None,
            "cell_indices": chain,
            "points_m": [point(i) for i in chain],
            "length_m": round(float(length), 3),
            "source_discharge_m3s": round(float(q[chain[0]]), 6),
            "mouth_discharge_m3s": round(float(q[chain[-1]]), 6),
            "max_catchment_km2": round(float(a[chain[-1]]), 4),
            "lake_ids": sorted({int(lf[i]) for i in chain if lf[i] > 0}),
        })
    starts_to_id = {edge["cell_indices"][0]: edge["id"] for edge in edges}
    for edge in edges:
        edge["downstream_id"] = starts_to_id.get(edge["cell_indices"][-1])
    nodes = [{"id": f"N{i}", "cell_index": i, "position_m": point(i),
              "kind": "ocean_outlet" if not land.ravel()[i] else
                      ("source" if indegree[i] == 0 else "confluence")}
             for i in sorted(node_cells)]
    return edges, nodes


def breach_outlet(elevation, source_xy_m, land, dx_m, dy_m, *, source_cell=None,
                  min_drop_m=20.0, channel_width_m=15000.0,
                  max_excavation_m=1800.0):
    """Excavate a physical outlet from a deep fissure into lower natural drainage.

    This is a deterministic Dijkstra search over the *geographic* raster, never
    over hexagons. The target must already possess a Priority-Flood spill route
    to sea lower than the source bed by ``min_drop_m``. Reaching another closed
    depression with a high water surface is therefore not considered an outlet.

    Search cost is path length multiplied by squared excavation depth relative
    to the source floor, a bounded proxy for channel excavation work. The final
    centerline bed follows a strictly descending lower envelope; no terrain is
    raised. Tapered banks blend the channel into existing terrain. Source should
    be the lowest deep-floor cell in the fissure, not a shelf at its map center.

    Returns ``(modified_elevation, JSON_serializable_metadata)``. Callers can
    export ``elevation - modified_elevation`` as the exact breach incision field.
    The usual hydrology pass must run afterward on the modified terrain.
    """
    original = np.asarray(elevation, dtype=np.float32)
    land = np.asarray(land, dtype=bool)
    if original.ndim != 2 or original.shape != land.shape or not np.isfinite(original).all():
        raise ValueError("Breach needs matching finite elevation/land rasters.")
    if min(dx_m, dy_m, min_drop_m, channel_width_m, max_excavation_m) <= 0:
        raise ValueError("Breach dimensions and excavation limits must be positive.")
    h, w = original.shape
    dx, dy = float(dx_m), float(dy_m)
    if source_cell is None:
        if source_xy_m is None or len(source_xy_m) < 2:
            raise ValueError("Provide source_xy_m or source_cell.")
        col = int(float(source_xy_m[0]) / dx)
        row = int(h - float(source_xy_m[1]) / dy)
        if not (0 <= row < h and 0 <= col < w):
            raise ValueError("Breach source is outside the raster.")
        source = row * w + col
    elif np.ndim(source_cell) == 1:
        if len(source_cell) != 2:
            raise ValueError("A source-cell pair must contain [row, column].")
        row, col = map(int, source_cell)
        if not (0 <= row < h and 0 <= col < w):
            raise ValueError("Breach source is outside the raster.")
        source = row * w + col
    else:
        source = int(source_cell)
    if not (0 <= source < original.size) or not land.ravel()[source]:
        raise ValueError("Breach source must be a land cell.")
    bed = original.ravel()
    source_level = float(bed[source])
    if source_level <= min_drop_m:
        raise ValueError("Breach source must exceed the sea-level target by min_drop_m.")
    natural_surface, natural_receiver, _ = _route(original, land, dx, dy)
    spill = natural_surface.ravel()
    target_level = source_level - float(min_drop_m)
    target = spill <= target_level
    distance = np.full(original.size, np.inf, dtype=np.float64)
    distance[source] = 0.0
    predecessor = np.full(original.size, -1, dtype=np.int32)
    settled = np.zeros(original.size, dtype=bool)
    queue = [(0.0, source)]
    goal = None
    directions = [(dr, dc, math.hypot(dc * dx, dr * dy)) for dr, dc in _D8]
    visited_count = 0
    while queue:
        cost, i = heapq.heappop(queue)
        if settled[i]:
            continue
        settled[i] = True
        visited_count += 1
        if i != source and target[i]:
            goal = i
            break
        row, col = divmod(i, w)
        for dr, dc, step in directions:
            rr, cc = row + dr, col + dc
            if rr < 0 or rr >= h or cc < 0 or cc >= w:
                continue
            j = rr * w + cc
            if settled[j]:
                continue
            # A constant 1 penalizes gratuitous long detours. Squared cutting
            # work strongly prefers genuine valleys and low saddles to ridges.
            excavation = max(0.0, float(bed[j]) - source_level)
            if excavation > max_excavation_m:
                continue
            work = step * (1.0 + (excavation / 180.0) ** 2)
            candidate = cost + work
            if candidate < distance[j]:
                distance[j] = candidate
                predecessor[j] = i
                heapq.heappush(queue, (candidate, j))
    if goal is None:
        raise ValueError("No lower sea-connected drainage reachable within breach excavation limit.")
    path = [int(goal)]
    while path[-1] != source:
        path.append(int(predecessor[path[-1]]))
    path.reverse()
    path_array = np.asarray(path, dtype=np.int64)
    rows, cols = np.divmod(path_array, w)
    increments = np.hypot(np.diff(cols) * dx, np.diff(rows) * dy)
    cumulative = np.r_[0., np.cumsum(increments)]
    # Enter below the pre-existing receiving surface. If its bed is deeper,
    # follow that bed; a short naturally inundated mouth may remain a lake inlet.
    destination_bed = min(float(bed[goal]) - .5, float(spill[goal]) - 2.)
    ideal = np.linspace(source_level - .5, destination_bed, len(path))
    if cumulative[-1] > 0:
        ideal = (source_level - .5) + (destination_bed - source_level + .5) * cumulative / cumulative[-1]
    profile = np.minimum(bed[path_array].astype(float), ideal)
    for k in range(1, len(profile)):
        profile[k] = min(profile[k], profile[k - 1] - .25)
    # Do not create extra below-sea terrestrial cells during a coastal breach.
    profile[land.ravel()[path_array]] = np.maximum(profile[land.ravel()[path_array]], .05)
    incision = np.zeros_like(original, dtype=np.float32)
    radius = max(float(channel_width_m) / 2, .51 * min(dx, dy))
    offsets = []
    for dr in range(-math.ceil(radius / dy), math.ceil(radius / dy) + 1):
        for dc in range(-math.ceil(radius / dx), math.ceil(radius / dx) + 1):
            d = math.hypot(dr * dy, dc * dx)
            if d <= radius:
                # Zero incision at the external bank edge, smooth full cut at bed.
                t = max(0., 1 - d / radius)
                weight = t * t * (3 - 2 * t)
                offsets.append((dr, dc, weight))
    for i, target_bed in zip(path, profile):
        row, col = divmod(i, w)
        for dr, dc, weight in offsets:
            rr, cc = row + dr, col + dc
            if not (0 <= rr < h and 0 <= cc < w) or not land[rr, cc]:
                continue
            cut = max(0., float(original[rr, cc]) - target_bed) * weight
            incision[rr, cc] = max(incision[rr, cc], cut)
    incision = np.minimum(incision, np.maximum(original - .05, 0))
    modified = (original - incision).astype(np.float32)
    if float(incision.max()) > max_excavation_m + 5:
        raise ValueError("Final descending breach exceeds max_excavation_m; choose another ravine site.")

    def position(index, elevation_array):
        row, col = divmod(int(index), w)
        return [float((col + .5) * dx), float((h - row - .5) * dy),
                float(elevation_array.ravel()[index])]

    metadata = {
        "id": "ravine-outlet-channel",
        "method": "Dijkstra minimum excavation-work path to lower naturally sea-connected spill surface; descending physical breach",
        "source_cell": int(source), "outlet_cell": int(goal),
        "source_m": position(source, modified), "outlet_m": position(goal, modified),
        "cell_indices": path,
        "points_m": [position(i, modified) for i in path],
        "length_m": float(cumulative[-1]), "bank_to_bank_width_m": float(channel_width_m),
        "maximum_excavation_m": float(incision.max()),
        "excavated_volume_m3": float(incision.astype(np.float64).sum() * dx * dy),
        "receiving_natural_water_surface_m": float(spill[goal]),
        "source_pre_breach_elevation_m": source_level,
        "source_pre_breach_water_surface_m": float(spill[source]),
        "target_natural_receiver_cell": int(natural_receiver.ravel()[goal]),
        "searched_cells": visited_count,
        "notes": "Geographic outlet may cross hex boundaries; main ravine footprint remains inside its tropical hex. Recompute final hydrology after excavation.",
    }
    return modified, metadata


def run_hydrology(height_m, precipitation_mm, land, dx_m, dy_m,
                  river_threshold_km2=2000.0):
    """Route runoff, carve channels, transport sediment, and export a river DAG.

    Arrays are [row, column], row zero north. All planar coordinates are metres
    east/north from the southwest raster corner, sampled at pixel centers.
    ``flow_receiver`` stores row-major flat indices (-1 only in ocean cells).
    Lake and river heights use ``water_surface_m``; ``elevation_m`` remains bed.

    Returns ``(fields, network)``. Only numpy + Python's standard library are
    required. Equal inputs produce identical arrays and JSON-serializable data.
    """
    height = np.asarray(height_m, dtype=np.float32)
    rain = np.asarray(precipitation_mm, dtype=np.float32)
    land = np.asarray(land, dtype=bool)
    if height.ndim != 2 or height.shape != rain.shape or height.shape != land.shape:
        raise ValueError("Elevation, rainfall and land must be matching 2D arrays.")
    if not np.isfinite(height).all() or not np.isfinite(rain).all():
        raise ValueError("Hydrology requires finite elevation and precipitation.")
    if dx_m <= 0 or dy_m <= 0 or river_threshold_km2 <= 0:
        raise ValueError("Raster spacing and river threshold must be positive.")
    if not land.any() or land.all():
        raise ValueError("The domain must contain both ocean and land.")
    if (land[0].any() or land[-1].any() or land[:, 0].any() or land[:, -1].any()):
        raise ValueError("Surround the continent by ocean at the domain boundary.")

    dx, dy = float(dx_m), float(dy_m)
    cell_area = dx * dy
    initial_surface, initial_receiver, order = _route(height, land, dx, dy)
    initial_area, _ = _accumulate(initial_receiver, order, rain, land, cell_area)
    ids = np.arange(height.size, dtype=np.int32).reshape(height.shape)
    rec = initial_receiver.ravel()
    valid = land.ravel()
    rows, cols = np.divmod(ids.ravel(), height.shape[1])
    rr, cc = np.divmod(np.maximum(rec, 0), height.shape[1])
    distance = np.maximum(np.hypot((cols - cc) * dx, (rows - rr) * dy), min(dx, dy))
    slope = np.maximum(initial_surface.ravel() - initial_surface.ravel()[np.maximum(rec, 0)], 0) / distance
    stream_power = np.maximum(np.log1p(initial_area.ravel() / 20.0) - 1.0, 0)
    incision = stream_power * (2.5 + 90 * np.sqrt(slope))
    incision *= np.clip(rain.ravel() / 1200, 0.15, 2.0)
    incision = np.minimum(100.0, incision)
    incision[~valid] = 0
    incision = incision.reshape(height.shape)
    # Shallow lateral erosion widens valleys without inventing hex boundaries.
    core = incision.copy()
    for dr, dc in _D8:
        a, b = _slices(*height.shape, dr, dc)
        incision[a] = np.maximum(incision[a], core[b] * 0.20)
    incision[~land] = 0
    incision = np.minimum(incision, np.maximum(height - 0.25, 0)).astype(np.float32)

    # Transport actual excavated volume down the pre-erosion DAG. Deposit a
    # bounded fraction where transport capacity falls; export the remainder.
    sediment_volume = incision.ravel().astype(np.float64) * cell_area
    deposition = np.zeros(height.size, dtype=np.float64)
    lake_depth_initial = np.maximum(initial_surface - height, 0).ravel()
    exported_volume = 0.0
    for i in order[::-1]:
        fraction = 0.02 + 0.30 * math.exp(-float(slope[i]) * 180)
        if lake_depth_initial[i] > 2:
            fraction = 0.65
        elif height.ravel()[i] < 35:
            fraction = max(fraction, 0.50)
        deposited = min(sediment_volume[i] * fraction, cell_area * 15.0)
        deposition[i] = deposited / cell_area
        remainder = sediment_volume[i] - deposited
        j = int(rec[i])
        if j >= 0 and valid[j]:
            sediment_volume[j] += remainder
        else:
            exported_volume += remainder
    deposition = deposition.reshape(height.shape).astype(np.float32)
    elevation = (height - incision + deposition).astype(np.float32)

    # Rerouting is essential: the exported rivers follow the *final* terrain,
    # including new channels and deposits, rather than an obsolete first pass.
    surface, receiver, final_order = _route(elevation, land, dx, dy)
    area, discharge = _accumulate(receiver, final_order, rain, land, cell_area)
    depth = np.where(land, np.maximum(surface - elevation, 0), 0).astype(np.float32)
    lake_ids, lakes = _lake_components(depth, surface, receiver, area, dx, dy)
    rivers, nodes = _rivers(receiver, surface, area, discharge, land, lake_ids,
                            dx, dy, float(river_threshold_km2))
    rank = np.full(height.size, -1, dtype=np.int32)
    rank[final_order] = np.arange(len(final_order), dtype=np.int32)
    fields = {
        "elevation_m": elevation,
        "flow_receiver": receiver.astype(np.int32),
        "flow_accumulation_km2": area,
        "discharge_m3s": discharge,
        "lake_id": lake_ids,
        "lake_depth_m": depth,
        "water_surface_m": surface,
        "erosion_m": incision,
        "sediment_m": deposition,
        "flow_rank": rank.reshape(height.shape),
    }
    eroded_volume = float(incision.astype(np.float64).sum() * cell_area)
    deposited_volume = float(deposition.astype(np.float64).sum() * cell_area)
    network = {
        "format_version": "1.0.0",
        "coordinate_system": "local east/north/up metres; southwest origin; pixel centers",
        "routing": "D8 steepest descent on Priority-Flood spill surface; stable acyclic flat routing",
        "river_threshold_km2": float(river_threshold_km2),
        "runoff_fraction": 0.36,
        "nodes": nodes,
        "rivers": rivers,
        "lakes": lakes,
        "sediment_budget_m3": {
            "eroded": eroded_volume,
            "deposited": deposited_volume,
            "exported_to_ocean": float(exported_volume),
            "roundoff_residual": eroded_volume - deposited_volume - float(exported_volume),
        },
        "limitations": [
            "Annual mean runoff; no seasonal floods or time-dependent hydraulic backwater.",
            "Single bounded incision/deposition pass; no calibrated geological timescale.",
            "Lake IDs cover depth >2 m interiors with at least 3 cells and maximum depth >6 m; shallow flooded margins remain wetlands.",
        ],
    }
    return fields, network
