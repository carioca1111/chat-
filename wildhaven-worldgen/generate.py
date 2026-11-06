"""Compile an independent, reproducible Wildhaven continent and inspectable assets."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import time
import numpy as np
from scipy.ndimage import map_coordinates, distance_transform_edt
from PIL import Image
from worldgen import FORMAT_VERSION
from worldgen.terrain import geology, climate, ecology, grids, gaussian, BIOMES
from worldgen.erosion import evolve_landscape
from worldgen.mesh import export_viewer,create_mountains,PALETTE
from worldgen.hydrology import run_hydrology, breach_outlet
from worldgen.regions import region_at, hex_center, build_regions
from worldgen.ravine import ravine_cut, ravine_axis, create_ravine

ROOT=Path(__file__).resolve().parent

def save_json(path,data):
    Path(path).write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+"\n",encoding="utf-8")

def ravine_sampler(fields,config,center,outlet):
    """Refine the canyon without applying a coarse outlet cut twice.

    Reconstruct the regional background before the outlet, then cut the actual
    continuous outlet polyline into the fine canyon. Interpolating a deeply cut
    coarse bank as background and subtracting the fine incision again would
    invent subgrid depressions below the drainage outlet.
    """
    h,w=fields["elevation_m"].shape;dx=config["width_m"]/w;dy=config["height_m"]/h
    base=fields["elevation_m"]+fields["ravine_incision_m"]+fields["ravine_outlet_incision_m"]
    points=np.asarray(outlet["points_m"],dtype=float);radius=outlet["bank_to_bank_width_m"]/2
    cx,cy=center
    def sample(xm,ym):
        xm,ym=np.broadcast_arrays(np.asarray(xm,dtype=float),np.asarray(ym,dtype=float))
        background=map_coordinates(base,[(config["height_m"]-ym)/dy-.5,xm/dx-.5],order=1,mode="nearest")
        incision=ravine_cut(xm,ym,cx,cy,config["seed"])
        bed=background-incision
        nearest=np.full(xm.shape,np.inf);target=np.zeros(xm.shape)
        for a,b in zip(points[:-1],points[1:]):
            vx,vy=b[:2]-a[:2];length2=vx*vx+vy*vy
            t=np.clip(((xm-a[0])*vx+(ym-a[1])*vy)/max(length2,1),0,1)
            dist2=(xm-a[0]-t*vx)**2+(ym-a[1]-t*vy)**2
            choose=dist2<nearest
            target=np.where(choose,a[2]+t*(b[2]-a[2]),target);nearest=np.minimum(nearest,dist2)
        weight=np.clip(1-np.sqrt(nearest)/radius,0,1);weight=weight*weight*(3-2*weight)
        carved=bed-np.maximum(bed-target,0)*weight
        # create_ravine removes the same analytic incision for all geometry.
        return carved+incision
    return sample

def choose_ravine(fields,config):
    x,y=grids(config);e=fields["elevation_m"]
    tropical=(np.abs(fields["latitude_deg"])<23)&(fields["temperature_c"]>17)&(fields["precipitation_mm"]>1450)&fields["land_mask"]
    q,r=region_at(x*config["width_m"],y*config["height_m"],config["hex_radius_m"])
    eligible=set()
    pairs=np.stack([q.ravel(),r.ravel()],axis=1)
    for qq,rr in np.unique(pairs,axis=0):
        region=(q==qq)&(r==rr)&fields["land_mask"]
        if region.sum() and np.mean(tropical[region])>.75:eligible.add((int(qq),int(rr)))
    # Select an upland surrounded by a genuinely tropical territorial matrix.
    candidates=tropical&(e>1460)&(e<2050)
    rows,cols=np.where(candidates)
    if not len(rows):raise ValueError("Configuration lacks tropical upland for a 1300m ravine; increase resolution/extent or revise geologic parameters.")
    score=-((x[rows,cols]-.565)/.15)**2-((y[rows,cols]-.14)/.15)**2
    score+=.2*np.minimum(fields["precipitation_mm"][rows,cols]/2000,1)
    for k in np.argsort(-score,kind="stable"):
        row,col=rows[k],cols[k]
        if (int(q[row,col]),int(r[row,col])) not in eligible:continue
        cx=x[row,col]*config["width_m"];cy=y[row,col]*config["height_m"]
        hc=hex_center(q[row,col],r[row,col],config["hex_radius_m"])
        if np.hypot(cx-hc[0],cy-hc[1])>config["hex_radius_m"]*.58:continue
        # The WHOLE fissure needs a high tropical foundation. Checking only its
        # centre can place one end down a steep valley below sea level.
        yy=cy+np.linspace(-28000,28000,17)
        xx=cx+ravine_axis(yy,cy,config["seed"])
        yy=np.repeat(yy,3);xx=np.repeat(xx,3)+np.tile([-2600,0,2600],17)
        hh,ww=e.shape;dx=config["width_m"]/ww;dy=config["height_m"]/hh
        support=map_coordinates(e,[(config["height_m"]-yy)/dy-.5,xx/dx-.5],order=1,mode="nearest")
        if support.min()<1410:continue
        r0=max(0,int((config["height_m"]-cy-40000)/dy));r1=min(hh,int((config["height_m"]-cy+40000)/dy)+1)
        c0=max(0,int((cx-13000)/dx));c1=min(ww,int((cx+13000)/dx)+1)
        px,py=np.meshgrid((np.arange(c0,c1)+.5)*dx,config["height_m"]-(np.arange(r0,r1)+.5)*dy)
        proposed=ravine_cut(px,py,cx,cy,config["seed"])
        core=proposed>1100
        if not core.any() or np.min((e[r0:r1,c0:c1]-proposed)[core])<80:continue
        return float(cx),float(cy)
    raise ValueError("No tropical hex contains the full 1300m fissure above its drainage outlet.")

def choose_village(fields,config):
    h,w=fields["elevation_m"].shape;dx=config["width_m"]/w;dy=config["height_m"]/h
    water=(fields["lake_id"]>0)|(fields["flow_accumulation_km2"]>config["river_threshold_km2"])
    dist=distance_transform_edt(~water,sampling=(dy,dx))
    good=(fields["biomes"]==1)&(fields["slope"]<.025)&(dist<25000)&(fields["elevation_m"]<1100)
    if not np.any(good):raise ValueError("No temperate flat site with access to fresh water.")
    score=np.where(good,-fields["slope"]*200-abs(fields["temperature_c"]-14)/10-dist/100000,-1e9)
    row,col=np.unravel_index(np.argmax(score),score.shape)
    center=[float((col+.5)*dx),float(config["height_m"]-(row+.5)*dy)]
    q,r=region_at(*center,config["hex_radius_m"])
    return {"name":"Reserva de Clareira das Aguas","center_m":center,"radius_m":12000,"region_id":f"H_{q}_{r}",
            "biome_id":1,"elevation_m":float(fields["elevation_m"][row,col]),"slope":float(fields["slope"][row,col]),
            "freshwater_distance_m":float(dist[row,col]),"status":"Geographic reservation only; no village or gameplay instantiated"}

def generate(config,out,no_renders=False,cache_landscape=False,resume_landscape=False):
    out=Path(out);out.mkdir(parents=True,exist_ok=True);(out/"fields").mkdir(exist_ok=True)
    t0=time.monotonic()
    def stage(msg):print(f"[{time.monotonic()-t0:6.1f}s] {msg}",flush=True)
    h,w=config["resolution"];dx=config["width_m"]/w;dy=config["height_m"]/h
    if min(h,w)<128:raise ValueError("Minimum supported raster dimension:128")
    if config["hex_radius_m"]<120000:raise ValueError("Hex radius must be >=120 km to enclose the fixed ravine.")
    cache=ROOT/".cache";cache_key=hashlib.sha256(json.dumps(config,sort_keys=True).encode()+(ROOT/"worldgen"/"terrain.py").read_bytes()+(ROOT/"worldgen"/"erosion.py").read_bytes()).hexdigest()
    if resume_landscape:
        checkpoint=json.loads((cache/"landscape.json").read_text(encoding="utf-8"))
        if checkpoint["key"]!=cache_key:raise ValueError("Landscape checkpoint differs from current geography/configuration")
        with np.load(cache/"landscape.npz",allow_pickle=False) as data:fields={name:data[name] for name in data.files}
        volcano=checkpoint["volcano"];erosion_history=checkpoint["history"];stage("Resumed verified landscape checkpoint")
    else:
        stage("Geologic shield, folds, basins, volcano")
        fields,volcano=geology(config)
        fields.update(climate(fields["elevation_m"],fields["land_mask"],config))
        stage("Iterative stream-power erosion, weathering and hillslope transport")
        x,y=grids(config)
        # An old dissected continent, a younger resistant basaltic upland and a
        # recently built volcano. The caldera is added after long-term weathering.
        exposure_protection=np.clip(gaussian(x,y,.565,.14,.040,.045)*1.5,0,1)
        old_land=fields["elevation_m"]-fields["volcanic_relief_m"]
        aged,weathering,erosion_history=evolve_landscape(old_land,fields["land_mask"],dx,dy,config,
                                                       precipitation_mm=fields["precipitation_mm"],protection=exposure_protection)
        fields.update(weathering);fields["elevation_m"]=aged+fields["volcanic_relief_m"]
        fields.update(climate(fields["elevation_m"],fields["land_mask"],config))
        if cache_landscape:
            cache.mkdir(exist_ok=True);np.savez_compressed(cache/"landscape.npz",**fields)
            save_json(cache/"landscape.json",{"key":cache_key,"volcano":volcano,"history":erosion_history})
    cx,cy=choose_ravine(fields,config)
    x,y=grids(config);cut=ravine_cut(x*config["width_m"],y*config["height_m"],cx,cy,config["seed"]).astype("float32")
    fields["elevation_m"]-=cut
    source=int(np.argmin(np.where(cut>1100,fields["elevation_m"],np.inf)))
    before_breach=fields["elevation_m"].copy()
    fields["elevation_m"],outlet=breach_outlet(before_breach,(cx,cy),fields["land_mask"],dx,dy,source_cell=source)
    fields["ravine_incision_m"]=cut
    fields["ravine_outlet_incision_m"]=(before_breach-fields["elevation_m"]).astype("float32")
    stage("Latitude, oceanic winds and rain shadow")
    fields.update(climate(fields["elevation_m"],fields["land_mask"],config))
    fields["pre_erosion_elevation_m"]=fields["elevation_m"].copy()
    stage("Priority-Flood drainage, lakes, incision and sediment transport")
    hydrology,network=run_hydrology(fields["elevation_m"],fields["precipitation_mm"],fields["land_mask"],dx,dy,river_threshold_km2=config["river_threshold_km2"])
    fields.update(hydrology)
    # Climate is preserved from the prescribed pipeline; slope reflects final erosion.
    gy,gx=np.gradient(fields["elevation_m"],dy,dx);fields["slope"]=np.hypot(gx,gy).astype("float32")
    stage("Soils, fertility, environmental biome niches and vegetation")
    ecology(fields,config)
    counts={int(i):int(np.count_nonzero(fields["biomes"]==i)) for i in range(16)}
    missing=[i for i in range(1,16) if counts[i]<10]
    if missing:raise ValueError(f"Environmental niches missing/too small: {missing}; counts={counts}")
    stage("Georeferenced ravine detail mesh and cave apertures")
    sample_height=ravine_sampler(fields,config,(cx,cy),outlet)
    ravine=create_ravine(out/"meshes"/"ravine",(cx,cy),config,sample_height,seed=config["seed"])
    ravine["center_m"]=[cx,cy]
    ravine["drainage_outlet"]=outlet
    q,r=region_at(cx,cy,config["hex_radius_m"]);ravine["region_id"]=f"H_{q}_{r}"
    specials={"volcano":volcano,"ravine":ravine,"starting_village":choose_village(fields,config)}
    stage("Fine mountain terrain, iterative local erosion and open glTF mesh")
    mountain,mountain_render=create_mountains(out,fields,config)
    specials["mountains"]=mountain
    stage("Hexagon ownership and cross-region hydrographic references")
    regions,fields["region_index"]=build_regions(fields,config,network,specials)
    catalog={i:{"id":i,"name":name,"color":color} for i,name,color in BIOMES}
    for region in regions["regions"]:
        for b in region["biomes"]:b.update(name=catalog[b["id"]]["name"])
    stage("Lossless numeric exports, 16-bit heightmap and manifest")
    units={"elevation_m":"m","pre_erosion_elevation_m":"m","temperature_c":"degC","precipitation_mm":"mm/year","slope":"m/m",
           "distance_to_coast_m":"m","latitude_deg":"degrees","flow_receiver":"flattened cell index; -1 ocean",
           "flow_accumulation_km2":"km2","discharge_m3s":"m3/s","lake_depth_m":"m","water_surface_m":"m",
           "erosion_m":"m","sediment_m":"m","ravine_incision_m":"m","ravine_outlet_incision_m":"m","region_index":"regions[].index","flow_rank":"topological index","biomes":"biome ID","lake_id":"lake integer ID; 0 none","land_mask":"boolean land mask"}
    fieldmeta={};fingerprint=hashlib.sha256()
    for name in sorted(fields):
        data=np.ascontiguousarray(fields[name]);path=out/"fields"/f"{name}.npz"
        np.savez_compressed(path,data=data)
        rawhash=hashlib.sha256(data.tobytes()).hexdigest();fingerprint.update(name.encode()+bytes.fromhex(rawhash))
        fieldmeta[name]={"path":f"fields/{name}.npz","key":"data","shape":list(data.shape),"dtype":data.dtype.str,"units":units.get(name,"m" if name.endswith("_m") else "fraction 0..1"),
                         "sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"array_sha256":rawhash}
    np.save(out/"biomes-data.npy",fields["biomes"],allow_pickle=False)
    offset=config["height_encoding"]["offset_m"];scale=config["height_encoding"]["scale_m"]
    encoded=np.rint((fields["elevation_m"].astype(np.float64)-offset)/scale)
    if encoded.min()<0 or encoded.max()>65535:raise ValueError("Height outside lossless PNG encoding range; adjust height_encoding.")
    Image.fromarray(encoded.astype("uint16")).save(out/"heightmap.png")
    save_json(out/"regions.json",regions);save_json(out/"rivers.json",network);save_json(out/"special-locations.json",specials)
    meta={"format_version":FORMAT_VERSION,"name":"Wildhaven / Auralis","seed":config["seed"],"config":config,
          "coordinates":{"origin":"southwest world corner","x":"east metres","y":"north metres","z":"elevation metres above sea level 0", "latitude":"fictional equirectangular climate latitude; not terrestrial EPSG",
                         "pixel_center":"x=(column+0.5)*dx; y=height_m-(row+0.5)*dy","gltf":"local X east,Y up,Z south; georeference in ravine metadata"},
          "raster":{"shape":[h,w],"row_order":"north_to_south","cell_size_m":[dx,dy],"sample":"pixel centres; continuous bilinear surface between samples"},
          "heightmap":{"path":"heightmap.png","bit_depth":16,"offset_m":offset,"scale_m":scale,"decode":"elevation_m=uint16*scale_m+offset_m","max_quantization_error_m":scale/2,
                       "exact_float_source":"fields/elevation_m.npz"},
          "fields":fieldmeta,"biome_catalog":list(catalog.values()),"biome_counts":counts,"numeric_fingerprint":fingerprint.hexdigest(),
          "landscape_evolution":erosion_history,"mountain_detail":mountain,
          "comparison_baseline":{"commit":"394b17c15b8755b5cb78bb26726fb560a34a61a5","desert_fraction_nonwater":.303546,"longest_straight_shore_m":1195000,"inspector_triangles":162690},
          "generation_environment":{"python":platform.python_version(),"numpy":np.__version__},
          "pipeline":["geology","elevation and slope","temperature","ocean and wind","precipitation and rain shadow","drainage and lakes","fluvial erosion and sedimentation","soil and fertility","biomes","biomass and vegetation","hex regions","export"],
          "limitations":["Art-directed geology; no plate-tectonic time simulation","Annual-average heuristic climate and stream power; not hydrodynamic simulation",
                         "Model years describe uncalibrated morphological exposure, not a measured real geological age",
                         "Continental 5 km raster is regional geography; mountain inset 125 m and ravine ~180 m; not gameplay-ready collision",
                         "GlTF cave/roots/terraces are geographic prototypes; vegetation placement and collision need future integration",
                         "Priority-Flood routes through lake surfaces; river bed may ascend within lakes, water surface never does",
                         "Same environment and config reproduce arrays exactly; cross-version floating-point parity is not promised"]}
    save_json(out/"world.json",meta)
    save_json(out/"config.json",config)
    # Lightweight WebGL inspector grid (sample spacing is intentionally disclosed).
    ny=min(h,int(config.get("inspector_max_samples",768)));nx=min(w,int(round(ny*w/h)))
    rows=((np.arange(ny)+.5)*h/ny).astype(int);cols=((np.arange(nx)+.5)*w/nx).astype(int)
    vd={"nx":nx,"ny":ny,"width_m":config["width_m"],"height_m":config["height_m"],
        "sample_note":"Downsampled inspector; authoritative geometry is the full raster and local glTF"}
    arrays={name:fields[name][np.ix_(rows,cols)] for name in ["elevation_m","temperature_c","precipitation_mm","soil_moisture","flow_accumulation_km2","land_mask","lake_id","water_surface_m","slope","biomes"]}
    arrays["biome_rgb"]=PALETTE[arrays["biomes"]]
    export_viewer(out,"viewer-data.json",arrays,vd)
    if not no_renders:
        stage("High-resolution continental, climate and 3D detail renders")
        from worldgen.render import render_all,render_ravine,render_mountains
        render_all(out,fields,config,regions,network,specials);render_ravine(out);render_mountains(out,mountain_render)
    readme=ROOT/"README.md"
    if readme.exists():(out/"README.md").write_text(readme.read_text(encoding="utf-8"),encoding="utf-8")
    manifest={"algorithm":"sha256","files":{str(p.relative_to(out)).replace("\\","/"):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob("*")) if p.is_file() and p.name not in {"manifest.json","validation-report.json"}}}
    save_json(out/"manifest.json",manifest)
    stage(f"DONE | {len(regions['regions'])} hexes | {len(network['rivers'])} river segments | biomes {counts}")
    return meta

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--config",type=Path,default=ROOT/"config.json");parser.add_argument("--out",type=Path,default=ROOT/"outputs");parser.add_argument("--no-renders",action="store_true")
    parser.add_argument("--cache-landscape",action="store_true");parser.add_argument("--resume-landscape",action="store_true")
    args=parser.parse_args();generate(json.loads(args.config.read_text(encoding="utf-8")),args.out,args.no_renders,args.cache_landscape,args.resume_landscape)
