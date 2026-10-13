'use strict';
const fs=require('fs');
const path=require('path');
const target=path.resolve(process.argv[2]||'gridium-build');
const file=name=>path.join(target,name);
const read=name=>fs.readFileSync(file(name),'utf8');
const write=(name,text)=>fs.writeFileSync(file(name),text,'utf8');
const exists=name=>fs.existsSync(file(name));
for(const required of ['package.json','index.html','styles.css','renderer.js','main.js','preload.js'])if(!exists(required))throw new Error('Gridium Popular: arquivo ausente: '+required);

const pkg=JSON.parse(read('package.json'));
pkg.name='gridium-popular';
pkg.productName='Gridium Popular';
pkg.version='1.0.0';
pkg.description='Gridium Popular: central de contas, estatísticas e Hunt Intelligence para PokeIdle.io';
pkg.build=pkg.build||{};
pkg.build.appId='com.gridium.popular';
pkg.build.productName='Gridium Popular';
pkg.build.win=pkg.build.win||{};
pkg.build.win.artifactName='Gridium-Popular-Setup-${version}.${ext}';
pkg.build.nsis=pkg.build.nsis||{};
pkg.build.nsis.shortcutName='Gridium Popular';
write('package.json',JSON.stringify(pkg,null,2)+'\n');

const alphaStub=`'use strict';
const blocked=()=>{throw new Error('Alpha Terminal não está disponível no Gridium Popular');};
const account=slot=>({slot,base:0,operational:0,locked:0,available:0,inPositions:0,realized:0,unrealized:0,totalPnl:0,todayPnl:0,currentPnl:0});
class AlphaEngine{
  constructor(){this.ownListings=Array.from({length:4},()=>[]);this.settings={executionMode:'observer',killSwitch:true,liveExecutionUnlocked:false,marketConcurrency:1,bankrolls:Array.from({length:4},()=>({gems:0,coins:0})),accountProfiles:Array.from({length:4},()=>({strategy:'balanced',spendMode:'adaptive',spendPct:0,fixed:{gems:0,coins:0},bankrollMode:'manual'})),reinvestPercent:0,profitLockPercent:100,reserve:{gems:0,coins:0},dailyProfitTarget:{enabled:false,amount:0,currency:'gems'},goal:{enabled:false,target:0,currency:'gems'},feePct:{gems:0,coins:0},strategies:[],liveSafety:{maxOrderGems:0,maxOrderCoins:0,maxOrdersPerHour:0,minSecondsBetweenOrders:999999,autoSellAfterBuy:false,autoRepricing:false,freshListingMs:0,lossTightenPct:0,lossPausePct:0}};this.validation={popularEdition:true,alphaTerminal:false,liveExecution:false};}
  view(){return {edition:'popular',disabled:true,settings:this.settings,validation:this.validation,accounts:{gems:Array.from({length:4},(_,i)=>account(i)),coins:Array.from({length:4},(_,i)=>account(i))},positions:[],rankings:{gems:[],coins:[],strategies:[]},heatmap:{gems:[],coins:[]},performance:{hoursGems:[],hoursCoins:[],assetsGems:[],assetsCoins:[]},recentTrades:[],audit:[],marketActions:[],ownListings:this.ownListings};}
  configure(){this.settings.executionMode='observer';this.settings.killSwitch=true;this.settings.liveExecutionUnlocked=false;return this.view();}
  setBankroll(){return this.view();}
  kill(){this.settings.killSwitch=true;return this.view();}
  unlockLive(){this.settings.liveExecutionUnlocked=false;return this.view();}
  setValidation(){return this.validation;}
  upsertStrategy(){return this.view();}
  evaluate(){return {eligible:false,alphaScore:0,roi:0,confidence:0,liquidity:0,reason:'Indisponível no Gridium Popular'};}
  canExecute(){return {ok:false,reason:'Alpha Terminal indisponível no Gridium Popular',available:0};}
  openPosition(){return blocked();}
  closePosition(){return blocked();}
  repricingPreview(){return {canEdit:false,reason:'Indisponível no Gridium Popular'};}
  accountSummary(slot){return account(Number(slot)||0);}
  positions(){return [];}
  markPosition(){return false;}
  updatePositionMetadata(){return false;}
  recordMarket(){return false;}
  ingestProtocol(){return false;}
  audit(){return false;}
  recentAudit(){return [];}
  recentMarketActions(){return [];}
  close(){}
}
module.exports={AlphaEngine};\n`;
write('alpha-engine.js',alphaStub);

const coreStub=`'use strict';
function reply(id,ok,result,error){if(id&&process.send)try{process.send({id,ok,result,error});}catch{}}
process.on('message',m=>{const id=Number(m?.id)||0,type=String(m?.type||'');if(type==='shutdown'){reply(id,true,{ok:true,disabled:true});process.exit(0);return;}if(type==='ping'){reply(id,true,{pid:process.pid,disabled:true,edition:'popular'});return;}if(type==='ingest'){reply(id,true,{recorded:0,pid:process.pid,disabled:true});return;}if(type==='plan'){reply(id,true,{observed:0,fresh:0,eligible:0,riskApproved:0,selfListingsBlocked:0,candidates:[],repricing:null,accountGuards:[],core:{pid:process.pid,disabled:true,edition:'popular'}});return;}reply(id,false,null,'Recurso indisponível no Gridium Popular');});
process.on('disconnect',()=>process.exit(0));\n`;
write('alpha-core-process.js',coreStub);

