'use strict';
const {app,BrowserWindow,shell,ipcMain,powerSaveBlocker,session,dialog,Notification}=require('electron');
const {Worker}=require('worker_threads');
const {fork}=require('child_process');
const path=require('path');
const Professional=require('./alpha-professional');
const fs=require('fs');
const nodeProcess=require('process');
const {Stats,FIELDS}=require('./stats');
const {SAMPLE_SCRIPT}=require('./collector');
const {RemoteSync}=require('./remote-sync');
const {forecastRow}=require('./forecast');
const {ServerWatch}=require('./server-watch');
const {AlphaEngine}=require('./alpha-engine');
const {HuntEngine,HUNT_DISCOVERY_SCRIPT}=require('./hunt-engine');
const {HuntIntelligence}=require('./hunt-intelligence');
const {MARKET_DISCOVERY_SCRIPT,normalizeListings}=require('./market-inspector');
const {NetworkInspector}=require('./network-inspector');
const {analyzeProtocolEvents,mergeValidation,crossMarketPairs}=require('./market-protocol');
const {validateMarketCommand,buildBuyCommand,buildCreateCommand,buildEditCommand,buildCancelCommand,MARKET_BRIDGE_SOURCE,findMarketOutcome}=require('./market-live');
const {pathToFileURL}=require('url');
if(typeof app.setName==='function')app.setName('Gridium');
function prepareGridiumUserData(){
  try{
    const appData=app.getPath('appData'),target=path.join(appData,'Gridium');
    if(!fs.existsSync(target)){
      const legacy=['pokeidle-grid','PokéIdle Grid','PokeIdle Grid'].map(x=>path.join(appData,x)).find(x=>fs.existsSync(x)&&fs.statSync(x).isDirectory());
      if(legacy)fs.cpSync(legacy,target,{recursive:true,errorOnExist:false,force:false});
    }
    fs.mkdirSync(target,{recursive:true});if(typeof app.setPath==='function')app.setPath('userData',target);
  }catch{}
}
prepareGridiumUserData();
let win,stats,powerId=null,timer,savingTimer,historySavingTimer,autoTradingTimer,autoInspectionTimer,autoNavigatorTimer,listingRecoveryTimer,lastPollAt=0,historyDirty=false;
const PERFORMANCE_PROFILES=new Set(['ultra','balanced','quality']);
let performanceView={section:'games',layout:'grid',focusedSlot:0,visibleSlots:[0,1,2,3]};
const lastSampleAt=Array(4).fill(0),protocolCursorAt=Array(4).fill(0),performanceCssKeys=new Map();
const emptyGoals=()=>({capturas:0,shinies:0,xpTreinador:0,gold:0,hours:0});
const goalSet=()=>({all:emptyGoals(),0:emptyGoals(),1:emptyGoals(),2:emptyGoals(),3:emptyGoals()});
const emptyStock=()=>({initial:{bolas:null,pocoes:null,revives:null},usedAt:{bolas:0,pocoes:0,revives:0},setAt:0});
const stockSet=()=>Array.from({length:4},()=>emptyStock());
const DEFAULT_REMOTE_ENDPOINT='https://pokegrid-relay-209e4eb1d9.onrender.com';
let settings={power:'system',background:true,mute:false,performanceProfile:'balanced',liveEcoMode:false,zoom:[1,1,1,1],autoReconnect:true,alerts:{desktop:true,shiny:true,inactivity:true,connection:false,idleMinutes:5},goals:goalSet(),stocks:stockSet(),remote:{enabled:false,endpoint:DEFAULT_REMOTE_ENDPOINT,token:''}};
const guests=new Map(),busy=new Set(),idleNotified=new Set(),goalNotified=new Set();
const remoteSync=new RemoteSync();
const serverWatch=new ServerWatch();
const huntEngine=new HuntEngine();
let huntIntelligence=null;
function huntView(){const base=huntEngine.view();return huntIntelligence?huntIntelligence.view(base):base;}
function observeHuntIntelligence(slot,protocol={}){if(!huntIntelligence)return;let record=null;try{record=stats?.view()?.rows?.[Number(slot)]?.record||null;}catch{}huntIntelligence.observe(Number(slot),{account:protocol.account||{},telemetry:protocol.hunt||{},record});}
const networkInspector=new NetworkInspector();
const ALPHA5_VALIDATION={marketProtocolMapped:true,marketSearchMapped:true,marketListingsMapped:true,buyRequestMapped:true,liveBuyValidated:true,sellRequestMapped:true,createListingValidated:true,cancelRequestMapped:true,cancelValidated:true,liveSellValidated:true,autoRepricingValidated:true,stateProtocolMapped:true,ownListingsMapped:true};
let latestMarketProtocol={at:0,validation:{...ALPHA5_VALIDATION},accounts:[],crossMarket:[],listings:[]};
let alphaEngine=null,autoTradingBusy=false,autoInspectorBusy=false,autoNavigatorBusy=false,autoNavCursor=0,autoOrderFailures=0;
let alphaAnalysisWorker=null,alphaAnalysisSeq=0;const alphaAnalysisPending=new Map();let alphaAnalysisLastError=null;
let alphaCoreProcess=null,alphaCoreSeq=0;const alphaCorePending=new Map();let alphaCoreLastError=null,alphaCoreLastAt=0;
let autoInspectorStatus={enabled:true,running:false,lastAt:0,lastDomAt:0,lastError:null,accounts:0,listings:0,crossMarket:0,domListings:0,marketVisible:0};
let autoTraderStatus={running:false,lastAt:0,mode:'paper',live:false,kill:true,observed:0,fresh:0,eligible:0,riskApproved:0,lastReason:'Aguardando configuração',lastAction:'',lastListing:null,lastError:null};
let autopilotStatus={enabled:false,state:'stopped',lastAt:0,slot:null,route:'',lastAction:'Parado',accountsReady:0,pagesVisited:0,listingsSeen:0,failures:0,lastError:null,bankrolls:[]};
const autoNavState=Array.from({length:4},()=>({cursor:0,lastAt:0,lastAction:'',marketVisible:false,errors:0,pages:0}));
let autoDomCursor=0,passiveProbeCursor=0,marketFocusSlot=null,marketActiveSlots=[],marketFocusSince=0,marketRotationCursor=0;
let priorityRouteQueue=[],priorityRouteActive=null;
const MARKET_FOCUS_ROTATE_MS=60000,PRIORITY_ROUTE_TTL_MS=18000;
const marketBridgeHealth=Array.from({length:4},()=>({installed:false,socketReady:false,lastInstallAt:0,lastProbeAt:0,lastProbeOk:false,lastProbeError:null,lastMarketRxAt:0,lastMarketTxAt:0,learned:1,templateCursor:0,detailCursor:0,detailAttempts:0,lastDetailAsset:'',lastDetailCategory:'',lastDetailType:'',sourceHintAt:0,sourceHints:null,clientCursor:0,clientAttempts:0,lastClientCommand:'',lastClientAsset:''}));
const marketReadTemplates=Array.from({length:4},()=>new Map([[JSON.stringify({t:'market.itens',elemento:'',categoria:''}),{t:'market.itens',elemento:'',categoria:''}],[JSON.stringify({t:'market.itens',elemento:'',categoria:'stone'}),{t:'market.itens',elemento:'',categoria:'stone'}],[JSON.stringify({t:'market.especies',pagina:1}),{t:'market.especies',pagina:1}]]));
const marketCatalog=Array.from({length:4},()=>({categories:new Set(['','stone']),itemIds:new Set(),speciesIds:new Set(),categoryCursor:0,itemCursor:0,speciesCursor:0,speciesPage:1,probeCursor:0,lastDomAt:0}));
const liveOrderTimes=new Map(),autoConsumedListings=new Map(),lastAutoReprice=new Map(),reconciledSales=new Set();
const reconnect=new Map();
const file=()=>path.join(app.getPath('userData'),'grid-statistics.json');
const historyFile=()=>path.join(app.getPath('userData'),'grid-history.json');
const shellURL=pathToFileURL(path.join(__dirname,'index.html')).href;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
function cleanGoals(input){const out=goalSet();for(const scope of ['all','0','1','2','3'])for(const k of Object.keys(out[scope]))out[scope][k]=clamp(input?.[scope]?.[k],0,1e15);return out;}
function cleanStocks(input){return Array.from({length:4},(_,i)=>{const src=Array.isArray(input)?input[i]:null,out=emptyStock();for(const k of ['bolas','pocoes','revives']){const a=Number(src?.initial?.[k]);out.initial[k]=Number.isFinite(a)&&a>=0?a:null;const u=Number(src?.usedAt?.[k]);out.usedAt[k]=Number.isFinite(u)&&u>=0?u:0;}out.setAt=Number(src?.setAt)||0;return out;});}
function loadSettings(saved={}){
  if(['off','system','display'].includes(saved.power))settings.power=saved.power;
  for(const k of ['background','mute','autoReconnect','liveEcoMode'])if(typeof saved[k]==='boolean')settings[k]=saved[k];
  if(PERFORMANCE_PROFILES.has(String(saved.performanceProfile)))settings.performanceProfile=String(saved.performanceProfile);
  if(Array.isArray(saved.zoom))settings.zoom=Array.from({length:4},(_,i)=>clamp(saved.zoom[i]??1,.5,1.5)||1);
  if(saved.alerts&&typeof saved.alerts==='object'){
    for(const k of ['desktop','shiny','inactivity','connection'])if(typeof saved.alerts[k]==='boolean')settings.alerts[k]=saved.alerts[k];
    settings.alerts.idleMinutes=clamp(saved.alerts.idleMinutes||5,1,120)||5;
  }
  settings.goals=cleanGoals(saved.goals);
  settings.stocks=cleanStocks(saved.stocks);
  if(saved.remote&&typeof saved.remote==='object'){
    settings.remote.enabled=saved.remote.enabled===true;
    settings.remote.endpoint=typeof saved.remote.endpoint==='string'&&saved.remote.endpoint.trim()?saved.remote.endpoint.slice(0,500):DEFAULT_REMOTE_ENDPOINT;
    settings.remote.token=typeof saved.remote.token==='string'?saved.remote.token.slice(0,500):'';
  }
  if(!settings.remote.endpoint)settings.remote.endpoint=DEFAULT_REMOTE_ENDPOINT;
}
function publicSettings(){return {power:settings.power,background:settings.background,mute:settings.mute,performanceProfile:settings.performanceProfile,liveEcoMode:settings.liveEcoMode,autoReconnect:settings.autoReconnect,zoom:[...settings.zoom],alerts:{...settings.alerts},goals:cleanGoals(settings.goals),stocks:cleanStocks(settings.stocks),remote:{enabled:settings.remote.enabled,endpoint:settings.remote.endpoint,tokenConfigured:!!settings.remote.token}};}
function save(){
  try{const target=file(),payload=stats.save();delete payload.history;fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target+'.tmp',JSON.stringify({settings,...payload}));fs.renameSync(target+'.tmp',target);return true;}
  catch{return false;}
}
function saveHistory(){
  try{const target=historyFile();fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target+'.tmp',JSON.stringify({version:1,history:stats.history}));fs.renameSync(target+'.tmp',target);historyDirty=false;return true;}
  catch{return false;}
}
let saveError=false,historySaveError=false;
function persist(){saveError=!save();}
function persistHistory(force=false){if(!historyDirty&&!force)return;historySaveError=!saveHistory();}
function snapshot(){const now=Date.now(),view=stats.view(),marketView={at:latestMarketProtocol.at,validation:latestMarketProtocol.validation,accounts:latestMarketProtocol.accounts,crossMarket:latestMarketProtocol.crossMarket},activeSlots=[...marketActiveSlots],concurrency=configuredMarketConcurrency();return {...view,forecasts:view.rows.map((r,i)=>forecastRow(r,settings.stocks[i],now)),settings:publicSettings(),saveError:saveError||historySaveError,powerActive:powerId!==null&&powerSaveBlocker.isStarted(powerId),remote:remoteSync.status(settings.remote),server:serverWatch.snapshot(now),alpha:alphaEngine?alphaEngine.view():null,hunt:huntView(),marketProtocol:marketView,marketInspector:{...autoInspectorStatus,activeSlot:marketFocusSlot,activeSlots,concurrency,catalog:marketCatalogSummary()},autoTrader:{...autoTraderStatus,activeSlot:marketFocusSlot,activeSlots,concurrency,priorityRoute:priorityRouteView()},autopilot:{...autopilotStatus,slot:marketFocusSlot,activeSlots,concurrency,accounts:autoNavState.map((x,slot)=>({slot,...x}))},system:{uptime:now-stats.started,memoryMB:Math.round(nodeProcess.memoryUsage().rss/1024/1024),activePanels:guests.size,lastPollAt,performance:{profile:settings.performanceProfile,view:{...performanceView,visibleSlots:[...performanceView.visibleSlots]},network:networkInspector.profileInfo?.()||null},analysisCore:{process:true,threaded:false,online:!!(alphaCoreProcess&&alphaCoreProcess.connected),pid:alphaCoreProcess?.pid||null,pending:alphaCorePending.size,lastError:alphaCoreLastError,lastAt:alphaCoreLastAt,scannerSeparated:true,dbSeparated:true,managerSeparated:true}}};}
function publish(){if(win&&!win.isDestroyed())win.webContents.send('grid:update',snapshot());}
function performancePlan(slot){
  const profile=settings.performanceProfile||'balanced',visible=performanceView.section==='games'&&performanceView.visibleSlots.includes(Number(slot)),focused=visible&&Number(performanceView.focusedSlot)===Number(slot),layout=performanceView.layout||'grid';
  if(settings.liveEcoMode){const cap=focused?(layout==='focus'?30:20):(visible?8:3);return {fps:cap,reduceVisuals:!focused,sampleMs:focused?5000:(visible?10000:15000),visible,focused};}
  if(profile==='quality')return {fps:60,reduceVisuals:false,sampleMs:5000,visible,focused};
  if(profile==='ultra')return {fps:focused?(layout==='grid'?45:60):(visible?20:6),reduceVisuals:!focused,sampleMs:focused?5000:(visible?10000:15000),visible,focused};
  return {fps:focused?60:(visible?30:15),reduceVisuals:!focused&&!visible,sampleMs:visible?5000:10000,visible,focused};
}
function performanceCSS(plan){return plan.reduceVisuals?'*,*::before,*::after{animation-duration:.001s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:.001s!important;transition-delay:0s!important;scroll-behavior:auto!important}':'';}
async function applyGuestPerformance(slot,wc){
  if(!wc||wc.isDestroyed())return;const plan=performancePlan(slot);wc.setBackgroundThrottling(settings.liveEcoMode?false:!settings.background);wc.setAudioMuted(settings.mute);
  if(typeof wc.setFrameRate==='function')try{wc.setFrameRate(plan.fps);}catch{}
  const previous=performanceCssKeys.get(slot);if(previous&&typeof wc.removeInsertedCSS==='function')try{await wc.removeInsertedCSS(previous);}catch{}performanceCssKeys.delete(slot);
  const css=performanceCSS(plan);if(css&&typeof wc.insertCSS==='function')try{const key=await wc.insertCSS(css,{cssOrigin:'user'});if(key)performanceCssKeys.set(slot,key);}catch{}
  if(typeof wc.setZoomFactor==='function')try{wc.setZoomFactor(settings.zoom[slot]||1);}catch{}
}
function applySettings(){
  if(powerId!==null){powerSaveBlocker.stop(powerId);powerId=null;}
  if(settings.power!=='off')powerId=powerSaveBlocker.start(settings.power==='display'?'prevent-display-sleep':'prevent-app-suspension');
  networkInspector.configure?.(settings.performanceProfile);
  for(const [slot,wc] of guests)void applyGuestPerformance(slot,wc);
}
function trusted(e){return win&&!win.isDestroyed()&&e.sender===win.webContents&&e.senderFrame?.url===shellURL;}
function handler(name,fn){ipcMain.handle(name,(e,...args)=>{if(!trusted(e))throw new Error('Origem não permitida');return fn(...args);});}
function notification(title,body){try{if(Notification&&(!Notification.isSupported||Notification.isSupported()))new Notification({title,body}).show();}catch{}}
function scheduleReconnect(slot,reason='Falha ao carregar',now=Date.now(),immediate=false){
  if(!settings.autoReconnect||!Number.isInteger(slot)||slot<0||slot>3)return;
  const current=reconnect.get(slot)||{attempts:0,nextAt:0,reason:''};
  current.reason=String(reason||'Falha ao carregar').slice(0,160);
  if(immediate||!current.nextAt)current.nextAt=now+(immediate?500:Math.min(30000,5000*Math.max(1,2**Math.min(current.attempts,3))));
  reconnect.set(slot,current);
}
function clearReconnect(slot){reconnect.delete(slot);}
function markServerFailure(slot,reason,now=Date.now()){
  const change=serverWatch.fail(slot,reason,now);scheduleReconnect(slot,reason,now);
  if(change.offline){
    for(const key of guests.keys())scheduleReconnect(key,'Possível reinício/queda do servidor',now,true);
    if(change.changed){stats.addEvent('server-down','🔴 Servidor indisponível','Falhas simultâneas detectadas. O Gridium iniciou tentativas automáticas de reconexão.',null,'warning',now);if(settings.alerts.desktop&&settings.alerts.connection)notification('Gridium · Servidor offline','O Gridium detectou uma possível queda/reinício e vai tentar reconectar automaticamente.');}
  }
}
function markServerSuccess(slot,now=Date.now()){
  clearReconnect(slot);const change=serverWatch.success(slot,now);
  if(change.recovered){stats.addEvent('server-up','🟢 Servidor disponível','O servidor voltou a responder. As sessões salvas estão sendo restauradas.',null,'success',now);for(const key of guests.keys())if(key!==slot)scheduleReconnect(key,'Servidor voltou',now,true);if(settings.alerts.desktop&&settings.alerts.connection)notification('Gridium · Servidor voltou','O servidor voltou. O Gridium está restaurando as contas.');}
}
function autoReconnectTick(now=Date.now()){
  if(!settings.autoReconnect){reconnect.clear();return;}
  for(const [slot,state] of reconnect){
    if(now<state.nextAt)continue;
    const wc=guests.get(slot);if(!wc||wc.isDestroyed()){reconnect.delete(slot);continue;}
    state.attempts++;state.nextAt=now+Math.min(60000,5000*2**Math.min(state.attempts,4));reconnect.set(slot,state);serverWatch.retrying(now);
    try{wc.reload();}catch{}
  }
}
function handleNewEvents(events){
  if(!settings.alerts.desktop)return;
  for(const event of events){
    if(event.type==='shiny'&&settings.alerts.shiny)notification('Gridium · Shiny',event.detail||event.title);
    if(event.type==='connection'&&settings.alerts.connection)notification('Gridium · Conta',event.detail||event.title);
  }
}
function checkIdleAlerts(now=Date.now()){
  if(!settings.alerts.inactivity)return;
  const threshold=settings.alerts.idleMinutes*60000;
  for(const row of stats.view().rows){
    const key=row.record?.key;if(!key||row.health==='offline'){if(key)idleNotified.delete(key);continue;}
    if(row.lastChange&&now-row.lastChange>=threshold){
      if(!idleNotified.has(key)){idleNotified.add(key);const label=row.record?.nick||`Conta ${row.slot+1}`;const detail=`${label} está sem novos dados há ${settings.alerts.idleMinutes} min.`;stats.addEvent('idle-alert','⚠ Sem atividade',detail,row.slot,'warning',now);if(settings.alerts.desktop)notification('Gridium · Sem atividade',detail);}
    }else idleNotified.delete(key);
  }
}
function checkGoals(now=Date.now()){
  const view=stats.view();
  const scopes=[['all',view.total.values,view.total.accountMs],...view.rows.map(r=>[String(r.slot),r.record?.values||{},r.record?.ms||0])];
  const labels={capturas:'capturas',shinies:'shinies',xpTreinador:'XP do treinador',gold:'gold',hours:'horas'};
  for(const [scope,values,ms] of scopes){
    const goals=settings.goals[scope]||{};
    for(const metric of ['capturas','shinies','xpTreinador','gold','hours']){
      const target=Number(goals[metric])||0;if(target<=0)continue;
      const current=metric==='hours'?ms/3600000:Number(values[metric])||0;
      const key=`${scope}:${metric}:${target}`;
      if(current>=target&&!goalNotified.has(key)){
        goalNotified.add(key);
        const who=scope==='all'?'Geral':view.rows[Number(scope)]?.record?.nick||`Conta ${Number(scope)+1}`;
        const detail=`${who} atingiu a meta de ${target} ${labels[metric]}.`;
        stats.addEvent('goal','🏆 Meta atingida',detail,scope==='all'?null:Number(scope),'success',now);
        if(settings.alerts.desktop)notification('Gridium · Meta atingida',detail);
      }
    }
  }
}
function remotePayload(now=Date.now()){
  const view=stats.view();const forecasts=view.rows.map((r,i)=>forecastRow(r,settings.stocks[i],now));
  const alpha=alphaEngine?alphaEngine.view():null;
  const alphaRemote=alpha?{settings:{executionMode:alpha.settings.executionMode,marketConcurrency:alpha.settings.marketConcurrency,killSwitch:alpha.settings.killSwitch,goal:alpha.settings.goal,dailyProfitTarget:alpha.settings.dailyProfitTarget},accounts:alpha.accounts,rankings:alpha.rankings,positions:alpha.positions.slice(0,30),recentTrades:alpha.recentTrades.slice(0,30),validation:alpha.validation}:null;
  return {version:4,at:now,paused:view.paused,total:view.total,rows:view.rows.map(r=>({slot:r.slot,status:r.status,health:r.health,lastChange:r.lastChange,lastActivityAgo:r.lastActivityAgo,record:r.record?{nick:r.record.nick,values:r.record.values,ms:r.record.ms,since:r.record.since,updated:r.record.updated,live:r.record.live||null}:null})),forecasts,events:stats.recentEvents(20),server:serverWatch.snapshot(now),gridium:{alpha:alphaRemote,hunt:huntView()}};
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function payloadOfNetworkEvent(entry){const p=entry?.postData;if(!p||typeof p!=='object')return null;if(p.protocolPrefix&&p.data&&typeof p.data==='object'&&!Array.isArray(p.data))return p.data;return p;}
function safeMarketReadCommand(input){if(!input||typeof input!=='object'||Array.isArray(input))return null;const t=String(input.t||'');if(!/^market\./i.test(t)||/(comprar|criar|editar|cancelar|vender|buy|sell|create|edit|cancel)/i.test(t))return null;const out={t};for(const [k,v] of Object.entries(input)){if(k==='t'||/pass|token|secret|auth|cookie|session|csrf|email/i.test(k))continue;if(v===null||['string','number','boolean'].includes(typeof v))out[k]=typeof v==='string'?v.slice(0,180):v;}return out;}
function catalogFor(slot){return marketCatalog[Number(slot)]||marketCatalog[0];}
function addCatalogCategory(slot,value){const c=catalogFor(slot),v=String(value??'').trim().slice(0,64);if(v.length<=64&&!/[{}\[\];]/.test(v))c.categories.add(v);return v;}
function addCatalogItem(slot,value){const n=Number(value);if(Number.isSafeInteger(n)&&n>0)catalogFor(slot).itemIds.add(n);}
function addCatalogSpecies(slot,value){const n=Number(value);if(Number.isSafeInteger(n)&&n>0)catalogFor(slot).speciesIds.add(n);}
function learnMarketCatalogFromEvents(slot,events=[]){const c=catalogFor(slot);for(const e of events){const p=payloadOfNetworkEvent(e);if(!p||typeof p!=='object')continue;const t=String(p.t||'');if(e.method==='SEND'){if(t==='market.itens'){addCatalogCategory(slot,p.categoria);addCatalogItem(slot,p.elemento);}else if(t==='market.item')addCatalogItem(slot,p.itemId);else if(t==='market.listar')addCatalogSpecies(slot,p.especieId);}else if(e.method==='RECV'&&t==='market'){if(p.aba==='itens'&&p.resumo)for(const id of Object.keys(p.resumo||{}))addCatalogItem(slot,id);if(p.aba==='especies'&&Array.isArray(p.linhas))for(const row of p.linhas)addCatalogSpecies(slot,row?.speciesId);}}return {categories:c.categories.size,itemIds:c.itemIds.size,speciesIds:c.speciesIds.size};}
function marketCatalogSummary(){const perAccount=marketCatalog.map((c,slot)=>({slot,categories:[...c.categories].filter(Boolean).slice(0,24),categoryCount:c.categories.size,itemCount:c.itemIds.size,speciesCount:c.speciesIds.size}));return {categories:new Set(perAccount.flatMap(x=>x.categories)).size,items:new Set(marketCatalog.flatMap(c=>[...c.itemIds])).size,species:new Set(marketCatalog.flatMap(c=>[...c.speciesIds])).size,perAccount};}
async function discoverMarketCatalogDom(slot,wc){const c=catalogFor(slot),now=Date.now();if(!wc||wc.isDestroyed()||now-Number(c.lastDomAt||0)<120000)return marketCatalogSummary();c.lastDomAt=now;const script=`(()=>{const out=[];const add=v=>{v=String(v??'').trim();if(v.length<=64&&!out.includes(v))out.push(v)};for(const el of document.querySelectorAll('[data-category],[data-categoria],[data-market-category]')){add(el.getAttribute('data-category'));add(el.getAttribute('data-categoria'));add(el.getAttribute('data-market-category'));}for(const sel of document.querySelectorAll('select')){const meta=String((sel.id||'')+' '+(sel.name||'')+' '+(sel.className||'')+' '+(sel.getAttribute('aria-label')||''));if(!/categor|item|market|mercado/i.test(meta))continue;for(const o of sel.options||[])add(o.value);}return out.slice(0,80)})()`;try{const rows=await wc.executeJavaScript(script,true);for(const v of Array.isArray(rows)?rows:[])addCatalogCategory(slot,v);}catch{}return marketCatalogSummary();}
function nextFromSet(set,cursor){const rows=[...set];if(!rows.length)return {value:null,cursor};return {value:rows[cursor%rows.length],cursor:(cursor+1)%Math.max(1,rows.length)};}
function learnMarketReadTemplates(slot,events=[]){const map=marketReadTemplates[slot];if(!map)return 0;for(const e of events){if(e.method!=='SEND')continue;const c=safeMarketReadCommand(payloadOfNetworkEvent(e));if(c)map.set(JSON.stringify(c),c);}learnMarketCatalogFromEvents(slot,events);marketBridgeHealth[slot].learned=map.size;return map.size;}
function deriveMarketDetailCandidates(events=[]){const sorted=[...events].sort((a,b)=>(Number(a.at)||0)-(Number(b.at)||0)),out=[],seen=new Set();let pending=null;for(const e of sorted){const p=payloadOfNetworkEvent(e);if(!p||typeof p!=='object')continue;if(e.method==='SEND'&&p.t==='market.itens'&&String(p.elemento??'')===''){pending={at:Number(e.at)||0,categoria:String(p.categoria||'').slice(0,80)};continue;}if(e.method==='RECV'&&p.t==='market'&&p.aba==='itens'&&p.resumo&&pending&&((Number(e.at)||0)-pending.at)<=7000){for(const id of Object.keys(p.resumo||{})){if(!/^\d+$/.test(String(id)))continue;const n=Number(id);if(!Number.isSafeInteger(n)||n<0)continue;const key=pending.categoria+'|n:'+n;if(seen.has(key))continue;seen.add(key);out.push({t:'market.itens',elemento:n,categoria:pending.categoria});}pending=null;}}return out.slice(-400);}

function deriveClientReadCandidates(_hints={},detail=[]){
  const out=[],seen=new Set();
  for(const d of detail.slice(-120)){
    const id=Number(d?.elemento);if(!Number.isSafeInteger(id)||id<=0)continue;
    const cmd={t:'market.item',tipo:'item',itemId:id,pagina:1};
    const k=JSON.stringify(cmd);if(seen.has(k))continue;seen.add(k);out.push(cmd);
  }
  return out.slice(0,160);
}

async function collectMarketSourceHints(slot,wc){
  const h=marketBridgeHealth[slot];if(!h||!wc||wc.isDestroyed())return null;
  if(h.sourceHints&&Date.now()-Number(h.sourceHintAt||0)<10*60*1000)return h.sourceHints;
  const source=`(async()=>{try{
    const urls=[...new Set(performance.getEntriesByType('resource').map(e=>String(e.name||'')).filter(u=>/\\.js(?:[?#]|$)/i.test(u)))].slice(0,64);
    const needles=['pedirAnunciosItem','market.listar','market.itens','market.especies','market.comprar'],hits=[],commandTypes=[],targetSnippets=[],listarSnippets=[];
    const addType=t=>{t=String(t||'');if(t&&!commandTypes.includes(t))commandTypes.push(t)};
    for(const url of urls){try{
      const txt=await fetch(url,{credentials:'same-origin',cache:'force-cache'}).then(r=>r.ok?r.text():'');if(!txt)continue;
      for(const m of txt.matchAll(/[\"'](market\\.[A-Za-z0-9_.-]+)[\"']/g))addType(m[1]);
      const low=txt.toLowerCase();
      for(const needle of needles){let from=0,count=0;while(count<6){const i=low.indexOf(needle.toLowerCase(),from);if(i<0)break;const a=Math.max(0,i-1400),b=Math.min(txt.length,i+2600),raw=txt.slice(a,b);hits.push({url:url.slice(0,240),needle,snippet:raw.replace(/\\s+/g,' ').slice(0,3800)});if(needle==='pedirAnunciosItem')targetSnippets.push(raw.slice(0,5000));if(needle==='market.listar')listarSnippets.push(raw.slice(0,5000));from=i+needle.length;count++;}}
    }catch{}}
    const targetCommands=[];for(const s of targetSnippets){for(const m of s.matchAll(/market\\.[A-Za-z0-9_.-]+/g)){if(!targetCommands.includes(m[0]))targetCommands.push(m[0]);}}
    let globalFunction=false,functionSource='';try{const fn=window.pedirAnunciosItem;globalFunction=typeof fn==='function';if(globalFunction)functionSource=String(fn).slice(0,8000);}catch{}
    return {ok:true,scriptCount:urls.length,hits:hits.slice(0,24),commandTypes:commandTypes.slice(0,80),targetCommands:targetCommands.slice(0,30),targetSnippets:targetSnippets.slice(0,6).map(x=>x.replace(/\\s+/g,' ').slice(0,5000)),listarSnippets:listarSnippets.slice(0,4).map(x=>x.replace(/\\s+/g,' ').slice(0,5000)),globalFunction,functionSource:functionSource.replace(/\\s+/g,' ').slice(0,8000)};
  }catch(e){return {ok:false,error:String(e&&e.message||e)}}})()`;
  try{const result=await wc.executeJavaScript(source,true);h.sourceHintAt=Date.now();h.sourceHints=result||null;return h.sourceHints;}catch(error){h.sourceHintAt=Date.now();h.sourceHints={ok:false,error:String(error?.message||error)};return h.sourceHints;}
}
async function installMarketBridge(slot,wc){const h=marketBridgeHealth[slot];if(!h||!wc||wc.isDestroyed())return false;try{const ok=await wc.executeJavaScript(MARKET_BRIDGE_SOURCE,true);h.installed=ok===true;h.lastInstallAt=Date.now();if(!h.installed)h.lastProbeError='Ponte WebSocket não instalou';return h.installed;}catch(error){h.installed=false;h.lastProbeError=String(error?.message||error);return false;}}
async function marketBridgeState(slot,wc){const h=marketBridgeHealth[slot];if(!h||!wc||wc.isDestroyed())return h;try{const s=await wc.executeJavaScript("(()=>{try{const ws=window.__gridiumLastGameSocket||(window.__gridiumFindGameSocket&&window.__gridiumFindGameSocket());return {installed:typeof window.__gridiumMarketSend==='function',socketReady:!!ws&&ws.readyState===1,url:ws?String(ws.url||''):''}}catch(e){return {installed:false,socketReady:false,error:String(e&&e.message||e)}}})()",true);h.installed=s?.installed===true;h.socketReady=s?.socketReady===true;if(s?.error)h.lastProbeError=s.error;return h;}catch(error){h.socketReady=false;h.lastProbeError=String(error?.message||error);return h;}}
async function registerMarketBridge(slot,wc){if(!wc||wc.isDestroyed())return false;try{if(wc.debugger?.isAttached())await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:MARKET_BRIDGE_SOURCE});}catch{}return installMarketBridge(slot,wc);}
async function sendPassiveMarketProbe(slot){
  const wc=guests.get(slot),h=marketBridgeHealth[slot],catalog=catalogFor(slot);if(!wc||wc.isDestroyed()||!h)return {ok:false,reason:'conta-indisponivel'};
  const now=Date.now(),profile=settings.performanceProfile||'balanced',probeFloor=profile==='ultra'?24000:profile==='balanced'?12000:0;if(probeFloor&&h.socketReady&&h.learned>0&&now-Number(h.lastProbeAt||0)<probeFloor)return {ok:true,skipped:true,reason:'protocolo-recente'};
  const recentLimit=profile==='ultra'?650:profile==='balanced'?1000:1400,recent=networkInspector.recent(slot,{sinceMs:3*60*1000,limit:recentLimit,marketOnly:true});learnMarketReadTemplates(slot,recent.requests);const domRefresh=profile==='ultra'?120000:profile==='balanced'?60000:30000;if(now-Number(catalog.lastDomAt||0)>=domRefresh)await discoverMarketCatalogDom(slot,wc);
  await installMarketBridge(slot,wc);await marketBridgeState(slot,wc);h.lastProbeAt=Date.now();
  if(!h.socketReady){h.lastProbeOk=false;h.lastProbeError='WebSocket do jogo ainda não foi capturado';return {ok:false,reason:'socket-unavailable'};}
  const rows=[...marketReadTemplates[slot].values()],cycle=catalog.probeCursor++%12;let cmd=null,kind='global';
  const speciesTemplate=rows.find(x=>x.t==='market.especies'),listarTemplate=rows.find(x=>x.t==='market.listar');
  if(cycle===0||cycle===6){const page=catalog.speciesPage;catalog.speciesPage=page>=4?1:page+1;cmd={...(speciesTemplate||{t:'market.especies'}),pagina:page};kind='species-summary';}
  else if(catalog.speciesIds.size&&(cycle===2||cycle===8)){const pick=nextFromSet(catalog.speciesIds,catalog.speciesCursor);catalog.speciesCursor=pick.cursor;cmd={...(listarTemplate||{t:'market.listar'}),especieId:pick.value,pagina:1};kind='pokemon-list';}
  else if(cycle===1||cycle===7||!catalog.itemIds.size){const pick=nextFromSet(catalog.categories,catalog.categoryCursor);catalog.categoryCursor=pick.cursor;cmd={t:'market.itens',elemento:'',categoria:pick.value??''};kind='category-summary';}
  else{const pick=nextFromSet(catalog.itemIds,catalog.itemCursor);catalog.itemCursor=pick.cursor;cmd={t:'market.item',tipo:'item',itemId:pick.value,pagina:1};kind='item-list';}
  const safe=safeMarketReadCommand(cmd);if(!safe){h.lastProbeOk=false;h.lastProbeError='Probe global de leitura rejeitado';return {ok:false,reason:'unsafe-read-probe'};}
  if(safe.t==='market.item'){h.clientAttempts++;h.lastClientCommand='market.item';h.lastClientAsset=String(safe.itemId??'');}if(safe.t==='market.itens'){h.detailAttempts++;h.lastDetailAsset=String(safe.elemento??'');h.lastDetailCategory=String(safe.categoria||'');h.lastDetailType=typeof safe.elemento;}
  const encoded=JSON.stringify(safe);try{const result=await wc.executeJavaScript(`window.__gridiumMarketSend?window.__gridiumMarketSend(${encoded}):({ok:false,reason:'bridge-missing'})`,true);h.lastProbeOk=result?.ok===true;h.lastProbeError=h.lastProbeOk?null:String(result?.reason||'probe-failed');if(h.lastProbeOk)h.lastMarketTxAt=Date.now();return {...result,command:safe,kind,catalog:{categories:catalog.categories.size,itemIds:catalog.itemIds.size,speciesIds:catalog.speciesIds.size},clientTypes:['market.item','market.especies','market.listar','market.itens']};}catch(error){h.lastProbeOk=false;h.lastProbeError=String(error?.message||error);return {ok:false,reason:h.lastProbeError};}
}

