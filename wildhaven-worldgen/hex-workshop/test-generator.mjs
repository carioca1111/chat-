import assert from 'node:assert/strict';
import {buildHexScene,defaultSettings,BIOME_STYLE} from './procedural.js';
import {insideHex,validateRiver,OBSERVABLE_DIAMETER_M} from './geography-core.js';
function region(id,main,other=null,rivers=0,lakes=0,range=400){const [q,r]=id.split('_').slice(1).map(Number);return {id,axial:{q,r},biomes:[{id:main,name:BIOME_STYLE[main].name,fraction:other?.fraction?1-other.fraction:1},...(other?[{id:other.id,name:BIOME_STYLE[other.id].name,fraction:other.fraction}]:[])],elevation_m:{min:30,max:range,mean:range*.44},rivers:Array.from({length:rivers},(_,i)=>`R${i}`),lakes:Array.from({length:lakes},(_,i)=>`L${i}`)};}
const forest=region('H_5_7',1,{id:5,fraction:.075},27,6,422);
const cfg={...defaultSettings(forest),trees:13,rocks:15,detail:10};
let build=buildHexScene(forest,cfg);
assert.equal(build.stats.observableDiameterMeters,10000);
assert(build.stats.sectors>=35,'Real terrain must comprise independent meshed sectors');
assert(build.stats.terrainTriangles>3000,'Terrain must be real polygonal geometry');
assert(build.stats.trees>100,'Forest must populate vegetation');
assert(build.stats.treeSpecies>=5,'Trees need independent geometry families');
assert(build.stats.hasRiver,'Bosque Cascatas should carry a descending watercourse');
assert(validateRiver(build.river),'No uphill water');
assert(build.river.path.every((p,i)=>i===0||p.waterY<build.river.path[i-1].waterY));
assert(build.stats.biomes['1']>0 && build.stats.biomes['5']>0,'Region must contain 2 documented sub-biomes');
assert.equal(build.stats.bridges+build.stats.ruins+build.stats.camps,0,'No mandatory human structures');
assert(Object.values(build.group.userData.boundsReport).every(Boolean),'All tree/rock footprints must fit within hex');
assert(build.group.children.some(c=>c.name.startsWith('Setor terreno')));
assert(build.group.children.some(c=>c.name.includes('Rochas')));
let triangles=0;build.group.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});
assert(triangles>8000);const summary={biomes:build.stats.biomes,trees:build.stats.trees,treeSpecies:build.stats.treeSpecies,rocks:build.stats.rocks,terrainSectors:build.stats.sectors,triangles:Math.round(triangles),riverDrop:build.stats.waterDrop_m};
// Test a dry region with multiple biomes, while keeping the population small for CI.
const dry=region('H_4_9',6,{id:1,fraction:.27},0,0,170);
build=buildHexScene(dry,{...defaultSettings(dry),trees:4,rocks:5,detail:2});
assert(!build.hasRiver);assert(Object.values(build.group.userData.boundsReport).every(Boolean));
assert(Object.keys(build.stats.biomes).length>=2);
console.log('PASS Hex Factory 0.4 mesh QA',JSON.stringify(summary));