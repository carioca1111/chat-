'use strict';

const MINUTE=60_000;
const HOUR=60*MINUTE;
const MAX_ACCOUNTS=4;
const MAX_BINS=361;
const MAX_GROUPS=80;
const known=n=>typeof n==='number'&&Number.isFinite(n);
const num=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const text=(v,max=120)=>String(v??'').slice(0,max);

function probability(normal,lure){
  normal=Math.max(0,num(normal));lure=Math.max(0,num(lure));
  return -Math.expm1(normal*Math.log1p(-1/24000)+lure*Math.log1p(-1/12000));
}
function etaForChance(normalRate,lureRate,chance=.5){
  normalRate=Math.max(0,num(normalRate));lureRate=Math.max(0,num(lureRate));
  if(!(chance>0&&chance<1)||normalRate+lureRate<=0)return null;
  const hazard=normalRate*Math.log1p(-1/24000)+lureRate*Math.log1p(-1/12000);
  return hazard<0?Math.log1p(-chance)/hazard*HOUR:null;
}
function quality(observedMs,attempts){
  if(!known(observedMs)||!known(attempts)||observedMs<=0)return 0;
  const time=clamp(observedMs/(15*MINUTE),0,1),sample=clamp(attempts/100,0,1);
  return Math.round(100*(.55*time+.45*sample));
}
function stability(shortRate,baselineRate){
  if(!known(shortRate)||!known(baselineRate)||shortRate<0||baselineRate<=0)return null;
  return Math.round(clamp(100-Math.abs(shortRate-baselineRate)/baselineRate*100,0,100));
}
function sanitizeBin(b){
  if(!b||!Number.isFinite(Number(b.at)))return null;
  return {at:Number(b.at),ms:clamp(num(b.ms),0,20_000),attempts:clamp(num(b.attempts),0,10_000),kills:clamp(num(b.kills),0,10_000),bodies:clamp(num(b.bodies),0,10_000)};
}
function windowStats(account,now,minutes){
  const cutoff=now-minutes*MINUTE,out={attempts:0,kills:0,bodies:0,observedMs:0,rate:null};
  for(const raw of (Array.isArray(account.bins)?account.bins:[]).slice(-MAX_BINS)){
    const b=sanitizeBin(raw);if(!b||b.at<cutoff)continue;
    out.attempts+=b.attempts;out.kills+=b.kills;out.bodies+=b.bodies;out.observedMs+=b.ms;
  }
  if(account.online===true&&account.calculationEnabled===true&&out.observedMs>=MINUTE)out.rate=out.attempts*HOUR/out.observedMs;
  return out;
}
function compactGroup(g){
  if(!g||typeof g!=='object')return null;
  const species={};
  for(const [k,v] of Object.entries(g.species||{}).slice(0,300))if(Number.isFinite(Number(v)))species[text(k,80)]=Math.max(0,Number(v));
  return {hunt:text(g.hunt,100),name:text(g.name||g.hunt,120),context:text(g.context,240),ms:Math.max(0,num(g.ms)),attempts:Math.max(0,num(g.attempts)),kills:Math.max(0,num(g.kills)),bodies:Math.max(0,num(g.bodies)),species,at:Math.max(0,num(g.at))};
}
function rankings(account,prefs){
  if(account.calculationEnabled!==true)return [];
  const target=prefs?.mode==='target'?text(prefs.target,80):'',groups=(Array.isArray(account.huntGroups)?account.huntGroups:[]).slice(-MAX_GROUPS),rows=[];
  for(const raw of groups){
    const g=compactGroup(raw);if(!g||g.context!==text(account.context,240)||g.ms<5*MINUTE)continue;
    const attempts=target?num(g.species[target]):g.attempts;if(attempts<20)continue;
    rows.push({hunt:g.hunt,name:g.name,rate:attempts*HOUR/g.ms,observedMs:g.ms,attempts,killsRate:g.kills*HOUR/g.ms,bodiesRate:g.bodies*HOUR/g.ms});
  }
  rows.sort((a,b)=>b.rate-a.rate);
  return rows.slice(0,12);
}
function normalizeAccount(raw,now,prefs){
  raw=raw&&typeof raw==='object'?raw:{};
  const eligibility=raw.eligibility&&typeof raw.eligibility==='object'?raw.eligibility:{};
  const calculationEnabled=eligibility.eligible===true&&raw.inHunt===true&&raw.online===true;
  const account={
    id:text(raw.id,120),slot:clamp(Math.trunc(num(raw.slot)),0,127),name:text(raw.name,120)||'Conta',online:raw.online===true,inHunt:raw.inHunt===true,
    calculationEnabled,calculationReason:text(eligibility.reason||(!raw.online?'Conta offline':!raw.inHunt?'Fora de Hunt':eligibility.eligible===false?'Área sem shiny':'Elegibilidade não confirmada'),160),
    huntSlug:text(raw.hunt?.slug,100),hunt:text(raw.hunt?.name||raw.hunt?.slug,120)||null,area:text(raw.hunt?.area,80),context:text(raw.context,240),
    inventory:raw.inventory&&typeof raw.inventory==='object'?Object.fromEntries(Object.entries(raw.inventory).slice(0,40).filter(([k,v])=>/^\d+$/.test(k)&&Number.isFinite(Number(v))).map(([k,v])=>[k,Math.max(0,Number(v))])):null,
    boosts:raw.boosts&&typeof raw.boosts==='object'?{secretLure:typeof raw.boosts.secretLure==='boolean'?raw.boosts.secretLure:null,captureBoost:typeof raw.boosts.captureBoost==='boolean'?raw.boosts.captureBoost:null,kickShiny:typeof raw.boosts.kickShiny==='boolean'?raw.boosts.kickShiny:null,kickCapture:typeof raw.boosts.kickCapture==='boolean'?raw.boosts.kickCapture:null,lureMs:known(Number(raw.boosts.lureMs))?Math.max(0,Number(raw.boosts.lureMs)):null,captureMs:known(Number(raw.boosts.captureMs))?Math.max(0,Number(raw.boosts.captureMs)):null}:{},
    bins:Array.isArray(raw.bins)?raw.bins.slice(-MAX_BINS):[],huntGroups:Array.isArray(raw.huntGroups)?raw.huntGroups.slice(-MAX_GROUPS):[],
    farmMs:Math.max(0,num(raw.farmMs)),species:Array.isArray(raw.species)?raw.species.slice(0,500).map(x=>text(x,80)):[],recent:Array.isArray(raw.recent)?raw.recent.slice(0,6):[],
    totals:raw.totals&&typeof raw.totals==='object'?raw.totals:{},today:raw.today&&typeof raw.today==='object'?raw.today:{attempts:0,seen:0,captured:0,escaped:0}
  };
  account.windows={5:windowStats(account,now,5),15:windowStats(account,now,15),60:windowStats(account,now,60)};
  account.individualRate=account.windows[15].rate;
  account.rankings=rankings(account,prefs);
  return account;
}
function combineWindows(members,minutes){
  const parts=members.map(x=>x.windows[minutes]),valid=parts.filter(x=>known(x.rate));
  return {attempts:parts.reduce((n,x)=>n+x.attempts,0),kills:parts.reduce((n,x)=>n+x.kills,0),bodies:parts.reduce((n,x)=>n+x.bodies,0),observedMs:Math.max(0,...parts.map(x=>x.observedMs)),rate:valid.length?valid.reduce((n,x)=>n+x.rate,0):null};
}
function makeSharedGroup(members){
  const windows={5:combineWindows(members,5),15:combineWindows(members,15),60:combineWindows(members,60)};
  let normalRate=0,lureRate=0,knownBoost=0;
  for(const a of members){if(!known(a.individualRate))continue;if(a.boosts.secretLure===true){lureRate+=a.individualRate;knownBoost++;}else if(a.boosts.secretLure===false){normalRate+=a.individualRate;knownBoost++;}}
  const chanceHour=knownBoost?probability(normalRate,lureRate):null,eta50Ms=knownBoost?etaForChance(normalRate,lureRate,.5):null;
  const q=quality(windows[15].observedMs,windows[15].attempts),stab=stability(windows[5].rate,windows[15].rate),trend=known(windows[5].rate)&&known(windows[15].rate)&&windows[15].rate>0?100*(windows[5].rate/windows[15].rate-1):null;
  return {huntSlug:members[0].huntSlug,hunt:members[0].hunt,participants:members.length,slots:members.map(x=>x.slot),names:members.map(x=>x.name),windows,rate:windows[15].rate,normalRate,lureRate,chanceHour,eta50Ms,measurementQuality:q,stability:stab,trendPct:trend};
}
function finalizeAccount(a,shared,prefs,now){
  const t=a.totals||{},stock=a.inventory?Object.values(a.inventory).reduce((n,v)=>n+num(v),0):null,rate=a.individualRate;
  const current=a.rankings.find(x=>x.hunt===a.huntSlug),best=a.rankings[0];
  const ballRunwayMs=stock!==null&&known(rate)&&rate>0?stock/rate*HOUR:null;
  const individualChanceHour=a.calculationEnabled&&typeof a.boosts.secretLure==='boolean'&&known(rate)?probability(a.boosts.secretLure?0:rate,a.boosts.secretLure?rate:0):null;
  const probabilityAttempts=Math.max(0,num(t.normal))+Math.max(0,num(t.lure));
  let status=!a.online?'Offline':!a.inHunt?'Escolha uma hunt':a.calculationEnabled!==true?'Cálculo pausado · '+a.calculationReason:stock===0?'SEM BOLAS':ballRunwayMs!==null&&ballRunwayMs<15*MINUTE?'BOLAS < 15 MIN':a.boosts.lureMs>0&&a.boosts.lureMs<15*MINUTE?'Lure termina em breve':rate===null?'CALIBRANDO…':'Monitorando';
  const efficiency=a.calculationEnabled&&a.rankings.length>=2&&current&&best?.rate>0&&stock!==null&&rate!==null?Math.round(100*(.8*Math.min(1,current.rate/best.rate)+.2*(rate>0?Math.min(1,stock/(rate*.5)):0))):null;
  if(efficiency!==null&&efficiency<70&&status==='Monitorando')status='HUNT ABAIXO DA MELHOR';
  return {
    id:a.id,slot:a.slot,name:a.name,online:a.online,status,calculationEnabled:a.calculationEnabled,calculationReason:a.calculationReason,remoteComputed:true,
    sharedGroup:shared,efficiency,rate,individualRate:rate,windows:a.windows,today:{attempts:Math.max(0,num(a.today.attempts)),seen:Math.max(0,num(a.today.seen)),captured:Math.max(0,num(a.today.captured)),escaped:Math.max(0,num(a.today.escaped))},
    attempts:Math.max(0,num(t.attempts)),sinceShiny:t.sinceShiny==null?null:Math.max(0,num(t.sinceShiny)),lastShiny:t.lastShiny==null?null:Math.max(0,num(t.lastShiny)),seen:Math.max(0,num(t.seen)),captured:Math.max(0,num(t.captured)),escaped:Math.max(0,num(t.escaped)),
    hunt:a.hunt,huntSlug:a.huntSlug,area:a.area,stock,inventory:a.inventory,boosts:a.boosts,rankings:a.rankings,best:best||null,improvement:current?.rate>0&&best?100*(best.rate/current.rate-1):null,
    farmMs:a.farmMs,probability:probabilityAttempts>0?probability(num(t.normal),num(t.lure)):null,probabilityAttempts,unknownAttempts:Math.max(0,num(t.unknown)),observedSince:Math.max(0,num(t.started)),
    measurementQuality:shared?.measurementQuality??quality(a.windows[15].observedMs,a.windows[15].attempts),stability:shared?.stability??stability(a.windows[5].rate,a.windows[15].rate),trendPct:shared?.trendPct??null,ballRunwayMs,
    individualChanceHour,chanceHour:a.calculationEnabled?(shared?.chanceHour??individualChanceHour):null,eta50Ms:a.calculationEnabled?(shared?.eta50Ms??etaForChance(a.boosts.secretLure?0:rate,a.boosts.secretLure?rate:0,.5)):null,
    species:a.species,recent:a.recent
  };
}
function computeShiny(raw){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.accounts))throw new Error('invalid-shiny-payload');
  const now=Number.isFinite(Number(raw.at))?Number(raw.at):Date.now(),prefs=raw.preferences&&typeof raw.preferences==='object'?{sound:raw.preferences.sound!==false,target:text(raw.preferences.target,80),mode:['more','target'].includes(raw.preferences.mode)?raw.preferences.mode:'more'}:{sound:true,target:'',mode:'more'};
  const accounts=raw.accounts.slice(0,MAX_ACCOUNTS).map(a=>normalizeAccount(a,now,prefs));
  const byHunt=new Map();
  for(const a of accounts){if(!a.calculationEnabled||!a.huntSlug)continue;const list=byHunt.get(a.huntSlug)||[];list.push(a);byHunt.set(a.huntSlug,list);}
  const sharedBySlot=new Map();
  for(const members of byHunt.values()){const shared=makeSharedGroup(members);for(const a of members)sharedBySlot.set(a.slot,shared);}
  return {version:1,at:now,cloud:{computed:true,engine:'render',groups:byHunt.size},accounts:accounts.map(a=>finalizeAccount(a,sharedBySlot.get(a.slot)||null,prefs,now)),preferences:prefs,catalog:Array.isArray(raw.catalog)?raw.catalog.slice(0,40):[],error:null,diagnostics:raw.diagnostics&&typeof raw.diagnostics==='object'?raw.diagnostics:{},historyCount:Math.max(0,num(raw.historyCount)),historyRevision:text(raw.historyRevision,120)};
}

module.exports={computeShiny,probability,etaForChance,quality,stability};
