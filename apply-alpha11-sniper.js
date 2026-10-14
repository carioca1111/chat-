'use strict';
const fs=require('node:fs'),path=require('node:path');
const target=path.resolve(process.argv[2]||'gridium-build'),src=path.join(__dirname,'alpha11-sniper-src');
const read=n=>fs.readFileSync(path.join(target,n),'utf8').replace(/\r\n/g,'\n'),write=(n,s)=>fs.writeFileSync(path.join(target,n),s);
function patch(n,from,to){const s=read(n);if(!s.includes(from))throw new Error(`Alpha 11 anchor missing: ${n} / ${String(from).slice(0,100)}`);write(n,s.replace(from,to));}
function copy(n){fs.copyFileSync(path.join(src,n),path.join(target,n));}
const pkg=JSON.parse(read('package.json'));if(pkg.version!=='3.0.0-alpha.10.4')throw new Error('Alpha 11 expects Alpha 10.4, got '+pkg.version);
for(const n of ['sniper-runtime.js','asset-resolver.js','sniper-ui.js','sniper.css'])copy(n);

// Runtime hot-path hardening: one account may execute one order at a time and the claim itself
// must not be interpreted as a duplicate when its own scheduled BUY is released.
let runtime=read('sniper-runtime.js');
runtime=runtime.replace('this.accounts=new Map();this.serverOffsets=new Map();','this.accounts=new Map();this.serverOffsets=new Map();this.busySlots=new Set();');
runtime=runtime.replace("_gateBudget(l,slot){\n    const risk=this.policy.risk", "_gateBudget(l,slot,{ignoreClaim=false}={}){\n    const risk=this.policy.risk");
runtime=runtime.replace('if(risk.blockDuplicate&&this.claims.has(listingKey(l)))return {ok:false,reason:\'duplicate-claim\'};','if(!ignoreClaim&&risk.blockDuplicate&&this.claims.has(listingKey(l)))return {ok:false,reason:\'duplicate-claim\'};');
runtime=runtime.replace(".filter(a=>a.connected!==false&&now()-Number(a.lastAt||0)<120000)", ".filter(a=>a.connected!==false&&now()-Number(a.lastAt||0)<120000&&!this.busySlots.has(Number(a.slot)))");
runtime=runtime.replace('const l=row.listing,gate=this._gateBudget(l,l.slot);','const l=row.listing,gate=this._gateBudget(l,l.slot,{ignoreClaim:true});');
runtime=runtime.replace("if(!gate.ok){row.state='FAILED';row.reason=gate.reason;", "if(!gate.ok){row.state='FAILED';row.reason=gate.reason;");
runtime=runtime.replace("row.state='SENT';row.updatedAt=now();row.timing.sendAt=row.updatedAt;", "if(this.busySlots.has(Number(l.slot))){row.state='FAILED';row.reason='slot-busy';row.updatedAt=now();this.metrics.failed++;return;}this.busySlots.add(Number(l.slot));row.state='SENT';row.updatedAt=now();row.timing.sendAt=row.updatedAt;");
runtime=runtime.replace("finally{const claim=this.claims.get(key);if(claim)claim.state=row.state;this.save();}", "finally{this.busySlots.delete(Number(l.slot));const claim=this.claims.get(key);if(claim)claim.state=row.state;this.save();}");
write('sniper-runtime.js',runtime);

// Network fast path: market frames reuse the single JSON.parse already performed by NetworkInspector.
patch('network-inspector.js',
  'const GAME_FRAME_TYPE_RE=/\\"t\\"\\s*:\\s*\\"(?:welcome|estado|batalha|campo(?:\\.init)?)\\"/;',
  'const GAME_FRAME_TYPE_RE=/\\"t\\"\\s*:\\s*\\"(?:welcome|estado|batalha|market|campo(?:\\.init)?)\\"/;');
patch('network-inspector.js',
  "if(['welcome','estado','batalha','campo','campo.init'].includes(packet?.t))",
  "if(['welcome','estado','batalha','market','campo','campo.init'].includes(packet?.t))");

