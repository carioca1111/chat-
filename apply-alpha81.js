'use strict';
const fs=require('fs'),path=require('path');
const target=process.argv[2];if(!target)throw new Error('Uso: node apply-alpha81.js <diretorio-alvo>');
const root=path.resolve(process.cwd(),target),p=n=>path.join(root,n),read=n=>fs.readFileSync(p(n),'utf8'),write=(n,t)=>fs.writeFileSync(p(n),t,'utf8');
const rep=(t,a,b,l)=>{if(!t.includes(a))throw new Error('Alpha 8.1: trecho não encontrado ('+l+')');return t.replace(a,b)};

const pkg=JSON.parse(read('package.json'));pkg.version='3.0.0-alpha.8.1';write('package.json',JSON.stringify(pkg,null,2)+'\n');

let html=read('index.html');
html=html.replace('Alpha 8: Autopilot completo · navegação automática Market/RMT · compra, anúncio e repricing automáticos.','Alpha 8.1: Autopilot estável · scanner em background · suas abas ficam livres.');
html=rep(html,'<div class="account-layout-actions"><div class="segmented"><button class="active" data-layout="vertical">Vertical</button><button data-layout="grid">2×2</button><button data-layout="duo">Dupla</button><button data-layout="focus">Foco</button></div><button id="reloadAll">Recarregar todas</button></div>','<div class="account-layout-actions"><div class="segmented"><button class="active" data-layout="grid">4 juntas</button><button data-layout="duo">Dupla</button><button data-layout="focus">Foco</button></div><button id="reloadAll">Recarregar todas</button></div>','layout controls');
html=rep(html,'<div class="game-grid layout-vertical" id="gameGrid">','<div class="game-grid layout-grid" id="gameGrid">','default layout');
write('index.html',html);

let main=read('main.js');
main=main.replace("executionMode==='auto'?4000:15000","executionMode==='auto'?6000:15000");
main=rep(main,"autopilotStatus={...autopilotStatus,enabled:true,state:'starting',lastAt:Date.now(),lastAction:'Autopilot iniciado: procurando Market/RMT',lastError:null,failures:0,bankrolls:banks};alphaEngine.audit('autopilot-start','Alpha 8 Autopilot iniciado em um clique',null,{smartBankroll:true,scanTabs:true,autoSell:true,autoRepricing:true});void autoNavigateMarketTick();","autopilotStatus={...autopilotStatus,enabled:true,state:'background',lastAt:Date.now(),lastAction:'Autopilot ativo em background; suas abas ficam livres',lastError:null,failures:0,bankrolls:banks,route:'scanner passivo'};alphaEngine.audit('autopilot-start','Alpha 8.1 Autopilot iniciado sem controlar as abas visíveis',null,{smartBankroll:true,scanTabs:false,passiveScanner:true,autoSell:true,autoRepricing:true});void autoMarketInspectionTick();",'autopilot start');
main=rep(main,"autoInspectionTimer=setInterval(()=>void autoMarketInspectionTick(),4000);autoNavigatorTimer=setInterval(()=>void autoNavigateMarketTick(),2500);autoTradingTimer=setInterval(()=>void autoTradingTick(),5000);","autoInspectionTimer=setInterval(()=>void autoMarketInspectionTick(),6000);autoNavigatorTimer=null;autoTradingTimer=setInterval(()=>void autoTradingTick(),5000);",'timers');
main=rep(main,"clearInterval(autoInspectionTimer);clearInterval(autoNavigatorTimer);clearInterval(autoTradingTimer);","clearInterval(autoInspectionTimer);if(autoNavigatorTimer)clearInterval(autoNavigatorTimer);clearInterval(autoTradingTimer);",'cleanup');
const inspectorStatus="autoInspectorStatus={enabled:true,running:false,lastAt:Date.now(),lastDomAt:autoInspectorStatus.lastDomAt,lastError:null,accounts:(latestMarketProtocol.accounts||[]).length,listings:(latestMarketProtocol.listings||[]).length,crossMarket:(latestMarketProtocol.crossMarket||[]).length,domListings,marketVisible};";
main=rep(main,inspectorStatus,inspectorStatus+"if(autopilotStatus.enabled===true){autopilotStatus={...autopilotStatus,state:'background',lastAt:Date.now(),slot:null,route:'scanner passivo',accountsReady:(latestMarketProtocol.accounts||[]).length,listingsSeen:(latestMarketProtocol.listings||[]).length,lastAction:'Scanner em background · '+(latestMarketProtocol.listings||[]).length+' anúncios observados · abas livres',lastError:null};}",'background status');
write('main.js',main);