function connectedMarketSlots(){return [...guests.keys()].filter(slot=>{const wc=guests.get(slot);return wc&&!wc.isDestroyed()}).sort((a,b)=>a-b);}
function configuredMarketConcurrency(){return Math.max(1,Math.min(4,Math.round(Number(alphaEngine?.settings?.marketConcurrency)||1)));}
function sameSlots(a=[],b=[]){return a.length===b.length&&a.every((x,i)=>Number(x)===Number(b[i]));}
function setMarketActiveSlots(input=[],reason=''){const connected=connectedMarketSlots();if(!connected.length){marketActiveSlots=[];marketFocusSlot=null;marketFocusSince=0;networkInspector.setFocusSlots(null);return [];}const count=Math.min(configuredMarketConcurrency(),connected.length),clean=[...new Set((input||[]).map(Number).filter(x=>connected.includes(x)))];for(const x of connected)if(clean.length<count&&!clean.includes(x))clean.push(x);clean.splice(count);const changed=!sameSlots(clean,marketActiveSlots);marketActiveSlots=clean;marketFocusSlot=clean[0]??null;if(changed||!marketFocusSince)marketFocusSince=Date.now();networkInspector.setFocusSlots(clean);if(changed)autopilotStatus={...autopilotStatus,slot:marketFocusSlot,activeSlots:[...clean],route:'Market · '+clean.length+' conta(s)',lastAt:Date.now(),lastAction:reason||('Market ativo em '+clean.map(x=>'C'+(x+1)).join(' + '))};return [...clean];}
function ensureMarketActiveSlots({rotate=false,forceInclude=null,force=false}={}){const slots=connectedMarketSlots();if(!slots.length)return setMarketActiveSlots([]);const count=Math.min(configuredMarketConcurrency(),slots.length);if(count>=slots.length)return setMarketActiveSlots(slots,'Todas as contas ativas · sem rotação');let current=marketActiveSlots.filter(x=>slots.includes(x));const due=Date.now()-Number(marketFocusSince||0)>=MARKET_FOCUS_ROTATE_MS;if(force||current.length!==count||(rotate||due)&&!autoTradingBusy&&!priorityRouteActive){if((rotate||due)&&current.length===count)marketRotationCursor=(marketRotationCursor+1)%slots.length;current=Array.from({length:count},(_,i)=>slots[(marketRotationCursor+i)%slots.length]);}if(Number.isInteger(Number(forceInclude))&&slots.includes(Number(forceInclude))&&!current.includes(Number(forceInclude))){current=[Number(forceInclude),...current.filter(x=>x!==Number(forceInclude))].slice(0,count);}return setMarketActiveSlots(current);}
function setMarketFocus(slot){if(slot===null||slot===undefined)return ensureMarketActiveSlots();return ensureMarketActiveSlots({forceInclude:Number(slot)}),Number(slot);}
function ensureMarketFocus(opts={}){return ensureMarketActiveSlots(opts)[0]??null;}
function clearMarketFocus(){marketActiveSlots=[];marketFocusSlot=null;marketFocusSince=0;marketRotationCursor=0;networkInspector.setFocusSlots(null);}
function priorityRouteView(){const a=priorityRouteActive;return {active:a?{originSlot:a.originSlot,targetSlot:a.targetSlot,listingId:a.listingId,name:a.name,priorityScore:a.priorityScore,urgent:a.urgent,ageMs:Date.now()-a.startedAt,attempts:a.attempts}:null,queued:priorityRouteQueue.slice(0,6).map(x=>({originSlot:x.originSlot,targetSlot:x.targetSlot,listingId:x.listingId,name:x.name,priorityScore:x.priorityScore,urgent:x.urgent}))};}
function enqueuePriorityRoute(candidate,originSlot){const target=Number(candidate?.executeSlot);if(!Number.isInteger(target)||target===Number(originSlot))return false;const key=String(candidate.listingId||'')+':'+target;if(!candidate.listingId||priorityRouteActive?.key===key||priorityRouteQueue.some(x=>x.key===key))return false;priorityRouteQueue.push({key,originSlot:Number(originSlot),targetSlot:target,returnSlot:Number(originSlot),returnSlots:[],listingId:String(candidate.listingId),assetType:candidate.assetType,assetId:candidate.assetId,name:candidate.name||'',currency:candidate.currency,price:Number(candidate.price)||0,evaluation:candidate.evaluation||{},priorityScore:Number(candidate.priorityScore)||Number(candidate.evaluation?.alphaScore)||0,urgent:candidate.urgent===true,startedAt:0,attempts:0});priorityRouteQueue.sort((a,b)=>(Number(b.urgent)-Number(a.urgent))||(b.priorityScore-a.priorityScore));priorityRouteQueue=priorityRouteQueue.slice(0,12);return true;}
function startNextPriorityRoute(){if(priorityRouteActive||!priorityRouteQueue.length)return priorityRouteActive;const next=priorityRouteQueue.shift();next.startedAt=Date.now();next.returnSlots=[...ensureMarketActiveSlots()];priorityRouteActive=next;ensureMarketActiveSlots({forceInclude:next.targetSlot,force:true});autoTraderStatus={...autoTraderStatus,lastReason:'Prioridade '+(next.urgent?'ALTA':'normal')+': C'+(next.originSlot+1)+' detectou '+(next.name||next.listingId)+' → C'+(next.targetSlot+1)+' vai resolver',priorityRoute:priorityRouteView(),lastAt:Date.now()};return next;}
function finishPriorityRoute(reason){const done=priorityRouteActive;priorityRouteActive=null;if(done?.returnSlots?.length)setMarketActiveSlots(done.returnSlots,'Rota prioritária concluída · grupo restaurado');else ensureMarketActiveSlots({force:true});autoTraderStatus={...autoTraderStatus,lastReason:reason||'Rota prioritária concluída',priorityRoute:priorityRouteView(),lastAt:Date.now()};return done;}
async function probePriorityRoute(route){if(!route)return false;const slot=Number(route.targetSlot),id=Number(route.assetId),wc=guests.get(slot);if(!wc||wc.isDestroyed())return false;if(route.assetType==='item'&&Number.isSafeInteger(id)&&id>0){await installMarketBridge(slot,wc);await marketBridgeState(slot,wc);const safe=safeMarketReadCommand({t:'market.item',tipo:'item',itemId:id,pagina:1});if(safe){try{const encoded=JSON.stringify(safe),r=await wc.executeJavaScript(`window.__gridiumMarketSend?window.__gridiumMarketSend(${encoded}):({ok:false})`,true);if(r?.ok){marketBridgeHealth[slot].lastMarketTxAt=Date.now();await sleep(140);return true;}}catch{}}}return false;}


