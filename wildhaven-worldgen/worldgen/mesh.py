"""Lossless binary inspection layers and an actual finely eroded mountain mesh."""
import json
from pathlib import Path
import numpy as np
from scipy.ndimage import map_coordinates, maximum_filter, minimum_filter
from .terrain import noise, BIOMES
from .erosion import evolve_landscape

PALETTE=np.array([[int(c[i:i+2],16) for i in (1,3,5)] for _,_,c in BIOMES],dtype=np.uint8)

def _json(path,value):
    Path(path).write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+"\n",encoding="utf-8")

def export_viewer(out,relative_path,arrays,metadata):
    """Raw little-endian arrays avoid million-element JSON parsing and rounding."""
    out=Path(out);manifest=out/relative_path;manifest.parent.mkdir(parents=True,exist_ok=True)
    folder=manifest.parent/"viewer" if "mountains" in str(manifest) else out/"viewer"
    folder.mkdir(parents=True,exist_ok=True)
    doc=dict(metadata);doc["fields"]={}
    for name,array in arrays.items():
        array=np.asarray(array)
        dtype="uint8" if name in {"biome_rgb","land_mask","biomes"} else "int32" if name=="lake_id" else "float32"
        data=np.ascontiguousarray(array,dtype={"uint8":"u1","int32":"<i4","float32":"<f4"}[dtype])
        target=folder/f"{name}.bin";target.write_bytes(data.tobytes())
        doc["fields"][name]={"path":target.relative_to(out).as_posix(),"dtype":dtype,"count":data.size,"byte_length":data.nbytes}
    _json(manifest,doc)
    return doc

