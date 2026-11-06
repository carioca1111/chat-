"""Wildhaven — first handcrafted temperate forest hex, authored geometry.
This is a *local scenic diorama* anchored to Auralis region H_5_7, not a 240-km gameplay terrain.
Outputs actual mesh glTF/GLB with vertex colors. Fixed seed, repeatable geometry.
"""
from __future__ import annotations
import json, math, random
from pathlib import Path
from collections import defaultdict
import numpy as np
import trimesh

ROOT=Path(__file__).parent
OUT=ROOT/'hex-scenes'/'H_5_7'; OUT.mkdir(parents=True,exist_ok=True)
SEED=5107; rng=random.Random(SEED)
R=101.0
COS=math.cos;SIN=math.sin;PI=math.pi
GROUPS={}
class Geometry:
 def __init__(self):self.v=[];self.f=[];self.c=[]
 def add(self,v,f,color):
  v=np.asarray(v,dtype=np.float32).reshape(-1,3)
  f=np.asarray(f,dtype=np.uint32).reshape(-1,3)
  offset=len(self.v)
  self.v.extend(v.tolist());self.f.extend((f+offset).tolist())
  col=np.asarray(color,dtype=np.uint8)
  if col.ndim==1: col=np.tile(col,(len(v),1))
  if col.shape[1]==3: col=np.c_[col,np.ones(len(v),dtype=np.uint8)*255]
  self.c.extend(col.tolist())
 def mesh(self):
  if not self.v:return None
  return trimesh.Trimesh(vertices=np.asarray(self.v),faces=np.asarray(self.f),vertex_colors=np.asarray(self.c),process=False)

def add(group,v,f,col):
 if group not in GROUPS:GROUPS[group]=Geometry()
 GROUPS[group].add(v,f,col)

def col(rgb,jitter=0):
 rgb=list(rgb)
 if jitter:
  off=rng.uniform(-jitter,jitter)
  rgb=[max(0,min(255,int(c+off))) for c in rgb]
 return rgb+[255]

# For sides: a true 6-sided horizontal hexagon, flat face along the camera front.
ANGLES=[math.radians(30+60*i) for i in range(6)]
POLY=[(R*COS(a),R*SIN(a)) for a in ANGLES]
def inside(x,z,margin=0):
 # Inward normal of each CCW edge (horizontal x, world z).
 for j in range(6):
  a=POLY[j]; b=POLY[(j+1)%6]
  cross=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])
  if cross < margin*R: return False
 return True

def rxc(z):return 3.8 + 10*math.sin((z+59)/37) + 3*math.sin((z-4)/16)

def gauss(x,z,cx,cz,sx,sz):return math.exp(-.5*((x-cx)/sx)**2-.5*((z-cz)/sz)**2)

def baseline(x,z):
 dx=x-rxc(z)
 # Sloped hills, high stony ridges in the northern/back half.
 v=3.3+.058*(95-z)
 v+=11*gauss(x,z,-51,-58,24,34)+12*gauss(x,z,55,-70,28,28)
 v+=5.5*gauss(x,z,74,-11,18,34)+4*gauss(x,z,-71,-10,20,26)
 v+=3.5*gauss(x,z,40,-39,15,21)
 v+=.6*math.sin(x*.16+math.cos(z*.075))+ .4*math.cos(z*.18+x*.10)
 # Three short river steps create actual drops and local bedrock faces.
 step=(3.9*(z<-59)+2.5*(z<-16)+1.8*(z<38))
 v+=step*math.exp(-.5*(dx/19)**2)
 return v

def terrain_y(x,z):
 dx=x-rxc(z)
 river=math.exp(-.5*(dx/(6.2+1.2*math.sin(z*.065)))**4)
 return baseline(x,z)-2.0*river

def add_box(group,pos,size,color):
 cx,cy,cz=pos; sx,sy,sz=size
 v=np.array([[cx+x*sx/2,cy+y*sy/2,cz+z*sz/2] for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],float)
 f=[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,5,1],[0,4,5],[3,2,6],[3,6,7],[1,5,6],[1,6,2],[0,3,7],[0,7,4]]
 add(group,v,f,col(color,7))