function mergeNetworkRows(a=[],b=[]){const m=new Map();for(const e of [...a,...b]){const key=[e.id,e.at,e.method,e.phase,JSON.stringify(e.postData||null)].join('|');m.set(key,e);}return [...m.values()].sort((x,y)=>(Number(x.at)||0)-(Number(y.at)||0));}
function marketRuntimeHealth(){
  const now=Date.now(),targets=ensureMarketActiveSlots(),slots=[];let attached=0,bridges=0,sockets=0,marketRx=0,marketTx=0,summaryRows=0,listingRows=0,usable=0,lastMarketRxAt=0,recentSlots=0;
  for(const slot of targets){const market=networkInspector.recent(slot,{sinceMs:90000,limit:700,marketOnly:true}),h=marketBridgeHealth[slot],acc=(latestMarketProtocol.accounts||[]).find(x=>Number(x.slot)===slot);if(market.attached)attached++;if(h.installed)bridges++;if(h.socketReady)sockets++;let rxCount=0,txCount=0,rxAt=0;for(const x of market.requests){if(x.method==='RECV'){rxCount++;rxAt=Math.max(rxAt,Number(x.at)||0);}else if(x.method==='SEND')txCount++;}marketRx+=rxCount;marketTx+=txCount;h.lastMarketRxAt=Math.max(h.lastMarketRxAt||0,rxAt);lastMarketRxAt=Math.max(lastMarketRxAt,h.lastMarketRxAt||0);const recent=Number(h.lastMarketRxAt||0)>0&&now-Number(h.lastMarketRxAt||0)<=90000;if(recent)recentSlots++;const ss=Number(acc?.summaryRows)||0,l=(latestMarketProtocol.listings||[]).filter(x=>Number(x.slot)===slot&&now-(Number(x.at)||0)<=90000).length;summaryRows+=ss;listingRows+=l;slots.push({slot,attached:market.attached===true,bridge:h.installed===true,socket:h.socketReady===true,marketRx:rxCount,marketTx:txCount,lastMarketRxAt:h.lastMarketRxAt||0,recentRx:recent,summaryRows:ss,listingRows:l,probeOk:h.lastProbeOk===true,probeError:h.lastProbeError||null,learned:h.learned||0});}
  const activeSet=new Set(targets);for(const l of latestMarketProtocol.listings||[]){if(activeSet.has(Number(l.slot))&&now-(Number(l.at)||0)<=45000&&Number.isInteger(Number(l.listingId))&&Number(l.listingId)>0&&['item','pokemon'].includes(l.assetType))usable++;}
  const recentRx=targets.length>0&&recentSlots===targets.length;return {at:now,activeSlot:targets[0]??null,activeSlots:[...targets],targetCount:targets.length,attached,bridges,sockets,marketRx,marketTx,summaryRows,listingRows,usable,lastMarketRxAt,recentRx,recentSlots,ready:targets.length>0&&attached===targets.length&&sockets===targets.length&&recentRx&&usable>0,slots};
}
function setAutopilotSafeStop(reason,state='fault'){if(alphaEngine){if(alphaEngine.settings.killSwitch!==true)alphaEngine.kill(true);if(alphaEngine.settings.liveExecutionUnlocked===true)alphaEngine.unlockLive(false);}autopilotStatus={...autopilotStatus,enabled:false,state,lastAt:Date.now(),lastAction:reason,lastError:reason,route:'scanner seguro'};}
function maybeArmAutopilot(){if(!alphaEngine||autopilotStatus.enabled!==true)return;let coreReady=!!(alphaCoreProcess&&alphaCoreProcess.connected);if(!coreReady)try{ensureAlphaCoreProcess();coreReady=!!(alphaCoreProcess&&alphaCoreProcess.connected);}catch(e){alphaCoreLastError=String(e?.message||e);}const health=marketRuntimeHealth(),protocolReady=liveValidationReady();autopilotStatus={...autopilotStatus,runtimeHealth:health,accountsReady:health.attached,listingsSeen:(latestMarketProtocol.listings||[]).length};const live=alphaEngine.settings.liveExecutionUnlocked===true,kill=alphaEngine.settings.killSwitch===true;if(protocolReady&&health.ready&&coreReady){if(!live)alphaEngine.unlockLive(true);if(kill)alphaEngine.kill(false);autopilotStatus={...autopilotStatus,state:'armed',lastAt:Date.now(),lastAction:'Tudo verde · LIVE liberado automaticamente · Auto Trader ativo',lastError:null};}else{if(!kill)alphaEngine.kill(true);if(live)alphaEngine.unlockLive(false);const reason=!coreReady?'Reiniciando Auto Trader Core':!protocolReady?'Aguardando validação segura do protocolo':health.marketRx?'Aguardando anúncios detalhados válidos':'Aguardando resposta real do Market';autopilotStatus={...autopilotStatus,state:'warming',lastAt:Date.now(),lastAction:reason,lastError:null};}}

