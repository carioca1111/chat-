'use strict';
// Independent read-only observations. Never infer hunting income from wallet balances.
const fs = require('node:fs');
const MINUTE = 60000, RETENTION = 24 * 60 * MINUTE, GAP = 15000;
const number = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const label = v => String(v ?? '').slice(0,160);
class HuntVisualStore {
  constructor(file = '') {
    this.file=file; this.accounts=new Map(); this.slots=Array(4).fill(null); this.catalog=new Map(); this.dirty=false; this.saving=null;
    try {const data=JSON.parse(fs.readFileSync(file,'utf8')); if(data.version===1) {
      for(const a of (data.accounts||[]).slice(-16)) if(a.id) this.accounts.set(a.id,{...a,bins:(a.bins||[]).filter(b=>b.at>Date.now()-RETENTION).slice(-1440)});
      for(const h of (data.catalog||[]).slice(0,500)) this.catalog.set(h.id,h);
    }} catch {}
  }
  context(s) {return JSON.stringify([s.state.activeId,s.profile?.level,s.profile?.potencia,s.profile?.refinoTotal,s.state.loja?.boosts||null,s.state.kick||null]);}
  eligible(s) {return !!(s?.state.huntSlug && s.profile && !s.state.noCentro && !s.state.mistico && !s.state.boss?.arena);}
  bin(s,at) {
    const a=this.accounts.get(s.id),key=this.context(s),hunt=label(s.state.huntSlug),minute=Math.floor(at/MINUTE)*MINUTE;
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
      s={id,state:{},profile:null,pokes:new Map(),lastAt:at,started:at,huntSince:at,connected:true,seen:new Set()};this.slots[slot]=s;
      while(this.accounts.size>16){const removable=[...this.accounts.keys()].find(k=>!this.slots.some(x=>x?.id===k));if(!removable)break;this.accounts.delete(removable);}
    }
    if(!s||at<s.lastAt)return false;
    if(!s.connected&&p.t!=='welcome'&&!(p.t==='estado'&&e?.id!=null))return false;
    // Same callback replay at the same timestamp is ignored. Different timestamps are not guessed to be duplicates.
    const fingerprint=at+':'+require('node:crypto').createHash('sha256').update(JSON.stringify(p)).digest('hex');if(s.seen.has(fingerprint))return false;
    s.seen.add(fingerprint);if(s.seen.size>128)s.seen.delete(s.seen.values().next().value);
    const dt=at-s.lastAt,previousKey=this.context(s),previousHunt=s.state.huntSlug;
    if(e&&(p.t==='welcome'||p.t==='estado')) {
      for(const k of ['activeId','huntSlug','noCentro','mistico','boss','loja','kick'])if(Object.hasOwn(e,k))s.state[k]=e[k];
      for(const raw of (e.pokemons||e.pkMud||[]).slice(0,300))if(raw?.id!=null)s.pokes.set(label(raw.id),{...s.pokes.get(label(raw.id)),...raw});
      while(s.pokes.size>300)s.pokes.delete(s.pokes.keys().next().value);
      s.profile=s.pokes.get(label(s.state.activeId))||null;
      if(e.nick)this.accounts.get(s.id).name=label(e.nick);
      if(previousHunt!==s.state.huntSlug)s.huntSince=at;
    }
    if(p.t==='welcome'&&Array.isArray(p.hunts))for(const h of p.hunts.slice(0,500))if(h.slug!=null)this.catalog.set(label(h.slug),{id:label(h.slug),name:label(h.nome||h.slug),area:label(h.area)});
    const continuous=s.connected&&dt>0&&dt<=GAP&&previousKey===this.context(s)&&previousHunt===s.state.huntSlug&&this.eligible(s);
    if(continuous) {
      // Split time at minute boundaries; include only fully contained bins in selected windows.
      let cursor=s.lastAt;while(cursor<at){const end=Math.min(at,(Math.floor(cursor/MINUTE)+1)*MINUTE);this.bin(s,end-1).ms+=end-cursor;cursor=end;}
      if(p.t==='batalha')for(const ev of (p.ev||[]).slice(0,500))if(ev?.k==='morte'&&ev.quem==='selvagem') {
        const b=this.bin(s,at),xp=number(ev.xpTreinador),gold=number(ev.ouro);b.kills++;
        if(xp!==null&&xp>=0)b.xp+=xp;else b.xpKnown=false;
        if(gold!==null&&gold>=0)b.gold+=gold;else b.goldKnown=false;
      }
    }
    s.lastAt=at;s.connected=true;const a=this.accounts.get(s.id);a.lastAt=at;this.dirty=true;return true;
  }
  disconnect(slot) {const s=this.slots[slot];if(s){s.connected=false;s.profile=null;s.pokes.clear();s.state={};s.seen.clear();}return !!s;}
  summarize(bins) {
    const ms=bins.reduce((n,b)=>n+b.ms,0),kills=bins.reduce((n,b)=>n+b.kills,0),xpKnown=kills>0&&bins.every(b=>b.xpKnown),goldKnown=kills>0&&bins.every(b=>b.goldKnown);
    const xp=xpKnown?bins.reduce((n,b)=>n+b.xp,0):null,gold=goldKnown?bins.reduce((n,b)=>n+b.gold,0):null;
    return {ms,kills,samples:bins.filter(b=>b.ms>0).length,xp,gold,xpPerHour:ms>=MINUTE&&xp!==null?xp*3600000/ms:null,goldPerHour:ms>=MINUTE&&gold!==null?gold*3600000/ms:null};
  }
  view(now=Date.now()) {
    const end=Math.floor(now/MINUTE)*MINUTE;
    return {at:now,catalog:[...this.catalog.values()],accounts:this.slots.map((s,slot)=>{
      if(!s)return {slot,id:null,name:`Conta ${slot+1}`,connected:false,lastAt:null,windows:{}};
      const a=this.accounts.get(s.id),p=s.profile,online=s.connected&&now-s.lastAt<=GAP,key=this.context(s);
      const profile=p?{id:label(p.id),speciesId:number(p.speciesId),name:label(p.nome||p.apelido),nickname:label(p.apelido),level:number(p.level),types:Array.isArray(p.tipos)?p.tipos.slice(0,2):[],ivs:p.ivs||null,shiny:p.shiny===true,form:label(p.form)}:null;
      const windows={};for(const minutes of [15,60,180,360]) {
        const start=end-minutes*MINUTE,rows=a.bins.filter(b=>b.at>=start&&b.at<end&&b.key===key),groups=new Map();
        for(const b of rows){if(!groups.has(b.hunt))groups.set(b.hunt,[]);groups.get(b.hunt).push(b);}
        const hunts=[...groups].map(([id,bins])=>({id,name:this.catalog.get(id)?.name||id,...this.summarize(bins),lastAt:Math.max(...bins.map(b=>b.end))}));
        const current=rows.filter(b=>b.hunt===s.state.huntSlug&&b.session===s.started);
        const chart=current.slice(-60).map(b=>({at:b.at,...this.summarize([b])}));
        windows[minutes]={start,end,current:this.summarize(current),hunts,chart};
      }
      return {slot,id:s.id,name:a.name||`Conta ${slot+1}`,connected:online,lastAt:s.lastAt,profile,hunt:label(s.state.huntSlug),huntName:this.catalog.get(label(s.state.huntSlug))?.name||label(s.state.huntSlug),huntSince:s.huntSince,started:s.started,windows};
    })};
  }
  flush() {
    if(!this.file||!this.dirty)return this.saving||Promise.resolve();
    if(this.saving)return this.saving.then(()=>this.flush());
    this.dirty=false;const data=JSON.stringify({version:1,accounts:[...this.accounts.values()],catalog:[...this.catalog.values()]});
    this.saving=fs.promises.writeFile(this.file+'.tmp',data).then(()=>fs.promises.rename(this.file+'.tmp',this.file)).catch(()=>{this.dirty=true;}).finally(()=>{this.saving=null;});return this.saving;
  }
}
module.exports={HuntVisualStore};
