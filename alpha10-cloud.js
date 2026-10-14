'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s);
function patch(name,from,to,label){let s=read(name);if(!s.includes(from))throw new Error('Alpha 10.4 cloud anchor missing: '+label);write(name,s.replace(from,to));}

const pkgPath=path.join(root,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
if(pkg.version!=='3.0.0-alpha.10.3')throw new Error('Alpha 10.4 cloud expects Alpha 10.3, got '+pkg.version);

// Preserve a positive/negative shiny capability signal from the game catalog. Unknown fields
// default to allowed, while known no-shiny areas are still gated below.
patch('shiny-telemetry.js',
"{slug: String(h.slug), nome: label(h.nome), area: label(h.area), especies: Array.isArray(h.especies) ? h.especies.slice(0, 100).map(e => ({pokeId: e.pokeId, nome: label(e.nome)})) : []}",
"{slug: String(h.slug), nome: label(h.nome), area: label(h.area), shinyAllowed: ![h.shiny, h.shinyEnabled, h.permiteShiny, h.shinyPossible].some(v => v === false), especies: Array.isArray(h.especies) ? h.especies.slice(0, 100).map(e => ({pokeId: e.pokeId, nome: label(e.nome)})) : []}",
'hunt shiny capability');

const cloudMethods=`  eligibility(s) {
    const h = this.hunts.get(String(s.state.huntSlug));
    if (!this.inHunt(s)) return {eligible: false, reason: 'Fora de uma Hunt elegível'};
    if (!h) return {eligible: false, reason: 'Hunt ainda não confirmada pelo catálogo'};
    const area = String(h.area || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim().toLowerCase();
    if (h.shinyAllowed === false || area === 'outland') return {eligible: false, reason: 'Área sem roll shiny'};
    return {eligible: true, reason: 'Roll shiny disponível'};
  }

  cloudInput() {
    const now = this.clock();
    return {
      version: 1, at: now, preferences: {...this.data.preferences}, catalog: this.catalog.slice(0, 40),
      diagnostics: {...this.data.diagnostics}, historyCount: this.data.history.length,
      historyRevision: this.data.history.at(-1)?.id || '',
      accounts: [...this.sessions.values()].slice(0, 4).map(s => {
        const a = this.data.accounts[s.id] || {}, h = this.hunts.get(String(s.state.huntSlug)), boosts = this.boosts(s, now);
        const eligibility = this.eligibility(s), online = now - s.socketAt < 20_000;
        const context = [s.profile, boosts.secretLure, boosts.captureBoost, boosts.kickShiny, boosts.kickCapture].join('|');
        const today = a.days?.[day(now)] || {attempts: 0, seen: 0, captured: 0, escaped: 0};
        return {
          id: s.id, slot: s.slot, name: s.name, online, inHunt: this.inHunt(s), eligibility, context,
          hunt: {slug: s.state.huntSlug || '', name: h?.nome || s.state.huntSlug || '', area: h?.area || ''},
          inventory: s.state.balls ? {...s.state.balls} : null, boosts, farmMs: s.farmMs,
          totals: {attempts: a.attempts || 0, sinceShiny: a.sinceShiny, lastShiny: a.lastShiny, seen: a.seen || 0, captured: a.captured || 0, escaped: a.escaped || 0, normal: a.normal || 0, lure: a.lure || 0, unknown: a.unknown || 0, started: a.started || s.started || now},
          today: {...today},
          bins: s.bins.slice(-361).map(b => ({at:b.at,ms:b.ms,attempts:b.attempts,kills:b.kills,bodies:b.bodies})),
          huntGroups: Object.values(a.hunts || {}).slice(-80).map(g => ({hunt:g.hunt,name:this.hunts.get(String(g.hunt))?.nome||g.hunt,context:g.context,ms:g.ms,attempts:g.attempts,kills:g.kills,bodies:g.bodies,species:g.species,at:g.at})),
          species: [...s.species].slice(0, 500), recent: s.recent.slice(0, 6)
        };
      })
    };
  }

  visualView(message = 'Cálculos remotos indisponíveis') {
    const input = this.cloudInput();
    return {
      version: 1, at: input.at, cloud: {computed:false,engine:'visual-only'}, preferences: input.preferences,
      catalog: input.catalog, error: message, diagnostics: input.diagnostics,
      historyCount: input.historyCount, historyRevision: input.historyRevision,
      accounts: input.accounts.map(x => {
        const stock=x.inventory?Object.values(x.inventory).reduce((n,v)=>n+(Number(v)||0),0):null,t=x.totals||{};
        return {id:x.id,slot:x.slot,name:x.name,online:x.online,status:x.eligibility?.eligible===false?'Cálculo pausado · '+x.eligibility.reason:x.online?'Aguardando cálculo remoto':'Offline',calculationEnabled:false,calculationReason:x.eligibility?.reason||message,remoteComputed:false,sharedGroup:null,efficiency:null,rate:null,individualRate:null,windows:{5:{rate:null},15:{rate:null},60:{rate:null}},today:x.today,attempts:t.attempts||0,sinceShiny:t.sinceShiny,lastShiny:t.lastShiny,seen:t.seen||0,captured:t.captured||0,escaped:t.escaped||0,hunt:x.hunt?.name||null,huntSlug:x.hunt?.slug||'',area:x.hunt?.area||'',stock,inventory:x.inventory,boosts:x.boosts,rankings:[],best:null,improvement:null,farmMs:x.farmMs,probability:null,probabilityAttempts:0,unknownAttempts:t.unknown||0,observedSince:t.started||0,measurementQuality:null,stability:null,trendPct:null,ballRunwayMs:null,chanceHour:null,eta50Ms:null,species:x.species,recent:x.recent};
      })
    };
  }

`;
patch('shiny-telemetry.js','  accountView(s, now) {',cloudMethods+'  accountView(s, now) {','cloud input methods');

// The desktop no longer executes ShinyTelemetry.view() for the panel. It only projects cheap
// counters and lets the authenticated Render relay calculate rates, probability, ETA, quality,
// rankings and same-Hunt aggregation. On relay failure it stays visual-only instead of falling
// back to heavy local calculations.
patch('main.js',
"handler('grid:shiny-state',()=>shinyTelemetry?.view()||{accounts:[],error:'Dados temporariamente indisponíveis'});",
`let shinyCloudCache=null,shinyCloudCacheAt=0,shinyCloudPending=null;
  async function shinyCloudView(){
    if(!shinyTelemetry)return {accounts:[],error:'Dados temporariamente indisponíveis'};
    const now=Date.now();
    if(shinyCloudCache&&now-shinyCloudCacheAt<4500)return shinyCloudCache;
    if(shinyCloudPending)return shinyCloudPending;
    if(!settings.remote?.endpoint||!settings.remote?.token)return shinyTelemetry.visualView('Cálculo remoto aguardando configuração do Relay');
    const input=shinyTelemetry.cloudInput();
    shinyCloudPending=remoteSync.request(settings.remote,'/api/v1/shiny/compute',{method:'POST',body:input,timeoutMs:3500})
      .then(result=>{shinyCloudCache=result;shinyCloudCacheAt=Date.now();return result;})
      .catch(error=>shinyTelemetry.visualView('Cálculo remoto indisponível · '+String(error?.message||error).slice(0,120)))
      .finally(()=>{shinyCloudPending=null;});
    return shinyCloudPending;
  }
  handler('grid:shiny-state',()=>shinyCloudView());`,
'cloud state handler');

patch('shiny-ui.js',
"    if (!a.online) return 'A conta está sem telemetria ao vivo. O histórico foi preservado e voltará a atualizar após reconectar.';",
"    if (!a.online) return 'A conta está sem telemetria ao vivo. O histórico foi preservado e voltará a atualizar após reconectar.';\n    if (a.calculationEnabled === false) return 'Cálculo pausado: ' + (a.calculationReason || 'esta área não está elegível para roll shiny') + '. O Gridium continua apenas observando a conta.';",
'paused recommendation');
patch('shiny-ui.js',
"    setText('shScoreNote', a?.efficiency == null ? 'CALIBRANDO…' : '/ 100');",
"    setText('shScoreNote', data?.cloud?.computed ? (a?.efficiency == null ? '☁ REMOTO' : '/ 100 · ☁ REMOTO') : 'PAINEL VISUAL');",
'cloud score badge');
patch('shiny-ui.js',
"      ['Tentativas/h · 15 min', number(a?.rate)],\n      ['Tentativas hoje', number(a?.today?.attempts)],\n      ['Desde último shiny', number(a?.sinceShiny)],\n      ['Hunt atual', a?.hunt || '—']",
"      ['Cálculo', data?.cloud?.computed ? '☁ Render' : 'Somente visual'],\n      ['Contas nesta Hunt', a?.sharedGroup?.participants > 1 ? a.sharedGroup.participants + ' contas juntas' : a?.calculationEnabled ? '1 conta' : 'Pausado'],\n      ['Ritmo combinado', a?.sharedGroup?.participants > 1 ? number(a.sharedGroup.rate) + ' tentativas/h' : number(a?.rate) + ' tentativas/h'],\n      ['Tentativas/h · conta', number(a?.rate)],\n      ['Tentativas hoje', number(a?.today?.attempts)],\n      ['Desde último shiny', number(a?.sinceShiny)],\n      ['Hunt atual', a?.hunt || '—']",
'cloud farm facts');
patch('shiny-ui.js',
"refreshTimer = setInterval(() => { if (active) void refresh(); }, 3000);",
"refreshTimer = setInterval(() => { if (active) void refresh(); }, 5000);",
'cloud polling interval');

pkg.version='3.0.0-alpha.10.4';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
console.log('Gridium Alpha 10.4: Shiny panel visual + Render compute + same-Hunt pooling + no-shiny gating');
