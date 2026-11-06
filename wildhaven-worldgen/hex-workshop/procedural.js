import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Wildhaven Hex Factory Alpha 0.3 — unique local ecological landscape samples.
// Original Auralis geography is authoritative; each scene is a condensed artistic
// representation of ~2 km, not a 1:1 resampling of a 240-km macroregion.
export const BIOME_STYLE = {
  0:{name:'Oceano',ground:0x87918b,foliage:0x427467,forest:0,rock:0x88999a,water:0x279dc5},
  1:{name:'Floresta temperada',ground:0x6e9952,foliage:0x396b40,forest:1,rock:0xafa695,water:0x36afc9},
  2:{name:'Selva tropical',ground:0x44834e,foliage:0x227046,forest:1.24,rock:0x8c917a,water:0x36a9b6},
  3:{name:'Taiga',ground:0x6f8d6b,foliage:0x315647,forest:.93,rock:0x9ca5a1,water:0x67aeba},
  4:{name:'Tundra',ground:0xa3ab95,foliage:0x62796b,forest:.075,rock:0xa3abad,water:0x84bacf},
  5:{name:'Savana',ground:0xa3a264,foliage:0x60764b,forest:.32,rock:0xada289,water:0x76aeb8},
  6:{name:'Pradaria',ground:0x9fa96b,foliage:0x6b8551,forest:.14,rock:0xb0a78c,water:0x65acbd},
  7:{name:'Deserto rochoso',ground:0xbba77a,foliage:0x848365,forest:.015,rock:0xa99b83,water:0x54acb7},
  8:{name:'Pântano',ground:0x5b8061,foliage:0x456e52,forest:.52,rock:0x899184,water:0x549991},
  9:{name:'Montanha alpina',ground:0x82917d,foliage:0x4c735a,forest:.22,rock:0xb6b2a5,water:0x65aec5},
  10:{name:'Manguezal',ground:0x6b8e6f,foliage:0x3b755c,forest:.57,rock:0x919787,water:0x5ca7a8},
  11:{name:'Floresta luminescente',ground:0x597d6e,foliage:0x4a8497,forest:1.04,rock:0x859ba3,water:0x5bc2d0},
  12:{name:'Vale cristalino',ground:0x8a9e8d,foliage:0x558c80,forest:.21,rock:0xa8a2b9,water:0x72c4d9},
  13:{name:'Pântano micelial',ground:0x6a7e6b,foliage:0x756e92,forest:.57,rock:0x8d8695,water:0x6797b8},
  14:{name:'Terras de Cinza',ground:0x605853,foliage:0x6c5b51,forest:.01,rock:0x766660,water:0xa36c54},
  15:{name:'Vale Etéreo',ground:0x809389,foliage:0x6984a0,forest:.28,rock:0x9e9dac,water:0x6ac4cf}
};

