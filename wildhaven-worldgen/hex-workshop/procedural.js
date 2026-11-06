import * as THREE from 'three';

// Wildhaven Hex Factory: deterministic, editable PREVIEW GEOMETRY (not a scientific
// resampling of Auralis' raster). World fields select the biome and hydrology.
export const BIOME_STYLE = {
  0: {name:'Oceano',ground:0x6d8f7a, foliage:0x477362, forest:0.06, rock:0x929b87,water:0x258ba8},
  1: {name:'Floresta temperada',ground:0x689852,foliage:0x366c42,forest:1,rock:0xa6a08d,water:0x35aed0},
  2: {name:'Selva tropical',ground:0x3f8650,foliage:0x196c46,forest:1.25,rock:0x858d77,water:0x2aaac2},
  3: {name:'Taiga',ground:0x668464,foliage:0x2c5747,forest:0.95,rock:0x919998,water:0x67b9d0},
  4: {name:'Tundra',ground:0x93a58f,foliage:0x667d66,forest:0.13,rock:0xa6aeb1,water:0x84b8cf},
  5: {name:'Savana',ground:0x9c9d5a,foliage:0x687743,forest:0.34,rock:0xaaa084,water:0x83b2b2},
  6: {name:'Pradaria',ground:0x9da967,foliage:0x617b47,forest:0.16,rock:0xaba68b,water:0x68afb8},
  7: {name:'Deserto rochoso',ground:0xb49c70,foliage:0x80805c,forest:0.03,rock:0xac967c,water:0x55aebc},
  8: {name:'Pântano',ground:0x567d55,foliage:0x3f6741,forest:0.5,rock:0x7d8977,water:0x5b9891},
  9: {name:'Montanha alpina',ground:0x858e78,foliage:0x456b50,forest:0.2,rock:0xb2ada0,water:0x67b8d2},
  10: {name:'Manguezal',ground:0x688c69,foliage:0x376b52,forest:0.67,rock:0x8d9482,water:0x56a4a6},
  11: {name:'Floresta luminescente',ground:0x527a67,foliage:0x447f8f,forest:1.06,rock:0x83959c,water:0x54c0c9},
  12: {name:'Vale cristalino',ground:0x879d88,foliage:0x4b8c79,forest:0.21,rock:0xa8a1ba,water:0x72c5de},
  13: {name:'Pântano micelial',ground:0x637b66,foliage:0x6b6b88,forest:0.65,rock:0x8d8696,water:0x668ab1},
  14: {name:'Terras de Cinza',ground:0x57514f,foliage:0x6b5145,forest:0.015,rock:0x77665f,water:0x986959},
  15: {name:'Vale Etéreo',ground:0x788c83,foliage:0x667e9d,forest:0.25,rock:0x9b9ca9,water:0x69c3dc},
};

