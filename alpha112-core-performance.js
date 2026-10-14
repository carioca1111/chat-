'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
const must=(c,m)=>{if(!c)throw new Error('Alpha 11.2 core: '+m);};
function bounds(text,name){
  let start=text.indexOf('function '+name+'(');if(start<0)start=text.indexOf('async function '+name+'(');must(start>=0,'função '+name+' não encontrada');
  const open=text.indexOf('{',start);let depth=0,q='',esc=false,line=false,block=false;
  for(let i=open;i<text.length;i++){const c=text[i],n=text[i+1];if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}if(q){if(esc){esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c===q)q='';continue;}if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}if(c==='"'||c==="'"||c==='`'){q=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return {start,end:i+1};}throw new Error('Alpha 11.2 core: fechamento '+name+' não encontrado');
}
function replaceFunction(text,name,replacement){const b=bounds(text,name);return text.slice(0,b.start)+replacement+text.slice(b.end);}
function replaceOnce(text,from,to,label){must(text.includes(from),'âncora ausente: '+label);return text.replace(from,to);}

const pkg=JSON.parse(read('package.json'));must(pkg.version==='3.0.0-alpha.11.1','esperava Alpha 11.1, recebeu '+pkg.version);

let main=read('main.js');
main=replaceFunction(main,'performancePlan',`function performancePlan(slot){
  const profile=settings.performanceProfile||'balanced',visible=performanceView.section==='games'&&performanceView.visibleSlots.includes(Number(slot)),focused=visible&&Number(performanceView.focusedSlot)===Number(slot),layout=performanceView.layout||'grid',minimized=!!(win&&!win.isDestroyed?.()&&win.isMinimized?.());
  if(minimized)return {fps:2,reduceVisuals:true,sampleMs:20000,visible:false,focused:false};
  if(settings.liveEcoMode){const cap=focused?(layout==='focus'?30:20):(visible?8:3);return {fps:cap,reduceVisuals:!focused,sampleMs:focused?5000:(visible?10000:18000),visible,focused};}
  if(profile==='quality')return {fps:focused?60:(visible?(layout==='duo'?40:30):4),reduceVisuals:!visible,sampleMs:focused?5000:(visible?8000:18000),visible,focused};
  if(profile==='ultra')return {fps:focused?(layout==='grid'?45:60):(visible?18:4),reduceVisuals:!focused,sampleMs:focused?5000:(visible?10000:18000),visible,focused};
  return {fps:focused?60:(visible?28:6),reduceVisuals:!visible,sampleMs:focused?5000:(visible?8000:15000),visible,focused};
}`);

main=replaceFunction(main,'snapshot',`function snapshot(){
  const now=Date.now(),view=stats.view();
  return {...view,forecasts:view.rows.map((r,i)=>forecastRow(r,settings.stocks[i],now)),settings:publicSettings(),saveError:saveError||historySaveError,powerActive:powerId!==null&&powerSaveBlocker.isStarted(powerId),remote:remoteSync.status(settings.remote),server:serverWatch.snapshot(now),system:{uptime:now-stats.started,memoryMB:Math.round(nodeProcess.memoryUsage().rss/1024/1024),activePanels:guests.size,lastPollAt,performance:{profile:settings.performanceProfile,view:{...performanceView,visibleSlots:[...performanceView.visibleSlots]},network:networkInspector.profileInfo?.()||null,renderer:rendererPerfTelemetry},analysisCore:{process:true,threaded:false,online:!!(alphaCoreProcess&&alphaCoreProcess.connected),pid:alphaCoreProcess?.pid||null,pending:alphaCorePending.size,lastError:alphaCoreLastError,lastAt:alphaCoreLastAt,scannerSeparated:true,dbSeparated:true,managerSeparated:true}}};
}`);
main=replaceOnce(main,'function publish(){if(win&&!win.isDestroyed())win.webContents.send(\'grid:update\',snapshot());}',`function publish(){if(win&&!win.isDestroyed())win.webContents.send('grid:update',snapshot());}
function publishRemoteStatus(){if(win&&!win.isDestroyed())win.webContents.send('grid:remote-status',remoteSync.status(settings.remote));}`,'publish remoto');
main=replaceOnce(main,'publish();void remoteSync.push(settings.remote,remotePayload(now)).then(()=>publish());',`publish();
  if(settings.remote.enabled===true&&settings.remote.endpoint&&settings.remote.token){void remoteSync.push(settings.remote,remotePayload(now)).then(()=>publishRemoteStatus()).catch(()=>publishRemoteStatus());}`,'segundo publish do RemoteSync');

main=main.replace(/autoInspectionTimer=setInterval\(\(\)=>void autoMarketInspectionTick\(\),12000\);autoNavigatorTimer=null;autoTradingTimer=setInterval\(\(\)=>void autoTradingTick\(\),6000\);listingRecoveryTimer=setInterval\(\(\)=>void recoverUnlistedPositionsTick\(\),15000\);/,"autoInspectionTimer=setInterval(()=>void autoMarketInspectionTick(),20000);autoNavigatorTimer=null;autoTradingTimer=null;listingRecoveryTimer=null;");
must(main.includes('autoTradingTimer=null;listingRecoveryTimer=null;'),'timers legados não foram neutralizados');
main=replaceFunction(main,'autoTradingTick',`async function autoTradingTick(){return;}`);
write('main.js',main);

