(() => {
'use strict';

const $=id=>document.getElementById(id);
const canvas=$('spaceCanvas'),ctx=canvas.getContext('2d',{alpha:false});
const panelContent=$('panelContent'),mineButton=$('mineButton');
const TAU=Math.PI*2;

const SAVE_KEY='starforge-alpha-1.0';
const OLD_KEYS=['starforge-alpha-0.9','starforge-alpha-0.8','starforge-alpha-0.7','starforge-alpha-0.6','starforge-alpha-0.1'];
const MINERAL_CHANCE=1/8;
const CRYSTAL_SHARE=.006;
const RES={
  iron:{name:'Iron Ore',value:3,size:1},
  nickel:{name:'Nickel',value:7,size:2},
  cobalt:{name:'Cobalt',value:13,size:3},
  titanium:{name:'Titanium',value:28,size:4},
  crystal:{name:'Crystal',value:65,size:6}
};

const SECTORS=[
{id:'sol',name:'Sol Belt',x:22,y:77,color:'#ffb83e',subs:[
  {id:'sol-a',name:'Helios Fringe',x:16,y:80,pirates:0,metalChance:0,drops:{iron:68,nickel:22,cobalt:8,titanium:2,crystal:.6}},
  {id:'sol-b',name:'Cinder Ring',x:24,y:72,pirates:.04,metalChance:.25,drops:{iron:58,nickel:25,cobalt:12,titanium:5,crystal:.6}},
  {id:'sol-c',name:'Trojan Drift',x:30,y:80,pirates:0,metalChance:0,drops:{iron:72,nickel:16,cobalt:8,titanium:4,crystal:.6}},
  {id:'sol-d',name:'Aurora Belt',x:21,y:68,pirates:.02,metalChance:.40,drops:{iron:51,nickel:28,cobalt:14,titanium:7,crystal:.6}}
]},
{id:'red',name:'Red Veil',x:18,y:48,color:'#ff4a52',subs:[
  {id:'red-a',name:'Ember Gate',x:11,y:49,pirates:.10,drops:{iron:39,nickel:28,cobalt:18,titanium:15,crystal:.6}},
  {id:'red-b',name:'Ash Belt',x:18,y:40,pirates:.04,drops:{iron:33,nickel:27,cobalt:20,titanium:20,crystal:.6}},
  {id:'red-c',name:'Crimson Rift',x:25,y:46,pirates:.20,drops:{iron:28,nickel:24,cobalt:21,titanium:27,crystal:.6}},
  {id:'red-d',name:'Scarlet Core',x:26,y:55,pirates:.30,drops:{iron:25,nickel:23,cobalt:20,titanium:32,crystal:.6}}
]},
{id:'crystal',name:'Crystal Reach',x:27,y:19,color:'#45e8ff',subs:[
  {id:'crystal-a',name:'Glass Shoals',x:21,y:19,pirates:0,drops:{iron:37,nickel:24,cobalt:16,titanium:23,crystal:.6}},
  {id:'crystal-b',name:'Prism Fields',x:28,y:12,pirates:.05,drops:{iron:28,nickel:22,cobalt:18,titanium:32,crystal:.6}},
  {id:'crystal-c',name:'Blue Spires',x:34,y:21,pirates:.12,drops:{iron:24,nickel:20,cobalt:18,titanium:38,crystal:.6}},
  {id:'crystal-d',name:'Silent Lattice',x:26,y:28,pirates:0,drops:{iron:31,nickel:22,cobalt:18,titanium:29,crystal:.6}}
]},
{id:'void',name:'Void Reach',x:51,y:17,color:'#a66cff',subs:[
  {id:'void-a',name:'Null Crossing',x:45,y:14,pirates:.08,drops:{iron:25,nickel:21,cobalt:20,titanium:34,crystal:.6}},
  {id:'void-b',name:'Violet Wake',x:52,y:10,pirates:.16,drops:{iron:20,nickel:19,cobalt:20,titanium:41,crystal:.6}},
  {id:'void-c',name:'Eventide',x:58,y:18,pirates:.22,drops:{iron:18,nickel:18,cobalt:21,titanium:43,crystal:.6}},
  {id:'void-d',name:'Quiet Maw',x:51,y:25,pirates:.04,drops:{iron:23,nickel:20,cobalt:22,titanium:35,crystal:.6}}
]},
{id:'dark',name:'Dark Expanse',x:79,y:18,color:'#ff4cbb',subs:[
  {id:'dark-a',name:'Umbra Line',x:73,y:15,pirates:.18,drops:{iron:18,nickel:18,cobalt:22,titanium:42,crystal:.6}},
  {id:'dark-b',name:'Black Current',x:80,y:10,pirates:.32,drops:{iron:15,nickel:17,cobalt:22,titanium:46,crystal:.6}},
  {id:'dark-c',name:'Night Spiral',x:86,y:18,pirates:.38,drops:{iron:13,nickel:16,cobalt:22,titanium:49,crystal:.6}},
  {id:'dark-d',name:'Dusk Anchorage',x:78,y:27,pirates:.12,drops:{iron:20,nickel:19,cobalt:22,titanium:39,crystal:.6}}
]},
{id:'deep',name:'Deep Frontier',x:68,y:43,color:'#4c9dff',subs:[
  {id:'deep-a',name:'Long Drift',x:61,y:42,pirates:0,drops:{iron:38,nickel:24,cobalt:19,titanium:19,crystal:.6}},
  {id:'deep-b',name:'Far Lantern',x:69,y:35,pirates:.08,drops:{iron:33,nickel:23,cobalt:20,titanium:24,crystal:.6}},
  {id:'deep-c',name:'Blue March',x:75,y:43,pirates:.15,drops:{iron:28,nickel:22,cobalt:21,titanium:29,crystal:.6}},
  {id:'deep-d',name:'Cold Meridian',x:68,y:51,pirates:0,drops:{iron:35,nickel:24,cobalt:20,titanium:21,crystal:.6}}
]},
{id:'grave',name:'Graveyard',x:69,y:74,color:'#9f63ff',subs:[
  {id:'grave-a',name:'Broken Convoy',x:62,y:71,pirates:.20,drops:{iron:32,nickel:23,cobalt:23,titanium:22,crystal:.6}},
  {id:'grave-b',name:'Wreck Halo',x:70,y:66,pirates:.28,drops:{iron:27,nickel:22,cobalt:25,titanium:26,crystal:.6}},
  {id:'grave-c',name:'Ghost Dock',x:77,y:75,pirates:.35,drops:{iron:24,nickel:21,cobalt:26,titanium:29,crystal:.6}},
  {id:'grave-d',name:'Quiet Debris',x:68,y:82,pirates:.06,drops:{iron:38,nickel:24,cobalt:22,titanium:16,crystal:.6}}
]},
{id:'relic',name:'Relic Zone',x:88,y:44,color:'#ffbf4c',subs:[
  {id:'relic-a',name:'Outer Ruins',x:84,y:38,pirates:.08,drops:{iron:25,nickel:22,cobalt:22,titanium:31,crystal:.6}},
  {id:'relic-b',name:'Ringfall',x:91,y:38,pirates:.18,drops:{iron:21,nickel:20,cobalt:23,titanium:36,crystal:.6}},
  {id:'relic-c',name:'Ancient Gate',x:92,y:49,pirates:.25,drops:{iron:18,nickel:19,cobalt:23,titanium:40,crystal:.6}},
  {id:'relic-d',name:'Dust Archive',x:85,y:51,pirates:0,drops:{iron:29,nickel:23,cobalt:22,titanium:26,crystal:.6}}
]}
];

const SECTOR_LINKS=[['sol','red'],['red','crystal'],['crystal','void'],['void','dark'],['dark','deep'],['deep','relic'],['deep','grave'],['grave','sol'],['red','deep'],['void','deep']];
const sectorById=id=>SECTORS.find(s=>s.id===id)||SECTORS[0];
const subById=id=>{for(const s of SECTORS){const q=s.subs.find(v=>v.id===id);if(q)return {...q,sector:s.id,sectorName:s.name,color:s.color};}return {...SECTORS[0].subs[0],sector:'sol',sectorName:'Sol Belt',color:SECTORS[0].color};};

const SVG={
ship:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 92"><g stroke="#07101a" stroke-width="5" stroke-linejoin="round"><path fill="#273241" d="M50 7 66 35 86 45 73 68 60 61 57 82 43 82 40 61 27 68 14 45 34 35Z"/><path fill="#364455" d="M50 14 59 39 50 55 41 39Z"/><path fill="#5ee9ff" d="M50 21 55 39 50 47 45 39Z"/><path fill="#45ddff" d="M18 45h16v6H18zm48 0h16v6H66z"/></g></svg>`,
rock1:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112"><path fill="#59606b" stroke="#171b22" stroke-width="6" d="M20 14 48 5 82 10 106 31 113 60 98 88 72 105 40 104 14 88 5 61 9 34Z"/><path fill="#717985" d="m20 14 28 10 20-13 25 21-16 19-31-6-18 18-19-28Z"/><g fill="#2b3038"><ellipse cx="82" cy="34" rx="13" ry="10"/><ellipse cx="38" cy="77" rx="12" ry="10"/><ellipse cx="86" cy="79" rx="8" ry="7"/></g></svg>`,
rock2:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112"><path fill="#555d68" stroke="#171b22" stroke-width="6" d="M16 20 43 6 78 8 106 23 114 51 103 83 78 104 45 108 14 92 6 67 8 39Z"/><path fill="#6c7480" d="M19 22 43 14 65 20 88 14 101 35 83 49 56 42 38 57 12 48Z"/><g fill="#282e36"><ellipse cx="53" cy="74" rx="18" ry="13"/><ellipse cx="91" cy="58" rx="9" ry="7"/><ellipse cx="27" cy="39" rx="7" ry="6"/></g></svg>`,
rock3:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112"><path fill="#5b626d" stroke="#171b22" stroke-width="6" d="M29 7 62 5 91 17 111 42 106 72 87 99 53 108 23 97 7 73 9 42Z"/><path fill="#737b87" d="M31 13 57 21 84 17 99 39 80 55 61 49 46 66 20 53 18 34Z"/><g fill="#2a3038"><ellipse cx="70" cy="78" rx="15" ry="12"/><ellipse cx="34" cy="82" rx="8" ry="6"/><ellipse cx="88" cy="34" rx="8" ry="6"/></g></svg>`,
metal1:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112"><path fill="#3e4651" stroke="#131820" stroke-width="6" d="M17 16 47 5 83 11 108 34 112 63 96 91 68 106 36 102 11 83 6 52Z"/><path fill="#7c8794" d="M18 18 48 12 72 18 96 15 104 37 81 49 53 43 29 57 10 43Z"/><path d="M13 79 36 66 60 70 84 55 107 61" fill="none" stroke="#d08b38" stroke-width="7"/><g fill="#242a32"><ellipse cx="84" cy="31" rx="10" ry="8"/><ellipse cx="42" cy="83" rx="10" ry="8"/></g></svg>`,
metal2:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112"><path fill="#414a55" stroke="#131820" stroke-width="6" d="M24 9 58 4 91 18 110 44 106 76 83 101 51 108 20 94 7 66 10 35Z"/><path fill="#89939e" d="M28 14 55 11 84 21 97 40 77 54 50 47 31 62 13 48Z"/><path d="M20 25 42 38 65 33 88 48 103 45" fill="none" stroke="#c47b2f" stroke-width="6"/><g fill="#252b33"><ellipse cx="69" cy="80" rx="13" ry="10"/><ellipse cx="31" cy="75" rx="8" ry="6"/></g></svg>`,
metal3:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112"><path fill="#434b56" stroke="#131820" stroke-width="6" d="M15 25 40 7 75 8 104 27 113 57 100 87 72 105 39 104 14 88 6 59Z"/><path fill="#818c98" d="M18 28 41 16 65 22 88 16 101 38 83 55 58 49 34 61 13 47Z"/><path d="M10 84 30 68 53 73 76 62 106 70" fill="none" stroke="#d28e3c" stroke-width="7"/><path d="M27 20 45 31 62 27" fill="none" stroke="#e6b35e" stroke-width="4"/><g fill="#252b33"><ellipse cx="84" cy="82" rx="9" ry="7"/></g></svg>`,
frag:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 46"><path fill="#3a4452" stroke="#141b24" stroke-width="4" d="m7 11 19-7 16 12-4 20-18 6L5 30Z"/><path fill="#505b69" d="m10 13 16-5 7 10-12 10-12-4Z"/></svg>`,
hit:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path fill="#4de7ff" stroke="#dffcff" stroke-width="3" d="m40 5 7 22 20-9-12 19 20 8-22 5 7 21-16-15-12 19 1-23-23 3 19-13-17-15 22 6Z"/><circle cx="40" cy="41" r="8" fill="#fff"/></svg>`
};

const ITEM_SVG={
iron:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><path fill="#10141b" d="M8 5h15v3h4v11h-3v5H9v-3H5V10h3z"/><path fill="#9da7b5" d="M9 7h13v3h4v8h-4v4H10v-3H7v-8h3z"/><path fill="#e3e9f1" d="M11 8h9v3h-4v3h-7v-3h2z"/><path fill="#626b78" d="M18 15h7v5h-4v3h-8v-3h5z"/></svg>`,
nickel:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><path fill="#17130b" d="M8 5h15v3h4v11h-3v5H9v-3H5V10h3z"/><path fill="#c37c12" d="M9 7h13v3h4v8h-4v4H10v-3H7v-8h3z"/><path fill="#ffd45b" d="M11 8h9v3h-4v3H9v-3h2z"/><path fill="#8f4f08" d="M17 15h8v5h-4v3h-8v-3h4z"/></svg>`,
cobalt:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><path fill="#071329" d="M8 5h15v3h4v11h-3v5H9v-3H5V10h3z"/><path fill="#1b64c7" d="M9 7h13v3h4v8h-4v4H10v-3H7v-8h3z"/><path fill="#66b8ff" d="M11 8h9v3h-4v3H9v-3h2z"/><path fill="#0b3d8b" d="M17 15h8v5h-4v3h-8v-3h4z"/></svg>`,
titanium:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><path fill="#241033" d="M8 5h15v3h4v11h-3v5H9v-3H5V10h3z"/><path fill="#8f35c7" d="M9 7h13v3h4v8h-4v4H10v-3H7v-8h3z"/><path fill="#e77cff" d="M11 8h9v3h-4v3H9v-3h2z"/><path fill="#5a1c82" d="M17 15h8v5h-4v3h-8v-3h4z"/></svg>`,
crystal:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><path fill="#072630" d="M14 3h5v4h3v5h4v12h-5v4H9v-4H5V14h4V8h5z"/><path fill="#19bed8" d="M15 5h3v9h4v9h-4v3h-7v-3H7v-7h4V10h4z"/><path fill="#a8f8ff" d="M15 6h2v9h-4v-5h2zM10 16h3v7h-3z"/><path fill="#057a9a" d="M18 15h6v8h-6z"/></svg>`
};
const itemIconCache={};
function itemIcon(k){if(!itemIconCache[k])itemIconCache[k]='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(ITEM_SVG[k]);return itemIconCache[k];}

const defaults=()=>({credits:260,gems:35,inventory:{iron:0,nickel:0,cobalt:0,titanium:0,crystal:0},cargo:0,shipLevel:1,laserLevel:1,cargoLevel:1,efficiencyLevel:1,sector:'sol',subsector:'sol-a',mining:false,shield:100,sound:true,lastSeen:Date.now(),travel:null,killsInSub:0,autoRoam:true});
function load(){try{let raw=localStorage.getItem(SAVE_KEY);if(!raw)for(const k of OLD_KEYS){raw=localStorage.getItem(k);if(raw)break;}if(!raw)return defaults();const p=JSON.parse(raw),d=defaults(),s={...d,...p,inventory:{...d.inventory,...(p.inventory||{})}};if(!SECTORS.some(v=>v.id===s.sector))s.sector='sol';if(!SECTORS.some(v=>v.subs.some(q=>q.id===s.subsector)))s.subsector=sectorById(s.sector).subs[0].id;const ss=subById(s.subsector);s.sector=ss.sector;s.cargo=Object.entries(s.inventory).reduce((n,[k,q])=>n+(RES[k]?.size||1)*Math.max(0,q||0),0);s.shield=Number.isFinite(s.shield)?s.shield:100;if(s.travel&&Date.now()>=s.travel.endAt){s.sector=s.travel.toSector;s.subsector=s.travel.to;s.travel=null;s.killsInSub=0;}return s;}catch{return defaults();}}
let state=load(),assets={},activeTab='cargo',toastTimer=0,audio=null,last=performance.now(),nextId=1,selectedSector=state.sector,selectedSub=state.subsector;
const world={w:innerWidth,h:innerHeight,dpr:1,time:0,shake:0,zoom:1,targetZoom:1,asteroids:[],fragments:[],particles:[],exhaust:[],pirates:[],shots:[],target:null,spawnTimer:0,laser:false,particleTimer:0,exhaustTimer:0,pirateTimer:20,dangerText:'ROTA SEGURA',camera:{x:0,y:0,vx:0,vy:0},ship:{x:0,y:0,vx:0,vy:0,angle:-Math.PI/2,avoidX:0,avoidY:0,dodgeHold:0,threatId:0,dodgeSide:0,hitTimer:0,recoveryTimer:0}};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a),dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by),fmt=n=>Math.floor(n).toLocaleString('pt-BR'),fmtTime=s=>{s=Math.max(0,Math.ceil(s));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
const currentSector=()=>sectorById(state.sector),currentSub=()=>subById(state.subsector),cap=()=>100+(state.cargoLevel-1)*40,mineRate=()=>1+(state.laserLevel-1)*.35,laserDps=()=>18+state.laserLevel*5,efficiency=()=>1+(state.efficiencyLevel-1)*.05,asteroidCount=()=>Math.round(clamp(world.w*world.h/52000,innerWidth<700?11:18,innerWidth<700?16:28));
const cameraLeft=()=>world.camera.x-world.w/(2*world.zoom),cameraTop=()=>world.camera.y-world.h/(2*world.zoom),sx=x=>(x-cameraLeft())*world.zoom,sy=y=>(y-cameraTop())*world.zoom;
function save(){state.lastSeen=Date.now();localStorage.setItem(SAVE_KEY,JSON.stringify(state));}
function visible(o,m=120){const x=sx(o.x),y=sy(o.y),r=(o.r||8)*world.zoom;return x>-m-r&&x<world.w+m+r&&y>-m-r&&y<world.h+m+r;}
function loadAssets(){return Promise.all(Object.entries(SVG).map(([k,v])=>new Promise(r=>{const i=new Image();i.onload=()=>{assets[k]=i;r();};i.onerror=r;i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(v);})));}
function upgradeCost(t){const lv=t==='laser'?state.laserLevel:t==='cargo'?state.cargoLevel:state.efficiencyLevel;return Math.round((t==='laser'?150:t==='cargo'?200:300)*1.62**(lv-1));}

function effectiveDrops(sub=currentSub()){
  const raw=sub.drops||{},nonKeys=['iron','nickel','cobalt','titanium'];
  const nonTotal=nonKeys.reduce((s,k)=>s+Math.max(0,raw[k]||0),0)||1;
  const remain=1-CRYSTAL_SHARE,out={};
  for(const k of nonKeys)out[k]=(Math.max(0,raw[k]||0)/nonTotal)*remain;
  out.crystal=CRYSTAL_SHARE;
  return out;
}
function weightedResource(){const w=effectiveDrops(),r=Math.random();let c=0;for(const k of ['iron','nickel','cobalt','titanium','crystal']){c+=w[k];if(r<=c)return k;}return'iron';}
function asteroidLoot(r){
  const out={iron:0,nickel:0,cobalt:0,titanium:0,crystal:0};
  if(Math.random()>=MINERAL_CHANCE)return{bundle:out,mineralized:false,ore:null,units:0};
  const ore=weightedResource(),units=Math.max(1,Math.round((r*r)/880*rand(.72,1.18)));
  out[ore]=units;
  return{bundle:out,mineralized:true,ore,units};
}
function addLoot(bundle,announce=true){let added=0,rejected=0,gained={};for(const[k,q]of Object.entries(bundle)){const size=RES[k].size;let take=0;for(let i=0;i<q;i++){if(state.cargo+size>cap()){rejected+=q-i;break;}state.inventory[k]++;state.cargo+=size;take++;added++;}if(take)gained[k]=take;}if(announce&&added){const t=Object.entries(gained).map(([k,n])=>`${n} ${RES[k].name}`).join(' · ');toast(`Minério encontrado: ${t}${rejected?' · sem espaço para o resto':''}`);}else if(announce&&rejected)toast('Minério encontrado, mas o cargueiro está sem espaço.');if(state.cargo>=cap())state.mining=false;return added;}

function asteroidClassForSub(){const sub=currentSub();if(sub.sector!=='sol')return'rocky';return Math.random()<(sub.metalChance||0)?'metallic':'rocky';}
function asteroidSprite(type){const n=1+Math.floor(Math.random()*3);return type==='metallic'?`metal${n}`:`rock${n}`;}
function asteroidHp(r,type){const hardness=type==='metallic'?1.32:1;return Math.round((24+Math.pow(r,1.42)*1.25)*hardness);}
function sizeLabel(r){return r<28?'PEQUENO':r<48?'MÉDIO':r<64?'GRANDE':'MASSIVO';}
function breakSeconds(a){return a?Math.max(.1,a.hp/laserDps()):0;}
function asteroidTypeLabel(sub=currentSub()){if(sub.sector!=='sol')return'Rochosos';const p=Math.round((sub.metalChance||0)*100);return p?`Rochosos + ${p}% metálicos`:'Somente rochosos';}

function offline(){const e=Math.max(0,Date.now()-(state.lastSeen||Date.now()))/1000;if(!state.mining||state.travel||e<20)return;const avgBreak=(24+Math.pow(36,1.42)*1.25)/laserDps()+8;const completed=Math.min(48,Math.floor(e/Math.max(10,avgBreak)));let collected=0,found=0;for(let i=0;i<completed;i++){const x=asteroidLoot(rand(24,46));if(x.mineralized){found++;collected+=addLoot(x.bundle,false);}if(state.cargo>=cap())break;}if(completed)setTimeout(()=>toast(`Expedição offline: ${completed} asteroides · ${found} com minério · +${collected} itens`),450);}
function resize(){world.dpr=Math.min(2,devicePixelRatio||1);world.w=Math.max(320,innerWidth);world.h=Math.max(320,innerHeight);canvas.width=world.w*world.dpr;canvas.height=world.h*world.dpr;canvas.style.width=world.w+'px';canvas.style.height=world.h+'px';ctx.setTransform(world.dpr,0,0,world.dpr,0,0);while(world.asteroids.length<asteroidCount())spawnAsteroid();}
function resetField(){world.asteroids=[];world.fragments=[];world.particles=[];world.pirates=[];world.shots=[];world.target=null;world.laser=false;world.pirateTimer=rand(15,32);world.ship.x=0;world.ship.y=0;world.ship.vx=0;world.ship.vy=0;world.camera.x=-40;world.camera.y=0;world.camera.vx=world.camera.vy=0;while(world.asteroids.length<asteroidCount())spawnAsteroid();}
function spawnAsteroid(){
  const r=Math.random()<.18?rand(48,76):Math.random()<.5?rand(28,47):rand(14,27),type=asteroidClassForSub(),density=type==='metallic'?rand(1.15,1.55):rand(.75,1.25),mass=Math.max(8,r*r*density),vh=Math.hypot(world.w/(2*world.zoom),world.h/(2*world.zoom)),radius=vh+rand(280,Math.max(520,vh*.8)),a=rand(0,TAU),x=world.camera.x+Math.cos(a)*radius,y=world.camera.y+Math.sin(a)*radius,drift=a+Math.PI+rand(-1.15,1.15),speed=rand(7,26);
  const mined=asteroidLoot(r),b={id:nextId++,x,y,vx:Math.cos(drift)*speed,vy:Math.sin(drift)*speed,r,mass,density,rot:rand(0,TAU),spin:rand(-.42,.42),type,sprite:asteroidSprite(type),loot:mined.bundle,mineralized:mined.mineralized,ore:mined.ore,units:mined.units};
  b.maxHp=b.hp=asteroidHp(r,type);world.asteroids.push(b);return b;
}
function chooseTarget(){if(!state.mining||state.travel||state.cargo>=cap()){world.target=null;return;}const sh=world.ship;let best=null,score=Infinity;for(const a of world.asteroids){const d=dist(sh.x,sh.y,a.x,a.y);if(d<90)continue;const rel=Math.hypot(a.vx-sh.vx,a.vy-sh.vy),sc=d+rel*5-a.r*.7;if(sc<score){score=sc;best=a;}}world.target=best;}
function burst(x,y,n,color){for(let i=0;i<n;i++){const a=rand(0,TAU),v=rand(30,180),life=rand(.25,.85);world.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life,maxLife:life,size:rand(1,4),color});}}
function destroyAsteroid(a){
  const i=world.asteroids.indexOf(a);if(i>=0)world.asteroids.splice(i,1);
  for(let j=0,n=Math.floor(rand(4,8));j<n;j++){const ang=rand(0,TAU),v=rand(42,128),r=rand(6,Math.min(16,a.r*.32));world.fragments.push({id:nextId++,x:a.x,y:a.y,vx:a.vx+Math.cos(ang)*v,vy:a.vy+Math.sin(ang)*v,r,mass:Math.max(1,r*r*.55),rot:rand(0,TAU),spin:rand(-2.5,2.5),life:rand(7,12),dangerous:true});}
  const color=a.ore==='crystal'?'#4de7ff':a.type==='metallic'?'#d69a52':'#c8d0dd';burst(a.x,a.y,32,color);world.shake=7;sound('break');
  if(a.mineralized)addLoot(a.loot,true);else toast('Asteroide quebrado: sem minério aproveitável.');
  state.killsInSub=(state.killsInSub||0)+1;if(world.target===a)world.target=null;if(state.mining&&state.cargo<cap())chooseTarget();save();
}
function resolveBodyCollision(a,b){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),md=a.r+b.r;if(d<=0||d>=md)return;const nx=dx/d,ny=dy/d,ov=md-d,ia=1/Math.max(1,a.mass),ib=1/Math.max(1,b.mass),sum=ia+ib;a.x-=nx*ov*(ia/sum);a.y-=ny*ov*(ia/sum);b.x+=nx*ov*(ib/sum);b.y+=ny*ov*(ib/sum);const rvx=b.vx-a.vx,rvy=b.vy-a.vy,vel=rvx*nx+rvy*ny;if(vel>0)return;const rest=.72,j=-(1+rest)*vel/(ia+ib),ix=j*nx,iy=j*ny;a.vx-=ix*ia;a.vy-=iy*ia;b.vx+=ix*ib;b.vy+=iy*ib;a.spin+=rand(-.18,.18);b.spin+=rand(-.18,.18);}
function physics(dt){for(const a of world.asteroids){a.x+=a.vx*dt;a.y+=a.vy*dt;a.rot+=a.spin*dt;}for(let i=0;i<world.asteroids.length;i++)for(let j=i+1;j<world.asteroids.length;j++)resolveBodyCollision(world.asteroids[i],world.asteroids[j]);for(const f of world.fragments){f.x+=f.vx*dt;f.y+=f.vy*dt;f.rot+=f.spin*dt;f.life-=dt;}world.fragments=world.fragments.filter(f=>f.life>0&&dist(f.x,f.y,world.camera.x,world.camera.y)<2600);for(let i=world.asteroids.length-1;i>=0;i--){const a=world.asteroids[i];if(a!==world.target&&dist(a.x,a.y,world.camera.x,world.camera.y)>2600)world.asteroids.splice(i,1);}while(world.asteroids.length<asteroidCount())spawnAsteroid();}
function danger(dt){const sh=world.ship;if(sh.dodgeHold>0){sh.dodgeHold-=dt;return;}let best=null,bestT=99;for(const b of[...world.fragments,...world.asteroids]){const rx=b.x-sh.x,ry=b.y-sh.y,rvx=b.vx-sh.vx,rvy=b.vy-sh.vy,v2=rvx*rvx+rvy*rvy;if(v2<1)continue;const t=clamp(-(rx*rvx+ry*rvy)/v2,0,1.8),px=rx+rvx*t,py=ry+rvy*t,d=Math.hypot(px,py),safe=(b.r||8)+46;if(t<1.5&&d<safe&&t<bestT){best=b;bestT=t;}}if(best){const rx=best.x-sh.x,ry=best.y-sh.y,len=Math.hypot(rx,ry)||1,px=-ry/len,py=rx/len,s1=dist(sh.x+px*120,sh.y+py*120,best.x,best.y),s2=dist(sh.x-px*120,sh.y-py*120,best.x,best.y),side=s1>s2?1:-1;sh.avoidX=px*side;sh.avoidY=py*side;sh.dodgeHold=.7;sh.threatId=best.id;world.dangerText='DESVIO AUTOMÁTICO';}else if(!world.pirates.length)world.dangerText='ROTA SEGURA';}
function hitShip(dmg){const sh=world.ship;if(sh.hitTimer>0)return;sh.hitTimer=.55;state.shield=clamp(state.shield-dmg,0,100);world.shake=6;burst(sh.x,sh.y,15,'#75dfff');sound('hit');if(state.shield<=0){state.mining=false;sh.recoveryTimer=3.2;toast('Shield colapsou. Sistema em recuperação.');}save();}
function collideShip(){const sh=world.ship;if(sh.hitTimer>0)return;for(const b of[...world.fragments,...world.asteroids])if(dist(sh.x,sh.y,b.x,b.y)<(b.r||8)+20){hitShip(b.r>40?18:10);sh.vx-=((b.x-sh.x)||1)*.05;sh.vy-=((b.y-sh.y)||1)*.05;break;}}
function emitExhaust(dt){const sh=world.ship,speed=Math.hypot(sh.vx,sh.vy);if(speed<15)return;world.exhaustTimer-=dt;if(world.exhaustTimer>0)return;world.exhaustTimer=clamp(.045-speed/5000,.018,.045);const back=sh.angle+Math.PI,perp=back+Math.PI/2;for(const side of[-1,1]){const ox=Math.cos(back)*24+Math.cos(perp)*side*7,oy=Math.sin(back)*24+Math.sin(perp)*side*7,a=back+rand(-.28,.28),v=rand(18,44)+speed*.08,life=rand(.35,.75);world.exhaust.push({x:sh.x+ox,y:sh.y+oy,vx:Math.cos(a)*v+sh.vx*.12,vy:Math.sin(a)*v+sh.vy*.12,life,maxLife:life,size:rand(1.8,4.5)});}}
function updateShip(dt){const sh=world.ship;sh.hitTimer=Math.max(0,sh.hitTimer-dt);sh.recoveryTimer=Math.max(0,sh.recoveryTimer-dt);if(state.travel){const from=subById(state.travel.from),to=subById(state.travel.to),ang=Math.atan2(to.y-from.y,to.x-from.x),desired=58,ax=Math.cos(ang)*desired,ay=Math.sin(ang)*desired;sh.vx+=(ax-sh.vx)*Math.min(1,dt*1.25);sh.vy+=(ay-sh.vy)*Math.min(1,dt*1.25);sh.angle+=(ang-sh.angle)*Math.min(1,dt*2.2);sh.x+=sh.vx*dt;sh.y+=sh.vy*dt;world.laser=false;emitExhaust(dt);return;}if(!state.mining||state.cargo>=cap()||sh.recoveryTimer>0){sh.vx*=Math.exp(-1.6*dt);sh.vy*=Math.exp(-1.6*dt);sh.x+=sh.vx*dt;sh.y+=sh.vy*dt;world.laser=false;emitExhaust(dt);return;}if(!world.target||!world.asteroids.includes(world.target))chooseTarget();if(!world.target)return;danger(dt);const t=world.target,dx=t.x-sh.x,dy=t.y-sh.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d,desiredDist=t.r+118,targetX=t.x-nx*desiredDist,targetY=t.y-ny*desiredDist;let ddx=targetX-sh.x,ddy=targetY-sh.y,dl=Math.hypot(ddx,ddy)||1,mx=ddx/dl,my=ddy/dl;if(sh.dodgeHold>0){mx=mx*.38+sh.avoidX*.95;my=my*.38+sh.avoidY*.95;const ml=Math.hypot(mx,my)||1;mx/=ml;my/=ml;}const maxSpeed=sh.dodgeHold>0?72:58,desiredSpeed=clamp(dl*.42,10,maxSpeed),tvx=mx*desiredSpeed+t.vx*.18,tvy=my*desiredSpeed+t.vy*.18;sh.vx+=(tvx-sh.vx)*Math.min(1,dt*1.7);sh.vy+=(tvy-sh.vy)*Math.min(1,dt*1.7);sh.x+=sh.vx*dt;sh.y+=sh.vy*dt;const aim=Math.atan2(t.y-sh.y,t.x-sh.x),diff=Math.atan2(Math.sin(aim-sh.angle),Math.cos(aim-sh.angle));sh.angle+=diff*Math.min(1,dt*6.5);const td=dist(sh.x,sh.y,t.x,t.y),range=clamp(world.w*.31,250,510);world.laser=td<=range&&Math.abs(diff)<.78;emitExhaust(dt);}
function updateCamera(dt){const sh=world.ship,c=world.camera,speed=Math.hypot(sh.vx,sh.vy);let tx=sh.x,ty=sh.y;if(speed>8){const nx=sh.vx/speed,ny=sh.vy/speed,trail=clamp(90+speed*.55,90,155);tx=sh.x-nx*trail;ty=sh.y-ny*trail;}const k=1.38,d=2.7;c.vx+=(tx-c.x)*k*dt;c.vy+=(ty-c.y)*k*dt;c.vx*=Math.exp(-d*dt);c.vy*=Math.exp(-d*dt);c.x+=c.vx*dt*6.3;c.y+=c.vy*dt*6.3;world.targetZoom=clamp(1-speed/5200,.955,1);world.zoom+=(world.targetZoom-world.zoom)*Math.min(1,dt*1.5);}
function updateParticles(dt){for(const p of world.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-2.5*dt);p.vy*=Math.exp(-2.5*dt);p.life-=dt;}world.particles=world.particles.filter(p=>p.life>0);for(const p of world.exhaust){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-1.2*dt);p.vy*=Math.exp(-1.2*dt);p.life-=dt;}world.exhaust=world.exhaust.filter(p=>p.life>0);}
function mining(dt){if(!world.laser||!world.target)return;world.target.hp-=laserDps()*dt;world.particleTimer-=dt;if(world.particleTimer<=0){world.particleTimer=.055;const t=world.target,sh=world.ship,a=Math.atan2(sh.y-t.y,sh.x-t.x)+rand(-.35,.35),r=t.r*.75;world.particles.push({x:t.x+Math.cos(a)*r,y:t.y+Math.sin(a)*r,vx:Math.cos(a)*rand(20,70),vy:Math.sin(a)*rand(20,70),life:.45,maxLife:.45,size:rand(1,3),color:t.type==='metallic'?'#ffc46b':'#7eeeff'});}if(world.target.hp<=0)destroyAsteroid(world.target);}
function spawnPirates(){const risk=currentSub().pirates;if(!risk||state.travel||!state.mining)return;const count=risk>.24?2:1;for(let i=0;i<count;i++){const a=rand(0,TAU),r=Math.hypot(world.w,world.h)*.65+rand(100,240);world.pirates.push({id:nextId++,x:world.camera.x+Math.cos(a)*r,y:world.camera.y+Math.sin(a)*r,vx:0,vy:0,r:12,angle:a+Math.PI,life:rand(16,24),shot:rand(1.2,3),phase:rand(0,TAU)});}world.dangerText='PIRATAS NO RADAR';toast('Assinatura pirata detectada neste sub-setor.');sound('alert');}
function updatePirates(dt){if(state.travel){world.pirates=[];world.shots=[];return;}world.pirateTimer-=dt;if(world.pirateTimer<=0){world.pirateTimer=rand(18,38);if(Math.random()<currentSub().pirates)spawnPirates();}const sh=world.ship;for(const p of world.pirates){p.life-=dt;p.shot-=dt;const dx=sh.x-p.x,dy=sh.y-p.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d,orbit=Math.sin(world.time*1.3+p.phase),desired=d>230?1:d<150?-1:0,pvx=nx*desired*70-ny*orbit*28,pvy=ny*desired*70+nx*orbit*28;p.vx+=(pvx-p.vx)*Math.min(1,dt*1.8);p.vy+=(pvy-p.vy)*Math.min(1,dt*1.8);p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle=Math.atan2(dy,dx);if(p.shot<=0&&d<430&&p.life>3){p.shot=rand(1.7,3);const sp=170;world.shots.push({x:p.x,y:p.y,vx:nx*sp,vy:ny*sp,life:3,r:3});}}world.pirates=world.pirates.filter(p=>p.life>0);for(const s of world.shots){s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;if(s.life>0&&dist(s.x,s.y,sh.x,sh.y)<18){s.life=0;hitShip(rand(5,9));}}world.shots=world.shots.filter(s=>s.life>0);if(world.pirates.length)world.dangerText='PIRATAS NO RADAR';}
function travelMetrics(destId,manual=true){const from=state.travel?subById(state.travel.to):currentSub(),to=subById(destId),d=Math.hypot(to.x-from.x,to.y-from.y),same=from.sector===to.sector;let seconds=same?25+d*1.8:60+d*3.4;if(!manual)seconds*=1.7;seconds=Math.round(clamp(seconds,same?24:60,same?95:420));const cost=Math.round((same?28:95)+d*(same?2.2:6.2));return{seconds,cost,distance:d,same};}
function startTravel(destId,manual=true){if(state.travel||destId===state.subsector)return false;const to=subById(destId),m=travelMetrics(destId,manual);if(state.credits<m.cost){toast(`Faltam ${fmt(m.cost-state.credits)} Credits para essa viagem.`);return false;}state.credits-=m.cost;state.mining=false;world.target=null;world.laser=false;const now=Date.now();state.travel={from:state.subsector,fromSector:state.sector,to:destId,toSector:to.sector,startAt:now,endAt:now+m.seconds*1000,cost:m.cost,manual};save();$('sectorModal').hidden=true;toast(`${manual?'Rota manual':'Auto-navegação'} iniciada · ${fmtTime(m.seconds)}.`);sound('start');renderPanel();return true;}
function completeTravel(notify=true){if(!state.travel)return;const to=subById(state.travel.to);state.sector=to.sector;state.subsector=to.id;state.travel=null;state.killsInSub=0;state.shield=Math.max(state.shield,25);selectedSector=state.sector;selectedSub=state.subsector;resetField();save();if(notify)toast(`Chegamos a ${to.sectorName} · ${to.name}.`);renderPanel();renderMap();}
function updateTravel(){if(state.travel&&Date.now()>=state.travel.endAt)completeTravel(true);}
function maybeAutoRoam(){if(!state.autoRoam||state.travel||!state.mining||state.killsInSub<10)return;const s=currentSector(),idx=s.subs.findIndex(v=>v.id===state.subsector),dest=s.subs[(idx+1)%s.subs.length],m=travelMetrics(dest.id,false);if(state.credits<m.cost)return;state.killsInSub=0;startTravel(dest.id,false);}
function drawBackground(){ctx.fillStyle='#03060d';ctx.fillRect(0,0,world.w,world.h);const c=world.camera,layers=[{p:.09,gap:118,a:.42,size:1},{p:.22,gap:82,a:.55,size:1.15},{p:.42,gap:57,a:.72,size:1.3}];for(const L of layers){const ox=((c.x*L.p)%L.gap+L.gap)%L.gap,oy=((c.y*L.p)%L.gap+L.gap)%L.gap;ctx.fillStyle=`rgba(196,232,255,${L.a})`;for(let x=-L.gap;x<world.w+L.gap;x+=L.gap)for(let y=-L.gap;y<world.h+L.gap;y+=L.gap){const seed=Math.sin((x+ox)*12.9898+(y+oy)*78.233)*43758.5453,rr=(seed-Math.floor(seed))*.9+.2;ctx.beginPath();ctx.arc(x-ox,y-oy,L.size*rr,0,TAU);ctx.fill();}}const g=ctx.createRadialGradient(world.w*.18-(c.x*.03)%260,world.h*.26-(c.y*.03)%180,0,world.w*.18,world.h*.26,world.w*.5);g.addColorStop(0,'rgba(66,68,168,.10)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,world.w,world.h);}
function drawSprite(img,x,y,w,h,rot=0){if(!img)return;ctx.save();ctx.translate(sx(x),sy(y));ctx.rotate(rot);ctx.drawImage(img,-w*world.zoom/2,-h*world.zoom/2,w*world.zoom,h*world.zoom);ctx.restore();}
function drawWorld(){ctx.save();if(world.shake>0){ctx.translate(rand(-world.shake,world.shake),rand(-world.shake,world.shake));world.shake*=.82;if(world.shake<.2)world.shake=0;}for(const p of world.exhaust){if(!visible({...p,r:5},40))continue;const a=clamp(p.life/p.maxLife,0,1),x=sx(p.x),y=sy(p.y);ctx.fillStyle=`rgba(150,168,180,${a*.33})`;ctx.beginPath();ctx.arc(x,y,p.size*world.zoom*(1.15-a*.15),0,TAU);ctx.fill();}for(const a of world.asteroids)if(visible(a))drawSprite(assets[a.sprite]||assets.rock1,a.x,a.y,a.r*2,a.r*1.86,a.rot);for(const f of world.fragments)if(visible(f))drawSprite(assets.frag,f.x,f.y,f.r*2,f.r*2,f.rot);if(world.laser&&world.target){const sh=world.ship,t=world.target,x1=sx(sh.x),y1=sy(sh.y),x2=sx(t.x),y2=sy(t.y);ctx.save();ctx.strokeStyle='#4de7ff';ctx.shadowColor='#4de7ff';ctx.shadowBlur=12;ctx.lineWidth=2.1;ctx.globalAlpha=.8+.2*Math.sin(world.time*20);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();drawSprite(assets.hit,t.x,t.y,22,22,world.time*3);}for(const p of world.particles){if(!visible({...p,r:4},30))continue;ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(sx(p.x),sy(p.y),p.size*world.zoom,0,TAU);ctx.fill();}ctx.globalAlpha=1;for(const p of world.pirates){if(!visible(p,80))continue;const x=sx(p.x),y=sy(p.y);ctx.save();ctx.translate(x,y);ctx.rotate(p.angle);ctx.shadowColor='#ff426d';ctx.shadowBlur=12;ctx.fillStyle='#ff456d';ctx.strokeStyle='#2b0712';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(16,0);ctx.lineTo(-10,-9);ctx.lineTo(-5,0);ctx.lineTo(-10,9);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}for(const s of world.shots){ctx.fillStyle='#ff5a7d';ctx.shadowColor='#ff315d';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(sx(s.x),sy(s.y),3,0,TAU);ctx.fill();}ctx.shadowBlur=0;drawSprite(assets.ship,world.ship.x,world.ship.y,62,57,world.ship.angle+Math.PI/2);ctx.restore();}

function renderPanel(){
  if(activeTab==='cargo'){
    panelContent.innerHTML=`<div class="panel-title"><h2>Carga</h2><span>${state.cargo} / ${cap()} espaço</span></div><div class="resource-list">${Object.entries(RES).map(([k,r])=>`<div class="resource-row" style="grid-template-columns:34px 1fr auto auto"><img src="${itemIcon(k)}" alt="" width="30" height="30" style="image-rendering:pixelated;filter:drop-shadow(0 3px 5px rgba(0,0,0,.45))"><span>${r.name}</span><strong>${state.inventory[k]}</strong><em>${r.size} espaço · ${r.value} C</em></div>`).join('')}</div><button class="panel-action" data-action="sell" ${state.cargo<=0?'disabled':''}>VENDER CARGA POR CREDITS</button>`;
  }else if(activeTab==='ship'){
    panelContent.innerHTML=`<div class="panel-title"><h2>Rusty Miner I</h2><span>Nível ${state.shipLevel}</span></div><div class="stats-grid"><div class="stat-card"><span>LASER</span><b>${mineRate().toFixed(2)}x</b></div><div class="stat-card"><span>CARGO</span><b>${cap()}</b></div><div class="stat-card"><span>REFINO</span><b>${Math.round(efficiency()*100)}%</b></div></div><div class="upgrade-list">${[['laser','Laser','quebra mais rápido'],['cargo','Cargueiro','+40 espaço'],['efficiency','Refino','+5% valor']].map(a=>`<button class="upgrade" data-upgrade="${a[0]}"><span>${a[1]}</span><small>${a[2]}</small><b>${fmt(upgradeCost(a[0]))} C</b></button>`).join('')}</div>`;
  }else{
    panelContent.innerHTML=`<div class="panel-title"><h2>Market P2P</h2><span>SIMULADO</span></div><p class="market-note">Nenhum depósito ou saque real está ativo nesta Alpha.</p><div class="market-card"><div><strong>20 Titanium</strong><span>Ordem de compra</span></div><b>120 Gems</b><button data-action="ms">Vender</button></div><div class="market-card"><div><strong>Mining Core Mk-I</strong><span>Ordem de venda</span></div><b>85 Gems</b><button data-action="mb">Comprar</button></div><div class="fee-note">Taxa simulada do Market: <b>10%</b>.</div>`;
  }
}
function sellCargo(){if(state.cargo<=0)return;let gross=0;for(const[k,q]of Object.entries(state.inventory)){gross+=q*RES[k].value;state.inventory[k]=0;}const gain=Math.round(gross*efficiency());state.credits+=gain;state.cargo=0;sound('cash');toast(`Carga vendida: +${fmt(gain)} Credits.`);save();renderPanel();}
function upgrade(t){const c=upgradeCost(t);if(state.credits<c){toast('Credits insuficientes.');return;}state.credits-=c;if(t==='laser')state.laserLevel++;if(t==='cargo')state.cargoLevel++;if(t==='efficiency')state.efficiencyLevel++;sound('upgrade');save();renderPanel();}
function marketSell(){if(state.inventory.titanium<20){toast('Você precisa de 20 Titanium.');return;}state.inventory.titanium-=20;state.cargo=Math.max(0,state.cargo-20*RES.titanium.size);state.gems+=108;toast('Ordem executada: +108 Gems após taxa.');save();renderPanel();}
function marketBuy(){if(state.gems<85){toast('Gems insuficientes.');return;}state.gems-=85;state.laserLevel+=2;toast('Mining Core instalado: +2 níveis de Laser.');save();renderPanel();}
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),2600);}
function sound(type){if(!state.sound)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);const f=type==='break'?90:type==='hit'?65:type==='cash'?520:type==='upgrade'?680:type==='alert'?180:240;o.frequency.setValueAtTime(f,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(45,f*(type==='cash'?1.8:.55)),audio.currentTime+.11);g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.13);o.start();o.stop(audio.currentTime+.14);}catch{}}