const requiredLiveValidation=['marketProtocolMapped','marketListingsMapped','buyRequestMapped','liveBuyValidated','sellRequestMapped','createListingValidated','cancelRequestMapped','cancelValidated','liveSellValidated','autoRepricingValidated','stateProtocolMapped','ownListingsMapped'];
function liveValidationReady(){const v=alphaEngine?.view()?.validation||{};return requiredLiveValidation.every(k=>v[k]===true);}
function protocolAccount(slot){return latestMarketProtocol.accounts?.find(x=>Number(x.slot)===Number(slot))?.account||{};}
function cleanOrderTimes(slot,now=Date.now()){const rows=(liveOrderTimes.get(slot)||[]).filter(t=>t>now-3600000);liveOrderTimes.set(slot,rows);return rows;}
function liveRateCheck(slot,{paired=false}={}){
  if(paired)return {ok:true};const safety=alphaEngine?.settings?.liveSafety||{},now=Date.now(),rows=cleanOrderTimes(slot,now),max=Math.max(1,Number(safety.maxOrdersPerHour)||6),gap=Math.max(3,Number(safety.minSecondsBetweenOrders)||10)*1000;
  if(rows.length>=max)return {ok:false,reason:'Limite de ordens por hora atingido'};const last=rows.at(-1)||0;if(last&&now-last<gap)return {ok:false,reason:`Aguarde ${Math.ceil((gap-(now-last))/1000)}s entre ordens`};return {ok:true};
}
function markLiveOrder(slot){const rows=cleanOrderTimes(slot);rows.push(Date.now());liveOrderTimes.set(slot,rows);}
function ownListingById(slot,id){return (alphaEngine?.ownListings?.[slot]||[]).find(x=>String(x.listingId)===String(id))||null;}
function freshObservedListing(slot,input={}){
  const freshMs=Math.max(2000,Number(alphaEngine?.settings?.liveSafety?.freshListingMs)||10000),id=String(input.listingId||input.id||'');
  const row=(latestMarketProtocol.listings||[]).filter(x=>Number(x.slot)===Number(slot)&&String(x.listingId)===id).sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0))[0];
  if(!row)throw new Error('Anúncio não está no feed observado do Market');
  if(Date.now()-(Number(row.at)||0)>freshMs)throw new Error('Anúncio está antigo. Atualize a vitrine/Inspector antes de operar');
  if(Number(input.price)&&Number(input.price)!==Number(row.price))throw new Error('Preço mudou desde a avaliação');
  if(input.currency&&String(input.currency)!==String(row.currency))throw new Error('Moeda mudou desde a avaliação');
  const account=protocolAccount(slot);if((row.sellerId!=null&&account.id!=null&&String(row.sellerId)===String(account.id))||(row.seller&&account.nick&&String(row.seller)===String(account.nick)))throw new Error('Compra da própria conta bloqueada');
  return row;
}
function liveRisk(slot,listing,strategy='balanced'){
  if(!alphaEngine)throw new Error('Alpha indisponível');if(!liveValidationReady())throw new Error('Validação do protocolo incompleta');
  const risk=alphaEngine.canExecute(listing,slot,strategy);if(!risk.ok)throw new Error(risk.reason);
  const acc=protocolAccount(slot),rawBalance=listing.currency==='gems'?acc.gems:acc.gold,balance=rawBalance==null?NaN:Number(rawBalance);if(!acc.balanceTimes?.[listing.currency==='gems'?'gems':'gold']||Date.now()-acc.balanceTimes[listing.currency==='gems'?'gems':'gold']>120000)throw new Error('Saldo do servidor desatualizado; aguardando leitura real');if(Number.isFinite(balance)&&Number(listing.price)>balance)throw new Error('Saldo real da conta insuficiente');if(!Number.isFinite(balance))throw new Error('Saldo real da conta ainda não foi observado');
  const rate=liveRateCheck(slot);if(!rate.ok)throw new Error(rate.reason);return {risk,account:acc};
}
async function sendMarketCommand(slot,command,{paired=false}={}){
  if(!Number.isInteger(slot)||slot<0||slot>3)throw new Error('Conta inválida');const wc=guests.get(slot);if(!wc||wc.isDestroyed())throw new Error('Conta não está conectada');
  const url=wc.getURL();let origin='';try{origin=new URL(url).origin;}catch{}if(!['https://pokeidle.io','https://www.pokeidle.io'].includes(origin))throw new Error('Conta não está no PokéIdle.io');
  await installMarketBridge(slot,wc);await marketBridgeState(slot,wc);const clean=validateMarketCommand(command),encoded=JSON.stringify(clean);const activeOrder=professionalActive.get(slot);if(activeOrder)alphaEngine.updateOrder(activeOrder.id,{status:'sent',sentAt:Date.now(),command:clean});const result=await wc.executeJavaScript(`window.__gridiumMarketSend?window.__gridiumMarketSend(${encoded}):({ok:false,reason:'bridge-missing'})`,true);
  if(!result?.ok){if(activeOrder)alphaEngine.updateOrder(activeOrder.id,{sentAt:0});throw new Error(result?.reason==='socket-unavailable'?'WebSocket do jogo ainda não foi observado. Navegue no Market por alguns segundos e tente novamente.':'Ponte de execução do Market indisponível');}if(!paired)markLiveOrder(slot);return {ok:true,command:clean};
}
async function waitMarketOutcome(slot,action,startedAt,expected={},timeoutMs=5500){
  const end=Date.now()+timeoutMs;while(Date.now()<end){const network=networkInspector.recent(slot,{sinceMs:Math.max(15000,Date.now()-startedAt+2000),limit:1200,marketOnly:false});const found=findMarketOutcome(network.requests,action,startedAt,expected);if(found.done)return found;await sleep(140);}return {done:true,ok:false,error:'Sem confirmação do servidor dentro do tempo limite'};
}
function autoSellPrice(listing,evaluation={},strategyId='balanced'){
  const feePct=Math.max(0,Number(alphaEngine?.settings?.feePct?.[listing.currency])||15),strategy=(alphaEngine?.settings?.strategies||[]).find(x=>x.id===String(strategyId))||(alphaEngine?.settings?.strategies||[]).find(x=>x.id==='balanced')||{},minNetRoi=Math.max(Number(strategy.minRoi)||12,Number(alphaEngine?.settings?.liveSafety?.minExitProfitPct)||5),netFactor=Math.max(.01,1-feePct/100),floor=Math.ceil(Number(listing.price)*(1+minNetRoi/100)/netFactor),target=Math.floor(Number(evaluation.target)||0);
  return Math.max(floor,target,Number(listing.price)+1);
}
async function executeLiveCreateImpl(slot,listing,price,qty=1,{paired=false,source='manual'}={}){
  if(alphaEngine.settings.killSwitch)throw new Error('Emergency Kill Switch ativo');if(!alphaEngine.settings.liveExecutionUnlocked)throw new Error('LIVE bloqueado');if(!['confirm','semi','auto'].includes(alphaEngine.settings.executionMode))throw new Error('Modo atual não permite venda real');
  const cmd=buildCreateCommand(listing,price,qty),startedAt=Date.now();alphaEngine.audit('live-create-send',`${source==='auto'?'Auto':'Live'}: enviando anúncio real de ${listing.name||listing.assetId}`,slot,{price,qty,currency:listing.currency,assetType:listing.assetType,assetId:listing.assetId});
  await sendMarketCommand(slot,cmd,{paired});const outcome=await waitMarketOutcome(slot,'create',startedAt,{price,currency:listing.currency,assetId:listing.assetId,assetType:listing.assetType});alphaEngine.audit(outcome.ok?'live-create-ok':'live-create-fail',outcome.ok?'Anúncio real criado':'Falha ao criar anúncio real',slot,{...outcome,source});return outcome;
}
async function executeLiveBuyImpl(input={}){
  const slot=Number(input.slot),strategy=String(input.strategy||'balanced'),requested=input.listing||{},source=String(input.source||'manual'),autoSell=input.autoSell===true;
  if(!Number.isInteger(slot)||slot<0||slot>3)throw new Error('Conta inválida');const listing=freshObservedListing(slot,requested);if(isOwnAccountListing(listing))throw new Error('Compra entre contas deste Gridium bloqueada');const {risk}=liveRisk(slot,listing,strategy),evaluation=input.evaluation&&typeof input.evaluation==='object'?input.evaluation:alphaEngine.evaluate(listing,strategy),startedAt=Date.now();
  alphaEngine.audit('live-buy-send',`${source==='auto'?'Auto':'Live'}: compra real enviada para ${listing.name}`,slot,{listingId:listing.listingId,price:listing.price,currency:listing.currency,strategy,risk,evaluation});
  await sendMarketCommand(slot,buildBuyCommand(listing));const outcome=await waitMarketOutcome(slot,'buy',startedAt,{price:listing.price,listingId:listing.listingId,currency:listing.currency,assetId:listing.assetId});
  if(!outcome.ok){alphaEngine.audit('live-buy-fail','Compra real não confirmada',slot,{listingId:listing.listingId,error:outcome.error||'',source});return {ok:false,outcome,listing,evaluation};}
  listing.price=Number(outcome.price); // Actual server debit may be below the requested ceiling.
  const expectedSale=autoSellPrice(listing,evaluation,strategy),feePct=Math.max(0,Number(alphaEngine.settings?.feePct?.[listing.currency])||0),expectedFee=expectedSale*feePct/100,expectedProfit=expectedSale-listing.price-expectedFee;
  const positionId=alphaEngine.openPosition({slot,strategy,mode:'real',assetType:listing.assetType,assetId:listing.assetId,name:listing.name,currency:listing.currency,qty:1,entry:listing.price,target:evaluation.target||0,fairValue:evaluation.fairValue||0,mark:listing.price,alphaScore:evaluation.alphaScore||0,confidence:evaluation.confidence||0,liquidity:evaluation.liquidity||0,metadata:{orderId:professionalActive.get(slot)?.id,listingId:listing.listingId,source,locked:outcome.locked===true,expectedSale,expectedFee,expectedProfit,expectedRoi:listing.price>0?expectedProfit/listing.price*100:0,fairValue:Number(evaluation.fairValue)||0,floorPrice:Number(evaluation.floorPrice)||0,bookTarget:Number(evaluation.bookTarget)||0,bookDepth:Number(evaluation.bookDepth)||0,confidence:Number(evaluation.confidence)||0,listingStatus:autoSell?'pending':'manual',listingAttempts:0,listingRetryAt:0}});
  alphaEngine.audit('live-buy-ok',`Compra real confirmada: ${listing.name}`,slot,{listingId:listing.listingId,positionId,locked:outcome.locked===true,source});
  autoConsumedListings.set(`${slot}:${listing.listingId}`,Date.now());let sell=null;
  if(autoSell&&alphaEngine.settings.liveSafety?.autoSellAfterBuy!==false&&!outcome.locked&&['item','pokemon'].includes(listing.assetType)){
    const price=autoSellPrice(listing,evaluation,strategy);try{sell=await executeLiveCreate(slot,listing,price,1,{paired:true,source:'auto-pair'});}catch(error){sell={ok:false,error:String(error?.message||error)};alphaEngine.audit('auto-sell-fail','Compra concluída, mas anúncio automático falhou',slot,{positionId,error:sell.error});}
  }else if(autoSell&&outcome.locked)alphaEngine.audit('auto-sell-wait','Ativo comprado está travado para revenda; posição mantida aberta',slot,{positionId,assetId:listing.assetId});
  const resaleProblem=autoSell&&(outcome.locked===true||(sell&&sell.ok!==true));if(sell?.ok===true)alphaEngine.updatePositionMetadata(positionId,{listingStatus:'pending',listingAttempts:0,listingRetryAt:Date.now()+5000});else if(resaleProblem){const retryAt=Date.now()+5000;alphaEngine.updatePositionMetadata(positionId,{listingStatus:'pending',listingAttempts:1,listingRetryAt:retryAt,lastListingError:outcome.locked===true?'Ativo travado para revenda':String(sell?.error||sell?.outcome?.error||'Falha ao anunciar')});alphaEngine.audit('auto-sell-pending','Compra concluída; recuperador tentará novamente o anúncio',slot,{positionId,retryAt});}
  const resaleState=resaleProblem?{resalePending:true}:{resalePending:false};return {ok:true,outcome,listing,evaluation,positionId,sell,...resaleState};
}
async function executeLiveRepriceImpl(input={}){
  const slot=Number(input.slot),listing=ownListingById(slot,input.listing?.listingId||input.listingId);if(!listing)throw new Error('Anúncio próprio não encontrado');if(alphaEngine.settings.killSwitch)throw new Error('Emergency Kill Switch ativo');if(!alphaEngine.settings.liveExecutionUnlocked)throw new Error('LIVE bloqueado');
  const preview=alphaEngine.repricingPreview(slot,listing,latestMarketProtocol.listings||[]);const target=Number(input.price)||Number(preview.suggested);if(!preview.canEdit||!(target>0))throw new Error(preview.reason||'Repricing ainda não permitido');
  const key=`${slot}:${listing.listingId}`,last=lastAutoReprice.get(key)||0;if(input.source==='auto'&&Date.now()-last<125000)throw new Error('Repricing automático em cooldown');
  const startedAt=Date.now();await sendMarketCommand(slot,buildEditCommand(listing,target),{paired:input.source==='auto'});const outcome=await waitMarketOutcome(slot,'reprice',startedAt,{listingId:listing.listingId,price:target});if(outcome.ok)lastAutoReprice.set(key,Date.now());alphaEngine.audit(outcome.ok?'live-reprice-ok':'live-reprice-fail',outcome.ok?`Repricing real confirmado: ${listing.name}`:'Repricing real não confirmado',slot,{listingId:listing.listingId,price:target,source:input.source||'manual',outcome});return {ok:outcome.ok,outcome,preview};
}
async function executeLiveCancelImpl(input={}){
  const slot=Number(input.slot),listing=ownListingById(slot,input.listing?.listingId||input.listingId);if(!listing)throw new Error('Anúncio próprio não encontrado');if(alphaEngine.settings.killSwitch)throw new Error('Emergency Kill Switch ativo');if(!alphaEngine.settings.liveExecutionUnlocked)throw new Error('LIVE bloqueado');const startedAt=Date.now();await sendMarketCommand(slot,buildCancelCommand(listing));const outcome=await waitMarketOutcome(slot,'cancel',startedAt,{listingId:listing.listingId});alphaEngine.audit(outcome.ok?'live-cancel-ok':'live-cancel-fail',outcome.ok?`Anúncio cancelado: ${listing.name}`:'Cancelamento não confirmado',slot,{listingId:listing.listingId,outcome});return {ok:outcome.ok,outcome};
}

function positionOwnListing(position){
  const rows=alphaEngine?.ownListings?.[Number(position.slot)]||[];
  return rows.find(x=>x&&x.currency===position.currency&&x.assetType===position.asset_type&&String(x.assetId??x.name??'')===String(position.asset_id??position.name??''))||null;
}
function uncoveredRealPositions(){
  if(!alphaEngine)return [];const now=Date.now();return alphaEngine.positions(true).filter(p=>{if(p.mode!=='real')return false;const m=p.metadata&&typeof p.metadata==='object'?p.metadata:{};if(m.listingStatus==='manual')return false;if(positionOwnListing(p)){if(m.listingStatus!=='listed')alphaEngine.updatePositionMetadata(p.id,{listingStatus:'listed',listingRetryAt:0,lastListingError:null});return false;}return Number(m.listingRetryAt||0)<=now;});
}
async function recoverUnlistedPositionsTickImpl(){
  if(!alphaEngine||autoTradingBusy)return;const s=alphaEngine.settings||{};if(s.killSwitch||!s.liveExecutionUnlocked||!['semi','auto'].includes(String(s.executionMode)))return;
  refreshProtocolFromNetwork({recordMarket:false,force:true,all:true});const candidates=uncoveredRealPositions();if(!candidates.length)return;const p=candidates[0],slot=Number(p.slot),meta=p.metadata&&typeof p.metadata==='object'?p.metadata:{},attempts=Math.max(0,Number(meta.listingAttempts)||0),price=Math.max(1,Math.ceil(Number(meta.expectedSale)||Number(p.target)||Number(p.entry)||1)),listing={assetType:p.asset_type,assetId:p.asset_id,name:p.name,currency:p.currency,price:Number(p.entry)||0};
  if(positionOwnListing(p)){alphaEngine.updatePositionMetadata(p.id,{listingStatus:'listed',listingRetryAt:0,lastListingError:null});return;}
  alphaEngine.updatePositionMetadata(p.id,{listingStatus:'recovering',listingAttempts:attempts+1,lastListingAttemptAt:Date.now()});
  try{const outcome=await executeLiveCreate(slot,listing,price,Math.max(1,Number(p.qty)||1),{paired:true,source:'listing-recovery'});await sleep(700);refreshProtocolFromNetwork({recordMarket:false,force:true,slot});const confirmed=positionOwnListing(p);if(outcome?.ok&&confirmed){alphaEngine.updatePositionMetadata(p.id,{listingStatus:'listed',listingAttempts:attempts+1,listingRetryAt:0,lastListingError:null,recoveredAt:Date.now()});alphaEngine.audit('listing-recovery-ok','Anúncio recuperado e confirmado em Meus anúncios',slot,{positionId:p.id,price,listingId:confirmed.listingId||null});return;}const delay=Math.min(120000,5000*(2**Math.min(attempts,5))),error='Anúncio não encontrado em Meus anúncios';alphaEngine.updatePositionMetadata(p.id,{listingStatus:'pending',listingAttempts:attempts+1,listingRetryAt:Date.now()+delay,lastListingError:error});alphaEngine.audit('listing-recovery-wait',error,slot,{positionId:p.id,price,delay,outcome});}catch(error){const delay=Math.min(120000,5000*(2**Math.min(attempts,5)));alphaEngine.updatePositionMetadata(p.id,{listingStatus:'pending',listingAttempts:attempts+1,listingRetryAt:Date.now()+delay,lastListingError:String(error?.message||error)});alphaEngine.audit('listing-recovery-fail','Falha temporária ao recuperar anúncio',slot,{positionId:p.id,delay,error:String(error?.message||error)});}
}
function reconcileRealSalesLegacy(protocols=[]){
  for(const p of protocols)for(const a of p.actions||[]){if(a.action!=='sale'||a.status!=='success'||reconciledSales.has(a.eventKey))continue;reconciledSales.add(a.eventKey);const candidates=alphaEngine.positions(true).filter(x=>x.mode==='real'&&Number(x.slot)===Number(p.slot)&&x.currency===a.currency&&(!a.name||String(a.name).toLowerCase().includes(String(x.name||'').toLowerCase())||String(x.name||'').toLowerCase().includes(String(a.name).toLowerCase())));const pos=candidates[0];if(!pos)continue;const gross=Number(a.data?.gross)||0,net=Number(a.price)||0,exit=gross>0?gross:net,fee=gross>0&&net>=0?Math.max(0,gross-net):null;try{alphaEngine.closePosition(pos.id,exit,fee);alphaEngine.audit('real-sale-reconciled',`Venda real reconciliada: ${pos.name}`,p.slot,{positionId:pos.id,eventKey:a.eventKey,gross,net});}catch{}
  }
}
function refreshProtocolFromNetwork({recordMarket=false,force=false,slot=null,all=false}={}){
  const now=Date.now();if(!force&&now-(Number(refreshProtocolFromNetwork.lastAt)||0)<3500)return latestMarketProtocol;refreshProtocolFromNetwork.lastAt=now;const shouldRecord=recordMarket&&now-(Number(refreshProtocolFromNetwork.lastRecordAt)||0)>=6000;if(shouldRecord)refreshProtocolFromNetwork.lastRecordAt=now;
  const active=ensureMarketActiveSlots(),targets=all?connectedMarketSlots():(slot===null||slot===undefined?active:[Number(slot)]),protocols=[],allListings=[];
  for(const s of targets){const wc=guests.get(s);if(!wc||wc.isDestroyed())continue;const profile=settings.performanceProfile||'balanced',baseWindow=profile==='ultra'?90000:profile==='balanced'?150000:240000,elapsed=protocolCursorAt[s]?Math.max(12000,now-protocolCursorAt[s]+3000):baseWindow,sinceMs=force?baseWindow:Math.min(baseWindow,elapsed),generalLimit=profile==='ultra'?260:profile==='balanced'?390:520,marketLimit=profile==='ultra'?600:profile==='balanced'?800:1000,general=networkInspector.recent(s,{sinceMs,limit:generalLimit,marketOnly:false}),market=networkInspector.recent(s,{sinceMs:Math.min(sinceMs,120000),limit:marketLimit,marketOnly:true}),events=mergeNetworkRows(general.requests,market.requests);if(events.length)protocolCursorAt[s]=Math.max(protocolCursorAt[s]||0,...events.map(x=>Number(x.at)||0));learnMarketReadTemplates(s,market.requests);learnOwnListingRead(s,market.requests);const protocol=analyzeProtocolEvents(events,s);protocols.push(protocol);alphaEngine?.ingestProtocol(protocol);huntEngine.observeTelemetry(s,protocol.hunt);observeHuntIntelligence(s,protocol);for(const l of protocol.listings)allListings.push(l);}
  if(!protocols.length)return latestMarketProtocol;const validation={...mergeValidation(protocols),...ALPHA5_VALIDATION};alphaEngine?.setValidation(validation);const accountMap=new Map((latestMarketProtocol.accounts||[]).map(x=>[Number(x.slot),x]));for(const p of protocols)accountMap.set(Number(p.slot),{slot:p.slot,account:{...(p.account?.id!=null&&accountMap.get(Number(p.slot))?.account?.id!=null&&String(p.account.id)!==String(accountMap.get(Number(p.slot)).account.id)?{}:accountMap.get(Number(p.slot))?.account||{}),...p.account,balanceTimes:{...(accountMap.get(Number(p.slot))?.account?.id!=null&&p.account?.id!=null&&String(p.account.id)!==String(accountMap.get(Number(p.slot)).account.id)?{}:accountMap.get(Number(p.slot))?.account?.balanceTimes||{}),...(p.account?.balanceTimes||{})}},hunt:p.hunt,buyAttempts:p.buyAttempts,warnings:p.warnings,ownListings:p.ownListings||[],actions:(p.actions||[]).slice(-30),summaryRows:p.summaries.length,speciesRows:p.species.length,listingRows:p.listings.length});const activeSet=new Set(active),retained=(latestMarketProtocol.listings||[]).filter(l=>activeSet.has(Number(l.slot))&&now-(Number(l.at)||0)<=90000);const unique=new Map();for(const l of [...retained,...allListings]){if(!activeSet.has(Number(l.slot)))continue;const key=l.listingId?(String(l.slot)+':'+String(l.listingId)):(String(l.slot)+':'+String(l.assetType||'')+':'+String(l.assetId||l.name||'')+':'+String(l.currency||'')+':'+String(l.price||0));const prev=unique.get(key);if(!prev||Number(l.at)>Number(prev.at))unique.set(key,l);}const limit=Math.min(1400,Math.max(350,350*Math.max(1,active.length))),listings=[...unique.values()].sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0)).slice(0,limit),crossMarket=crossMarketPairs(listings);latestMarketProtocol={at:now,validation,accounts:[...accountMap.values()].sort((a,b)=>Number(a.slot)-Number(b.slot)),crossMarket:crossMarket.slice(0,60),listings};markOpenPositionsFromMarket(listings);if(shouldRecord)for(const listing of allListings)alphaEngine.recordMarket(listing);if(shouldRecord&&allListings.length)alphaCoreNotify('ingest',{listings:allListings,settings:alphaEngine?.settings||{},validation,...ownMarketIdentity(),accountSummaries:alphaAccountSummaries()});reconcileRealSales(protocols);return latestMarketProtocol;
}
refreshProtocolFromNetwork.lastAt=0;refreshProtocolFromNetwork.lastRecordAt=0;
const AUTOPILOT_ROUTES=[
  {id:'market',label:'Market/RMT',rx:'^(market|mercado|rmt)$|mercado da comunidade|community market'},
  {id:'items',label:'Itens',rx:'^itens$|^items$|item market'},
  {id:'pokemon',label:'Pokémon',rx:'pok[eé]mon|pokemon'},
  {id:'gems',label:'Gems/Orbs',rx:'gems?|orbs?|diamantes?'},
  {id:'coins',label:'Coins/Gold',rx:'coins?|gold|ouro'},
  {id:'next',label:'Próxima página',rx:'pr[oó]xim|next|^›$|^»$|^>$'}
];
function autoNavScript(route){
  const rx=JSON.stringify(String(route?.rx||''));
  return `(()=>{
    const clean=s=>String(s||'').replace(/\\s+/g,' ').trim();
    const visible=el=>{try{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'}catch{return false}};
    const marketNodes=[...document.querySelectorAll('[id*=market i],[class*=market i],[id*=mercado i],[class*=mercado i],[id*=trade i],[class*=trade i],[id*=auction i],[class*=auction i]')];
    const marketVisible=marketNodes.some(visible);
    const re=new RegExp(${rx},'i'),danger=/compr|buy|vender|sell|cancel|excluir|delete|editar|edit|criar|create|anunciar|confirm|finalizar|checkout/i;
    const nodes=[...document.querySelectorAll('button,a,[role=tab],[role=button],.nav-link,.tab,.btn,[data-tab],[data-page],[aria-label]')].filter(visible);
    const rows=nodes.map(el=>({el,text:clean(el.innerText||el.textContent),meta:clean((el.getAttribute('aria-label')||'')+' '+(el.getAttribute('title')||'')+' '+(el.getAttribute('data-tab')||'')+' '+(el.getAttribute('data-page')||'')+' '+(el.getAttribute('href')||''))}));
    const found=rows.find(x=>{const hay=clean(x.text+' '+x.meta);return hay&&hay.length<180&&!danger.test(hay)&&re.test(hay)});
    if(found){try{found.el.click();return {ok:true,clicked:true,text:found.text||found.meta,marketVisible,url:location.href,title:document.title}}catch(e){return {ok:false,clicked:false,error:String(e&&e.message||e),marketVisible}}}
    return {ok:true,clicked:false,marketVisible,url:location.href,title:document.title,candidates:rows.slice(0,30).map(x=>x.text||x.meta)};
  })()`;
}
function mergeAutopilotListings(rows=[],now=Date.now()){
  if(!rows.length)return;const unique=new Map();
  for(const l of [...(latestMarketProtocol.listings||[]),...rows]){const key=l.listingId?(String(l.slot)+':'+String(l.listingId)):(String(l.slot)+':'+String(l.assetType||'')+':'+String(l.assetId||l.name||'')+':'+String(l.currency||'')+':'+String(l.price||0));const prev=unique.get(key);if(!prev||Number(l.at)>=Number(prev.at))unique.set(key,l);}
  const listings=[...unique.values()].filter(l=>now-(Number(l.at)||0)<=90000).sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0)).slice(0,800);latestMarketProtocol={...latestMarketProtocol,at:now,listings,crossMarket:crossMarketPairs(listings).slice(0,80)};
}
function stopAlphaAnalysisWorker(reason='worker-stop'){
  const err=new Error(String(reason||'worker-stop'));for(const p of alphaAnalysisPending.values()){clearTimeout(p.timer);p.reject(err);}alphaAnalysisPending.clear();const w=alphaAnalysisWorker;alphaAnalysisWorker=null;if(w)try{void w.terminate();}catch{}
}
function ensureAlphaAnalysisWorker(){
  if(alphaAnalysisWorker)return alphaAnalysisWorker;
  const dbPath=path.join(app.getPath('userData'),'gridium-alpha.sqlite'),w=new Worker(path.join(__dirname,'alpha-analysis-worker.js'),{workerData:{dbPath}});alphaAnalysisWorker=w;alphaAnalysisLastError=null;
  w.on('message',msg=>{const p=alphaAnalysisPending.get(Number(msg?.id));if(!p)return;alphaAnalysisPending.delete(Number(msg.id));clearTimeout(p.timer);if(msg?.ok)p.resolve(Array.isArray(msg.results)?msg.results:[]);else p.reject(new Error(String(msg?.error||'Falha no núcleo de análise')));});
  w.on('error',error=>{alphaAnalysisLastError=String(error?.message||error);if(alphaAnalysisWorker===w)stopAlphaAnalysisWorker(alphaAnalysisLastError);});
  w.on('exit',code=>{if(alphaAnalysisWorker===w){alphaAnalysisLastError=code===0?null:'Núcleo de análise encerrou com código '+code;alphaAnalysisWorker=null;}for(const p of alphaAnalysisPending.values()){clearTimeout(p.timer);p.reject(new Error(alphaAnalysisLastError||'Núcleo de análise encerrado'));}alphaAnalysisPending.clear();});
  return w;
}
function evaluateListingsInWorker(listings,strategyId='balanced'){
  const rows=(Array.isArray(listings)?listings:[]).slice(0,240);if(!rows.length)return Promise.resolve([]);let worker;try{worker=ensureAlphaAnalysisWorker();}catch(error){alphaAnalysisLastError=String(error?.message||error);return Promise.reject(error);}const id=++alphaAnalysisSeq,settings={feePct:{...(alphaEngine?.settings?.feePct||{})},strategies:(alphaEngine?.settings?.strategies||[]).map(x=>({...x}))};return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{alphaAnalysisPending.delete(id);reject(new Error('Núcleo de análise excedeu o tempo limite'));},3500);alphaAnalysisPending.set(id,{resolve,reject,timer});worker.postMessage({type:'evaluate',id,listings:rows,settings,strategyId});});
}