// Shiny and Sniper share the parsed packet. No second debugger listener / no second JSON.parse.
patch('main.js',
  "networkInspector.onGamePacket=(slot,packet,at)=>shinyTelemetry?.frame(slot,packet,at);networkInspector.onGameDisconnect=slot=>shinyTelemetry?.disconnect(slot);",
  "networkInspector.onGamePacket=(slot,packet,at)=>{shinyTelemetry?.frame(slot,packet,at);sniperRuntime?.gamePacket(slot,packet,at);};networkInspector.onGameDisconnect=slot=>{shinyTelemetry?.disconnect(slot);sniperRuntime?.disconnect(slot);};");

// Sniper state/IPC uses the existing Alpha market worker/database but never in the Lightning send path.
const mainFns=`
const lightningBusySlots=new Set();
function marketSniperState(){
  const snap=sniperRuntime?.snapshot()||null;
  return {sniper:snap,protocolReady:!!(alphaEngine&&liveValidationReady()),market:{socketReady:marketBridgeHealth.filter(x=>x?.socketReady).length,listings:(latestMarketProtocol.listings||[]).length,lastMarketRxAt:Math.max(0,...marketBridgeHealth.map(x=>Number(x?.lastMarketRxAt)||0))},accounts:[...sniperRuntime?.accounts?.values?.()||[]],serverOffsets:Object.fromEntries(sniperRuntime?.serverOffsets||[]),live:{unlocked:alphaEngine?.settings?.liveExecutionUnlocked===true,killSwitch:alphaEngine?.settings?.killSwitch!==false,mode:String(alphaEngine?.settings?.executionMode||'paper')}};
}
async function sendLightningMarketCommand(slot,command){
  if(!Number.isInteger(slot)||slot<0||slot>3)throw new Error('Conta inválida');const wc=guests.get(slot);if(!wc||wc.isDestroyed())throw new Error('Conta não está conectada');
  let origin='';try{origin=new URL(wc.getURL()).origin;}catch{}if(!['https://pokeidle.io','https://www.pokeidle.io'].includes(origin))throw new Error('Conta fora do PokéIdle.io');
  const clean=validateMarketCommand(command),encoded=JSON.stringify(clean),started=process.hrtime.bigint();let result=null;
  if(marketBridgeHealth?.[slot]?.socketReady){try{result=await wc.executeJavaScript(\`window.__gridiumMarketSend?window.__gridiumMarketSend(\${encoded}):({ok:false,reason:'bridge-missing'})\`,true);}catch(error){result={ok:false,reason:String(error?.message||error)}}}
  if(!result?.ok){const fallback=await sendMarketCommand(slot,clean,{paired:true});markLiveOrder(slot);return {...fallback,fastPath:false};}
  markLiveOrder(slot);return {ok:true,command:clean,sendLatencyMs:Number(process.hrtime.bigint()-started)/1e6,sendStartedNs:started.toString(),fastPath:true};
}
async function executeLightningBuy({listing,evaluation={},policy={}}={}){
  if(!alphaEngine||!sniperRuntime)throw new Error('Sniper indisponível');const slot=Number(listing?.slot);if(!Number.isInteger(slot)||slot<0||slot>3)throw new Error('Conta inválida');
  if(sniperRuntime.mode!=='AUTO'||sniperRuntime.killSwitch)throw new Error('Sniper AUTO não está armado');if(alphaEngine.settings.killSwitch||!alphaEngine.settings.liveExecutionUnlocked||alphaEngine.settings.executionMode!=='auto')throw new Error('LIVE não está armado');if(!liveValidationReady())throw new Error('Protocolo real ainda não validado');
  if(isOwnAccountListing(listing))throw new Error('Anúncio próprio bloqueado');if(lightningBusySlots.has(slot))throw new Error('Conta ocupada por outra compra');
  const age=Date.now()-Number(listing.at||0);if(!Number.isFinite(age)||age<0||age>Math.max(250,Number(sniperRuntime.policy?.maxEventAgeMs)||5000)+Math.max(0,Number(listing.delayMs)||0)+1500)throw new Error('Anúncio ficou antigo');
  if(Number(listing.availableAt)>0&&sniperRuntime._serverNow(slot)+1<Number(listing.availableAt))throw new Error('Servidor ainda não liberou o anúncio');
  const account=sniperRuntime.accounts.get(slot);if(!account||Date.now()-Number(account.lastAt||0)>120000)throw new Error('Saldo da conta está desatualizado');const balance=listing.currency==='gems'?Number(account.gems):Number(account.coins);if(!Number.isFinite(balance))throw new Error('Saldo real não observado');const reservePct=Math.max(0,Math.min(95,Number(policy?.risk?.reservePct)||0));if(balance-Number(listing.price)<balance*reservePct/100)throw new Error('Saldo reservado seria violado');
  const rate=liveRateCheck(slot);if(!rate.ok)throw new Error(rate.reason);lightningBusySlots.add(slot);const startedAt=Date.now();let sent=null,outcome=null;
  try{sent=await sendLightningMarketCommand(slot,buildBuyCommand(listing));outcome=await waitMarketOutcome(slot,'buy',startedAt,{price:listing.price,listingId:listing.listingId,currency:listing.currency,assetId:listing.assetId});if(sent)outcome.sendLatencyMs=sent.sendLatencyMs;}
  finally{lightningBusySlots.delete(slot);}
  const result={ok:outcome?.ok===true,outcome,listing,evaluation,fastPath:sent?.fastPath===true};
  setImmediate(()=>{try{alphaEngine.audit(result.ok?'sniper-lightning-won':'sniper-lightning-lost',result.ok?'Sniper confirmou compra':'Sniper não recebeu confirmação',slot,{listingId:listing.listingId,name:listing.name,price:listing.price,currency:listing.currency,sendLatencyMs:sent?.sendLatencyMs||null,error:outcome?.error||null});if(result.ok)alphaEngine.openPosition({slot,strategy:'sniper',mode:'real',assetType:listing.assetType,assetId:listing.assetId,name:listing.name,currency:listing.currency,qty:1,entry:Number(outcome?.price)||Number(listing.price),mark:Number(listing.price),metadata:{listingId:listing.listingId,source:'market-sniper',listingStatus:'manual'}});}catch{}});
  return result;
}
function intelligencePass(row,cfg={}){const e=row?.evaluation||{};if(cfg.enabled===false)return false;if(cfg.currency&&cfg.currency!=='any'&&row.currency!==cfg.currency)return false;if(Number(cfg.maxPrice)>0&&Number(row.price)>Number(cfg.maxPrice))return false;if(Number(e.roi||0)<Number(cfg.minRoi||0)||Number(e.netProfit||0)<Number(cfg.minProfit||0)||Number(e.alphaScore||0)<Number(cfg.minScore||0)||Number(e.confidence||0)*100<Number(cfg.minConfidence||0))return false;const q=String(cfg.query||'*').trim().toLowerCase();return q==='*'||String(row.name||'').toLowerCase().includes(q)||String(row.assetId||'').toLowerCase()===q;}
`;
patch('main.js','function createWindow(){',mainFns+'\nfunction createWindow(){');