const R=235,clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp,TAU=Math.PI*2;
const hexCorners=Array.from({length:6},(_,i)=>{const a=(30+i*60)*Math.PI/180;return [R*Math.cos(a),R*Math.sin(a)];});
function randGen(seed){let s=seed>>>0;return ()=>{s+=0x6D2B79F5;let t=Math.imul(s^(s>>>15),1|s);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function contains(x,z,pad=0){const a=R-pad;return Math.abs(z)<=a&&Math.abs(x)*Math.sqrt(3)+Math.abs(z)<=2*a;}
function smoothNoise(x,z,seed){
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
  const wx=fx*fx*(3-2*fx),wz=fz*fz*(3-2*fz);
  const n=(a,b)=>{let h=Math.imul(a^seed,374761393)+Math.imul(b,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
  return lerp(lerp(n(ix,iz),n(ix+1,iz),wx),lerp(n(ix,iz+1),n(ix+1,iz+1),wx),wz)*2-1;
}
function fractal(x,z,seed){return .57*smoothNoise(x*.012,z*.012,seed)+.28*smoothNoise(x*.034,z*.034,seed+21)+.15*smoothNoise(x*.083,z*.083,seed+71);}
function palette(biome){return BIOME_STYLE[biome]||BIOME_STYLE[1];}
function dominantBiome(region){const bs=region?.biomes||[];return bs.reduce((m,b)=>b.fraction>m.fraction?b:m,{id:0,fraction:-1}).id;}
export function defaultSettings(region){return {seed:(20051028+(region?.axial?.q||0)*7529+(region?.axial?.r||0)*16939)>>>0||1,trees:70,rocks:58,relief:62,detail:58,water:75};}
function material(color,extras={}){return new THREE.MeshStandardMaterial({color,flatShading:true,roughness:.91,metalness:0,...extras});}
function vertexRGB(color){const c=new THREE.Color(color);return [c.r,c.g,c.b];}
function addMesh(root,geo,mat,name,x=0,y=0,z=0){const o=new THREE.Mesh(geo,mat);o.name=name;o.position.set(x,y,z);o.receiveShadow=true;root.add(o);return o;}

// Tree asset family. Each of twelve visibly different silhouettes has multiple
// baked geometry variants; instances vary scale, orientation, hue and clustering.
const TREE_SPECIES=['oak','beech','maple','birch','pine','spruce','fir','cedar','willow','acacia','banyan','cypress','dead'];
const EVERGREEN=new Set(['pine','spruce','fir','cedar','cypress']);
function speciesWeights(biome,hasWater){
  const w={oak:0,beech:0,maple:0,birch:0,pine:0,spruce:0,fir:0,cedar:0,willow:0,acacia:0,banyan:0,cypress:0,dead:0};
  if([1,11,15].includes(biome))Object.assign(w,{oak:23,beech:19,maple:13,birch:11,pine:11,spruce:9,fir:7,cedar:5,willow:hasWater?5:1});
  else if(biome===2)Object.assign(w,{banyan:38,oak:23,beech:17,willow:hasWater?12:4,cedar:8,acacia:3});
  else if(biome===3)Object.assign(w,{spruce:36,fir:28,pine:22,birch:10,cedar:4});
  else if(biome===5)Object.assign(w,{acacia:62,banyan:3,oak:12,cedar:4,dead:3});
  else if(biome===6)Object.assign(w,{oak:23,acacia:13,beech:7,pine:7,birch:3});
  else if(biome===8||biome===10||biome===13)Object.assign(w,{willow:40,banyan:19,oak:16,birch:7,beech:10});
  else if(biome===9)Object.assign(w,{pine:31,spruce:30,fir:18,birch:5,cypress:7});
  else if(biome===4)Object.assign(w,{birch:10,dead:4,spruce:7});
  else if(biome===7||biome===14)Object.assign(w,{dead:17,acacia:6});
  else Object.assign(w,{oak:17,beech:12,cypress:9,birch:5});
  return w;
}
function chooseWeighted(rng,weights){let total=0;for(const v of Object.values(weights))total+=v;if(!total)return null;let p=rng()*total;for(const [k,v] of Object.entries(weights)){p-=v;if(p<=0)return k;}return Object.keys(weights).at(-1);}
function treeGeometry(species,variation,biome){
 const rnd=randGen(hash(species)+variation*1812433253+biome*1123),parts=[];
 const colors={trunk:0x775d45,bark:0xa8a394,olive:0x355e40,green:palette(biome).foliage,autumn:0xbf7a37};
 const bark=species==='birch'?colors.bark:species==='dead'?0x766a5e:colors.trunk;
 const foliage=species==='maple'?colors.autumn:species==='dead'?null:colors.green;
 function piece(geometry,pos,scale,col,rotY=0){
  const geo=geometry.toNonIndexed?geometry.toNonIndexed():geometry.clone();
  const m=new THREE.Matrix4();m.compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,rotY,0)),new THREE.Vector3(...scale));geo.applyMatrix4(m);
  const rgb=vertexRGB(col),arr=new Float32Array(geo.attributes.position.count*3);for(let i=0;i<arr.length;i+=3){arr[i]=rgb[0];arr[i+1]=rgb[1];arr[i+2]=rgb[2];}
  geo.setAttribute('color',new THREE.BufferAttribute(arr,3));parts.push(geo);
 }
 const cone=(rad=1,verts=7)=>new THREE.ConeGeometry(rad,1,verts);
 const blob=(detail=1)=>new THREE.IcosahedronGeometry(1,detail);
 const trunkWidth=species==='banyan'?.08:species==='birch'?.025:species==='acacia'?.046:.051;
 piece(new THREE.CylinderGeometry(trunkWidth*.73,trunkWidth,1,7),[0,.50,0],[1,1,1],bark);
 if(species==='dead'){
  for(let i=0;i<4;i++){const a=TAU*rnd(),y=.37+i*.15;piece(new THREE.CylinderGeometry(.009,.018,.4,5),[Math.cos(a)*.11,y+.1,Math.sin(a)*.11],[1,1,1],bark,a);}
 }else if(EVERGREEN.has(species)){
  const tiers=species==='cedar'?4:species==='spruce'?5:species==='cypress'?3:4;
  const width={pine:.31,spruce:.255,fir:.32,cedar:.39,cypress:.17}[species];
  for(let i=0;i<tiers;i++){
   const a=(i/(tiers-1)),w=width*(1-a*.52)*(0.88+rnd()*.26);
   const cy=.45+i*(species==='cypress'?.20:.14);
   piece(cone(1,species==='cedar'?9:7),[rnd()*.035-.017,cy,0],[w,species==='cypress'?.48:.39,w],foliage);
  }
  if(species==='pine')for(let i=0;i<3;i++){const a=TAU*i/3;piece(blob(0),[Math.cos(a)*.19,.65,Math.sin(a)*.19],[.19,.14,.18],foliage);}
 }else if(species==='acacia'){
   piece(new THREE.CylinderGeometry(.022,.03,.65,6),[.20,.73,0],[1,1,1],bark,.25);
   for(let i=0;i<4;i++){const a=i*TAU/4+.4;piece(blob(1),[Math.cos(a)*.28,.92+rnd()*.06,Math.sin(a)*.24],[.41,.13,.33],foliage);}
 }else if(species==='willow'){
   piece(blob(1),[0,.78,0],[.39,.30,.37],foliage);
   for(let i=0;i<8;i++){const a=TAU*i/8;const x=Math.cos(a)*.32,z=Math.sin(a)*.32;
    piece(blob(0),[x,.60-rnd()*.15,z],[.14,.27,.13],foliage);}
 }else if(species==='banyan'){
   for(let i=0;i<4;i++){const a=TAU*i/4;piece(new THREE.CylinderGeometry(.008,.019,.68,5),[Math.cos(a)*.20,.41,Math.sin(a)*.20],[1,1,1],bark);}
   for(let i=0;i<7;i++){const a=TAU*i/7;piece(blob(1),[Math.cos(a)*.28,.77+(i%2)*.12,Math.sin(a)*.26],[.26,.23,.27],foliage);}
 }else{
   // Broadleaves: multi-lobed crowns with asymmetry, intentional gaps and branches.
   for(let i=0;i<4;i++){const a=TAU*i/4+rnd()*.5;piece(new THREE.CylinderGeometry(.01,.018,.42,5),[Math.cos(a)*.12,.72,Math.sin(a)*.12],[1,1,1],bark,a);}
   const lobes=species==='beech'?5:species==='birch'?4:8;
   for(let i=0;i<lobes;i++){
    const a=TAU*i/lobes+rnd()*.20,spread=species==='birch'?.15:species==='beech'?.22:.27;
    const x=Math.cos(a)*spread*(.8+.4*rnd()),z=Math.sin(a)*spread*(.8+.4*rnd());
    piece(blob(species==='birch'?0:1),[x,.82+rnd()*.22,z],[.22+rnd()*.08,species==='birch'?.22:.21+rnd()*.08,.2+rnd()*.09],foliage);
   }
   piece(blob(1),[0,1.02,0],[.24,.18,.24],foliage);
 }
 // Merge geometry for one draw-call per visible species variant (InstancedMesh).
 const geo=mergeGeometries(parts,false);if(!geo)throw Error('Falha ao combinar árvore '+species);
 parts.forEach(g=>g.dispose());geo.computeVertexNormals();return geo;
}

const ARCHETYPES={
 planicie:'Planície aberta',colinas:'Colinas onduladas',vale:'Vale florestado',encosta:'Encosta assimétrica',
 plato:'Platôs rochosos',montanha:'Montanhas e cristas',bacia:'Bacia úmida',ravina:'Garganta rochosa',
 costa:'Planície costeira',dunas:'Dunas e terreno seco',pantano:'Depressão pantanosa',
};
function chooseArchetype(region,biome,rng){
 const range=Math.max(0,(region?.elevation_m?.max??200)-(region?.elevation_m?.min??0));
 let w={planicie:15,colinas:17,vale:14,encosta:10,plato:8,montanha:4,bacia:7,ravina:3,costa:0,dunas:0,pantano:0};
 if([6,5,4].includes(biome))Object.assign(w,{planicie:28,colinas:21,vale:8,encosta:7,plato:5,montanha:1,ravina:0});
 if([9,14].includes(biome))Object.assign(w,{planicie:0,colinas:8,vale:9,encosta:22,plato:12,montanha:31,ravina:14,bacia:0});
 if(biome===7)Object.assign(w,{dunas:35,planicie:25,colinas:11,plato:19,vale:0,bacia:0,ravina:9});
 if([8,10,13].includes(biome))Object.assign(w,{pantano:38,bacia:29,planicie:18,colinas:10,vale:13,montanha:0,ravina:0});
 if(biome===0)Object.assign(w,{costa:80,planicie:10,colinas:0,vale:0,encosta:0,plato:0,montanha:0,bacia:0,ravina:0});
 if(range>850){w.montanha+=25;w.encosta+=12;w.ravina+=10;w.planicie=Math.max(0,w.planicie-10);}
 if(range<150){w.planicie+=25;w.colinas+=14;w.montanha=0;w.ravina=0;}
 if((region?.biomes||[]).some(b=>b.id===10&&b.fraction>.2))w.costa=25;
 return chooseWeighted(rng,w)||'colinas';
}
export function analyzeRegion(region,seed=null){
 const id=region?.id||'H_0_0',biome=dominantBiome(region),sourceSeed=seed??defaultSettings(region).seed;
 const rng=randGen((sourceSeed>>>0)^hash(id));
 const archetype=chooseArchetype(region,biome,rng),rivers=region?.rivers?.length||0,lakes=region?.lakes?.length||0;
 const isWaterBiome=biome===0;
 // A macro-hex is hundreds of km across. River *presence* in its global index
 // does not imply every 2-km local scene has a river.
 const riverChance=rivers?clamp(.045+Math.sqrt(rivers)*.074,0,.67):0;
 const localRiver=!isWaterBiome&&rivers>0&&rng()<riverChance;
 const localPond=!localRiver&&!isWaterBiome&&lakes>0&&rng()<Math.min(.26,lakes*.022);
 return {id,biome,archetype,archetypeName:ARCHETYPES[archetype],worldRivers:rivers,worldLakes:lakes,localRiver,localPond,riverChance,sourceSeed,
  // No randomly placed human infrastructure. Explicit curated landmarks are separate.
  landmarks:[],observable_diameter_m:2000};
}

export function buildHexScene(region,settings={}){
 const cfg={...defaultSettings(region),...settings};cfg.seed=(Number(cfg.seed)||1)>>>0;
 for(const k of ['trees','rocks','relief','detail','water'])cfg[k]=clamp(Number(cfg[k])||0,0,100);
 const meta=analyzeRegion(region,cfg.seed),biome=meta.biome,style=palette(biome),rng=randGen(cfg.seed^hash(meta.id)^0x43E9B15);
 const random=(min,max)=>lerp(min,max,rng());
 const hasRiver=meta.localRiver&&cfg.water>0,hasPond=meta.localPond&&cfg.water>0;
 const root=new THREE.Group();root.name=`Wildhaven_${meta.id.replace(/[^\w-]/g,'_')}`;
 root.userData={...meta,seed:cfg.seed,preview:true,local_scenic_radius:R,visual_version:3};
 const archetype=meta.archetype;
 const terrainSeed=hash(meta.id),angle=random(0,TAU),ca=Math.cos(angle),sa=Math.sin(angle);
 const slopeAngle=random(-1,1),a1={x:random(-.45,.25)*R,z:random(-.4,.5)*R,r:random(.23,.58)*R,h:random(13,27)};
 const a2={x:random(-.4,.45)*R,z:random(-.4,.3)*R,r:random(.22,.54)*R,h:random(12,34)};
 const valleyX=random(-.18,.18)*R, riverAngle=random(0,TAU),rc=Math.cos(riverAngle),rs=Math.sin(riverAngle);
 const riverAmp=random(9,23),riverPhase=random(0,TAU),riverWidth=random(7,13);
 const ridgeNoise=(x,z)=>fractal(x,z,terrainSeed);
 const local=(x,z)=>[x*ca-z*sa,x*sa+z*ca];
 const gauss=(x,z,p)=>Math.exp(-(((x-p.x)/p.r)**2+((z-p.z)/p.r)**2)*1.4)*p.h;
 const rawFactor=(.62+cfg.relief/74);
 const heightScale=biome===9?1.6:biome===14?1.42:biome===6?.55:1;
 function baseHeight(x,z){
  const [u,v]=local(x,z),noise=ridgeNoise(x,z),slow=smoothNoise(x*.005,z*.005,terrainSeed+9);
  let h=7;
  switch(archetype){
   case 'planicie':h+=noise*6+slow*4+3*Math.sin(u*.018);break;
   case 'colinas':h+=gauss(x,z,a1)+gauss(x,z,a2)*.72+noise*9;break;
   case 'vale':h+=Math.pow(Math.abs(u-valleyX)/R,1.53)*32+noise*7+slow*4;break;
   case 'encosta':h+=(u/R+1)*24+gauss(x,z,a1)*.46+noise*10;break;
   case 'plato':{const d=Math.hypot(u*.85,v*.8),step=1/(1+Math.exp((d-R*.46)/9));h+=29*step+gauss(x,z,a2)*.28+noise*6;break;}
   case 'montanha':h+=Math.max(0,Math.sin(u*.024+slow*2))*35+gauss(x,z,a1)*1.7+gauss(x,z,a2)*1.1+noise*16;break;
   case 'bacia':h+=Math.pow(Math.hypot(u,v)/R,1.6)*20+noise*4;break;
   case 'ravina':h+=Math.min(36,Math.pow(Math.abs(u-valleyX)/R,1.4)*66)+noise*7;break;
   case 'costa':h+=((u/R)+.5)*7+noise*2;break;
   case 'dunas':h+=15*Math.sin(u*.028+slow*3)+8*Math.sin(v*.04)+noise*5;break;
   case 'pantano':h+=Math.pow(Math.hypot(u,v)/R,2)*5+noise*2;break;
   default:h+=noise*8;
  }
  return h*heightScale*rawFactor;
 }
 function localRiverBasis(x,z){const along=x*rs+z*rc,cross=x*rc-z*rs;return {along,cross};}
 function riverCenter(s){return riverAmp*Math.sin(s*.011+riverPhase)+riverAmp*.39*Math.sin(s*.035+riverPhase*.46);}
 function positionAlong(s,t){return {x:s*rs+t*rc,z:s*rc-t*rs};}
 function groundHeight(x,z){
  const {along,cross}=localRiverBasis(x,z);
  const d=Math.abs(cross-riverCenter(along));
  return baseHeight(x,z)-(hasRiver?6.3*Math.exp(-Math.pow(d/riverWidth,4)):0);
 }
 function slope(x,z){const e=3;return Math.hypot((groundHeight(x+e,z)-groundHeight(x-e,z))/(2*e),(groundHeight(x,z+e)-groundHeight(x,z-e))/(2*e));}
 const materialTerrain=material(0xffffff,{vertexColors:true,side:THREE.DoubleSide});
 // Higher-res radial tessellation; explicit Y-up winding and unlit sides never obscure ground.
 const perSide=42,segments=perSide*6,rings=68,pts=[],cols=[],faces=[],boundary=[];
 const colGround=new THREE.Color(style.ground);
 function pt(x,z){const y=groundHeight(x,z),micro=smoothNoise(x*.023,z*.023,terrainSeed+72);
  const gr=colGround.clone().multiplyScalar(clamp(.94+micro*.11+(y-7)*.0006,.72,1.17));
  pts.push(x,y,z);cols.push(gr.r,gr.g,gr.b);
 }
 pt(0,0);
 for(let ring=1;ring<=rings;ring++)for(let i=0;i<segments;i++){
  const side=Math.floor(i/perSide),frac=(i%perSide)/perSide,a=hexCorners[side],b=hexCorners[(side+1)%6],f=ring/rings;
  const x=lerp(a[0],b[0],frac)*f,z=lerp(a[1],b[1],frac)*f;
  pt(x,z);if(ring===rings)boundary.push([x,z]);
 }
 for(let i=0;i<segments;i++)faces.push(0,1+(i+1)%segments,1+i);
 for(let ring=2;ring<=rings;ring++)for(let i=0;i<segments;i++){
  const a=1+(ring-2)*segments+i,b=1+(ring-2)*segments+(i+1)%segments,c=1+(ring-1)*segments+i,d=1+(ring-1)*segments+(i+1)%segments;
  faces.push(a,b,c,b,d,c);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));geo.setIndex(faces);geo.computeVertexNormals();
 const ground=addMesh(root,geo,materialTerrain,'Terreno 3D variável');ground.receiveShadow=true;ground.castShadow=false;
 // Geometry QA: upward-facing terrain center normal to avoid the black flipped-face bug.
 const normal=geo.getAttribute('normal');if(normal.getY(0)<0){const ar=geo.index.array;for(let i=0;i<ar.length;i+=3){const t=ar[i+1];ar[i+1]=ar[i+2];ar[i+2]=t;}geo.index.needsUpdate=true;geo.computeVertexNormals();}
 const wallPts=[],wallCols=[],wallFaces=[];
 for(let i=0;i<boundary.length;i++){
  const [x,z]=boundary[i],top=groundHeight(x,z),base=Math.min(-24,top-26);
  const color=new THREE.Color(style.rock).multiplyScalar(.73+.12*smoothNoise(x*.05,z*.05,terrainSeed));
  wallPts.push(x,top,z,x,base,z);wallCols.push(...vertexRGB(color),...vertexRGB(color));
  const a=i*2,b=((i+1)%boundary.length)*2;wallFaces.push(a,a+1,b,b,a+1,b+1);
 }
 const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(wallPts,3));wg.setAttribute('color',new THREE.Float32BufferAttribute(wallCols,3));wg.setIndex(wallFaces);wg.computeVertexNormals();
 addMesh(root,wg,materialTerrain.clone(),'Faces rochosas laterais');
 // Geometry: rivers are smooth contour-aligned water ribbon. No automatic waterfall boxes.
 if(hasRiver){
  const steps=240,half=riverWidth*.77,v=[],ix=[],bankLine=[];
  for(let i=0;i<=steps;i++){
   const s=lerp(-R*.92,R*.92,i/steps),t=riverCenter(s),center=positionAlong(s,t);
   const y=baseHeight(center.x,center.z)-5.25;
   for(const side of [-1,1]){const p=positionAlong(s,t+side*half);v.push(p.x,y,p.z);}
   if(i<steps)ix.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
   bankLine.push({s,t,x:center.x,z:center.z});
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(ix);g.computeVertexNormals();
  addMesh(root,g,material(style.water,{metalness:0,roughness:.4,transparent:true,opacity:.91,side:THREE.DoubleSide}),'Curso de água natural');
 }
 if(hasPond){
  const cx=random(-R*.19,R*.19),cz=random(-R*.2,R*.2),y=groundHeight(cx,cz)+.25;
  const pond=addMesh(root,new THREE.CircleGeometry(random(14,26),36),material(style.water,{roughness:.35,transparent:true,opacity:.85,side:THREE.DoubleSide}),'Lagoa local',cx,y,cz);
  pond.rotation.x=-Math.PI/2;
 }
 if(biome===0){
  const ocean=addMesh(root,new THREE.CircleGeometry(R*.85,64),material(style.water,{roughness:.4,metalness:0,side:THREE.DoubleSide}),'Superfície marinha',0,groundHeight(0,0)+.7,0);ocean.rotation.x=-Math.PI/2;
 }
 // Angular stones are strongly governed by slope, rocky substrate and water edge.
 const rockM=[],rockC=[],rObj=new THREE.Object3D(),rockLimit=Math.round((95+cfg.rocks*4)*([9,7,14].includes(biome)?1.7:1));
 function addRock(x,z,r,wet=false){if(!contains(x,z,r*.7+3))return;
  const h=groundHeight(x,z);rObj.position.set(x,h+r*.25,z);rObj.rotation.set(random(-.15,.15),random(0,TAU),random(-.13,.13));rObj.scale.set(r*random(.7,1.7),r*random(.5,.9),r*random(.8,1.7));rObj.updateMatrix();rockM.push(rObj.matrix.clone());
  const c=new THREE.Color(style.rock);c.multiplyScalar(wet?random(.65,.83):random(.82,1.16));rockC.push(c);
 }
 for(let i=0;i<rockLimit*3;i++){
  if(rockM.length>=rockLimit)break;
  const x=random(-R,R),z=random(-R,R);if(!contains(x,z,7))continue;
  const grade=slope(x,z),steep=clamp((grade-.15)*1.7,0,1);
  const p=([9,7,14].includes(biome)?.45:.10)+steep*.65;
  if(rng()<p)addRock(x,z,random(1.3,5.8)*(.9+grade*.27));
 }
 if(hasRiver){
  const count=Math.round(cfg.rocks*2.0);
  for(let i=0;i<count;i++){
   const s=random(-R*.88,R*.88),t=riverCenter(s)+(rng()<.5?-1:1)*random(riverWidth*1.04,riverWidth*2.9);
   const p=positionAlong(s,t);addRock(p.x,p.z,random(1.1,4.3),true);
  }
 }
 const rockGeo=new THREE.DodecahedronGeometry(1,0),rockMat=material(0xffffff);
 if(rockM.length){const rocks=new THREE.InstancedMesh(rockGeo,rockMat,rockM.length);rocks.name='Rochas mid-poly instanciadas';rocks.castShadow=true;rocks.receiveShadow=true;rockM.forEach((m,i)=>{rocks.setMatrixAt(i,m);rocks.setColorAt(i,rockC[i]);});rocks.instanceMatrix.needsUpdate=true;rocks.frustumCulled=false;root.add(rocks);}
 // Ecological tree populations: clustered spatial distribution, major clearings,
 // height and canopy diversity. Neighbor forests can have different dominant species.
 const treeCount=Math.round(style.forest*(36+cfg.trees*8.2)),weights=speciesWeights(biome,hasRiver||hasPond);
 const clusters=[],clusterCount=Math.max(6,Math.round(treeCount/15));
 for(let i=0;i<clusterCount;i++){const x=random(-R*.84,R*.84),z=random(-R*.8,R*.8);if(contains(x,z,16))clusters.push({x,z,w:random(9,38),dominant:chooseWeighted(rng,weights)});}
 const speciesGroups=new Map(),treeCells=new Set(),speciesCounts={};
 function claimTree(x,z){const gx=Math.floor((x+R)/6),gz=Math.floor((z+R)/6),k=gx+':'+gz;if(treeCells.has(k))return false;treeCells.add(k);return true;}
 let actualTrees=0;
 for(let i=0;i<treeCount*6&&actualTrees<treeCount;i++){
  const center=clusters[Math.floor(rng()*clusters.length)];
  let x,z;
  if(center&&rng()<.87){const spread=random(12,center.w+18),a=random(0,TAU);x=center.x+Math.cos(a)*spread*Math.sqrt(rng());z=center.z+Math.sin(a)*spread*Math.sqrt(rng());}
  else{x=random(-R,R);z=random(-R,R);}
  if(!contains(x,z,9))continue;
  if(hasRiver){const b=localRiverBasis(x,z);if(Math.abs(b.cross-riverCenter(b.along))<riverWidth+random(1,6))continue;}
  if(slope(x,z)>1.2&&rng()<.92)continue;
  const clearing=smoothNoise(x*.02,z*.02,terrainSeed+837);
  if(clearing>.52&&rng()<.88)continue;
  if(!claimTree(x,z))continue;
  let sp=center?.dominant&&rng()<.63?center.dominant:chooseWeighted(rng,weights);if(!sp)continue;
  if(hasRiver&&Math.abs(localRiverBasis(x,z).cross-riverCenter(localRiverBasis(x,z).along))<riverWidth+15&&rng()<.24)sp='willow';
  const variation=Math.floor(rng()*3),key=sp+':'+variation;
  const h=random(12,27)*(sp==='birch'?.84:sp==='banyan'?1.32:sp==='dead'?.73:1),w=random(.79,1.35);
  const obj=new THREE.Object3D();obj.position.set(x,groundHeight(x,z)-.15,z);obj.scale.set(h*w,h,h*w*random(.82,1.2));obj.rotation.y=random(0,TAU);obj.updateMatrix();
  if(!speciesGroups.has(key))speciesGroups.set(key,[]);
  speciesGroups.get(key).push({matrix:obj.matrix.clone(),color:new THREE.Color(0xffffff).multiplyScalar(random(.75,1.16))});
  speciesCounts[sp]=(speciesCounts[sp]||0)+1;actualTrees++;
 }
 const treeMaterial=material(0xffffff,{vertexColors:true,side:THREE.FrontSide});
 for(const [key,items] of speciesGroups){const [sp,variantText]=key.split(':');const mesh=new THREE.InstancedMesh(treeGeometry(sp,Number(variantText),biome),treeMaterial,items.length);
  mesh.name=`Árvores variadas | ${sp} | tipo ${variantText}`;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
  items.forEach((item,i)=>{mesh.setMatrixAt(i,item.matrix);mesh.setColorAt(i,item.color);});mesh.instanceMatrix.needsUpdate=true;root.add(mesh);
 }
 const grassCount=Math.round(cfg.detail*(style.forest>.4?4.6:2.5));
 const grassM=[],grassC=[],gObj=new THREE.Object3D();
 for(let i=0;i<grassCount*2&&grassM.length<grassCount;i++){
  const x=random(-R,R),z=random(-R,R);if(!contains(x,z,4)||slope(x,z)>.85)continue;
  if(hasRiver){const b=localRiverBasis(x,z);if(Math.abs(b.cross-riverCenter(b.along))<riverWidth*.85)continue;}
  gObj.position.set(x,groundHeight(x,z)+.2,z);gObj.rotation.y=random(0,TAU);const s=random(.18,.54);gObj.scale.set(s,s*random(.6,1.8),s);gObj.updateMatrix();grassM.push(gObj.matrix.clone());
  grassC.push(new THREE.Color(rng()<.38?0xe1cf8a:rng()<.7?0x94a867:0xcfc5bb));
 }
 if(grassM.length){const g=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),material(0xffffff),grassM.length);g.name='Flores e cobertura herbácea';g.castShadow=false;g.frustumCulled=false;
  grassM.forEach((m,i)=>{g.setMatrixAt(i,m);g.setColorAt(i,grassC[i]);});g.instanceMatrix.needsUpdate=true;root.add(g);
 }
 // Curated special locations are intentionally NOT injected into every hex.
 // Bridges, ruins, camps and falls are 0 unless explicitly authored in a later editor.
 root.traverse(o=>{if(o.isInstancedMesh)o.frustumCulled=false;});
 const stats={biome_id:biome,archetype,archetypeName:meta.archetypeName,trees:actualTrees,treeSpecies:Object.keys(speciesCounts).length,treeSpeciesCounts:speciesCounts,
  rocks:rockM.length,flowers:grassM.length,rivers:meta.worldRivers,localRiver:hasRiver,localPond:hasPond,bridges:0,ruins:0,camps:0,
  scenarioKey:`${meta.id}:${cfg.seed}:${archetype}`,scenicDiameterUnits:2*R,observableDiameterMeters:2000,generated:true,seed:cfg.seed};
 return {group:root,stats,settings:cfg,biome:style,hasRiver,groundHeight};
}