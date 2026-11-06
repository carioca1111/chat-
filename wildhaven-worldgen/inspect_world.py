"""Independent format reader: does NOT import or execute any worldgen module."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np

def load_world(directory):
    directory=Path(directory);world=json.loads((directory/"world.json").read_text(encoding="utf-8"))
    fields={}
    for name,info in world["fields"].items():
        with np.load(directory/info["path"],allow_pickle=False) as archive:
            a=archive[info["key"]]
        if list(a.shape)!=world["raster"]["shape"]:raise ValueError(f"Shape mismatch: {name}")
        if not np.isfinite(a).all():raise ValueError(f"Nonfinite field: {name}")
        if hashlib.sha256(a.tobytes()).hexdigest()!=info["array_sha256"]:raise ValueError(f"Corrupt field: {name}")
        fields[name]=a
    docs={name:json.loads((directory/f"{name}.json").read_text(encoding="utf-8")) for name in ["regions","rivers","special-locations"]}
    return world,fields,docs

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("directory",nargs="?",default="outputs");a=parser.parse_args()
    world,fields,docs=load_world(a.directory)
    print(json.dumps({"format_version":world["format_version"],"seed":world["seed"],"shape":world["raster"]["shape"],"fields":len(fields),"biomes":len(np.unique(fields["biomes"]))-1,"regions":len(docs["regions"]["regions"]),"numeric_fingerprint":world["numeric_fingerprint"]},indent=2))
