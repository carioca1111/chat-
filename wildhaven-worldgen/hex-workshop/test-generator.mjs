import assert from 'node:assert/strict';
import {buildHexScene,defaultSettings,BIOME_STYLE} from './procedural.js';

function region(id, biome, rivers){
 return {id,axial:{q:5,r:7},biomes:[{id:biome,name:BIOME_STYLE[biome].name,fraction:1}],rivers:Array.from({length:rivers},(_,i)=>`R${i}`)};
}
const forest=region('H_5_7',1,27);
const first=buildHexScene(forest,defaultSettings(forest));
assert(first.group.children.length>6,'First hex must contain real meshes');
assert(first.hasRiver,'Rivers sourced from the selected Auralis region');
assert(first.stats.trees>0,'Temperate forest should contain trees');
assert(first.stats.rocks>50,'Forest has geological instanced meshes');
assert(first.group.getObjectByName('Rio 3D (trajetória cênica)'),'Actual river mesh exists');
assert(first.group.getObjectByName('Bordas rochosas do hexágono'),'Actual cliff edge mesh exists');
const again=buildHexScene(forest,defaultSettings(forest));
assert.deepEqual(first.stats,again.stats,'Same region and seed are deterministic');
const forestWithoutRivers=buildHexScene(region('H_5_7',1,0),defaultSettings(forest));
assert(!forestWithoutRivers.hasRiver,'No fabricated river when Codex river list is empty');
const ocean=buildHexScene(region('H_0_0',0,0),defaultSettings(forest));
assert.equal(ocean.stats.biome_id,0,'Ocean remains ocean');
assert.equal(ocean.stats.rivers,0);
console.log('Hex Factory procedural tests passed:',first.stats);