from pathlib import Path
import json,brotli,trimesh,hashlib
BASE=Path(__file__).parent
src=BASE/'hex-scenes/H_5_7/forest-temperate.glb'
br=src.with_suffix(src.suffix+'.br')
assert brotli.decompress(br.read_bytes())==src.read_bytes()
s=trimesh.load(src,force='scene')
assert len(s.geometry)>=20
assert sum(len(x.faces) for x in s.geometry.values())>=40000
metadata=json.loads((BASE/'hex-scenes/H_5_7/metadata.json').read_text())
assert metadata['total_triangles']==sum(len(x.faces) for x in s.geometry.values())
progress=json.loads((BASE/'hex-workshop/public/progress.json').read_text())
assert progress['visual_preview_ready']==['H_5_7']
assert progress['game_ready']==[]
print('QA PASS',len(s.geometry),'meshes',metadata['total_triangles'],'triangles','brotli',br.stat().st_size,'sha256',hashlib.sha256(src.read_bytes()).hexdigest())
