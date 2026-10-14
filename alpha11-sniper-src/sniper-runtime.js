'use strict';

const {normalizeListing}=require('./market-protocol');

const MODES=new Set(['OFF','OBSERVE','SEMI','AUTO']);
const CURRENCIES=new Set(['any','coins','gems']);
const STATES=new Set(['WATCHING','PREARMED','READY','CLAIMED','SENT','WON','LOST','FAILED']);
const now=()=>Date.now();
const mono=()=>process.hrtime.bigint();
const elapsedMs=(a,b=mono())=>Number(b-a)/1e6;
const clamp=(v,min,max,fallback)=>{v=Number(v);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;};
const text=v=>String(v??'').trim();
const lower=v=>text(v).toLocaleLowerCase('pt-BR');
const percentile=(src,q)=>{const a=src.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;return a[Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*q)))];};
const copy=o=>JSON.parse(JSON.stringify(o));

function normalizeRule(raw={},index=0){
  return {
    id:text(raw.id)||`rule-${index+1}`,
    enabled:raw.enabled!==false,
    query:text(raw.query)||'*',
    maxPrice:clamp(raw.maxPrice,0,1e15,0),
    currency:CURRENCIES.has(String(raw.currency))?String(raw.currency):'any',
    pokemon:raw.pokemon!==false,
    shiny:raw.shiny!==false,
    items:raw.items!==false,
    stones:raw.stones!==false
  };
}
function normalizeIntelligence(raw={}){
  return {
    enabled:raw.enabled!==false,
    minRoi:clamp(raw.minRoi,-100,100000,30),
    minProfit:clamp(raw.minProfit,0,1e15,300),
    minScore:clamp(raw.minScore,0,100,82),
    minConfidence:clamp(raw.minConfidence,0,100,80),
    maxPrice:clamp(raw.maxPrice,0,1e15,5000),
    currency:CURRENCIES.has(String(raw.currency))?String(raw.currency):'any',
    query:text(raw.query)||'*',
    pokemon:raw.pokemon!==false,
    shiny:raw.shiny!==false,
    items:raw.items!==false,
    stones:raw.stones!==false
  };
}
function normalizeRisk(raw={}){
  return {
    reservePct:clamp(raw.reservePct,0,95,20),
    maxPerPurchaseCoins:clamp(raw.maxPerPurchaseCoins,0,1e15,2000000),
    maxPerPurchaseGems:clamp(raw.maxPerPurchaseGems,0,1e12,2000),
    hourlyBudgetCoins:clamp(raw.hourlyBudgetCoins,0,1e15,5000000),
    hourlyBudgetGems:clamp(raw.hourlyBudgetGems,0,1e12,5000),
    dailyBudgetCoins:clamp(raw.dailyBudgetCoins,0,1e15,15000000),
    dailyBudgetGems:clamp(raw.dailyBudgetGems,0,1e12,15000),
    maxPerMinute:Math.round(clamp(raw.maxPerMinute,1,120,3)),
    maxPerAsset:Math.round(clamp(raw.maxPerAsset,1,100,3)),
    blockOwn:raw.blockOwn!==false,
    blockDuplicate:raw.blockDuplicate!==false,
    blockSuspicious:raw.blockSuspicious!==false,
    respectRateLimits:raw.respectRateLimits!==false
  };
}
function normalizePolicy(raw={},base={}){
  const merged={...base,...raw};
  const rules=Array.isArray(merged.rules)?merged.rules.map(normalizeRule).slice(0,100):[];
  return {
    maxEventAgeMs:clamp(merged.maxEventAgeMs,250,30000,5000),
    rules,
    intelligence:normalizeIntelligence(merged.intelligence||{}),
    risk:normalizeRisk(merged.risk||{}),
    priorityMax:merged.priorityMax!==false,
    watchBeforeOpen:merged.watchBeforeOpen!==false,
    buyWhenOpen:merged.buyWhenOpen!==false
  };
}
function category(listing={}){
  if(listing.assetType==='pokemon')return listing.shiny===true||listing.pokemon?.shiny===true?'shiny':'pokemon';
  const hint=lower(listing.metadata?.category||listing.metadata?.categoria||listing.name);
  if(/stone|pedra/.test(hint))return 'stones';
  return 'items';
}
function listingKey(l={}){return text(l.listingId||l.id);}
function assetKey(l={}){return `${l.assetType||''}:${l.assetId||lower(l.name)}:${l.currency||''}`;}
function ruleAccepts(rule,l){
  if(!rule?.enabled)return false;
  if(rule.maxPrice<=0||Number(l.price)>rule.maxPrice)return false;
  if(rule.currency!=='any'&&rule.currency!==l.currency)return false;
  const c=category(l);if(c==='pokemon'&&!rule.pokemon)return false;if(c==='shiny'&&!rule.shiny)return false;if(c==='items'&&!rule.items)return false;if(c==='stones'&&!rule.stones)return false;
  const q=lower(rule.query);if(q&&q!=='*'&&!lower(l.name).includes(q)&&lower(l.assetId)!==q)return false;
  return true;
}