function renderMap(){
  const map=$('mapNodes'),routes=$('mapRoutes'),side=$('mapDetails'),button=$('travelButton');if(!map||!routes)return;
  const sec=sectorById(selectedSector),sub=subById(selectedSub);let lines='';
  for(const[a,b]of SECTOR_LINKS){const A=sectorById(a),B=sectorById(b);lines+=`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;}
  for(const q of sec.subs)lines+=`<line x1="${sec.x}" y1="${sec.y}" x2="${q.x}" y2="${q.y}"/>`;
  if(state.travel){const A=subById(state.travel.from),B=subById(state.travel.to);lines+=`<line class="active" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;}else if(selectedSub!==state.subsector){const A=currentSub(),B=sub;lines+=`<line class="active" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;}
  routes.innerHTML=lines;
  map.innerHTML=SECTORS.map(s=>`<button class="sector-node ${s.id===selectedSector?'selected':''} ${s.id===state.sector?'current':''}" data-map-sector="${s.id}" style="left:${s.x}%;top:${s.y}%;--node-color:${s.color}" aria-label="${s.name}"></button><span class="sector-label" style="left:${s.x}%;top:${s.y}%">${s.name}</span>`).join('')+sec.subs.map(q=>`<button class="sub-node ${q.id===selectedSub?'selected':''} ${q.id===state.subsector?'current':''} ${q.pirates>0?'pirates':''}" data-map-sub="${q.id}" style="left:${q.x}%;top:${q.y}%;--node-color:${sec.color}" aria-label="${q.name}"></button>`).join('');
  const drops=effectiveDrops(sub),pirate=sub.pirates<=0?'Sem presença detectada':sub.pirates<.1?'Risco baixo':sub.pirates<.25?'Risco moderado':'Risco alto';let travelHtml='';
  if(state.travel){const dest=subById(state.travel.to),remain=(state.travel.endAt-Date.now())/1000,all=(state.travel.endAt-state.travel.startAt)/1000,prog=clamp(1-remain/all,0,1);travelHtml=`<div class="map-card"><h4>VIAGEM EM CURSO</h4><div class="map-row"><span>Destino</span><b>${dest.sectorName} · ${dest.name}</b></div><div class="map-row"><span>ETA</span><b>${fmtTime(remain)}</b></div><div class="travel-progress"><i style="width:${prog*100}%"></i></div></div>`;}
  const m=travelMetrics(sub.id,true),typeInfo=asteroidTypeLabel(sub);
  side.innerHTML=`<div class="map-details"><div class="map-sector-title" style="--swatch:${sec.color}"><i class="sector-swatch"></i><div><h3>${sec.name}</h3><small>${sub.name}</small></div></div><div class="map-card"><h4>SUB-SETOR SELECIONADO</h4><div class="map-row"><span>Piratas</span><b class="${sub.pirates?'pirate-risk':'pirate-safe'}">${pirate}</b></div><div class="map-row"><span>Asteroides</span><b>${typeInfo}</b></div><div class="map-row"><span>Chance de minério</span><b>12,5% · 1 em 8</b></div><div class="map-row"><span>Auto-navegação</span><b>${state.autoRoam?'ATIVA':'DESATIVADA'}</b></div><button class="panel-action" data-toggle-roam style="margin-top:7px">${state.autoRoam?'DESATIVAR':'ATIVAR'} AUTO-NAVEGAÇÃO</button></div><div class="map-card"><h4>RARIDADE · QUANDO HÁ MINÉRIO</h4><div class="drop-grid">${Object.entries(drops).map(([k,v])=>`<span>${RES[k].name}</span><b>${(v*100).toFixed(k==='crystal'?1:0).replace('.',',')}%</b>`).join('')}</div></div><div class="map-card subsector-card"><h4>SUB-SETORES DE ${sec.name.toUpperCase()}</h4><div class="sub-list">${sec.subs.map(q=>`<button data-map-sub-list="${q.id}" class="${q.id===selectedSub?'active':''}"><span><strong>${q.name}</strong><small>${q.pirates?'☠ atividade pirata':'rota limpa'}</small></span><em>${q.id===state.subsector?'ATUAL':'ver'}</em></button>`).join('')}</div></div>${travelHtml}</div>`;
  if(state.travel){button.disabled=true;button.textContent=`EM VIAGEM · ${fmtTime((state.travel.endAt-Date.now())/1000)}`;}else if(sub.id===state.subsector){button.disabled=true;button.textContent='VOCÊ ESTÁ NESTE SUB-SETOR';}else{button.disabled=state.credits<m.cost;button.textContent=`ENVIAR NAVE · ${fmt(m.cost)} C · ${fmtTime(m.seconds)}`;}
}
function openMap(){selectedSector=state.travel?state.travel.toSector:state.sector;selectedSub=state.travel?state.travel.to:state.subsector;$('sectorModal').hidden=false;renderMap();}
function updateHUD(){
  const s=currentSector(),sub=currentSub(),travel=state.travel,remain=travel?(travel.endAt-Date.now())/1000:0;
  $('credits').textContent=fmt(state.credits);$('gems').textContent=fmt(state.gems);$('sectorName').textContent=travel?`${sub.sectorName} → ${subById(travel.to).sectorName}`:`${s.name} · ${sub.name}`;$('sectorButton').classList.toggle('traveling',!!travel);$('shieldBar').style.width=state.shield+'%';$('shieldText').textContent=Math.round(state.shield)+'%';$('cargoBar').style.width=clamp(state.cargo/cap()*100,0,100)+'%';$('cargoText').textContent=`${state.cargo} / ${cap()}`;$('rateValue').textContent=mineRate().toFixed(2);
  const danger=$('dangerText');danger.textContent=travel?'CRUZEIRO INTERSETORIAL':world.dangerText;danger.className='danger-text '+(world.pirates.length?'hit':world.dangerText!=='ROTA SEGURA'||travel?'warn':'');
  if(travel){$('operationText').textContent=`VIAJANDO · ETA ${fmtTime(remain)}`;mineButton.disabled=true;mineButton.classList.add('active');mineButton.textContent=`EM VIAGEM · ${fmtTime(remain)}`;}
  else{mineButton.disabled=false;mineButton.classList.toggle('active',state.mining);mineButton.textContent=state.mining?'PAUSAR MINERAÇÃO':'INICIAR MINERAÇÃO';if(state.mining&&world.laser&&world.target){const a=world.target,eta=breakSeconds(a);$('operationText').textContent=`MINERANDO ${sizeLabel(a.r)} ${a.type==='metallic'?'METÁLICO':'ROCHOSO'} · ${eta.toFixed(1)}s`;}else $('operationText').textContent=state.mining?'CAÇANDO ASTEROIDE':'AGUARDANDO ORDEM';}
}
function update(dt){world.time+=dt;updateTravel();physics(dt);updateShip(dt);updateCamera(dt);updateParticles(dt);updatePirates(dt);if(!state.travel){collideShip();mining(dt);maybeAutoRoam();if(state.shield<100&&world.ship.hitTimer<=0)state.shield=clamp(state.shield+dt*3.2,0,100);}updateHUD();if(!$('sectorModal').hidden&&Math.floor(world.time*4)%2===0)renderMap();}
function frame(t){const dt=Math.min(.033,Math.max(.001,(t-last)/1000));last=t;update(dt);drawBackground();drawWorld();requestAnimationFrame(frame);}

for(const tab of document.querySelectorAll('.tab'))tab.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===tab));activeTab=tab.dataset.tab;renderPanel();};
panelContent.onclick=e=>{const u=e.target.closest('[data-upgrade]');if(u)return upgrade(u.dataset.upgrade);const a=e.target.closest('[data-action]')?.dataset.action;if(a==='sell')sellCargo();if(a==='ms')marketSell();if(a==='mb')marketBuy();};
$('sectorButton').onclick=openMap;$('closeSector').onclick=()=>{$('sectorModal').hidden=true;};
$('sectorMap').onclick=e=>{const s=e.target.closest('[data-map-sector]');if(s){selectedSector=s.dataset.mapSector;const sec=sectorById(selectedSector);selectedSub=sec.subs.some(q=>q.id===state.subsector)?state.subsector:sec.subs[0].id;renderMap();return;}const q=e.target.closest('[data-map-sub]');if(q){selectedSub=q.dataset.mapSub;selectedSector=subById(selectedSub).sector;renderMap();}};
$('mapDetails').onclick=e=>{const q=e.target.closest('[data-map-sub-list]');if(q){selectedSub=q.dataset.mapSubList;selectedSector=subById(selectedSub).sector;renderMap();return;}if(e.target.closest('[data-toggle-roam]')){state.autoRoam=!state.autoRoam;save();renderMap();toast(`Auto-navegação ${state.autoRoam?'ativada':'desativada'}.`);}};
$('travelButton').onclick=()=>startTravel(selectedSub,true);
mineButton.onclick=()=>{if(state.travel)return;if(state.cargo>=cap()){toast('Cargueiro cheio. Venda a carga.');return;}state.mining=!state.mining;if(state.mining){chooseTarget();sound('start');}else world.laser=false;save();};
$('soundButton').onclick=()=>{state.sound=!state.sound;$('soundButton').textContent=state.sound?'🔊':'🔇';save();};
window.addEventListener('resize',resize);window.addEventListener('beforeunload',save);document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
(async()=>{offline();await loadAssets();resize();resetField();renderPanel();$('soundButton').textContent=state.sound?'🔊':'🔇';updateHUD();requestAnimationFrame(frame);})();
})();