def add_prism(group,p0,p1,radius,rgba,sides=6,radius2=None):
 p0=np.asarray(p0,float);p1=np.asarray(p1,float)
 direction=p1-p0; direction=direction/np.linalg.norm(direction)
 a=np.cross(direction,[0,1,0]);
 if np.linalg.norm(a)<.01:a=np.cross(direction,[0,0,1])
 a=a/np.linalg.norm(a);b=np.cross(direction,a)
 top=radius if radius2 is None else radius2
 v=[]
 for p,r in [(p0,radius),(p1,top)]:
  for k in range(sides):v.append((p+ r*(a*COS(2*PI*k/sides)+b*SIN(2*PI*k/sides))).tolist())
 f=[]
 for k in range(sides):
  nxt=(k+1)%sides
  f.extend([[k,nxt,nxt+sides],[k,nxt+sides,k+sides]])
 for k in range(1,sides-1):f.append([0,k+1,k]);f.append([sides,sides+k,sides+k+1])
 add(group,v,f,col(rgba,5))

def add_rock(x,z,r=1,group='rocks',color=None):
 y=terrain_y(x,z)
 if color is None:color=rng.choice([(151,147,125),(164,154,127),(130,135,125),(172,163,141),(147,150,132)])
 n=7;v=[]
 for k in range(n):
  a=2*PI*k/n
  rr=r*rng.uniform(.7,1.25)
  v.append([x+rr*COS(a),y-0.25,z+rr*SIN(a)])
 for k in range(n):
  a=2*PI*k/n;rr=r*rng.uniform(.43,.68)
  v.append([x+rr*COS(a),y+r*rng.uniform(.6,1.35),z+rr*SIN(a)])
 v.append([x+rng.uniform(-.2,.2)*r,y+r*1.28,z+rng.uniform(-.2,.2)*r])
 f=[]
 for k in range(n):
  j=(k+1)%n
  f.extend([[k,j,j+n],[k,j+n,k+n],[k+n,j+n,n*2]])
 add(group,v,f,col(color,12))

def cone(group,x,y,z,r,h,colors,sides=7):
 # Layered low-polygon canopy, conical tufts.
 v=[];f=[]
 ang=rng.uniform(0,6.28)
 for k in range(sides):v.append([x+r*COS(k*2*PI/sides+ang),y,z+r*SIN(k*2*PI/sides+ang)])
 v.append([x,y+h,z])
 for k in range(sides):f.append([k,(k+1)%sides,sides])
 f.extend([[0,k+1,k] for k in range(1,sides-1)])
 add(group,v,f,col(rng.choice(colors),8))

def sphere(group,x,y,z,rx,ry,rz,color,sub=0):
 # Few triangles with round enough silhouette.
 mesh=trimesh.creation.icosphere(subdivisions=sub,radius=1)
 verts=mesh.vertices*np.array([rx,ry,rz])+np.array([x,y,z]);add(group,verts,mesh.faces,col(color,7))

PINE_COLORS=[(24,82,52),(37,101,57),(29,90,63),(59,105,47),(34,110,62),(57,118,68)]
LEAF_COLORS=[(95,147,48),(119,163,55),(140,164,57),(83,137,58),(164,171,42),(219,128,33),(226,142,35),(234,155,47)]

def pine(x,z,h=None):
 if h is None:h=rng.uniform(7,16)
 y=terrain_y(x,z)
 add_prism('trees-trunks',(x,y-.1,z),(x,y+h*.73,z),h*.067,(95,72,43),sides=6)
 cl=rng.sample(PINE_COLORS,3)
 for i in range(3):
  cone('pine-needles',x,y+h*(.22+.215*i),z,h*(.26-.035*i),h*(.36),[cl[i]],sides=7)