function stopAlphaCoreProcess(reason='core-stop'){const err=new Error(String(reason||'core-stop'));for(const p of alphaCorePending.values()){clearTimeout(p.timer);p.reject(err);}alphaCorePending.clear();const c=alphaCoreProcess;alphaCoreProcess=null;alphaCoreLastError=String(reason||'core-stop');if(c)try{c.kill();}catch{}}
function ensureAlphaCoreProcess(){if(alphaCoreProcess&&alphaCoreProcess.connected)return alphaCoreProcess;const dbPath=path.join(app.getPath('userData'),'gridium-alpha-core.sqlite'),c=fork(path.join(__dirname,'alpha-core-process.js'),[],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,env:{...nodeProcess.env,GRIDIUM_CORE_DB:dbPath}});alphaCoreProcess=c;alphaCoreLastError=null;alphaCoreLastAt=Date.now();c.on('message',msg=>{const p=alphaCorePending.get(Number(msg?.id));if(!p)return;alphaCorePending.delete(Number(msg.id));clearTimeout(p.timer);alphaCoreLastAt=Date.now();msg?.ok?p.resolve(msg.result):p.reject(new Error(String(msg?.error||'Falha no processo do Auto Trader')));});c.on('error',e=>{alphaCoreLastError=String(e?.message||e);if(alphaCoreProcess===c)stopAlphaCoreProcess(alphaCoreLastError);});c.on('exit',code=>{if(alphaCoreProcess===c){alphaCoreProcess=null;alphaCoreLastError=code===0?null:'Auto Trader Core encerrou com código '+code;}for(const p of alphaCorePending.values()){clearTimeout(p.timer);p.reject(new Error(alphaCoreLastError||'Auto Trader Core encerrado'));}alphaCorePending.clear();});return c;}
function alphaCoreRequest(type,payload={},timeoutMs=5000){let c;try{c=ensureAlphaCoreProcess();}catch(e){return Promise.reject(e);}const id=++alphaCoreSeq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{alphaCorePending.delete(id);reject(new Error('Auto Trader Core excedeu o tempo limite'));},timeoutMs);alphaCorePending.set(id,{resolve,reject,timer});try{c.send({id,type,payload});}catch(e){clearTimeout(timer);alphaCorePending.delete(id);reject(e);}});}
function alphaCoreNotify(type,payload={}){try{ensureAlphaCoreProcess().send({type,payload});return true;}catch(e){alphaCoreLastError=String(e?.message||e);return false;}}
function ownMarketIdentity(){
  const ownAccounts=(latestMarketProtocol.accounts||[]).map(x=>({slot:Number(x.slot),id:x.account?.id??null,nick:String(x.account?.nick||'').trim()})).filter(x=>x.id!==null||x.nick);
  const ownListingIds=[];for(const rows of alphaEngine?.ownListings||[])for(const x of rows||[]){const id=String(x?.listingId??'');if(id)ownListingIds.push(id);}
  return {ownAccounts,ownListingIds:[...new Set(ownListingIds)]};
}
function isOwnAccountListing(listing){const own=ownMarketIdentity(),lid=String(listing?.listingId??'');if(lid&&own.ownListingIds.includes(lid))return true;const sid=String(listing?.sellerId??'');if(sid&&own.ownAccounts.some(a=>String(a.id??'')===sid))return true;const seller=String(listing?.seller||'').trim().toLocaleLowerCase('pt-BR');return !!seller&&own.ownAccounts.some(a=>String(a.nick||'').trim().toLocaleLowerCase('pt-BR')===seller);}
function alphaAccountStrategy(slot){const p=alphaEngine?.settings?.accountProfiles?.[Number(slot)]||{};return ['conservative','balanced','aggressive','bootstrap'].includes(p.strategy)?p.strategy:'balanced';}
function setAutopilotRecovering(reason){if(alphaEngine){if(alphaEngine.settings.killSwitch!==true)alphaEngine.kill(true);if(alphaEngine.settings.liveExecutionUnlocked===true)alphaEngine.unlockLive(false);}autopilotStatus={...autopilotStatus,enabled:true,state:'recovering',lastAt:Date.now(),lastAction:reason,lastError:reason,route:'reiniciando Auto Trader Core'};}
function alphaAccountSummaries(){return {gems:Array.from({length:4},(_,slot)=>alphaEngine?.accountSummary(slot,'gems')||null).filter(Boolean),coins:Array.from({length:4},(_,slot)=>alphaEngine?.accountSummary(slot,'coins')||null).filter(Boolean)};}
function markOpenPositionsFromMarket(listings=[]){if(!alphaEngine)return 0;let changed=0;for(const p of alphaEngine.positions(true)){const prices=listings.filter(x=>Number(x.slot)===Number(p.slot)&&x.assetType===p.asset_type&&String(x.assetId??'')===String(p.asset_id??'')&&x.currency===p.currency&&!isOwnAccountListing(x)).map(x=>Number(x.price)).filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);if(!prices.length)continue;const sample=prices.slice(0,3),mark=sample[Math.floor((sample.length-1)/2)];if(mark>0&&Math.abs(mark-(Number(p.mark)||0))>=1){alphaEngine.markPosition(p.id,mark);changed++;}}return changed;}
async function autoTradeSlot(slot,safety){
  const rows=(latestMarketProtocol.listings||[]).filter(x=>Number(x.slot)===slot);let plan;try{plan=await alphaCoreRequest('plan',{slot,listings:rows,ownListings:alphaEngine.ownListings?.[slot]||[],settings:alphaEngine.settings,validation:alphaEngine.view().validation,strategyId:alphaAccountStrategy(slot),freshMs:Math.max(2000,Number(safety.freshListingMs)||10000),consumed:[...autoConsumedListings.entries()],connectedSlots:connectedMarketSlots(),preferredListingId:priorityRouteActive?.targetSlot===slot?priorityRouteActive.listingId:null,...ownMarketIdentity(),accountSummaries:alphaAccountSummaries(),openPositions:alphaEngine.positions(true),now:Date.now()});alphaCoreLastError=null;}catch(e){throw Object.assign(new Error(String(e?.message||e)),{coreFailure:true});}
  let observed=Number(plan?.observed)||0,fresh=Number(plan?.fresh)||0,eligible=Number(plan?.eligible)||0,riskApproved=Number(plan?.riskApproved)||0,lastReason='C'+(slot+1)+': nenhuma oportunidade aprovada',action=null,lastListing=null;autoTraderStatus={...autoTraderStatus,accountGuards:plan?.accountGuards||autoTraderStatus.accountGuards||[],selfListingsBlocked:(Number(autoTraderStatus.selfListingsBlocked)||0)+(Number(plan?.selfListingsBlocked)||0),priorityRoute:priorityRouteView()};
  if(priorityRouteActive&&slot===priorityRouteActive.targetSlot){priorityRouteActive.attempts++;if(Date.now()-priorityRouteActive.startedAt>PRIORITY_ROUTE_TTL_MS||priorityRouteActive.attempts>4){finishPriorityRoute('Prioridade expirou; grupo anterior restaurado');return {slot,observed,fresh,eligible,riskApproved,lastReason:'Prioridade expirou'};}await probePriorityRoute(priorityRouteActive);refreshProtocolFromNetwork({recordMarket:true,force:true,slot});}
  if(safety.autoRepricing!==false&&plan?.repricing?.canEdit)try{await executeLiveReprice({slot,listingId:plan.repricing.listingId,price:plan.repricing.suggested,source:'auto'});action='C'+(slot+1)+' repricing';}catch(e){lastReason='C'+(slot+1)+' repricing ignorado: '+String(e?.message||e);}
  let candidates=Array.isArray(plan?.candidates)?plan.candidates:[];if(priorityRouteActive&&slot===priorityRouteActive.targetSlot)candidates=candidates.filter(x=>String(x.listingId)===String(priorityRouteActive.listingId));for(const c of candidates)if(Number(c.executeSlot)!==slot)enqueuePriorityRoute(c,slot);candidates=candidates.filter(x=>Number(x.executeSlot)===slot||!Number.isInteger(Number(x.executeSlot)));
  if(!fresh&&observed)lastReason='C'+(slot+1)+': anúncios lidos, nenhum fresco';else if(fresh&&!candidates.length&&plan?.bestRejected){const e=plan.bestRejected.evaluation||{};lastReason='C'+(slot+1)+': '+(e.reason||'Risco ou margem insuficiente');}alphaEngine.decision(slot,lastReason,{observed,fresh,eligible,riskApproved});
  for(const c of candidates){try{if(isOwnAccountListing(c)){lastReason='C'+(slot+1)+': anúncio próprio ignorado';continue;}const rate=liveRateCheck(slot);if(!rate.ok){lastReason='C'+(slot+1)+': '+rate.reason;break;}const candidateStrategy=String(c.strategyId||alphaAccountStrategy(slot));liveRisk(slot,c,candidateStrategy);lastListing={slot,name:c.name||'',listingId:c.listingId,price:c.price,currency:c.currency,alphaScore:c.evaluation?.alphaScore,roi:c.evaluation?.roi,strategy:candidateStrategy,spendMode:c.spendMode||''};autoTraderStatus={...autoTraderStatus,running:true,lastReason:'Executando C'+(slot+1)+' · '+candidateStrategy,lastListing};publish();const result=await executeLiveBuy({slot,listing:c,evaluation:c.evaluation,strategy:candidateStrategy,source:'auto',autoSell:safety.autoSellAfterBuy!==false});const resaleProblem=result?.resalePending===true;if(resaleProblem){lastReason=result?.outcome?.locked===true?'C'+(slot+1)+': compra confirmada; revenda aguardando desbloqueio':'C'+(slot+1)+': compra confirmada; recuperador cuidará do anúncio';action='Compra confirmada C'+(slot+1)+' · anúncio pendente';}if(result?.ok)autoOrderFailures=0;else autoOrderFailures++;const routed=priorityRouteActive&&priorityRouteActive.targetSlot===slot;if(routed)finishPriorityRoute(result?.ok?'Prioridade resolvida; grupo restaurado':'Prioridade sem confirmação; grupo restaurado');if(!resaleProblem){action=result?.ok?'Compra confirmada C'+(slot+1):'Compra aguardando confirmação C'+(slot+1);lastReason=result?.ok?'C'+(slot+1)+': compra concluída e anúncio processado':'C'+(slot+1)+': aguardando resposta real do servidor';}alphaEngine.decision(slot,lastReason,{name:c.name,observed,fresh,eligible,riskApproved});return {slot,observed,fresh,eligible,riskApproved,lastReason,action,lastListing};}catch(e){lastReason='C'+(slot+1)+': '+String(e?.message||e);alphaEngine.decision(slot,lastReason,{name:c.name,observed,fresh,eligible,riskApproved});}}
  if(priorityRouteActive&&slot===priorityRouteActive.targetSlot&&candidates.length===0&&priorityRouteActive.attempts>=3)finishPriorityRoute('Oportunidade prioritária sumiu; grupo restaurado');return {slot,observed,fresh,eligible,riskApproved,lastReason,action,lastListing};
}
async function autoTradingProcessTick(){const now=Date.now(),s=alphaEngine?.settings||{},mode=String(s.executionMode||'paper'),live=s.liveExecutionUnlocked===true,kill=s.killSwitch===true,slots=ensureMarketActiveSlots();autoTraderStatus={...autoTraderStatus,lastAt:now,mode,live,kill,activeSlot:slots[0]??null,activeSlots:[...slots],lastError:null};const halt=r=>{autoTraderStatus={...autoTraderStatus,running:false,lastReason:r,observed:(latestMarketProtocol.listings||[]).length,fresh:0,eligible:0,riskApproved:0};publish();};if(autoTradingBusy){halt('Ciclo anterior ainda em andamento');return;}if(!alphaEngine){halt('Motor Alpha indisponível');return;}if(!slots.length){halt('Aguardando conta ativa');return;}if(mode!=='auto'){halt('Selecione o modo Auto');return;}if(!live){halt(autopilotStatus.enabled===true?'LIVE aguardando liberação automática':'LIVE bloqueado');return;}if(kill){halt('Kill Switch ativo');return;}autoTradingBusy=true;autoTraderStatus={...autoTraderStatus,running:true,lastReason:'Auto Trader analisando '+slots.map(x=>'C'+(x+1)).join(' + ')+'…',selfListingsBlocked:0};publish();try{refreshProtocolFromNetwork({recordMarket:true});const safety=alphaEngine.settings.liveSafety||{},ordered=priorityRouteActive&&slots.includes(priorityRouteActive.targetSlot)?[priorityRouteActive.targetSlot,...slots.filter(x=>x!==priorityRouteActive.targetSlot)]:slots,results=[];for(const slot of ordered){const result=await autoTradeSlot(slot,safety);results.push(result);if(result?.fatal){setAutopilotSafeStop(result.lastReason);autoTraderStatus={...autoTraderStatus,running:false,lastReason:result.lastReason,lastError:result.lastReason};publish();return;}}if(!priorityRouteActive&&priorityRouteQueue.length)startNextPriorityRoute();const totals=results.reduce((a,x)=>({observed:a.observed+(x.observed||0),fresh:a.fresh+(x.fresh||0),eligible:a.eligible+(x.eligible||0),riskApproved:a.riskApproved+(x.riskApproved||0)}),{observed:0,fresh:0,eligible:0,riskApproved:0}),actions=results.map(x=>x.action).filter(Boolean),reasons=results.map(x=>x.lastReason).filter(Boolean);autoTraderStatus={...autoTraderStatus,running:false,...totals,activeSlots:[...ensureMarketActiveSlots()],lastAction:actions.join(' · ')||autoTraderStatus.lastAction,lastReason:reasons.join(' | ').slice(0,900)||'Nenhuma oportunidade',lastListing:results.map(x=>x.lastListing).filter(Boolean).at(-1)||autoTraderStatus.lastListing,priorityRoute:priorityRouteView(),lastAt:Date.now()};}catch(e){if(e?.coreFailure){alphaCoreLastError=String(e?.message||e);setAutopilotRecovering('Processo separado do Auto Trader reiniciando');stopAlphaCoreProcess(alphaCoreLastError);try{ensureAlphaCoreProcess();alphaCoreLastError=null;}catch(restartError){alphaCoreLastError=String(restartError?.message||restartError);}}autoTraderStatus={...autoTraderStatus,running:false,lastError:String(e?.message||e),lastReason:e?.coreFailure?'Core reiniciando; LIVE temporariamente bloqueado':'Erro no Auto Trader multi-conta',lastAt:Date.now()};}finally{autoTradingBusy=false;publish();}}


