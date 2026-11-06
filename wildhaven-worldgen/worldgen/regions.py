"""Pointy-top axial hexagons over an already continuous world raster.

Hexes are a spatial index only: no elevation, climate or water field is modified.
Origin is southwest, x east, y north. Pixel rows run north to south.
"""
from __future__ import annotations

import math
import numpy as np


NEIGHBORS = ((1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1))


def region_at(x, y, radius):
    """Return integer axial (q,r), with cube rounding on ties (NumPy rint)."""
    x, y = np.asarray(x), np.asarray(y)
    qf = (np.sqrt(3) / 3 * x - y / 3) / radius
    rf = (2 / 3 * y) / radius
    sf = -qf - rf
    q, r, s = np.rint(qf), np.rint(rf), np.rint(sf)
    dq, dr, ds = np.abs(q-qf), np.abs(r-rf), np.abs(s-sf)
    fix_q = (dq > dr) & (dq > ds)
    fix_r = ~fix_q & (dr > ds)
    q = np.where(fix_q, -r-s, q).astype(np.int32)
    r = np.where(fix_r, -q-s, r).astype(np.int32)
    if q.ndim == 0:
        return int(q), int(r)
    return q, r


def hex_center(q, r, radius):
    return (float(radius * np.sqrt(3) * (q + r/2)), float(radius * 1.5 * r))


def hex_polygon(q, r, radius):
    cx, cy = hex_center(q, r, radius)
    return [[cx + radius * math.cos(math.radians(30 + 60*i)),
             cy + radius * math.sin(math.radians(30 + 60*i))] for i in range(6)]


def _clip_polygon(points, width, height):
    """Sutherland-Hodgman clipping against the rectangular world extent."""
    for axis, threshold, keep_greater in ((0, 0, True), (0, width, False),
                                          (1, 0, True), (1, height, False)):
        if not points:
            break
        result = []
        prev = points[-1]
        inside_prev = prev[axis] >= threshold if keep_greater else prev[axis] <= threshold
        for cur in points:
            inside = cur[axis] >= threshold if keep_greater else cur[axis] <= threshold
            if inside != inside_prev:
                t = (threshold - prev[axis]) / (cur[axis]-prev[axis])
                intersection = [prev[0]+t*(cur[0]-prev[0]), prev[1]+t*(cur[1]-prev[1])]
                intersection[axis] = float(threshold)
                result.append(intersection)
            if inside:
                result.append(list(cur))
            prev, inside_prev = cur, inside
        points = result
    return points


def _area(poly):
    return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly, poly[1:]+poly[:1]))) / 2


def _identifier(q, r):
    return f"H_{q}_{r}"