let preload=read('preload.js');
preload=replaceOnce(preload,"  onShiny:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('grid:shiny-event',listener);return ()=>ipcRenderer.removeListener('grid:shiny-event',listener);},",`  onShiny:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('grid:shiny-event',listener);return ()=>ipcRenderer.removeListener('grid:shiny-event',listener);},
  onRemoteStatus:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('grid:remote-status',listener);return ()=>ipcRenderer.removeListener('grid:remote-status',listener);},`,'preload remote status');
write('preload.js',preload);

let renderer=read('renderer.js');
const diagMarker="const alpha916Perf=window.GridiumUltra?.createPerfTelemetry?window.GridiumUltra.createPerfTelemetry({win:window}):{markRender:()=>{},snapshot:()=>({fps:0,renderP95:0,longTasks:0})};";
renderer=replaceOnce(renderer,diagMarker,`const alpha916Diagnostics=(()=>{try{return localStorage.getItem('gridiumDiagnostics')==='1';}catch{return false;}})();
const alpha916Perf=alpha916Diagnostics&&window.GridiumUltra?.createPerfTelemetry?window.GridiumUltra.createPerfTelemetry({win:window}):{markRender:()=>{},snapshot:()=>({fps:0,renderP95:0,longTasks:0}),stop:()=>{}};`,'diagnóstico opcional');
renderer=replaceOnce(renderer,"setInterval(()=>{const p=alpha916Perf.snapshot();updateAlphaPerfBadge();if(window.gridAPI?.perfTelemetry)void window.gridAPI.perfTelemetry(p).catch(()=>{});},5000);","if(alpha916Diagnostics)setInterval(()=>{const p=alpha916Perf.snapshot();updateAlphaPerfBadge();if(window.gridAPI?.perfTelemetry)void window.gridAPI.perfTelemetry(p).catch(()=>{});},5000);",'telemetria sempre ativa');

const gameHeader=`function renderGameHeaders112(data){for(let i=0;i<4;i++){const x=data.rows?.[i]||{},r=x.record;const name=$('name'+i),mini=$('mini'+i),zoom=$('zoom'+i);if(name)name.textContent=r?.nick||'Conta '+(i+1);if(mini)mini.textContent=r?\`${'${'}format(r.values?.capturas||0)} capturas · ${'${'}x.status||'rodando'}\`:x.status||'Aguardando jogo';if(zoom)zoom.textContent=Math.round((data.settings?.zoom?.[i]||1)*100)+'%';const account=(data.marketProtocol?.accounts||[]).find?.(row=>Number(row.slot)===i)?.account||{};const meta=$('accountMeta'+i);if(meta&&Object.keys(account).length)meta.textContent=window.GridiumProfessional.accountHeader(account);}}
let huntRefreshBusy112=false,huntRefreshAt112=0,huntSignature112='';
async function refreshHunt112(force=false){if(huntRefreshBusy112)return;if(!force&&Date.now()-huntRefreshAt112<4500)return;huntRefreshBusy112=true;try{const next=await window.gridAPI.huntState();huntRefreshAt112=Date.now();if(!next)return;const sig=window.GridiumUltra?.signature?window.GridiumUltra.signature(next.accounts||[]):JSON.stringify(next.accounts||[]);huntState=next;if(sig===huntSignature112&&!force)return;huntSignature112=sig;if(activeSection==='hunt')renderHunt(next,current);else if(activeSection==='dashboard'&&current)renderHuntPerformance({...current,hunt:next});}catch(e){console.error(e);}finally{huntRefreshBusy112=false;}}
`;
const renderStart=renderer.indexOf('function render(data){');must(renderStart>=0,'render principal ausente');renderer=renderer.slice(0,renderStart)+gameHeader+renderer.slice(renderStart);
const rb=bounds(renderer,'render');let renderBlock=renderer.slice(rb.start,rb.end);
const oldGlobal="renderRemote(data);renderServer(data);renderAutoInspector(data.marketInspector);renderAutoTrader(data.autoTrader);renderAutopilot(data.autopilot);";
must(renderBlock.includes(oldGlobal),'bloco global pesado não encontrado');
renderBlock=renderBlock.replace(oldGlobal,"renderRemote(data);renderServer(data);renderGameHeaders112(data);if(activeSection==='hunt'){void refreshHunt112();return;}if(activeSection!=='dashboard')return;");
renderBlock=renderBlock.replace(/\s*if\(data\.hunt\)renderHunt\(data\.hunt,data\);if\(data\.marketProtocol\)renderMarketProtocol\(data\.marketProtocol\);if\(data\.alpha\)\{[^}]*renderAlpha\([^;]+;\}/,'');
renderBlock=renderBlock.replace('if(Date.now()-lastExtras>10000)void refreshExtras();if(activeSection===\'alpha\')void refreshAlpha();','if(Date.now()-lastExtras>10000)void refreshExtras();void refreshHunt112();');
renderer=renderer.slice(0,rb.start)+renderBlock+renderer.slice(rb.end);