function smartBankrolls({force=false}={}){
  const current=alphaEngine?.settings?.bankrolls||Array.from({length:4},()=>({gems:0,coins:0})),profiles=alphaEngine?.settings?.accountProfiles||[],banks=Array.from({length:4},(_,slot)=>({gems:Number(current?.[slot]?.gems)||0,coins:Number(current?.[slot]?.coins)||0}));let changed=false;
  for(let slot=0;slot<4;slot++){const a=protocolAccount(slot)||{},gold=a.gold==null?NaN:Number(a.gold),gems=a.gems==null?NaN:Number(a.gems),profile=profiles[slot]||{},empty=!(Number(banks[slot].coins)>0)&&!(Number(banks[slot].gems)>0),auto=profile.bankrollMode==='auto'||empty;if(!auto)continue;if(gold>=0&&!(Number(banks[slot].coins)>0)){const next=gold>0?Math.min(gold,5000000,Math.floor(gold*.10)):0;if(next!==banks[slot].coins){banks[slot].coins=next;changed=true;}}if(gems>=0&&!(Number(banks[slot].gems)>0)){const next=gems>0?Math.min(gems,20,Math.floor(gems*.10)||1):0;if(next!==banks[slot].gems){banks[slot].gems=next;changed=true;}}}
  if(changed)alphaEngine.configure({bankrolls:banks.map(x=>({...x}))});autopilotStatus.bankrolls=banks.map(x=>({...x}));return banks;
}
async function autoNavigateMarketTick(){if(autoNavigatorBusy||!alphaEngine||autopilotStatus.enabled!==true)return;const s=alphaEngine.settings||{};if(s.executionMode!=='auto')return;const slots=ensureMarketActiveSlots();if(!slots.length)return;autoNavigatorBusy=true;try{for(const slot of slots){const wc=guests.get(slot);if(!wc||wc.isDestroyed())continue;await discoverMarketCatalogDom(slot,wc);const st=autoNavState[slot];st.lastAt=Date.now();st.lastAction='Scanner global passivo · sem trocar sua tela';}smartBankrolls();autopilotStatus={...autopilotStatus,state:s.liveExecutionUnlocked===true&&s.killSwitch!==true?'scanning':'warming',lastAt:Date.now(),slot:slots[0]??null,activeSlots:[...slots],route:'Scanner global passivo',lastAction:'Lendo '+slots.map(x=>'C'+(x+1)).join(' + ')+' sem navegar nas abas',accountsReady:slots.length,lastError:null};publish();}catch(error){autopilotStatus={...autopilotStatus,state:'recovering',lastAt:Date.now(),lastError:String(error?.message||error)};publish();}finally{autoNavigatorBusy=false;}}


async function autoMarketInspectionTick(){if(autoInspectorBusy||!alphaEngine)return;autoInspectorBusy=true;autoInspectorStatus={...autoInspectorStatus,enabled:true,running:true};const now=Date.now();try{const slots=ensureMarketActiveSlots();refreshProtocolFromNetwork({recordMarket:true});const probeResults=[];for(const slot of slots){const r=await sendPassiveMarketProbe(slot);probeResults.push({slot,...r});if(r?.ok)await sleep(70);}refreshProtocolFromNetwork({recordMarket:true,force:true});let domListings=0,marketVisible=0,domError=null;const domDue=now-(Number(autoInspectorStatus.lastDomAt)||0)>=60000;if(domDue){for(const slot of slots){const usable=(latestMarketProtocol.listings||[]).some(l=>Number(l.slot)===slot&&now-(Number(l.at)||0)<=45000&&Number(l.listingId)>0&&['item','pokemon'].includes(l.assetType));if(usable)continue;const wc=guests.get(slot);try{const scan=await wc.executeJavaScript(MARKET_DISCOVERY_SCRIPT,true);if(scan?.marketVisible)marketVisible++;const rows=normalizeListings(scan,slot)||[];domListings+=rows.length;for(const l of rows)alphaEngine.recordMarket(l);if(rows.length)mergeAutopilotListings(rows);}catch(error){domError=String(error?.message||error);}}autoInspectorStatus.lastDomAt=now;}const health=marketRuntimeHealth(),catalog=marketCatalogSummary(),failed=probeResults.find(x=>x.ok!==true);autoInspectorStatus={enabled:true,running:false,lastAt:Date.now(),lastDomAt:autoInspectorStatus.lastDomAt,lastError:domError,activeSlot:slots[0]??null,activeSlots:[...slots],concurrency:configuredMarketConcurrency(),targetCount:health.targetCount,accounts:(latestMarketProtocol.accounts||[]).length,listings:(latestMarketProtocol.listings||[]).length,crossMarket:(latestMarketProtocol.crossMarket||[]).length,domListings,marketVisible,networkAttached:health.attached,bridgeInstalled:health.bridges,socketReady:health.sockets,marketRx:health.marketRx,marketTx:health.marketTx,summaryRows:health.summaryRows,listingRows:health.listingRows,usableListings:health.usable,lastMarketRxAt:health.lastMarketRxAt,probeOk:probeResults.length>0&&!failed,probeError:failed?String(failed.reason||'probe-failed'):null,probeResults,catalog,health};if(autopilotStatus.enabled===true)maybeArmAutopilot();ensureMarketActiveSlots();publish();}catch(error){autoInspectorStatus={...autoInspectorStatus,enabled:true,running:false,lastAt:Date.now(),lastError:String((error&&error.message)||error)};if(autopilotStatus.enabled===true){if(alphaEngine.settings.killSwitch!==true)alphaEngine.kill(true);if(alphaEngine.settings.liveExecutionUnlocked===true)alphaEngine.unlockLive(false);autopilotStatus={...autopilotStatus,state:'degraded',lastAt:Date.now(),lastAction:'Scanner global falhou; LIVE bloqueado temporariamente',lastError:autoInspectorStatus.lastError};}publish();}finally{autoInspectorBusy=false;}}

async function autoTradingTick(){return autoTradingProcessTick();
  const now=Date.now(),s=alphaEngine?.settings||{},mode=String(s.executionMode||'paper'),live=s.liveExecutionUnlocked===true,kill=s.killSwitch===true,slot=ensureMarketFocus();autoTraderStatus={...autoTraderStatus,lastAt:now,mode,live,kill,activeSlot:slot,lastError:null};const halt=reason=>{autoTraderStatus={...autoTraderStatus,running:false,lastReason:reason,observed:(latestMarketProtocol.listings||[]).length,fresh:0,eligible:0,riskApproved:0};publish();};if(autoTradingBusy){halt('Ciclo anterior ainda em andamento');return;}if(!alphaEngine){halt('Motor Alpha indisponível');return;}if(slot===null){halt('Aguardando conta ativa');return;}if(mode!=='auto'){halt('Selecione o modo Auto');return;}if(!live){halt(autopilotStatus.enabled===true?'LIVE aguardando liberação automática':'LIVE bloqueado');return;}if(kill){halt('Kill Switch ativo');return;}
  autoTradingBusy=true;autoTraderStatus={...autoTraderStatus,running:true,lastReason:'Analisando apenas a Conta '+(slot+1)+'…'};publish();try{refreshProtocolFromNetwork({recordMarket:true,slot});const safety=alphaEngine.settings.liveSafety||{};if(safety.autoRepricing!==false){for(const own of alphaEngine.ownListings?.[slot]||[]){const preview=alphaEngine.repricingPreview(slot,own,latestMarketProtocol.listings||[]);if(!preview.canEdit)continue;try{await executeLiveReprice({slot,listing:own,price:preview.suggested,source:'auto'});autoTraderStatus={...autoTraderStatus,lastAction:'Repricing automático confirmado na Conta '+(slot+1)};}catch(error){autoTraderStatus={...autoTraderStatus,lastReason:'Repricing ignorado: '+String(error?.message||error)};}break;}}
    const checkAt=Date.now(),freshMs=Math.max(2000,Number(safety.freshListingMs)||10000),rows=(latestMarketProtocol.listings||[]).filter(x=>Number(x.slot)===slot);let observed=rows.length,fresh=0,eligible=0,riskApproved=0,lastReason='Nenhuma oportunidade aprovada na Conta '+(slot+1);const usable=rows.filter(x=>checkAt-(Number(x.at)||0)<=freshMs&&['item','pokemon'].includes(x.assetType)&&Number.isInteger(Number(x.listingId))&&Number(x.listingId)>0&&checkAt-(autoConsumedListings.get(String(slot)+':'+String(x.listingId))||0)>1800000);fresh=usable.length;let evaluated=[];try{evaluated=await evaluateListingsInWorker(usable,'balanced');alphaAnalysisLastError=null;}catch(error){alphaAnalysisLastError=String(error?.message||error);lastReason='Núcleo separado de análise indisponível; nenhuma compra será feita neste ciclo';stopAlphaAnalysisWorker(alphaAnalysisLastError);evaluated=[];}const candidates=evaluated.filter(x=>x.evaluation?.eligible).sort((a,b)=>(b.evaluation.alphaScore||0)-(a.evaluation.alphaScore||0));eligible=candidates.length;if(!usable.length&&rows.length)lastReason='Anúncios lidos, mas nenhum está fresco/normalizado';else if(usable.length&&!candidates.length){const best=evaluated.sort((a,b)=>(b.evaluation?.alphaScore||0)-(a.evaluation?.alphaScore||0))[0];if(best)lastReason='Melhor rejeitado: score '+(best.evaluation?.alphaScore||0)+', ROI '+(best.evaluation?.roi||0)+'%, confiança '+Math.round((best.evaluation?.confidence||0)*100)+'%';}
    for(const c of candidates){try{const rate=liveRateCheck(slot);if(!rate.ok){lastReason=rate.reason;break;}const risk=alphaEngine.canExecute(c,slot,'balanced');if(!risk.ok){lastReason=risk.reason;continue;}riskApproved++;autoTraderStatus={...autoTraderStatus,running:true,observed,fresh,eligible,riskApproved,lastReason:'Executando oportunidade na Conta '+(slot+1),lastListing:{slot,name:c.name||'',listingId:c.listingId,price:c.price,currency:c.currency,alphaScore:c.evaluation?.alphaScore,roi:c.evaluation?.roi}};publish();const result=await executeLiveBuy({slot,listing:c,strategy:'balanced',source:'auto',autoSell:safety.autoSellAfterBuy!==false});const resaleProblem=result?.ok&&safety.autoSellAfterBuy!==false&&(result?.outcome?.locked===true||result?.sell?.ok===false);if(resaleProblem){autoTraderStatus={...autoTraderStatus,running:false,lastAction:'Compra concluída; revenda automática não ficou segura',lastReason:result?.outcome?.locked===true?'Ativo comprado está travado para revenda':'Falha ao criar o anúncio automático',observed,fresh,eligible,riskApproved,lastAt:Date.now()};setAutopilotSafeStop(autoTraderStatus.lastReason);publish();return;}if(result?.ok)autoOrderFailures=0;else autoOrderFailures++;autoTraderStatus={...autoTraderStatus,running:false,lastAction:result?.ok?'Compra automática confirmada na Conta '+(slot+1):'Compra automática não confirmada',lastReason:result?.ok?'Ordem executada com sucesso':'Servidor não confirmou a compra',observed,fresh,eligible,riskApproved,lastAt:Date.now()};autopilotStatus={...autopilotStatus,failures:autoOrderFailures,lastAt:Date.now(),lastAction:autoTraderStatus.lastAction};if(autoOrderFailures>=3){alphaEngine.kill(true);alphaEngine.unlockLive(false);autopilotStatus={...autopilotStatus,enabled:false,state:'fault',lastAction:'Autopilot interrompido após 3 falhas de ordem',lastError:'Proteção automática acionada'};}publish();return;}catch(error){lastReason=String(error?.message||error);autoOrderFailures++;autopilotStatus={...autopilotStatus,failures:autoOrderFailures,lastError:lastReason,lastAt:Date.now()};alphaEngine.audit('auto-skip','Auto ignorou oportunidade',slot,{listingId:c.listingId,reason:lastReason});if(autoOrderFailures>=3){alphaEngine.kill(true);alphaEngine.unlockLive(false);autopilotStatus={...autopilotStatus,enabled:false,state:'fault',lastAction:'Autopilot interrompido após 3 falhas de ordem',lastError:lastReason};publish();return;}}}
    autoTraderStatus={...autoTraderStatus,running:false,observed,fresh,eligible,riskApproved,lastReason,lastAt:Date.now()};
  }catch(error){autoTraderStatus={...autoTraderStatus,running:false,lastError:String(error?.message||error),lastReason:'Erro no ciclo automático focado',lastAt:Date.now()};}finally{autoTradingBusy=false;publish();}
}