def build_regions(fields, config, network=None, specials=None):
    """Return region metadata and zero-based region_index matching the raster.

    Every hex with nonzero intersection with the full world rectangle is emitted,
    including ocean cells and tiny clipped boundary hexes without a pixel centre.
    Terrain statistics refer to pixel centres, so such tiny polygons have null
    statistics and sample_count=0 rather than fabricated terrain.
    """
    height = np.asarray(fields['elevation_m'])
    h, w = height.shape
    width, extent_h = float(config['width_m']), float(config['height_m'])
    radius = float(config['hex_radius_m'])
    if radius <= 0:
        raise ValueError('hex_radius_m must be positive')
    dx, dy = width/w, extent_h/h
    xx, yy = np.meshgrid((np.arange(w)+.5)*dx, extent_h-(np.arange(h)+.5)*dy)
    qq, rr = region_at(xx, yy, radius)
    records = []
    # Enumerating geometry (rather than only raster labels) preserves exact cover.
    for r in range(-2, math.ceil(extent_h/(1.5*radius))+2):
        for q in range(math.floor(-r/2)-2, math.ceil(width/(np.sqrt(3)*radius)-r/2)+2):
            poly = _clip_polygon(hex_polygon(q, r, radius), width, extent_h)
            if len(poly) >= 3 and _area(poly) > 1e-3:
                records.append((q,r,poly))
    records.sort(key=lambda t:(t[1],t[0]))
    indices = {(q,r): i for i,(q,r,_) in enumerate(records)}
    # A pair encoding avoids an expensive Python loop over millions of pixels.
    q_min = min(v[0] for v in records)
    r_min = min(v[1] for v in records)
    q_span = max(v[0] for v in records)-q_min+1
    keys = np.array([(r-r_min)*q_span+(q-q_min) for q,r,_ in records], dtype=np.int64)
    sort = np.argsort(keys)
    code = (rr.astype(np.int64)-r_min)*q_span+(qq-q_min)
    labels = sort[np.searchsorted(keys[sort], code)].astype(np.int32)
    flat_labels = labels.ravel()
    pixel_count = np.bincount(flat_labels, minlength=len(records))
    biome = np.asarray(fields.get('biomes', fields.get('biome_id')))
    land = np.asarray(fields.get('land_mask', height > 0), dtype=bool)
    network = network or {}
    river_ids = [set() for _ in records]
    for i, river in enumerate(network.get('rivers', [])):
        cells = river.get('cell_indices', [])
        if len(cells):
            cells = np.asarray(cells)
            if cells.ndim == 2:
                cells = cells[:,0]*w+cells[:,1]
            for n in np.unique(flat_labels[cells.astype(np.int64)]):
                river_ids[int(n)].add(river.get('id', f'river_{i}'))
    lake = np.asarray(fields.get('lake_id', np.zeros_like(labels)))
    special_ids = [set() for _ in records]
    if isinstance(specials, dict):
        special_items = list(specials.items())
    elif isinstance(specials, list):
        special_items = [(v.get('id', str(i)), v) for i,v in enumerate(specials)]
    else:
        special_items = []
    for name, special in special_items:
        if not isinstance(special, dict):
            continue
        center = special.get('center_m', special.get('position_m', special.get('center_xy_m')))
        if isinstance(center, dict):
            center = [center.get('x', center.get('x_m')), center.get('y', center.get('y_m'))]
        if center is not None:
            pair = region_at(float(center[0]), float(center[1]), radius)
            if pair in indices:
                special_ids[indices[pair]].add(name)
    # Sort sample positions once so extraction is O(N log N), not O(N*hexes).
    order = np.argsort(flat_labels, kind='stable')
    boundaries = np.r_[0, np.cumsum(pixel_count)]
    def stats(array, cells):
        vals = np.asarray(array).ravel()[cells]
        if not len(vals):
            return {'min':None, 'max':None, 'mean':None}
        return {'min': float(vals.min()), 'max':float(vals.max()), 'mean':float(vals.mean())}
    regions = []
    for n,(q,r,poly) in enumerate(records):
        cells = order[boundaries[n]:boundaries[n+1]]
        row, col = np.divmod(cells,w)
        ns = [_identifier(q+dq,r+dr) for dq,dr in NEIGHBORS if (q+dq,r+dr) in indices]
        b_ids, counts = np.unique(biome.ravel()[cells], return_counts=True)
        b_mix = [{'id':int(b), 'sample_count':int(c), 'fraction':float(c/max(len(cells),1))}
                 for b,c in zip(b_ids,counts)]
        region = {
            'id':_identifier(q,r), 'index':n, 'axial':{'q':q,'r':r,'s':-q-r},
            'center_m':list(hex_center(q,r,radius)), 'polygon_m':poly,
            'area_km2':_area(poly)/1e6, 'neighbors':ns,
            'sample_count':int(len(cells)), 'land_fraction':float(land.ravel()[cells].mean()) if len(cells) else 0.,
            'elevation_m':stats(height,cells), 'temperature_c':stats(fields['temperature_c'],cells),
            'precipitation_mm':stats(fields['precipitation_mm'],cells),
            'soil_moisture':stats(fields['soil_moisture'],cells),
            'biomes':b_mix, 'rivers':sorted(river_ids[n]),
            'lakes':[int(v) for v in np.unique(lake.ravel()[cells]) if v>0],
            'special_locations':sorted(special_ids[n]),
            'terrain':{'field':'fields/elevation_m.npz', 'ownership_field':'fields/region_index.npz',
                       'array_key':'data',
                       'region_index':n, 'bbox_pixels': [int(col.min()),int(row.min()),int(col.max()+1),int(row.max()+1)] if len(cells) else None}
        }
        regions.append(region)
    return {'format_version':'1.0.0', 'orientation':'pointy-top', 'coordinates':'axial q,r; cube s=-q-r',
            'hex_radius_m':radius,'world_extent_m':[0.,0.,width,extent_h],
            'ownership':'pixel-centre cube rounding, geometry clipped to world rectangle',
            'regions':regions}, labels