patch('main.js',"  handler('grid:shiny-state',()=>",`  handler('grid:sniper-state',()=>marketSniperState());
  handler('grid:sniper-config',patch=>{if(!sniperRuntime)throw new Error('Sniper indisponível');const state=sniperRuntime.configure(patch||{});publish();return marketSniperState();});
  handler('grid:sniper-kill',on=>{if(!sniperRuntime||!alphaEngine)throw new Error('Sniper indisponível');sniperRuntime.kill(on!==false);alphaEngine.kill(true);alphaEngine.unlockLive(false);alphaEngine.configure({executionMode:'paper'});publish();return marketSniperState();});
  handler('grid:sniper-arm',(on,phrase='')=>{if(!sniperRuntime||!alphaEngine)throw new Error('Sniper indisponível');if(on!==true){sniperRuntime.kill(true);alphaEngine.kill(true);alphaEngine.unlockLive(false);alphaEngine.configure({executionMode:'paper'});return marketSniperState();}if(String(phrase).trim().toUpperCase()!=='ATIVAR SNIPER')throw new Error('Confirmação inválida');if(!liveValidationReady())throw new Error('Protocolo real do Market ainda não está validado');if(!(sniperRuntime.policy?.rules||[]).some(r=>r.enabled!==false&&Number(r.maxPrice)>0))throw new Error('Configure ao menos uma regra válida');priorityRouteQueue=[];priorityRouteActive=null;autopilotStatus={...autopilotStatus,enabled:false,state:'stopped',lastAt:Date.now(),lastAction:'Auto Trader pausado pelo Market Sniper'};const safety={...(alphaEngine.settings.liveSafety||{}),freshListingMs:Math.max(2000,Number(sniperRuntime.policy.maxEventAgeMs)||5000),autoSellAfterBuy:false,autoRepricing:false};alphaEngine.configure({executionMode:'auto',liveSafety:safety});alphaEngine.unlockLive(true);alphaEngine.kill(false);sniperRuntime.configure({mode:'AUTO',killSwitch:false});publish();return marketSniperState();});
  handler('grid:sniper-intelligence',async()=>{if(!alphaEngine||!sniperRuntime)throw new Error('Inteligência indisponível');refreshProtocolFromNetwork({recordMarket:true});const rows=(latestMarketProtocol.listings||[]).filter(x=>['item','pokemon'].includes(x.assetType)).slice(0,240);let opportunities=[];try{opportunities=await evaluateListingsInWorker(rows,'balanced');alphaAnalysisLastError=null;}catch(error){alphaAnalysisLastError=String(error?.message||error);stopAlphaAnalysisWorker(alphaAnalysisLastError);}opportunities=opportunities.sort((a,b)=>(b.evaluation?.alphaScore||0)-(a.evaluation?.alphaScore||0)).slice(0,80);return {at:Date.now(),sampleCount:rows.length,opportunities,analysisCore:{online:alphaAnalysisWorker!==null,pending:alphaAnalysisPending.size,lastError:alphaAnalysisLastError},feePct:{...(alphaEngine.settings.feePct||{})}};});
  handler('grid:sniper-manual-buy',async listing=>{if(!sniperRuntime||!alphaEngine)throw new Error('Sniper indisponível');if(sniperRuntime.mode!=='AUTO'||sniperRuntime.killSwitch)throw new Error('Arme o Sniper LIVE antes da compra');if(!intelligencePass(listing,sniperRuntime.policy?.intelligence||{}))throw new Error('Oportunidade fora dos limites do Inteligente');const key=String(listing?.listingId||'');if(!key)throw new Error('Anúncio inválido');if(sniperRuntime.claims.has(key))throw new Error('Este anúncio já foi reivindicado');const route=sniperRuntime._route(listing);if(!route)throw new Error('Nenhuma conta elegível');const routed={...listing,sourceSlot:Number(listing.slot),slot:Number(route.slot)};if(Number(routed.availableAt)>0&&sniperRuntime._serverNow(routed.slot)+1<Number(routed.availableAt))throw new Error('Anúncio ainda não foi liberado pelo servidor');sniperRuntime.claims.set(key,{at:Date.now(),state:'CLAIMED',source:'intelligent'});sniperRuntime.watch.set(key,{key,listing:routed,state:'SENT',createdAt:Date.now(),updatedAt:Date.now(),account:{slot:route.slot,name:route.name||'Conta '+(route.slot+1)},timing:{}});sniperRuntime._push('SENT','Compra inteligente enviada',{listing:routed});let result;try{result=await executeLightningBuy({listing:routed,evaluation:listing.evaluation||{},policy:sniperRuntime.policy});const row=sniperRuntime.watch.get(key);if(row){row.state=result.ok?'WON':'LOST';row.updatedAt=Date.now();row.serverMs=Number(result?.outcome?.serverMs)||null;}sniperRuntime.claims.get(key).state=result.ok?'WON':'LOST';sniperRuntime.metrics.attempts++;if(result.ok)sniperRuntime.metrics.wins++;else sniperRuntime.metrics.losses++;sniperRuntime._push(result.ok?'WON':'LOST',result.ok?'Compra inteligente confirmada':'Compra inteligente não confirmada',{listing:routed});return result;}catch(error){const row=sniperRuntime.watch.get(key);if(row){row.state='FAILED';row.reason=String(error?.message||error);row.updatedAt=Date.now();}sniperRuntime.claims.get(key).state='FAILED';sniperRuntime.metrics.failed++;throw error;}});
  handler('grid:shiny-state',()=>`);

