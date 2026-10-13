'use strict';
const fs=require('fs');
const path=require('path');

const root=path.resolve(process.argv[2]||'gridium-build');
const src=path.join(__dirname,'alpha916-src');
const must=(cond,msg)=>{if(!cond)throw new Error('Alpha 9.16: '+msg);};
const read=file=>fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const write=(file,text)=>fs.writeFileSync(file,text);
const replaceOnce=(text,search,replacement,label)=>{must(text.includes(search),'marcador não encontrado: '+label);return text.replace(search,replacement);};

function functionBounds(text,name){
  const needle='function '+name+'(';
  const start=text.indexOf(needle);must(start>=0,'função '+name+' não encontrada');
  const open=text.indexOf('{',start);must(open>=0,'abertura '+name+' não encontrada');
  let depth=0,quote='',escape=false,lineComment=false,blockComment=false;
  for(let i=open;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(lineComment){if(c==='\n')lineComment=false;continue;}
    if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
    if(quote){
      if(escape){escape=false;continue;}
      if(c==='\\'){escape=true;continue;}
      if(c===quote){quote='';continue;}
      continue;
    }
    if(c==='/'&&n==='/'){lineComment=true;i++;continue;}
    if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
    if(c==="'"||c==='"'||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'){depth--;if(depth===0)return {start,open,end:i+1};}
  }
  throw new Error('Alpha 9.16: fechamento '+name+' não encontrado');
}
function replaceFunction(text,name,replacement){
  const b=functionBounds(text,name);
  return text.slice(0,b.start)+replacement+text.slice(b.end);
}

for(const rel of ['ultra-runtime.js','test/alpha916-ultra.test.js']){
  const from=path.join(src,rel),to=path.join(root,rel);must(fs.existsSync(from),'payload ausente: '+rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);
}

let pkg=read(path.join(root,'package.json'));
must(/3\.0\.0-alpha\.9\.14/.test(pkg),'base 9.14 não encontrada');
pkg=pkg.replace(/3\.0\.0-alpha\.9\.14/g,'3.0.0-alpha.9.16');
write(path.join(root,'package.json'),pkg);

let html=read(path.join(root,'index.html'));
html=replaceOnce(html,'<script src="perf-runtime.js"></script>','<script src="perf-runtime.js"></script>\n<script src="ultra-runtime.js"></script>','runtime Ultra no HTML');
if(!html.includes('id="alphaPerfBadge"')){
  html=html.replace(/(<span id="alphaStatusBadge"[^>]*>[\s\S]*?<\/span>)/,'$1<span id="alphaPerfBadge" class="safe-chip">FPS — · render — · long 0</span>');
}
write(path.join(root,'index.html'),html);

let preload=read(path.join(root,'preload.js'));
preload=replaceOnce(preload,"  performanceView:value=>ipcRenderer.invoke('grid:performance-view',value),","  performanceView:value=>ipcRenderer.invoke('grid:performance-view',value),\n  perfTelemetry:value=>ipcRenderer.invoke('grid:perf-telemetry',value),",'IPC de telemetria');
write(path.join(root,'preload.js'),preload);

let core=read(path.join(root,'alpha-core-process.js'));
core=replaceOnce(core,"const Professional=require('./alpha-professional');","const Professional=require('./alpha-professional');\nconst ProfessionalDashboard=require('./professional-dashboard');",'dashboard no Alpha Core');
core=replaceOnce(core,"else if(t==='plan')r=plan(p);else if(t==='shutdown')","else if(t==='plan')r=plan(p);else if(t==='dashboard'){const state=p.state||{};r={at:Date.now(),pid:process.pid,gems:ProfessionalDashboard.dashboardModel(state,'gems'),coins:ProfessionalDashboard.dashboardModel(state,'coins')};}else if(t==='shutdown')",'comando dashboard no Alpha Core');
write(path.join(root,'alpha-core-process.js'),core);

let main=read(path.join(root,'main.js'));
main=replaceOnce(main,"const {createCoalescedPublisher}=require('./perf-runtime');","const {createCoalescedPublisher}=require('./perf-runtime');",'runtime perf já aplicado');
main=replaceOnce(main,
"let alphaCoreProcess=null,alphaCoreSeq=0;const alphaCorePending=new Map();let alphaCoreLastError=null,alphaCoreLastAt=0;",
"let alphaCoreProcess=null,alphaCoreSeq=0;const alphaCorePending=new Map();let alphaCoreLastError=null,alphaCoreLastAt=0;\nlet rendererPerfTelemetry=null;\nlet alphaProfessionalCore={key:'',pendingKey:'',at:0,gems:null,coins:null,lastError:null,lastMs:0,pid:null};",
'cache do Professional Core');

const coreNotify="function alphaCoreNotify(type,payload={}){try{ensureAlphaCoreProcess().send({type,payload});return true;}catch(e){alphaCoreLastError=String(e?.message||e);return false;}}";
const coreHelpers=coreNotify+`
function professionalCoreKey(v={}){
  let h=2166136261;const mix=value=>{const s=String(value??'');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}};
  const positions=v.positions||[];mix(positions.length);for(const p of positions){mix(p.id);mix(p.status);mix(p.mark);mix(p.entry);mix(p.opened_at);mix(p.metadata?.listingStatus);mix(p.metadata?.manualSaleDetected);mix(p.metadata?.saleVerifiedAt);}
  for(const c of ['gems','coins'])for(const a of v.accounts?.[c]||[]){mix(a.slot);mix(a.realized);mix(a.unrealized);mix(a.available);mix(a.inPositions);mix(a.todayPnl);mix(a.base);}
  mix(v.professional?.pending?.length);mix(v.professional?.unmatched?.length);mix(v.professional?.decisions?.length);mix(v.settings?.liveExecutionUnlocked);mix(v.settings?.killSwitch);mix(v.settings?.liveSafety?.minExitProfitPct);mix(v.settings?.liveSafety?.stalePositionMinutes);mix(v.settings?.professional?.profile);
  return (h>>>0).toString(16)+':'+positions.length;
}
function professionalCoreState(v={}){
  return {professional:v.professional||{},accounts:v.accounts||{},positions:(v.positions||[]).slice(0,5000),settings:{liveExecutionUnlocked:v.settings?.liveExecutionUnlocked===true,killSwitch:v.settings?.killSwitch!==false,liveSafety:v.settings?.liveSafety||{},feePct:v.settings?.feePct||{},professional:v.settings?.professional||{}}};
}
function scheduleProfessionalCore(v={}){
  const key=professionalCoreKey(v);if(!key||alphaProfessionalCore.key===key||alphaProfessionalCore.pendingKey===key)return;
  alphaProfessionalCore.pendingKey=key;const started=Date.now();
  void alphaCoreRequest('dashboard',{state:professionalCoreState(v)},3500).then(result=>{
    if(alphaProfessionalCore.pendingKey!==key)return;
    alphaProfessionalCore={key,pendingKey:'',at:Number(result?.at)||Date.now(),gems:result?.gems||null,coins:result?.coins||null,lastError:null,lastMs:Math.max(0,Date.now()-started),pid:result?.pid||null};
    publish();
  }).catch(error=>{if(alphaProfessionalCore.pendingKey===key)alphaProfessionalCore={...alphaProfessionalCore,pendingKey:'',lastError:String(error?.message||error).slice(0,180),lastMs:Math.max(0,Date.now()-started)};});
}
function decorateAlphaView(v){
  if(!v)return v;scheduleProfessionalCore(v);
  return {...v,professionalDashboard:{gems:alphaProfessionalCore.gems,coins:alphaProfessionalCore.coins},professionalCore:{at:alphaProfessionalCore.at,pending:!!alphaProfessionalCore.pendingKey,lastError:alphaProfessionalCore.lastError,lastMs:alphaProfessionalCore.lastMs,pid:alphaProfessionalCore.pid}};
}
function alpha916RemoteAnalytics(alpha){
  if(!alpha)return null;
  return {professionalDashboard:alpha.professionalDashboard||null,performance:{renderer:rendererPerfTelemetry,view:alphaEngine?.lastViewProfile||null,core:alpha.professionalCore||null},marketActions:(alpha.marketActions||[]).slice(0,40).map(x=>({at:Number(x.at)||0,slot:Number.isInteger(x.slot)?x.slot:null,action:String(x.action||''),status:String(x.status||''),assetId:String(x.asset_id||x.assetId||''),currency:x.currency==='coins'?'coins':'gems',price:Number(x.price)||0}))};
}`;
main=replaceOnce(main,coreNotify,coreHelpers,'helpers do Professional Core');

main=main.replace("alpha:alphaEngine?{...alphaEngine.view(),sniper:sniperRuntime?.snapshot()||null}:null","alpha:alphaEngine?decorateAlphaView({...alphaEngine.view(),sniper:sniperRuntime?.snapshot()||null}):null");
main=replaceOnce(main,
"handler('grid:alpha-state',()=>alphaEngine?{...alphaEngine.view(),sniper:sniperRuntime?.snapshot()||null,audit:alphaEngine.recentAudit(120)}:null);",
"handler('grid:alpha-state',()=>alphaEngine?decorateAlphaView({...alphaEngine.view(),sniper:sniperRuntime?.snapshot()||null,audit:alphaEngine.recentAudit(120)}):null);",
'alpha-state decorado');

const perfViewMarker="  handler('grid:performance-view',view=>{";
must(main.includes(perfViewMarker),'handler performance-view não encontrado');
main=main.replace(perfViewMarker,
"  handler('grid:perf-telemetry',value=>{if(value&&typeof value==='object'){const num=k=>Number.isFinite(Number(value[k]))?Number(value[k]):0;rendererPerfTelemetry={at:Date.now(),fps:num('fps'),fpsP50:num('fpsP50'),renderP50:num('renderP50'),renderP95:num('renderP95'),longTasks:Math.max(0,Math.round(num('longTasks'))),longTaskP95:num('longTaskP95'),longTaskMax:num('longTaskMax'),samples:Math.max(0,Math.round(num('samples')))};}return rendererPerfTelemetry;});\n"+perfViewMarker);

const remoteReplacement=`function remotePayload(now=Date.now()){
  const view=stats.view();const forecasts=view.rows.map((r,i)=>forecastRow(r,settings.stocks[i],now));
  const alpha=alphaEngine?decorateAlphaView(alphaEngine.view()):null;
  const alphaRemote=alpha?{settings:{executionMode:alpha.settings.executionMode,marketConcurrency:alpha.settings.marketConcurrency,killSwitch:alpha.settings.killSwitch,goal:alpha.settings.goal,dailyProfitTarget:alpha.settings.dailyProfitTarget},accounts:alpha.accounts,rankings:alpha.rankings,positions:alpha.positions.slice(0,30),recentTrades:alpha.recentTrades.slice(0,30),validation:alpha.validation,analytics:alpha916RemoteAnalytics(alpha)}:null;
  return {version:5,at:now,paused:view.paused,total:view.total,rows:view.rows.map(r=>({slot:r.slot,status:r.status,health:r.health,lastChange:r.lastChange,lastActivityAgo:r.lastActivityAgo,record:r.record?{nick:r.record.nick,values:r.record.values,ms:r.record.ms,since:r.record.since,updated:r.record.updated,live:r.record.live||null}:null})),forecasts,events:stats.recentEvents(20),server:serverWatch.snapshot(now),gridium:{alpha:alphaRemote,hunt:huntView()}};
}`;
main=replaceFunction(main,'remotePayload',remoteReplacement);

main=replaceOnce(main,
"performance:{profile:settings.performanceProfile,view:{...performanceView,visibleSlots:[...performanceView.visibleSlots]},network:networkInspector.profileInfo?.()||null}",
"performance:{profile:settings.performanceProfile,view:{...performanceView,visibleSlots:[...performanceView.visibleSlots]},network:networkInspector.profileInfo?.()||null,renderer:rendererPerfTelemetry}",
'telemetria renderer no snapshot');
write(path.join(root,'main.js'),main);

let renderer=read(path.join(root,'renderer.js'));
const stateMarker="let alphaState=null,huntState=null,marketDeskState=null,alphaCurrency='gems',activeSection='games',focusedSlot=0,alphaRefreshBusy=false,lastMarketScanText='',lastAutoTraderState={},lastAutopilotState={};";
const runtimeInit=stateMarker+`
const alpha916Lanes=window.GridiumUltra?.createRenderLanes?window.GridiumUltra.createRenderLanes():{fast:(_k,fn)=>requestAnimationFrame(fn),slow:(_k,fn)=>(window.requestIdleCallback?requestIdleCallback(fn,{timeout:350}):setTimeout(fn,32)),stats:()=>({})};
const alpha916Perf=window.GridiumUltra?.createPerfTelemetry?window.GridiumUltra.createPerfTelemetry({win:window}):{markRender:()=>{},snapshot:()=>({fps:0,renderP95:0,longTasks:0})};
function updateAlphaPerfBadge(){const b=$('alphaPerfBadge');if(!b)return;const p=alpha916Perf.snapshot();b.textContent=\`FPS \${p.fps||'—'} · render P95 \${p.renderP95||'—'} ms · long \${p.longTasks||0}\`;b.classList.toggle('warning',(p.fps>0&&p.fps<28)||(p.renderP95||0)>50);}
setInterval(()=>{const p=alpha916Perf.snapshot();updateAlphaPerfBadge();if(window.gridAPI?.perfTelemetry)void window.gridAPI.perfTelemetry(p).catch(()=>{});},5000);`;
renderer=replaceOnce(renderer,stateMarker,runtimeInit,'runtime Ultra no renderer');

const professionalPositions=`function updateProfessionalAgeCells(){
  const now=Date.now();document.querySelectorAll('#proPositions tr[data-opened-at]').forEach(tr=>{const cell=tr.querySelector('[data-age-cell]'),opened=Number(tr.dataset.openedAt)||0;if(cell&&opened)cell.textContent=etaText(Math.max(0,now-opened));});
}
setInterval(()=>{if(activeSection==='alpha')updateProfessionalAgeCells();},10000);
function renderProfessionalPositions(rows,money){
  const box=$('proPositions');if(!box)return;const list=rows||[];
  if(!list.length){if(box.children.length!==1||box.firstElementChild?.dataset?.gridiumEmpty!=='1'){const tr=document.createElement('tr'),td=document.createElement('td');tr.dataset.gridiumEmpty='1';td.colSpan=5;td.className='pro-empty';td.textContent='Nenhuma compra real em aberto nesta moeda. O automático pode aguardar uma oportunidade que passe nas proteções.';tr.append(td);box.replaceChildren(tr);}return;}
  if(box.firstElementChild?.dataset?.gridiumEmpty==='1')box.replaceChildren();
  const patch=window.GridiumUltra?.patchKeyedRows;if(!patch)return;
  patch(box,list,{limit:240,key:x=>x.id||[x.slot,x.name,x.opened_at].join('|'),signatureOf:x=>[x.id,x.slot,x.name,x.cost,x.floor,x.status,x.next,x.stale,x.opened_at].join('|'),create:()=>{const tr=document.createElement('tr');for(let i=0;i<5;i++)tr.append(document.createElement('td'));tr.children[4].dataset.ageCell='1';return tr;},update:(tr,x)=>{tr.dataset.openedAt=String(Number(x.opened_at)||Math.max(0,Date.now()-(Number(x.ageMs)||0)));tr.children[0].textContent=\`C\${Number(x.slot)+1} · \${x.name}\`;tr.children[1].textContent=money(x.cost);tr.children[2].textContent=money(x.floor);tr.children[3].replaceChildren(document.createTextNode(x.status));const next=document.createElement('small');next.textContent=x.next;tr.children[3].append(next);tr.children[4].className=x.stale?'pro-stale':'';if(x.stale){const note=document.createElement('small');note.textContent='Estoque parado: novas compras deste ativo ficam bloqueadas.';tr.children[4].replaceChildren(document.createTextNode(etaText(x.ageMs)),note);}else tr.children[4].textContent=etaText(x.ageMs);}});
  updateProfessionalAgeCells();
}
`;
const proReplacement=professionalPositions+`function renderProfessionalTerminal(state){
 const box=$('proMoney');if(!box||!window.GridiumProfessional)return;const m=state.professionalDashboard?.[alphaCurrency]||null,money=x=>integer(x||0)+' '+(alphaCurrency==='gems'?'Gems':'Coins');
 if(!m){$('proHeadline').textContent=state.professionalCore?.lastError?'Alpha Core indisponível: '+state.professionalCore.lastError:'Alpha Core preparando posições…';return;}
 $('proHeadline').textContent=m.title;
 function card(parent,label,value,note,tone=''){const c=document.createElement('article');c.className='pro-money-card '+tone;const l=document.createElement('span'),v=document.createElement('strong'),d=document.createElement('small');l.textContent=label;v.textContent=value;d.textContent=note;c.append(l,v,d);parent.append(c);}
 box.replaceChildren();card(box,'LUCRO / PREJUÍZO CONFIRMADO',money(m.realized),'Somente vendas reais encerradas, após custos',m.realized<0?'loss':'gain');card(box,'CAPITAL EM ITENS',money(m.capitalInItems),'Custo das compras que ainda não foram vendidas');card(box,'BANCA DISPONÍVEL',money(m.available),'Limites de reserva e concentração ainda se aplicam');card(box,'SE VENDESSE PELO PREÇO ESTIMADO',money(m.unrealized),'Estimativa líquida das posições abertas; pode mudar','estimate');
 const p=m.policy;$('proPolicy').textContent=\`Proteção: até \${p.maxExposurePct||50}% da banca em itens, até \${p.maxAssetPct||20}% no mesmo ativo e \${p.cashReservePct||20}% de reserva. A compra precisa manter margem após uma queda de \${p.stressPct||4}% no preço estimado. Seus limites individuais continuam valendo.\`;
 const select=$('proProfile');if(document.activeElement!==select)select.value=m.profile;select.onchange=()=>action(async()=>{const result=await window.gridAPI.alphaConfig({professional:{profile:select.value}});renderAlpha(result);notify('Proteção atualizada; limites individuais preservados.');return result;});
 const messages=[];for(const x of m.pending)messages.push(\`Conta \${Number(x.slot)+1}: \${x.name||'ordem'} aguarda confirmação. Novas ordens desta conta estão bloqueadas para evitar duplicidade.\`);if(m.unmatched.length)messages.push(\`\${m.unmatched.length} confirmação(ões) de venda sem associação segura. Esses valores não foram somados ao lucro.\`);if(m.paperCount)messages.push(\`\${m.paperCount} posição(ões) de simulação separadas dos números reais.\`);$('proAttention').hidden=!messages.length;$('proAttention').textContent=messages.join('\\n');
 const decisions=$('proDecisions');decisions.replaceChildren();for(const x of m.decisions){const d=document.createElement('article');d.className='pro-decision';const title=document.createElement('b'),reason=document.createElement('p'),flow=document.createElement('small');title.textContent='CONTA '+(x.slot+1);reason.textContent=x.reason;flow.textContent=x.at?\`\${dateTime(x.at)} · \${integer(x.observed||0)} lidos → \${integer(x.fresh||0)} recentes → \${integer(x.eligible||0)} candidatos\${x.name?' · '+x.name:''}\`:'A leitura começa com a conta conectada e o automático iniciado.';d.append(title,reason,flow);decisions.append(d);}
 renderProfessionalPositions(m.positions,money);
 const metrics=$('proMetrics'),stats=m.metrics;metrics.replaceChildren();$('proSample').textContent=stats.sampleSufficient?\`\${stats.trades} vendas reais observadas. Histórico não garante o próximo resultado.\`:\`Amostra pequena: \${stats.trades||0}/30 vendas reais. Ainda não há evidência suficiente para avaliar consistência.\`;
 const periods=state.professional?.periods?.[alphaCurrency]||{};for(const [key,label] of [['today','HOJE'],['week','7 DIAS'],['month','30 DIAS']])card(metrics,label,money(periods[key]?.realized),'Resultado realizado na moeda selecionada');
 card(metrics,'FATOR DE LUCRO',stats.profitFactor==null?'Sem base de perdas':stats.profitFactor.toFixed(2),'Lucros somados ÷ perdas somadas');card(metrics,'GANHO MÉDIO',stats.averageWin==null?'Sem vendas positivas':money(stats.averageWin),'Apenas vendas lucrativas');card(metrics,'PERDA MÉDIA',stats.averageLoss==null?'Sem vendas negativas':money(stats.averageLoss),'Apenas vendas com prejuízo');
 card(metrics,'VENDAS ENCERRADAS',integer(stats.trades||0),'Confirmadas e associadas a uma posição');card(metrics,'RESULTADO MÉDIO POR VENDA',stats.expectancy==null?'Ainda sem dados':money(stats.expectancy),'Média observada, não previsão');card(metrics,'TAXA DE ACERTO',stats.winRate==null?'Ainda sem dados':format(stats.winRate)+'%','Percentual das vendas com lucro');card(metrics,'TAXAS REGISTRADAS',money(stats.fees),stats.unknownFeeCount?\`\${stats.unknownFeeCount} recibo(s) informa(m) só o líquido; taxa separada desconhecida\`:'Apenas custos informados ou registrados');card(metrics,'MAIOR QUEDA REALIZADA',money(stats.maxDrawdown),'Do maior lucro acumulado ao ponto seguinte mais baixo');card(metrics,'TEMPO TÍPICO PARA VENDER',stats.medianHoldMs==null?'Ainda sem dados':etaText(stats.medianHoldMs),'Mediana das posições encerradas');
}`;
renderer=replaceFunction(renderer,'renderProfessionalTerminal',proReplacement);

const recovery=`function renderMarketRecovery(state){const badge=$('alphaRecoveryBadge');if(!badge||!state)return;const positions=['gems','coins'].flatMap(c=>state.professionalDashboard?.[c]?.positions||[]),ready=!!(state.professionalDashboard?.gems||state.professionalDashboard?.coins);if(!ready){badge.textContent=state.professionalCore?.pending?'ANÚNCIOS · CORE…':'ANÚNCIOS · AGUARDANDO CORE';badge.classList.add('warning');return;}const missing=positions.filter(x=>x.status==='SEM ANÚNCIO').length,checking=positions.filter(x=>['CONFERINDO ANÚNCIO','AGUARDANDO SERVIDOR','ANÚNCIO A CONFERIR'].includes(x.status)).length;badge.classList.add('alpha-listing-health');badge.textContent=missing?\`\${missing} SEM ANÚNCIO · \${checking} A CONFERIR\`:checking?\`\${checking} ANÚNCIO(S) A CONFERIR\`:'ANÚNCIOS CONFERIDOS';badge.classList.toggle('warning',missing+checking>0);}`;
renderer=replaceFunction(renderer,'renderMarketRecovery',recovery);

const rb=functionBounds(renderer,'renderAlpha');
let renderBlock=renderer.slice(rb.start,rb.end);
const heavyStart=renderBlock.indexOf("  renderRank('alphaAccountRanking'");
must(heavyStart>=0,'início do render pesado não encontrado');
const proTail=renderBlock.lastIndexOf('  renderProfessionalTerminal(state);');
must(proTail>heavyStart,'tail profissional não encontrado');
const heavyBody=renderBlock.slice(heavyStart,proTail).trimEnd();
const beforeHeavy=renderBlock.slice(0,heavyStart);
const newEnd=`  renderProfessionalTerminal(state);renderMarketRecovery(state);updateAlphaPerfBadge();
  const alpha916HeavyState=state;
  alpha916Lanes.slow('alpha-heavy',()=>{if(activeSection!=='alpha'||alphaState!==alpha916HeavyState)return;
\${heavyBody}
  drawAlphaCurve(alpha916HeavyState);renderMarketDesk({...marketDeskState,marketActions:alpha916HeavyState.marketActions||marketDeskState?.marketActions,ownListings:alpha916HeavyState.ownListings||marketDeskState?.ownListings});
  });
}`;
renderer=renderer.slice(0,rb.start)+beforeHeavy+newEnd+renderer.slice(rb.end);

renderer=replaceOnce(renderer,
"const started=performance.now();renderAlpha(next);window.__gridiumPerf=window.__gridiumPerf||{};window.__gridiumPerf.lastAlphaRenderMs=Math.round((performance.now()-started)*100)/100;window.__gridiumPerf.lastAlphaRenderAt=Date.now();",
"const started=performance.now();renderAlpha(next);const alpha916RenderMs=performance.now()-started;alpha916Perf.markRender(alpha916RenderMs);window.__gridiumPerf=window.__gridiumPerf||{};window.__gridiumPerf.lastAlphaRenderMs=Math.round(alpha916RenderMs*100)/100;window.__gridiumPerf.lastAlphaRenderAt=Date.now();updateAlphaPerfBadge();",
'medição do render');

renderer=replaceOnce(renderer,
"if($('performanceProfile'))$('performanceProfile').value=data.settings.performanceProfile||'balanced';if($('performanceBadge'))$('performanceBadge').textContent=String(data.settings.performanceProfile||'balanced').toUpperCase();",
"if($('performanceProfile'))$('performanceProfile').value=data.settings.performanceProfile||'balanced';if($('performanceBadge'))$('performanceBadge').textContent=String(data.settings.performanceProfile||'balanced').toUpperCase();document.body.classList.toggle('gridium-ultra',(data.settings.performanceProfile||'balanced')==='ultra');",
'classe Ultra GPU');
write(path.join(root,'renderer.js'),renderer);

let css=read(path.join(root,'styles.css'));
css+=`\n\n/* GRID_ALPHA916_ULTRA_PERFORMANCE */\n#proPositions tr{content-visibility:auto;contain-intrinsic-size:auto 62px}\n.alpha-page .data-row,.alpha-page .heat-row,.alpha-page .hour-cell,.alpha-page .strategy-card,.alpha-page .pro-decision,.alpha-page .pro-money-card{contain:layout paint style}\n.gridium-ultra .alpha-page *{animation:none!important;transition:none!important}\n.gridium-ultra .alpha-page .module-card,.gridium-ultra .alpha-page .alpha-account-card,.gridium-ultra .alpha-page .pro-terminal,.gridium-ultra .alpha-page .pro-money-card,.gridium-ultra .alpha-page .sniper-panel{box-shadow:none!important}\n.gridium-ultra .alpha-page .alpha-account-card,.gridium-ultra .alpha-page .pro-terminal,.gridium-ultra .alpha-page .sniper-panel{background:#0d1824!important}\n.gridium-ultra .alpha-page canvas{image-rendering:auto}\n#alphaPerfBadge{font-variant-numeric:tabular-nums;white-space:nowrap}\n#alphaPerfBadge.warning{color:#ffd899;background:#3a2b18}\n`;
write(path.join(root,'styles.css'),css);

for(const file of ['main.js','renderer.js','preload.js','alpha-core-process.js','ultra-runtime.js']){
  const text=read(path.join(root,file));must(!text.includes('\u0000'),'NUL em '+file);
}
console.log('Gridium 3.0.0-alpha.9.16 aplicado: Professional Core, DOM incremental, Fast/Slow lanes, Ultra GPU e telemetria.');
