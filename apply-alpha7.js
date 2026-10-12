'use strict';
const fs=require('fs');
const path=require('path');
const target=process.argv[2];
if(!target)throw new Error('Uso: node apply-alpha7.js <diretorio-alvo>');
const root=path.resolve(process.cwd(),target);
const p=n=>path.join(root,n);
const read=n=>fs.readFileSync(p(n),'utf8');
const write=(n,t)=>fs.writeFileSync(p(n),t,'utf8');
const replaceOnce=(text,from,to,label)=>{if(!text.includes(from))throw new Error('Alpha 7: trecho não encontrado ('+label+')');return text.replace(from,to);};

const pkg=JSON.parse(read('package.json'));
pkg.version='3.0.0-alpha.7';
write('package.json',JSON.stringify(pkg,null,2)+'\n');

let html=read('index.html');
html=html.replace(/Alpha 6\.1: execução real protegida[^<]*/g,'Alpha 7: Auto Trader + inspeção automática contínua · LIVE protegido · Kill Switch.');
html=html.replace('<button id="marketScan">Market Inspector</button>','<span id="alphaAutoInspectorBadge" class="safe-chip">INSPEÇÃO AUTO: INICIANDO</span><button id="marketScan">Inspecionar agora</button>');
html=html.replace('Ainda não executado. Abra o Market, navegue normalmente e clique em “Market Inspector”.','Inspeção automática iniciando. O Gridium captura HTTP/WebSocket e lê o Market em segundo plano, em modo somente leitura.');
write('index.html',html);

let main=read('main.js');
main=replaceOnce(main,
"let win,stats,powerId=null,timer,savingTimer,historySavingTimer,autoTradingTimer,lastPollAt=0,historyDirty=false;",
"let win,stats,powerId=null,timer,savingTimer,historySavingTimer,autoTradingTimer,autoInspectionTimer,lastPollAt=0,historyDirty=false;",
'main timers');
main=replaceOnce(main,
"let alphaEngine=null,autoTradingBusy=false;",
"let alphaEngine=null,autoTradingBusy=false,autoInspectorBusy=false;\nlet autoInspectorStatus={enabled:true,running:false,lastAt:0,lastDomAt:0,lastError:null,accounts:0,listings:0,crossMarket:0,domListings:0,marketVisible:0};",
'inspector state');
main=replaceOnce(main,
"marketProtocol:latestMarketProtocol,system:{uptime:now-stats.started,memoryMB:Math.round(nodeProcess.memoryUsage().rss/1024/1024),activePanels:guests.size,lastPollAt}};}",
"marketProtocol:latestMarketProtocol,marketInspector:{...autoInspectorStatus},system:{uptime:now-stats.started,memoryMB:Math.round(nodeProcess.memoryUsage().rss/1024/1024),activePanels:guests.size,lastPollAt}};}",
'snapshot inspector');

const autoFn=[
"async function autoMarketInspectionTick(){",
"  if(autoInspectorBusy||!alphaEngine)return;",
"  autoInspectorBusy=true;autoInspectorStatus={...autoInspectorStatus,enabled:true,running:true};",
"  const now=Date.now();",
"  try{",
"    refreshProtocolFromNetwork({recordMarket:true});",
"    let domListings=0,marketVisible=0;",
"    if(now-(Number(autoInspectorStatus.lastDomAt)||0)>=15000){",
"      const discovered=[];",
"      for(const [slot,wc] of guests){",
"        if(!wc||wc.isDestroyed())continue;",
"        try{",
"          const scan=await wc.executeJavaScript(MARKET_DISCOVERY_SCRIPT);",
"          if(scan&&scan.marketVisible)marketVisible++;",
"          const rows=normalizeListings(scan,slot)||[];",
"          domListings+=rows.length;",
"          for(const l of rows){alphaEngine.recordMarket(l);discovered.push(l);}",
"        }catch{}",
"      }",
"      if(discovered.length){",
"        const unique=new Map();",
"        for(const l of [...(latestMarketProtocol.listings||[]),...discovered]){const key=l.listingId?(String(l.slot)+':'+String(l.listingId)):(String(l.slot)+':'+String(l.name)+':'+String(l.currency)+':'+String(l.price));const prev=unique.get(key);if(!prev||Number(l.at)>=Number(prev.at))unique.set(key,l);}",
"        const listings=[...unique.values()].sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0)).slice(0,500);",
"        latestMarketProtocol={...latestMarketProtocol,at:now,listings,crossMarket:crossMarketPairs(listings).slice(0,60)};",
"      }",
"      autoInspectorStatus.lastDomAt=now;",
"    }else{domListings=Number(autoInspectorStatus.domListings)||0;marketVisible=Number(autoInspectorStatus.marketVisible)||0;}",
"    autoInspectorStatus={enabled:true,running:false,lastAt:Date.now(),lastDomAt:autoInspectorStatus.lastDomAt,lastError:null,accounts:(latestMarketProtocol.accounts||[]).length,listings:(latestMarketProtocol.listings||[]).length,crossMarket:(latestMarketProtocol.crossMarket||[]).length,domListings,marketVisible};",
"    publish();",
"  }catch(error){autoInspectorStatus={...autoInspectorStatus,enabled:true,running:false,lastAt:Date.now(),lastError:String((error&&error.message)||error)};publish();}",
"  finally{autoInspectorBusy=false;}",
"}",
""
].join('\n');
main=replaceOnce(main,'\nasync function autoTradingTick(){','\n'+autoFn+'async function autoTradingTick(){','auto inspector function');
main=replaceOnce(main,
"alphaEngine.audit('protocol-map','Alpha 6 carregou execução real protegida sobre o protocolo validado do Market',null,{buy:true,create:true,reprice:true,cancel:true,sale:true,cooldownMs:120000,serverClock:true,liveExecutionUnlocked:false,killSwitch:true});",
"alphaEngine.audit('protocol-map','Alpha 7 carregou Auto Trader com inspeção automática contínua e execução LIVE protegida',null,{buy:true,create:true,reprice:true,cancel:true,sale:true,autoInspection:true,inspectionReadOnly:true,cooldownMs:120000,serverClock:true,liveExecutionUnlocked:false,killSwitch:true});",
'startup audit');
main=replaceOnce(main,
"timer=setInterval(poll,2000);savingTimer=setInterval(persist,10000);historySavingTimer=setInterval(()=>persistHistory(),60000);autoTradingTimer=setInterval(()=>void autoTradingTick(),5000);",
"timer=setInterval(poll,2000);savingTimer=setInterval(persist,10000);historySavingTimer=setInterval(()=>persistHistory(),60000);autoInspectionTimer=setInterval(()=>void autoMarketInspectionTick(),4000);autoTradingTimer=setInterval(()=>void autoTradingTick(),5000);",
'timer start');
main=replaceOnce(main,
"clearInterval(timer);clearInterval(savingTimer);clearInterval(historySavingTimer);clearInterval(autoTradingTimer);",
"clearInterval(timer);clearInterval(savingTimer);clearInterval(historySavingTimer);clearInterval(autoInspectionTimer);clearInterval(autoTradingTimer);",
'timer cleanup');
write('main.js',main);

