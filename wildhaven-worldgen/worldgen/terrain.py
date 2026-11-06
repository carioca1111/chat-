"""Continuous geologic design, climatic transport and environmental biomes.

Hex boundaries never enter these equations. Noise is only small-scale geological
texture over explicitly continuous folds, coastal margins and drainage basins.
This is an art-directed geographic model, not a paleoclimate reconstruction.
"""
import numpy as np
from scipy.ndimage import map_coordinates, gaussian_filter, distance_transform_edt

BIOMES = [
    (0, "Oceano / água interior", "#123346"),
    (1, "Floresta Temperada", "#3e7756"),
    (2, "Selva Tropical", "#145c48"),
    (3, "Taiga", "#466e75"),
    (4, "Tundra", "#a3b7ad"),
    (5, "Savana", "#b9a65a"),
    (6, "Pradarias", "#91aa69"),
    (7, "Deserto Rochoso", "#c79d73"),
    (8, "Pântano", "#526d45"),
    (9, "Montanhas Alpinas", "#d2d5d4"),
    (10, "Manguezal Costeiro", "#288b7e"),
    (11, "Floresta Luminescente", "#51b9b0"),
    (12, "Vale Cristalino", "#a390d0"),
    (13, "Pântano Micelial", "#a978a4"),
    (14, "Terras de Cinza", "#73616b"),
    (15, "Vale Etéreo", "#b4c5eb"),
]

def noise(x, y, rng, cells=8, octaves=5):
    result = np.zeros_like(x, dtype=np.float64)
    norm = 0.
    for octave in range(octaves):
        n = cells * 2**octave
        grid = rng.normal(size=(n+4, n+4))
        result += map_coordinates(grid, [1+y*n, 1+x*n], order=3, mode="reflect") * .5**octave
        norm += .5**octave
    return result/norm

def grids(config):
    h, w = config["resolution"]
    x, y = np.meshgrid((np.arange(w)+.5)/w, 1-(np.arange(h)+.5)/h)
    return x, y

def gaussian(x,y,cx,cy,sx,sy):
    return np.exp(-.5*(((x-cx)/sx)**2+((y-cy)/sy)**2))

