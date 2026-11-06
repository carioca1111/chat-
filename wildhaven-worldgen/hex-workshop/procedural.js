import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {OBSERVABLE_DIAMETER_M,HEX_RADIUS,hexCorners,insideHex,signedHexDistance,clamp,lerp,smoothstep,noise2,fbm,randomSource,hash32,makeDNA,makeLandscape,createRiver,terrainSlope,pickSpecies,countBiomeSamples,validateRiver} from './geography-core.js';

/* Wildhaven Alpha 0.4 — real triangle geometry, ecological vegetation and gravity-consistent water.
   One independent scene is a 10km REPRESENTATION of its original macro-region.
   The continental generator and its 368 regions are never modified. */
export {makeDNA,OBSERVABLE_DIAMETER_M} from './geography-core.js';
export const BIOME_STYLE={
 0:{name:'Oceano',ground:0x7b908b,foliage:0x477362,forest:0,rock:0x929b87,water:0x258ba8},
 1:{name:'Floresta Temperada',ground:0x709650,foliage:0x387149,forest:1,rock:0xa7a18c,water:0x39afcf},
 2:{name:'Selva Tropical',ground:0x488452,foliage:0x217649,forest:1.38,rock:0x8c8c76,water:0x31b2c4},
 3:{name:'Taiga',ground:0x719071,foliage:0x355d4c,forest:.94,rock:0x92998d,water:0x65b1c8},
 4:{name:'Tundra',ground:0xa2ae93,foliage:0x72846c,forest:.095,rock:0xa8aaa7,water:0x84b8cf},
 5:{name:'Savana',ground:0xb1ab6e,foliage:0x7b824e,forest:.27,rock:0xb09f83,water:0x83b2b2},
 6:{name:'Pradaria',ground:0xa7b16b,foliage:0x6b874c,forest:.12,rock:0xaba68b,water:0x68afb8},
 7:{name:'Deserto Rochoso',ground:0xb49c70,foliage:0x80805c,forest:.01,rock:0xa8957e,water:0x55aebc},
 8:{name:'Pântano',ground:0x6d8859,foliage:0x426c45,forest:.51,rock:0x7d8977,water:0x5b9891},
 9:{name:'Montanhas Alpinas',ground:0x8a9481,foliage:0x496d54,forest:.23,rock:0xb2ada0,water:0x67b8d2},
 10:{name:'Manguezal',ground:0x7c9172,foliage:0x376b52,forest:.76,rock:0x8d9482,water:0x56a4a6},
 11:{name:'Floresta Luminescente',ground:0x59846c,foliage:0x447f8f,forest:.99,rock:0x85959a,water:0x54c0c9},
 12:{name:'Vale Cristalino',ground:0x96a894,foliage:0x4b8c79,forest:.18,rock:0xa8a1ba,water:0x72c5de},
 13:{name:'Pântano Micelial',ground:0x71836c,foliage:0x6b6b88,forest:.55,rock:0x8d8696,water:0x668ab1},
 14:{name:'Terras de Cinza',ground:0x66605c,foliage:0x6b5145,forest:.005,rock:0x77665f,water:0x986959},
 15:{name:'Vale Etéreo',ground:0x8d9f91,foliage:0x667e9d,forest:.25,rock:0x9b9ca9,water:0x69c3dc}
};
export function defaultSettings(region){const id=region?.id||'H_0_0';return {seed:(hash32('ART|'+id)+20051028)>>>0,trees:72,rocks:62,relief:65,detail:65,water:80,edits:[]};}
const mat=(c,opts={})=>new THREE.MeshStandardMaterial({color:c,roughness:.93,metalness:0,flatShading:true,...opts});
const deg=Math.PI/180;
const rgb=c=>{const color=new THREE.Color(c);return [color.r,color.g,color.b];};
function placeMesh(group,name,geom,material,pos){const ob=new THREE.Mesh(geom,material);ob.name=name;if(pos)ob.position.set(...pos);ob.castShadow=false;ob.receiveShadow=true;group.add(ob);return ob;}
function setPaintColor(g,color){const n=g.getAttribute('position').count,c=new Float32Array(n*3),t=rgb(color);for(let i=0;i<n;i++)c.set(t,i*3);g.setAttribute('color',new THREE.BufferAttribute(c,3));return g;}
function transformed(g,color,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0]){
 const copy=g.toNonIndexed ? (g.index?g.toNonIndexed():g.clone()):g.clone();
 const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));copy.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),q,new THREE.Vector3(...scale)));
 setPaintColor(copy,color);return copy;
}
const geoCache=new Map();
function treeGeometry(species,variant){const key=`${species}|${variant}`;if(geoCache.has(key))return geoCache.get(key);
 const rand=randomSource(hash32(key)),parts=[],crown=species==='maple'?0xa07439:species==='blueoak'?0x4792a0:species==='mushroomtree'?0x85679a:species==='dead'?null:species==='birch'?0x59835c:0x3b7848;
 const brown=species==='birch'?0xbdbba8:species==='dead'?0x68645a:0x805d3e;
 const r0=(n=.08)=>n*(.75+rand()*.6);
 function cylinder(rtop,rbot,h,x,y,z,color,edges=6,angle=0){parts.push(transformed(new THREE.CylinderGeometry(rtop,rbot,h,edges),color,[x,y,z],[1,1,1],[0,0,angle]));}
 function ball(x,y,z,rx,ry,rz,color,faces=0){parts.push(transformed(new THREE.IcosahedronGeometry(1,faces),color,[x,y,z],[rx,ry,rz],[rand()*.22,rand()*6.28,rand()*.2]));}
 function cone(x,y,z,r,h,color,edges=7){parts.push(transformed(new THREE.ConeGeometry(r,h,edges,1),color,[x,y,z],[1,1,1],[0,rand()*6.28,0]));}
 let trunk=.057,top=.66;
 if(species==='oak'||species==='banyan'||species==='mangrove')trunk=.083;
 if(species==='birch'||species==='cypress')trunk=.037;
 if(species==='dead')top=.83;
 cylinder(trunk*.6,trunk,top,0,top/2,0,brown);
 const deciduous=['oak','beech','maple','birch','wideleaf','blueoak','banyan','mangrove'];
 if(['pine','spruce','fir','cedar','cypress'].includes(species)){
  const tiers=species==='spruce'?5:species==='cedar'?3:species==='cypress'?4:4;
  const maxr=species==='cedar'?.34:species==='cypress'?.18:species==='pine'?.285:.34;
  for(let k=0;k<tiers;k++){
   const f=k/(tiers-1),size=maxr*(1-f*.72)*(1+(rand()-.5)*.25);
   cone((rand()-.5)*.025,.45+k*.126,0,size,.39*(1-f*.22),crown,6+(variant%3));
  }
  if(species==='cedar')for(let j=0;j<3;j++){const a=2*Math.PI*j/3;ball(Math.sin(a)*.23,.72,Math.cos(a)*.22,.19,.055,.18,crown);}
 }else if(species==='willow'){
  for(let j=0;j<4;j++){const a=2*Math.PI*j/4+rand()*.3,c=Math.cos(a),s=Math.sin(a),len=.20+rand()*.12;
   cylinder(.013,.023,.33,c*.11,.68,s*.11,brown,5,-c*.42);
   ball(c*len,.63-rand()*.12,s*len,.11,.22,.11,0x438161);
  }
  ball(0,.83,0,.25,.17,.25,0x4b8c66);
 }else if(species==='acacia'||species==='umbrella'){
  for(let i=0;i<3;i++){const a=i*2*Math.PI/3+rand()*.45,c=Math.cos(a),s=Math.sin(a);
   cylinder(.014,.032,.28,c*.10,.70,s*.11,brown,5,c*.5);
   ball(c*.26,.84,s*.25,.26,.075,.23,0x8c9848);
  }
  ball(0,.85,0,.30,.07,.27,0x85964a);
 }else if(species==='palm'){
  for(let i=0;i<7;i++){const a=i*2*Math.PI/7,c=Math.cos(a),s=Math.sin(a);
   ball(c*.23,.88,s*.23,.32,.025,.09,0x39825d);
  }
 }else if(species==='mushroomtree'){
  cylinder(.06,.11,.16,0,.66,0,0xb0a9a0);
  ball(0,.75,0,.41,.13,.39,0x896a9e);
 }else if(species==='dead'){
  for(let i=0;i<4;i++){const a=i*2*Math.PI/4+rand()*.1;const x=Math.cos(a)*.16,z=Math.sin(a)*.16;
   cylinder(.008,.02,.32,x*.5,.64,z*.5,0x786b58,5,.35*(i%2?1:-1));
  }
 }else if(deciduous.includes(species)){
  const wide=species==='oak'||species==='banyan'||species==='wideleaf',count=species==='birch'?5:species==='beech'?6:8;
  const spread=wide?.39:species==='birch'?.18:.29;
  for(let i=0;i<count;i++){
   const a=i*Math.PI*2/count+rand()*.31,d=spread*(.42+rand()*.7),x=Math.cos(a)*d,z=Math.sin(a)*d;
   const y=.70+(rand()-.5)*.15;
   if(i%2===0)cylinder(.01,.023,.20,x*.42,.55,z*.42,brown,5,.2);
   ball(x,y,z,.14+rand()*.095,.12+rand()*.14,.15+rand()*.10,crown);
  }
  ball(0,.82,0,wide?.28:.22,.17,.25,crown);
 }
 const merged=mergeGeometries(parts,false);for(const p of parts)p.dispose();if(!merged)throw Error('Falha ao criar árvore: '+species);
 merged.computeVertexNormals();geoCache.set(key,merged);return merged;
}
const instanceColor=(base,f=1)=>new THREE.Color(base).multiplyScalar(f);
function pushInstance(dict,key,matrix,color){let list=dict.get(key);if(!list){list=[];dict.set(key,list);}list.push([matrix,color]);}
function makeBatches(root,dict,geomFn,name){let n=0;for(const [key,items] of dict){const mesh=new THREE.InstancedMesh(geomFn(key),mat(0xffffff,{vertexColors:key.startsWith('tree')||false}),items.length);
  mesh.name=name+' '+key;mesh.castShadow=name==='Árvores';mesh.receiveShadow=true;mesh.frustumCulled=false;
  for(let i=0;i<items.length;i++){mesh.setMatrixAt(i,items[i][0]);mesh.setColorAt(i,items[i][1]);}mesh.instanceMatrix.needsUpdate=true;root.add(mesh);n+=items.length;
 }return n;}