function installHandlers(){
  handler('grid:state',()=>snapshot());
  handler('grid:settings',patch=>{
    if(patch&&typeof patch==='object'){
      if(['off','system','display'].includes(patch.power))settings.power=patch.power;
      for(const k of ['background','mute','autoReconnect','liveEcoMode'])if(typeof patch[k]==='boolean')settings[k]=patch[k];
      if(PERFORMANCE_PROFILES.has(String(patch.performanceProfile)))settings.performanceProfile=String(patch.performanceProfile);
      if(patch.alerts&&typeof patch.alerts==='object'){
        for(const k of ['desktop','shiny','inactivity','connection'])if(typeof patch.alerts[k]==='boolean')settings.alerts[k]=patch.alerts[k];
        if(patch.alerts.idleMinutes!==undefined)settings.alerts.idleMinutes=clamp(patch.alerts.idleMinutes,1,120)||5;
      }
    }
    applySettings();persist();publish();return snapshot();
  });
  handler('grid:performance-view',view=>{if(view&&typeof view==='object'){const section=['games','dashboard','hunt','alpha'].includes(String(view.section))?String(view.section):performanceView.section,layout=['grid','duo','focus'].includes(String(view.layout))?String(view.layout):performanceView.layout,focusedSlot=Math.max(0,Math.min(3,Math.round(Number(view.focusedSlot)||0))),visibleSlots=[...new Set((Array.isArray(view.visibleSlots)?view.visibleSlots:[]).map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<4))];performanceView={section,layout,focusedSlot,visibleSlots};for(const [slot,wc] of guests)void applyGuestPerformance(slot,wc);}return {profile:settings.performanceProfile,...performanceView,visibleSlots:[...performanceView.visibleSlots]};});
  handler('grid:goals',(scope,values)=>{scope=String(scope);if(!['all','0','1','2','3'].includes(scope))throw new Error('Escopo inválido');for(const k of Object.keys(emptyGoals()))if(values?.[k]!==undefined)settings.goals[scope][k]=clamp(values[k],0,1e15);persist();publish();return snapshot();});
  handler('grid:stock',(slot,values)=>{if(!Number.isInteger(slot)||slot<0||slot>3)throw new Error('Conta inválida');const r=stats.view().rows[slot]?.record;const stock=emptyStock();for(const k of ['bolas','pocoes','revives']){const v=Number(values?.[k]);stock.initial[k]=Number.isFinite(v)&&v>=0?v:null;stock.usedAt[k]=Number(r?.values?.[k])||0;}stock.setAt=Date.now();settings.stocks[slot]=stock;persist();publish();return snapshot();});
  handler('grid:zoom',(slot,value)=>{if(!Number.isInteger(slot)||slot<0||slot>3)throw new Error('Conta inválida');settings.zoom[slot]=clamp(value,.5,1.5)||1;const wc=guests.get(slot);if(wc&&!wc.isDestroyed()&&typeof wc.setZoomFactor==='function')try{wc.setZoomFactor(settings.zoom[slot]);}catch{}persist();publish();return settings.zoom[slot];});
  handler('grid:remote',patch=>{
    if(patch&&typeof patch==='object'){
      if(typeof patch.enabled==='boolean')settings.remote.enabled=patch.enabled;
      if(typeof patch.endpoint==='string')settings.remote.endpoint=patch.endpoint.trim().slice(0,500).replace(/\/+$/,'');
      if(typeof patch.token==='string'&&patch.token.length)settings.remote.token=patch.token.trim().slice(0,500);
      if(patch.clearToken===true)settings.remote.token='';
    }
    persist();publish();return snapshot();
  });
  handler('grid:pair',async()=>{settings.remote.enabled=true;persist();const result=await remoteSync.createPairCode(settings.remote);publish();return result;});
  handler('grid:reconnect',()=>{const now=Date.now();for(const slot of guests.keys())scheduleReconnect(slot,'Reconexão manual',now,true);autoReconnectTick(now);publish();return snapshot();});
  handler('grid:analytics',query=>{const range=clamp(query?.rangeMs||6*3600000,3600000,8*24*3600000);const scope=query?.scope==='all'?'all':String(clamp(query?.scope,0,3));return stats.analytics(scope,Date.now()-range,700);});
  handler('grid:events',limit=>stats.recentEvents(clamp(limit||100,1,500)));
  handler('grid:sessions',limit=>stats.sessionHistory(clamp(limit||100,1,200)));
  handler('grid:pause',value=>{stats.pause(value===true);persist();publish();return snapshot();});
  handler('grid:reset',slot=>{if(slot!==null&&(!Number.isInteger(slot)||slot<0||slot>3))throw new Error('Conta inválida');stats.reset(slot);historyDirty=true;persist();publish();return snapshot();});
  handler('grid:minimize',()=>win.minimize());
  handler('grid:browser',()=>shell.openExternal('https://pokeidle.io/'));
  handler('grid:export',async()=>{
    const result=await dialog.showSaveDialog(win,{title:'Exportar estatísticas',defaultPath:'PokeIdle-estatisticas.csv',filters:[{name:'CSV',extensions:['csv']}]});
    if(result.canceled||!result.filePath)return false;
    const quote=x=>'"'+String(x).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
    const head=['Conta','Treinador','Inicio','Tempo registrado (segundos)',...FIELDS];
    const rows=Object.values(stats.records).map(r=>[r.slot+1,r.nick,new Date(r.since).toISOString(),Math.round(r.ms/1000),...FIELDS.map(k=>r.values[k])]);
    fs.writeFileSync(result.filePath,'\ufeff'+[head,...rows].map(row=>row.map(quote).join(';')).join('\r\n'),'utf8');return true;
  });
  handler('grid:alpha-state',()=>alphaEngine?{...alphaEngine.view(),audit:alphaEngine.recentAudit(120)}:null);
  handler('grid:alpha-config',patch=>{if(!alphaEngine)throw new Error('Alpha indisponível');const result=alphaEngine.configure(patch||{});if(patch&&patch.marketConcurrency!==undefined){marketRotationCursor=0;ensureMarketActiveSlots({force:true});void autoMarketInspectionTick();publish();}return result;});
  handler('grid:alpha-bankroll',(slot,currency,amount)=>{if(!alphaEngine)throw new Error('Alpha indisponível');return alphaEngine.setBankroll(Number(slot),String(currency),Number(amount));});
  handler('grid:alpha-kill',on=>{if(!alphaEngine)throw new Error('Alpha indisponível');const kill=on!==false;if(kill&&autopilotStatus.enabled){priorityRouteQueue=[];priorityRouteActive=null;autopilotStatus={...autopilotStatus,enabled:false,state:'stopped',lastAt:Date.now(),lastAction:'Parado pelo Kill Switch'};}return alphaEngine.kill(kill);});
  handler('grid:alpha-strategy',strategy=>{if(!alphaEngine)throw new Error('Alpha indisponível');return alphaEngine.upsertStrategy(strategy);});
  handler('grid:alpha-evaluate',(listing,strategy)=>{if(!alphaEngine)throw new Error('Alpha indisponível');return alphaEngine.evaluate(listing||{},strategy||'balanced');});
  handler('grid:alpha-paper-open',input=>{if(!alphaEngine)throw new Error('Alpha indisponível');const id=alphaEngine.openPosition({...input,mode:'paper'});return {id,...alphaEngine.view()};});
  handler('grid:alpha-paper-close',(id,exit)=>{if(!alphaEngine)throw new Error('Alpha indisponível');if(alphaEngine.positions(true).find(x=>x.id===String(id))?.mode!=='paper')throw new Error('Posição real só pode ser fechada por confirmação do servidor');const result=alphaEngine.closePosition(String(id),Number(exit));return {result,...alphaEngine.view()};});
  handler('grid:alpha-market-desk',async()=>{if(!alphaEngine)throw new Error('Alpha indisponível');refreshProtocolFromNetwork({recordMarket:false});const listings=(latestMarketProtocol.listings||[]).slice(0,240);let opportunities=[];try{opportunities=(await evaluateListingsInWorker(listings,'balanced')).sort((a,b)=>(b.evaluation?.alphaScore||0)-(a.evaluation?.alphaScore||0)).slice(0,80);alphaAnalysisLastError=null;}catch(error){alphaAnalysisLastError=String(error?.message||error);stopAlphaAnalysisWorker(alphaAnalysisLastError);}const repricing=[];for(let slot=0;slot<4;slot++)for(const own of alphaEngine.ownListings?.[slot]||[])repricing.push(alphaEngine.repricingPreview(slot,own,listings));return {at:Date.now(),opportunities,repricing,ownListings:alphaEngine.ownListings,marketActions:alphaEngine.recentMarketActions(120),validation:alphaEngine.view().validation,analysisCore:{threaded:true,online:alphaAnalysisWorker!==null,pending:alphaAnalysisPending.size,lastError:alphaAnalysisLastError}};});
  handler('grid:alpha-repricing-preview',(slot,listing)=>{if(!alphaEngine)throw new Error('Alpha indisponível');return alphaEngine.repricingPreview(Number(slot),listing||{},latestMarketProtocol.listings||[]);});
  handler('grid:alpha-approval',(input)=>{if(!alphaEngine)throw new Error('Alpha indisponível');const slot=Number(input?.slot),listing=input?.listing||{},strategy=String(input?.strategy||'balanced'),risk=alphaEngine.canExecute(listing,slot,strategy);alphaEngine.audit('approval-preview',risk.ok?'Operação real aprovada pelas regras de risco':'Operação rejeitada pelas regras',slot,{listingId:listing.listingId||'',price:listing.price,currency:listing.currency,strategy,risk});return {risk,liveExecutionUnlocked:alphaEngine.settings.liveExecutionUnlocked===true,executionMode:alphaEngine.settings.executionMode,killSwitch:alphaEngine.settings.killSwitch===true};});
  handler('grid:alpha-live-unlock',(on,phrase='')=>{if(!alphaEngine)throw new Error('Alpha indisponível');on=on===true;if(on){if(!liveValidationReady())throw new Error('Protocolo real ainda não está totalmente validado');if(String(phrase).trim().toUpperCase()!=='ATIVAR LIVE')throw new Error('Confirmação LIVE inválida');}return alphaEngine.unlockLive(on);});
  handler('grid:alpha-autopilot',on=>{if(!alphaEngine)throw new Error('Alpha indisponível');on=on===true;if(on){marketRotationCursor=0;setMarketActiveSlots(connectedMarketSlots().slice(0,configuredMarketConcurrency()),'Automático iniciado');refreshProtocolFromNetwork({recordMarket:true,force:true});const banks=smartBankrolls({force:true}),s=alphaEngine.settings||{},liveSafety={...(s.liveSafety||{}),freshListingMs:45000,autoSellAfterBuy:true,autoRepricing:true};alphaEngine.configure({executionMode:'auto',bankrolls:banks,liveSafety});alphaEngine.kill(true);alphaEngine.unlockLive(false);autoOrderFailures=0;priorityRouteQueue=[];priorityRouteActive=null;autopilotStatus={...autopilotStatus,enabled:true,state:'warming',lastAt:Date.now(),lastAction:'Checando feed real do Market antes de liberar LIVE',lastError:null,failures:0,bankrolls:banks,route:'probe WebSocket seguro'};alphaEngine.audit('autopilot-start','Alpha 9.8 Autopilot iniciou; book atual, margem líquida e circuit breaker ativos',null,{smartBankroll:true,globalMarketScanner:true,passiveProbe:true,autoSell:true,autoRepricing:true,failClosed:true,marketConcurrency:configuredMarketConcurrency()});void autoMarketInspectionTick();}else{alphaEngine.kill(true);alphaEngine.unlockLive(false);alphaEngine.configure({executionMode:'paper'});autopilotStatus={...autopilotStatus,enabled:false,state:'stopped',lastAt:Date.now(),lastAction:'Autopilot parado; LIVE bloqueado',slot:null,route:'',lastError:null};alphaEngine.audit('autopilot-stop','Alpha 9.8 Autopilot parado');clearMarketFocus();}publish();return snapshot();});
  handler('grid:alpha-live-buy',async input=>{if(!alphaEngine)throw new Error('Alpha indisponível');const result=await executeLiveBuy({...input,source:'manual',autoSell:input?.autoSell===true});refreshProtocolFromNetwork({recordMarket:true});return {result,...alphaEngine.view(),audit:alphaEngine.recentAudit(120)};});
  handler('grid:alpha-live-reprice',async input=>{if(!alphaEngine)throw new Error('Alpha indisponível');const result=await executeLiveReprice({...input,source:'manual'});refreshProtocolFromNetwork({recordMarket:true});return {result,...alphaEngine.view(),audit:alphaEngine.recentAudit(120)};});
  handler('grid:alpha-live-cancel',async input=>{if(!alphaEngine)throw new Error('Alpha indisponível');const result=await executeLiveCancel(input||{});refreshProtocolFromNetwork({recordMarket:true});return {result,...alphaEngine.view(),audit:alphaEngine.recentAudit(120)};});
  handler('grid:market-scan',async()=>{
    if(!alphaEngine)throw new Error('Alpha indisponível');const scans=[],allListings=[],protocols=[];
    for(const [slot,wc] of guests){
      if(wc.isDestroyed())continue;
      try{
        const scan=await wc.executeJavaScript(MARKET_DISCOVERY_SCRIPT);
        const sourceHints=await collectMarketSourceHints(slot,wc);
        const network=networkInspector.recent(slot,{sinceMs:30*60*1000,limit:5000,marketOnly:false});
        const protocol=analyzeProtocolEvents(network.requests,slot);protocols.push(protocol);alphaEngine.ingestProtocol(protocol);huntEngine.observeTelemetry(slot,protocol.hunt);observeHuntIntelligence(slot,protocol);
        const merged=[...protocol.listings,...normalizeListings(scan,slot)];const byId=new Map();for(const l of merged){const key=l.listingId?`${l.slot}:${l.listingId}`:`${l.slot}:${l.name}:${l.currency}:${l.price}`;if(!byId.has(key)||l.metadata?.source==='websocket-market')byId.set(key,l);}
        for(const l of byId.values()){alphaEngine.recordMarket(l);allListings.push(l);}
        const marketRequests=network.requests.filter(r=>/market|compr|venda|anuncio|orb|gold/i.test(`${r.url||''} ${JSON.stringify(r.postData||{})}`)).slice(-500);
        scans.push({slot,...scan,sourceHints,network:{attached:network.attached,error:network.error,requests:network.requests.slice(-120),marketRequests,criticalRequests:(network.criticalRequests||[]).slice(-500)},protocol});
      }catch(error){const network=networkInspector.recent(slot,{sinceMs:30*60*1000,limit:5000,marketOnly:false});const protocol=analyzeProtocolEvents(network.requests,slot);protocols.push(protocol);alphaEngine.ingestProtocol(protocol);scans.push({slot,error:String(error?.message||error),network,protocol});}
    }
    const validation={...mergeValidation(protocols),...ALPHA5_VALIDATION};
    alphaEngine.setValidation(validation);
    const unique=new Map();for(const l of allListings){const key=l.listingId?`${l.slot}:${l.listingId}`:`${l.slot}:${l.name}:${l.currency}:${l.price}`;unique.set(key,l);}const listings=[...unique.values()];
    const crossMarket=crossMarketPairs(listings);latestMarketProtocol={at:Date.now(),validation,accounts:protocols.map(p=>({slot:p.slot,account:p.account,hunt:p.hunt,buyAttempts:p.buyAttempts,warnings:p.warnings,ownListings:p.ownListings||[],actions:(p.actions||[]).slice(-40),summaryRows:p.summaries.length,speciesRows:p.species.length,listingRows:p.listings.length})),crossMarket:crossMarket.slice(0,60),listings:listings.slice(0,500)};
    const buyAttempts=protocols.reduce((n,x)=>n+x.buyAttempts.length,0);alphaEngine.audit('market-scan','Market Inspector leu protocolo WebSocket real em modo somente leitura',null,{accounts:scans.length,listings:listings.length,crossMarket:crossMarket.length,buyAttempts});
    return {scans,listings,crossMarket,protocol:latestMarketProtocol,alpha:alphaEngine.view()};
  });
  handler('grid:market-network-clear',()=>{networkInspector.clear();latestMarketProtocol={at:0,validation:alphaEngine?.view()?.validation||{...ALPHA5_VALIDATION},accounts:[],crossMarket:[],listings:[]};return true;});
  handler('grid:hunt-state',()=>huntView());
  handler('grid:hunt-objective',(slot,objective)=>{huntEngine.setObjective(Number(slot),String(objective));return huntView();});
  handler('grid:hunt-scan',async()=>{const scans=[];for(const [slot,wc] of guests){if(wc.isDestroyed())continue;try{const scan=await wc.executeJavaScript(HUNT_DISCOVERY_SCRIPT);const network=networkInspector.recent(slot,{sinceMs:15*60*1000,limit:900,marketOnly:false});const protocol=analyzeProtocolEvents(network.requests,slot);huntEngine.observeTelemetry(slot,protocol.hunt);observeHuntIntelligence(slot,protocol);scans.push({slot,...scan,telemetry:protocol.hunt,account:protocol.account});huntEngine.setCandidates(slot,(scan.candidates||[]).map(x=>({...x,xpRate:x.xpRate||0,goldRate:x.goldRate||0,capturesRate:x.capturesRate||0,dropValueRate:x.dropValueRate||0,conversionScore:x.conversionScore||0,deathRisk:x.deathRisk||0})));}catch(error){scans.push({slot,error:String(error?.message||error)});}}return {scans,hunt:huntView()};});
}
async function poll(){
  await Promise.all([...guests].map(async([slot,wc])=>{
    if(busy.has(slot)||wc.isDestroyed())return;const plan=performancePlan(slot),pollNow=Date.now();if(pollNow-Number(lastSampleAt[slot]||0)<plan.sampleMs)return;lastSampleAt[slot]=pollNow;busy.add(slot);
    try{
      const u=new URL(wc.getURL());
      if(!['https://pokeidle.io','https://www.pokeidle.io'].includes(u.origin)){stats.unavailable(slot,'Login / página externa');return;}
      const sample=await wc.executeJavaScript(SAMPLE_SCRIPT);stats.ingest(slot,sample);if(sample?.nick){huntEngine.observe(slot,sample);huntIntelligence?.observe(slot,{account:{level:sample.live?.trainerLevel,huntSlug:sample.live?.location},telemetry:{},record:{live:sample.live}});if(sample.live?.browserOnline===false||sample.live?.connectionIssue===true)markServerFailure(slot,sample.live?.serverNotice||'Conexão do jogo indisponível',Date.now());else markServerSuccess(slot,Date.now());}
    }catch(error){stats.unavailable(slot,'Carregando / leitura indisponível');markServerFailure(slot,error?.message||'Leitura indisponível',Date.now());}
    finally{busy.delete(slot);}
  }));
  const now=Date.now();lastPollAt=now;autoReconnectTick(now);if(stats.sampleHistory(now))historyDirty=true;checkIdleAlerts(now);checkGoals(now);handleNewEvents(stats.takeNewEvents());publish();void remoteSync.push(settings.remote,remotePayload(now)).then(()=>publish());
}
function createWindow(){
  win=new BrowserWindow({width:1600,height:1000,minWidth:1000,minHeight:700,title:'Gridium',backgroundColor:'#0b111b',
    webPreferences:{webviewTag:true,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,preload:path.join(__dirname,'preload.js')}});
  win.webContents.on('will-attach-webview',(_e,prefs)=>{prefs.nodeIntegration=false;prefs.contextIsolation=true;prefs.sandbox=true;delete prefs.preload;prefs.backgroundThrottling=!settings.background;});
  win.webContents.on('did-attach-webview',(_e,wc)=>{
    const slot=Array.from({length:4},(_,i)=>i).find(i=>wc.session===session.fromPartition('persist:pokeidle-account-'+(i+1)));
    if(slot===undefined)return;guests.set(slot,wc);networkInspector.attach(slot,wc);void registerMarketBridge(slot,wc);void applyGuestPerformance(slot,wc);wc.on('dom-ready',()=>{void registerMarketBridge(slot,wc);void applyGuestPerformance(slot,wc);});wc.on('did-navigate',()=>{marketBridgeHealth[slot].socketReady=false;protocolCursorAt[slot]=0;void registerMarketBridge(slot,wc);void applyGuestPerformance(slot,wc);});
    wc.on('did-start-navigation',(_e,_url,_inPlace,isMainFrame)=>{if(isMainFrame)stats.unavailable(slot,'Carregando');});
    wc.on('did-fail-load',(_e,errorCode,errorDescription,_url,isMainFrame)=>{if(!isMainFrame||errorCode===-3)return;stats.unavailable(slot,'Falha de conexão');markServerFailure(slot,`${errorDescription||'Falha de conexão'} (${errorCode})`);publish();});
    wc.on('render-process-gone',(_e,details)=>{stats.unavailable(slot,'Processo do jogo interrompido');markServerFailure(slot,details?.reason||'Processo do jogo interrompido');publish();});
    wc.on('destroyed',()=>{networkInspector.detach(slot);if(guests.get(slot)===wc){guests.delete(slot);stats.unavailable(slot,'Painel fechado');}});
  });
  win.webContents.setWindowOpenHandler(({url})=>{
    try{const u=new URL(url);if(['https://pokeidle.io','https://www.pokeidle.io'].includes(u.origin))return {action:'allow',overrideBrowserWindowOptions:{webPreferences:{preload:undefined,nodeIntegration:false,contextIsolation:true,sandbox:true}}};if(['http:','https:'].includes(u.protocol))shell.openExternal(url);}catch{}
    return {action:'deny'};
  });
  win.webContents.on('will-navigate',(event,url)=>{if(url!==shellURL)event.preventDefault();});
  win.loadFile(path.join(__dirname,'index.html'));
  win.on('closed',()=>{win=null;app.quit();});
}
app.whenReady().then(()=>{
  let saved={};try{saved=JSON.parse(fs.readFileSync(file(),'utf8'));}catch{}
  try{const h=JSON.parse(fs.readFileSync(historyFile(),'utf8'));if(Array.isArray(h.history))saved.history=h.history;}catch{}
  loadSettings(saved.settings||{});stats=new Stats(saved);huntIntelligence=new HuntIntelligence(path.join(app.getPath('userData'),'gridium-hunt-intelligence.json'));alphaEngine=new AlphaEngine(path.join(app.getPath('userData'),'gridium-alpha.sqlite'));alphaEngine.setValidation(ALPHA5_VALIDATION);alphaEngine.unlockLive(false);alphaEngine.kill(true);alphaEngine.audit('protocol-map','Alpha 9.7 carregou Scanner Global de Market e concorrência configurável de 1–4 contas',null,{buy:true,create:true,reprice:true,cancel:true,sale:true,autoInspection:true,globalMarketScanner:true,marketConcurrency:true,inspectionReadOnly:true,cooldownMs:120000,serverClock:true,liveExecutionUnlocked:false,killSwitch:true});try{ensureAlphaCoreProcess();}catch(e){alphaCoreLastError=String(e?.message||e);}installHandlers();createWindow();applySettings();stats.sampleHistory(Date.now(),true);historyDirty=true;
  timer=setInterval(poll,5000);savingTimer=setInterval(persist,10000);historySavingTimer=setInterval(()=>persistHistory(),60000);autoInspectionTimer=setInterval(()=>void autoMarketInspectionTick(),12000);autoNavigatorTimer=null;autoTradingTimer=setInterval(()=>void autoTradingTick(),6000);listingRecoveryTimer=setInterval(()=>void recoverUnlistedPositionsTick(),15000);
  app.on('activate',()=>{if(!win)createWindow();});
});
app.on('before-quit',()=>{clearInterval(timer);clearInterval(savingTimer);clearInterval(historySavingTimer);clearInterval(autoInspectionTimer);if(autoNavigatorTimer)clearInterval(autoNavigatorTimer);clearInterval(autoTradingTimer);if(listingRecoveryTimer)clearInterval(listingRecoveryTimer);if(stats){persist();persistHistory(true);}networkInspector.close();huntIntelligence?.close();stopAlphaAnalysisWorker('app-quit');stopAlphaCoreProcess('app-quit');if(alphaEngine){alphaEngine.close();alphaEngine=null;}if(powerId!==null){powerSaveBlocker.stop(powerId);powerId=null;}});
app.on('window-all-closed',()=>{app.quit();});