const lightHunt=`function renderHuntPerformance(data){
  const box=$('huntPerformanceGrid');if(!box)return;const hs=data.hunt?.accounts||[],rows=Array.from({length:4},(_,slot)=>({slot,h:hs[slot]||{},row:data.rows?.[slot]||{}})),patch=window.GridiumUltra?.patchKeyedRows;
  const create=()=>{const card=document.createElement('article');card.className='hunt-intel-card hunt-summary-card';const name=document.createElement('b'),hunt=document.createElement('small'),metrics=document.createElement('div'),best=document.createElement('small');name.dataset.k='name';hunt.dataset.k='hunt';metrics.dataset.k='metrics';best.dataset.k='best';card.append(name,hunt,metrics,best);return card;};
  const update=(card,x)=>{const intel=x.h?.intelligence||{},r=x.row?.record,ws=x.h?.current?.rates||{},xp=Number(ws.xpPerHour)>0?Number(ws.xpPerHour):(r?rate(r.values.xpTreinador,r.ms):0),gold=Number(ws.goldPerHour)>0?Number(ws.goldPerHour):(r?rate(r.values.gold,r.ms):0);card.querySelector('[data-k=name]').textContent=r?.nick||\`Conta ${'${'}x.slot+1}\`;card.querySelector('[data-k=hunt]').textContent='Hunt atual: '+huntLabel(intel.currentHunt||r?.live?.location||x.h?.current?.location);card.querySelector('[data-k=metrics]').textContent=\`${'${'}integer(xp)} XP/h · ${'${'}integer(gold)} Gold/h\`;card.querySelector('[data-k=best]').textContent=intel.best?'Melhor atual: '+huntLabel(intel.best.name||intel.best.huntSlug):'Calibrando';};
  if(patch)patch(box,rows,{key:x=>x.slot,signatureOf:x=>JSON.stringify([x.row?.record?.nick,x.row?.record?.live?.location,x.h?.current?.rates,x.h?.intelligence?.currentHunt,x.h?.intelligence?.best]),create,update,limit:4});else{box.replaceChildren();for(const x of rows){const c=create();update(c,x);box.append(c);}}
  let open=$('huntSummaryOpen112');if(!open){open=document.createElement('button');open.id='huntSummaryOpen112';open.className='secondary-action';open.textContent='ABRIR HUNT INTELLIGENCE';open.onclick=()=>setSection('hunt');box.after(open);}
}`;
renderer=replaceFunction(renderer,'renderHuntPerformance',lightHunt);
renderer=replaceFunction(renderer,'refreshExtras',`async function refreshExtras(force=false){if(activeSection!=='dashboard'||extrasBusy)return;if(!force&&Date.now()-lastExtras<8000)return;extrasBusy=true;const scope=selected;const rangeMs=Number($('trendRange').value)||21600000;try{const [a,e,s]=await Promise.all([window.gridAPI.analytics({scope,rangeMs}),window.gridAPI.events(80),window.gridAPI.sessions(80)]);if(scope===selected)trendData=Array.isArray(a)?a:[];events=Array.isArray(e)?e:[];sessions=s&&typeof s==='object'?s:{active:[],archived:[]};lastExtras=Date.now();if(activeSection==='dashboard'){drawChart();renderEvents();renderSessions();}}catch(error){console.error(error);}finally{extrasBusy=false;}}`);
renderer=replaceFunction(renderer,'setSection',`function setSection(id){activeSection=id;window.ShinyAssistant?.setVisible?.(id==='shiny-assistant');if(id==='shiny-assistant')window.ShinyAssistant?.open();window.MarketSniper?.setVisible?.(id==='sniper');if(id==='sniper')window.MarketSniper?.open();document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===id));document.querySelectorAll('.workspace-section').forEach(s=>s.classList.toggle('active',s.id===id));sendPerformanceView();if(current&&(id==='games'||id==='dashboard'))render(current);if(id==='dashboard'){void refreshExtras(true);void refreshHunt112(true);requestAnimationFrame(drawChart);}else if(id==='hunt')void refreshHunt112(true);}`);
renderer=renderer.replace("window.addEventListener('resize',()=>requestAnimationFrame(()=>{drawChart();if(alphaState)drawAlphaCurve(alphaState);}));","window.addEventListener('resize',()=>{if(activeSection==='dashboard')requestAnimationFrame(drawChart);});");
renderer=renderer.replace("setInterval(()=>{if(current)renderRemote(current);},1000);setInterval(()=>{if(activeSection==='alpha')void refreshAlpha();},5000);","");
renderer=replaceOnce(renderer,"window.gridAPI.onState(render);",`window.gridAPI.onState(render);window.gridAPI.onRemoteStatus?.(remote=>{if(!current)return;current={...current,remote};renderRemote(current);});`,'remote status renderer');
write('renderer.js',renderer);

pkg.version='3.0.0-alpha.11.2';write('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log('Gridium Alpha 11.2 core performance: active-section rendering, lightweight core snapshot, hidden webview budgets and legacy trader timers disabled.');