def broadleaf(x,z,h=None,orange=False):
 if h is None:h=rng.uniform(7,15)
 y=terrain_y(x,z);color=rng.choice(LEAF_COLORS[5:] if orange else LEAF_COLORS[:5])
 add_prism('trees-trunks',(x,y,z),(x,y+h*.66,z),h*.087,(96,70,42),sides=7)
 sphere('broadleaf-canopies',x,y+h*.72,z,h*.30,h*.27,h*.30,color,sub=1)
 for i in range(4):
  a=2*PI*i/4+rng.random();scale=rng.uniform(.14,.20)
  sphere('broadleaf-canopies',x+COS(a)*h*.20,y+h*(.70+rng.uniform(-.05,.10)),z+SIN(a)*h*.18,h*scale,h*scale*.78,h*scale,col(color[:3],18)[:3],sub=0)

def shrub(x,z,h=None):
 y=terrain_y(x,z);h=h or rng.uniform(.8,2)
 sphere('shrubs',x,y+h*.45,z,h*.8,h*.55,h*.72,rng.choice([(75,119,43),(66,135,51),(98,153,61),(108,147,51)]),sub=0)

def flower(x,z):
 y=terrain_y(x,z)
 for k in range(rng.randint(2,5)):
  xx=x+rng.uniform(-.9,.9);zz=z+rng.uniform(-.9,.9);yy=terrain_y(xx,zz)
  add_prism('wildflowers',(xx,yy,zz),(xx,yy+rng.uniform(.35,.8),zz),.035,(55,114,42),sides=4)
  sphere('wildflowers',xx,yy+.68,zz,.19,.13,.18,rng.choice([(239,222,111),(233,201,214),(234,231,220),(181,163,222)]),sub=0)

def find_spots(count,avoid,part='all',maxtries=160000):
 found=[]
 for _ in range(maxtries):
  if len(found)>=count:break
  x=rng.uniform(-98,98);z=rng.uniform(-98,98)
  if not inside(x,z,margin=7):continue
  if part=='pine' and z>73:continue
  if abs(x-rxc(z))<avoid:continue
  if ((x+63)**2+(z-29)**2)<15**2:continue # camp
  if ((x-54)**2+(z+53)**2)<15**2:continue # ruins
  if ((x-64)**2+(z+9)**2)<10**2:continue # cave
  if abs(z-11)<7 and abs(x)<32:continue # bridge
  if ((x-55)**2+(z-48)**2)<12**2:continue # pond
  if abs(z)<45 and abs(x+26)<4:continue # footpath
  found.append((x,z))
 return found

# GEOLOGY: Surface with perfect 6-sided perimeter, radial mesh filling the whole hex.
N=33;EDGE=20;SIDES=6*EDGE
verts=[[0,terrain_y(0,0),0]]
for j in range(1,N+1):
 t=j/N
 for k in range(SIDES):
  seg=k//EDGE; frac=(k%EDGE)/EDGE
  x=(POLY[seg][0]*(1-frac)+POLY[(seg+1)%6][0]*frac)*t
  z=(POLY[seg][1]*(1-frac)+POLY[(seg+1)%6][1]*frac)*t
  verts.append([x,terrain_y(x,z),z])
faces=[]
for k in range(SIDES):faces.append([0,1+k,1+(k+1)%SIDES])
for j in range(N-1):
 a=1+j*SIDES;b=a+SIDES
 for k in range(SIDES):
  l=(k+1)%SIDES
  faces.extend([[a+k,b+k,b+l],[a+k,b+l,a+l]])
colors=[]
for x,y,z in verts:
 stream=abs(x-rxc(z));hill=max(0,(y-15))
 v=(86,138,65) if y<10 else ((102,138,66) if y<18 else (134,143,92))
 if hill>9:v=(142,141,113)
 if stream<9:v=(101,122,76)
 delta=math.sin(x*.63+z*.71)*7+math.cos(x*.19-z*.41)*4
 colors.append([max(0,min(255,int(vv+delta))) for vv in v]+[255])
add('terrain',verts,faces,colors)
# Rough cliff wall with rock faceting around precisely this hex.
vert=[];fac=[];cols=[]
for i in range(SIDES):
 seg=i//EDGE; t=(i%EDGE)/EDGE
 x=POLY[seg][0]*(1-t)+POLY[(seg+1)%6][0]*t
 z=POLY[seg][1]*(1-t)+POLY[(seg+1)%6][1]*t
 y=terrain_y(x,z)
 vert.extend([[x,y-.16,z],[x,y-8-rng.uniform(-.45,.45),z]])
 cols.extend([col((133,121,97),10),col((98,90,78),7)])