let renderer=read('renderer.js');
renderer=renderer.replace('renderRemote(data);renderServer(data);renderAutoInspector(data.marketInspector);renderAutoTrader(data.autoTrader);r);renderAutopilot(data.autopilot);','renderRemote(data);renderServer(data);renderAutoInspector(data.marketInspector);renderAutoTrader(data.autoTrader);renderAutopilot(data.autopilot);');
renderer=renderer.replaceAll("versao:'Gridium 3.0 Alpha 8'","versao:'Gridium 3.0 Alpha 8.1'");
renderer=renderer.replace("notify(!enabled?'AUTOMÁTICO iniciado. O Gridium vai navegar Market/RMT e operar dentro dos limites.':'AUTOMÁTICO parado e LIVE bloqueado.');","notify(!enabled?'AUTOMÁTICO iniciado em background. Suas abas continuam livres.':'AUTOMÁTICO parado e LIVE bloqueado.');");
renderer=renderer.replace("let label='NAVEGAÇÃO: '+(on?String(s.state||'ATIVA').toUpperCase():'PARADA');","let label='SCANNER: '+(on?String(s.state||'BACKGROUND').toUpperCase():'PARADO');");
write('renderer.js',renderer);

let styles=read('styles.css');
styles += `\n/* GRID_ALPHA81_STABLE_4_ACCOUNT_GRID */\n#games.accounts-page{overflow:hidden!important;padding:14px 16px 16px!important;}\n#games .accounts-heading{margin-bottom:10px!important;}\n#gameGrid.layout-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr) minmax(0,1fr)!important;grid-auto-rows:unset!important;gap:10px!important;flex:1!important;min-height:0!important;height:auto!important;overflow:hidden!important;}\n#gameGrid.layout-grid .game-panel{display:flex!important;min-width:0!important;min-height:0!important;height:auto!important;max-height:none!important;border-radius:11px!important;}\n#gameGrid.layout-grid .game-panel webview{display:flex!important;flex:1 1 0!important;min-height:0!important;height:auto!important;width:100%!important;}\n#gameGrid.layout-grid .game-panel .panelbar{height:38px!important;min-height:38px!important;padding:0 9px!important;}\n#gameGrid.layout-grid .game-panel .account-meta{white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;max-width:42%!important;}\n@media(max-width:1250px){#gameGrid.layout-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr) minmax(0,1fr)!important;}#gameGrid.layout-grid .game-panel{height:auto!important;min-height:0!important;}}\n`;
write('styles.css',styles);

for(const f of ['main.js','renderer.js','preload.js','alpha-engine.js','index.html','styles.css'])if(!fs.existsSync(p(f)))throw new Error('Alpha 8.1: arquivo ausente '+f);
if(!read('index.html').includes('game-grid layout-grid'))throw new Error('Alpha 8.1: grid 2x2 não é padrão');
if(read('index.html').includes('data-layout="vertical"'))throw new Error('Alpha 8.1: controle vertical ainda presente');
if(read('main.js').includes('setInterval(()=>void autoNavigateMarketTick(),2500)'))throw new Error('Alpha 8.1: navegador agressivo ainda ativo');
if(!read('styles.css').includes('GRID_ALPHA81_STABLE_4_ACCOUNT_GRID'))throw new Error('Alpha 8.1: CSS estável ausente');
console.log('Gridium 3.0.0-alpha.8.1 aplicado: 4 contas juntas + abas livres + scanner passivo.');
