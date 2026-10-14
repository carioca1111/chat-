'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const root=path.resolve(process.argv[2]||'gridium-build'),base=path.join(root,'assets','sniper');
const normal=path.join(base,'pokemon','normal'),shiny=path.join(base,'pokemon','shiny'),items=path.join(base,'items');
for(const dir of [normal,shiny,items])fs.mkdirSync(dir,{recursive:true});
const pokemonFallback=`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#07111d"/><circle cx="32" cy="32" r="20" fill="none" stroke="#138fff" stroke-width="3"/><path d="M12 32h40" stroke="#138fff" stroke-width="3"/><circle cx="32" cy="32" r="6" fill="#07111d" stroke="#76c8ff" stroke-width="3"/><text x="32" y="59" text-anchor="middle" font-size="9" fill="#8fb7d6">PKM</text></svg>`;
const itemFallback=`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#07111d"/><path d="M19 22h26l4 9-17 18L15 31z" fill="#10283d" stroke="#138fff" stroke-width="3"/><text x="32" y="36" text-anchor="middle" font-size="16" font-weight="700" fill="#76c8ff">?</text></svg>`;
fs.writeFileSync(path.join(base,'unknown-pokemon.svg'),pokemonFallback);fs.writeFileSync(path.join(base,'unknown-item.svg'),itemFallback);
const get=(url,file)=>new Promise(resolve=>{if(fs.existsSync(file)&&fs.statSync(file).size>100)return resolve(true);const req=https.get(url,{headers:{'user-agent':'Gridium-build'}},res=>{if(res.statusCode!==200){res.resume();return resolve(false);}const tmp=file+'.tmp';const out=fs.createWriteStream(tmp);res.pipe(out);out.on('finish',()=>out.close(()=>{try{if(fs.statSync(tmp).size>100){fs.renameSync(tmp,file);resolve(true);}else{fs.rmSync(tmp,{force:true});resolve(false);}}catch{resolve(false);}}));});req.setTimeout(15000,()=>req.destroy());req.on('error',()=>resolve(false));});
async function pool(tasks,limit=32){let i=0,ok=0;const workers=Array.from({length:limit},async()=>{while(i<tasks.length){const task=tasks[i++];if(await task())ok++;}});await Promise.all(workers);return ok;}
(async()=>{
  const tasks=[];
  for(let id=1;id<=1025;id++){
    tasks.push(()=>get(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,path.join(normal,`${id}.png`)));
    tasks.push(()=>get(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`,path.join(shiny,`${id}.png`)));
  }
  const pokemonOk=await pool(tasks,32);
  const itemNames=['poke-ball','great-ball','ultra-ball','master-ball','rare-candy','fire-stone','water-stone','thunder-stone','leaf-stone','moon-stone','sun-stone','dusk-stone','dawn-stone','shiny-stone','ice-stone','max-revive','revive','max-potion','hyper-potion','super-potion','potion'];
  const itemOk=await pool(itemNames.map(name=>()=>get(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${name}.png`,path.join(items,`${name}.png`))),12);
  const normalCount=fs.readdirSync(normal).filter(x=>x.endsWith('.png')).length,shinyCount=fs.readdirSync(shiny).filter(x=>x.endsWith('.png')).length;
  if(normalCount<900)throw new Error(`Sprite library incomplete: only ${normalCount} normal Pokemon sprites downloaded`);
  if(shinyCount<700)throw new Error(`Sprite library incomplete: only ${shinyCount} shiny Pokemon sprites downloaded`);
  console.log(`Sniper local sprites ready: ${normalCount} normal, ${shinyCount} shiny, ${itemOk} items (${pokemonOk} downloaded this run)`);
})().catch(e=>{console.error(e);process.exit(1);});
