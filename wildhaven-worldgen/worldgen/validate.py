"""Validate exported geography using only its public files, never the generator.

Run ``python -m worldgen.validate outputs --reproduce`` for all ten acceptance
groups. Reproduction regenerates numerical data in a temporary directory; the
original export is read-only apart from the explicit validation report.
"""
from __future__ import annotations

import argparse
from collections import deque
import hashlib
import heapq
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import time

import numpy as np
from PIL import Image


class ValidationFailure(AssertionError):
    pass


def require(condition, message):
    if not bool(condition):
        raise ValidationFailure(message)


def _json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _safe_path(base, relative):
    require(isinstance(relative, str), "Export path must be a string")
    path = (base / relative).resolve()
    require(path.is_relative_to(base.resolve()), f"Path escapes output directory: {relative}")
    require(path.is_file(), f"Missing exported file: {relative}")
    return path


def _field_data(path, entry):
    loaded = np.load(path, allow_pickle=False)
    if isinstance(loaded, np.lib.npyio.NpzFile):
        try:
            return loaded[entry.get("key", "data")].copy()
        finally:
            loaded.close()
    return loaded


def _longest_boundary_run(lines):
    """Longest contiguous true sequence in any row, excluding raster framing."""
    longest = 0
    for line in np.asarray(lines, dtype=bool):
        changes = np.flatnonzero(np.diff(np.r_[False, line, False]))
        if len(changes):
            longest = max(longest, int(np.max(changes[1::2] - changes[::2])))
    return longest


