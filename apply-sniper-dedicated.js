'use strict';
const fs=require('fs');
const path=require('path');
const target=path.resolve(process.argv[2]||path.join(__dirname,'gridium-build'));
const src=path.join(__dirname,'sniper-dedicated-src');
const read=p=>fs.readFileSync(path.join(target,p),'utf8');
const write=(p,c)=>{const f=path.join(target,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,c);};
const source=p=>fs.readFileSync(path.join(src,p),'utf8');
function assert(ok,msg){if(!ok)throw new Error(msg);}
function replaceOnce(text,needle,replacement,label){
  const next=typeof needle==='string'?text.replace(needle,replacement):text.replace(needle,replacement);
  assert(next!==text,`Sniper Dedicated: marcador não encontrado: ${label}`);return next;
}

assert(fs.existsSync(target),'gridium-build não existe. Rode build-alpha916.ps1 primeiro.');
const pkgPath=path.join(target,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
assert(String(pkg.version||'').includes('9.16'),`Base inesperada: ${pkg.version}. O Sniper Dedicated deve partir da Alpha 9.16.`);
pkg.name='gridium-sniper-desktop';
pkg.productName='Gridium Sniper';
pkg.version='3.0.0-sniper.1';
pkg.description='Gridium Sniper: execução dedicada de baixa latência para o Market do PokéIdle.io';
pkg.build=pkg.build||{};pkg.build.productName='Gridium Sniper';pkg.build.appId='com.gridium.desktop';
pkg.build.win=pkg.build.win||{};pkg.build.win.artifactName='Gridium-Sniper-Setup-${version}.${ext}';
pkg.build.nsis=pkg.build.nsis||{};pkg.build.nsis.shortcutName='Gridium Sniper';
delete pkg.build.asarUnpack;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

write('sniper-runtime.js',source('sniper-runtime.js'));
write('sniper-dedicated.js',source('sniper-dedicated.js'));
write('sniper-dedicated.css',source('sniper-dedicated.css'));
write('test/sniper-dedicated.test.js',source('test/sniper-dedicated.test.js'));

let html=read('index.html');
html=html.replace('<title>Gridium</title>','<title>Gridium Sniper</title>');
html=html.replace('<link rel="stylesheet" href="styles.css">','<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="sniper-dedicated.css">');
html=html.replace('<strong>Gridium</strong><small>GAME INTELLIGENCE PLATFORM</small>','<strong>Gridium Sniper</strong><small>MARKET EXECUTION ENGINE</small>');
if(!html.includes('data-section="sniper"')){
  const nav=/<button class="tab alpha-nav" data-section="alpha">[\s\S]*?<\/button>/;
  assert(nav.test(html),'Botão Alpha Terminal não encontrado');
  html=html.replace(nav,'<button class="tab sniper-nav" data-section="sniper">Sniper <span class="sniper-live-dot">LIVE</span></button>');
}
const sniperSection=`
  <section id="sniper" class="workspace-section sniper-page" aria-label="Gridium Sniper">
    <div class="sniper-shell">
      <div class="sniper-hero">
        <div><span class="sniper-eyebrow">HOT PATH · MARKET</span><h2>Gridium Sniper</h2><p>WebSocket → regra em memória → compra. Sem Alpha Terminal no caminho da ordem.</p></div>
        <div class="sniper-state-row"><span id="sniperArmState" class="sniper-status safe">SEGURO</span><span id="sniperSocketState" class="sniper-status off">SEM SOCKET</span><span id="sniperProtocolState" class="sniper-status off">PREPARANDO</span></div>
      </div>
      <div id="sniperNotice" class="sniper-notice" hidden></div>
      <div class="sniper-actions"><button id="sniperArm" class="primary">ARMAR SNIPER</button><button id="sniperKill" class="danger">KILL SWITCH</button><button id="sniperObserve">SÓ OBSERVAR</button><button id="sniperPrime">PREPARAR MARKET</button><button id="sniperSave">SALVAR REGRAS</button></div>
      <div class="sniper-metrics">
        <article class="sniper-metric"><label>Eventos</label><strong id="sniperEvents">0</strong><small>listagens novas vistas</small></article>
        <article class="sniper-metric"><label>Matches</label><strong id="sniperMatches">0</strong><small>bateram nas regras</small></article>
        <article class="sniper-metric"><label>Tentativas</label><strong id="sniperAttempts">0</strong><small>ordens enviadas</small></article>
        <article class="sniper-metric"><label>Comprados</label><strong id="sniperWins">0</strong><small>confirmados pelo servidor</small></article>
        <article class="sniper-metric"><label>Perdidos</label><strong id="sniperLosses">0</strong><small>sem confirmação</small></article>
        <article class="sniper-metric"><label>Win rate</label><strong id="sniperWinRate">0%</strong><small>compras / tentativas</small></article>
      </div>
      <div class="sniper-grid">
        <section class="sniper-card">
          <div class="sniper-card-head"><div><h3>Regras instantâneas</h3><small>O primeiro filtro é feito dentro do processo principal, sem histórico/ROI/liquidez.</small></div><button id="sniperAddRule">+ REGRA</button></div>
          <div id="sniperRules" class="sniper-rules"></div>
          <p class="sniper-help"><b>Dica:</b> use <b>*</b> para qualquer ativo. Ex.: <b>* · Pokémon · Coins · 10</b> compra qualquer Pokémon até 10 Coins. Para um Pokémon específico, escreva o nome ou ID.</p>
        </section>
        <section class="sniper-card">
          <div class="sniper-card-head"><div><h3>Limites de segurança</h3><small>Proteções fora da lógica de preço.</small></div></div>
          <div class="sniper-fields">
            <label>Idade máxima do anúncio (ms)<input id="sniperFreshMs" type="number" min="250" max="30000" value="5000"></label>
            <label>Máx. compras/minuto<input id="sniperMaxMinute" type="number" min="1" max="120" value="12"></label>
            <label>Máx. por ativo/sessão<input id="sniperMaxAsset" type="number" min="1" max="100" value="3"></label>
            <label>Reserva Coins<input id="sniperReserveCoins" type="number" min="0" value="0"></label>
            <label>Orçamento Coins/h<input id="sniperHourCoins" type="number" min="0" value="1000000"></label>
            <label>Orçamento Coins/dia<input id="sniperDayCoins" type="number" min="0" value="5000000"></label>
            <label>Reserva Gems<input id="sniperReserveGems" type="number" min="0" value="0"></label>
            <label>Orçamento Gems/h<input id="sniperHourGems" type="number" min="0" value="25"></label>
            <label>Orçamento Gems/dia<input id="sniperDayGems" type="number" min="0" value="100"></label>
            <label class="span2">Whitelist opcional<input id="sniperWhitelist" placeholder="Pikachu, Charizard"></label>
            <label class="span2">Blacklist<input id="sniperBlacklist" placeholder="nome ou ID, separados por vírgula"></label>
            <label class="sniper-check"><input id="sniperAllowShiny" type="checkbox" checked>Permitir shiny quando a regra aceitar</label>
          </div>
        </section>
      </div>
      <div class="sniper-grid">
        <section class="sniper-card">
          <div class="sniper-card-head"><div><h3>Últimos snipes</h3><small>WON = servidor confirmou a compra.</small></div><span id="sniperSpent">0 coins · 0 gems</span></div>
          <div id="sniperFeed" class="sniper-feed"><div class="sniper-empty">Nenhuma oportunidade vista ainda.</div></div>
        </section>
        <section class="sniper-card">
          <div class="sniper-card-head"><div><h3>Latência</h3><small>O que realmente importa na corrida.</small></div></div>
          <div class="sniper-latency"><div><span>Decisão p50</span><b id="sniperDecisionP50">—</b></div><div><span>Decisão p95</span><b id="sniperDecisionP95">—</b></div><div><span>Idade evento p50</span><b id="sniperAgeP50">—</b></div><div><span>Último evento</span><b id="sniperLastEvent">—</b></div></div>
          <p class="sniper-help">Contas no feed: <b id="sniperAccounts">nenhuma</b>. A confirmação do servidor continua sendo a autoridade final; “SENT” não é compra até virar “WON”.</p>
        </section>
      </div>
    </div>
  </section>`;
if(!html.includes('id="sniper"'))html=html.replace('</main>',sniperSection+'\n</main>');
if(!html.includes('src="sniper-dedicated.js"'))html=html.replace('</body>','<script src="sniper-dedicated.js"></script>\n</body>');
write('index.html',html);

let preload=read('preload.js');
if(!preload.includes('sniperState:')){
  const marker="  alphaState:()=>ipcRenderer.invoke('grid:alpha-state'),";
  assert(preload.includes(marker),'Preload: alphaState não encontrado');
  preload=preload.replace(marker,`  sniperState:()=>ipcRenderer.invoke('grid:sniper-state'),\n  sniperConfig:patch=>ipcRenderer.invoke('grid:sniper-config',patch),\n  sniperArm:(on,phrase)=>ipcRenderer.invoke('grid:sniper-arm',on,phrase),\n  sniperKill:on=>ipcRenderer.invoke('grid:sniper-kill',on),\n  sniperPrime:()=>ipcRenderer.invoke('grid:sniper-prime'),\n${marker}`);
}
write('preload.js',preload);

let main=read('main.js');
main=main.replace("title:'Gridium',backgroundColor", "title:'Gridium Sniper',backgroundColor");
const initRe=/sniperRuntime=new SniperRuntime\(\{root:__dirname,persistenceFile:path\.join\(app\.getPath\('userData'\),'gridium-sniper\.json'\),onDecision:async\(\{listing,evaluation,policy\}\)=>\{[\s\S]*?\}\}\);alphaEngine\.audit/;
assert(initRe.test(main),'Main: inicialização antiga do Sniper não encontrada');
main=main.replace(initRe,"sniperRuntime=new SniperRuntime({persistenceFile:path.join(app.getPath('userData'),'gridium-sniper.json'),onDecision:async({listing,evaluation,policy})=>executeSniperBuy({listing,evaluation,policy})});alphaEngine.audit");

const buyMarker='async function executeLiveBuy(input={}){';
assert(main.includes(buyMarker),'Main: executeLiveBuy não encontrado');
if(!main.includes('async function executeSniperBuy('))main=main.replace(buyMarker,`async function sendSniperMarketCommand(slot,command){
  if(!Number.isInteger(slot)||slot<0||slot>3)throw new Error('Conta inválida');const wc=guests.get(slot);if(!wc||wc.isDestroyed())throw new Error('Conta não está conectada');
  let origin='';try{origin=new URL(wc.getURL()).origin;}catch{}if(!['https://pokeidle.io','https://www.pokeidle.io'].includes(origin))throw new Error('Conta não está no PokéIdle.io');
  if(!marketBridgeHealth?.[slot]?.socketReady)return sendMarketCommand(slot,command);
  const clean=validateMarketCommand(command),encoded=JSON.stringify(clean),sendStarted=process.hrtime.bigint(),activeOrder=professionalActive.get(slot);if(activeOrder)alphaEngine.updateOrder(activeOrder.id,{status:'sent',sentAt:Date.now(),command:clean});
  let result;try{result=await wc.executeJavaScript(\`window.__gridiumMarketSend?window.__gridiumMarketSend(\${encoded}):({ok:false,reason:'bridge-missing'})\`,true);}catch(error){result={ok:false,reason:String(error?.message||error)}}
  if(!result?.ok){if(activeOrder)alphaEngine.updateOrder(activeOrder.id,{sentAt:0});return sendMarketCommand(slot,clean);}
  markLiveOrder(slot);return {ok:true,command:clean,sendLatencyMs:Number(process.hrtime.bigint()-sendStarted)/1e6,sendStartedNs:sendStarted.toString(),fastPath:true};
}
async function executeSniperBuy({listing,evaluation={},policy={}}={}){
  if(!alphaEngine||!sniperRuntime)throw new Error('Sniper indisponível');const slot=Number(listing?.slot),fresh=freshObservedListing(slot,listing||{});if(isOwnAccountListing(fresh))throw new Error('Compra da própria conta bloqueada');
  if(alphaEngine.settings.killSwitch||!alphaEngine.settings.liveExecutionUnlocked||alphaEngine.settings.executionMode!=='auto')throw new Error('Sniper LIVE não está armado');if(!liveValidationReady())throw new Error('Protocolo real ainda não validado');
  const acc=protocolAccount(slot),balance=fresh.currency==='gems'?Number(acc.gems):Number(acc.gold),balanceKey=fresh.currency==='gems'?'gems':'gold',seenAt=Number(acc.balanceTimes?.[balanceKey]||acc.balanceObservedAt||0),reserve=fresh.currency==='gems'?Number(policy.reserveGems||0):Number(policy.reserveCoins||0);
  if(!Number.isFinite(balance)||!seenAt||Date.now()-seenAt>120000)throw new Error('Saldo real desatualizado');if(balance-Number(fresh.price)<reserve)throw new Error('Saldo reservado seria violado');
  const fastEvaluation={fairValue:Number(evaluation.fairValue)||0,fastSell:Number(evaluation.fastSell)||0,liquidity:Number(evaluation.liquidity)||0,profit:Number(evaluation.profit)||0,roiPct:Number(evaluation.roiPct)||0,rule:evaluation.rule||null};
  return professionalRun(slot,'buy',{listing:fresh,strategy:'sniper',evaluation:fastEvaluation,autoSell:false},async()=>{
    const startedAt=Date.now(),sent=await sendSniperMarketCommand(slot,buildBuyCommand(fresh)),outcome=await waitMarketOutcome(slot,'buy',startedAt,{price:fresh.price,listingId:fresh.listingId,currency:fresh.currency,assetId:fresh.assetId});outcome.sendLatencyMs=sent.sendLatencyMs;outcome.fastPath=sent.fastPath===true;
    if(!outcome.ok){alphaEngine.audit('sniper-buy-lost','Sniper: compra não confirmada',slot,{listingId:fresh.listingId,error:outcome.error||'',sendLatencyMs:sent.sendLatencyMs});return {ok:false,outcome,listing:fresh,evaluation:fastEvaluation};}
    fresh.price=Number(outcome.price)||Number(fresh.price);autoConsumedListings.set(\`\${slot}:\${fresh.listingId}\`,Date.now());let positionId=null;try{positionId=alphaEngine.openPosition({slot,strategy:'sniper',mode:'real',assetType:fresh.assetType,assetId:fresh.assetId,name:fresh.name,currency:fresh.currency,qty:1,entry:fresh.price,mark:fresh.price,target:0,fairValue:0,alphaScore:0,confidence:0,liquidity:0,metadata:{orderId:professionalActive.get(slot)?.id,listingId:fresh.listingId,source:'sniper',listingStatus:'manual',rule:fastEvaluation.rule||null}});}catch{}
    alphaEngine.audit('sniper-buy-won',\`Sniper confirmou \${fresh.name}\`,slot,{listingId:fresh.listingId,price:fresh.price,currency:fresh.currency,sendLatencyMs:sent.sendLatencyMs,positionId});return {ok:true,outcome,listing:fresh,evaluation:fastEvaluation,positionId};
  });
}
${buyMarker}`);

const windowMarker='function createWindow(){';
assert(main.includes(windowMarker),'Main: createWindow não encontrado');
if(!main.includes('function attachFastSniperFeed('))main=main.replace(windowMarker,`const fastSniperDebuggerHandlers=new Map();
function sniperRawPacket(frame={}){
  if(Number(frame.opcode)!==1)return null;const raw=String(frame.payloadData||'');if(!raw)return null;try{return JSON.parse(raw);}catch{}const m=raw.match(/^(\\d+)([\\[{].*)$/s);if(m)try{return JSON.parse(m[2]);}catch{}return null;
}
function sniperRealtimeFrame(slot,frame){
  if(!sniperRuntime||sniperRuntime.mode==='OFF')return;const packet=sniperRawPacket(frame);if(!packet||typeof packet!=='object'||packet.t!=='market')return;const at=Date.now();
  try{const protocol=analyzeProtocolEvents([{at,slot,phase:'frame',type:'WebSocket',method:'RECV',url:'wss://pokeidle.io/',postData:packet}],slot),fresh=protocol.listings||[];if(!fresh.length)return;const byId=new Map();for(const row of [...(latestMarketProtocol.listings||[]),...fresh]){const key=\`\${Number(row.slot)}:\${String(row.listingId||'')}\`;const prev=byId.get(key);if(!prev||Number(row.at)>=Number(prev.at))byId.set(key,row);}const listings=[...byId.values()].filter(x=>at-Number(x.at||0)<=90000).sort((a,b)=>Number(b.at||0)-Number(a.at||0)).slice(0,800);latestMarketProtocol={...latestMarketProtocol,at,listings};void sniperRuntime.ingest(fresh,latestMarketProtocol);}catch(error){alphaEngine?.audit('sniper-feed-error','Falha ao processar evento direto do Market',slot,{error:String(error?.message||error)});}
}
function attachFastSniperFeed(slot,wc){
  const old=fastSniperDebuggerHandlers.get(slot);if(old)try{old.wc?.debugger?.removeListener('message',old.handler);}catch{}const handler=(_event,method,params)=>{if(method==='Network.webSocketFrameReceived')sniperRealtimeFrame(slot,params?.response||{});};try{wc.debugger.on('message',handler);fastSniperDebuggerHandlers.set(slot,{wc,handler});wc.once('destroyed',()=>{try{wc.debugger.removeListener('message',handler);}catch{}if(fastSniperDebuggerHandlers.get(slot)?.wc===wc)fastSniperDebuggerHandlers.delete(slot);});return true;}catch{return false;}
}
function sniperDedicatedState(){
  const snap=sniperRuntime?.snapshot()||null,activeSlots=typeof connectedMarketSlots==='function'?connectedMarketSlots():[...guests.keys()];let health={};try{health=marketRuntimeHealth()||{};}catch{}
  return {sniper:snap,protocolReady:!!(alphaEngine&&liveValidationReady()),market:{activeSlots,socketReady:Number(health.sockets)||marketBridgeHealth.filter?.(x=>x?.socketReady).length||0,bridgeInstalled:Number(health.bridges)||0,lastMarketRxAt:Number(health.lastMarketRxAt)||0,listings:(latestMarketProtocol.listings||[]).length},live:{unlocked:alphaEngine?.settings?.liveExecutionUnlocked===true,killSwitch:alphaEngine?.settings?.killSwitch!==false,mode:String(alphaEngine?.settings?.executionMode||'paper')},accounts:(latestMarketProtocol.accounts||[]).map(x=>({slot:x.slot,nick:x.account?.nick||'',gold:x.account?.gold??null,gems:x.account?.gems??null}))};
}
${windowMarker}`);

const attachMarker='networkInspector.attach(slot,wc);';
assert(main.includes(attachMarker),'Main: attach do NetworkInspector não encontrado');
main=main.replace(attachMarker,attachMarker+'attachFastSniperFeed(slot,wc);');

const ipcMarker="  handler('grid:alpha-state',()=>";
assert(main.includes(ipcMarker),'Main: marcador IPC Alpha não encontrado');
if(!main.includes("handler('grid:sniper-state'"))main=main.replace(ipcMarker,`  handler('grid:sniper-state',()=>sniperDedicatedState());
  handler('grid:sniper-config',patch=>{if(!sniperRuntime)throw new Error('Sniper indisponível');const clean=patch&&typeof patch==='object'?patch:{};const state=sniperRuntime.configure(clean);publish();return sniperDedicatedState();});
  handler('grid:sniper-kill',on=>{if(!sniperRuntime||!alphaEngine)throw new Error('Sniper indisponível');sniperRuntime.kill(on!==false);alphaEngine.kill(true);alphaEngine.unlockLive(false);alphaEngine.configure({executionMode:'paper'});publish();return sniperDedicatedState();});
  handler('grid:sniper-arm',(on,phrase='')=>{if(!sniperRuntime||!alphaEngine)throw new Error('Sniper indisponível');on=on===true;if(!on){sniperRuntime.kill(true);alphaEngine.kill(true);alphaEngine.unlockLive(false);alphaEngine.configure({executionMode:'paper'});publish();return sniperDedicatedState();}if(String(phrase).trim().toUpperCase()!=='ATIVAR SNIPER')throw new Error('Confirmação do Sniper inválida');if(!liveValidationReady())throw new Error('Protocolo real ainda não está validado');if(!(sniperRuntime.policy?.rules||[]).some(x=>x.enabled!==false&&Number(x.maxPrice)>0))throw new Error('Crie ao menos uma regra válida antes de armar');autopilotStatus={...autopilotStatus,enabled:false,state:'stopped',lastAt:Date.now(),lastAction:'Auto Trader desativado pelo Sniper Dedicated'};priorityRouteQueue=[];priorityRouteActive=null;const safety={...(alphaEngine.settings.liveSafety||{}),freshListingMs:Math.max(2000,Number(sniperRuntime.policy.maxEventAgeMs)||5000),autoSellAfterBuy:false,autoRepricing:false};alphaEngine.configure({executionMode:'auto',liveSafety:safety});alphaEngine.unlockLive(true);alphaEngine.kill(false);sniperRuntime.configure({mode:'AUTO',killSwitch:false});alphaEngine.audit('sniper-dedicated-arm','Gridium Sniper Dedicated armado',null,{rules:sniperRuntime.policy.rules.length,hotPath:'websocket-direct'});publish();return sniperDedicatedState();});
  handler('grid:sniper-prime',async()=>{if(!alphaEngine)throw new Error('Sniper indisponível');ensureMarketActiveSlots({force:true});await autoMarketInspectionTick();refreshProtocolFromNetwork({recordMarket:false,force:true,all:true});return sniperDedicatedState();});
${ipcMarker}`);

main=main.replace("try{ensureAlphaCoreProcess();}catch(e){alphaCoreLastError=String(e?.message||e);}","alphaCoreLastError='disabled-sniper-dedicated';");
main=main.replace("autoTradingTimer=setInterval(()=>void autoTradingTick(),6000);listingRecoveryTimer=setInterval(()=>void recoverUnlistedPositionsTick(),15000);","autoTradingTimer=null;listingRecoveryTimer=null;");
write('main.js',main);

for(const f of ['main.js','preload.js','index.html','sniper-runtime.js','sniper-dedicated.js','sniper-dedicated.css'])assert(fs.existsSync(path.join(target,f)),`Arquivo final ausente: ${f}`);
const finalHtml=read('index.html'),finalMain=read('main.js'),finalPreload=read('preload.js');
assert(finalHtml.includes('id="sniper"')&&finalHtml.includes('data-section="sniper"'),'UI dedicada não foi instalada');
assert(!finalHtml.includes('data-section="alpha">Alpha Terminal'),'Alpha Terminal ainda aparece na navegação');
assert(finalMain.includes('attachFastSniperFeed(slot,wc)'),'Fast WebSocket feed não foi conectado');
assert(finalMain.includes("handler('grid:sniper-arm'"),'IPC de armamento não foi instalado');
assert(finalPreload.includes('sniperState:')&&finalPreload.includes('sniperArm:'),'Preload do Sniper incompleto');
console.log('Gridium Sniper Dedicated 3.0.0-sniper.1 aplicado sobre Alpha 9.16.');