// Dedicated preload API.
patch('preload.js',"  shinyState:()=>ipcRenderer.invoke('grid:shiny-state'),",`  sniperState:()=>ipcRenderer.invoke('grid:sniper-state'),
  sniperConfig:patch=>ipcRenderer.invoke('grid:sniper-config',patch),
  sniperArm:(on,phrase)=>ipcRenderer.invoke('grid:sniper-arm',on,phrase),
  sniperKill:on=>ipcRenderer.invoke('grid:sniper-kill',on),
  sniperIntelligence:()=>ipcRenderer.invoke('grid:sniper-intelligence'),
  sniperManualBuy:listing=>ipcRenderer.invoke('grid:sniper-manual-buy',listing),
  shinyState:()=>ipcRenderer.invoke('grid:shiny-state'),`);

// Navigation/UI. Alpha/Oportunidades remain absent.
patch('index.html','<link rel="stylesheet" href="styles.css">','<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="sniper.css">');
patch('index.html','<button class="tab shiny-nav" data-section="shiny-assistant">✧ Shiny Assistente</button>','<button class="tab shiny-nav" data-section="shiny-assistant">✧ Shiny Assistente</button>\n    <button class="tab sniper-nav" data-section="sniper">◎ Sniper</button>');
patch('index.html','<section id="alpha"',fs.readFileSync(path.join(src,'sniper.html'),'utf8')+'\n<section id="alpha"');
patch('index.html','<script src="shiny-ui.js"></script>','<script src="asset-resolver.js"></script>\n<script src="sniper-ui.js"></script>\n<script src="shiny-ui.js"></script>');
patch('renderer.js',"function render(data){\n  window.ShinyAssistant?.setVisible?.(activeSection==='shiny-assistant');", "function render(data){\n  window.ShinyAssistant?.setVisible?.(activeSection==='shiny-assistant');\n  window.MarketSniper?.setVisible?.(activeSection==='sniper');");
patch('renderer.js',"function setSection(id){activeSection=id;window.ShinyAssistant?.setVisible?.(id==='shiny-assistant');if(id==='shiny-assistant')window.ShinyAssistant?.open();", "function setSection(id){activeSection=id;window.ShinyAssistant?.setVisible?.(id==='shiny-assistant');if(id==='shiny-assistant')window.ShinyAssistant?.open();window.MarketSniper?.setVisible?.(id==='sniper');if(id==='sniper')window.MarketSniper?.open();");
patch('main.js',"['games','dashboard','hunt','shiny-assistant','alpha']","['games','dashboard','hunt','shiny-assistant','sniper','alpha']");