for i in range(SIDES):
 ii=(i+1)%SIDES; fac.extend([[2*i,2*ii,2*ii+1],[2*i,2*ii+1,2*i+1]])
add('rocky-hex-walls',vert,fac,cols)
# Dark flat bottom.
bottom=[(x,-9,z) for x,z in POLY]
add('underside',bottom,[[0,k,k+1] for k in range(1,5)],[57,55,50,255])

# River water following geological trench. White irregular foam on both banks.
wv=[];wf=[];wc=[];foamv=[];foamf=[];foamc=[]
zs=np.linspace(-102,102,225)
for i,z in enumerate(zs):
 x=rxc(z);c=baseline(x,z)-.35
 width=5.35+.8*math.sin(z*.09)
 for side in (-1,1):
  xx=x+side*width
  # The water always rests in the channel (except engineered waterfalls).
  yy=c+(.05 if side==1 else 0)
  wv.append([xx,yy,z]);wc.append(col((15,139,169) if i%7 else (34,161,178),4))
 if i:
  k=2*i;wf.extend([[k-2,k-1,k+1],[k-2,k+1,k]])
add('river',wv,wf,wc)
# Foam bars along river edge; glints and banks; drawn on top of water.
for i in range(4,len(zs)-4,4):
 z=float(zs[i]);x=rxc(z);y=baseline(x,z)-.20
 for bank in [-1,1]:
  if rng.random()>.66:continue
  xx=x+bank*(4.6+.6*math.sin(z*.09))
  a=len(foamv)
  foamv.extend([[xx-.38,y+.09,z-.55],[xx+.35,y+.09,z-.40],[xx+.12,y+.12,z+1.25]])
  foamc.extend([col((191,233,224),7)]*3);foamf.append([a,a+1,a+2])
add('river-foam',foamv,foamf,foamc)
# Actual vertical sheets at waterfalls (top of upper channel, bottom of lower).
for i,z in enumerate([-59,-16,38]):
 x=rxc(z); upper=baseline(x,z-.25)-.35;lower=baseline(x,z+.25)-.35
 if upper-lower<.9:continue
 width=5.8
 waterfallv=[];waterfallf=[];waterfallc=[]
 steps=14
 for k in range(steps+1):
  xx=x-width+2*width*k/steps
  wob=.3*math.sin(k*2.4+i)
  waterfallv.extend([[xx,upper+.05,z-.20],[xx,lower-.30,z+.2+wob]])
  waterfallc.extend([col((74,186,208) if k%3 else (229,245,237),6),col((36,144,178) if k%4 else (222,241,229),8)])
  if k:
   n=2*k;waterfallf.extend([[n-2,n,n+1],[n-2,n+1,n-1]])
 add('waterfalls',waterfallv,waterfallf,waterfallc)
 for k in range(16):
  sx=x+rng.uniform(-width,width);sz=z+rng.uniform(.5,2.2)
  cy=lower+rng.uniform(.1,.5)
  sphere('spray',sx,cy,sz,rng.uniform(.19,.42),.06,rng.uniform(.16,.39),(208,240,233),sub=0)

# Small right-side pond.
px,pz=59,45; py=terrain_y(px,pz)+.1
vv=[[px,py,pz]];ff=[]
for k in range(25):
 a=2*PI*k/25;xx=px+9.5*COS(a);zz=pz+6*SIN(a)
 vv.append([xx,terrain_y(xx,zz)+.1,zz])
for k in range(25):ff.append([0,k+1,1+(k+1)%25])
add('pond',vv,ff,col((50,146,150)))
for k in range(35):
 a=rng.uniform(0,2*PI);rr=rng.uniform(.4,1);x=px+COS(a)*rr*9;z=pz+SIN(a)*rr*5.7
 if inside(x,z,2):
  yy=terrain_y(x,z)
  cone('reeds',x,yy,z,.11,.9,[(98,126,44),(132,142,64)],sides=4)

