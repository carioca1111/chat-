/* Wildhaven Hex Factory 0.4 — deterministic, renderer-independent geographical core.
 * Auralis macro-region fields are constraints, never overwritten by scenic edits.
 * Local scenes cover a 10,000 m point-to-point representative hexagon.
 */
export const OBSERVABLE_DIAMETER_M = 10000;
export const HEX_RADIUS = OBSERVABLE_DIAMETER_M / 2;
export const WORLD_SEED = 20051028;
const PI = Math.PI, TAU = PI * 2;
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const lerp=(a,b,t)=>a+(b-a)*t;
export const smoothstep=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export function hash32(s){let h=2166136261;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function randomSource(seed){let s=seed>>>0;return ()=>{s=(s+0x6D2B79F5)>>>0;let t=Math.imul(s^(s>>>15),1|s);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
function sampleHash(x,z,seed){let n=Math.imul(x|0,0x1b873593)^Math.imul(z|0,0x85ebca6b)^seed;n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return ((n^(n>>>16))>>>0)/4294967296;}
export function noise2(x,z,seed){const ix=Math.floor(x),iz=Math.floor(z),fx=smoothstep(x-ix),fz=smoothstep(z-iz);return lerp(lerp(sampleHash(ix,iz,seed),sampleHash(ix+1,iz,seed),fx),lerp(sampleHash(ix,iz+1,seed),sampleHash(ix+1,iz+1,seed),fx),fz)*2-1;}
export function fbm(x,z,seed){return .51*noise2(x,z,seed)+.27*noise2(x*2.07,z*2.07,seed+17)+.14*noise2(x*4.16,z*4.16,seed+31)+.08*noise2(x*8.04,z*8.04,seed+71);}
export function hexCorners(radius=HEX_RADIUS){return Array.from({length:6},(_,i)=>{const a=PI/6+i*PI/3;return [radius*Math.cos(a),radius*Math.sin(a)];});}
export function signedHexDistance(x,z){const r=HEX_RADIUS;return Math.min((Math.sqrt(3)/2)*r-Math.abs(x),(r-Math.abs(z)-Math.abs(x)/Math.sqrt(3))*(Math.sqrt(3)/2));}
export function insideHex(x,z,pad=0){return signedHexDistance(x,z)>=pad-1e-5;}
export function biomeIdAtMacro(region){const bins=region?.biomes||[];if(!bins.length)return 1;const sorted=[...bins].sort((a,b)=>b.fraction-a.fraction);return sorted[0].id;}
export const ARCHETYPES=['vale','colinas','planicie','plato','encosta','serra','bacia','garganta','depressao','montanha','canion','costa','campo','vulcanico','floresta-montanhosa'];
export function makeDNA(region){
 const id=region?.id||'H_0_0',seed=hash32('AURALIS|'+WORLD_SEED+'|'+id),rng=randomSource(seed);
 const entries=(region?.biomes||[{id:1,fraction:1}]).filter(b=>b.fraction>.007).sort((a,b)=>b.fraction-a.fraction);
 const main=entries[0]?.id??1;
 const elev=region?.elevation_m||{},range=Math.max(10,(elev.max??180)-(elev.min??100)),base=Math.max(0,elev.mean??180);
 const reliefClamped=clamp(range,18,1950),mag=clamp(reliefClamped*.32,12,320);
 const moist=region?.soil_moisture?.mean??.5;
 let archetype='colinas';
 if(main===0||main===10)archetype='costa';
 else if(main===14)archetype='vulcanico';
 else if(main===9)archetype=reliefClamped>900?'montanha':'serra';
 else if([8,13].includes(main))archetype='bacia';
 else if([6,5,4].includes(main))archetype=reliefClamped>450?'colinas':'planicie';
 else if(main===7)archetype=reliefClamped>500?'plato':'campo';
 else if(reliefClamped>850)archetype='floresta-montanhosa';
 else if(reliefClamped>450)archetype='encosta';
 else archetype=(rng()<.5?'vale':'colinas');
 // Secondary landforms are geographic accents, not random scene-wide replacements.
 const minors=archetype==='floresta-montanhosa'?['vale','serra']:archetype==='serra'?['encosta','vale']:archetype==='vale'?['colinas','depressao']:archetype==='costa'?['planicie','bacia']:['colinas','vale'];
 const theta=rng()*TAU, direction=[Math.cos(theta),Math.sin(theta)];
 const valleyTheta=theta+(rng()-.5)*1.2;
 const anchors=[];
 for(const b of entries.slice(1)){
  // Noticeable but confined habitat pockets; no invented biomes.
  const n=b.fraction>.17?3:b.fraction>.045?2:1;
  for(let k=0;k<n;k++){
   const t=rng()*TAU,r=HEX_RADIUS*(.24+rng()*.40),size=clamp(HEX_RADIUS*Math.sqrt(Math.max(.009,b.fraction)/n)*(.7+rng()*.9),270,2100);
   anchors.push({id:b.id,x:Math.cos(t)*r,z:Math.sin(t)*r,rx:size,rz:size*(.68+rng()*.7),angle:rng()*TAU});
  }
 }
 const countRivers=region?.rivers?.length||0,lakes=region?.lakes?.length||0;
 const dry=[7,14].includes(main),ocean=main===0;
 const riverProbability=clamp((countRivers? .12+Math.sqrt(countRivers)*.055:0)*(dry?.2:1),0,.62);
 const hasRiver=!ocean&&(id==='H_5_7'||(countRivers>0&&rng()<riverProbability));
 const hasPond=!ocean&&!hasRiver&&lakes>0&&rng()<clamp(.14+.028*lakes,.1,.44);
 return Object.freeze({schema:1,id,seed,main,biomes:entries.map(b=>({id:b.id,fraction:b.fraction,name:b.name})),
  anchors,base,range,mag,moist,archetype,minors,direction,valleyTheta,
  riverCount:countRivers,lakeCount:lakes,hasRiver,hasPond,observable_diameter_m:OBSERVABLE_DIAMETER_M,
  world_region_radius_m:240000,source:'Auralis global climate/biome/elevation summaries; scenic details inferred'});
}
export function makeLandscape(region, options={}){
 const dna=makeDNA(region),a=dna.seed,mag=dna.mag*clamp((options.relief??65)/65,.55,1.6),main=dna.main;
 const theta=dna.valleyTheta, c=Math.cos(theta),s=Math.sin(theta);
 const rot=(x,z)=>[x*c+z*s,-x*s+z*c];
 const f=(x,z)=>{const [u,v]=rot(x,z);
  const large=fbm(x/2900,z/2900,a+1),middle=fbm(x/900,z/900,a+17),fine=fbm(x/240,z/240,a+291);
  let y=mag*(large*.73+middle*.27+fine*.055);
  const slope=(x*dna.direction[0]+z*dna.direction[1])/(2*HEX_RADIUS);
  y-=mag*.75*slope;
  const valley=Math.exp(-Math.pow(v/(1400+650*noise2(u/2800,0,a)),2));
  switch(dna.archetype){
   case 'vale':y+=mag*(.55*(1-valley)+.13*Math.sin(u/1400));break;
   case 'floresta-montanhosa':y+=mag*(.78*Math.abs(noise2(u/2100,v/2600,a+48))+.32*(1-valley));break;
   case 'serra':case 'montanha':y+=mag*(1.35*Math.abs(noise2(u/2400,v/1900,a+44))+.35*Math.abs(v)/5000);break;
   case 'plato':y+=mag*(.85*smoothstep((noise2(u/2700,v/2700,a+54)+.06)*5));break;
   case 'bacia':case 'depressao':y-=mag*.9*valley;break;
   case 'planicie':case 'campo':y*=.36;break;
   case 'costa':y*=.38;break;
   case 'vulcanico':{const d=Math.hypot(x-700,z+400)/2400;y+=mag*.9*Math.exp(-d*d);break;}
   case 'encosta':y+=mag*.75*(u/5000);break;
   case 'garganta':case 'canion':y+=mag*(1.1*(1-Math.exp(-(v*v)/(800*800))));break;
  }
  return y;
 };
 const edits=Array.isArray(options.edits)?options.edits:[];
 function baseHeight(x,z){let y=f(x,z);
  for(const edit of edits){if(!['raise','lower','flatten','smooth'].includes(edit.tool))continue;
   const d=Math.hypot(x-edit.x,z-edit.z),radius=clamp(edit.radius||300,20,1600);if(d>=radius)continue;
   const t=Math.pow(1-smoothstep(d/radius),2),strength=clamp(edit.strength||20,1,100);
   if(edit.tool==='raise')y+=strength*t;
   else if(edit.tool==='lower')y-=strength*t;
   else if(edit.tool==='flatten')y=lerp(y,edit.targetHeight??0,t*.8);
   else y=lerp(y,(f(x+80,z)+f(x-80,z)+f(x,z+80)+f(x,z-80))*.25,t*.7);
  }
  return y;
 }
 function biomeAt(x,z,y=baseHeight(x,z)){
  if(!dna.anchors.length)return {id:main,other:null,blend:0};
  let found=null,strength=0;
  for(const p of dna.anchors){const dx=x-p.x,dz=z-p.z,c=Math.cos(p.angle),s=Math.sin(p.angle);
   const u=(dx*c+dz*s)/p.rx,v=(-dx*s+dz*c)/p.rz,dist=Math.sqrt(u*u+v*v);
   // Altitude and moisture shift the ecotone without authoring a hard boundary.
   const climate=.11*noise2(x/800,z/800,a+p.id*11)+.05*clamp(y/Math.max(30,mag),-2,2);
   const blend=smoothstep((1.22+climate-dist)/.38);
   if(blend>strength){strength=blend;found=p.id;}
  }
  if(strength>.5)return {id:found,other:main,blend:strength};
  return {id:main,other:found,blend:strength};
 }
 return {dna,baseHeight,biomeAt,mag};
}
function closestOnSegment(px,pz,ax,az,bx,bz){const dx=bx-ax,dz=bz-az,len=dx*dx+dz*dz,t=len?clamp(((px-ax)*dx+(pz-az)*dz)/len,0,1):0;return {t,x:ax+dx*t,z:az+dz*t,d:Math.hypot(px-(ax+dx*t),pz-(az+dz*t))};}
export function createRiver(landscape, settings={}){
 const {dna,baseHeight}=landscape;
 if(!dna.hasRiver||(settings.water??75)<=0)return null;
 const r=HEX_RADIUS,step=75,dir=dna.direction,seed=dna.seed;
 const candidateStarts=[];
 // Sample the upstream half of the boundary, but start inside the polygon.
 const vertices=hexCorners(r-160);
 for(let k=0;k<6;k++){
  const [ax,az]=vertices[k],[bx,bz]=vertices[(k+1)%6];
  for(let j=1;j<10;j++){
   const t=j/10,x=lerp(ax,bx,t),z=lerp(az,bz,t),u=x*dir[0]+z*dir[1];
   if(u<r*(-.25))candidateStarts.push({x,z,rank:baseHeight(x,z)-.001*u});
  }
 }
 candidateStarts.sort((a,b)=>b.rank-a.rank);
 const angles=Array.from({length:16},(_,i)=>i*TAU/16);
 let best=[];
 for(const start of candidateStarts.slice(0,14)){
  let p={x:start.x,z:start.z,y:baseHeight(start.x,start.z)},path=[p],visited=new Set();
  for(let n=0;n<170;n++){
   const key=`${Math.round(p.x/step)},${Math.round(p.z/step)}`;visited.add(key);
   let next=null,bestScore=0;
   for(const a of angles){const x=p.x+Math.cos(a)*step,z=p.z+Math.sin(a)*step;
    if(!insideHex(x,z,60))continue;
    const cell=`${Math.round(x/step)},${Math.round(z/step)}`;if(visited.has(cell))continue;
    const y=baseHeight(x,z),drop=p.y-y;if(drop<=.08)continue;
    const flow=(Math.cos(a)*dir[0]+Math.sin(a)*dir[1]);
    const score=drop/step+.0008*flow;
    if(score>bestScore){bestScore=score;next={x,z,y};}
   }
   if(!next)break;
   path.push(next);p=next;
   if(signedHexDistance(p.x,p.z)<95)break;
  }
  if(path.length>best.length)best=path;
  if(best.length>110)break;
 }
 if(best.length<9)return null; // Never fabricate an uphill river when drainage fails.
 // Smooth/sparsify points while preserving a descending profile.
 const selected=best.filter((p,i)=>i%2===0||i===best.length-1);
 const result=[];let last=Infinity;
 for(let i=0;i<selected.length;i++){
  const p=selected[i],h=Math.min(p.y-1.6,last-.05);
  const w=lerp(14,37,clamp(i/selected.length,0,1))*(.83+.17*noise2(i*.4,0,seed+501));
  result.push({...p,waterY:h,halfWidth:w});last=h;
 }
 const segments=[];
 for(let i=0;i<result.length-1;i++)segments.push({a:result[i],b:result[i+1],minX:Math.min(result[i].x,result[i+1].x)-130,maxX:Math.max(result[i].x,result[i+1].x)+130,minZ:Math.min(result[i].z,result[i+1].z)-130,maxZ:Math.max(result[i].z,result[i+1].z)+130});
 // Spatial acceleration for terrain carving and object safety.
 const cells=new Map(),cellSize=360;
 const cellKey=(i,j)=>`${i},${j}`;
 for(let n=0;n<segments.length;n++){
  const s=segments[n],ix0=Math.floor(s.minX/cellSize),ix1=Math.floor(s.maxX/cellSize),iz0=Math.floor(s.minZ/cellSize),iz1=Math.floor(s.maxZ/cellSize);
  for(let ix=ix0;ix<=ix1;ix++)for(let iz=iz0;iz<=iz1;iz++){
   const k=cellKey(ix,iz),arr=cells.get(k)||[];arr.push(n);cells.set(k,arr);
  }
 }
 function sample(x,z){const cx=Math.floor(x/cellSize),cz=Math.floor(z/cellSize);let best=null;
  for(let i=cx-1;i<=cx+1;i++)for(let j=cz-1;j<=cz+1;j++)for(const n of cells.get(cellKey(i,j))||[]){
   const s=segments[n];const q=closestOnSegment(x,z,s.a.x,s.a.z,s.b.x,s.b.z);
   if(!best||q.d<best.distance)best={distance:q.d,waterY:lerp(s.a.waterY,s.b.waterY,q.t),halfWidth:lerp(s.a.halfWidth,s.b.halfWidth,q.t),direction:[s.b.x-s.a.x,s.b.z-s.a.z]};
  }
  return best;
 }
 function groundHeight(x,z){const y=baseHeight(x,z),p=sample(x,z);if(!p)return y;
  const t=p.distance/Math.max(1,p.halfWidth),carve=clamp((1.75-t)/1.25,0,1);
  if(!carve)return y;
  const bed=p.waterY-2.4+Math.max(0,t-.65)*6;
  return lerp(y,Math.min(y,bed),smoothstep(carve));
 }
 return {path:result,segments,sample,groundHeight,profileMonotonic:result.every((p,i)=>i===0||p.waterY<result[i-1].waterY)};
}
export function validateRiver(river){return !river||river.path.every((p,i)=>insideHex(p.x,p.z,40)&& (i===0||p.waterY<river.path[i-1].waterY));}
export function terrainSlope(height,x,z,step=22){return Math.hypot((height(x+step,z)-height(x-step,z))/(2*step),(height(x,z+step)-height(x,z-step))/(2*step));}
export function pickSpecies(biome,rng,wet=false){
 const species={
  1:['oak','oak','beech','maple','birch','pine','spruce','fir','cedar','willow'],2:['banyan','banyan','wideleaf','palm','oak','willow'],
  3:['spruce','spruce','fir','fir','pine','pine','birch'],4:['birch','dead','pine'],5:['acacia','acacia','umbrella','dead'],
  6:['oak','acacia','birch','beech'],7:['dead','acacia'],8:['willow','willow','banyan','birch'],9:['pine','spruce','fir','cedar'],
  10:['mangrove','mangrove','willow','palm'],11:['blueoak','blueoak','spruce','beech'],12:['birch','pine'],13:['mushroomtree','mushroomtree','willow'],14:['dead'],15:['blueoak','birch','dead']
 };
 const pool=species[biome]||species[1];if(wet&&rng()<.25&&[1,2,6,8,10].includes(biome))return 'willow';return pool[Math.floor(rng()*pool.length)];
}
export function countBiomeSamples(landscape,sampleStep=400){const stats={};
 for(let x=-HEX_RADIUS;x<=HEX_RADIUS;x+=sampleStep)for(let z=-HEX_RADIUS;z<=HEX_RADIUS;z+=sampleStep){if(!insideHex(x,z))continue;const b=landscape.biomeAt(x,z).id;stats[b]=(stats[b]||0)+1;}
 return stats;
}