// Replace the old callback after runtime construction, before handlers/timers become active.
patch('main.js','installHandlers();createWindow();applySettings();',"if(sniperRuntime){sniperRuntime.onDecision=executeLightningBuy;sniperRuntime.onPostEvent=row=>{if(win&&!win.isDestroyed())win.webContents.send('grid:sniper-event',row);};}installHandlers();createWindow();applySettings();");

pkg.version='3.0.0-alpha.11';pkg.description='Gridium Alpha 11: Market Sniper Relâmpago + Inteligência de Mercado';pkg.build=pkg.build||{};pkg.build.win=pkg.build.win||{};pkg.build.win.artifactName='Gridium-Setup-${version}.${ext}';write('package.json',JSON.stringify(pkg,null,2)+'\n');
for(const n of ['main.js','preload.js','renderer.js','network-inspector.js','sniper-runtime.js','sniper-ui.js','asset-resolver.js']){require('node:child_process').execFileSync(process.execPath,['--check',path.join(target,n)],{stdio:'inherit'});}
const finalHtml=read('index.html');if(!finalHtml.includes('data-section="sniper"')||!finalHtml.includes('id="sniper"'))throw new Error('Sniper UI missing');if(finalHtml.includes('data-section="alpha"')||finalHtml.includes('data-section="opportunities"'))throw new Error('Removed navigation leaked back');
console.log('Gridium Alpha 11 Market Sniper integrated.');
