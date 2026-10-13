'use strict';

const fs=require('fs');
const path=require('path');

const MODES=new Set(['OFF','OBSERVE','SEMI','AUTO']);
const TYPES=new Set(['any','pokemon','item']);
const CURRENCIES=new Set(['any','coins','gems']);
const SHINY=new Set(['any','only','exclude']);
const clamp=(v,min,max,fallback)=>{v=Number(v);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;};
const cleanText=v=>String(v??'').trim();
const lower=v=>cleanText(v).toLocaleLowerCase('pt-BR');
const now=()=>Date.now();
const mono=()=>process.hrtime.bigint();
const ms=(a,b)=>Number(b-a)/1e6;
const quantile=(arr,q)=>{const a=arr.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;return a[Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*q)))];};

function normalizeRule(raw={},index=0){
  const maxPrice=clamp(raw.maxPrice,0,1e15,0);
  return {
    id:cleanText(raw.id)||`rule-${index+1}`,
    enabled:raw.enabled!==false,
    query:cleanText(raw.query)||'*',
    assetType:TYPES.has(String(raw.assetType))?String(raw.assetType):'any',
    currency:CURRENCIES.has(String(raw.currency))?String(raw.currency):'any',
    maxPrice,
    shiny:SHINY.has(String(raw.shiny))?String(raw.shiny):'any'
  };
}
function normalizePolicy(raw={},base={}){
  const merged={...base,...raw};
  return {
    maxEventAgeMs:clamp(merged.maxEventAgeMs,250,30000,5000),
    maxPerMinute:Math.round(clamp(merged.maxPerMinute,1,120,12)),
    maxPerAsset:Math.round(clamp(merged.maxPerAsset,1,100,3)),
    hourlyBudgetCoins:clamp(merged.hourlyBudgetCoins,0,1e15,1000000),
    dailyBudgetCoins:clamp(merged.dailyBudgetCoins,0,1e15,5000000),
    hourlyBudgetGems:clamp(merged.hourlyBudgetGems,0,1e12,25),
    dailyBudgetGems:clamp(merged.dailyBudgetGems,0,1e12,100),
    reserveCoins:clamp(merged.reserveCoins,0,1e15,0),
    reserveGems:clamp(merged.reserveGems,0,1e12,0),
    allowShiny:merged.allowShiny!==false,
    whitelist:Array.isArray(merged.whitelist)?merged.whitelist.map(lower).filter(Boolean).slice(0,300):[],
    blacklist:Array.isArray(merged.blacklist)?merged.blacklist.map(lower).filter(Boolean).slice(0,300):[],
    rules:(Array.isArray(merged.rules)?merged.rules:[]).slice(0,100).map(normalizeRule).filter(r=>r.maxPrice>0)
  };
}
function listingKey(l={}){return `${Number(l.slot)}:${cleanText(l.listingId)}`;}
function assetKey(l={}){return `${Number(l.slot)}:${cleanText(l.assetType)}:${cleanText(l.assetId||l.name)}:${cleanText(l.currency)}`;}