def _shoreline_metrics(land, dx, dy, coarse_factor=8):
    """Pixel-edge coastline measurements at two physical observation scales.

    A smooth outline retains almost the same perimeter after coarsening. Bays,
    peninsulas and smaller inlets contribute additional resolved fine perimeter.
    This is a scale-complexity metric, not a claim to measure a fractal dimension.
    The raster frame is deliberately ignored: ocean must surround the world.
    """
    mask = np.asarray(land, dtype=bool)
    require(mask.ndim == 2 and min(mask.shape) >= 2, "Invalid coastline mask")
    horizontal = mask[1:] != mask[:-1]
    vertical = mask[:, 1:] != mask[:, :-1]
    perimeter = float(horizontal.sum() * dx + vertical.sum() * dy)
    factor = min(int(coarse_factor), min(mask.shape))
    h = (mask.shape[0] // factor) * factor
    w = (mask.shape[1] // factor) * factor
    coarse = mask[:h, :w].reshape(h//factor, factor, w//factor, factor).mean(axis=(1, 3)) >= .5
    coarse_perimeter = float((coarse[1:] != coarse[:-1]).sum() * dx * factor
                             + (coarse[:, 1:] != coarse[:, :-1]).sum() * dy * factor)
    return {"fine_perimeter_km": perimeter / 1000,
            "coarse_perimeter_km": coarse_perimeter / 1000,
            "observation_scale_m": [float(dx), float(dy)],
            "coarse_factor": factor,
            "fine_to_coarse_perimeter_ratio": perimeter / max(coarse_perimeter, 1),
            "longest_horizontal_straight_km": _longest_boundary_run(horizontal) * dx / 1000,
            "longest_vertical_straight_km": _longest_boundary_run(vertical.T) * dy / 1000}


def _land_component_sizes(land):
    """Independent scanline D8 component sizes, descending, without SciPy."""
    mask = np.asarray(land, dtype=bool)
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    sizes = []
    for start in np.flatnonzero(mask.ravel()):
        row, col = divmod(int(start), w)
        if seen[row, col]:
            continue
        pending = deque([(row, col)])
        connected = 0
        while pending:
            row, col = pending.popleft()
            if seen[row, col]:
                continue
            left, right = col, col
            while left > 0 and mask[row, left - 1] and not seen[row, left - 1]:
                left -= 1
            while right + 1 < w and mask[row, right + 1] and not seen[row, right + 1]:
                right += 1
            seen[row, left:right + 1] = True
            connected += right - left + 1
            for adjacent in (row - 1, row + 1):
                if adjacent < 0 or adjacent >= h:
                    continue
                low, high = max(0, left - 1), min(w, right + 2)
                candidates = mask[adjacent, low:high] & ~seen[adjacent, low:high]
                beginnings = candidates & ~np.r_[False, candidates[:-1]]
                pending.extend((adjacent, int(c + low)) for c in np.flatnonzero(beginnings))
        sizes.append(connected)
    return sorted(sizes, reverse=True)


def _read_viewer_data(base, relative):
    """Read both v1 inline inspectors and v2 lossless binary field manifests."""
    document = _json(_safe_path(base, relative))
    nx, ny = int(document["nx"]), int(document["ny"])
    require(nx > 1 and ny > 1, "Inspector mesh is empty")
    count = nx * ny
    arrays = {}
    if "fields" in document:
        dtypes = {"float32": np.dtype("<f4"), "float64": np.dtype("<f8"),
                  "uint8": np.dtype("u1"), "int32": np.dtype("<i4"),
                  "uint32": np.dtype("<u4"), "uint16": np.dtype("<u2")}
        for name, info in document["fields"].items():
            require(info["dtype"] in dtypes, f"Unsupported inspector dtype: {name}")
            path = _safe_path(base, info["path"])
            dtype = dtypes[info["dtype"]]
            expected_count = count * (3 if name == "biome_rgb" else 1)
            require(int(info["count"]) == expected_count, f"Inspector element count mismatch: {name}")
            require(path.stat().st_size == int(info["byte_length"]) == expected_count * dtype.itemsize,
                    f"Inspector binary length mismatch: {name}")
            data = np.fromfile(path, dtype=dtype)
            require(np.isfinite(data).all(), f"Invalid inspector field values: {name}")
            arrays[name] = data
    else:
        for name in ("elevation_m", "biome_rgb", "temperature_c", "precipitation_mm",
                     "soil_moisture", "flow_accumulation_km2", "land_mask", "land",
                     "lake_id", "water_surface_m"):
            if name in document:
                data = np.asarray(document[name])
                require(data.size == count * (3 if name == "biome_rgb" else 1),
                        f"Inspector array length mismatch: {name}")
                require(np.isfinite(data).all(), f"Invalid inspector values: {name}")
                arrays[name] = data
    require("elevation_m" in arrays and "biome_rgb" in arrays, "Inspector lacks terrain data")
    require("land_mask" in arrays or "land" in arrays, "Inspector lacks its land/ocean mask")
    return document, arrays


class Export:
    """Minimal independent reader of world.json and NumPy export fields."""
    def __init__(self, output):
        self.base = Path(output).resolve()
        self.world = _json(self.base / "world.json")
        self.config = self.world["config"]
        self.fields = {}
        for name, entry in self.world["fields"].items():
            self.fields[name] = _field_data(_safe_path(self.base, entry["path"]), entry)
        self.shape = tuple(self.world["raster"]["shape"])
        self.h, self.w = self.shape
        self.dx = float(self.config["width_m"]) / self.w
        self.dy = float(self.config["height_m"]) / self.h
        self.land = self.fields["land_mask"].astype(bool)
        self.biomes = self.fields.get("biomes", self.fields.get("biome_id"))
        require(self.biomes is not None, "Missing biome classification field")
        self.regions = _json(self.base / "regions.json")
        self.network = _json(self.base / "rivers.json")
        self.specials = _json(self.base / "special-locations.json")

    def sample(self, name, x, y):
        col = np.clip(np.asarray(x) / self.dx, 0, self.w - 1).astype(int)
        row = np.clip((float(self.config["height_m"]) - np.asarray(y)) / self.dy,
                      0, self.h - 1).astype(int)
        return self.fields[name][row, col]


def check_biomes(e):
    b = e.biomes
    require(np.issubdtype(b.dtype, np.integer), "Biome IDs must have an integer dtype")
    require(np.isin(b, np.arange(16)).all(), "Unknown biome ID outside 0..15")
    counts = {i: int(np.count_nonzero(b == i)) for i in range(1, 16)}
    require(all(n >= 10 for n in counts.values()), f"Missing or undersized biomes (<10 cells): {counts}")
    require((b[~e.land] == 0).all(), "A terrestrial biome was assigned to ocean")
    f = e.fields
    # Broad environmental contracts intentionally leave transition tolerances;
    # this is an independent validity test, not a copy of classification code.
    contracts = {
        1: (f["temperature_c"] > 4) & (f["precipitation_mm"] >= 900),
        2: (f["temperature_c"] > 16) & (f["precipitation_mm"] >= 1350),
        3: (f["temperature_c"] <= 6),
        4: (f["temperature_c"] <= -7),
        5: (f["temperature_c"] > 18) & (f["precipitation_mm"] < 1500),
        7: (f["precipitation_mm"] < 700),
        8: (f["soil_moisture"] > .70),
        9: (f["elevation_m"] > 2300) & (f["temperature_c"] < 8),
        10: (f["elevation_m"] < 110) & (f["distance_to_coast_m"] < 30000),
        11: (f["luminous_anomaly"] > .50) & (f["soil_moisture"] > .55),
        12: (f["mineralization"] > .50),
        13: (f["fungal_substrate"] > .45) & (f["soil_moisture"] > .70),
        14: (f["ash_concentration"] > .28),
        15: (f["ethereal_anomaly"] > .50) & (f["temperature_c"] < 13),
    }
    for biome, supported in contracts.items():
        require(supported[b == biome].all(), f"Biome {biome} has environmentally unsupported cells")
    desert_fraction = counts[7] / max(1, int(np.count_nonzero(b)))
    if int(e.config.get("revision", 1)) >= 2:
        maximum = min(.16, float(e.config.get("quality_targets", {}).get("max_desert_fraction", .16)))
        require(desert_fraction <= maximum,
                f"Rocky desert remains excessive: {desert_fraction:.1%} of nonwater land, limit {maximum:.1%}")
    return {"sample_counts": counts, "desert_fraction_nonwater_land": desert_fraction}


def check_volcano(e):
    v = e.specials["volcano"]
    cx, cy = v["center_m"][:2]
    xx, yy = np.meshgrid((np.arange(e.w) + .5) * e.dx,
                         float(e.config["height_m"]) - (np.arange(e.h) + .5) * e.dy)
    x, y = xx - cx, yy - cy
    radius = np.hypot(x, y)
    ring = (radius >= 30000) & (radius <= 70000) & e.land
    require(ring.sum() >= 20, "Volcanic ash ring is unresolved at this raster resolution")
    coverage = float((e.biomes[ring] == 14).mean())
    require(coverage >= .60, f"Ash biome covers only {coverage:.1%} of the volcanic ring")
    sectors = np.floor((np.arctan2(y, x) + np.pi) / (2 * np.pi) * 8).astype(int) % 8
    sector_counts = [int(((e.biomes == 14) & ring & (sectors == i)).sum()) for i in range(8)]
    require(min(sector_counts) > 0, f"Ash does not surround volcano in all directions: {sector_counts}")
    h = e.fields["elevation_m"]
    crater = h[radius < 7000]
    rim = h[(radius > 10000) & (radius < 22000)]
    far = h[(radius > 130000) & (radius < 190000) & e.land]
    require(crater.size and rim.size and far.size, "Unresolved volcano geometry")
    crater_relief = float(np.percentile(rim, 80) - np.median(crater))
    relief = float(rim.max() - np.median(far))
    require(crater_relief > 250, f"No geometric crater depression: relief={crater_relief:.1f} m")
    require(relief > 1500, f"Volcanic mountain has insufficient actual relief: {relief:.1f} m")
    return {"ash_ring_fraction": coverage, "ash_sector_cells": sector_counts,
            "crater_relief_m": crater_relief, "mountain_relief_m": relief}


def _inside_polygon(x, y, polygon, tolerance=.01):
    # Convex clipped hexagons permit a signed cross-product inclusion test.
    p = np.asarray(polygon, dtype=float)
    edge = np.roll(p, -1, axis=0) - p
    cross = edge[:, 0] * (y - p[:, 1]) - edge[:, 1] * (x - p[:, 0])
    return bool(np.all(cross >= -tolerance) or np.all(cross <= tolerance))


def check_tropical_ravine(e):
    ravine = e.specials["ravine"]
    cx, cy = ravine["center_m"][:2]
    idx = int(e.sample("region_index", cx, cy))
    region = e.regions["regions"][idx]
    require(region["index"] == idx, "Region index does not resolve ravine region")
    x0, y0, x1, y1 = ravine["incision_bounds_m"]
    require(all(_inside_polygon(x, y, region["polygon_m"]) for x in (x0, x1) for y in (y0, y1)),
            "Ravine incision footprint crosses its tropical hex boundary")
    mixes = {int(b["id"]): int(b["sample_count"]) for b in region["biomes"]}
    dry_samples = sum(n for i, n in mixes.items() if i > 0)
    fraction = mixes.get(2, 0) / max(dry_samples, 1)
    require(fraction > .5, f"Ravine hex is not predominantly tropical jungle: {fraction:.1%}")
    rim_x = np.asarray([cx - 15000] * 3 + [cx + 15000] * 3)
    rim_y = np.asarray([cy - 20000, cy, cy + 20000] * 2)
    rim_b = np.asarray(e.sample("biomes", rim_x, rim_y))
    require((rim_b == 2).mean() >= .5, f"Ravine rims lack tropical vegetation: {rim_b.tolist()}")
    return {"region_id": region["id"], "tropical_fraction_nonwater": fraction,
            "rim_biome_ids": rim_b.tolist()}


def _polygon_area(polygon):
    p = np.asarray(polygon, dtype=np.float64)
    return abs(float(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - p[:, 1] * np.roll(p[:, 0], -1)))) * .5


def check_hex_continuity(e):
    regions = e.regions["regions"]
    ids = {r["id"]: r for r in regions}
    require(len(ids) == len(regions), "Duplicate region IDs")
    require([r["index"] for r in regions] == list(range(len(regions))), "Noncontiguous region indices")
    total_area = sum(_polygon_area(r["polygon_m"]) for r in regions)
    expected_area = float(e.config["width_m"]) * float(e.config["height_m"])
    require(abs(total_area - expected_area) < expected_area * 1e-9, "Hex polygons do not cover the full rectangle")
    for r in regions:
        q, rr, s = (r["axial"][k] for k in ("q", "r", "s"))
        require(q + rr + s == 0, f"Invalid cube coordinates in {r['id']}")
        p = np.asarray(r["polygon_m"])
        require(((p[:, 0] >= -.01) & (p[:, 0] <= float(e.config["width_m"]) + .01)
                 & (p[:, 1] >= -.01) & (p[:, 1] <= float(e.config["height_m"]) + .01)).all(),
                f"Region outside world extent: {r['id']}")
        for neighbor_id in r["neighbors"]:
            require(neighbor_id in ids, f"Unknown neighbor: {neighbor_id}")
            neighbor = ids[neighbor_id]
            require(r["id"] in neighbor["neighbors"], f"Asymmetric adjacency: {r['id']} -> {neighbor_id}")
            # Neighbors share the same global geometry; no independent terrain tile exists.
            npoly = np.asarray(neighbor["polygon_m"])
            shared = sum(bool((np.linalg.norm(npoly - vertex, axis=1) < .01).any()) for vertex in p)
            require(shared >= 2, f"Neighbor hexes lack a shared geometric edge: {r['id']}, {neighbor_id}")
        for reference in (r["terrain"]["field"], r["terrain"]["ownership_field"]):
            _safe_path(e.base, reference)

    ownership = e.fields["region_index"]
    require(np.issubdtype(ownership.dtype, np.integer), "Region ownership must be integers")
    require(((ownership >= 0) & (ownership < len(regions))).all(), "Unowned raster cell")
    counts = np.bincount(ownership.ravel(), minlength=len(regions))
    require(np.array_equal(counts, [r["sample_count"] for r in regions]), "Region sample counts mismatch ownership")
    xx, yy = np.meshgrid((np.arange(e.w) + .5) * e.dx,
                         float(e.config["height_m"]) - (np.arange(e.h) + .5) * e.dy)
    radius = float(e.config["hex_radius_m"])
    qf = (np.sqrt(3) / 3 * xx - yy / 3) / radius
    rf = (2 / 3 * yy) / radius
    sf = -qf - rf
    q, r, s = np.rint(qf), np.rint(rf), np.rint(sf)
    dq, dr, ds = abs(q - qf), abs(r - rf), abs(s - sf)
    fixq, fixr = (dq > dr) & (dq > ds), (dr > ds)
    fixr &= ~fixq
    q = np.where(fixq, -r - s, q).astype(np.int32)
    r = np.where(fixr, -q - s, r).astype(np.int32)
    region_q = np.asarray([v["axial"]["q"] for v in regions], dtype=np.int32)
    region_r = np.asarray([v["axial"]["r"] for v in regions], dtype=np.int32)
    require((region_q[ownership] == q).all() and (region_r[ownership] == r).all(),
            "Raster ownership disagrees with independent axial cube rounding")
    h = e.fields["elevation_m"].ravel()
    totals = np.bincount(ownership.ravel(), weights=h, minlength=len(regions))
    for i, region in enumerate(regions):
        if counts[i]:
            require(abs(totals[i] / counts[i] - region["elevation_m"]["mean"]) < .01,
                    f"Region terrain statistics do not refer to global height field: {region['id']}")
    village = e.specials["starting_village"]
    vx, vy = village["center_m"][:2]
    village_region = regions[int(e.sample("region_index", vx, vy))]
    require(village_region["id"] == village["region_id"], "Starting-village region reference mismatch")
    require(int(e.sample("biomes", vx, vy)) == 1, "Starting village is not in a temperate forest")
    require(float(e.sample("slope", vx, vy)) < .03, "Starting-village site is too steep")
    water = (e.fields["lake_id"] > 0) | (e.fields["flow_accumulation_km2"] > float(e.config["river_threshold_km2"]))
    wr, wc = np.where(water)
    require(len(wr) > 0, "No fresh water for starting-village reservation")
    distance = float(np.min(np.hypot((wc + .5) * e.dx - vx,
                                    (e.h - wr - .5) * e.dy - vy)))
    require(distance <= 25000, f"Starting-village site lacks nearby fresh water: {distance:.1f} m")
    return {"region_count": len(regions), "covered_area_km2": total_area / 1e6,
            "owned_raster_cells": int(counts.sum()), "starting_village_region": village_region["id"],
            "starting_village_freshwater_distance_m": distance}


def check_rivers(e):
    f = e.fields
    rec = f["flow_receiver"].ravel()
    require(np.issubdtype(rec.dtype, np.integer), "Flow receivers must be integers")
    land = np.flatnonzero(e.land.ravel())
    require(((rec[land] >= 0) & (rec[land] < e.h * e.w)).all(), "Invalid land flow receiver")
    require((rec[~e.land.ravel()] == -1).all(), "Ocean cells must terminate drainage")
    r, c = np.divmod(land, e.w)
    rr, cc = np.divmod(rec[land], e.w)
    require(((np.abs(r - rr) <= 1) & (np.abs(c - cc) <= 1) & (land != rec[land])).all(),
            "Nonlocal or self-referential D8 receiver")
    rank = f["flow_rank"].ravel()
    require((rank[rec[land]] < rank[land]).all(), "Drainage graph has a cycle or uphill rank")
    surface = f["water_surface_m"].ravel()
    require((surface[rec[land]] <= surface[land] + .001).all(), "Water flows uphill")
    discharge = f["discharge_m3s"]
    runoff = float((f["precipitation_mm"][e.land].astype(np.float64) * .001 * e.dx * e.dy
                    * float(e.network["runoff_fraction"]) / (365.25 * 86400)).sum())
    ocean_discharge = float(discharge[~e.land].astype(np.float64).sum())
    require(runoff > 0 and abs(ocean_discharge - runoff) <= max(.01, runoff * 2e-6),
            f"Mean runoff mass balance failed: {runoff} generated, {ocean_discharge} exported")
    rivers = e.network["rivers"]
    require(len(rivers) > 0, "No river network")
    by_id = {r["id"]: r for r in rivers}
    nodes = {n["id"]: n for n in e.network["nodes"]}
    require(len(by_id) == len(rivers), "Duplicate river IDs")
    for river in rivers:
        chain = np.asarray(river["cell_indices"], dtype=np.int64)
        require(chain.size >= 2, f"Empty river polyline: {river['id']}")
        require(((chain >= 0) & (chain < e.h * e.w)).all(), f"Invalid river cell: {river['id']}")
        require(np.array_equal(rec[chain[:-1]], chain[1:]), f"Disconnected river cells: {river['id']}")
        points = np.asarray(river["points_m"], dtype=float)
        require(points.shape == (chain.size, 3), f"Invalid river coordinate shape: {river['id']}")
        rows, cols = np.divmod(chain, e.w)
        expected = np.column_stack(((cols + .5) * e.dx,
                                    (e.h - rows - .5) * e.dy, surface[chain]))
        require(np.allclose(points, expected, rtol=0, atol=.01), f"River coordinates disagree with terrain: {river['id']}")
        require((np.diff(points[:, 2]) <= .001).all(), f"River surface rises: {river['id']}")
        require(nodes[river["from_node"]]["cell_index"] == chain[0]
                and nodes[river["to_node"]]["cell_index"] == chain[-1], f"River-node mismatch: {river['id']}")
        downstream = river["downstream_id"]
        if downstream is not None:
            require(downstream in by_id and by_id[downstream]["cell_indices"][0] == chain[-1],
                    f"Disconnected downstream edge: {river['id']}")
        else:
            require(not e.land.ravel()[chain[-1]], f"River terminates inland without downstream connection: {river['id']}")
    lakes = e.network["lakes"]
    require(len(lakes) > 0, "No natural lakes")
    lake_ids = f["lake_id"].ravel()
    require(set(int(i) for i in np.unique(lake_ids) if i > 0) == {v["id"] for v in lakes},
            "Lake matrix and metadata disagree")
    for lake in lakes:
        cells = np.asarray(lake["cell_indices"], dtype=np.int64)
        require(cells.size == lake["cell_count"] and (lake_ids[cells] == lake["id"]).all(), "Lake ownership mismatch")
        require((surface[cells] >= f["elevation_m"].ravel()[cells]).all(), "Lake surface lies below bed")
        require(np.allclose(surface[cells], lake["water_level_m"], rtol=0, atol=.05), "Nonlevel lake surface")
    budget = e.network["sediment_budget_m3"]
    require(abs(budget["eroded"] - budget["deposited"] - budget["exported_to_ocean"])
            < max(1., budget["eroded"] * 1e-6), "Erosion/sedimentation volume is not conserved")
    return {"river_edges": len(rivers), "river_nodes": len(nodes), "lakes": len(lakes),
            "annual_mean_runoff_m3s": runoff, "ocean_discharge_m3s": ocean_discharge}


def _read_gltf(base, relative):
    path = _safe_path(base, relative)
    doc = _json(path)
    require(doc["asset"]["version"] == "2.0", "Ravine mesh must use glTF 2.0")
    buffers = []
    for entry in doc["buffers"]:
        binary = _safe_path(base, str((path.parent / entry["uri"]).relative_to(base))).read_bytes()
        require(len(binary) == entry["byteLength"], "glTF buffer length mismatch")
        buffers.append(binary)
    dtype_map = {5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
    sizes = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
    arrays = []
    for accessor in doc["accessors"]:
        view = doc["bufferViews"][accessor["bufferView"]]
        dtype = np.dtype(dtype_map[accessor["componentType"]])
        components = sizes[accessor["type"]]
        count = int(accessor["count"])
        offset = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
        require(offset % dtype.itemsize == 0, "Misaligned glTF accessor")
        stride = int(view.get("byteStride", dtype.itemsize * components))
        size = (count - 1) * stride + components * dtype.itemsize if count else 0
        require(offset + size <= len(buffers[view["buffer"]]), "glTF accessor exceeds buffer")
        require(size + int(accessor.get("byteOffset", 0)) <= view["byteLength"], "glTF accessor exceeds its buffer view")
        data = np.ndarray((count, components), dtype=dtype, buffer=buffers[view["buffer"]],
                          offset=offset, strides=(stride, dtype.itemsize)).copy()
        require(np.isfinite(data).all(), "Nonfinite glTF accessor value")
        arrays.append(data)
    meshes = []
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            require(primitive.get("mode", 4) == 4, "Expected triangle glTF mesh")
            vertices = arrays[primitive["attributes"]["POSITION"]]
            triangles = arrays[primitive["indices"]].reshape(-1, 3).astype(np.int64)
            require(vertices.shape[1] == 3 and vertices.size > 0, "Missing 3D mesh positions")
            require(triangles.size and triangles.min() >= 0 and triangles.max() < len(vertices), "Invalid glTF triangle index")
            cross = np.cross(vertices[triangles[:, 1]] - vertices[triangles[:, 0]],
                             vertices[triangles[:, 2]] - vertices[triangles[:, 0]])
            require((np.linalg.norm(cross, axis=1) > .001).all(), "Degenerate glTF triangle")
            meshes.append((mesh["name"], vertices, triangles))
    return meshes


def _boundary_edges(vertices, triangles):
    edges = np.concatenate((triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]))
    edges.sort(axis=1)
    unique, counts = np.unique(edges, axis=0, return_counts=True)
    require((counts <= 2).all(), "Mesh contains a nonmanifold edge")
    # Position tuples allow independent meshes to share an exact aperture seam.
    result = set()
    for a, b in unique[counts == 1]:
        first, second = tuple(vertices[a]), tuple(vertices[b])
        result.add(tuple(sorted((first, second))))
    return result


def _local_spill_surface(elevation):
    """Independent boundary-seeded D8 Priority-Flood for inset depressions.

    Every inset edge is an open boundary at its actual bed height. This detects
    local closed bowls hidden by a coarser continental drainage raster. No
    generator routing helper, sea mask or claimed lake metadata is consulted.
    """
    height = np.asarray(elevation, dtype=np.float64)
    require(height.ndim == 2 and min(height.shape) >= 3 and np.isfinite(height).all(),
            "Local depression test needs a finite two-dimensional height field")
    h, w = height.shape
    spill = height.copy()
    seen = np.zeros(height.shape, dtype=bool)
    seen[0] = seen[-1] = True
    seen[:, 0] = seen[:, -1] = True
    queue = [(float(spill.ravel()[i]), int(i)) for i in np.flatnonzero(seen.ravel())]
    heapq.heapify(queue)
    directions = ((-1, -1), (-1, 0), (-1, 1), (0, -1),
                  (0, 1), (1, -1), (1, 0), (1, 1))
    while queue:
        water, cell = heapq.heappop(queue)
        row, col = divmod(cell, w)
        for dr, dc in directions:
            rr, cc = row + dr, col + dc
            if not (0 <= rr < h and 0 <= cc < w) or seen[rr, cc]:
                continue
            seen[rr, cc] = True
            spill[rr, cc] = max(float(height[rr, cc]), water)
            heapq.heappush(queue, (float(spill[rr, cc]), rr * w + cc))
    return spill


def check_ravine_geometry(e):
    ravine = e.specials["ravine"]
    local = np.load(_safe_path(e.base, ravine["heightmap"]), allow_pickle=False)
    incision = np.load(_safe_path(e.base, ravine["incision_field"]), allow_pickle=False)
    require(local.shape == tuple(ravine["local_resolution"]) == incision.shape,
            "Ravine local raster dimension mismatch")
    require(np.isfinite(local).all() and np.isfinite(incision).all(), "Invalid ravine heights")
    depth = float(incision.max())
    require(depth > 900 and abs(depth - ravine["maximum_incision_m"]) < .05, "Ravine lacks the required actual depth")
    require(np.ptp(local[local.shape[0] // 2]) > 900, "Ravine DEM does not contain deep walls")
    # A 1,300 m geometric cut filled by a 1,200 m deep lake is not an explorable
    # humid ravine. Sample the independently exported continental spill depth
    # over the deepest local fissure, allowing only relatively shallow pools.
    x0, y0, x1, y1 = ravine["bounds_m"]
    xx, yy = np.meshgrid(x0 + (np.arange(local.shape[1]) + .5) * (x1 - x0) / local.shape[1],
                         y1 - (np.arange(local.shape[0]) + .5) * (y1 - y0) / local.shape[0])
    core = incision > 1100
    inundation = np.asarray(e.sample("lake_depth_m", xx[core], yy[core]), dtype=float)
    require(inundation.size > 0, "Missing deep ravine floor samples")
    floor_lake_depth = float(np.percentile(inundation, 95))
    require(floor_lake_depth < 150,
            f"Ravine floor is drowned by continental lake routing: 95th-percentile water depth {floor_lake_depth:.1f} m")
    local_spill = _local_spill_surface(local)
    local_water_depth = np.maximum(local_spill - local, 0)
    local_floor_depth = float(np.percentile(local_water_depth[core], 95))
    require(local_floor_depth < 150,
            f"High-resolution ravine contains a closed flooded bowl: 95th-percentile floor water depth {local_floor_depth:.1f} m")
    require(len(ravine["terraces"]) >= 3, "Missing intermediate exploration terraces")
    require(len(ravine["roots"]) >= 4, "Missing giant roots")
    require(len(ravine["caves"]) >= 2, "Missing cave openings")
    stream = np.asarray(ravine["stream"]["positions_m"], dtype=float)
    require(stream.ndim == 2 and stream.shape[1] == 3 and len(stream) > 20 and np.isfinite(stream).all(), "Invalid ravine floor watercourse")
    local_hydro = ravine["local_hydrology"]
    local_receiver = _field_data(_safe_path(e.base, local_hydro["flow_receiver"]),
                                 {"key": local_hydro["array_key"]})
    require(local_receiver.shape == local.shape and np.issubdtype(local_receiver.dtype, np.integer),
            "Invalid local ravine flow-receiver matrix")
    lrec = local_receiver.ravel()
    routed = np.flatnonzero(lrec >= 0)
    require((lrec[routed] < local.size).all(), "Local flow receiver outside ravine DEM")
    require((local.ravel()[lrec[routed]] < local.ravel()[routed]).all(), "Local streams route uphill or through a cycle")
    streams = {s["id"]: s for s in ravine["streams"]}
    require(len(streams) >= 2, "Missing local ravine tributaries")
    for sid, course in streams.items():
        cells = np.asarray(course["cell_indices"], dtype=np.int64)
        points = np.asarray(course["positions_m"], dtype=float)
        require(points.shape == (len(cells), 3) and len(cells) >= 10 and np.isfinite(points).all(),
                f"Invalid local watercourse: {sid}")
        require(np.array_equal(lrec[cells[:-1]], cells[1:]), f"Disconnected local watercourse: {sid}")
        require((np.diff(points[:, 2]) <= .001).all(), f"Local watercourse runs uphill: {sid}")
        downstream = course["downstream_stream_id"]
        if downstream:
            require(downstream in streams and int(cells[-1]) in streams[downstream]["cell_indices"],
                    f"Disconnected local tributary: {sid}")
        else:
            require(int(cells[-1]) == course["terminal_cell_index"] and lrec[cells[-1]] == -1,
                    f"Local stream has no physical terminal sink: {sid}")
    for pool in ravine["pools"]:
        require(0 < pool["maximum_depth_m"] <= 2.01, "Ravine pool is not shallow")
        shoreline = np.asarray(pool["shoreline_m"], dtype=float)
        require(len(shoreline) >= 16 and np.isfinite(shoreline).all()
                and np.allclose(shoreline[:, 2], pool["surface_elevation_m"], rtol=0, atol=.001),
                "Invalid level shoreline of ravine pool")
    meshes = _read_gltf(e.base, ravine["gltf"])
    terrain = next((v for v in meshes if "continuous ravine terrain" in v[0]), None)
    require(terrain is not None, "Missing actual terrain mesh")
    terrain_edges = _boundary_edges(terrain[1], terrain[2])
    full_triangle_count = (local.shape[0] - 1) * (local.shape[1] - 1) * 2
    require(len(terrain[2]) < full_triangle_count, "Cave apertures were not cut into terrain topology")
    caves = [v for v in meshes if v[0].startswith("ravine-cave-")]
    require(len(caves) == len(ravine["caves"]), "Cave metadata/mesh count mismatch")
    for name, vertices, faces in caves:
        mouth_edges = _boundary_edges(vertices, faces)
        require(len(mouth_edges) >= 6, f"Sealed or missing cave mouth: {name}")
        require(mouth_edges <= terrain_edges, f"Cave mouth is not connected to an actual cliff aperture: {name}")
    for cave in ravine["caves"]:
        require(cave["length_m"] > 1000 and cave["aperture_height_m"] > 50
                and cave["aperture_width_m"] > 50, "Cave lacks explorable dimensions")
        cave_mesh = next(v for v in caves if v[0] == cave["id"])
        points = cave_mesh[1][int(cave["tunnel_ring_vertex_count"]):].astype(float)
        # Evaluate the exact piecewise triangular terrain surface independently,
        # using local grid orientation and glTF's X east / Y up / Z south frame.
        lx = points[:, 0] + ravine["center_m"][0]
        ly = ravine["center_m"][1] - points[:, 2]
        dx = (x1 - x0) / local.shape[1]
        dy = (y1 - y0) / local.shape[0]
        col = (lx - (x0 + dx * .5)) / dx
        row = ((y1 - dy * .5) - ly) / dy
        cc = np.clip(np.floor(col).astype(int), 0, local.shape[1] - 2)
        rr = np.clip(np.floor(row).astype(int), 0, local.shape[0] - 2)
        u, v = np.clip(col - cc, 0, 1), np.clip(row - rr, 0, 1)
        a, b, c, d = local[rr, cc], local[rr, cc+1], local[rr+1, cc], local[rr+1, cc+1]
        ground = np.where(u + v <= 1, a + u*(b-a) + v*(c-a),
                          d + (1-u)*(c-d) + (1-v)*(b-d))
        cover = ground - points[:, 1]
        require(cover.min() >= 19.95, f"Cave protrudes through real rock roof: {cave['id']}, cover {cover.min():.3f} m")
    return {"maximum_incision_m": depth, "local_raster_shape": list(local.shape),
            "floor_water_depth_95th_percentile_m": floor_lake_depth,
            "independent_local_floor_water_depth_95th_percentile_m": local_floor_depth,
            "minimum_local_elevation_m": float(local.min()),
            "local_downhill_streams": len(streams), "shallow_floor_pools": len(ravine["pools"]),
            "mesh_count": len(meshes), "caves_with_connected_openings": len(caves),
            "total_triangles": sum(len(v[2]) for v in meshes)}


def check_reproducibility(e):
    project = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="wildhaven-repro-") as temporary:
        temp = Path(temporary)
        config = temp / "config.json"
        config.write_text(json.dumps(e.config, ensure_ascii=False, indent=2), encoding="utf-8")
        out = temp / "outputs"
        run = subprocess.run([sys.executable, str(project / "generate.py"), "--config", str(config),
                              "--out", str(out), "--no-renders"], cwd=project,
                             capture_output=True, text=True, encoding="utf-8", errors="replace")
        require(run.returncode == 0, f"Reproduction generation failed:\n{run.stdout[-4000:]}\n{run.stderr[-4000:]}")
        second = Export(out)
        require(set(e.fields) == set(second.fields), "Reproduced field set differs")
        for name, first in e.fields.items():
            require(first.dtype == second.fields[name].dtype
                    and np.array_equal(first, second.fields[name]), f"Seed reproduction mismatch: field {name}")
        compared_files = []
        geographic_files = {"regions.json", "rivers.json", "special-locations.json", "biomes-data.npy",
                            "heightmap.png", "viewer-data.json"}
        geographic_files.update(str(path.relative_to(e.base)).replace("\\", "/")
                                for path in (e.base / "meshes").rglob("*")
                                if path.is_file() and path.suffix in {".npy", ".npz", ".gltf", ".bin", ".csv", ".json"})
        geographic_files.update(str(path.relative_to(e.base)).replace("\\", "/")
                                for path in (e.base / "viewer").rglob("*")
                                if path.is_file() and path.suffix in {".bin", ".json"})
        for relative in sorted(geographic_files):
            require(_safe_path(e.base, relative).read_bytes() == _safe_path(second.base, relative).read_bytes(),
                    f"Seed reproduction mismatch: {relative}")
            compared_files.append(relative)
        return {"seed": e.config["seed"], "identical_numerical_fields": len(e.fields),
                "byte_identical_geographic_files": compared_files}


def check_mountain_detail(e):
    """Verify actual detailed terrain, erosion differences and glTF polygons."""
    metadata = _json(_safe_path(e.base, "meshes/mountains/metadata.json"))
    initial = np.load(_safe_path(e.base, metadata["initial_heightmap"]), allow_pickle=False)
    height = np.load(_safe_path(e.base, metadata["heightmap"]), allow_pickle=False)
    erosion = _field_data(_safe_path(e.base, metadata["erosion_field"]), {"key": "data"})
    deposition = _field_data(_safe_path(e.base, metadata["deposition_field"]), {"key": "data"})
    shape = tuple(metadata["local_resolution"])
    require(initial.shape == height.shape == erosion.shape == deposition.shape == shape,
            "Detailed mountain field dimensions disagree")
    require(min(shape) >= 512, "Mountain detail does not contain the promised 512x512 samples")
    require(all(np.isfinite(a).all() for a in (initial, height, erosion, deposition)),
            "Invalid detailed mountain numerical field")
    require((erosion >= 0).all() and (deposition >= 0).all(), "Negative detailed sediment change")
    evolution_error = float(np.max(np.abs(initial.astype(float) - erosion + deposition - height)))
    require(evolution_error < .02,
            f"Detailed mountain terrain does not match actual erosion/deposition: {evolution_error:.4f}m")
    require(float(np.percentile(erosion, 95)) > 10 and float(erosion.max()) > 50,
            "Detailed mountains lack meaningful erosive height changes")
    relief = float(np.percentile(height, 99) - np.percentile(height, 1))
    require(relief > 1000, f"Detailed mountain relief is insufficient: {relief:.0f}m")
    x0, y0, x1, y1 = metadata["bounds_m"]
    rows, cols = shape
    dx, dy = (x1-x0)/cols, (y1-y0)/rows
    require(dx > 0 and dy > 0 and max(dx, dy) <= 500,
            "Mountain detail lacks sub-kilometre geometric sampling")
    origin = metadata["mesh_origin_m"]
    meshes = _read_gltf(e.base, metadata["gltf"])
    covered = np.zeros(shape, dtype=bool)
    triangle_count = 0
    for name, vertices, triangles in meshes:
        x = vertices[:, 0].astype(float) + float(origin[0])
        y = float(origin[1]) - vertices[:, 2].astype(float)
        colf, rowf = (x-x0)/dx-.5, (y1-y)/dy-.5
        cc, rr = np.rint(colf).astype(int), np.rint(rowf).astype(int)
        require(((cc >= 0) & (cc < cols) & (rr >= 0) & (rr < rows)).all(),
                f"Mountain glTF has vertices outside its georeferenced height field: {name}")
        require(np.max(np.abs(colf-cc)) < .001 and np.max(np.abs(rowf-rr)) < .001,
                "Mountain glTF vertices do not coincide with local field sample centres")
        require(np.allclose(vertices[:, 1], height[rr, cc], rtol=0, atol=.01),
                "Mountain glTF heights disagree with exported detailed terrain")
        covered[rr, cc] = True
        triangle_count += len(triangles)
    require(covered.all(), "Mountain mesh omits detailed height samples")
    require(triangle_count == 2*(rows-1)*(cols-1),
            f"Mountain glTF polygon count has holes or overlapping quads: {triangle_count}")
    viewer, fields = _read_viewer_data(e.base, "meshes/mountains/mountain-viewer.json")
    require((int(viewer["ny"]), int(viewer["nx"])) == shape,
            "Mountain inspector silently downsamples detailed geometry")
    require(np.allclose(fields["elevation_m"].reshape(shape), height, rtol=0, atol=.002),
            "Mountain inspector heights differ from the detailed exported terrain")
    require(np.allclose(viewer["origin_m"], [x0, y0], rtol=0, atol=.01)
            and abs(float(viewer["width_m"])-(x1-x0)) < .01
            and abs(float(viewer["height_m"])-(y1-y0)) < .01,
            "Mountain inspector georeference disagrees with its mesh extent")
    return {"local_shape": list(shape), "sample_spacing_m": [dx, dy],
            "glTF_triangles": triangle_count, "glTF_mesh_chunks": len(meshes),
            "terrain_relief_1st_to_99th_percentile_m": relief,
            "erosion_95th_percentile_m": float(np.percentile(erosion, 95)),
            "maximum_erosion_m": float(erosion.max()),
            "erosion_height_balance_maximum_error_m": evolution_error}


def check_exports(e):
    require(e.world["format_version"], "Missing format version")
    require(e.world["raster"]["row_order"] == "north_to_south", "Undocumented raster row order")
    manifest = _json(_safe_path(e.base, "manifest.json"))
    require(manifest["algorithm"] == "sha256", "Unsupported export manifest hash algorithm")
    for relative, expected_hash in manifest["files"].items():
        require(hashlib.sha256(_safe_path(e.base, relative).read_bytes()).hexdigest() == expected_hash,
                f"Export manifest checksum mismatch: {relative}")
    for name, entry in e.world["fields"].items():
        path = _safe_path(e.base, entry["path"])
        require(hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"], f"Field checksum mismatch: {name}")
        array = e.fields[name]
        require(array.shape == e.shape, f"Wrong field dimensions: {name}: {array.shape}")
        require(np.dtype(entry["dtype"]) == array.dtype, f"Wrong field dtype: {name}")
        require(bool(entry.get("units")), f"Missing field units: {name}")
        require(hashlib.sha256(np.ascontiguousarray(array).tobytes()).hexdigest() == entry["array_sha256"],
                f"Numerical array checksum mismatch: {name}")
    raw = np.load(_safe_path(e.base, "biomes-data.npy"), allow_pickle=False)
    require(np.array_equal(raw, e.biomes), "Lossless biome IDs disagree with field data")
    height_path = _safe_path(e.base, "heightmap.png")
    header = height_path.read_bytes()[:33]
    require(header[:8] == b"\x89PNG\r\n\x1a\n" and header[24] == 16 and header[25] == 0,
            "heightmap.png must be actual 16-bit grayscale PNG")
    with Image.open(height_path) as image:
        encoded = np.asarray(image).astype(np.float64)
        require(image.size == (e.w, e.h), "Heightmap dimensions mismatch")
    encoding = e.config["height_encoding"]
    decoded = encoded * float(encoding["scale_m"]) + float(encoding["offset_m"])
    error = float(np.max(np.abs(decoded - e.fields["elevation_m"])))
    require(error <= float(encoding["scale_m"]) * .501 + .001, f"Heightmap scale/quantization error: {error}m")
    for relative in ("temperature.png", "precipitation.png", "biomes.png"):
        with Image.open(_safe_path(e.base, relative)) as image:
            require(image.size == (e.w, e.h), f"Visualization dimensions mismatch: {relative}")
    with Image.open(_safe_path(e.base, "world-preview.png")) as image:
        require(max(image.size) >= 1600, "Continental preview is not high resolution")
    require(_safe_path(e.base, "README.md").stat().st_size > 100, "Missing export documentation")
    details = {"checked_fields": len(e.fields), "raster_shape": list(e.shape),
            "manifest_files": len(manifest["files"]), "height_png_bits": 16,
            "maximum_height_quantization_error_m": error}
    if int(e.config.get("revision", 1)) >= 2:
        viewer, arrays = _read_viewer_data(e.base, "viewer-data.json")
        nx, ny = int(viewer["nx"]), int(viewer["ny"])
        actual_triangles = 2*(nx-1)*(ny-1)
        require(ny >= 640 and actual_triangles >= 600000,
                f"Continental inspection mesh remains too sparse: {nx}x{ny}, {actual_triangles} triangles")
        details["continental_inspector"] = {"grid": [ny, nx], "terrain_triangles": actual_triangles,
                                               "actual_binary_fields": len(arrays),
                                               "triangle_increase_vs_v1": actual_triangles/162690}
        details["mountain_detail"] = check_mountain_detail(e)
    return details


def check_finite_terrain(e):
    for name, field in e.fields.items():
        require(np.isfinite(field).all(), f"Invalid NaN or infinity in {name}")
    for name in ("soil_moisture", "fertility", "biomass", "vegetation_cover"):
        require(((e.fields[name] >= 0) & (e.fields[name] <= 1)).all(), f"Unbounded normalized field: {name}")
    for name in ("precipitation_mm", "erosion_m", "sediment_m", "slope", "discharge_m3s", "flow_accumulation_km2"):
        require((e.fields[name] >= 0).all(), f"Negative physical quantity: {name}")
    h = e.fields["elevation_m"]
    require(h[e.land].min() > 0 and h[~e.land].max() <= 0, "Elevation disagrees with land/ocean mask")
    # One dominant continental mass is required. Revision2 optionally permits
    # small nearshore islands, while the original format retains its exact
    # single-component contract. No library used by the generator labels these.
    require(not (e.land[0].any() or e.land[-1].any()
                 or e.land[:, 0].any() or e.land[:, -1].any()),
            "Continental coast touches the rectangular raster frame")
    components = _land_component_sizes(e.land)
    require(bool(components), "No continent")
    principal_fraction = components[0] / int(e.land.sum())
    targets = e.config.get("quality_targets", {})
    if e.config.get("coastal_islands", False):
        minimum = float(targets.get("min_mainland_fraction", .985))
        require(0 < minimum <= 1, "Invalid principal-continent fraction target")
        require(principal_fraction >= minimum,
                f"No single dominant continent: principal landmass {principal_fraction:.2%}")
    else:
        require(len(components) == 1,
                f"World has disconnected land: {int(e.land.sum()) - components[0]} cells outside principal continent")
    shore = _shoreline_metrics(e.land, e.dx, e.dy)
    if int(e.config.get("revision", 1)) >= 2:
        max_run = min(120000., float(targets.get("max_shore_straight_run_m", 120000))) / 1000
        min_complexity = max(1.08, float(targets.get("min_shore_complexity_ratio", 1.08)))
        require(max(shore["longest_horizontal_straight_km"], shore["longest_vertical_straight_km"]) <= max_run,
                f"Artificial straight coastline remains: horizontal {shore['longest_horizontal_straight_km']:.0f}km, vertical {shore['longest_vertical_straight_km']:.0f}km; limit {max_run:.0f}km")
        require(shore["fine_to_coarse_perimeter_ratio"] >= min_complexity,
                f"Coast lacks resolved multiscale inlets: perimeter ratio {shore['fine_to_coarse_perimeter_ratio']:.3f}, minimum {min_complexity:.3f}")
        erosion = e.fields.get("geomorphic_erosion_m")
        deposition = e.fields.get("geomorphic_deposition_m")
        require(erosion is not None and deposition is not None,
                "Missing numerical long-term geomorphic erosion/deposition fields")
        require((erosion >= 0).all() and (deposition >= 0).all(), "Negative geomorphic sediment change")
        require(float(np.percentile(erosion[e.land], 95)) > 10,
                "Landscape evolution did not carve meaningful terrain")
    return {"finite_fields": len(e.fields), "minimum_elevation_m": float(h.min()),
            "maximum_elevation_m": float(h.max()), "single_continent_land_cells": components[0],
            "land_component_count": len(components), "principal_land_fraction": principal_fraction,
            "largest_component_areas_km2": [v * e.dx * e.dy / 1e6 for v in components[:20]],
            "shoreline": shore}


def check_independent_loader(e):
    script = Path(__file__).resolve().parents[1] / "inspect_world.py"
    require(script.is_file(), "Missing standalone inspect_world.py integration reader")
    with tempfile.TemporaryDirectory(prefix="wildhaven-loader-") as temporary:
        # -I excludes project paths and cwd from import resolution. A loader
        # that secretly imports the generator cannot pass this check.
        run = subprocess.run([sys.executable, "-I", str(script), str(e.base)], cwd=temporary,
                             capture_output=True, text=True, encoding="utf-8", errors="replace")
    require(run.returncode == 0, f"Independent loading failed:\n{run.stdout[-2000:]}\n{run.stderr[-2000:]}")
    require(bool(run.stdout.strip()), "Independent loader produced no inspection result")
    return {"isolated_python_process": True, "loader": "inspect_world.py",
            "stdout": run.stdout.strip()[-2000:]}


CHECKS = [
    ("01_all_15_environmental_biomes", check_biomes),
    ("02_volcano_geometry_and_surrounding_ash", check_volcano),
    ("03_ravine_in_tropical_hex", check_tropical_ravine),
    ("04_hex_coverage_and_geographic_continuity", check_hex_continuity),
    ("05_connected_downhill_rivers_and_lakes", check_rivers),
    ("06_deep_ravine_and_connected_cave_meshes", check_ravine_geometry),
    ("07_same_seed_reproduces_world", check_reproducibility),
    ("08_export_hashes_formats_and_dimensions", check_exports),
    ("09_finite_valid_numerical_terrain", check_finite_terrain),
    ("10_independent_loading_without_generator", check_independent_loader),
]


def validate(output, reproduce=False):
    export = Export(output)
    results = []
    for name, function in CHECKS:
        if function is check_reproducibility and not reproduce:
            results.append({"check": name, "status": "skipped", "reason": "Run with --reproduce to execute a full second generation."})
            print(f"SKIP {name}", flush=True)
            continue
        started = time.perf_counter()
        try:
            details = function(export)
            result = {"check": name, "status": "passed", "details": details}
        except Exception as error:
            result = {"check": name, "status": "failed", "error": f"{type(error).__name__}: {error}"}
        result["elapsed_seconds"] = round(time.perf_counter() - started, 3)
        results.append(result)
        print(f"{result['status'].upper()} {name}" + (f": {result['error']}" if "error" in result else ""), flush=True)
    summary = {key: sum(v["status"] == key for v in results) for key in ("passed", "failed", "skipped")}
    return {"format_version": "1.0.0", "seed": export.config["seed"],
            "all_ten_executed_and_passed": summary["passed"] == 10,
            "summary": summary, "checks": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", default="outputs")
    parser.add_argument("--reproduce", action="store_true", help="Generate the world again and compare all numeric fields and geographic files")
    parser.add_argument("--report", help="Report path (default: OUTPUT/validation-report.json)")
    args = parser.parse_args()
    try:
        report = validate(args.output, reproduce=args.reproduce)
    except Exception as error:
        print(f"FAILED loading export: {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    report_path = Path(args.report) if args.report else Path(args.output) / "validation-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"]), flush=True)
    return 1 if report["summary"]["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