# Boulders, cliffs along high back and riverbanks.
for i in range(235):
 x=rng.uniform(-95,95);z=rng.uniform(-95,95)
 if not inside(x,z,5):continue
 if abs(x-rxc(z))<4.5:continue
 if (x+63)**2+(z-29)**2<14**2:continue
 add_rock(x,z,r=rng.uniform(.45,3.0) if z>-42 else rng.uniform(.7,4.0))
# steep crag framing upper waterfall.
for zz in [-83,-76,-70,-63]:
 for xx in [-36,-28,-22,29,37,47]:
  if inside(xx,zz,3):add_rock(xx+rng.uniform(-3,3),zz,r=rng.uniform(3.5,6))

# Dirt footpaths as thin winding ribbons glued to terrain.
def path(points,width=2.7):
 v=[];f=[]
 for i,p in enumerate(points):
  x,z=p
  if not inside(x,z,2):continue
  q=points[max(0,i-1)];t=points[min(len(points)-1,i+1)]
  dx=t[0]-q[0];dz=t[1]-q[1];norm=math.hypot(dx,dz);nx=-dz/norm;nz=dx/norm
  for s in [-1,1]:
   xx=x+s*nx*width/2;zz=z+s*nz*width/2
   v.append([xx,terrain_y(xx,zz)+.10,zz])
  if len(v)>2:
   j=len(v)-2;f.extend([[j-2,j-1,j+1],[j-2,j+1,j]])
 add('footpaths',v,f,col((192,151,94),7))
from scipy.interpolate import CubicSpline
def smooth(points,count=60):
 px=np.array(points,float);t=np.arange(len(points));cs0=CubicSpline(t,px[:,0]);cs1=CubicSpline(t,px[:,1]);ts=np.linspace(0,len(points)-1,count)
 return [(float(cs0(v)),float(cs1(v))) for v in ts]
path(smooth([(-88,26),(-68,26),(-43,22),(-19,14),(1,11),(23,8),(45,-12),(53,-45),(67,-51)],150),3.5)
path(smooth([(-30,18),(-35,-5),(-49,-18),(-53,-38),(-50,-58)],75),2.3)
path(smooth([(33,8),(53,23),(74,18),(82,-4)],60),2.2)

# Decorative forest pine trunks and broadleaf canopies.
for x,z in find_spots(205,10):pine(x,z,rng.uniform(6,15))
for k,(x,z) in enumerate(find_spots(48,12)):
 broadleaf(x,z,rng.uniform(7,13),orange=k%5==0)
for x,z in find_spots(220,8):shrub(x,z)
for x,z in find_spots(290,9):flower(x,z)

# Planked wooden bridge spanning river east-west, at z=11.
bz=11; bx=rxc(bz); by=terrain_y(bx-15,bz)+1.9
for i in range(24):
 x=bx-18+i*1.55
 add_box('bridge-planks',(x,by,bz),(1.43,.62,7.5),(144,92,53))
for z in [bz-4,bz+4]:
 for x in [bx-18,bx-12,bx-6,bx,bx+6,bx+12,bx+18]:
  add_prism('bridge-rails',(x,by-.2,z),(x,by+3.1,z),.24,(91,62,41),sides=5)
 for x0,x1 in zip([bx-18,bx-12,bx-6,bx,bx+6,bx+12],[bx-12,bx-6,bx,bx+6,bx+12,bx+18]):
  add_prism('bridge-rails',(x0,by+2.2,z),(x1,by+2.2,z),.16,(105,71,43),sides=5)
# Banners with simple white emblems (antlers shapes represented as lines, not texture).
for xx,zz in [(bx-17,bz-4.8),(bx+17,bz+4.8)]:
 add_prism('banners',(xx,by,zz),(xx,by+8,zz),.22,(103,68,43),sides=6)
 add('banners',[[xx,by+6.9,zz],[xx+3.3,by+6.9,zz],[xx+3.0,by+2.6,zz],[xx+.2,by+3,zz]],[[0,1,2],[0,2,3]],col((146,42,37),4))
 add_prism('banner-emblems',(xx+1.6,by+5.9,zz+.10),(xx+1.65,by+4.2,zz+.10),.055,(230,220,202),sides=4)
 for side in [-1,1]:
  add_prism('banner-emblems',(xx+1.64,by+5.9,zz+.10),(xx+1.64+side*.47,by+6.26,zz+.10),.05,(234,222,209),sides=4)