function meshFromTriangles(root,name,v,c,idx){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));geo.setIndex(idx);geo.computeVertexNormals();return placeMesh(root,name,geo,mat(0xffffff,{vertexColors:true,side:THREE.DoubleSide}));}
function clipTriangle(points){
 let arr=points;
 const vertices=hexCorners();
 for(let k=0;k<6;k++){
  const [ax,az]=vertices[k],[bx,bz]=vertices[(k+1)%6],cross=(p)=>(bx-ax)*(p[1]-az)-(bz-az)*(p[0]-ax);
  if(!arr.length)break;
  const clipped=[];
  for(let i=0;i<arr.length;i++){
   const a=arr[i],b=arr[(i+1)%arr.length],da=cross(a),db=cross(b),ina=da>=-1e-6,inb=db>=-1e-6;
   if(ina&&inb)clipped.push(b);
   else if(ina&&!inb){const t=da/(da-db);clipped.push([lerp(a[0],b[0],t),lerp(a[1],b[1],t)]);}
   else if(!ina&&inb){const t=da/(da-db);clipped.push([lerp(a[0],b[0],t),lerp(a[1],b[1],t)]);clipped.push(b);}
  }
  arr=clipped;
 }
 return arr;
}
function addTerrainSectors(root,height,land,dna,waterQuality){
 const sectorSize=1000,steps=10,step=sectorSize/steps;let triangles=0,number=0;
 const biomeCounts={};
 for(let ix=-5;ix<5;ix++)for(let iz=-5;iz<5;iz++){
  const x0=ix*sectorSize,z0=iz*sectorSize,v=[],cols=[],faces=[];
  function addPoint(x,z){const y=height(x,z),wet=waterQuality?.sample(x,z),b=land.biomeAt(x,z,y);
   const colA=new THREE.Color((BIOME_STYLE[b.id]||BIOME_STYLE[1]).ground);
   if(b.other!=null&&b.blend>.12){const colB=new THREE.Color((BIOME_STYLE[b.other]||BIOME_STYLE[1]).ground);colA.lerp(colB,clamp(1-b.blend,0,.9));}
   const slope=terrainSlope(height,x,z,100);const rockiness=clamp((slope-.2)/.65,0,1);
   colA.lerp(new THREE.Color((BIOME_STYLE[b.id]||BIOME_STYLE[1]).rock),rockiness*.7);
   if(wet&&wet.distance<wet.halfWidth*1.75)colA.lerp(new THREE.Color(0x817f68),.35);
   const light=clamp(.92+.10*noise2(x/140,z/140,dna.seed+807),.78,1.1);colA.multiplyScalar(light);
   const j=v.length/3;v.push(x,y,z);cols.push(colA.r,colA.g,colA.b);return j;
  }
  function triangle(a,b,c){const poly=clipTriangle([a,b,c]);if(poly.length<3)return;
   const index0=addPoint(...poly[0]);for(let i=1;i<poly.length-1;i++){
    const index1=addPoint(...poly[i]),index2=addPoint(...poly[i+1]);
    faces.push(index0,index1,index2);triangles++;
   }
  }
  for(let x=0;x<steps;x++)for(let z=0;z<steps;z++){
   const ax=x0+x*step,az=z0+z*step,bx=ax+step,bz=az+step;
   const centers=[[ax,az],[bx,az],[ax,bz],[bx,bz]];
   if(!centers.some(([a,b])=>insideHex(a,b))&&!insideHex((ax+bx)/2,(az+bz)/2))continue;
   triangle(centers[0],centers[2],centers[1]);triangle(centers[1],centers[2],centers[3]);
  }
  if(faces.length){meshFromTriangles(root,`Setor terreno ${ix}_${iz}`,v,cols,faces);number++;}
 }
 return {sectors:number,terrainTriangles:triangles,sectorSize_m:sectorSize};
}
function addBorder(root,height,rockColor){const p=hexCorners(),samples=24,v=[],c=[],f=[];
 const col=rgb(rockColor);for(let i=0;i<6;i++){const a=p[i],b=p[(i+1)%6];for(let k=0;k<samples;k++){
  const t=k/samples,x=lerp(a[0],b[0],t),z=lerp(a[1],b[1],t),top=height(x,z),bottom=-390;
  const s=v.length/3;v.push(x,top,z,x,bottom,z);c.push(...col,...col);
  if(s>=2)f.push(s-2,s-1,s,s-1,s+1,s);
 }}
 const xa=p[0][0],za=p[0][1],top=height(xa,za);const q=v.length/3;v.push(xa,top,za,xa,-390,za);c.push(...col,...col);f.push(q-2,q-1,q,q-1,q+1,q);
 meshFromTriangles(root,'Contorno rochoso',v,c,f);
}
function makeRiverMesh(root,river,style){if(!river)return;
 const verts=[],idx=[],colors=[];const col=rgb(style.water);
 for(let i=0;i<river.path.length;i++){
  const p=river.path[i],a=river.path[Math.max(i-1,0)],b=river.path[Math.min(i+1,river.path.length-1)];
  const dx=b.x-a.x,dz=b.z-a.z,norm=Math.hypot(dx,dz)||1,nx=-dz/norm,nz=dx/norm;
  for(const side of [-1,1]){let x=p.x+nx*p.halfWidth*side,z=p.z+nz*p.halfWidth*side;
   if(!insideHex(x,z,1)){x=p.x+nx*p.halfWidth*.55*side;z=p.z+nz*p.halfWidth*.55*side;}
   verts.push(x,p.waterY+.13,z);colors.push(...col);
  }
  if(i>0){const k=i*2;idx.push(k-2,k-1,k,k-1,k+1,k);}
 }
 const water=meshFromTriangles(root,'Rio real: downhill',verts,colors,idx);water.material=mat(0xffffff,{vertexColors:true,roughness:.34,metalness:0,transparent:true,opacity:.9,side:THREE.DoubleSide});water.userData.waterProfile=river.path.map(p=>p.waterY);
 return water;
}
function planPond(height,dna){if(!dna.hasPond)return null;
 const rng=randomSource(dna.seed+49);let best={x:0,z:0,y:Infinity};
 for(let i=0;i<60;i++){const x=(rng()-.5)*3500,z=(rng()-.5)*3500;if(!insideHex(x,z,500))continue;const y=height(x,z);if(y<best.y)best={x,z,y};}
 return {x:best.x,z:best.z,radius:160+100*rng(),level:best.y-.6};
}
function carvePond(height,pond){if(!pond)return height;
 return (x,z)=>{const d=Math.hypot(x-pond.x,z-pond.z),t=d/pond.radius;
  if(t>1.25)return height(x,z);
  const bed=pond.level-2.8+Math.max(0,t-.78)*10;
  return lerp(height(x,z),Math.min(height(x,z),bed),smoothstep((1.25-t)/.47));
 };
}
function makePond(root,pond,style){if(!pond)return null;
 const p=[],index=[],N=48;
 p.push(pond.x,pond.level,pond.z);
 for(let i=0;i<=N;i++){const a=i*2*Math.PI/N,x=pond.x+pond.radius*Math.cos(a),z=pond.z+pond.radius*Math.sin(a);p.push(x,pond.level,z);if(i>0)index.push(0,i,i+1);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setIndex(index);geo.computeVertexNormals();
 placeMesh(root,'Lagoa ecológica',geo,mat(style.water,{roughness:.42,side:THREE.DoubleSide,transparent:true,opacity:.86}));return pond;
}
function addOutcropsAndRocks(root,height,land,river,style,settings,rng,edits){
 const varieties=[new THREE.DodecahedronGeometry(1,0),new THREE.IcosahedronGeometry(1,0),new THREE.CylinderGeometry(.52,.88,1,6)];
 const rockMap=new Map();const base=style.rock,meta=[];
 function rock(x,z,r=5,wet=false){const footprint=r*1.4+10;if(!insideHex(x,z,footprint))return;
  const y=height(x,z),dummy=new THREE.Object3D();dummy.position.set(x,y+r*.16,z);dummy.rotation.set((rng()-.5)*.32,rng()*Math.PI*2,(rng()-.5)*.31);
  dummy.scale.set(r*(.72+rng()*.6),r*(.35+rng()*.55),r*(.65+rng()*.8));dummy.updateMatrix();
  const i=Math.floor(rng()*varieties.length),color=instanceColor(base,wet?.74:.79+rng()*.36);
  pushInstance(rockMap,'rock'+i,dummy.matrix.clone(),color);meta.push({x,z,r,footprint});
 }
 const count=Math.floor(110+(settings.rocks??62)*8.3);let attempts=0;
 while(meta.length<count&&attempts++<count*13){
  const x=(rng()-.5)*10000,z=(rng()-.5)*10000;if(!insideHex(x,z,42))continue;
  const s=terrainSlope(height,x,z,85),n=noise2(x/350,z/350,land.dna.seed+96);
  const geoBias=clamp((s-.18)*1.9+Math.max(0,n)*.3,0,.96),isMount=[9,7,14].includes(land.dna.main);
  if(rng()>geoBias*(isMount?1.45:1.0)+.045)continue;
  const near=river?.sample(x,z),wet=!!near&&near.distance<near.halfWidth*2.5;
  if(near&&near.distance<near.halfWidth*.8)continue;
  rock(x,z,3+rng()*(s>.50?25:14),wet);
 }
 // A rocky riverbank is a geomorphological feature, not a bridge or building.
 if(river)for(const p of river.path){if(rng()<.34)continue;const n=river.sample(p.x,p.z)?.direction||[1,0],norm=Math.hypot(...n)||1;
  const nx=-n[1]/norm,nz=n[0]/norm;
  for(const side of [-1,1])if(rng()<.70){const dist=p.halfWidth*(1.3+rng()*.7),x=p.x+nx*dist*side,z=p.z+nz*dist*side;
   rock(x,z,3+rng()*11,true);
  }
 }
 for(const e of edits||[]){if(e.tool==='add-rock')rock(e.x,e.z,clamp(e.radius/14,3,65),false);}
 for(const [key,items] of rockMap){const i=Number(key.slice(4)),mesh=new THREE.InstancedMesh(varieties[i],mat(0xffffff),items.length);mesh.name=`Rochas mid-poly ${i}`;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
  items.forEach(([mx,col],j)=>{mesh.setMatrixAt(j,mx);mesh.setColorAt(j,col);});mesh.instanceMatrix.needsUpdate=true;root.add(mesh);
 }
 return {count:meta.length,placements:meta};
}
function addVegetation(root,height,land,river,pond,settings,rng,edits){
 const treeMap=new Map(),object=new THREE.Object3D(),positions=[],stats={};const spread=land.dna.main===0?0:BIOME_STYLE[land.dna.main]?.forest??.25;
 const goal=Math.floor((settings.trees??72)*125*clamp(spread,.05,1.25));
 const occupied=new Map(),cell=36;const key=(x,z)=>`${Math.floor(x/cell)},${Math.floor(z/cell)}`;
 function good(x,z,min){const ix=Math.floor(x/cell),iz=Math.floor(z/cell);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of occupied.get(`${ix+dx},${iz+dz}`)||[]){if(Math.hypot(p.x-x,p.z-z)<Math.max(p.r,min))return false;}
  return true;
 }
 function addTree(x,z,forced=null){const biome=land.biomeAt(x,z).id,sty=BIOME_STYLE[biome]||BIOME_STYLE[1];
  if(sty.forest<=0)return false;
  const species=forced||pickSpecies(biome,rng,!!river?.sample(x,z));const tall=clamp(16+rng()*27,11,53),crowngirth=species==='oak'||species==='wideleaf'||species==='banyan'? .48:.36;
  const bound=tall*crowngirth+5;if(!insideHex(x,z,bound+4)||!good(x,z,Math.max(16,tall*.42)))return false;
  if(terrainSlope(height,x,z,35)>1.05)return false;
  const w=river?.sample(x,z);if(w&&w.distance<w.halfWidth+bound+7)return false;
  if(pond&&Math.hypot(x-pond.x,z-pond.z)<pond.radius+bound+5)return false;
  for(const e of edits||[]){if(e.tool==='remove-tree'&&Math.hypot(x-e.x,z-e.z)<e.radius)return false;}
  const variant=Math.floor(rng()*3),y=height(x,z);
  object.position.set(x,y,z);object.rotation.set(0,rng()*Math.PI*2,0);object.scale.set(tall*(.86+rng()*.22),tall,tall*(.86+rng()*.22));object.updateMatrix();
  pushInstance(treeMap,`tree:${species}:${variant}`,object.matrix.clone(),new THREE.Color().setRGB(.84+rng()*.22,.84+rng()*.21,.84+rng()*.17));
  const k=key(x,z),arr=occupied.get(k)||[];arr.push({x,z,r:tall*.43});occupied.set(k,arr);positions.push({x,z,r:bound,species});stats[species]=(stats[species]||0)+1;return true;
 }
 let attempts=0;
 while(positions.length<goal&&attempts++<goal*12){
  const x=(rng()-.5)*10000,z=(rng()-.5)*10000;if(!insideHex(x,z,35))continue;
  const biome=land.biomeAt(x,z).id,forest=BIOME_STYLE[biome]?.forest||0;
  const density=clamp(forest*.75+.32*noise2(x/740,z/740,land.dna.seed+167)-.05,0,1);
  if(rng()>density)continue;
  addTree(x,z);
 }
 for(const e of edits||[]){if(e.tool==='add-tree'&&insideHex(e.x,e.z,e.radius))addTree(e.x,e.z,'oak');}
 const material=mat(0xffffff,{vertexColors:true,roughness:.93});
 for(const [key,items] of treeMap){const [,species,variant]=key.split(':');const mesh=new THREE.InstancedMesh(treeGeometry(species,Number(variant)),material,items.length);
  mesh.name=`Árvores ${species} variante ${variant}`;mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false;
  items.forEach(([mx,col],j)=>{mesh.setMatrixAt(j,mx);mesh.setColorAt(j,col);});mesh.instanceMatrix.needsUpdate=true;root.add(mesh);
 }
 const foliageBatch=new Map();const flowers=Math.floor(260+(settings.detail??65)*26);
 for(let k=0;k<flowers;k++){
  const x=(rng()-.5)*10000,z=(rng()-.5)*10000;if(!insideHex(x,z,10))continue;
  const water=river?.sample(x,z);if(water&&water.distance<water.halfWidth+5)continue;
  if(terrainSlope(height,x,z)>1.1)continue;
  const y=height(x,z),r=1.3+rng()*2.8;object.position.set(x,y+.75,z);object.scale.set(r,.5+rng()*2.5,r);object.rotation.y=rng()*Math.PI*2;object.updateMatrix();
  const biome=land.biomeAt(x,z).id,c=biome===1?(rng()<.5?0x86a85c:0xc5b270):BIOME_STYLE[biome]?.foliage||0x508050;
  pushInstance(foliageBatch,'shrub',object.matrix.clone(),new THREE.Color(c));
 }
 makeBatches(root,foliageBatch,()=>new THREE.IcosahedronGeometry(1,0),'Sub-bosque');
 return {trees:positions.length,treeSpecies:Object.keys(stats).length,species:stats,treePositions:positions,flowers:foliageBatch.get('shrub')?.length||0};
}
export function buildHexScene(region,settings={}){
 const cfg={...defaultSettings(region),...settings};for(const k of ['trees','rocks','relief','detail','water'])cfg[k]=clamp(Number(cfg[k]??50),0,100);
 cfg.seed=(Number(cfg.seed)||1)>>>0;cfg.edits=Array.isArray(settings.edits)?settings.edits.slice(0,300):[];
 const land=makeLandscape(region,cfg),dna=land.dna,style=BIOME_STYLE[dna.main]||BIOME_STYLE[1];
 const river=createRiver(land,cfg),originalHeight=river?river.groundHeight:land.baseHeight;
 const pondPlan=river?null:planPond(originalHeight,dna),height=carvePond(originalHeight,pondPlan);
 if(!validateRiver(river))throw Error('Geometria hidrológica inválida: água ascendente ou fora da região');
 const root=new THREE.Group();root.name=`Wildhaven_${dna.id}_10km`;
 root.userData={region:dna.id,observable_diameter_m:10000,geography:dna,riverProfile:river?.path.map(p=>[p.x,p.z,p.waterY])||[],preview:true,approved:false};
 const sectors=addTerrainSectors(root,height,land,dna,river);
 addBorder(root,height,style.rock);
 makeRiverMesh(root,river,style);
 const pond=makePond(root,pondPlan,style);
 const rng=randomSource(hash32(dna.id+'|ART|'+cfg.seed));
 const rocks=addOutcropsAndRocks(root,height,land,river,style,cfg,rng,cfg.edits);
 const plants=addVegetation(root,height,land,river,pond,cfg,rng,cfg.edits);
 const biomeSamples=countBiomeSamples(land,450),stats={seed:cfg.seed,region:dna.id,archetype:dna.archetype,biomes:biomeSamples,
  trees:plants.trees,treeSpecies:plants.treeSpecies,species:plants.species,rocks:rocks.count,flowers:plants.flowers,hasRiver:!!river,hasPond:!!pond,
  bridges:0,camps:0,ruins:0,waterSegments:river?.path.length||0,waterDrop_m:river?river.path[0].waterY-river.path.at(-1).waterY:0,
  observableDiameterMeters:OBSERVABLE_DIAMETER_M,scenicDiameterUnits:OBSERVABLE_DIAMETER_M,sectors:sectors.sectors,sectorSizeMeters:sectors.sectorSize_m,
  terrainTriangles:sectors.terrainTriangles,generated:true};
 root.userData.stats=stats;
 root.userData.boundsReport={trees:plants.treePositions.every(t=>insideHex(t.x,t.z,t.r+4)),rocks:rocks.placements.every(r=>insideHex(r.x,r.z,r.footprint)),river:validateRiver(river)};
 return {group:root,settings:cfg,stats,biome:style,dna,hasRiver:!!river,groundHeight:height,river};
}