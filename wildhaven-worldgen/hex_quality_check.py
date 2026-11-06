"""Acceptance gates for Wildhaven's standalone H_5_7 scene.

A source-code commit is NOT visual approval. This validator checks structural
integrity and geography isolation, leaving human art review explicitly pending.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
import sys

import numpy as np
import trimesh


ROOT = Path(__file__).resolve().parent
HEX = ROOT / "hex-scenes" / "H_5_7"


def check():
    metadata = json.loads((HEX / "metadata.json").read_text(encoding="utf-8"))
    progress = json.loads((ROOT / "hex-workshop" / "public" / "progress.json").read_text(encoding="utf-8"))
    regions = json.loads((ROOT / "outputs" / "regions.json").read_text(encoding="utf-8"))
    reg = next(r for r in regions["regions"] if r["id"] == "H_5_7")
    assert len(regions["regions"]) == progress["total_hexes"] == 368
    assert metadata["region_id"] == "H_5_7"
    assert metadata["coordinates"]["global_region_center_m"] == reg["center_m"]
    assert metadata["coordinates"]["observable_region_diameter_m"] == 2000
    assert metadata["integration_status"] == "in_development_unapproved"
    assert progress["regions"]["H_5_7"]["status"] == "in_development"
    assert progress["regions"]["H_5_7"]["approved"] is False
    assert "H_5_7" not in progress["completed"]
    assert not progress["game_ready"]

    model_path = HEX / "forest-temperate.glb"
    assert model_path.is_file() and model_path.stat().st_size > 100_000
    model = trimesh.load(model_path, file_type="glb", force="scene")
    assert isinstance(model, trimesh.Scene)
    geometry = model.geometry
    required = {
        "terrain", "river", "waterfalls", "geology-riverbank-left",
        "geology-riverbank-right", "geology-exposed-bedrock",
        "geology-river-boulders", "geology-fall-cliff",
        "geology-fall-buttresses", "pine-needles",
        "broadleaf-canopies", "ruins", "bridge-planks", "canvas-tent",
        "footpaths", "cave-interior",
    }
    names = set(metadata["geometry"])
    assert required <= names, "Missing meshes: " + repr(required - names)
    assert all(np.isfinite(m.vertices).all() for m in geometry.values())
    assert all(len(m.faces) > 0 for m in geometry.values())
    triangles = sum(len(m.faces) for m in geometry.values())
    assert triangles == metadata["total_triangles"]
    assert triangles > 100_000, "Not enough detailed actual triangles"
    for name in required:
        assert metadata["geometry"][name]["triangles"] > 1, name
    measurements = metadata["geology_metrics"]
    assert measurements["shore_segments"] > 100
    assert len(measurements["waterfalls_with_bedrock"]) == 3
    assert measurements["riverbank_boulders"] > 200
    assert measurements["slope_exposures"] > 20

    # Boundaries and scale are not falsely declared fully georeferenced.
    assert metadata["boundary_metadata"]["geometry_clipped"]
    assert "pending" in metadata["boundary_metadata"]["water_portals"]
    print(json.dumps({
        "result": "structure_passed_visual_approval_pending",
        "region": "H_5_7",
        "meshes": len(geometry),
        "triangles": triangles,
        "glb_bytes": model_path.stat().st_size,
        "shore_segments": measurements["shore_segments"],
        "boulders": measurements["riverbank_boulders"],
        "slope_samples": measurements["slope_class_samples"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        check()
    except (AssertionError, KeyError, ValueError) as exc:
        print("H_5_7 quality check failed:", exc, file=sys.stderr)
        raise SystemExit(1) from exc