const workerStub=`'use strict';
const {parentPort}=require('worker_threads');
parentPort.on('message',msg=>{if(msg?.type==='evaluate')parentPort.postMessage({id:msg.id,ok:true,results:[]});});\n`;
write('alpha-analysis-worker.js',workerStub);

const marketLiveStub=`'use strict';
const disabled=()=>{throw new Error('Operações automáticas de Market não estão disponíveis no Gridium Popular');};
const MARKET_BRIDGE_SOURCE='false';
function findMarketOutcome(){return {done:false,ok:false};}
module.exports={VALID_TYPES:new Set(),validateMarketCommand:disabled,buildBuyCommand:disabled,buildCreateCommand:disabled,buildEditCommand:disabled,buildCancelCommand:disabled,MARKET_BRIDGE_SOURCE,findMarketOutcome,gameCurrency:()=>''};\n`;
write('market-live.js',marketLiveStub);

let main=read('main.js');
if(!main.includes('GRID_POPULAR_EDITION'))main='const GRID_POPULAR_EDITION=true;\n'+main;
main=main.replace(/app\.setName\('Gridium'\)/g,"app.setName('Gridium Popular')");
const profileAnchor="app.setName('Gridium Popular')";
if(!main.includes('GRID_POPULAR_PROFILE_ISOLATION')){
  if(!main.includes(profileAnchor))throw new Error('Gridium Popular: ponto de isolamento de perfil não encontrado');
  const profileIsolation=`app.setName('Gridium Popular');\n/* GRID_POPULAR_PROFILE_ISOLATION */\nconst gridiumPopularUserData=path.join(app.getPath('appData'),'Gridium Popular');\napp.setPath('userData',gridiumPopularUserData);\ntry{app.setPath('sessionData',path.join(gridiumPopularUserData,'Session'));}catch{}\n`;
  main=main.replace(profileAnchor,profileIsolation);
}
main=main.replace(/path\.join\(appData,'Gridium'\)/g,"path.join(appData,'Gridium Popular')");
main=main.replace(/Gridium Desktop/gi,'Gridium Popular');
write('main.js',main);

let css=read('styles.css');
if(!css.includes('GRID_POPULAR_EDITION_LOCK'))css += `\n/* GRID_POPULAR_EDITION_LOCK */\n[data-tab*="alpha" i],[data-view*="alpha" i],[data-page*="alpha" i],[id^="alpha" i],[id*="alpha-terminal" i],[id*="alphaTerminal" i],[class*="alpha-terminal" i],[class*="alphaTerminal" i]{display:none!important;visibility:hidden!important;pointer-events:none!important;}\n`;
write('styles.css',css);

let html=read('index.html');
html=html.replace(/<title>[^<]*<\/title>/i,'<title>Gridium Popular</title>');
html=html.replace(/Gridium\s+Desktop/gi,'Gridium Popular');
const lockScript=`\n<script id="gridium-popular-lock">\n(()=>{const rx=/alpha(?:\\s|-|_)*terminal|terminal(?:\\s|-|_)*alpha/i,token=/^alpha$|alpha(?:-|_|\\s)*(terminal|trade|market|engine)|(?:terminal|trade|market)(?:-|_|\\s)*alpha/i;function hide(el){if(!el)return;el.setAttribute('aria-hidden','true');el.style.setProperty('display','none','important');el.style.setProperty('pointer-events','none','important');}function sanitize(){document.title='Gridium Popular';document.querySelectorAll('button,a,[role="tab"],[data-tab],[data-view],[data-page]').forEach(el=>{const text=(el.textContent||'').trim(),tokens=[el.id,el.className,el.getAttribute('data-tab'),el.getAttribute('data-view'),el.getAttribute('data-page')].filter(Boolean).join(' ');if(rx.test(text)||token.test(tokens))hide(el);});document.querySelectorAll('[id]').forEach(el=>{if(token.test(el.id||''))hide(el);});}const start=()=>{sanitize();setTimeout(sanitize,50);setTimeout(sanitize,500);new MutationObserver(sanitize).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','data-tab','data-view','data-page']});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();})();\n</script>\n`;
if(!html.includes('id="gridium-popular-lock"'))html=html.includes('</body>')?html.replace('</body>',lockScript+'</body>'):html+lockScript;
write('index.html',html);

let renderer=read('renderer.js');
if(!renderer.includes('GRID_POPULAR_EDITION'))renderer='const GRID_POPULAR_EDITION=true;\n'+renderer;
write('renderer.js',renderer);

let preload=read('preload.js');
if(!preload.includes('GRID_POPULAR_EDITION'))preload='const GRID_POPULAR_EDITION=true;\n'+preload;
write('preload.js',preload);

write('README.md','# Gridium Popular\n\nEdição para uso compartilhado do Gridium, com central de contas, estatísticas, Hunt Intelligence, desempenho e recursos de acompanhamento do PokeIdle.io.\n\nO Alpha Terminal e os módulos de execução automática de operações de Market não fazem parte desta edição.\n\nEsta edição usa perfil, cookies e dados de sessão separados do Gridium privado.\n');
console.log('Gridium Popular 1.0.0 puro aplicado: Alpha removido e perfil de sessão isolado.');
