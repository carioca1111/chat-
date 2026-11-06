"""Publication-sized geographic atlas derived only from exported numeric fields."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource
from matplotlib.lines import Line2D
from .terrain import BIOMES

PALETTE=np.array([[int(c[i:i+2],16) for i in (1,3,5)] for _,_,c in BIOMES],dtype=np.uint8)

def shaded(fields,config):
    e=fields["elevation_m"];h,w=e.shape
    shade=LightSource(azdeg=310,altdeg=42).hillshade(e,vert_exag=28,dx=config["width_m"]/w,dy=config["height_m"]/h)
    rgb=PALETTE[fields["biomes"]].astype(float)/255
    rgb*=.50+.65*shade[...,None]
    ocean=~fields["land_mask"]
    depth=np.clip(-e/3500,0,1)
    shelf=np.exp(-np.maximum(-e,0)/550)
    rgb[ocean]=np.stack([.035+.055*shelf,.105+.22*shelf,.18+.23*shelf],axis=-1)[ocean]
    rgb[fields["lake_id"]>0]=[.17,.43,.57]
    return np.clip(rgb,0,1)

def render_all(out,fields,config,regions,network,specials):
    out=Path(out);renders=out/"renders";renders.mkdir(exist_ok=True)
    rgb=shaded(fields,config)
    Image.fromarray((rgb*255).astype("uint8")).save(out/"biomes.png")
    # Categorical color image: exact unshaded palette, separate from relief.
    Image.fromarray(PALETTE[fields["biomes"]]).save(out/"biomes-colors.png")
    extent=[0,config["width_m"]/1000,0,config["height_m"]/1000]
    plt.rcParams.update({"font.family":"DejaVu Sans","text.color":"#e0e8e6","axes.labelcolor":"#a7b9bb","xtick.color":"#8da4aa","ytick.color":"#8da4aa","axes.edgecolor":"#425762"})
    for name,cmap,limits in [("temperature","RdYlBu_r",(-35,30)),("precipitation","YlGnBu",(0,3500))]:
        key=name+ ("_c" if name=="temperature" else "_mm")
        normalized=np.clip((fields[key]-limits[0])/(limits[1]-limits[0]),0,1)
        Image.fromarray((plt.get_cmap(cmap)(normalized)[...,:3]*255).astype("uint8")).save(out/f"{name}.png")
    fig=plt.figure(figsize=(16,19),facecolor="#0b1b25")
    ax=fig.add_axes([.065,.095,.69,.84],facecolor="#0b1b25")
    ax.imshow(rgb,extent=extent,origin="upper",interpolation="bilinear")
    for region in regions["regions"]:
        if region.get("land_fraction",0)<.05:continue
        p=np.array(region["polygon_m"])/1000
        ax.plot(*np.vstack([p,p[0]]).T,color="#d9e5db",alpha=.22,lw=.32)
    for river in network["rivers"]:
        p=np.asarray(river["points_m"])/1000
        cells=np.asarray(river["cell_indices"],dtype=int)
        # Flow through standing lake surfaces is a topological connection, not
        # a visible diagonal river painted across open water.
        p[fields["lake_id"].ravel()[cells]>0]=np.nan
        if len(p)>1:ax.plot(p[:,0],p[:,1],color="#73bed0",alpha=.82,lw=.30+min(1.0,np.log1p(river.get("discharge_m3s",0))/12))
    for key,label,color,offset in [("volcano","COROA DE OBSIDIANA","#e5a188",(-800,230)),("ravine","RAVINA DOS DEVORADORES","#e8c780",(330,-340)),("starting_village","RESERVA DA VILA INICIAL","#d7e9c4",(260,120))]:
        s=specials[key];cx,cy=np.array(s["center_m"])/1000
        ax.scatter(cx,cy,s=40,facecolors="none",edgecolors=color,linewidths=1.3,zorder=6)
        ax.annotate(label,(cx,cy),(cx+offset[0],cy+offset[1]),color=color,fontsize=7.5,arrowprops={"arrowstyle":"-","color":color,"lw":.6})
    ax.set(xlim=(0,extent[1]),ylim=(0,extent[3]),xlabel="Leste · km",ylabel="Norte · km")
    ax.tick_params(labelsize=8);ax.grid(alpha=.08,color="white")
    fig.text(.065,.962,"W I L D H A V E N",fontsize=31,fontweight="bold",color="#edf0da")
    fig.text(.067,.938,"AURALIS  /  ATLAS GEOGRÁFICO CONTINENTAL",fontsize=10,color="#93b2b9")
    fig.text(.795,.885,"DOMÍNIOS VIVOS",fontsize=11,fontweight="bold")
    for k,(idx,name,color) in enumerate(BIOMES[1:]):
        yy=.850-k*.037
        fig.patches.append(plt.Rectangle((.795,yy),.014,.010,transform=fig.transFigure,color=color,clip_on=False))
        fig.text(.818,yy,name,fontsize=8)
        count=int(np.count_nonzero(fields["biomes"]==idx))
        fig.text(.818,yy-.011,f"{count/np.count_nonzero(fields['land_mask'])*100:.2f}% do continente",fontsize=6.5,color="#839da5")
    fig.text(.795,.235,f"SEED  {config['seed']}  /  REVISÃO 2\n\n{config['width_m']/1000:,.0f} × {config['height_m']/1000:,.0f} km\nLitoral fraturado e estuários\nErosão fluvial e encostas\n\nRelevo sombreado ×28\nNorte para cima",fontsize=9,linespacing=1.65,color="#a1b9be")
    ax.plot([400,1400],[350,350],color="#e0e3cf",lw=3)
    ax.text(900,440,"1.000 km",ha="center",fontsize=8)
    ax.annotate("N",xy=(5700,7500),xytext=(5700,7100),ha="center",color="#dfecd9",arrowprops={"arrowstyle":"-|>","color":"#dfecd9"})
    fig.text(.065,.045,"Superfície única · hidrologia D8 · clima orográfico · biomas ambientais · nenhuma integração ao jogo",fontsize=8,color="#8da9b1")
    fig.savefig(out/"world-preview.png",dpi=220,facecolor=fig.get_facecolor());plt.close(fig)
    fig,axes=plt.subplots(1,3,figsize=(19,9),facecolor="#0b1b25")
    for ax,key,title,cmap in zip(axes,["elevation_m","temperature_c","precipitation_mm"],["RELEVO · m","TEMPERATURA · °C","PRECIPITAÇÃO · mm/ano"],["gist_earth","RdYlBu_r","YlGnBu"]):
        data=np.where(fields["land_mask"],fields[key],np.nan)
        ax.set_facecolor("#102c3e");im=ax.imshow(data,cmap=cmap,extent=extent);ax.set_title(title,color="#c3d8dc",fontsize=11)
        cb=fig.colorbar(im,ax=ax,shrink=.7);cb.ax.tick_params(colors="#a2b8be",labelsize=7)
        ax.set_xticks([]);ax.set_yticks([])
    fig.tight_layout();fig.savefig(renders/"climate-atlas.png",dpi=180,facecolor=fig.get_facecolor());plt.close(fig)
    v=specials["volcano"];cx,cy=v["center_m"];h,w=fields["elevation_m"].shape
    xx=(np.arange(w)+.5)*config["width_m"]/w;yy=(1-(np.arange(h)+.5)/h)*config["height_m"]
    xi=np.where(abs(xx-cx)<200000)[0];yi=np.where(abs(yy-cy)<200000)[0]
    ex,ey=np.meshgrid(xx[xi]/1000,yy[yi]/1000);ez=fields["elevation_m"][np.ix_(yi,xi)]
    fig=plt.figure(figsize=(12,9),facecolor="#0b1b25");ax=fig.add_subplot(projection="3d",facecolor="#0b1b25")
    ax.plot_surface(ex,ey,ez,cmap="copper",rstride=1,cstride=1,linewidth=0,antialiased=True)
    ax.view_init(38,235);ax.set_box_aspect((1,1,.48));ax.set_title("COROA DE OBSIDIANA / CALDEIRA E DEPÓSITOS",color="#dfd8c8")
    ax.set(xlabel="Leste · km",ylabel="Norte · km",zlabel="Altitude · m")
    fig.savefig(renders/"volcano-detail.png",dpi=200,facecolor=fig.get_facecolor());plt.close(fig)

def render_ravine(out):
    out=Path(out);path=out/"meshes"/"ravine"/"ravine-heightmap.npy"
    if not path.exists():return
    e=np.load(path,allow_pickle=False)
    if isinstance(e,np.ndarray) and e.ndim==2:
        h,w=e.shape;x,y=np.meshgrid(np.linspace(0,46,w),np.linspace(90,0,h))
        fig=plt.figure(figsize=(14,10),facecolor="#0b1b25");ax=fig.add_subplot(projection="3d",facecolor="#0b1b25")
        ax.plot_surface(x[::3,::3],y[::3,::3],e[::3,::3],cmap="gist_earth",linewidth=0,antialiased=True)
        ax.set_box_aspect((.7,1,.52));ax.view_init(39,135);ax.set_title("RAVINA DOS DEVORADORES / GEOMETRIA MULTINÍVEL",color="#d4e4cc")
        ax.set(xlabel="Leste local · km",ylabel="Norte local · km",zlabel="Altitude · m")
        fig.savefig(out/"renders"/"ravine-detail.png",dpi=220,facecolor=fig.get_facecolor());plt.close(fig)

def render_mountains(out,tile):
    out=Path(out);e=tile["height"];initial=tile["initial"];colors=tile["colors"];meta=tile["metadata"]
    h,w=e.shape;dx,dy=meta["pixel_size_m"]
    # Inspect a 48 km window, retaining every 250 m terrain sample. This shows
    # actual incision and talus rather than a painted mountain pictogram.
    gy,gx=np.gradient(e,dy,dx);slope=np.hypot(gx,gy)
    interior=slope.copy();interior[:100]=interior[-100:]=0;interior[:,:100]=interior[:,-100:]=0
    r,c=np.unravel_index(np.argmax(interior),e.shape);half=96
    r=np.clip(r,half,h-half);c=np.clip(c,half,w-half)
    z=e[r-half:r+half,c-half:c+half]
    col=colors[r-half:r+half,c-half:c+half]
    xx,yy=np.meshgrid(np.arange(z.shape[1])*dx/1000,np.arange(z.shape[0]-1,-1,-1)*dy/1000)
    shade=LightSource(azdeg=305,altdeg=34).hillshade(z,vert_exag=2,dx=dx,dy=dy)
    face=np.clip(col*(.45+.80*shade[...,None]),0,1)
    fig=plt.figure(figsize=(15,11),facecolor="#0b1b25")
    ax=fig.add_subplot(projection="3d",facecolor="#0b1b25")
    ax.plot_surface(xx,yy,z/1000,facecolors=face,rstride=1,cstride=1,shade=False,linewidth=0,antialiased=True)
    ax.view_init(33,235);ax.set_proj_type("persp",focal_length=.85)
    relief=float(np.ptp(z));aspect_z=max(.10,2*relief/(z.shape[0]*dy))
    ax.set_box_aspect((1,1,aspect_z));ax.set(xlabel="Leste local · km",ylabel="Norte local · km",zlabel="Altitude · km")
    ax.set_title("SERRA DAS AGULHAS / VALES E CRISTAS ERODIDOS",color="#dce5d6",pad=25)
    for axis in [ax.xaxis,ax.yaxis,ax.zaxis]:axis.pane.fill=False
    fig.text(.08,.065,f"Dados reais: {dx:.0f} m por amostra · {meta['mesh_statistics']['triangle_count']:,} triângulos no maciço completo · relevo visual ×2",color="#93aeb2",fontsize=10)
    fig.savefig(out/"renders"/"mountain-detail.png",dpi=190,facecolor=fig.get_facecolor());plt.close(fig)
    fig,axes=plt.subplots(1,3,figsize=(18,7),facecolor="#0b1b25")
    for ax,data,title,cmap in zip(axes,[initial,e,initial-e],["ESTRUTURA INICIAL","APÓS EVOLUÇÃO DO RELEVO","REMOÇÃO LÍQUIDA · m"],["gist_earth","gist_earth","magma"]):
        ax.set_facecolor("#102c3e");im=ax.imshow(data,cmap=cmap);ax.set_title(title,color="#c3d8dc",fontsize=10);ax.set_xticks([]);ax.set_yticks([])
        cb=fig.colorbar(im,ax=ax,shrink=.65);cb.ax.tick_params(colors="#a2b8be",labelsize=7)
    fig.tight_layout();fig.savefig(out/"renders"/"erosion-comparison.png",dpi=180,facecolor=fig.get_facecolor());plt.close(fig)
