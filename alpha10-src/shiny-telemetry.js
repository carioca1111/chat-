'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const MINUTE=60000, HOUR=60*MINUTE, DAY=24*HOUR;
const known = n => typeof n==='number' && Number.isFinite(n);
const label = x => typeof x==='string'?x.slice(0,120):'';
const day = at => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
function probability(normal,lure){return -Math.expm1(normal*Math.log1p(-1/24000)+lure*Math.log1p(-1/12000));}
function optimizeBall({inventory,catalog,probabilities,priority='economy'}={}){
  if(!inventory||!catalog||!probabilities)return null;
  const options=catalog.filter(b=>inventory[b.id]>0&&known(probabilities[b.id])&&probabilities[b.id]>0&&known(b.priceGold)&&b.priceGold>0);
  options.sort((a,b)=>priority==='capture'?probabilities[b.id]-probabilities[a.id]:(a.priceGold/probabilities[a.id])-(b.priceGold/probabilities[b.id]));
  return options[0]?{id:options[0].id,name:options[0].nome,probability:probabilities[options[0].id],basis:priority==='capture'?'maior chance entre bolas em estoque':'menor custo por captura esperada (preço NPC)'}:null;
}
class ShinyTelemetry {
  constructor(file,{clock=Date.now,onShiny=()=>{}}={}){
    this.file=file;this.clock=clock;this.onShiny=onShiny;this.sessions=new Map();this.catalog=[];this.hunts=new Map();this.dirty=false;this.saving=null;this.error=null;this.lastLog=0;
    this.data={version:1,accounts:{},history:[],preferences:{sound:true,target:'',mode:'more'},diagnostics:{}};
    if(file&&fs.existsSync(file))try{const d=JSON.parse(fs.readFileSync(file,'utf8'));if(d.version!==1||!d.accounts||!Array.isArray(d.history))throw Error('Formato inválido');this.data=d;}catch(e){this.error='Histórico não pôde ser lido. Arquivo original preservado.';this.readOnly=true;this.log('TELEMETRY',e);}
  }
  log(scope,error){const now=this.clock();if(now-this.lastLog>MINUTE||!this.lastLog){console.warn('[SHINY:'+scope+']',String(error?.message||error).slice(0,180));this.lastLog=now;}}
  guard(fn){try{return fn();}catch(e){this.error='Dados temporariamente indisponíveis';this.log('TELEMETRY',e);return null;}}
  disconnect(slot){const s=this.sessions.get(Number(slot));if(s){s.socketAt=0;s.lastAt=0;}this.cached=null;}
  // Called ONCE per received WebSocket frame, before the market focus filter/redaction.
  // Raw packets are never retained or logged. Only the allowlisted projection below is stored.
  frame(slot,packet,at=this.clock()) {return this.guard(()=>this.ingest(Number(slot),packet,at));}
  ingest(slot,p,at){
    if(!Number.isInteger(slot)||slot<0||slot>127||!p||!['welcome','estado','batalha','campo','campo.init'].includes(p.t))return;
    let s=this.sessions.get(slot);
    if(p.t==='welcome'||(p.t==='estado'&&p.estado?.cheio)){
      const e=p.estado;if(e?.id==null||!e.nick)return;
      s={slot,id:String(e.id),name:label(e.nick),state:{},mobs:new Map(),bins:[],lastAt:at,started:at,socketAt:at,farmMs:0};this.sessions.set(slot,s);
      this.data.accounts[s.id]??={id:s.id,name:s.name,started:at,days:{},hunts:{},attempts:0,captured:0,seen:0,escaped:0,lastShiny:null,sinceShiny:null,normal:0,lure:0,unknown:0};
      if(p.t==='welcome'){
        if(Array.isArray(p.catalogoBolas))this.catalog=p.catalogoBolas.slice(0,32).map(b=>({id:b.id,nome:label(b.nome),catchRate:known(b.catchRate)?b.catchRate:null,priceGold:known(b.priceGold)?b.priceGold:null}));
        if(Array.isArray(p.hunts))this.hunts=new Map(p.hunts.slice(0,3000).map(h=>[String(h.slug),{slug:String(h.slug),nome:label(h.nome),area:label(h.area),especies:Array.isArray(h.especies)?h.especies.slice(0,100).map(e=>({pokeId:e.pokeId,nome:label(e.nome)})):[]} ]));
      }
    }
    if(!s)return;const a=this.data.accounts[s.id];s.socketAt=at;
    const dt=at-s.lastAt;
    if(dt>0&&dt<=15000&&this.inHunt(s)){s.farmMs+=dt;this.bin(s,at).ms+=dt;const g=this.group(s);if(g)g.ms+=dt;}
    s.lastAt=at;
    if(p.t==='welcome'||p.t==='estado'){
      const e=p.estado||{},previous=s.state.huntSlug;
      for(const k of ['huntSlug','noCentro','activeId','servidorAgora','mistico'])if(Object.hasOwn(e,k))s.state[k]=e[k];
      if(Object.hasOwn(e,'boss'))s.state.bossArena=!!e.boss?.arena;
      if(known(e.servidorAgora))s.serverOffset=at-e.servidorAgora;
      if(Object.hasOwn(e,'balls'))s.state.balls=e.balls&&typeof e.balls==='object'?Object.fromEntries(Object.entries(e.balls).filter(([k,v])=>/^\d+$/.test(k)&&known(v)&&v>=0)):null;
      if(Object.hasOwn(e,'loja'))s.state.boosts=e.loja?.boosts&&typeof e.loja.boosts==='object'?{shiny:e.loja.boosts.shiny??0,captura:e.loja.boosts.captura??0}:null;
      if(Object.hasOwn(e,'kick'))s.state.kick=e.kick?{shiny:e.kick.bonus?.shiny??0,captura:e.kick.bonus?.captura??0}:null;
      const pokes=Array.isArray(e.pokemons)?e.pokemons:Array.isArray(e.pkMud)?e.pkMud:[];const active=pokes.find(x=>String(x.id)===String(s.state.activeId));
      if(active)s.profile=[active.id,active.level,active.potencia,active.ivTotal,active.refinoTotal].join(':');
      else if(Object.hasOwn(e,'activeId')&&String(s.activeId)!==String(e.activeId))s.profile=null;
      s.activeId=s.state.activeId;
      if(previous!==s.state.huntSlug)s.mobs.clear();
      a.name=s.name;this.dirty=true;return;
    }
    if(p.t==='campo'||p.t==='campo.init'){
      if(p.t==='campo.init')s.mobs.clear();
      for(const m of Array.isArray(p.mobs)?p.mobs:[]){if(m.s==null)continue;const prev=s.mobs.get(m.s)||{};const mob={...prev};if(m.n!==undefined)mob.name=label(m.n);if(m.x!==undefined)mob.dead=!!m.x;if(m.tr!==undefined)mob.trainer=!!m.tr;if(m.xr!==undefined)mob.expires=at+Number(m.xr);s.mobs.set(m.s,mob);if(mob.dead&&!prev.dead&&!mob.trainer&&known(m.xr)&&m.xr>0)this.metric(s,at,'bodies');}
      for(const id of p.fora||[])s.mobs.delete(id);if(s.mobs.size>256)s.mobs.clear();return;
    }
    if(!Array.isArray(p.ev))return;
    for(let i=0;i<p.ev.length;i++){
      const e=p.ev[i];if(!e||typeof e!=='object')continue;
      if(e.k==='morte'&&e.quem==='selvagem'){this.metric(s,at,'kills');continue;}
      if(e.k!=='bola')continue;
      const mob=s.mobs.get(e.slot),name=mob?.name||'';
      const next=p.ev[i+1];const outcome=e.sucesso===true&&next?.k==='capturado'&&next.pokemon&&(!name||next.pokemon.nome===name)?next.pokemon:e.sucesso===false&&next?.k==='fugiu'&&(!name||next.nome===name)?next:null;
      const pokemonName=name||label(outcome?.nome)||'Espécie não informada';
      this.metric(s,at,'attempts',pokemonName);a.attempts++;if(typeof e.sucesso!=='boolean')this.data.diagnostics.missingOutcome=(this.data.diagnostics.missingOutcome||0)+1;if(pokemonName==='Espécie não informada')this.data.diagnostics.missingSpecies=(this.data.diagnostics.missingSpecies||0)+1;if(a.sinceShiny!==null)a.sinceShiny++;
      const d=a.days[day(at)]??={attempts:0,captured:0,seen:0,escaped:0};d.attempts++;
      const boosts=this.boosts(s,at),h=this.hunts.get(String(s.state.huntSlug)),eligible=h&&h.area!=='outland'&&this.inHunt(s);
      if(eligible&&boosts.secretLure!==null)a[boosts.secretLure?'lure':'normal']++;else a.unknown++;
      if(e.shiny===true){
        const captured=typeof e.sucesso==='boolean'?e.sucesso:null;
        const event={id:randomUUID(),timestamp:at,accountId:s.id,accountName:s.name,pokemonName,pokemonId:outcome?.speciesId??null,huntId:this.inHunt(s)?s.state.huntSlug:null,huntName:this.inHunt(s)?h?.nome||s.state.huntSlug:null,ball:this.catalog.find(b=>String(b.id)===String(e.ballId))?.nome||(e.ballId!=null?'Bola '+e.ballId:null),ballId:e.ballId??null,captured,secretLure:boosts.secretLure,captureBoost:boosts.captureBoost,kickShiny:boosts.kickShiny,kickCapture:boosts.kickCapture,source:'batalha.ev.bola',slot};
        a.seen++;d.seen++;if(captured===true){a.captured++;d.captured++;}if(captured===false){a.escaped++;d.escaped++;}a.lastShiny=at;a.sinceShiny=0;
        this.data.history.push(event);if(this.data.history.length>20000)this.data.history.splice(0,this.data.history.length-20000);
        this.cached=null;this.dirty=true;void this.save();try{this.onShiny(event);}catch(err){this.log('CAPTURE',err);}
      }
      if(known(e.ballId)&&s.state.balls&&known(s.state.balls[e.ballId]))s.state.balls[e.ballId]=Math.max(0,s.state.balls[e.ballId]-1);
    }
    for(const key of Object.keys(a.days))if(key<day(at-31*DAY))delete a.days[key];this.dirty=true;
  }
  boosts(s,at){const now=s.serverOffset==null?null:at-s.serverOffset,flag=(obj,key)=>now===null||!obj||!known(obj[key])?null:obj[key]>now,remaining=(obj,key)=>now===null||!obj||!known(obj[key])?null:Math.max(0,obj[key]-now);return {secretLure:flag(s.state.boosts,'shiny'),captureBoost:flag(s.state.boosts,'captura'),kickShiny:flag(s.state.kick,'shiny'),kickCapture:flag(s.state.kick,'captura'),lureMs:remaining(s.state.boosts,'shiny'),captureMs:remaining(s.state.boosts,'captura')};}
  bin(s,at){const key=Math.floor(at/10000)*10000;let b=s.bins[s.bins.length-1];if(!b||b.at!==key){b={at:key,ms:0,attempts:0,kills:0,bodies:0};s.bins.push(b);if(s.bins.length>361)s.bins.splice(0,s.bins.length-361);}return b;}
  inHunt(s){return !!s.state.huntSlug&&!s.state.noCentro&&!s.state.bossArena&&!s.state.mistico;}
  group(s){if(!this.inHunt(s)||!s.profile)return null;const a=this.data.accounts[s.id],boosts=this.boosts(s,s.lastAt),context=[s.profile,boosts.secretLure,boosts.captureBoost,boosts.kickShiny,boosts.kickCapture].join('|'),key=s.state.huntSlug+'|'+context;let g=a.hunts[key];if(!g){if(Object.keys(a.hunts).length>=250)delete a.hunts[Object.keys(a.hunts)[0]];g=a.hunts[key]={hunt:s.state.huntSlug,context,ms:0,attempts:0,kills:0,bodies:0,species:{},at:s.lastAt};}g.at=s.lastAt;return g;}
  metric(s,at,key,name){if(this.inHunt(s))this.bin(s,at)[key]++;const g=this.group(s);if(g){g[key]++;if(name&&Object.keys(g.species).length<300)g.species[name]=(g.species[name]||0)+1;}}
  configure(p){if(!p||typeof p!=='object')throw Error('Configuração inválida');if(p.mode&&!['more','target'].includes(p.mode))throw Error('Modo ainda não validado');if(p.target!==undefined)this.data.preferences.target=label(p.target).trim();if(p.mode)this.data.preferences.mode=p.mode;if(typeof p.sound==='boolean')this.data.preferences.sound=p.sound;this.cached=null;this.dirty=true;void this.save();return {...this.data.preferences};}
  accountView(s,now){
    const a=this.data.accounts[s.id],online=now-s.socketAt<20000,boosts=this.boosts(s,now),g=this.group(s),h=this.hunts.get(String(s.state.huntSlug)),rows=s.bins.filter(b=>b.at>=now-15*MINUTE),ms=rows.reduce((n,b)=>n+b.ms,0),attempts=rows.reduce((n,b)=>n+b.attempts,0),rate=online&&ms>=MINUTE?attempts*HOUR/ms:null;
    const windows=Object.fromEntries([5,15,60].map(m=>{const bs=s.bins.filter(b=>b.at>=now-m*MINUTE),ms=bs.reduce((n,b)=>n+b.ms,0);return [m,{observedMs:ms,attempts:bs.reduce((n,b)=>n+b.attempts,0),rate:online&&ms>=MINUTE?bs.reduce((n,b)=>n+b.attempts,0)*HOUR/ms:null}];}));
    const target=this.data.preferences.mode==='target'?this.data.preferences.target:'';
    const rankings=Object.values(a.hunts).filter(x=>x.context===g?.context&&x.ms>=5*MINUTE&&x.at>now-7*DAY&&x.attempts>=20&&this.hunts.get(String(x.hunt))?.area!=='outland').map(x=>({hunt:x.hunt,name:this.hunts.get(String(x.hunt))?.nome||x.hunt,attempts:x.attempts,observedMs:x.ms,rate:(target?(x.species[target]||0):x.attempts)*HOUR/x.ms,killsRate:x.kills*HOUR/x.ms,bodiesRate:x.bodies*HOUR/x.ms})).sort((x,y)=>y.rate-x.rate);
    const current=rankings.find(x=>x.hunt===s.state.huntSlug),best=rankings[0],stock=s.state.balls?Object.values(s.state.balls).reduce((n,v)=>n+v,0):null;
    const efficiency=online&&rankings.length>=2&&current&&best?.rate>0&&stock!==null&&rate!==null?Math.round(100*(.8*Math.min(1,current.rate/best.rate)+.2*(rate>0?Math.min(1,stock/(rate*.5)):0))):null;
    let status=!online?'Dados temporariamente indisponíveis':!s.state.huntSlug?'Escolha uma hunt':h?.area==='outland'?'Hunt sem roll shiny':stock===0?'SEM BOLAS':stock!==null&&stock<30?'POUCAS BOLAS':boosts.lureMs>0&&boosts.lureMs<15*MINUTE?'Lure termina em breve':efficiency!==null&&efficiency<70?'HUNT ABAIXO DA MELHOR':rate===null?'CALIBRANDO…':'Monitorando';
    const today=a.days[day(now)]||{attempts:0,seen:0,captured:0,escaped:0};
    return {id:s.id,slot:s.slot,name:s.name,online,status,efficiency,rate,windows,today,attempts:a.attempts,sinceShiny:a.sinceShiny,lastShiny:a.lastShiny,seen:a.seen,captured:a.captured,escaped:a.escaped,hunt:h?.nome||s.state.huntSlug||null,stock,inventory:s.state.balls||null,boosts,rankings,best:best||null,improvement:current?.rate>0&&best?100*(best.rate/current.rate-1):null,farmMs:s.farmMs,probability:a.normal+a.lure>0?probability(a.normal,a.lure):null,probabilityAttempts:a.normal+a.lure,unknownAttempts:a.unknown,observedSince:a.started,species:[...new Set(Object.values(a.hunts).flatMap(x=>Object.keys(x.species)))].sort(),recent:this.data.history.filter(e=>e.accountId===s.id).slice(-6).reverse()};
  }
  view(){if(this.cached&&this.clock()-this.cached.at<1000)return this.cached;return this.cached=this.guard(()=>{const now=this.clock();return {at:now,accounts:[...this.sessions.values()].map(s=>this.accountView(s,now)),preferences:{...this.data.preferences},catalog:this.catalog,error:this.error,diagnostics:{...this.data.diagnostics},historyCount:this.data.history.length,historyRevision:this.data.history.at(-1)?.id||''};})||{error:'Dados temporariamente indisponíveis',accounts:[]};}
  history(filters={}){const days=[1,7,30].includes(Number(filters.days))?Number(filters.days):30,now=this.clock(),start=days===1?null:now-days*DAY,all=this.data.history.filter(e=>(start===null?day(e.timestamp)===day(now):e.timestamp>=start)&&(!filters.account||e.accountId===String(filters.account))&&(!filters.species||e.pokemonName.toLocaleLowerCase().includes(String(filters.species).toLocaleLowerCase()))&&(!filters.result||(filters.result==='captured'?e.captured===true:filters.result==='escaped'?e.captured===false:true))).reverse(),offset=Math.max(0,Math.floor(Number(filters.offset)||0));return {total:all.length,rows:all.slice(offset,offset+50),accounts:Object.values(this.data.accounts).map(a=>({id:a.id,name:a.name}))};}
  async save(){if(!this.file||this.readOnly||!this.dirty)return;if(this.saving)return this.saving;this.dirty=false;const payload=JSON.stringify(this.data);this.saving=(async()=>{try{await fs.promises.mkdir(path.dirname(this.file),{recursive:true});await fs.promises.writeFile(this.file+'.tmp',payload);await fs.promises.rename(this.file+'.tmp',this.file);this.error=null;}catch(e){this.error='Falha ao salvar histórico no disco';this.dirty=true;this.log('TELEMETRY',e);}finally{this.saving=null;}})();return this.saving;}
  async close(){await this.saving;await this.save();}
}
module.exports={ShinyTelemetry,probability,optimizeBall};
