'use strict';
// Independent read-only observations. Never infer hunting income from wallet balances.
const fs = require('node:fs');
const MINUTE = 60000, RETENTION = 24 * 60 * MINUTE, GAP = 15000, PERIODS = [15,60,180,360];
const number = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const label = v => String(v ?? '').slice(0,160);
const primitive = v => v === null || v === undefined ? '' : (typeof v === 'object' ? '' : String(v));
function tinySignature(value, depth=0) {
  if (value === null || value === undefined) return '';
  if (depth > 3) return typeof value;
  if (typeof value !== 'object') return primitive(value);
  if (Array.isArray(value)) {
    let out='['; const n=Math.min(value.length,32);
    for(let i=0;i<n;i++) out+=tinySignature(value[i],depth+1)+';';
    return out+']'+value.length;
  }
  const keys=Object.keys(value).sort().slice(0,32);let out='{';
  for(const k of keys) out+=k+':'+tinySignature(value[k],depth+1)+';';
  return out+'}';
}
function rewardFingerprint(packet, at) {
  const events=Array.isArray(packet?.ev)?packet.ev:null;if(!events?.length)return null;
  let h1=2166136261>>>0,h2=2246822519>>>0,rewards=0;
  const mix=v=>{const s=primitive(v);for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h1=Math.imul(h1^c,16777619)>>>0;h2=Math.imul(h2^(c+0x9e37),3266489917)>>>0;}h1=Math.imul(h1^255,16777619)>>>0;h2=Math.imul(h2^127,668265263)>>>0;};
  const n=Math.min(events.length,500);
  for(let i=0;i<n;i++){
    const ev=events[i];if(ev?.k!=='morte'||ev.quem!=='selvagem')continue;
    rewards++;mix(i);for(const key of Object.keys(ev)){mix(key);const value=ev[key];mix(value&&typeof value==='object'?tinySignature(value):value);}
  }
  return rewards?`${at}:${rewards}:${h1}:${h2}`:null;
}
function freshAgg(){return {ms:0,kills:0,samples:0,xp:0,gold:0,xpKnown:true,goldKnown:true,lastAt:0};}
function addAgg(a,b){a.ms+=Number(b.ms)||0;a.kills+=Number(b.kills)||0;if((Number(b.ms)||0)>0)a.samples++;a.xp+=Number(b.xp)||0;a.gold+=Number(b.gold)||0;a.xpKnown=a.xpKnown&&b.xpKnown!==false;a.goldKnown=a.goldKnown&&b.goldKnown!==false;a.lastAt=Math.max(a.lastAt,Number(b.end)||Number(b.at)||0);return a;}
function summary(a){const xpKnown=a.kills>0&&a.xpKnown,goldKnown=a.kills>0&&a.goldKnown,xp=xpKnown?a.xp:null,gold=goldKnown?a.gold:null;return {ms:a.ms,kills:a.kills,samples:a.samples,xp,gold,xpPerHour:a.ms>=MINUTE&&xp!==null?xp*3600000/a.ms:null,goldPerHour:a.ms>=MINUTE&&gold!==null?gold*3600000/a.ms:null};}
class HuntVisualStore {
  constructor(file = '') {
    this.file=file;this.accounts=new Map();this.slots=Array(4).fill(null);this.catalog=new Map();this.catalogRevision=1;this.catalogCache={revision:0,rows:[]};this.viewCache=Array(4).fill(null);this.dirty=false;this.dirtyVersion=0;this.persistedVersion=0;this.serializedVersion=-1;this.serializedPayload='';this.saving=null;this.flushRequested=false;
    try {const data=JSON.parse(fs.readFileSync(file,'utf8')); if(data.version===1) {
      for(const raw of (data.accounts||[]).slice(-16)) if(raw.id){const a={...raw,bins:(raw.bins||[]).filter(b=>b.at>Date.now()-RETENTION).slice(-1440)};this.accounts.set(a.id,a);}
      for(const h of (data.catalog||[]).slice(0,500)) this.catalog.set(h.id,h);
      this.catalogRevision++;
    }} catch {}
  }
  _boostSignature(s){return `${s.boostSig||''}|${s.kickSig||''}`;}
  _contextKey(s){const p=s.profile||{};return `${label(s.state.activeId)}|${primitive(p.level)}|${primitive(p.potencia)}|${primitive(p.refinoTotal)}|${this._boostSignature(s)}`;}
  _profileKey(s){const p=s.profile||{};const types=Array.isArray(p.tipos)?p.tipos.slice(0,2).join('/'):'',ivs=tinySignature(p.ivs);return `${label(p.id)}|${primitive(p.speciesId)}|${label(p.nome||p.apelido)}|${primitive(p.level)}|${types}|${p.shiny===true?1:0}|${label(p.form)}|${ivs}`;}
  _refreshKeys(s){s.contextKey=this._contextKey(s);s.profileKey=this._profileKey(s);}
  eligible(s) {return !!(s?.state.huntSlug && s.profile && !s.state.noCentro && !s.state.mistico && !s.state.boss?.arena);}
  bin(s,at) {
    const a=this.accounts.get(s.id),key=s.contextKey,hunt=label(s.state.huntSlug),minute=Math.floor(at/MINUTE)*MINUTE;
    let b=a.bins.at(-1);
    if(!b||b.at!==minute||b.key!==key||b.hunt!==hunt||b.session!==s.started) {
      b={at:minute,end:at,key,hunt,session:s.started,pokemonId:label(s.state.activeId),level:number(s.profile?.level),ms:0,xp:0,gold:0,kills:0,xpKnown:true,goldKnown:true};a.bins.push(b);
      if(a.bins.length>1440||a.bins[0]?.at<at-RETENTION)a.bins=a.bins.filter(x=>x.at>=at-RETENTION).slice(-1440);
    }
    b.end=at;return b;
  }
  frame(slot,p,at=Date.now()) {
    if(!Number.isInteger(slot)||slot<0||slot>3||!p||!['welcome','estado','batalha','campo','campo.init'].includes(p.t))return false;
    let s=this.slots[slot]; const e=p.estado;
    if(s&&at<s.lastAt)return false;
    if((p.t==='welcome'||p.t==='estado')&&e?.id!=null&&(!s||label(e.id)!==s.id||p.t==='welcome')) {
      const id=label(e.id);let a=this.accounts.get(id);
      if(!a){a={id,name:label(e.nick),bins:[],lastAt:at};this.accounts.set(id,a);}
      s={id,state:{},profile:null,pokes:new Map(),lastAt:at,started:at,huntSince:at,connected:true,seen:new Set(),boostSig:'',kickSig:'',contextKey:'',profileKey:'',viewRevision:0};this.slots[slot]=s;this._refreshKeys(s);this.viewCache[slot]=null;
      while(this.accounts.size>16){const removable=[...this.accounts.keys()].find(k=>!this.slots.some(x=>x?.id===k));if(!removable)break;this.accounts.delete(removable);}
    }
    if(!s||at<s.lastAt)return false;
    if(!s.connected&&p.t!=='welcome'&&!(p.t==='estado'&&e?.id!=null))return false;
    const rewardKey=p.t==='batalha'?rewardFingerprint(p,at):null;if(rewardKey&&s.seen.has(rewardKey))return false;
    if(rewardKey){s.seen.add(rewardKey);if(s.seen.size>128)s.seen.delete(s.seen.values().next().value);}
    const dt=at-s.lastAt,previousKey=s.contextKey,previousProfileKey=s.profileKey,previousHunt=s.state.huntSlug;
    if(e&&(p.t==='welcome'||p.t==='estado')) {
      for(const k of ['activeId','huntSlug','noCentro','mistico','boss','loja','kick'])if(Object.hasOwn(e,k))s.state[k]=e[k];
      if(Object.hasOwn(e,'loja'))s.boostSig=tinySignature(e.loja?.boosts);
      if(Object.hasOwn(e,'kick'))s.kickSig=tinySignature(e.kick);
      for(const raw of (e.pokemons||e.pkMud||[]).slice(0,300))if(raw?.id!=null)s.pokes.set(label(raw.id),{...s.pokes.get(label(raw.id)),...raw});
      while(s.pokes.size>300)s.pokes.delete(s.pokes.keys().next().value);
      s.profile=s.pokes.get(label(s.state.activeId))||null;this._refreshKeys(s);
      if(e.nick)this.accounts.get(s.id).name=label(e.nick);
      if(previousHunt!==s.state.huntSlug)s.huntSince=at;
    }
    if(p.t==='welcome'&&Array.isArray(p.hunts))for(const h of p.hunts.slice(0,500))if(h.slug!=null){const id=label(h.slug),next={id,name:label(h.nome||h.slug),area:label(h.area)},old=this.catalog.get(id);if(!old||old.name!==next.name||old.area!==next.area){this.catalog.set(id,next);this.catalogRevision++;this.catalogCache.revision=0;}}
    const continuous=s.connected&&dt>0&&dt<=GAP&&previousKey===s.contextKey&&previousHunt===s.state.huntSlug&&this.eligible(s);
    if(continuous) {
      let cursor=s.lastAt;while(cursor<at){const end=Math.min(at,(Math.floor(cursor/MINUTE)+1)*MINUTE);this.bin(s,end-1).ms+=end-cursor;cursor=end;}
      if(p.t==='batalha')for(const ev of (p.ev||[]).slice(0,500))if(ev?.k==='morte'&&ev.quem==='selvagem') {
        const b=this.bin(s,at),xp=number(ev.xpTreinador),gold=number(ev.ouro);b.kills++;
        if(xp!==null&&xp>=0)b.xp+=xp;else b.xpKnown=false;
        if(gold!==null&&gold>=0)b.gold+=gold;else b.goldKnown=false;
      }
    }
    s.lastAt=at;s.connected=true;const a=this.accounts.get(s.id);a.lastAt=at;
    if(previousKey!==s.contextKey||previousProfileKey!==s.profileKey||previousHunt!==s.state.huntSlug)this.viewCache[slot]=null;
    this.dirty=true;this.dirtyVersion++;return true;
  }
  disconnect(slot) {const s=this.slots[slot];if(s){s.connected=false;s.profile=null;s.pokes.clear();s.state={};s.seen.clear();s.contextKey='';s.profileKey='';this.viewCache[slot]=null;}return !!s;}
  summarize(bins) {const a=freshAgg();for(const b of bins||[])addAgg(a,b);return summary(a);}
  _windowsFor(slot,s,a,end) {
    const cacheKey=`${end}|${s.contextKey}|${s.profileKey}|${label(s.state.huntSlug)}|${s.started}|${this.catalogRevision}`;
    const cached=this.viewCache[slot];if(cached?.key===cacheKey)return cached.windows;
    const buckets=new Map(PERIODS.map(m=>[m,{total:freshAgg(),groups:new Map(),current:freshAgg(),chart:[]}])) , hunt=label(s.state.huntSlug);
    const start360=end-360*MINUTE;
    for(const b of a.bins){if(b.at<start360||b.at>=end||b.key!==s.contextKey)continue;const age=end-b.at;
      for(const minutes of PERIODS){if(age>minutes*MINUTE)continue;const bucket=buckets.get(minutes);addAgg(bucket.total,b);let g=bucket.groups.get(b.hunt);if(!g){g=freshAgg();bucket.groups.set(b.hunt,g);}addAgg(g,b);
        if(b.hunt===hunt&&b.session===s.started){addAgg(bucket.current,b);bucket.chart.push({at:b.at,...summary(addAgg(freshAgg(),b))});if(bucket.chart.length>60)bucket.chart.shift();}
      }
    }
    const windows={};for(const minutes of PERIODS){const bucket=buckets.get(minutes),hunts=[];for(const [id,g] of bucket.groups)hunts.push({id,name:this.catalog.get(id)?.name||id,...summary(g),lastAt:g.lastAt});windows[minutes]={start:end-minutes*MINUTE,end,current:summary(bucket.current),hunts,chart:bucket.chart};}
    s.viewRevision=(s.viewRevision||0)+1;this.viewCache[slot]={key:cacheKey,windows};return windows;
  }
  view(now=Date.now()) {
    const end=Math.floor(now/MINUTE)*MINUTE;
    if(this.catalogCache.revision!==this.catalogRevision)this.catalogCache={revision:this.catalogRevision,rows:[...this.catalog.values()]};
    return {at:now,catalogRevision:this.catalogRevision,catalog:this.catalogCache.rows,accounts:this.slots.map((s,slot)=>{
      if(!s)return {slot,id:null,name:`Conta ${slot+1}`,connected:false,lastAt:null,revision:0,windows:{}};
      const a=this.accounts.get(s.id),p=s.profile,online=s.connected&&now-s.lastAt<=120000,windows=this._windowsFor(slot,s,a,end);
      const profile=p?{id:label(p.id),speciesId:number(p.speciesId),name:label(p.nome||p.apelido),nickname:label(p.apelido),level:number(p.level),types:Array.isArray(p.tipos)?p.tipos.slice(0,2):[],ivs:p.ivs||null,shiny:p.shiny===true,form:label(p.form)}:null;
      return {slot,id:s.id,name:a.name||`Conta ${slot+1}`,connected:online,lastAt:s.lastAt,revision:s.viewRevision||0,profile,hunt:label(s.state.huntSlug),huntName:this.catalog.get(label(s.state.huntSlug))?.name||label(s.state.huntSlug),huntSince:s.huntSince,started:s.started,windows};
    })};
  }
  debugStats(){return {accounts:this.accounts.size,catalog:this.catalog.size,bins:[...this.accounts.values()].reduce((n,a)=>n+(a.bins?.length||0),0),seen:this.slots.reduce((n,s)=>n+(s?.seen?.size||0),0),pokes:this.slots.reduce((n,s)=>n+(s?.pokes?.size||0),0),viewCaches:this.viewCache.filter(Boolean).length,dirtyVersion:this.dirtyVersion,persistedVersion:this.persistedVersion};}
  flush() {
    if(!this.file||(!this.dirty&&this.persistedVersion===this.dirtyVersion))return this.saving||Promise.resolve();
    if(this.saving){this.flushRequested=true;return this.saving.then(()=>this.flushRequested?this.flush():undefined);}
    const version=this.dirtyVersion;this.dirty=false;this.flushRequested=false;
    if(this.serializedVersion!==version){this.serializedPayload=JSON.stringify({version:1,accounts:[...this.accounts.values()],catalog:[...this.catalog.values()]});this.serializedVersion=version;}
    const payload=this.serializedPayload;
    this.saving=fs.promises.writeFile(this.file+'.tmp',payload).then(()=>fs.promises.rename(this.file+'.tmp',this.file)).then(()=>{this.persistedVersion=Math.max(this.persistedVersion,version);}).catch(()=>{this.dirty=true;}).finally(()=>{this.saving=null;});
    return this.saving.then(()=>{if(this.flushRequested||this.dirty&&this.dirtyVersion!==version)return this.flush();});
  }
}
module.exports={HuntVisualStore,rewardFingerprint};