# Canvas expedition tent left foreground.
tx,tz=-65,28;ty=terrain_y(tx,tz)
# 2-sided triangular tent roof, deliberately thick enough to read in 3D.
tentv=[[tx-7,ty+.2,tz-5],[tx+7,ty+.2,tz-5],[tx,ty+6,tz-5],
       [tx-7,ty+.2,tz+5],[tx+7,ty+.2,tz+5],[tx,ty+6,tz+5]]
add('canvas-tent',tentv,[[0,1,2],[3,5,4],[0,2,5],[0,5,3],[1,4,5],[1,5,2]],col((227,201,141)))
add('tent-opening',[[tx-.2,ty+1,tz+5.07],[tx-2.4,ty+.2,tz+5.08],[tx+2.4,ty+.2,tz+5.08]],[[0,1,2]],col((62,57,47)))
for sx in [-1,1]:
 add_prism('camp-props',(tx+sx*7.2,ty,tz-5.5),(tx+sx*9,ty-.25,tz-8),.08,(127,104,70),sides=4)
for i in range(7):
 x=tx+rng.uniform(-9,9);z=tz+rng.uniform(7,11)
 add_box('camp-crates',(x,terrain_y(x,z)+.75,z),(2,1.5,1.8),(120,87,49))
# Campfire rocks and flame spears, glows are added in viewer.
fx,fz=-55,47;fy=terrain_y(fx,fz)
for k in range(12):
 a=2*PI*k/12;add_rock(fx+2.7*COS(a),fz+2.7*SIN(a),.75)
for k in range(6):
 xx=fx+rng.uniform(-.8,.8);zz=fz+rng.uniform(-.8,.8)
 cone('fire',xx,fy,zz,rng.uniform(.45,.9),rng.uniform(2.1,4.3),[(245,123,19),(255,192,49),(245,91,23)],sides=5)
# Camp banner.
xx=-80;zz=36;yy=terrain_y(xx,zz)
add_prism('banners',(xx,yy,zz),(xx,yy+9,zz),.27,(99,68,45),sides=5)
add('banners',[[xx,yy+8,zz],[xx+3.5,yy+8,zz],[xx+3.2,yy+3.8,zz],[xx+.1,yy+4.2,zz]],[[0,1,2],[0,2,3]],col((152,37,43)))

# Ruins: arched stone gate on high right terrace.
ux,uz=54,-53;uy=terrain_y(ux,uz)
for xx in [ux-5.5,ux+5.5]:
 for j in range(5):add_box('ruins',(xx,uy+1.1+j*2.2,uz),(2.7,2.2,3.0),(170,163,138))
# Curving stone arch with six wedge stones and keystone above.
for k in range(7):
 theta=PI*(k/6);x=ux+5.5*COS(theta);y=uy+10.3+4.3*SIN(theta)
 add_box('ruins',(x,y,uz),(3.15,2.3,3.2),(170,159,137))
for j,(xx,zz) in enumerate([(ux-13,uz+1),(ux+14,uz-2),(ux+12,uz+9)]):
 yy=terrain_y(xx,zz)
 add_box('ruins',(xx,yy+2.8,zz),(2.9,5.6,3.2),(153,151,133))
 add_box('ruins',(xx,yy+5.8,zz),(4,1.3,4),(175,160,135))
# Cave mouth dark elliptical opening embedded in stone circular cliff.
cx,cz=70,-2;cy=terrain_y(cx,cz)
sphere('cave-interior',cx,cy+3.7,cz-1,6.0,4.4,.75,(25,29,25),sub=1)
for k in range(11):
 a=PI*k/10;xx=cx+6.2*COS(a);zz=cz-1;yy=cy+3.3+4.7*SIN(a)
 add_rock(xx,zz,r=rng.uniform(1.4,2.7),color=(133,133,116))