def _mesh(out,relative,height,colors,dx,dy,origin):
    """Four shared-edge quadrants, each with its own small open glTF buffer."""
    root=Path(out)/relative;root.mkdir(parents=True,exist_ok=True)
    h,w=height.shape;gy,gx=np.gradient(height,dy,dx)
    # glTF X=east,Y=up,Z=south. Increasing raster rows is increasing Z.
    normals=np.stack([-gx,np.ones_like(gx),-gy],axis=-1)
    normals/=np.linalg.norm(normals,axis=-1,keepdims=True)
    document={"asset":{"version":"2.0","generator":"Wildhaven geomorphic mesh v2"},"scene":0,"scenes":[{"nodes":[]}],
              "nodes":[],"meshes":[],"buffers":[],"bufferViews":[],"accessors":[],
              "materials":[{"name":"weathered rock, soil and snow","doubleSided":False,
                            "pbrMetallicRoughness":{"baseColorFactor":[1,1,1,1],"metallicFactor":0,"roughnessFactor":.95}}],
              "extras":{"origin_m":origin,"axes":"local X east, Y up, Z south; origin southwest"}}
    yranges=[(0,h//2),(h//2,h-1)];xranges=[(0,w//2),(w//2,w-1)]
    triangles=0;vertices=0
    for r0,r1 in yranges:
        for c0,c1 in xranges:
            rr,cc=np.meshgrid(np.arange(r0,r1+1),np.arange(c0,c1+1),indexing="ij")
            positions=np.stack([(cc+.5)*dx,height[rr,cc],-(h-rr-.5)*dy],axis=-1).astype("<f4").reshape(-1,3)
            nh,nw=rr.shape
            a=(np.arange(nh-1)[:,None]*nw+np.arange(nw-1)[None,:]).ravel()
            # Upper-left -> lower-left -> upper-right gives upward normals.
            indices=np.stack([a,a+nw,a+1,a+1,a+nw,a+nw+1],axis=1).astype("<u4").ravel()
            buffer=bytearray();buffer_index=len(document["buffers"])
            def accessor(data,type_,component,target):
                while len(buffer)%4:buffer.append(0)
                off=len(buffer);data=np.ascontiguousarray(data);buffer.extend(data.tobytes())
                vi=len(document["bufferViews"]);document["bufferViews"].append({"buffer":buffer_index,"byteOffset":off,"byteLength":data.nbytes,"target":target})
                ai=len(document["accessors"]);entry={"bufferView":vi,"componentType":component,"count":len(data),"type":type_}
                if type_=="VEC3":entry.update(min=data.min(axis=0).tolist(),max=data.max(axis=0).tolist())
                document["accessors"].append(entry);return ai
            pos=accessor(positions,"VEC3",5126,34962)
            nor=accessor(normals[rr,cc].astype("<f4").reshape(-1,3),"VEC3",5126,34962)
            color=accessor(colors[rr,cc].astype("<f4").reshape(-1,3),"VEC3",5126,34962)
            ind=accessor(indices,"SCALAR",5125,34963)
            name=f"mountain-{buffer_index}.bin";(root/name).write_bytes(buffer)
            document["buffers"].append({"uri":name,"byteLength":len(buffer)})
            mi=len(document["meshes"]);document["meshes"].append({"name":f"eroded mountain quadrant {mi+1}","primitives":[{"attributes":{"POSITION":pos,"NORMAL":nor,"COLOR_0":color},"indices":ind,"material":0}]})
            document["nodes"].append({"mesh":mi});document["scenes"][0]["nodes"].append(mi)
            triangles+=len(indices)//3;vertices+=len(positions)
    _json(root/"mountain.gltf",document)
    return {"triangle_count":triangles,"vertex_count_with_shared_edges":vertices,"buffer_count":len(document["buffers"])}

def mountain_colors(height,slope,temperature,biomass):
    """Slope and cold-exposure materials derived from the physical detail fields."""
    rock=np.clip((slope-.25)/.65,0,1)
    green=np.stack([.21+.18*(1-biomass),.28+.22*biomass,.13+.12*biomass],axis=-1)
    stone=np.stack([.30+.13*np.clip(height/5000,0,1),.29+.12*np.clip(height/5000,0,1),.25+.13*np.clip(height/5000,0,1)],axis=-1)
    color=green*(1-rock[...,None])+stone*rock[...,None]
    snow=np.clip((-temperature-3)/9,0,1)*np.clip(1-slope/.95,0,1)
    color=color*(1-snow[...,None])+np.array([.90,.94,.96])*snow[...,None]
    return np.clip(color,0,1)

def create_mountains(out,fields,config):
    out=Path(out);folder=out/"meshes"/"mountains";folder.mkdir(parents=True,exist_ok=True)
    h,w=fields["elevation_m"].shape;dx=config["width_m"]/w;dy=config["height_m"]/h
    extent=float(config.get("mountain_detail",{}).get("extent_m",128000));n=int(config.get("mountain_detail",{}).get("resolution",512))
    window=max(3,int(extent/dx))
    e=fields["elevation_m"]
    relief=maximum_filter(e,window)-minimum_filter(e,window)
    eligible=fields["land_mask"]&(fields["distance_to_coast_m"]>extent)&(fields["tectonic_uplift_m"]>900)&(fields["ash_concentration"]<.05)&(fields["latitude_deg"]>25)&(fields["latitude_deg"]<60)&(fields["lake_id"]==0)
    if not np.any(eligible):raise ValueError("No inland mountain site for the fine erosion mesh")
    score=np.where(eligible,relief-.08*np.abs(e-2400),-1e12)
    r,c=np.unravel_index(np.argmax(score),score.shape)
    cx=(c+.5)*dx;cy=config["height_m"]-(r+.5)*dy
    x0=cx-extent/2;y0=cy-extent/2
    u,v=np.meshgrid((np.arange(n)+.5)/n,1-(np.arange(n)+.5)/n)
    xx=x0+u*extent;yy=y0+v*extent
    coords=[(config["height_m"]-yy)/dy-.5,xx/dx-.5]
    def sample(name):return map_coordinates(fields[name].astype(float),coords,order=1,mode="nearest")
    background=sample("elevation_m")
    rng=np.random.default_rng(config["seed"]+24031)
    warp=noise(u,v,rng,4,3)
    structural=noise(np.clip(u+.04*warp,0,1),np.clip(v-.035*warp,0,1),rng,35,5)
    branch=noise(u,v,rng,8,5)
    ridge=(1-np.clip(np.abs(structural*2.1),0,1))**3
    taper=np.sin(np.pi*u)**2*np.sin(np.pi*v)**2
    initial=(background+(1400*(ridge-.46)+420*branch)*taper).astype("float32")
    if initial.min()<=0:initial=(5+12*np.logaddexp(0,(initial-5)/12)).astype("float32")
    detail_config={"erosion":{"iterations":8,"model_years":100000,"stream_power_k":.000020,
                              "reroute_every":2,"max_incision_per_stage_m":100,
                              "hillslope_diffusivity_m2_yr":12,"boundary_mode":"fixed_open",
                              "talus_angle_degrees":34,"thermal_relaxation":.15,"max_deposition_per_stage_m":7}}
    final,erosion,history=evolve_landscape(initial,np.ones_like(initial,dtype=bool),extent/n,extent/n,detail_config,precipitation_mm=sample("precipitation_mm"))
    gy,gx=np.gradient(final,extent/n,extent/n);slope=np.hypot(gx,gy).astype("float32")
    temperature=(sample("temperature_c")-.0055*(final-background)).astype("float32")
    biomass=sample("biomass").astype("float32")
    colors=mountain_colors(final,slope,temperature,biomass)
    np.save(folder/"heightmap.npy",final,allow_pickle=False);np.save(folder/"initial-heightmap.npy",initial,allow_pickle=False)
    np.savez_compressed(folder/"geomorphic-erosion.npz",data=erosion["geomorphic_erosion_m"])
    np.savez_compressed(folder/"geomorphic-deposition.npz",data=erosion["geomorphic_deposition_m"])
    mesh_stats=_mesh(out,"meshes/mountains",final,colors,extent/n,extent/n,[x0,y0])
    meta={"name":"Serra das Agulhas / macico erodido","center_m":[cx,cy],"bounds_m":[x0,y0,x0+extent,y0+extent],"mesh_origin_m":[x0,y0],
          "local_resolution":[n,n],"pixel_size_m":[extent/n,extent/n],"row_order":"north_to_south",
          "heightmap":"meshes/mountains/heightmap.npy","initial_heightmap":"meshes/mountains/initial-heightmap.npy",
          "erosion_field":"meshes/mountains/geomorphic-erosion.npz","deposition_field":"meshes/mountains/geomorphic-deposition.npz",
          "gltf":"meshes/mountains/mountain.gltf","erosion":history,"mesh_statistics":mesh_stats,
          "local_to_world":{"x":"X + mesh_origin_m[0]","y":"mesh_origin_m[1] - Z","elevation":"Y"},
          "integration":"Refined inset replaces the matching coarse terrain; fixed boundary samples preserve regional topography. No game integration."}
    _json(folder/"metadata.json",meta)
    arrays={"elevation_m":final,"biome_rgb":np.rint(colors*255).astype("uint8"),"land_mask":np.ones((n,n),np.uint8),
            "temperature_c":temperature,"precipitation_mm":sample("precipitation_mm"),"soil_moisture":sample("soil_moisture"),
            "flow_accumulation_km2":np.zeros((n,n),np.float32),"slope":slope,"biomes":map_coordinates(fields["biomes"],coords,order=0,mode="nearest"),
            "lake_id":np.zeros((n,n),np.int32),"water_surface_m":final}
    export_viewer(out,"meshes/mountains/mountain-viewer.json",arrays,{"nx":n,"ny":n,"width_m":extent,"height_m":extent,"origin_m":[x0,y0],"name":meta["name"],"detail":True,"metadata":meta})
    return meta,{"initial":initial,"height":final,"colors":colors,"erosion":erosion,"metadata":meta}
