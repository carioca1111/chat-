import assert from 'node:assert/strict';
import {makeDNA,makeLandscape,createRiver,insideHex,signedHexDistance,hexCorners,validateRiver,OBSERVABLE_DIAMETER_M,countBiomeSamples,randomSource,pickSpecies} from './geography-core.js';
function region(id,main,second=null,riverCount=0,lakes=0,elev=400){const [q,r]=id.split('_').slice(1).map(Number);return {id,axial:{q,r},biomes:[{id:main,fraction:second?.fraction?1-second.fraction:1,name:'main'},...(second?[{id:second.id,fraction:second.fraction,name:'second'}]:[])],elevation_m:{min:10,max:elev,mean:elev*.42},rivers:Array.from({length:riverCount},(_,i)=>`R${i}`),lakes:Array.from({length:lakes},(_,i)=>`L${i}`)};}
const forest=region('H_5_7',1,{id:5,fraction:.075},27,6,422);
assert.equal(OBSERVABLE_DIAMETER_M,10000);
const dna=makeDNA(forest);assert.equal(dna.observable_diameter_m,10000);assert.equal(dna.main,1);assert.equal(dna.hasRiver,true);
assert.equal(JSON.stringify(dna),JSON.stringify(makeDNA(forest)),'Same macro region must produce deterministic geography');
const l=makeLandscape(forest),r=createRiver(l,{water:80});assert(r,'Bosque das Cascatas must have a plausible downhill drainage channel');
assert(r.path.length>=9,'Drainage path needs sufficient geometry');assert(validateRiver(r));assert(r.path.every(p=>insideHex(p.x,p.z,40)));
assert(r.path.every((p,i)=>i===0||p.waterY<r.path[i-1].waterY),'Monotonically decreasing water profile');
for(const p of r.path){const h=r.groundHeight(p.x,p.z);assert(h<=p.waterY-1,'River centerline must be cut below water surface');}
const counts=countBiomeSamples(l,200);assert((counts[1]||0)>0&&(counts[5]||0)>0,'Both documented biomes must appear');
const alt=makeLandscape(forest,{seed:5,relief:65});
for(const [x,z] of [[0,0],[400,1000],[1250,-1700],[-2200,600]])assert.equal(l.baseHeight(x,z),alt.baseHeight(x,z),'Art seed cannot alter geographic backbone');
const drought=makeLandscape(region('H_3_9',7,null,0,0,110));assert.equal(createRiver(drought),null,'No hydrological source: no river');
const multi=makeLandscape(region('H_4_7',1,{id:6,fraction:.34},8,0,780));assert(Object.keys(countBiomeSamples(multi,250)).length>=2);
const corners=hexCorners();assert(corners.length===6);for(const [x,z] of corners)assert(insideHex(x,z));assert(!insideHex(5001,0));
const random=randomSource(20051028);const species=new Set(Array.from({length:100},()=>pickSpecies(1,random,false)));assert(species.size>=5);
let sampleResult=[];for(let i=0;i<24;i++){const m=makeDNA(region(`H_${i%8}_${6+Math.floor(i/8)}`,i%3===0?1:i%3===1?6:9,{id:5,fraction:.17},i%4===0?0:13,0,130+i*73));sampleResult.push(m.archetype);}
assert(new Set(sampleResult).size>=4,'Macroforms should vary geographically');
console.log('PASS geography-core:',{observableDiameterM:OBSERVABLE_DIAMETER_M,riverPoints:r.path.length,riverDropM:+(r.path[0].waterY-r.path.at(-1).waterY).toFixed(1),biomes:counts,archetypes:[...new Set(sampleResult)]});