class SniperRuntime{
  constructor({persistenceFile='',onDecision=null,onPostEvent=null}={}){
    this.persistenceFile=persistenceFile;
    this.onDecision=typeof onDecision==='function'?onDecision:null;
    this.onPostEvent=typeof onPostEvent==='function'?onPostEvent:null;
    this.mode='OFF';this.killSwitch=true;this.policy=normalizePolicy({},{});
    this.accounts=new Map();this.serverOffsets=new Map();this.claims=new Map();this.watch=new Map();this.timers=new Map();this.seen=new Map();this.assetWins=new Map();this.attemptTimes=[];this.spend=[];this.feed=[];
    this.metrics={events:0,matches:0,opportunities:0,attempts:0,wins:0,losses:0,failed:0,ignored:0,lastEventAt:0,lastSendAt:0,lastConfirmAt:0,decision:[],server:[]};
    this.load();
  }
  load(){
    if(!this.persistenceFile)return;
    try{const fs=require('fs'),raw=JSON.parse(fs.readFileSync(this.persistenceFile,'utf8'));this.policy=normalizePolicy(raw.policy||{},this.policy);if(raw.metrics)for(const k of ['events','matches','opportunities','attempts','wins','losses','failed','ignored','lastEventAt','lastSendAt','lastConfirmAt'])if(Number.isFinite(Number(raw.metrics[k])))this.metrics[k]=Number(raw.metrics[k]);this.feed=Array.isArray(raw.feed)?raw.feed.slice(-120):[];}catch{}
    this.mode='OFF';this.killSwitch=true;
  }
  save(){
    if(!this.persistenceFile)return;
    try{const fs=require('fs'),path=require('path');fs.mkdirSync(path.dirname(this.persistenceFile),{recursive:true});const metrics={...this.metrics,decision:undefined,server:undefined};fs.writeFileSync(this.persistenceFile,JSON.stringify({policy:this.policy,metrics,feed:this.feed.slice(-120)}));}catch{}
  }
  configure(patch={}){
    if(patch.policy&&typeof patch.policy==='object')this.policy=normalizePolicy(patch.policy,this.policy);
    if(Array.isArray(patch.rules))this.policy=normalizePolicy({...this.policy,rules:patch.rules},this.policy);
    if(patch.intelligence)this.policy=normalizePolicy({...this.policy,intelligence:{...this.policy.intelligence,...patch.intelligence}},this.policy);
    if(patch.risk)this.policy=normalizePolicy({...this.policy,risk:{...this.policy.risk,...patch.risk}},this.policy);
    for(const k of ['watchBeforeOpen','buyWhenOpen','priorityMax','maxEventAgeMs'])if(patch[k]!==undefined)this.policy=normalizePolicy({...this.policy,[k]:patch[k]},this.policy);
    if(patch.mode&&MODES.has(String(patch.mode)))this.mode=String(patch.mode);
    if(patch.killSwitch!==undefined)this.killSwitch=patch.killSwitch!==false;
    this.save();return this.snapshot();
  }
  kill(on=true){this.killSwitch=on!==false;if(this.killSwitch&&this.mode==='AUTO')this.mode='OFF';for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();for(const row of this.watch.values())if(!['WON','LOST','FAILED'].includes(row.state))row.state='FAILED';this.save();return this.snapshot();}
  _push(type,message,data={}){const row={at:now(),type,message:text(message).slice(0,240),...data};this.feed.push(row);if(this.feed.length>200)this.feed.splice(0,this.feed.length-200);try{this.onPostEvent?.(row);}catch{}return row;}
  _trim(ts=now()){
    for(const [k,t] of this.seen)if(ts-t>30*60*1000)this.seen.delete(k);
    for(const [k,row] of this.claims)if(ts-Number(row.at||0)>30*60*1000)this.claims.delete(k);
    this.attemptTimes=this.attemptTimes.filter(t=>t>ts-60000);this.spend=this.spend.filter(x=>x.at>ts-86400000);
    for(const arr of [this.metrics.decision,this.metrics.server])if(arr.length>1000)arr.splice(0,arr.length-1000);
    if(this.watch.size>160){const sorted=[...this.watch.entries()].sort((a,b)=>Number(a[1].updatedAt)-Number(b[1].updatedAt));for(const [k] of sorted.slice(0,this.watch.size-160))this.watch.delete(k);}
  }
  _account(slot){return this.accounts.get(Number(slot))||null;}
  gamePacket(slot,p,at=now()){
    slot=Number(slot);if(!p||typeof p!=='object')return;
    if((p.t==='welcome'||p.t==='estado')&&p.estado){
      const e=p.estado,prev=this.accounts.get(slot)||{slot,connected:true};prev.connected=true;prev.lastAt=at;
      if(e.id!=null)prev.id=String(e.id);if(e.nick!=null)prev.name=text(e.nick);if(e.gold!=null)prev.coins=Number(e.gold);if(e.orbs!=null)prev.gems=Number(e.orbs);if(e.servidorAgora!=null&&Number.isFinite(Number(e.servidorAgora)))this.serverOffsets.set(slot,Number(e.servidorAgora)-at);this.accounts.set(slot,prev);return;
    }
    if(p.t!=='market'||this.mode==='OFF')return;
    const rows=[];for(const key of ['linhas','anuncios','lista','ofertas'])if(Array.isArray(p[key]))for(const raw of p[key]){const l=normalizeListing(raw,slot,at);if(l?.listingId)rows.push(l);}
    if(!['meus','especies'].includes(String(p.aba||'')))for(const l of rows)this.ingestOne(l,at);
  }
  disconnect(slot){const a=this.accounts.get(Number(slot));if(a)a.connected=false;}
  _serverNow(slot,ts=now()){return ts+Number(this.serverOffsets.get(Number(slot))||0);}
  _route(listing){
    const candidates=[...this.accounts.values()].filter(a=>a.connected!==false&&now()-Number(a.lastAt||0)<120000).sort((a,b)=>Number(a.slot)-Number(b.slot));
    const risk=this.policy.risk,own=listing.sellerId!=null?String(listing.sellerId):'';
    for(const a of candidates){
      if(risk.blockOwn&&own&&a.id&&own===String(a.id))continue;
      const balance=listing.currency==='gems'?Number(a.gems):Number(a.coins);if(!Number.isFinite(balance))continue;
      const reserve=balance*risk.reservePct/100;if(balance-Number(listing.price)<reserve)continue;
      if(this._gateBudget(listing,a.slot).ok)return a;
    }
    return null;
  }
  _gateBudget(l,slot){
    const risk=this.policy.risk,price=Number(l.price),currency=l.currency,ts=now();
    if(risk.blockDuplicate&&this.claims.has(listingKey(l)))return {ok:false,reason:'duplicate-claim'};
    if(risk.respectRateLimits&&this.attemptTimes.length>=risk.maxPerMinute)return {ok:false,reason:'rate-limit'};
    if((this.assetWins.get(assetKey(l))||0)>=risk.maxPerAsset)return {ok:false,reason:'asset-limit'};
    const max=currency==='gems'?risk.maxPerPurchaseGems:risk.maxPerPurchaseCoins;if(max>0&&price>max)return {ok:false,reason:'max-purchase'};
    const hour=this.spend.filter(x=>x.currency===currency&&x.at>=ts-3600000).reduce((a,x)=>a+x.amount,0),day=this.spend.filter(x=>x.currency===currency&&x.at>=ts-86400000).reduce((a,x)=>a+x.amount,0);
    const hmax=currency==='gems'?risk.hourlyBudgetGems:risk.hourlyBudgetCoins,dmax=currency==='gems'?risk.dailyBudgetGems:risk.dailyBudgetCoins;
    if(hmax>0&&hour+price>hmax)return {ok:false,reason:'hourly-budget'};if(dmax>0&&day+price>dmax)return {ok:false,reason:'daily-budget'};
    return {ok:true,slot};
  }
  _decision(l,receivedAt){
    const t0=mono(),age=Math.max(0,receivedAt-Number(l.at||receivedAt));let reason='',rule=null;
    if(!listingKey(l)||!['pokemon','item'].includes(String(l.assetType)))reason='listing-invalid';
    else if(!(Number(l.price)>0))reason='price-invalid';
    else if(age>this.policy.maxEventAgeMs)reason='stale';
    else if(!(rule=this.policy.rules.find(r=>ruleAccepts(r,l))))reason='no-rule-match';
    const decisionMs=elapsedMs(t0);this.metrics.decision.push(decisionMs);return {decision:reason?'IGNORE':'MATCH',reason:reason||'rule-match',rule,decisionMs,age};
  }
  ingest(listings=[],protocol=null){for(const l of Array.isArray(listings)?listings:[])this.ingestOne(l,now());return this.snapshot();}
  ingestOne(listing,receivedAt=now()){
    this._trim(receivedAt);const key=listingKey(listing);if(!key||this.seen.has(key))return null;this.seen.set(key,receivedAt);this.metrics.events++;this.metrics.lastEventAt=receivedAt;
    const evaluation=this._decision(listing,receivedAt);if(evaluation.decision!=='MATCH'){this.metrics.ignored++;return evaluation;}this.metrics.matches++;this.metrics.opportunities++;
    const route=this._route(listing);if(!route){this.metrics.ignored++;this._push('BLOCKED','Oportunidade sem conta elegível',{listing:copy(listing),reason:'no-account'});return {...evaluation,reason:'no-account'};}
    const routed={...listing,sourceSlot:Number(listing.slot),slot:Number(route.slot)},availableAt:Number(listing.availableAt)||0,serverNow=this._serverNow(route.slot,receivedAt),delayMs=0;
    routed.delayMs=availableAt>0?Math.max(0,availableAt-serverNow):0;
    const row={key,listing:routed,rule:evaluation.rule,state:'CLAIMED',createdAt:receivedAt,updatedAt:receivedAt,account:{slot:route.slot,name:route.name||`Conta ${route.slot+1}`},delayMs:routed.delayMs,timing:{t0:receivedAt,decisionMs:evaluation.decisionMs}};this.claims.set(key,{at:receivedAt,state:'CLAIMED'});this.watch.set(key,row);
    if(this.mode==='OBSERVE'||this.mode==='SEMI'){row.state=routed.delayMs>0?'WATCHING':'READY';this._push('MATCH',this.mode==='OBSERVE'?'TERIA COMPRADO':'Aguardando confirmação',{listing:copy(routed),state:row.state});return evaluation;}
    if(this.mode!=='AUTO'||this.killSwitch){row.state='FAILED';return evaluation;}
    if(routed.delayMs>1&&this.policy.watchBeforeOpen){row.state='PREARMED';this._push('PREARMED','Anúncio pré-armado',{listing:copy(routed),delayMs:routed.delayMs});this._schedule(key,routed.delayMs);}
    else if(this.policy.buyWhenOpen){row.state='READY';queueMicrotask(()=>void this._send(key));}
    return evaluation;
  }
  _schedule(key,delay){
    const row=this.watch.get(key);if(!row||this.timers.has(key))return;const wait=Math.max(0,Math.min(2147483647,Math.ceil(delay)));
    const timer=setTimeout(()=>{this.timers.delete(key);const r=this.watch.get(key);if(!r||r.state!=='PREARMED')return;r.state='READY';r.updatedAt=now();r.timing.releaseAt=r.updatedAt;void this._send(key);},wait);this.timers.set(key,timer);
  }
  async _send(key){
    const row=this.watch.get(key);if(!row||this.killSwitch||this.mode!=='AUTO'||!['READY','CLAIMED'].includes(row.state))return;
    const l=row.listing,gate=this._gateBudget(l,l.slot);if(!gate.ok){row.state='FAILED';row.reason=gate.reason;row.updatedAt=now();this.metrics.failed++;this._push('FAILED','Compra bloqueada pelo risco',{listing:copy(l),reason:gate.reason});return;}
    const serverNow=this._serverNow(l.slot);if(Number(l.availableAt)>0&&serverNow+1<Number(l.availableAt)){row.state='PREARMED';this._schedule(key,Number(l.availableAt)-serverNow);return;}
    row.state='SENT';row.updatedAt=now();row.timing.sendAt=row.updatedAt;this.metrics.attempts++;this.metrics.lastSendAt=row.updatedAt;this.attemptTimes.push(row.updatedAt);this._push('SENT','BUY enviado',{listing:copy(l)});
    const start=mono();
    try{
      if(!this.onDecision)throw new Error('executor-unavailable');const result=await this.onDecision({listing:copy(l),evaluation:{rule:row.rule,decisionMs:row.timing.decisionMs},policy:copy(this.policy)});const total=elapsedMs(start),ok=result?.ok===true||result?.outcome?.ok===true;this.metrics.server.push(total);row.serverMs=total;row.result=result||null;row.updatedAt=now();
      if(ok){row.state='WON';this.metrics.wins++;this.metrics.lastConfirmAt=row.updatedAt;this.spend.push({at:row.updatedAt,currency:l.currency,amount:Number(result?.outcome?.price??l.price)||0});this.assetWins.set(assetKey(l),(this.assetWins.get(assetKey(l))||0)+1);this._push('WON','Compra confirmada',{listing:copy(l),serverMs:total});}
      else{row.state='LOST';row.reason=text(result?.outcome?.error||result?.error||'not-confirmed');this.metrics.losses++;this._push('LOST','Compra não confirmada',{listing:copy(l),reason:row.reason,serverMs:total});}
    }catch(error){row.state='FAILED';row.reason=text(error?.message||error);row.updatedAt=now();this.metrics.failed++;this._push('FAILED','Falha no executor',{listing:copy(l),reason:row.reason});}
    finally{const claim=this.claims.get(key);if(claim)claim.state=row.state;this.save();}
  }
  observeSales(){return this.snapshot();}
  manualClaim(listing){return this.ingestOne(listing,now());}
  snapshot(){
    this._trim();const d=this.metrics.decision,s=this.metrics.server,attempts=this.metrics.attempts,wins=this.metrics.wins;
    return {mode:this.mode,killSwitch:this.killSwitch,policy:copy(this.policy),metrics:{...this.metrics,decision:undefined,server:undefined,winRate:attempts?wins/attempts*100:0,decisionP50Ms:percentile(d,.50),decisionP95Ms:percentile(d,.95),decisionP99Ms:percentile(d,.99),serverP50Ms:percentile(s,.50),serverP95Ms:percentile(s,.95),serverP99Ms:percentile(s,.99)},watchQueue:[...this.watch.values()].sort((a,b)=>Number(a.listing?.availableAt||0)-Number(b.listing?.availableAt||0)).slice(0,80).map(copy),feed:this.feed.slice(-120).reverse().map(copy),accounts:[...this.accounts.values()].map(copy),states:[...STATES]};
  }
  close(){this.kill(true);this.save();}
}

module.exports={SniperRuntime,normalizeRule,normalizePolicy,category,ruleAccepts};
