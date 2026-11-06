import assert from 'node:assert/strict';
import {buildHexScene,defaultSettings,BIOME_STYLE,analyzeRegion} from './procedural.js';
function region(id,biome,rivers,elevRange=400,lakes=0){
 const [q,r]=id.split('_').slice(1).map(Number);
 return {id,axial:{q,r},biomes:[{id:biome,name:BIOME_STYLE[biome].name,fraction:1}],
  elevation_m:{mean:200,min:20,max:20+elevRange},rivers:Array.from({length:rivers},(_,i)=>`R${i}`),
  lakes:Array.from({length:lakes},(_,i)=>`L${i}`)};
}
const forest=region('H_5_7',1,27);
const first=buildHexScene(forest,defaultSettings(forest));
assert(first.group.children.length>=4,'Real 3D scene must be generated');
assert(first.stats.trees>100,'Forests must have full scale populations');
assert(first.stats.treeSpecies>=5,'Forests must have many visibly distinct species');
assert(first.stats.scenicDiameterUnits>=400,'Scenic area must be larger than the old small diorama');
assert.equal(first.stats.bridges,0,'No mandatory bridges');
assert.equal(first.stats.camps,0,'No mandatory camps');
assert.equal(first.stats.ruins,0,'No mandatory ruins');
assert(first.group.getObjectByName('Terreno 3D variável'),'Actual terrain mesh is necessary');
const normals=first.group.getObjectByName('Terreno 3D variável').geometry.getAttribute('normal');
assert(normals.getY(0)>0,'Terrain surface must face upward to prevent black inverted ground');
const repeat=buildHexScene(forest,defaultSettings(forest));
assert.deepEqual(first.stats,repeat.stats,'Same region and seed must be deterministic');
const noRiver=buildHexScene(region('H_5_6',1,0),defaultSettings(forest));
assert(!noRiver.hasRiver,'Do not invent river where geographic source has zero rivers');
const desert=buildHexScene(region('H_6_3',7,0,240),defaultSettings(forest));
assert(desert.stats.trees<first.stats.trees*.2,'Arid areas must not become forests');
const mountain=buildHexScene(region('H_1_3',9,2,2300),defaultSettings(forest));
assert(mountain.stats.archetype!=='planicie','High-relief mountain regions cannot use flat plains');
const variation=new Set(Array.from({length:25},(_,i)=>analyzeRegion(region(`H_${i%8}_${Math.floor(i/8)+6}`,1,i%3===0?0:5,450)).archetype));
assert(variation.size>=5,'Neighboring scenic regions must support diverse landforms');
let withRiver=0,withoutRiver=0;
for(let i=0;i<75;i++){const m=analyzeRegion(region(`H_${i}_7`,1,6));m.localRiver?withRiver++:withoutRiver++;}
assert(withRiver>0&&withoutRiver>0,'Rivers must be optional in a macroregion with river segments');
for(const item of [first,repeat,noRiver,desert,mountain])item.group.traverse(o=>{if(o.isMesh){o.geometry?.dispose();o.material?.dispose();}});
console.log('Hex Factory landscape QA passed',{scene:first.stats.scenarioKey,trees:first.stats.trees,species:first.stats.treeSpecies,landforms:variation.size,waterSamples:{withRiver,withoutRiver}});