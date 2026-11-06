"""Georeferenced, continuous tropical ravine and open glTF detail geometry.

The same analytic incision drives the continental DEM and the local detail DEM.
Cave apertures are holes in the terrain mesh connected to actual tunnel meshes;
they are not decals or sealed cylinders placed beside an intact cliff.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
import numpy as np
from scipy.ndimage import map_coordinates


def _smoothstep(a, b, x):
    t = np.clip((x-a)/(b-a), 0., 1.)
    return t*t*(3-2*t)


def ravine_axis(y, cy, seed=741902):
    phase = (int(seed) % 977) / 977 * 2*np.pi
    u = (np.asarray(y)-cy)/36000.
    return 2100*np.sin(u*4.2+phase) + 1100*np.sin(u*9.3+.3*phase)


def ravine_width(y, cy, seed=741902):
    u = (np.asarray(y)-cy)/36000.
    return 6600*(1+.13*np.sin(8*u+.7)+.08*np.cos(17*u))


def ravine_cut(x, y, cx, cy, seed=741902):
    """Positive incision (metres), broadcastable over x/y coordinate arrays.

    Length ~72 km, irregular width 10-17 km, maximum 1,300 m. Shelf transitions
    are steep but continuous; exact vertical walls and caves live in the glTF.
    No grid size, hex boundary or random per-pixel choice enters this function.
    """
    u = (np.asarray(y)-cy)/36000.
    half_width = ravine_width(y,cy,seed)
    # Rounded fissure ends taper continuously to the unmodified tropical rim.
    end_width = np.sqrt(np.maximum(0.,1-u*u))
    d = np.abs(np.asarray(x)-cx-ravine_axis(y,cy,seed)) / np.maximum(half_width*end_width,1.)
    # Four explorable elevations separated by near-vertical continuous faces.
    # The ~6.3 km floor remains resolved by the 5 km continental DEM. A narrow
    # subpixel floor would otherwise alias to disconnected shelf dams, creating
    # artificial deep lakes despite a real graded outlet downstream.
    depth = 1300*(1-_smoothstep(.48,.55,d))
    depth += 930*(_smoothstep(.48,.55,d)-_smoothstep(.66,.72,d))
    depth += 590*(_smoothstep(.66,.72,d)-_smoothstep(.82,.87,d))
    depth += 260*(_smoothstep(.82,.87,d)-_smoothstep(.96,1.04,d))
    end = 1-_smoothstep(.83,1.,np.abs(u))
    return np.maximum(0.,depth*end)


class _GLTF:
    def __init__(self):
        self.binary = bytearray()
        self.views, self.accessors, self.meshes, self.nodes = [],[],[],[]
        self.materials = [
            {'name':'humid basalt and moss','pbrMetallicRoughness':{'baseColorFactor':[.32,.34,.25,1], 'metallicFactor':0,'roughnessFactor':.96},'doubleSided':True},
            {'name':'tropical root bark','pbrMetallicRoughness':{'baseColorFactor':[.22,.13,.055,1], 'metallicFactor':0,'roughnessFactor':1},'doubleSided':True},
            {'name':'ravine water','pbrMetallicRoughness':{'baseColorFactor':[.035,.28,.32,1], 'metallicFactor':.1,'roughnessFactor':.2},'doubleSided':True},
            {'name':'cave interior wet rock','pbrMetallicRoughness':{'baseColorFactor':[.13,.16,.135,1], 'metallicFactor':0,'roughnessFactor':.84},'doubleSided':True}
        ]

    def _accessor(self, data, accessor_type, component=5126, target=34962):
        data = np.ascontiguousarray(data)
        while len(self.binary)%4:
            self.binary.append(0)
        offset = len(self.binary)
        self.binary.extend(data.tobytes())
        view = len(self.views)
        self.views.append({'buffer':0,'byteOffset':offset,'byteLength':data.nbytes,'target':target})
        a = {'bufferView':view,'componentType':component,'count':len(data),'type':accessor_type}
        if accessor_type == 'VEC3':
            a['min'] = data.min(axis=0).astype(float).tolist()
            a['max'] = data.max(axis=0).astype(float).tolist()
        self.accessors.append(a)
        return len(self.accessors)-1

    def mesh(self, name, vertices, triangles, material=0, colors=None):
        vertices=np.asarray(vertices,dtype='<f4').reshape(-1,3)
        triangles=np.asarray(triangles,dtype='<u4').reshape(-1,3)
        # Roof clipping can make redundant terminal-fan vertices collinear.
        # Removing only zero-area faces preserves the represented surface and
        # keeps every exported primitive valid for strict glTF importers.
        edge1=vertices[triangles[:,1]]-vertices[triangles[:,0]]
        edge2=vertices[triangles[:,2]]-vertices[triangles[:,0]]
        cross=np.cross(edge1,edge2)
        triangles=triangles[np.linalg.norm(cross,axis=1)>.001]
        p={'attributes':{'POSITION':self._accessor(vertices,'VEC3')},
           'indices':self._accessor(triangles.ravel(),'SCALAR',5125,34963),'material':material}
        # Averaged area-weighted normals keep the export usable without an importer.
        normals=np.zeros_like(vertices)
        face=np.cross(vertices[triangles[:,1]]-vertices[triangles[:,0]],vertices[triangles[:,2]]-vertices[triangles[:,0]])
        for k in range(3):
            np.add.at(normals,triangles[:,k],face)
        normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
        p['attributes']['NORMAL']=self._accessor(normals.astype('<f4'),'VEC3')
        if colors is not None:
            p['attributes']['COLOR_0']=self._accessor(np.asarray(colors,dtype='<f4'),'VEC3')
        self.meshes.append({'name':name,'primitives':[p]})
        self.nodes.append({'name':name,'mesh':len(self.meshes)-1})

    def save(self,path,metadata):
        path=Path(path)
        binary_path=path.with_suffix('.bin')
        binary_path.write_bytes(self.binary)
        document={'asset':{'version':'2.0','generator':'Wildhaven continuous ravine worldgen'},
                  'scene':0,'scenes':[{'nodes':list(range(len(self.nodes)))}],
                  'nodes':self.nodes,'meshes':self.meshes,'materials':self.materials,
                  'buffers':[{'uri':binary_path.name,'byteLength':len(self.binary)}],
                  'bufferViews':self.views,'accessors':self.accessors,'extras':metadata}
        path.write_text(json.dumps(document,ensure_ascii=False,indent=2),encoding='utf-8')
        return {'mesh_count':len(self.meshes),'vertex_count':sum(self.accessors[m['primitives'][0]['attributes']['POSITION']]['count'] for m in self.meshes),
                'triangle_count':sum(self.accessors[m['primitives'][0]['indices']]['count']//3 for m in self.meshes),
                'binary_bytes':len(self.binary)}


def _tube(path, radii, sides=10):
    """Tube along an arbitrary 3D path; stable parallel-up local ring frames."""
    path=np.asarray(path,dtype=float)
    tangent=np.gradient(path,axis=0)
    tangent/=np.maximum(np.linalg.norm(tangent,axis=1,keepdims=True),1e-10)
    up=np.tile([0.,1.,0.],(len(path),1))
    up[np.abs(tangent[:,1])>.97]=[1.,0.,0.]
    side=np.cross(tangent,up)
    side/=np.linalg.norm(side,axis=1,keepdims=True)
    up=np.cross(side,tangent)
    angle=np.arange(sides)*2*np.pi/sides
    ring=side[:,None,:]*np.cos(angle)[None,:,None]+up[:,None,:]*np.sin(angle)[None,:,None]
    v=path[:,None,:]+ring*np.asarray(radii)[:,None,None]
    faces=[]
    for j in range(len(path)-1):
        for k in range(sides):
            a=j*sides+k;b=j*sides+(k+1)%sides;c=(j+1)*sides+k;d=(j+1)*sides+(k+1)%sides
            faces.extend(((a,c,b),(b,c,d)))
    return v.reshape(-1,3),np.asarray(faces,dtype=np.uint32)


def _local_watercourses(elevation, incision, xx, yy):
    """Strict terrain D8 descent, tributaries and shallow terminal pools.

    The inset deliberately retains real interior sinks: a small stream ends at a
    basin pool instead of being drawn uphill across a closed depression. This is
    distinct from the continental Priority-Flood network and its open outlet.
    """
    h,w=elevation.shape
    dx=float(xx[0,1]-xx[0,0]);dy=float(yy[0,0]-yy[1,0])
    receiver=np.full((h,w),-1,dtype=np.int32)
    gradient=np.zeros_like(elevation,dtype=float)
    indices=np.arange(h*w,dtype=np.int32).reshape(h,w)
    for dr,dc in ((-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)):
        a=(slice(max(0,-dr),min(h,h-dr)),slice(max(0,-dc),min(w,w-dc)))
        b=(slice(max(0,dr),min(h,h+dr)),slice(max(0,dc),min(w,w+dc)))
        g=(elevation[a]-elevation[b])/math.hypot(dc*dx,dr*dy)
        choose=g>gradient[a]+1e-10
        receiver[a][choose]=indices[b][choose]
        gradient[a][choose]=g[choose]
    rec=receiver.ravel();z=elevation.ravel()
    order=np.argsort(z,kind='stable')
    accumulation=np.ones(h*w,dtype=float)*dx*dy/1e6
    path_length=np.ones(h*w,dtype=np.int32)
    for i in order:
        j=rec[i]
        if j>=0:
            path_length[i]=path_length[j]+1
    for i in order[::-1]:
        j=rec[i]
        if j>=0:
            accumulation[j]+=accumulation[i]
    candidates=np.flatnonzero((incision.ravel()>350)&(accumulation>1.)&(path_length>20))
    candidates=candidates[np.argsort(-path_length[candidates],kind='stable')]
    streams=[];occupied={};sources=[]
    for source in candidates:
        row,col=divmod(int(source),w)
        if any((row-r)**2+(col-c)**2<36 for r,c in sources):
            continue
        path=[];i=int(source);join=None
        while i>=0:
            path.append(i)
            if i in occupied:
                join=occupied[i]
                break
            i=int(rec[i])
        if len(path)<10:
            continue
        rr,cc=np.divmod(np.asarray(path,dtype=int),w)
        positions=np.column_stack((xx[rr,cc],yy[rr,cc],elevation[rr,cc]+.02))
        sid=f'ravine-stream-{len(streams)+1}'
        end=int(path[-1]);er,ec=divmod(end,w)
        endpoint='confluence' if join else ('inset_boundary_outlet' if er in (0,h-1) or ec in (0,w-1) else 'interior_pool')
        streams.append({'id':sid,'cell_indices':path,'positions_m':positions.tolist(),
                        'flow_direction':'listed upstream to downstream; strict D8 bed descent',
                        'width_m':40.,'source_catchment_km2':float(accumulation[source]),
                        'downstream_stream_id':join,'ends_in':endpoint,'terminal_cell_index':end})
        for cell in path[:-1] if join else path:
            occupied[cell]=sid
        sources.append((row,col))
        if len(streams)>=10:
            break
    pools=[]
    # A pool's level stays below every adjacent sample, and the shoreline is an
    # actual bilinear DEM level contour, not a floating disc covering a hillside.
    for end in sorted({s['terminal_cell_index'] for s in streams if s['ends_in']=='interior_pool'}):
        r,c=divmod(end,w)
        neighbors=elevation[r-1:r+2,c-1:c+2].ravel()
        other=np.delete(neighbors,4)
        gap=float(other.min()-elevation[r,c])
        if gap<=.002:
            continue
        level=float(elevation[r,c]+min(2.,gap*.5))
        theta=np.arange(32)*2*np.pi/32
        rays=np.linspace(0.,max(dx,dy)*1.4,128)
        shoreline=[]
        for angle in theta:
            xr=c+np.cos(angle)*rays/dx
            yr=r+np.sin(angle)*rays/dy
            ground=map_coordinates(elevation,[yr,xr],order=1,mode='nearest')
            hits=np.flatnonzero(ground>=level)
            if not len(hits):
                break
            k=int(hits[0]);k0=max(0,k-1)
            f=(level-float(ground[k0]))/max(float(ground[k]-ground[k0]),1e-10)
            radius=float(rays[k0]+np.clip(f,0,1)*(rays[k]-rays[k0]))
            shoreline.append([float(xx[r,c]+math.cos(angle)*radius),float(yy[r,c]-math.sin(angle)*radius),level])
        if len(shoreline)==32:
            pool_id=f'ravine-pool-{len(pools)+1}'
            pools.append({'id':pool_id,'terminal_cell_index':int(end),'center_m':[float(xx[r,c]),float(yy[r,c]),level],
                          'surface_elevation_m':level,'maximum_depth_m':level-float(elevation[r,c]),
                          'shoreline_m':shoreline,'type':'shallow perched basin pool'})
            for stream in streams:
                if stream['terminal_cell_index']==end:
                    stream['pool_id']=pool_id
                    # Endpoint is exactly the receiving pool surface.
                    stream['positions_m'][-1][2]=level
                    prev=stream['positions_m'][-2][2]
                    if level>prev:
                        # The contour lies before the lowest cell: trim instead
                        # of forcing a rising final segment into the pond.
                        stream['positions_m'][-1][2]=min(level,prev)
    return streams,pools,receiver,accumulation.reshape(h,w).astype(np.float32)


def _mesh_surface_height(elevation, east, north, east0, north0, dx, dy):
    """Height on the exact two-triangle surface used by the glTF terrain."""
    h,w=elevation.shape
    col=(np.asarray(east)-east0)/dx;row=(north0-np.asarray(north))/dy
    c=np.clip(np.floor(col).astype(int),0,w-2);r=np.clip(np.floor(row).astype(int),0,h-2)
    u=np.clip(col-c,0,1);v=np.clip(row-r,0,1)
    a=elevation[r,c];b=elevation[r,c+1];cc=elevation[r+1,c];d=elevation[r+1,c+1]
    return np.where(u+v<=1,a+u*(b-a)+v*(cc-a),d+(1-u)*(cc-d)+(1-v)*(b-d))


def create_ravine(output_path, center_xy_m, config, sample_height, seed=741902):
    """Export local height data, cut cliff apertures, cave tunnels, roots, stream.

    sample_height(x,y) returns pre-incision elevations on broadcast NumPy arrays.
    glTF positions are metres in a local east/up/south frame. Translation back to
    global [east,north,elevation] is [X+cx, cy-Z, Y], documented in extras.
    Returned metadata is JSON serializable and includes every integration path.
    """
    out=Path(output_path)
    out.mkdir(parents=True,exist_ok=True)
    cx,cy=map(float,center_xy_m)
    h,w=512,256
    width,extent_h=46000.,90000.
    dx,dy=width/w,extent_h/h
    x=cx-width/2+(np.arange(w)+.5)*dx
    y=cy+extent_h/2-(np.arange(h)+.5)*dy
    xx,yy=np.meshgrid(x,y)
    base=np.asarray(sample_height(xx,yy),dtype=float)
    depth=ravine_cut(xx,yy,cx,cy,seed)
    elevation=(base-depth).astype('<f4')
    np.save(out/'ravine-heightmap.npy',elevation,allow_pickle=False)
    np.save(out/'ravine-incision.npy',depth.astype('<f4'),allow_pickle=False)
    vertices=np.column_stack(((xx-cx).ravel(),elevation.ravel(),-(yy-cy).ravel()))
    holes=[]
    caves=[]
    # Locate steep east walls at four longitudinal positions. A rectangular hole
    # in raster topology is a near-vertical aperture because this patch straddles
    # a shelf face. The tunnel starts at precisely the perimeter vertices.
    grad=np.abs(np.gradient(elevation,dx,axis=1))
    for i,offset in enumerate((-23000.,-9000.,10500.,23500.)):
        row=int(np.argmin(np.abs(y-(cy+offset))))
        east=(x>cx+ravine_axis(y[row],cy,seed)+2000)&(x<cx+11000)
        col=int(np.argmax(np.where(east,grad[row],-1)))
        r0,r1=max(2,row-3),min(h-3,row+3)
        c0,c1=max(2,col-1),min(w-3,col+1)
        holes.append((r0,r1,c0,c1))
        perimeter=[(r0,c) for c in range(c0,c1+1)]
        perimeter += [(r,c1) for r in range(r0+1,r1+1)]
        perimeter += [(r1,c) for c in range(c1-1,c0-1,-1)]
        perimeter += [(r,c0) for r in range(r1-1,r0,-1)]
        ring=vertices[[r*w+c for r,c in perimeter]].copy()
        center=ring.mean(axis=0)
        y_radius=max((ring[:,1].max()-ring[:,1].min())*.4,65.)
        z_radius=max((ring[:,2].max()-ring[:,2].min())*.43,180.)
        projected=np.column_stack(((ring[:,1]-center[1])/y_radius,(ring[:,2]-center[2])/z_radius))
        orientation=np.sign(np.sum(projected[:,0]*np.roll(projected[:,1],-1)-projected[:,1]*np.roll(projected[:,0],-1)))
        # The mouth follows a nonplanar triangulated cliff. Two vertices can
        # share Y/Z while having different X; projecting atan2 would collapse
        # them to a repeated tunnel vertex. Full 3D perimeter arclength gives
        # every mouth edge a distinct matching angular interval.
        lengths=np.linalg.norm(np.roll(ring,-1,axis=0)-ring,axis=1)
        fraction=np.r_[0.,np.cumsum(lengths[:-1])]/lengths.sum()
        phase=math.atan2(projected[0,1],projected[0,0])
        angle=phase+(orientation if orientation else 1.)*2*np.pi*fraction
        rings=[ring]
        distances=np.linspace(0,2300+300*i,17)[1:]
        for t,distance in enumerate(distances):
            progress=distance/distances[-1]
            size=1+.45*np.sin(np.pi*progress)**2
            c=center+np.array([distance,-45*progress,280*np.sin(progress*2.4)])
            next_ring=c+np.column_stack((np.zeros(len(angle)),size*y_radius*np.cos(angle),size*z_radius*np.sin(angle)))
            ground=_mesh_surface_height(elevation,next_ring[:,0]+cx,cy-next_ring[:,2],x[0],y[0],dx,dy)
            # Tunnels are beneath real rock after the shared entrance ring.
            # This also prevents a locally rising ellipse from poking through a
            # nearby shelf when the geologic background is not perfectly flat.
            # Two extra metres absorb float32/georeference rounding on cliffs.
            next_ring[:,1]=np.minimum(next_ring[:,1],ground-min(22.,distance/5))
            rings.append(next_ring)
        nv=len(ring)
        tunnel_faces=[]
        for j in range(len(rings)-1):
            for k in range(nv):
                a=j*nv+k;b=j*nv+(k+1)%nv;c=(j+1)*nv+k;d=(j+1)*nv+(k+1)%nv
                tunnel_faces.extend(((a,b,c),(b,d,c)))
        # A dedicated interior cap vertex preserves every perimeter edge, even
        # when roof clipping makes several terminal-ring vertices collinear.
        # A fan anchored on the perimeter would leave T-junction boundaries.
        cap_center=rings[-1].mean(axis=0,keepdims=True)
        cap_index=len(rings)*nv
        for k in range(nv):
            tunnel_faces.append((cap_index,(len(rings)-1)*nv+k,(len(rings)-1)*nv+(k+1)%nv))
        caves.append({'id':f'ravine-cave-{i+1}','vertices':np.concatenate(rings+[cap_center]),
                      'faces':tunnel_faces,'entrance_m':[float(center[0]+cx),float(cy-center[2]),float(center[1])],
                      'length_m':float(distances[-1]),'aperture_height_m':float(np.ptp(ring[:,1])),
                      'aperture_width_m':float(np.ptp(ring[:,2])),
                      'terrain_removed_quad_bounds_rc':[r0,r1,c0,c1],
                      'terrain_aperture_vertex_indices':[int(r*w+c) for r,c in perimeter],
                      'tunnel_mouth_vertex_indices':list(range(nv)),
                      'aperture_perimeter_world_m':[[float(v[0]+cx),float(cy-v[2]),float(v[1])] for v in ring],
                      'tunnel_ring_count':len(rings),'tunnel_ring_vertex_count':nv,
                      'end_cap_center_vertex_index':cap_index,
                      'minimum_roof_cover_after_mouth_m':20.,
                      'subterranean_floor_m':float(center[1]-y_radius-45)})
    row,col=np.meshgrid(np.arange(h-1),np.arange(w-1),indexing='ij')
    keep=np.ones((h-1,w-1),dtype=bool)
    for r0,r1,c0,c1 in holes:
        keep[r0:r1,c0:c1]=False
    a=(row*w+col)[keep];b=a+1;c=a+w;d=c+1
    faces=np.concatenate((np.column_stack((a,c,b)),np.column_stack((b,c,d))))
    # Mesh vertex colors convey humid canopy on rims and dark wet rock at depth.
    green=np.array([.23,.49,.25]);rock=np.array([.32,.34,.28]);floor=np.array([.095,.16,.13])
    f=np.clip(depth.ravel()/1300,0,1)[:,None]
    colors=green*(1-f)+rock*f
    shade=np.clip((depth.ravel()-900)/400,0,1)[:,None]
    colors=colors*(1-shade)+floor*shade
    gltf=_GLTF()
    gltf.mesh('continuous ravine terrain with open cave apertures',vertices,faces,0,colors)
    cave_meta=[]
    for cave in caves:
        gltf.mesh(cave['id'],cave.pop('vertices'),cave.pop('faces'),3)
        cave_meta.append(cave)
    # Root bundles cling to both slopes and overhang the intermediate shelves.
    rng=np.random.default_rng(int(seed)+991)
    roots=[]
    for i in range(30):
        offset=float(rng.uniform(-28000,28000))
        side=-1 if i%2 else 1
        t=np.linspace(0,1,30)
        ry=cy+offset+1800*t+260*np.sin(t*np.pi*2+i)
        axis=cx+ravine_axis(ry,cy,seed)
        rx=axis+side*(8000-5200*t)+150*np.sin(t*5+i)
        rz=np.asarray(sample_height(rx,ry))-ravine_cut(rx,ry,cx,cy,seed)+40+120*np.sin(t*np.pi)
        path=np.column_stack((rx-cx,rz,-(ry-cy)))
        radius=(42-29*t)*(1+.1*np.sin(t*30+i))
        root_vertices,root_faces=_tube(path,radius,8)
        gltf.mesh(f'giant tropical root {i+1}',root_vertices,root_faces,1)
        roots.append({'id':f'root-{i+1}','base_m':[float(rx[0]),float(ry[0]),float(rz[0])],
                      'diameter_m':float(radius[0]*2)})
    streams,pools,local_receiver,local_accumulation=_local_watercourses(elevation,depth,xx,yy)
    np.savez_compressed(out/'ravine-flow-receiver.npz',data=local_receiver)
    np.savez_compressed(out/'ravine-flow-accumulation-km2.npz',data=local_accumulation)
    for stream in streams:
        positions=np.asarray(stream['positions_m'])
        tangent=np.gradient(positions[:,:2],axis=0)
        tangent/=np.maximum(np.linalg.norm(tangent,axis=1,keepdims=True),1e-9)
        perpendicular=np.column_stack((-tangent[:,1],tangent[:,0]))*stream['width_m']/2
        vertices_water=[]
        for p,offset in zip(positions,perpendicular):
            vertices_water.extend(([p[0]-cx-offset[0],p[2],-(p[1]-cy-offset[1])],
                                   [p[0]-cx+offset[0],p[2],-(p[1]-cy+offset[1])]))
        faces_water=[]
        for i in range(len(positions)-1):
            faces_water.extend(((2*i,2*i+1,2*i+2),(2*i+1,2*i+3,2*i+2)))
        gltf.mesh(stream['id'],vertices_water,faces_water,2)
    for pool in pools:
        p=np.asarray([pool['center_m']]+pool['shoreline_m'])
        v=np.column_stack((p[:,0]-cx,p[:,2],-(p[:,1]-cy)))
        faces_pool=[(0,k+1,(k+1)%32+1) for k in range(32)]
        gltf.mesh(pool['id'],v,faces_pool,2)
    terraces=[]
    for level,name in ((.91,'upper'),(.77,'middle'),(.60,'lower')):
        ty=cy+np.linspace(-19000,19000,9)
        tx=cx+ravine_axis(ty,cy,seed)+ravine_width(ty,cy,seed)*np.sqrt(1-((ty-cy)/36000)**2)*level
        tz=np.asarray(sample_height(tx,ty))-ravine_cut(tx,ty,cx,cy,seed)
        terraces.append({'id':f'{name}-terrace','positions_m':np.column_stack((tx,ty,tz)).tolist(),
                         'use':'future traversal or subterranean creature habitat; no gameplay implemented'})
    metadata={'id':'ravine','name':'Ravina dos Devoradores','center_m':[cx,cy],
              'bounds_m':[cx-width/2,cy-extent_h/2,cx+width/2,cy+extent_h/2],
              'incision_bounds_m':[cx-11000,cy-36000,cx+11000,cy+36000],
              'maximum_incision_m':float(depth.max()),'design_depth_m':1300.,
              'length_m':72000.,'width_m':[10000.,17000.],
              'local_resolution':[h,w],'pixel_size_m':[dx,dy],
              'local_height_origin':'pixel centres; row 0 north; float32 metres ASL',
              'local_to_world':{'gltf_axes':'X east, Y up, Z south','world_east_m':'X + center_m[0]',
                                'world_north_m':'center_m[1] - Z','world_elevation_m':'Y'},
              'heightmap':'meshes/ravine/ravine-heightmap.npy',
              'incision_field':'meshes/ravine/ravine-incision.npy',
              'gltf':'meshes/ravine/ravine.gltf','binary':'meshes/ravine/ravine.bin',
              'caves':cave_meta,'terraces':terraces,'roots':roots,
              'stream':dict(streams[0],scope='Longest local D8 course; continental flow network exported separately') if streams else {'positions_m':[]},
              'streams':streams,'pools':pools,
              'local_hydrology':{'flow_receiver':'meshes/ravine/ravine-flow-receiver.npz',
                                  'flow_accumulation_km2':'meshes/ravine/ravine-flow-accumulation-km2.npz',
                                  'array_key':'data','receiver_index':'row*256+column; -1 strict descent sink',
                                  'model':'Strict D8 bed descent; small terminal pools, no fictitious uphill drainage'},
              'geometry_notes':'Terrain apertures are removed indexed faces; their exact perimeter vertices connect to cave tunnel walls. Local DEM cannot encode the caves or overhanging roots.'}
    mesh_stats=gltf.save(out/'ravine.gltf',metadata)
    metadata['mesh_statistics']=mesh_stats
    (out/'ravine-metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    # A local cut-section is numeric and can be inspected without glTF software.
    section_x=np.linspace(cx-18000,cx+18000,721)
    section_y=np.full_like(section_x,cy)
    section_base=np.asarray(sample_height(section_x,section_y))
    section_z=section_base-ravine_cut(section_x,section_y,cx,cy,seed)
    np.savetxt(out/'ravine-cross-section.csv',np.column_stack((section_x,section_y,section_z)),
               delimiter=',',header='east_m,north_m,elevation_m',comments='',fmt='%.5f')
    return metadata