const R = 101;
const clamp = THREE.MathUtils.clamp;
const smooth = (a,b,t)=>a+(b-a)*t;
function mulberry(seed){let s=seed>>>0;return ()=>{s+=0x6d2b79f5;let t=Math.imul(s^(s>>>15),1|s);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
function hexContains(x,z,pad=0){
  const a=R-pad;
  return Math.abs(z)<=a && Math.abs(x)*Math.sqrt(3)+Math.abs(z)<=a*2;
}
function marker(a){return a*Math.PI/180;}
function topLandBiome(region){const all=region?.biomes||[];const top=all.reduce((m,b)=>b.fraction>m.fraction?b:m,{id:0,fraction:-1});return top.id;}
export function defaultSettings(region){return {seed:(20051028 + (region?.axial?.q||0)*7529 + (region?.axial?.r||0)*16939)>>>0,trees:70,rocks:68,relief:65,detail:65,water:80};}
function makeMat(color,roughness=1){return new THREE.MeshStandardMaterial({color,roughness,metalness:0,flatShading:true});}
function tint(hex,factor){const c=new THREE.Color(hex);c.multiplyScalar(factor);return c;}
function addBox(group,x,y,z,sx,sy,sz,color,rot=0){
 const obj=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),makeMat(color,.91));obj.position.set(x,y,z);obj.rotation.y=rot;obj.castShadow=true;obj.receiveShadow=true;group.add(obj);return obj;
}
function addColumn(group,x,z,h,color,ground){
 const ob=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.55,h,6),makeMat(color));ob.position.set(x,ground+h/2,z);ob.castShadow=true;group.add(ob);return ob;
}
function meshFromTris(vertices,colors,indices,material){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
 return new THREE.Mesh(g,material);
}
function asVertexColor(color){const c=new THREE.Color(color);return [c.r,c.g,c.b];}
function safeFilename(str){return String(str).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64);}
export function buildHexScene(region, settings={}){
 const cfg={...defaultSettings(region),...settings};
 cfg.seed=(Number(cfg.seed)||1)>>>0;
 for(const key of ['trees','rocks','relief','detail','water']) cfg[key]=clamp(Number(cfg[key])||0,0,100);
 const rng=mulberry(cfg.seed),rnd=(lo,hi)=>smooth(lo,hi,rng());
 const primary=topLandBiome(region),style=BIOME_STYLE[primary]||BIOME_STYLE[1];
 const worldRivers=Array.isArray(region?.rivers)?region.rivers.length:0;
 const hasRiver=primary!==0&&worldRivers>0&&cfg.water>0;
 const isOcean=primary===0;
 const terrainMat=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.99,side:THREE.DoubleSide});
 const root=new THREE.Group();root.name=`Wildhaven_${safeFilename(region?.id||'unknown')}`;
 root.userData={id:region?.id,seed:cfg.seed,preview:true,biome_id:primary,observable_diameter_m:2000};
 const flowPhase=rnd(-10,10);
 function riverX(z){return 7*Math.sin((z+flowPhase)/29)+11*Math.sin((z+flowPhase*2)/57+.45);}
 const ridgeAngle=rnd(-1.5,1.5);
 const bumpA={x:rnd(-58,-36),z:rnd(-42,-15),sx:rnd(22,35),sz:rnd(24,36),a:rnd(7,13)};
 const bumpB={x:rnd(29,62),z:rnd(17,53),sx:rnd(18,28),sz:rnd(24,34),a:rnd(9,16)};
 const mountain=(primary===9||primary===14?2.2:1);
 const relief=.4+cfg.relief/70;
 function baseHeight(x,z){
  const gauss=(b)=>b.a*Math.exp(-.5*((x-b.x)/b.sx)**2-.5*((z-b.z)/b.sz)**2);
  const ridge=Math.max(0, .55*x*Math.cos(ridgeAngle)-.25*z*Math.sin(ridgeAngle)+10);
  const texture=1.9*Math.sin(x*.125+z*.07+cfg.seed*.0001)+1.3*Math.sin(z*.17-x*.05)+.8*Math.sin(x*.31+z*.23);
  const cascade=hasRiver?(z>-28?3.9:0)+(z>32?3.5:0):0;
  return (3.1+gauss(bumpA)+gauss(bumpB)+ridge*.22+texture+cascade)*relief*mountain;
 }
 function groundHeight(x,z){
  const dx=Math.abs(x-riverX(z));
  const channel=hasRiver ? 4.1*Math.exp(-Math.pow(dx/13.5,4)) : 0;
  return baseHeight(x,z)-channel;
 }
 function slope(x,z){return Math.hypot((groundHeight(x+2,z)-groundHeight(x-2,z))/4,(groundHeight(x,z+2)-groundHeight(x,z-2))/4);}
 // A radial hex mesh guarantees a precise hexagonal silhouette without terrain cut seams.
 const segments=6*24,rings=39;
 const points=[],cols=[],faces=[],outer=[];
 const groundColor=new THREE.Color(style.ground);
 function pushPoint(x,y,z){points.push(x,y,z);const factor=clamp(.91+Math.sin(x*.23+z*.17)*.06+(y-8)*.004,.70,1.16);const color=groundColor.clone().multiplyScalar(factor);cols.push(color.r,color.g,color.b);}
 pushPoint(0,groundHeight(0,0),0);
 const hexCorners=Array.from({length:6},(_,i)=>{const a=marker(30+i*60);return [R*Math.cos(a),R*Math.sin(a)];});
 for(let ring=1;ring<=rings;ring++){
  const f=ring/rings;
  for(let s=0;s<segments;s++){
   const side=Math.floor(s/24),t=(s%24)/24;const v1=hexCorners[side],v2=hexCorners[(side+1)%6];
   const x=f*smooth(v1[0],v2[0],t),z=f*smooth(v1[1],v2[1],t);
   pushPoint(x,groundHeight(x,z),z);
   if(ring===rings)outer.push([x,z]);
  }
 }
 for(let s=0;s<segments;s++)faces.push(0,1+((s+1)%segments),1+s);
 for(let ring=2;ring<=rings;ring++)for(let s=0;s<segments;s++){
  const a=1+(ring-2)*segments+s,b=1+(ring-2)*segments+(s+1)%segments;
  const c=1+(ring-1)*segments+s,d=1+(ring-1)*segments+(s+1)%segments;
  faces.push(a,b,c,b,d,c);
 }
 const terrain=meshFromTris(points,cols,faces,terrainMat);terrain.name='Terreno real: malha hexagonal';terrain.receiveShadow=true;root.add(terrain);
 // Hex edges and underside are genuine mesh, not a flat painted texture.
 const wallV=[],wallC=[],wallI=[];const rockSide=new THREE.Color(style.rock);
 for(let i=0;i<outer.length;i++){
  const [x,z]=outer[i],y=groundHeight(x,z),base=-13; const col=rockSide.clone().multiplyScalar(.78+.12*Math.sin(i*.4));
  wallV.push(x,y,z,x,base,z);for(let k=0;k<2;k++)wallC.push(col.r,col.g,col.b);
  const a=i*2,b=((i+1)%outer.length)*2;wallI.push(a,b,a+1,b,b+1,a+1);
 }
 const side=meshFromTris(wallV,wallC,wallI,terrainMat);side.name='Bordas rochosas do hexágono';root.add(side);
 const baseMat=makeMat(0x434b3d);const underside=new THREE.Mesh(new THREE.CylinderGeometry(87,87,1,6),baseMat);underside.rotation.y=Math.PI/6;underside.position.y=-13.1;root.add(underside);
 // Hydrology: true water strips following a depressed riverbed, falls across steps.
 let waterMesh=null;
 if(hasRiver){
  const waterMat=new THREE.MeshStandardMaterial({color:style.water,roughness:.27,metalness:0,transparent:true,opacity:.88,side:THREE.DoubleSide,emissive:style.water,emissiveIntensity:.075});
  const vertices=[],indices=[];const n=200,half=10.8;
  for(let i=0;i<=n;i++){
   const z=smooth(-96,96,i/n),x=riverX(z),y=baseHeight(x,z)-2.05;
   vertices.push(x-half,y,z,x+half,y,z);
   if(i<n)indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
  waterMesh=new THREE.Mesh(g,waterMat);waterMesh.name='Rio 3D (trajetória cênica)';root.add(waterMesh);
  const foamMat=new THREE.MeshStandardMaterial({color:0xdaf8f2,transparent:true,opacity:.68,roughness:.55,side:THREE.DoubleSide});
  for(const z of [-28,32]){
   if(!hexContains(riverX(z),z,15))continue;
   const x=riverX(z),start=baseHeight(x,z+.5)-2.1,end=baseHeight(x,z-2)-2.1;
   const h=Math.abs(start-end)+3;
   const fall=new THREE.Mesh(new THREE.BoxGeometry(half*1.8,h,.56),waterMat.clone());
   fall.position.set(x,Math.min(start,end)+h*.5,z);fall.rotation.x=.09;fall.name='Cachoeira geométrica';root.add(fall);
   addBox(root,x,Math.min(start,end)+.8,z-2,half*1.85,.25,2.6,0xc8ede9);
  }
  for(let i=0;i<60;i++){
   const z=rnd(-89,89),x=riverX(z)+rnd(-8,8),y=baseHeight(x,z)-1.83;
   const ob=new THREE.Mesh(new THREE.PlaneGeometry(rnd(.8,3.4),rnd(.05,.22)),foamMat);ob.rotation.x=-Math.PI/2;ob.position.set(x,y,z);root.add(ob);
  }
 }
 const rockMatrices=[],rockColors=[];
 function addRock(x,z,r=2,wet=false){
  if(!hexContains(x,z,4))return;
  const y=groundHeight(x,z)-.2+r*.32;
  const dummy=new THREE.Object3D();dummy.position.set(x,y,z);dummy.rotation.set(rnd(-.2,.2),rnd(0,6.28),rnd(-.26,.26));
  dummy.scale.set(r*rnd(.65,1.45),r*rnd(.42,.94),r*rnd(.6,1.48));dummy.updateMatrix();rockMatrices.push(dummy.matrix.clone());
  rockColors.push(tint(style.rock,wet?rnd(.66,.89):rnd(.77,1.20)));
 }
 // Exposed rock on steep slopes and descending terraces.
 const cliffAttempts=Math.floor((190+cfg.rocks*2.5)*relief);
 for(let i=0;i<cliffAttempts;i++){
  const x=rnd(-88,88),z=rnd(-88,88);if(!hexContains(x,z,7))continue;
  const s=slope(x,z),p=clamp((s-.31)*1.8,0,.96);
  if(rng()<p || (primary===9&&rng()<.45))addRock(x,z,rnd(1.3,4.6),false);
 }
 if(hasRiver)for(let i=0;i<Math.floor(cfg.rocks*5.2);i++){
  const z=rnd(-86,86),bank=(rng()<.5?-1:1);const x=riverX(z)+bank*rnd(11,22);
  addRock(x,z,rnd(.8,3.7),Math.abs(x-riverX(z))<15);
 }
 for(let i=0;i<cfg.rocks*2;i++)addRock(rnd(-92,92),rnd(-90,90),rnd(.6,2.5));
 const rockGeo=new THREE.DodecahedronGeometry(1,0),rockMat=makeMat(0xffffff);
 if(rockMatrices.length){const rocks=new THREE.InstancedMesh(rockGeo,rockMat,rockMatrices.length);rocks.name='Rochas reais instanciadas';rocks.castShadow=true;rocks.receiveShadow=true;rockMatrices.forEach((m,i)=>{rocks.setMatrixAt(i,m);rocks.setColorAt(i,rockColors[i]);});rocks.instanceMatrix.needsUpdate=true;root.add(rocks);}
 // Natural tree clusters with the same geometry reused in every forest hex.
 const treeCount=Math.floor((15+cfg.trees*3.35)*style.forest);
 const trunkM=[],trunkC=[],pineM=[],pineC=[],leafM=[],leafC=[],shrubM=[],shrubC=[];
 function instanceMatrix(target,colors,geoName,x,y,z,sx,sy,sz,color,rotation=0){
  const ob=new THREE.Object3D();ob.position.set(x,y,z);ob.scale.set(sx,sy,sz);ob.rotation.y=rotation;ob.updateMatrix();target.push(ob.matrix.clone());colors.push(new THREE.Color(color));
 }
 for(let i=0;i<treeCount*3;i++){
  if(trunkM.length>=treeCount)break;
  const x=rnd(-95,95),z=rnd(-95,95);
  if(!hexContains(x,z,5))continue;
  if(hasRiver&&Math.abs(x-riverX(z))<rnd(15,21))continue;
  if(slope(x,z)>1.25&&rng()<.8)continue;
  if(x<-43&&z>9&&z<52&&rng()<.78)continue; // camp clearing
  const h=rnd(8,16)*(primary===2?1.2:1),y=groundHeight(x,z);
  const pine=[3,9,4].includes(primary)||rng()<(.44+(primary===1?.12:0));
  instanceMatrix(trunkM,trunkC,'trunk',x,y+h*.38,z,h*.105,h*.75,h*.105,tint(0x88694c,rnd(.83,1.08)));
  if(pine){
   for(let c=0;c<3;c++)instanceMatrix(pineM,pineC,'pine',x,y+h*(.57+c*.17),z,h*(.29-c*.055),h*(.41-c*.05),h*(.29-c*.055),tint(style.foliage,rnd(.71,1.30)));
  }else{
   const orange=(primary===1 && rng()<.13);
   for(let c=0;c<3;c++)instanceMatrix(leafM,leafC,'crown',x+rnd(-h*.16,h*.16),y+h*(.68+c*.095),z+rnd(-h*.16,h*.16),h*rnd(.24,.34),h*rnd(.23,.29),h*rnd(.24,.33),orange?tint(0xb68c55,rnd(.8,1.2)):tint(style.foliage,rnd(.74,1.29)));
  }
 }
 function batch(name,geo,mat,arr,colors,shadow=true){
  if(!arr.length)return;
  const m=new THREE.InstancedMesh(geo,mat,arr.length);m.name=name;
  arr.forEach((value,i)=>{m.setMatrixAt(i,value);m.setColorAt(i,colors[i])});m.instanceMatrix.needsUpdate=true;m.castShadow=shadow;m.receiveShadow=true;root.add(m);
 }
 batch('Árvores | troncos',new THREE.CylinderGeometry(.7,.9,1,6),makeMat(0xffffff),trunkM,trunkC);
 batch('Árvores | coníferas',new THREE.ConeGeometry(1,1,7),makeMat(0xffffff),pineM,pineC);
 batch('Árvores | copas folhosas',new THREE.DodecahedronGeometry(1,1),makeMat(0xffffff),leafM,leafC);
 const flowers=Math.floor(cfg.detail*6*clamp(style.forest+.3,.55,1.5));
 for(let i=0;i<flowers;i++){
  const x=rnd(-97,97),z=rnd(-94,94);
  if(!hexContains(x,z,3)||hasRiver&&Math.abs(x-riverX(z))<11||slope(x,z)>1.15)continue;
  const y=groundHeight(x,z),r=rnd(.18,.56);
  const col=rng()<.45?0xd2bc70:rng()<.63?0xaeb8dc:0xc8dbc0;
  instanceMatrix(shrubM,shrubC,'flower',x,y+.3,z,r,.36,r,col);
 }
 batch('Flores e arbustos',new THREE.DodecahedronGeometry(1,0),makeMat(0xffffff),shrubM,shrubC,false);
 // Biome-special landmarks; these do not alter the geography authoritative data.
 if(primary!==0&&primary!==14&&primary!==7){
  // A small stone ruin, in a clearing to the right of the river.
  const rx=58,rz=-33,ry=groundHeight(rx,rz); const ruin=new THREE.Group();ruin.name='Ruínas e ponto de interesse';root.add(ruin);
  addColumn(ruin,rx-4,rz,10,style.rock,ry);addColumn(ruin,rx+4,rz,8,style.rock,ry);
  addBox(ruin,rx,ry+9.4,rz,11,1.5,3,style.rock,.05);
  if(hasRiver){
   const bz=13,bx=riverX(bz),by=baseHeight(bx,bz)+.4;
   const bridge=new THREE.Group();bridge.name='Ponte de madeira';root.add(bridge);
   for(let i=-10;i<=10;i+=1.45)addBox(bridge,bx+i,by,bz,1.19,.65,7.2,0xa37c51,.018);
   for(const oz of [-3.5,3.5]){
    addBox(bridge,bx,by+1.9,bz+oz,24,.56,.55,0x886543);
    for(const xx of [-11,-5,1,7,11])addBox(bridge,bx+xx,by+.95,bz+oz,.55,2.3,.65,0x74563e);
   }
  }
  // Wooden campsite, tent and a lantern; lightweight real geometry.
  const cx=-54,cz=36,cy=groundHeight(cx,cz);
  const camp=new THREE.Group();camp.name='Acampamento';root.add(camp);
  const tentGeo=new THREE.ConeGeometry(8,9,4);const tent=new THREE.Mesh(tentGeo,makeMat(0xa69c70));tent.rotation.y=Math.PI/4;tent.position.set(cx,cy+4.5,cz);tent.castShadow=true;camp.add(tent);
  addBox(camp,cx+12,cy+.3,cz-4,3,.6,5,0x73523a,.2);
  const fire=new THREE.Mesh(new THREE.ConeGeometry(1.5,3.5,5),new THREE.MeshStandardMaterial({color:0xf3ae53,emissive:0xc86f25,emissiveIntensity:.6,roughness:1}));fire.position.set(cx+11,cy+1.8,cz+5);camp.add(fire);
 }
 if(primary===14){const volcano=new THREE.Mesh(new THREE.ConeGeometry(29,21,7),makeMat(0x554e4e));volcano.position.set(46,groundHeight(46,30)+8,30);volcano.castShadow=true;volcano.name='Formação vulcânica cênica';root.add(volcano);}
 if(primary===12||primary===11){const crystals=new THREE.Group();crystals.name='Cristais cênicos';root.add(crystals);for(let i=0;i<19;i++){const x=rnd(-72,72),z=rnd(-74,74);if(!hexContains(x,z,12))continue;const o=new THREE.Mesh(new THREE.ConeGeometry(rnd(1,3.5),rnd(4,11),5),makeMat(0x83c8c7,.35));o.position.set(x,groundHeight(x,z)+4,z);crystals.add(o);}}
 root.traverse(o=>{if(o.isMesh){o.frustumCulled=o.isInstancedMesh?false:o.frustumCulled;}});
 const stats={trees:trunkM.length,rocks:rockMatrices.length,flowers:shrubM.length,rivers:worldRivers,biome_id:primary,generated:true,seed:cfg.seed};
 return {group:root,stats,settings:cfg,biome:style,hasRiver,groundHeight};
}