def geology(config):
    rng = np.random.default_rng(config["seed"])
    x,y = grids(config)
    n = noise(x,y,rng,6,6)
    broad = noise(x,y,rng,4,3)
    # One connected shield with fjorded northern cap and two asymmetric gulfs.
    axis = .49+.055*np.sin(y*7)-.035*np.sin(y*17)
    width = .345*(.82+.18*np.sin(y*5))
    radial = np.sqrt(((x-axis)/width)**2+((y-.49)/.457)**2)
    margin = 1-radial+.065*broad+.022*n
    margin -= .22*gaussian(x,y,.23,.37,.10,.09)
    margin -= .18*gaussian(x,y,.81,.67,.10,.075)
    margin = np.minimum(margin,2*np.minimum(y-.035,.965-y))
    land = margin>0
    coast = np.clip(margin/.13,0,1)
    fine = noise(x,y,rng,18,5)
    base = 70+530*np.maximum(margin,0)**.75+360*n+150*broad+140*fine
    # Fold belts with branching spines and variable uplift along strike.
    spine = .36+.046*np.sin(10*y)+.021*np.sin(27*y)
    d = x-spine
    belt = np.exp(-(d/.047)**2)*np.exp(-((y-.63)/.31)**4)
    crest = .35+.65*(1-np.abs(np.sin(55*x+17*y+2.8*n)))
    elevation = base+4100*belt*(.48+.52*crest)
    spine2 = .65+.037*np.sin(15*y)
    elevation += 2700*np.exp(-((x-spine2)/.037)**2-((y-.73)/.19)**4)*(.55+.45*crest)
    elevation += 1850*np.exp(-((x-(.49+.04*np.sin(19*y)))/.04)**2-((y-.22)/.14)**4)*(.5+.5*crest)
    elevation += 1050*gaussian(x,y,.61,.53,.10,.12) # rain-shadow plateau
    elevation -= 550*gaussian(x,y,.55,.30,.07,.11) # tropical foreland
    elevation += 1570*gaussian(x,y,.565,.14,.022,.024) # tropical basaltic shield upland
    # Tectonic basins have actual beds and become lakes only if hydrology fills them.
    for cx,cy,sx,sy,depth in [( .56,.63,.034,.026,740),(.45,.79,.028,.020,630),(.62,.29,.025,.025,380)]:
        elevation -= depth*gaussian(x,y,cx,cy,sx,sy)
    # A soft weathering floor preserves relief in lowlands: a hard max(0,h)
    # would create enormous flat planes with artificial parallel drainage.
    elevation = (25+90*np.logaddexp(0,(elevation-25)/90))*coast
    # Ocean remains a continuous shelf and abyss, with the same shoreline zero.
    elevation = np.where(land,elevation, -40-3100*np.clip(-margin/.45,0,1)**.7)
    # Composite volcano: cone, annular caldera rim, subsided crater and radial lava gullies.
    vx,vy=.365,.485
    dx=(x-vx)*config["width_m"]; dy=(y-vy)*config["height_m"]
    r=np.hypot(dx,dy); angle=np.arctan2(dy,dx)
    cone=4200*np.exp(-(r/68000)**1.35)
    rim=430*np.exp(-((r-13500)/4300)**2)
    crater=1750*np.exp(-(r/10500)**4)
    lava=(.5+.5*np.cos(7*angle+2*np.sin(r/25000)))**18
    elevation += (cone+rim-crater-160*lava*np.exp(-((r-36000)/25000)**2))*land
    wind_dx=dx; wind_dy=dy-.20*dx
    ash=np.exp(-np.sqrt((wind_dx/190000)**2+(wind_dy/74000)**2))
    ash *= np.where(dx>0,1,.65)*np.clip(1+.00012*(elevation-500),.6,1.5)
    minerals=gaussian(x,y,.61,.59,.055,.070)*(1+.25*n)
    texture=np.clip(1+.8*broad+.65*n,.25,1.6)
    luminous=np.clip(gaussian(x,y,.69,.255,.065,.085)*texture,0,1)
    fungal=np.clip(gaussian(x,y,.59,.255,.08,.075)*texture,0,1)
    ethereal=np.clip(gaussian(x,y,.30,.69,.07,.07)*texture,0,1)
    minerals=np.clip(minerals*(1+.35*n+.20*broad),0,1)
    return {"elevation_m":elevation.astype("float32"),"land_mask":land,
            "ash_concentration":np.clip(ash,0,1).astype("float32"),"mineralization":np.clip(minerals,0,1).astype("float32"),
            "luminous_anomaly":luminous.astype("float32"),"fungal_substrate":fungal.astype("float32"),
            "ethereal_anomaly":ethereal.astype("float32")}, {"center_m":[vx*config["width_m"],vy*config["height_m"]],
            "name":"Vulcao Coroa de Obsidiana","radius_m":190000,"crater_radius_m":13500,
            "ash_wind_direction_xy":[1,.2],"old_lava_channels":7}

