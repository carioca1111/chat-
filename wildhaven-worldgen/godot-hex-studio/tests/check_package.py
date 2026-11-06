"""Smoke tests do conteúdo exportado (não substituem Godot --headless)."""
from __future__ import annotations
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def test_package():
    for path in [
        'project.godot', 'scenes/studio.tscn',
        'scripts/studio.gd', 'scripts/atlas_view.gd', 'scripts/preview_3d.gd',
        'data/regions_snapshot.json', 'data/progress.json', 'README.md'
    ]:
        assert (ROOT / path).is_file(), path
    data = json.loads((ROOT / 'data/regions_snapshot.json').read_text(encoding='utf8'))
    regions = data['regions']
    assert len(regions) == 368
    assert len({x['id'] for x in regions}) == 368
    assert next(x for x in regions if x['id'] == 'H_5_7')['dominant_biome_id'] == 1
    for x in regions:
        assert len(x['polygon_m']) == 6
        assert len(x['center_m']) == 2
        assert 0 <= x['dominant_biome_id'] <= 15
    progress = json.loads((ROOT / 'data/progress.json').read_text(encoding='utf8'))
    assert progress['regions']['H_5_7']['status'] == 'in_development'
    assert not progress['regions']['H_5_7']['approved']
    glb = ROOT / 'assets/H_5_7_forest.glb'
    if glb.exists():
        header = glb.read_bytes()[:12]
        magic, version, length = struct.unpack('<4sII', header)
        assert magic == b'glTF' and version == 2 and length == glb.stat().st_size
    print('PASS: Godot project files, 368 regions, H_5_7 status, GLB header')

if __name__ == '__main__':
    test_package()