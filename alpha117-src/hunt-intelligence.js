'use strict';
const fs=require('fs');
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const asNum=v=>Number.isFinite(Number(v))?Number(v):null;
const same=(a,b)=>String(a??'')===String(b??'');
function cleanHunt(v){return String(v||'').trim().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();}
function primaryPokemon(account={},fallback=null){
  const updates=Array.isArray(account.pokemonUpdates)?account.pokemonUpdates.filter(Boolean):[];
  let p=null;
  if(account.activePokemonId!==undefined&&account.activePokemonId!==null)p=updates.find(x=>same(x.id,account.activePokemonId))||null;
  if(!p&&fallback?.id!==undefined)p=updates.find(x=>same(x.id,fallback.id))||null;
  if(!p&&updates.length)p=[...updates].sort((a,b)=>(Number(b.level)||0)-(Number(a.level)||0)||(Number(b.power)||0)-(Number(a.power)||0))[0];
  if(!p&&fallback)p=fallback;
  if(!p)return null;
  const ivs=p.ivs&&typeof p.ivs==='object'?{...p.ivs}:null;
  const ivTotal=asNum(p.ivTotal)!==null?asNum(p.ivTotal):(ivs?Object.values(ivs).reduce((a,x)=>a+(Number(x)||0),0):null);
  return {id:p.id??null,speciesId:p.speciesId??null,name:p.name||p.nickname||'',nickname:p.nickname||null,level:asNum(p.level),power:asNum(p.power),potency:asNum(p.potency),quality:asNum(p.quality),grade:asNum(p.grade),ivTotal,ivs,stats:p.stats&&typeof p.stats==='object'?{...p.stats}:null,shiny:p.shiny===true,tmElemental:p.tmElemental??null,tmAoe:p.tmAoe===true,refinementTotal:asNum(p.refinementTotal),types:Array.isArray(p.types)?p.types.slice(0,4):[]};
}
function profileKey(p){if(!p)return '';if(p.id!==null&&p.id!==undefined)return 'id:'+String(p.id);return ['sp',p.speciesId??'',p.ivTotal??'',p.quality??'',p.grade??''].join(':');}
function unionCoverage(rows=[],now=Date.now(),periodMs=Infinity){
  const floor=Number.isFinite(periodMs)?now-periodMs:-Infinity,intervals=[];
  for(const s of rows){const end=Math.min(now,Number(s.at)||0);if(!(end>floor))continue;const width=clamp(Number(s.windowMs)||60000,60000,15*60000),start=Math.max(floor,end-width);if(end>start)intervals.push([start,end]);}
  intervals.sort((a,b)=>a[0]-b[0]);let total=0,start=null,end=null;for(const row of intervals){if(start===null){[start,end]=row;continue;}if(row[0]<=end){end=Math.max(end,row[1]);continue;}total+=end-start;[start,end]=row;}if(start!==null)total+=end-start;return Math.max(0,total);
}
function confidenceDetails({observedMs=0,samples=0,lastAt=0,exact=false,levelSpread=0,now=Date.now()}={}){
  const minutes=observedMs/60000,ageMs=Math.max(0,now-(Number(lastAt)||0));let score=0;
  score+=minutes>=60?.38:minutes>=25?.28:minutes>=10?.18:minutes>=5?.10:0;
  score+=samples>=12?.22:samples>=6?.16:samples>=3?.09:0;
  score+=ageMs<=2*60000?.20:ageMs<=15*60000?.13:ageMs<=60*60000?.06:0;
  score+=exact?.15:.07;
  score+=levelSpread<=2?.05:levelSpread<=5?.025:0;
  score=clamp(score,0,1);
  return {score:Math.round(score*100)/100,label:score>=.72?'alta':score>=.42?'moderada':'baixa',observedMinutes:Math.round(minutes),samples,ageMs,exact,levelSpread,reasons:{duration:minutes,samples,freshnessMs:ageMs,profile:exact?'mesmo Pokémon':'mesma espécie/histórico',levelSpread}};
}
function summarizeGroups(rows=[],p=null,{periodMs=Infinity,now=Date.now(),exact=false}={}){
  const floor=Number.isFinite(periodMs)?now-periodMs:-Infinity,groups=new Map();
  for(const s of rows){if(!s?.huntSlug||(Number(s.at)||0)<floor)continue;const key=String(s.huntSlug),g=groups.get(key)||{huntSlug:key,rows:[],wx:0,wg:0,wk:0,xx:0,xg:0,xk:0,w:0,lastAt:0,levelMin:null,levelMax:null};
    const ageH=Math.max(0,(now-(Number(s.at)||now))/3600000),recency=Math.max(.2,Math.exp(-ageH/96)),levelDiff=p?.level!==null&&p?.level!==undefined&&s.pokemonLevel!==null&&s.pokemonLevel!==undefined?Math.abs(Number(p.level)-Number(s.pokemonLevel)):0,levelWeight=1/(1+levelDiff/6),windowWeight=clamp((Number(s.windowMs)||60000)/600000,.15,1),w=recency*levelWeight*windowWeight*(exact?1:.7);
    const xp=asNum(s.xpPerHour),gold=asNum(s.goldPerHour),kills=asNum(s.killsPerHour);if(xp!==null){g.wx+=xp*w;g.xx+=w;}if(gold!==null){g.wg+=gold*w;g.xg+=w;}if(kills!==null){g.wk+=kills*w;g.xk+=w;}g.w+=w;g.rows.push(s);g.lastAt=Math.max(g.lastAt,Number(s.at)||0);if(s.pokemonLevel!==null&&s.pokemonLevel!==undefined){g.levelMin=g.levelMin===null?Number(s.pokemonLevel):Math.min(g.levelMin,Number(s.pokemonLevel));g.levelMax=g.levelMax===null?Number(s.pokemonLevel):Math.max(g.levelMax,Number(s.pokemonLevel));}groups.set(key,g);
  }
  let hunts=[...groups.values()].filter(g=>g.w>0).map(g=>{const observedMs=unionCoverage(g.rows,now,periodMs),levelSpread=g.levelMin===null||g.levelMax===null?0:g.levelMax-g.levelMin,confidence=confidenceDetails({observedMs,samples:g.rows.length,lastAt:g.lastAt,exact,levelSpread,now});return {huntSlug:g.huntSlug,name:cleanHunt(g.huntSlug)||g.huntSlug,xpPerHour:g.xx>0?g.wx/g.xx:null,goldPerHour:g.xg>0?g.wg/g.xg:null,killsPerHour:g.xk>0?g.wk/g.xk:null,samples:g.rows.length,observedMs,observedMinutes:Math.round(observedMs/60000),confidence:confidence.label,confidenceDetails:confidence,lastAt:g.lastAt,levelMin:g.levelMin,levelMax:g.levelMax,dataSource:'battle-protocol'};});
  const maxXp=Math.max(1,...hunts.map(x=>Number(x.xpPerHour)||0)),maxGold=Math.max(1,...hunts.map(x=>Number(x.goldPerHour)||0)),maxKills=Math.max(1,...hunts.map(x=>Number(x.killsPerHour)||0));hunts=hunts.map(x=>({...x,performanceScore:Math.round((((Number(x.xpPerHour)||0)/maxXp)*.475+((Number(x.goldPerHour)||0)/maxGold)*.475+((Number(x.killsPerHour)||0)/maxKills)*.05)*1000)/10})).sort((a,b)=>b.performanceScore-a.performanceScore);
  return hunts;
}
function downsample(rows=[],limit=120){if(rows.length<=limit)return rows;const step=(rows.length-1)/(limit-1),out=[];for(let i=0;i<limit;i++)out.push(rows[Math.round(i*step)]);return out;}
class HuntIntelligence{
  constructor(file){this.file=file||'';this.state={version:3,accounts:Array.from({length:4},()=>this._empty()),identities:{},slotIdentity:Array(4).fill(null)};this.lastSaveAt=0;this.load();}
  _empty(){return {samples:[],levels:[],profile:null,lastAt:0,identity:null,account:null};}
  _clone(a={}){return {samples:Array.isArray(a.samples)?a.samples.slice(-1200):[],levels:Array.isArray(a.levels)?a.levels.slice(-400):[],profile:a.profile||null,lastAt:Number(a.lastAt)||0,identity:a.identity&&typeof a.identity==='object'?{...a.identity}:null,account:a.account&&typeof a.account==='object'?{...a.account}:null};}
  _identity(account={}){if(account.id!==undefined&&account.id!==null&&String(account.id)!=='')return 'id:'+String(account.id);if(account.nick)return 'nick:'+String(account.nick).trim().toLowerCase();return null;}
  load(){if(!this.file)return;try{const raw=JSON.parse(fs.readFileSync(this.file,'utf8'));if(raw&&Array.isArray(raw.accounts))for(let i=0;i<4;i++)this.state.accounts[i]=this._clone(raw.accounts[i]||{});if(raw?.identities&&typeof raw.identities==='object')for(const [k,v] of Object.entries(raw.identities))this.state.identities[k]=this._clone(v);if(Array.isArray(raw?.slotIdentity))this.state.slotIdentity=raw.slotIdentity.slice(0,4).map(x=>x||null);if(!raw?.identities){for(let i=0;i<4;i++)if(this.state.accounts[i].lastAt||this.state.accounts[i].profile)this.state.identities['legacy-slot:'+i]=this._clone(this.state.accounts[i]);this.state.accounts=Array.from({length:4},()=>this._empty());}this.state.version=3;}catch{}}
  save(force=false){if(!this.file)return;const now=Date.now();if(!force&&now-this.lastSaveAt<30000)return;this.lastSaveAt=now;try{fs.writeFileSync(this.file,JSON.stringify(this.state));}catch{}}
  close(){this.save(true);}
  observe(slot,{account={},telemetry={},record=null}={}){
    slot=Number(slot);if(!Number.isInteger(slot)||slot<0||slot>3)return;
    const identity=this._identity(account),bound=this.state.slotIdentity[slot];if(identity&&identity!==bound){if(bound)this.state.identities[bound]=this._clone(this.state.accounts[slot]);this.state.accounts[slot]=this._clone(this.state.identities[identity]||this._empty());this.state.slotIdentity[slot]=identity;}
    const a=this.state.accounts[slot],prev=a.profile||null,p=primaryPokemon(account,prev),live=record?.live||{},trainerLevel=asNum(account.level??live.trainerLevel),huntSlug=String(telemetry.huntSlug||account.huntSlug||live.location||'').trim(),now=Date.now();
    if(identity)a.identity={key:identity,id:account.id??a.identity?.id??null,nick:account.nick||a.identity?.nick||''};
    const prevAccount=a.account||{};a.account={...prevAccount,level:trainerLevel??prevAccount.level??null,xp:asNum(account.xp)??prevAccount.xp??null,xpLevel:asNum(account.xpLevel)??prevAccount.xpLevel??null,xpNext:asNum(account.xpNext)??prevAccount.xpNext??null,huntSlug:huntSlug||prevAccount.huntSlug||'',serverNow:asNum(account.serverNow)??prevAccount.serverNow??null};
    if(p)a.profile=p;a.lastAt=now;
    const lv={at:now,trainerLevel,pokemonLevel:asNum(p?.level),pokemonKey:profileKey(p),huntSlug};const lastLv=a.levels[a.levels.length-1];if(!lastLv||lastLv.trainerLevel!==lv.trainerLevel||lastLv.pokemonLevel!==lv.pokemonLevel||lastLv.pokemonKey!==lv.pokemonKey||lastLv.huntSlug!==lv.huntSlug)a.levels.push(lv);a.levels=a.levels.slice(-400);
    const windowMs=Number(telemetry.windowMs)||0,xp=asNum(telemetry.xpPerHour),gold=asNum(telemetry.goldPerHour),kills=asNum(telemetry.killsPerHour);
    if(huntSlug&&p&&windowMs>=60000&&(xp!==null||gold!==null||kills!==null)){
      const s={at:now,huntSlug,pokemonKey:profileKey(p),pokemonId:p.id??null,speciesId:p.speciesId??null,pokemonLevel:asNum(p.level),trainerLevel,ivTotal:asNum(p.ivTotal),quality:asNum(p.quality),grade:asNum(p.grade),potency:asNum(p.potency),power:asNum(p.power),xpPerHour:xp,goldPerHour:gold,killsPerHour:kills,windowMs:Math.min(windowMs,15*60000),rewardXp:asNum(telemetry.xp),rewardGold:asNum(telemetry.gold),dataSource:'battle-protocol'};
      const last=a.samples[a.samples.length-1];if(last&&last.huntSlug===s.huntSlug&&last.pokemonKey===s.pokemonKey&&now-last.at<60000)a.samples[a.samples.length-1]=s;else a.samples.push(s);a.samples=a.samples.slice(-1200);
    }
    if(this.state.slotIdentity[slot])this.state.identities[this.state.slotIdentity[slot]]=this._clone(a);this.save(false);
  }
  accountView(slot,base={}){
    const a=this.state.accounts[slot]||this._empty(),p=a.profile||null,key=profileKey(p),sameExact=a.samples.filter(s=>s.pokemonKey===key),sameSpecies=p?.speciesId!==null&&p?.speciesId!==undefined?a.samples.filter(s=>same(s.speciesId,p.speciesId)):[],source=sameExact.length>=2?sameExact:sameSpecies.length>=2?sameSpecies:a.samples,exact=source===sameExact&&sameExact.length>0,now=Date.now();
    const hunts=summarizeGroups(source,p,{periodMs:Infinity,now,exact}),byXp=[...hunts].filter(x=>x.xpPerHour!==null).sort((a,b)=>b.xpPerHour-a.xpPerHour)[0]||null,byGold=[...hunts].filter(x=>x.goldPerHour!==null).sort((a,b)=>b.goldPerHour-a.goldPerHour)[0]||null,best=hunts[0]||null;
    const periods={};for(const minutes of [15,60,180,360])periods[String(minutes)]={minutes,hunts:summarizeGroups(source,p,{periodMs:minutes*60000,now,exact})};
    const lvRows=a.levels.filter(x=>!key||x.pokemonKey===key),first=lvRows[0]||null,last=lvRows[lvRows.length-1]||null;
    const mapped=(base.recommendations||[]).map(x=>({name:x.name,id:x.id||'',score:Number(x.score)||0,xpRate:Number(x.xpRate)||0,goldRate:Number(x.goldRate)||0}));const measured=new Set(hunts.flatMap(x=>[x.huntSlug.toLowerCase(),String(x.name||'').toLowerCase()]));const untested=mapped.filter(x=>!measured.has(String(x.name||'').toLowerCase())&&!measured.has(String(x.id||'').toLowerCase())).slice(0,5);
    const series=downsample(source.filter(s=>(Number(s.at)||0)>=now-6*3600000).sort((x,y)=>(Number(x.at)||0)-(Number(y.at)||0)).map(s=>({at:Number(s.at)||0,huntSlug:s.huntSlug,xpPerHour:asNum(s.xpPerHour),goldPerHour:asNum(s.goldPerHour),windowMs:Number(s.windowMs)||0})),120);
    return {slot,identity:a.identity||null,account:a.account||null,profile:p,currentHunt:String(base.current?.location||base.current?.huntSlug||a.account?.huntSlug||last?.huntSlug||''),trainerLevel:asNum(base.current?.level??a.account?.level??last?.trainerLevel),pokemonLevel:asNum(p?.level),pokemonLevelsGained:first?.pokemonLevel!==null&&first?.pokemonLevel!==undefined&&last?.pokemonLevel!==null&&last?.pokemonLevel!==undefined?Number(last.pokemonLevel)-Number(first.pokemonLevel):0,trainerLevelsGained:first?.trainerLevel!==null&&first?.trainerLevel!==undefined&&last?.trainerLevel!==null&&last?.trainerLevel!==undefined?Number(last.trainerLevel)-Number(first.trainerLevel):0,hunts,best,bestXp:byXp,bestGold:byGold,periods,series,untested,dataBasis:exact?'mesmo Pokémon':sameSpecies.length>=2?'mesma espécie':'histórico da conta',confidence:best?.confidence||'coletando',confidenceDetails:best?.confidenceDetails||null,samples:source.length,lastAt:a.lastAt};
  }
  view(base={}){const accounts=Array.from({length:4},(_,i)=>{const b=base.accounts?.[i]||{slot:i};return {...b,intelligence:this.accountView(i,b)};});return {...base,accounts,intelligence:{version:3,at:Date.now(),accounts:accounts.map(x=>x.intelligence)}};}
}
module.exports={HuntIntelligence,primaryPokemon,profileKey,unionCoverage,confidenceDetails,summarizeGroups};