def climate(elevation, land, config):
    x,y=grids(config); h,w=land.shape
    dx=config["width_m"]/w;dy=config["height_m"]/h
    lat=config["latitude_south_deg"]+y*(config["latitude_north_deg"]-config["latitude_south_deg"])
    coast_dist=distance_transform_edt(land,sampling=(dy,dx))
    marine=np.exp(-coast_dist/350000)
    sea_temperature=28-.0082*np.abs(lat)**2
    temperature=sea_temperature-.0055*np.maximum(elevation,0)
    temperature += marine*(3*np.clip((np.abs(lat)-35)/40,0,1)-1)
    potential=420+2250*np.exp(-(lat/18)**2)+1000*np.exp(-((np.abs(lat)-48)/14)**2)
    # Two steady-state ocean-fed humidity sweeps. Wind belts select direction;
    # lift removes atmospheric moisture upstream, leaving a dry lee.
    results=[]
    for direction in (1,-1):
        rain=np.zeros_like(elevation);q=np.ones(h);previous=np.zeros(h)
        for j in (range(w) if direction==1 else range(w-1,-1,-1)):
            e=np.maximum(elevation[:,j],0)
            lift=np.maximum(e-previous,0)/dx
            uptake=np.clip(dx/1800000+np.maximum(e-previous,0)/4000,0,.42)
            q=np.where(land[:,j],np.clip(q*(1-uptake)+dx/8000000,0,1),1)
            rain[:,j]=potential[:,j]*(.19+.81*q)+q*lift*42000
            previous=e
        results.append(rain)
    west_weight=1/(1+np.exp(-(np.abs(lat)-34)/3))
    rain=results[0]*west_weight+results[1]*(1-west_weight)
    rain=gaussian_filter(rain,1.3)
    gy,gx=np.gradient(elevation,dy,dx)
    return {"temperature_c":temperature.astype("float32"),"precipitation_mm":rain.astype("float32"),
            "slope":np.hypot(gx,gy).astype("float32"),"distance_to_coast_m":coast_dist.astype("float32"),
            "latitude_deg":lat.astype("float32"),"wind_east_fraction":west_weight.astype("float32")}

def ecology(fields, config):
    e=fields["elevation_m"];t=fields["temperature_c"];p=fields["precipitation_mm"]
    land=fields["land_mask"];lake=fields["lake_id"]>0;s=fields["slope"]
    runoff=np.log1p(fields["flow_accumulation_km2"])/14
    water=lake|(fields["flow_accumulation_km2"]>config["river_threshold_km2"])
    h,w=e.shape
    dist=distance_transform_edt(~water,sampling=(config["height_m"]/h,config["width_m"]/w))
    wet=np.exp(-dist/20000)
    moisture=np.clip(p/(700+np.maximum(t,0)*36)*.65+.27*wet-.8*s,0,1)
    fertility=np.clip(.2+.55*moisture+.20*np.clip(fields["sediment_m"]/10,0,1)+.12*fields["ash_concentration"]-2*s,0,1)
    b=np.full(e.shape,6,dtype="uint8")
    b[(p<650)&(t>4)]=7
    b[(t>19)&(p>=650)&(p<1450)]=5
    b[(t>5)&(p>=1000)]=1
    b[(t>17)&(p>=1450)&(np.abs(fields["latitude_deg"])<23)]=2
    b[(t>-8)&(t<=5)]=3
    b[t<=-8]=4
    b[(e>2400)&(t<7)]=9
    swamp=(t>7)&(moisture>.76)&(s<.018)&(wet>.4)&(e<650)
    b[swamp]=8
    b[(t>19)&(e<100)&(fields["distance_to_coast_m"]<26000)&(p>1100)&(s<.025)]=10
    # Anomalies modify suitable continuous environmental niches, never hex IDs.
    b[(fields["luminous_anomaly"]>.53)&(moisture>.58)&(t>8)&(p>1100)&(s<.09)]=11
    b[(fields["mineralization"]>.53)&(e>400)&(e<2500)&(s<.11)]=12
    b[(fields["fungal_substrate"]>.48)&(moisture>.76)&(wet>.30)&(t>17)&(e<800)&(s<.025)]=13
    b[(fields["ethereal_anomaly"]>.53)&(t>-12)&(t<12)&(p>650)&(e<2700)]=15
    b[fields["ash_concentration"]>.31]=14
    b[~land|lake]=0
    productivity=np.clip((t+9)/32,0,1)*np.clip(p/1800,0,1)*fertility
    biomass=np.clip(productivity*(1-np.clip(s*3,0,.9)),0,1)
    biomass[b==14]*=.10;biomass[b==7]*=.15;biomass[b==9]*=.08;biomass[b==0]=0
    fields.update(soil_moisture=moisture.astype("float32"),fertility=fertility.astype("float32"),
                  biomass=biomass.astype("float32"),vegetation_cover=np.sqrt(biomass).astype("float32"),biomes=b)
    return fields
