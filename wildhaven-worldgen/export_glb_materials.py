"""Embed actual glTF 2.0 PBR materials in a vertex-colored GLB.

trimesh's ColorVisuals export omits materials: glTF then defaults to
metallicFactor=1, which incorrectly makes green foliage look like copper.
The exported asset must look correct WITHOUT special viewer overrides.
"""
from __future__ import annotations

import json
import struct


JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def add_pbr_materials(glb: bytes) -> bytes:
    magic, version, total = struct.unpack_from("<4sII", glb)
    assert magic == b"glTF" and version == 2 and total == len(glb)
    chunks = []
    offset = 12
    while offset < len(glb):
        chunk_size, chunk_type = struct.unpack_from("<II", glb, offset)
        payload = glb[offset + 8:offset + 8 + chunk_size]
        chunks.append((chunk_type, payload))
        offset += 8 + chunk_size
    assert chunks and chunks[0][0] == JSON_CHUNK

    root = json.loads(chunks[0][1].decode("utf8").rstrip(" \t\r\n\x00"))
    colors = {
        "land": {"metallicFactor": 0.0, "roughnessFactor": .93},
        "foliage": {"metallicFactor": 0.0, "roughnessFactor": .87},
        "stone": {"metallicFactor": 0.0, "roughnessFactor": .95},
        "wood": {"metallicFactor": 0.0, "roughnessFactor": .88},
        "water": {"metallicFactor": .03, "roughnessFactor": .27},
        "fire": {"metallicFactor": 0.0, "roughnessFactor": .8},
    }
    root["materials"] = [
        {
            "name": "Wildhaven_" + name,
            "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], **pbr},
            "doubleSided": True,
            **({"emissiveFactor": [.3, .08, .005]} if name == "fire" else {}),
        }
        for name, pbr in colors.items()
    ]
    index = {name: i for i, name in enumerate(colors)}
    for mesh in root.get("meshes", []):
        name = mesh.get("name", "")
        if name in ("river", "river-foam", "pond", "waterfalls", "spray"):
            family = "water"
        elif name in ("pine-needles", "broadleaf-canopies", "shrubs", "reeds", "wildflowers"):
            family = "foliage"
        elif name == "fire":
            family = "fire"
        elif name in ("terrain", "footpaths"):
            family = "land"
        elif name.startswith("geology-") or name in ("rocks", "ruins", "rocky-hex-walls", "underside", "cave-interior"):
            family = "stone"
        else:
            family = "wood"
        for primitive in mesh.get("primitives", []):
            primitive["material"] = index[family]

    payload = json.dumps(root, separators=(",", ":"), ensure_ascii=False).encode("utf8")
    payload += b" " * ((4 - len(payload) % 4) % 4)
    chunks[0] = (JSON_CHUNK, payload)
    encoded = bytearray()
    for chunk_type, chunk in chunks:
        assert len(chunk) % 4 == 0
        encoded += struct.pack("<II", len(chunk), chunk_type) + chunk
    return struct.pack("<4sII", b"glTF", 2, 12 + len(encoded)) + encoded