let renderer=read('renderer.js');
if(!renderer.includes('GRID_ALPHA7_AUTO_INSPECTOR')){
renderer += '\n// GRID_ALPHA7_AUTO_INSPECTOR\n'+[
"function renderAutoInspector(status){",
"  const badge=document.getElementById('alphaAutoInspectorBadge');if(!badge)return;const s=status||{};",
"  const age=s.lastAt?Math.max(0,Math.round((Date.now()-Number(s.lastAt))/1000)):null;",
"  if(s.lastError){badge.textContent='INSPEÇÃO AUTO: ERRO';badge.classList.add('warning');badge.title=s.lastError;}",
"  else if(s.running){badge.textContent='INSPEÇÃO AUTO: LENDO…';badge.classList.remove('warning');badge.title='Captura automática em andamento';}",
"  else{badge.textContent='INSPEÇÃO AUTO: ATIVA · '+Number(s.listings||0)+' anúncios';badge.classList.remove('warning');badge.title=(age===null?'Aguardando primeira leitura':('Última leitura há '+age+'s'))+' · '+Number(s.accounts||0)+' conta(s) · '+Number(s.marketVisible||0)+' Market visível(is)';}",
"  const out=document.getElementById('marketScanOutput');if(out&&!lastMarketScanText){const nl=String.fromCharCode(10);out.textContent='INSPEÇÃO AUTOMÁTICA ATIVA'+nl+'Última leitura: '+(s.lastAt?new Date(Number(s.lastAt)).toLocaleTimeString('pt-BR'):'aguardando')+nl+'Contas observadas: '+Number(s.accounts||0)+nl+'Anúncios recentes: '+Number(s.listings||0)+nl+'Cross-market: '+Number(s.crossMarket||0)+nl+'Leitura DOM: '+Number(s.domListings||0)+' anúncio(s)'+nl+'Market visível: '+Number(s.marketVisible||0)+' conta(s)'+nl+nl+'A captura HTTP/WebSocket continua em segundo plano mesmo sem abrir este painel.';}",
"}",
""
].join('\n');
}
renderer=replaceOnce(renderer,
"renderRemote(data);renderServer(data);",
"renderRemote(data);renderServer(data);renderAutoInspector(data.marketInspector);",
'render auto inspector');
renderer=renderer.replace("$('clearMarketScan').onclick=()=>action(async()=>{await window.gridAPI.clearMarketNetwork();lastMarketScanText='';$('marketScanOutput').textContent='Captura limpa. Navegue pelo Market e execute o Inspector novamente.';renderMarketProtocol({at:0,accounts:[],crossMarket:[]});notify('Captura de rede do Inspector limpa.');return true;});",
"$('clearMarketScan').onclick=()=>action(async()=>{await window.gridAPI.clearMarketNetwork();lastMarketScanText='';$('marketScanOutput').textContent='Captura limpa. A inspeção automática continuará coletando novos dados em segundo plano.';renderMarketProtocol({at:0,accounts:[],crossMarket:[]});notify('Captura limpa. Inspeção automática continua ativa.');return true;});");
write('renderer.js',renderer);

let engine=read('alpha-engine.js');
engine=engine.replace("liveExecution:'confirm-semi-auto',serverClockCooldown:true","liveExecution:'confirm-semi-auto',autoMarketInspection:'background-read-only',serverClockCooldown:true");
write('alpha-engine.js',engine);

if(!read('index.html').includes('alphaAutoInspectorBadge'))throw new Error('Alpha 7: badge de inspeção automática ausente');
if(!read('main.js').includes('autoMarketInspectionTick'))throw new Error('Alpha 7: loop de inspeção automática ausente');
if(!read('main.js').includes("setInterval(()=>void autoMarketInspectionTick(),4000)"))throw new Error('Alpha 7: timer de inspeção automática ausente');
console.log('Gridium 3.0.0-alpha.7 aplicado: Auto Trader + inspeção automática contínua.');