# A few identifiable wildlife silhouettes, fully modeled rather than picture planes.
def deer(x,z,scale=1,antlers=True):
 yy=terrain_y(x,z);color=(140,93,48)
 sphere('wildlife',x,yy+2.1*scale,z,2*scale,1.1*scale,.83*scale,color,sub=1)
 add_prism('wildlife',(x+1.3*scale,yy+2.1*scale,z),(x+2.05*scale,yy+3.7*scale,z),.35*scale,color,sides=6)
 sphere('wildlife',x+2.27*scale,yy+3.9*scale,z,.7*scale,.46*scale,.47*scale,color,sub=0)
 for lx in [-1.2*scale,.7*scale]:
  for zz in [-.5*scale,.5*scale]:
   add_prism('wildlife',(x+lx,yy+1.35*scale,z+zz),(x+lx,yy+.1,z+zz),.12*scale,(83,65,43),sides=5)
 if antlers:
  for side in [-1,1]:
   add_prism('wildlife',(x+2.1*scale,yy+4.25*scale,z+side*.33*scale),(x+2.0*scale,yy+5.3*scale,z+side*1.3*scale),.08*scale,(117,103,66),sides=5)
   add_prism('wildlife',(x+2.0*scale,yy+5.0*scale,z+side*1.1*scale),(x+2.3*scale,yy+5.6*scale,z+side*1.15*scale),.06*scale,(117,103,66),sides=5)
for i,(x,z) in enumerate([(-46,-10),(-60,-29),(69,35),(-36,69),(35,63)]):
 deer(x,z,scale=.8+rng.random()*.15,antlers=i%2==0)
# Forest floor brush near front.
for x,z in [(-19,57),(26,66),(69,65),(-57,67)]:
 if inside(x,z,4):
  for _ in range(9):shrub(x+rng.uniform(-4,4),z+rng.uniform(-4,4),rng.uniform(.5,1.2))

scene=trimesh.Scene()
report={}
for name,geo in GROUPS.items():
 mesh=geo.mesh()
 if mesh is None or len(mesh.faces)==0:continue
 mesh.metadata['name']=name
 scene.add_geometry(mesh,node_name=name,geom_name=name)
 report[name]={'triangles':len(mesh.faces),'vertices':len(mesh.vertices)}
glb=scene.export(file_type='glb')
(OUT/'forest-temperate.glb').write_bytes(glb)
manifest={
 'schema_version':'1.0','region_id':'H_5_7','name':'Bosque das Cascatas',
 'art_direction':'Mid-poly naturalista estilizado; reproduz composição e paleta da referência visual aprovada, não reconstrução fotogramétrica.',
 'reference':'a_highly_detailed_isometric_3d_stylized_diorama_o.png',
 'region_geography':{'temperate_forest_fraction':.9081939799331104,'mean_elevation_m':175.93,'mean_temperature_c':24.60,'precipitation_mm_year':1137.16,'rivers':27,'lakes':6},
 'coordinates':{'global_region_center_m':[3533383.6474405094,2520000.0], 'local_geometry':'X leste, Y vertical, Z sul; unidade artistica ~= metro diorama','local_hex_radius':R,'world_hex_radius_m':240000,'note':'Cena artística de um setor do hex geográfico, ainda não cobre nem substitui seus 240 km de raio.'},
 'assets':{'glb':'forest-temperate.glb','progress':'../../hex-workshop/public/progress.json'},
 'elements':['terrain hexagonal 3D','margens rochosas','rio sinuoso','3 cachoeiras','ponte de madeira','bandeiras vermelhas','acampamento com barraca e fogueira','ruínas de pedra','caverna','lago pequeno','pinheiros','árvores folhosas verdes e outonais','rochas','flores','arbustos','cervos'],
 'geometry':report,'total_triangles':sum(z['triangles'] for z in report.values()),'glb_bytes':len(glb),
 'integration_status':'visual_preview_only','generated_with':'Python trimesh; asset estático GLB, sem dependência de IA na runtime.'
}
(OUT/'metadata.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print('Built',OUT,'bytes',len(glb),'triangles',manifest['total_triangles'],'meshes',len(report))