// Appended inside main.js; these functions share the existing Electron runtime.
const professionalLocks=new Set(),professionalActive=new Map();
async function professionalRun(slot,action,payload,run,{nested=false}={}){
 if(!alphaEngine)throw new Error('Motor indisponível');
 if(professionalLocks.has(slot)&&!nested)throw new Error('Esta conta já está aguardando uma operação; nenhum envio duplicado');
 if(alphaEngine.pendingOrders(slot).length)throw new Error('Há uma ordem sem confirmação nesta conta. Aguardando resposta real; não vou repetir a compra.');
 const parent=professionalActive.get(slot),order=alphaEngine.beginOrder(slot,action,payload);professionalActive.set(slot,order);professionalLocks.add(slot);
 try{const result=await run(order),receipt=result?.outcome||result,ok=result?.ok===true;
  alphaEngine.updateOrder(order.id,{status:ok?'confirmed':receipt?.raw?'failed':order.sentAt?'unknown':'failed',reason:ok?'Confirmado pelo servidor':receipt?.error||result?.error||'Aguardando confirmação real',outcome:receipt});
  return result;
 }catch(error){alphaEngine.updateOrder(order.id,{status:order.sentAt?'unknown':'failed',reason:String(error?.message||error)});throw error;}
 finally{if(parent)professionalActive.set(slot,parent);else professionalActive.delete(slot);if(!nested)professionalLocks.delete(slot);}
}
async function executeLiveBuy(input={}){
 const slot=Number(input.slot),listing=freshObservedListing(slot,input.listing||{}),strategy=String(input.strategy||alphaAccountStrategy(slot));
 const marketGuard=Professional.marketRulesGuard(listing,slot,alphaEngine.ownListings,alphaEngine.recentMarketActions(5000),alphaEngine.proState().ownSnapshots);if(!marketGuard.ok){await requestOwnListingSnapshot(slot);alphaEngine.decision(slot,marketGuard.reason);throw new Error(marketGuard.reason);}
 const guard=Professional.portfolioGuard(listing,slot,alphaEngine.positions(true),alphaEngine.accountSummary(slot,listing.currency),alphaEngine.settings);
 if(!guard.ok){alphaEngine.decision(slot,guard.reason);throw new Error(guard.reason);}
 // Recompute the book and policy in the main process immediately before sending.
 const currentRows=(latestMarketProtocol.listings||[]).filter(x=>Number(x.slot)===slot&&!isOwnAccountListing(x)),book=currentRows.filter(x=>String(x.listingId)!==String(listing.listingId)&&Professional.key(x)===Professional.key(listing)&&Date.now()-Number(x.at)<20000),ids=new Map(book.map(x=>[String(x.listingId),x])),peers=[...ids.values()],target=peers.length?Math.min(...peers.map(x=>Number(x.price)))-1:0;
 const checked={...listing,bookRequired:true,professionalRequired:true,bookDepth:peers.length,bookSellers:new Set(peers.map(x=>String(x.sellerId||x.seller||'').trim().toLowerCase()).filter(Boolean)).size,bookTarget:target,bookAgeMs:peers.length?Math.max(...peers.map(x=>Date.now()-Number(x.at))):Infinity};
 const evaluation=alphaEngine.evaluate(checked,strategy);
 if(!evaluation.eligible){alphaEngine.decision(slot,evaluation.reason,{name:listing.name});throw new Error(evaluation.reason);}
 return professionalRun(slot,'buy',{listing,strategy,evaluation,autoSell:input.autoSell===true},()=>executeLiveBuyImpl({...input,evaluation}));
}
async function executeLiveCreate(slot,listing,price,qty=1,options={}){
 const guard=Professional.marketRulesGuard(listing,slot,alphaEngine.ownListings,alphaEngine.recentMarketActions(5000),alphaEngine.proState().ownSnapshots);if(!guard.ok)throw new Error(guard.reason);
 const parent=professionalActive.get(slot),nested=options.source==='auto-pair'&&parent?.action==='buy';
 if(nested)alphaEngine.updateOrder(parent.id,{status:'confirmed',reason:'Compra confirmada e posição registrada'});
 return professionalRun(slot,'create',{listing,price,qty,source:options.source},async()=>{const result=await executeLiveCreateImpl(slot,listing,price,qty,options);if(result.ok&&result.listingId){const rows=alphaEngine.positions(true).filter(x=>Number(x.slot)===slot&&x.mode==='real'&&Professional.key(x)===Professional.key(listing)&&!x.metadata?.sellListingId);if(rows.length===1)alphaEngine.updatePositionMetadata(rows[0].id,{sellListingId:String(result.listingId),listingStatus:'listed'});}return result;},{nested});
}
async function executeLiveReprice(input={}){return professionalRun(Number(input.slot),'reprice',{listing:input.listing,listingId:input.listingId||input.listing?.listingId,price:input.price},()=>executeLiveRepriceImpl(input));}
async function executeLiveCancel(input={}){return professionalRun(Number(input.slot),'cancel',{listingId:input.listingId||input.listing?.listingId},()=>executeLiveCancelImpl(input));}
function reconcilePendingOrders(){
 if(!alphaEngine)return;
 for(const order of alphaEngine.pendingOrders()){
  if(professionalLocks.has(Number(order.slot)))continue;
  if(!order.sentAt){alphaEngine.updateOrder(order.id,{status:'failed',reason:'Aplicativo reiniciado antes do envio'});continue;}
  const rows=networkInspector.recent(Number(order.slot),{sinceMs:Math.min(1800000,Date.now()-order.sentAt+2000),limit:2500,marketOnly:false}).requests||[],p=order.payload||{},listing=p.listing||{},command=order.command||{},expected={price:command.preco||p.price||listing.price,listingId:command.id||p.listingId||listing.listingId,currency:listing.currency,assetId:listing.assetId,assetType:listing.assetType};
  const outcome=findMarketOutcome(rows,order.action,order.sentAt,expected);if(!outcome.done)continue;
  if(!outcome.ok){alphaEngine.updateOrder(order.id,{status:'failed',reason:outcome.error,outcome});continue;}
  if(order.action==='buy'){
   const existing=alphaEngine.positions(false).find(x=>x.metadata?.orderId===order.id);
   if(!existing){const target=autoSellPrice(listing,p.evaluation||{},p.strategy),id=alphaEngine.openPosition({slot:Number(order.slot),strategy:p.strategy||'balanced',mode:'real',assetType:listing.assetType,assetId:listing.assetId,name:listing.name,currency:listing.currency,qty:1,entry:Number(outcome.price)||listing.price,mark:listing.price,target,metadata:{orderId:order.id,listingId:listing.listingId,listingStatus:p.autoSell?'pending':'manual',listingRetryAt:Date.now()+5000,expectedSale:target,locked:outcome.locked===true,lateConfirmation:true}});alphaEngine.audit('late-buy-confirmed','Compra confirmada com atraso; posição recuperada sem repetir a ordem',order.slot,{positionId:id});}
  }
  if(order.action==='create'&&outcome.listingId){const rows=alphaEngine.positions(true).filter(x=>Number(x.slot)===Number(order.slot)&&x.mode==='real'&&Professional.key(x)===Professional.key(listing)&&!x.metadata?.sellListingId);if(rows.length===1)alphaEngine.updatePositionMetadata(rows[0].id,{sellListingId:String(outcome.listingId),listingStatus:'listed'});}
  alphaEngine.updateOrder(order.id,{status:'confirmed',reason:'Confirmação tardia recebida',outcome});
 }
}
function professionalPositionCoverage(){return Professional.allocateListings(alphaEngine?.positions(true)||[],alphaEngine?.ownListings||[]);}
async function recoverUnlistedPositionsTick(){
 if(!alphaEngine)return;reconcilePendingOrders();if(autoTradingBusy)return;
 const settingsNow=alphaEngine.settings||{};if(settingsNow.killSwitch||!settingsNow.liveExecutionUnlocked||!['semi','auto'].includes(settingsNow.executionMode))return;
 refreshProtocolFromNetwork({recordMarket:false,force:true,all:true});const coverage=professionalPositionCoverage(),now=Date.now();
 for(const p of alphaEngine.positions(true)){
  if(p.mode!=='real'||p.metadata?.listingStatus==='manual')continue;const slot=Number(p.slot),m=p.metadata||{},match=coverage.get(p.id);
  if(match?.covered){const lid=match.matches[0]?.listing?.listingId;alphaEngine.updatePositionMetadata(p.id,{listingStatus:'listed',sellListingId:lid||m.sellListingId,listingRetryAt:0});continue;}
  if(professionalLocks.has(slot)||alphaEngine.pendingOrders(slot).length||now<Number(m.listingRetryAt||0))continue;
  const snapshotAt=Number(alphaEngine.proState().ownSnapshots?.[slot])||0;
  if(snapshotAt<Number(m.lastListingAttemptAt||p.opened_at)||now-snapshotAt>90000){await requestOwnListingSnapshot(slot);alphaEngine.decision(slot,'Aguardando leitura atual de Meus anúncios antes de relistar',{name:p.name});continue;}
  if(m.locked){alphaEngine.decision(slot,'Item marcado como travado pelo servidor; mantendo a posição aberta',{name:p.name});continue;}
  const attempts=Math.max(0,Number(m.listingAttempts)||0),listing={assetType:p.asset_type,assetId:p.asset_id,name:p.name,currency:p.currency,price:Number(p.entry)},price=Math.max(autoSellPrice(listing,{},p.strategy),Number(m.expectedSale)||Number(p.target)||0),qty=match?.uncoveredQty||Number(p.qty)||1;
  alphaEngine.updatePositionMetadata(p.id,{listingStatus:'recovering',listingAttempts:attempts+1,lastListingAttemptAt:now,listingRetryAt:now+120000});
  try{const result=await executeLiveCreate(slot,listing,price,qty,{paired:true,source:'listing-recovery'});alphaEngine.updatePositionMetadata(p.id,{listingStatus:result.ok&&result.listingId?'listed':result.raw?'pending':'unknown',sellListingId:result.listingId||m.sellListingId,listingRetryAt:Date.now()+Math.min(120000,5000*(2**Math.min(attempts,5))),lastListingError:result.ok?null:result.error||'Anúncio não encontrado em Meus anúncios'});}
  catch(error){alphaEngine.updatePositionMetadata(p.id,{listingStatus:alphaEngine.pendingOrders(slot).length?'unknown':'pending',lastListingError:String(error?.message||error)});}
  return;
 }
}
function reconcileRealSales(protocols=[]){
 for(const protocol of protocols)for(const action of protocol.actions||[]){if(action.action!=='sale'||action.status!=='success')continue;
  const match=Professional.matchSale(action,alphaEngine.positions(true),alphaEngine.trades());if(match.duplicate)continue;
  if(match.position){alphaEngine.closePosition(match.position.id,match.exit,match.fees,{eventKey:action.eventKey,feeKnown:match.feeKnown});const state=alphaEngine.proState();state.unmatchedSales=(state.unmatchedSales||[]).filter(x=>x.eventKey!==action.eventKey);alphaEngine.saveProState(state);alphaEngine.audit('real-sale-reconciled','Venda confirmada: lucro líquido registrado uma única vez',protocol.slot,{positionId:match.position.id,eventKey:action.eventKey});}
  else{const state=alphaEngine.proState();if(!(state.unmatchedSales||[]).some(x=>x.eventKey===action.eventKey)){state.unmatchedSales=[...(state.unmatchedSales||[]),{eventKey:action.eventKey,slot:protocol.slot,name:action.name,at:action.at,reason:match.reason}].slice(-50);alphaEngine.saveProState(state);}}
 }
}

function learnOwnListingRead(slot,events){let pending=null;for(const e of [...events].sort((a,b)=>a.at-b.at)){const packet=payloadOfNetworkEvent(e);if(e.method==='SEND'&&String(packet?.t||'').startsWith('market.'))pending={command:/(meus|own)/i.test(String(packet?.t||'')+' '+String(packet?.aba||''))?safeMarketReadCommand(packet):null,at:e.at};if(e.method==='RECV'&&packet?.t==='market'&&packet.aba==='meus'&&pending?.command&&e.at-pending.at<5000){const state=alphaEngine.proState();if(JSON.stringify(state.ownReadTemplates?.[slot])!==JSON.stringify(pending.command)){state.ownReadTemplates={...state.ownReadTemplates,[slot]:pending.command};alphaEngine.saveProState(state);}pending=null;}}}
const professionalOwnProbeAt=new Map();
async function requestOwnListingSnapshot(slot){const command=alphaEngine.proState().ownReadTemplates?.[slot];if(!command||Date.now()-(professionalOwnProbeAt.get(slot)||0)<30000)return false;const wc=guests.get(slot);if(!wc||wc.isDestroyed())return false;professionalOwnProbeAt.set(slot,Date.now());await installMarketBridge(slot,wc);return wc.executeJavaScript('window.__gridiumMarketSend&&window.__gridiumMarketSend('+JSON.stringify(command)+')',true);}