class SniperRuntime{
  constructor({persistenceFile,onDecision}={}){
    this.persistenceFile=persistenceFile||'';
    this.onDecision=typeof onDecision==='function'?onDecision:null;
    this.mode='OFF';
    this.killSwitch=true;
    this.activeEngine='direct';
    this.policy=normalizePolicy({},{});
    this.seen=new Map();
    this.busySlots=new Set();
    this.attemptTimes=[];
    this.spendTimes=[];
    this.assetWins=new Map();
    this.feed=[];
    this.metrics={events:0,matches:0,ignored:0,attempts:0,wins:0,losses:0,errors:0,spentCoins:0,spentGems:0,lastEventAt:0,lastAttemptAt:0,lastWinAt:0,lastDecisionMs:0,lastEventAgeMs:0,decisionMs:[],eventAgeMs:[]};
    this.load();
  }
  load(){
    if(!this.persistenceFile)return;
    try{
      const raw=JSON.parse(fs.readFileSync(this.persistenceFile,'utf8'));
      this.policy=normalizePolicy(raw.policy||{},this.policy);
      if(raw.metrics&&typeof raw.metrics==='object'){
        for(const k of ['events','matches','ignored','attempts','wins','losses','errors','spentCoins','spentGems','lastEventAt','lastAttemptAt','lastWinAt'])if(Number.isFinite(Number(raw.metrics[k])))this.metrics[k]=Number(raw.metrics[k]);
      }
      this.feed=Array.isArray(raw.feed)?raw.feed.slice(-80):[];
    }catch{}
    this.mode='OFF';
    this.killSwitch=true;
  }
  save(){
    if(!this.persistenceFile)return;
    try{fs.mkdirSync(path.dirname(this.persistenceFile),{recursive:true});fs.writeFileSync(this.persistenceFile,JSON.stringify({policy:this.policy,metrics:{...this.metrics,decisionMs:undefined,eventAgeMs:undefined},feed:this.feed.slice(-80)},null,2));}catch{}
  }
  configure(patch={}){
    if(patch.policy&&typeof patch.policy==='object')this.policy=normalizePolicy(patch.policy,this.policy);
    if(patch.rules)this.policy=normalizePolicy({rules:patch.rules},this.policy);
    if(patch.mode&&MODES.has(String(patch.mode)))this.mode=String(patch.mode);
    if(patch.killSwitch!==undefined)this.killSwitch=patch.killSwitch!==false;
    this.activeEngine='direct';
    this.save();
    return this.snapshot();
  }
  kill(on=true){this.killSwitch=on!==false;if(this.killSwitch&&this.mode==='AUTO')this.mode='OFF';this.save();return this.snapshot();}
  _trim(ts=now()){
    for(const [k,t] of this.seen)if(ts-t>30*60*1000)this.seen.delete(k);
    this.attemptTimes=this.attemptTimes.filter(t=>t>ts-60000);
    this.spendTimes=this.spendTimes.filter(x=>x.at>ts-24*60*60*1000);
    if(this.metrics.decisionMs.length>600)this.metrics.decisionMs.splice(0,this.metrics.decisionMs.length-600);
    if(this.metrics.eventAgeMs.length>600)this.metrics.eventAgeMs.splice(0,this.metrics.eventAgeMs.length-600);
  }
  _matchName(listing,values=[]){if(!values.length)return false;const n=lower(listing.name),id=lower(listing.assetId);return values.some(v=>v==='*'||v===n||v===id||n.includes(v));}
  _matchingRule(listing){
    const n=lower(listing.name),id=lower(listing.assetId),type=String(listing.assetType||''),currency=String(listing.currency||''),isShiny=listing.shiny===true||listing.pokemon?.shiny===true;
    for(const r of this.policy.rules){
      if(!r.enabled)continue;
      if(r.assetType!=='any'&&r.assetType!==type)continue;
      if(r.currency!=='any'&&r.currency!==currency)continue;
      if(r.shiny==='only'&&!isShiny)continue;
      if(r.shiny==='exclude'&&isShiny)continue;
      const q=lower(r.query);if(q!=='*'&&q!==n&&q!==id&&!n.includes(q))continue;
      if(Number(listing.price)>Number(r.maxPrice))continue;
      return r;
    }
    return null;
  }
  decide(listing,receivedAt=now()){
    const start=mono(),age=Math.max(0,receivedAt-(Number(listing?.at)||receivedAt));let reason='';let rule=null;
    if(!listing||!cleanText(listing.listingId)||!['item','pokemon'].includes(String(listing.assetType||'')))reason='listing-invalid';
    else if(!Number.isFinite(Number(listing.price))||Number(listing.price)<=0)reason='price-invalid';
    else if(age>this.policy.maxEventAgeMs)reason='stale';
    else if(this._matchName(listing,this.policy.blacklist))reason='blacklist';
    else if(this.policy.whitelist.length&&!this._matchName(listing,this.policy.whitelist))reason='not-whitelisted';
    else if(this.policy.allowShiny===false&&(listing.shiny===true||listing.pokemon?.shiny===true))reason='shiny-disabled';
    else if(!this.policy.rules.length)reason='no-rules';
    else if(!(rule=this._matchingRule(listing)))reason='no-rule-match';
    const elapsed=ms(start,mono());
    this.metrics.lastDecisionMs=elapsed;this.metrics.lastEventAgeMs=age;this.metrics.decisionMs.push(elapsed);this.metrics.eventAgeMs.push(age);
    return {decision:reason?'IGNORE':'BUY',reason:reason||'rule-match',rule,decisionMs:elapsed,eventAgeMs:age,fairValue:0,fastSell:0,liquidity:0,profit:0,roiPct:0};
  }
  _push(row){this.feed.push({at:now(),...row});if(this.feed.length>120)this.feed.splice(0,this.feed.length-120);}
  _budget(currency,windowMs){const cutoff=now()-windowMs;return this.spendTimes.filter(x=>x.currency===currency&&x.at>=cutoff).reduce((a,x)=>a+Number(x.amount||0),0);}
  _canAttempt(listing){
    const ts=now();this._trim(ts);
    if(this.killSwitch)return {ok:false,reason:'kill-switch'};
    if(this.mode!=='AUTO')return {ok:false,reason:'not-auto'};
    const slot=Number(listing.slot);if(this.busySlots.has(slot))return {ok:false,reason:'slot-busy'};
    if(this.attemptTimes.length>=this.policy.maxPerMinute)return {ok:false,reason:'minute-limit'};
    const akey=assetKey(listing),wins=Number(this.assetWins.get(akey)||0);if(wins>=this.policy.maxPerAsset)return {ok:false,reason:'asset-limit'};
    const c=String(listing.currency),price=Number(listing.price),hour=this._budget(c,3600000),day=this._budget(c,86400000);
    if(c==='coins'){
      if(this.policy.hourlyBudgetCoins>0&&hour+price>this.policy.hourlyBudgetCoins)return {ok:false,reason:'hourly-budget'};
      if(this.policy.dailyBudgetCoins>0&&day+price>this.policy.dailyBudgetCoins)return {ok:false,reason:'daily-budget'};
    }else if(c==='gems'){
      if(this.policy.hourlyBudgetGems>0&&hour+price>this.policy.hourlyBudgetGems)return {ok:false,reason:'hourly-budget'};
      if(this.policy.dailyBudgetGems>0&&day+price>this.policy.dailyBudgetGems)return {ok:false,reason:'daily-budget'};
    }
    return {ok:true};
  }
  async autoAttempt(listing,evaluation){
    const gate=this._canAttempt(listing);if(!gate.ok){this._push({status:'BLOCKED',reason:gate.reason,listing:{...listing},evaluation});return;}
    const slot=Number(listing.slot),started=mono(),ts=now();this.busySlots.add(slot);this.attemptTimes.push(ts);this.metrics.attempts++;this.metrics.lastAttemptAt=ts;
    const row={status:'SENT',reason:'',listing:{...listing},evaluation,rule:evaluation.rule||null,sendRequestedAt:ts};this._push(row);
    try{
      if(!this.onDecision)throw new Error('executor-unavailable');
      const result=await this.onDecision({listing:{...listing},evaluation:{...evaluation},policy:{...this.policy}});
      const ok=result?.ok===true||result?.outcome?.ok===true;
      row.totalMs=ms(started,mono());row.result=result||null;
      if(ok){
        row.status='WON';this.metrics.wins++;this.metrics.lastWinAt=now();const c=String(listing.currency),amount=Number(result?.outcome?.price??listing.price)||0;this.spendTimes.push({at:now(),currency:c,amount});this.assetWins.set(assetKey(listing),(this.assetWins.get(assetKey(listing))||0)+1);if(c==='coins')this.metrics.spentCoins+=amount;if(c==='gems')this.metrics.spentGems+=amount;
      }else{row.status='LOST';row.reason=cleanText(result?.outcome?.error||result?.error||'not-confirmed');this.metrics.losses++;}
    }catch(error){row.status='LOST';row.reason=cleanText(error?.message||error);row.totalMs=ms(started,mono());this.metrics.losses++;this.metrics.errors++;}
    finally{this.busySlots.delete(slot);this.save();}
  }
  ingest(listings=[],protocol=null){
    if(this.mode==='OFF')return this.snapshot();const ts=now();this._trim(ts);
    for(const listing of Array.isArray(listings)?listings:[]){
      const key=listingKey(listing);if(!key||key.endsWith(':')||this.seen.has(key))continue;this.seen.set(key,ts);this.metrics.events++;this.metrics.lastEventAt=ts;
      const evaluation=this.decide(listing,ts);
      if(evaluation.decision!=='BUY'){this.metrics.ignored++;continue;}
      this.metrics.matches++;
      if(this.mode==='OBSERVE'){this._push({status:'MATCH',reason:'observe',listing:{...listing},evaluation});continue;}
      if(this.mode==='SEMI'){this._push({status:'MATCH',reason:'semi',listing:{...listing},evaluation});continue;}
      if(this.mode==='AUTO'&&!this.killSwitch)void this.autoAttempt(listing,evaluation);
    }
    return this.snapshot();
  }
  observeSales(){return this.snapshot();}
  snapshot(){
    const d=this.metrics.decisionMs.slice(),ages=this.metrics.eventAgeMs.slice(),attempts=this.metrics.attempts,wins=this.metrics.wins;
    return {
      mode:this.mode,killSwitch:this.killSwitch,activeEngine:'direct',policy:{...this.policy,rules:this.policy.rules.map(x=>({...x}))},
      metrics:{...this.metrics,decisionMs:undefined,eventAgeMs:undefined,winRate:attempts?wins/attempts*100:0,decisionP50Ms:quantile(d,.50),decisionP95Ms:quantile(d,.95),eventAgeP50Ms:quantile(ages,.50),eventAgeP95Ms:quantile(ages,.95),busySlots:[...this.busySlots]},
      feed:this.feed.slice(-80).reverse(),
      engines:{direct:{online:true,label:'Direct in-process'},node:{online:false,label:'Removed from hot path'},cpp:{online:false,label:'Removed from hot path'}},
      captureWarning:'Feed direto do WebSocket via debugger do Electron; sem a janela agregada de 3,5 s antes da decisão.'
    };
  }
  close(){this.killSwitch=true;this.mode='OFF';this.save();}
}

module.exports={SniperRuntime,normalizePolicy,normalizeRule};
