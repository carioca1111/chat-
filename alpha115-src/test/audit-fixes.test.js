'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {createRequire}=require('node:module'),{EventEmitter}=require('node:events'),{Worker}=require('node:worker_threads');
const root=path.resolve(__dirname,'..');
const {SniperRuntime}=require(path.join(root,'sniper-runtime'));
const {NetworkInspector}=require(path.join(root,'network-inspector'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const listing=(id,extra={})=>({listingId:String(id),assetType:'item',assetId:'23',name:'Stone',currency:'gems',price:60,slot:0,at:Date.now(),...extra});
function sniper(onDecision=async()=>({ok:true,outcome:{ok:true,price:60}})){
  const s=new SniperRuntime({onDecision});
  s.configure({mode:'AUTO',killSwitch:false,buyWhenOpen:true,watchBeforeOpen:true,rules:[{enabled:true,maxPrice:1000}],intelligence:{enabled:true,minRoi:0,minProfit:0,minScore:0,minConfidence:0,maxPrice:1000,currency:'any',query:'*',pokemon:true,shiny:true,items:true,stones:true},risk:{reservePct:0,maxPerMinute:120,maxPerAsset:100,hourlyBudgetGems:100,dailyBudgetGems:1000}});
  for(let slot=0;slot<2;slot++)s.gamePacket(slot,{t:'welcome',estado:{id:slot+1,nick:'Conta '+slot,orbs:1000,gold:10000}},Date.now());
  return s;
}
function inspector(){
  const n=new NetworkInspector(),dbg=new EventEmitter();
  dbg.isAttached=()=>true;dbg.sendCommand=()=>Promise.resolve();dbg.detach=()=>{};
  n.attach(0,{debugger:dbg,isDestroyed:()=>false});n.attach(1,{debugger:dbg,isDestroyed:()=>false});
  return n;
}
function mainContext(){
  const req=createRequire(path.join(root,'main.js')),ipc=new Map();
  const user=fs.mkdtempSync(path.join(os.tmpdir(),'gridium115-'));
  const app={setName(){},getPath(){return user},setPath(){},whenReady(){return {then(){}}},on(){},getVersion(){return '3.0.0-alpha.11.5'}};
  const electron={app,ipcMain:{handle:(name,fn)=>ipc.set(name,fn)},BrowserWindow:function(){},shell:{},powerSaveBlocker:{},session:{},dialog:{},Notification:function(){}};
  const ctx={require:n=>n==='electron'?electron:req(n),__dirname:root,__filename:path.join(root,'main.js'),console,setTimeout,clearTimeout,setInterval,clearInterval,setImmediate,clearImmediate,queueMicrotask,URL,URLSearchParams,process,Buffer};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'main.js'),'utf8'),ctx);
  return {ctx,ipc,run:s=>vm.runInContext(s,ctx)};
}

test('F01 mobile Shiny usa cache em escopo válido',()=>{
  const {run}=mainContext();
  const empty=run('mobileShiny113()');assert.equal(empty.cloud.computed,false);
  run("shinyCloudCache={cloud:{computed:true,engine:'render'},accounts:[],at:123};shinyCloudCacheAt=123");
  const full=run('mobileShiny113()');assert.equal(full.cloud.computed,true);assert.equal(full.at,123);
});

test('F02 orçamento inclui compra em voo atomicamente',async()=>{
  let release;const gate=new Promise(r=>release=r),s=sniper(()=>gate);
  try{s.ingestOne(listing(1));await Promise.resolve();s.ingestOne(listing(2));await Promise.resolve();assert.equal(s.metrics.attempts,1);release({ok:true,outcome:{ok:true,price:60}});await new Promise(setImmediate);assert.equal(s.spend.reduce((a,x)=>a+x.amount,0),60);}finally{s.close();}
});

test('F03 compra Inteligente usa a mesma contabilidade de risco',async()=>{
  const {ctx,run,ipc}=mainContext();const s=sniper();
  try{ctx.injectedSniper=s;ctx.observed=listing(11,{evaluation:{roi:100,netProfit:500,alphaScore:100,confidence:1}});run("sniperRuntime=injectedSniper;alphaEngine={};win={isDestroyed:()=>false,webContents:{}};latestMarketProtocol={listings:[observed]};installHandlers();");const call=ipc.get('grid:sniper-manual-buy'),event=run('({sender:win.webContents,senderFrame:{url:shellURL}})');const out=await call(event,ctx.observed);assert.equal(out.ok,true);assert.equal(s.spend.length,1);assert.equal(s.assetWins.size,1);assert.equal(s.attemptTimes.length,1);ctx.observed2=listing(12,{evaluation:{roi:100,netProfit:500,alphaScore:100,confidence:1}});run('latestMarketProtocol.listings.push(observed2)');await assert.rejects(()=>call(event,ctx.observed2));}finally{s.close();}
});

test('F04 retenção byId da 11.4 continua corrigida',()=>{
  const n=inspector();for(let i=0;i<10000;i++){n._onMessage(0,'Network.requestWillBeSent',{requestId:String(i),type:'Fetch',request:{url:'https://pokeidle.io/api/test'}});n._onMessage(0,'Network.loadingFinished',{requestId:String(i)});}assert.equal(n.states.get(0).byId.size,0);
});

test('F05 recibo essencial fora do foco fica disponível para confirmação',()=>{
  const n=inspector();n.setFocusSlots([0]);n._onMessage(1,'Network.webSocketCreated',{requestId:'ws',url:'wss://pokeidle.io/'});n._onMessage(1,'Network.webSocketFrameReceived',{requestId:'ws',response:{opcode:1,payloadData:JSON.stringify({t:'batalha',ev:[{k:'marketComprado',total:60,moeda:'orb',anuncioId:123}]})}});assert.equal(n.recent(1,{marketOnly:false}).requests.filter(x=>x.method==='RECV').length,1);
});

test('F06 anúncio alterado é reavaliado sem duplicar retransmissão idêntica',async()=>{
  const s=sniper();try{s.configure({rules:[{enabled:true,maxPrice:50}]});assert.equal(s.ingestOne(listing(6,{price:500})).reason,'no-rule-match');s.ingestOne(listing(6,{price:10}));await new Promise(setImmediate);assert.equal(s.metrics.attempts,1);const before=s.metrics.attempts;s.ingestOne(listing(6,{price:10}));await new Promise(setImmediate);assert.equal(s.metrics.attempts,before);}finally{s.close();}
});

test('F07 timers órfãos da 11.4 continuam corrigidos',()=>{
  const s=sniper();try{s.configure({mode:'OBSERVE',risk:{hourlyBudgetGems:100000,dailyBudgetGems:100000,maxPerAsset:1000}});for(let i=0;i<170;i++)s.ingestOne(listing(700+i,{availableAt:Date.now()+60000}));s.snapshot();assert.equal([...s.timers.keys()].filter(k=>!s.watch.has(k)).length,0);}finally{s.close();}
});

test('F08 categorias do Inteligente são autoridade no backend',()=>{
  const {ctx,run}=mainContext();ctx.sample=listing(1);assert.equal(run("intelligencePass(sample,{enabled:true,currency:'any',query:'*',pokemon:false,shiny:false,items:false,stones:false})"),false);ctx.sample=listing(2,{name:'Fire Stone'});assert.equal(run("intelligencePass(sample,{enabled:true,currency:'any',query:'*',pokemon:true,shiny:true,items:true,stones:false})"),false);
});

test('F09 pacote sem moeda não renova validade de saldo',()=>{
  const s=sniper();try{const old=Date.now()-3600000;s.accounts.set(0,{slot:0,connected:true,lastAt:old,gems:1000,gemsAt:old,coins:1000,coinsAt:old,id:'1',name:'A'});s.accounts.get(1).connected=false;s.gamePacket(0,{t:'estado',estado:{nick:'A'}},Date.now());assert.equal(s._route(listing(9)),null);}finally{s.close();}
});

test('F10 comparáveis separam tipo e variante shiny',async()=>{
  const {DatabaseSync}=require('node:sqlite');const dbPath=path.join(os.tmpdir(),'gridium115-mixed-'+Date.now()+'.sqlite');const db=new DatabaseSync(dbPath);db.exec('CREATE TABLE alpha_market (listing_id TEXT, price REAL,liquidity REAL,at INTEGER,asset_id TEXT,currency TEXT,asset_type TEXT,name TEXT,metadata TEXT)');const add=db.prepare('INSERT INTO alpha_market VALUES(?,?,?,?,?,?,?,?,?)');for(let i=0;i<100;i++)add.run('p'+i,10000,1,Date.now(),'23','gems','pokemon','Poke',JSON.stringify({assetType:'pokemon',shiny:false}));db.close();const w=new Worker(path.join(root,'alpha-analysis-worker.js'),{workerData:{dbPath}});const evalOne=l=>new Promise((resolve,reject)=>{w.once('message',m=>resolve(m.results[0].evaluation));w.once('error',reject);w.postMessage({type:'evaluate',id:Math.random(),listings:[l],settings:{}});});try{assert.equal((await evalOne(listing(20,{assetType:'item'}))).fairValue,null);assert.equal((await evalOne(listing(21,{assetType:'pokemon',shiny:false}))).fairValue,10000);assert.equal((await evalOne(listing(22,{assetType:'pokemon',shiny:true}))).fairValue,null);}finally{await w.terminate();try{fs.unlinkSync(dbPath)}catch{}}
});

test('N01 operação SENT não é expulsa pela capacidade da fila',async()=>{
  let release;const gate=new Promise(r=>release=r),s=sniper(()=>gate);try{s.configure({risk:{hourlyBudgetGems:100000,dailyBudgetGems:100000,maxPerAsset:1000,maxPerMinute:120}});s.ingestOne(listing(100,{price:1}));await Promise.resolve();assert.equal(s.watch.get('100').state,'SENT');s.configure({mode:'OBSERVE'});for(let i=101;i<261;i++)s.ingestOne(listing(i,{price:1}));s.snapshot();assert.equal(s.watch.get('100').state,'SENT');release({ok:true,outcome:{ok:true,price:1}});await new Promise(setImmediate);assert.equal(s.watch.get('100').state,'WON');assert.equal(s.metrics.failed,0);}finally{s.close();}
});

test('N02 hydrate restaura interruptor do Relâmpago',()=>{
  const source=fs.readFileSync(path.join(root,'sniper-ui.js'),'utf8'),nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false});return nodes.get(id)};const code=source.slice(source.indexOf('  function field('),source.indexOf('  function renderMetrics('));const ctx={$:get,document:{activeElement:null}};vm.createContext(ctx);vm.runInContext(code,ctx);ctx.policy={rules:[{enabled:true,maxPrice:50,query:'*',currency:'gems'}]};vm.runInContext('hydrate(policy)',ctx);assert.equal(get('msLightningEnabled').checked,true);assert.equal(vm.runInContext('currentConfig()',ctx).rules[0].enabled,true);
});

test('N03 buyWhenOpen=false bloqueia também anúncio pré-armado',async()=>{
  let sent=0;const s=sniper(async()=>{sent++;return {ok:true}});try{s.configure({buyWhenOpen:false,watchBeforeOpen:true});s.ingestOne(listing(3,{availableAt:Date.now()+25}));await wait(70);assert.equal(sent,0);}finally{s.close();}
});

test('N04 Inteligente desativado não recebe avaliações',async()=>{
  const s=sniper();try{s.configure({mode:'OFF',intelligence:{enabled:false}});let delivered=0;s.onListing=()=>delivered++;s.gamePacket(0,{t:'market',aba:'itens',linhas:[{id:123,tipo:'item',itemId:23,preco:10,moeda:'orb',ficha:{nome:'Stone'}}]});await new Promise(setImmediate);assert.equal(delivered,0);}finally{s.close();}
});

test('N05 Hunt isola histórico por identidade no mesmo slot',()=>{
  const {HuntIntelligence}=require(path.join(root,'hunt-intelligence')),h=new HuntIntelligence('');h.observe(0,{account:{id:'trainer-A',nick:'A',activePokemonId:10,pokemonUpdates:[{id:10,speciesId:25,name:'Pikachu A',level:50}]},telemetry:{huntSlug:'forest',windowMs:120000,xpPerHour:1000}});h.observe(0,{account:{id:'trainer-B',nick:'B',level:5,huntSlug:'cave'},telemetry:{huntSlug:'cave'}});let v=h.accountView(0,{});assert.equal(v.profile,null);assert.equal(v.samples,0);h.observe(0,{account:{id:'trainer-A',nick:'A'},telemetry:{}});v=h.accountView(0,{});assert.equal(v.profile.name,'Pikachu A');assert.equal(v.samples,1);
});

test('N06 estoque não duplica aliases sobrepostos',()=>{
  const {SAMPLE_SCRIPT}=require(path.join(root,'collector'));const nodes=[{textContent:'Super Potion x10',getAttribute:()=>null},{textContent:'Max Revive x5',getAttribute:()=>null}],inventory={textContent:'Super Potion x10 Max Revive x5',getAttribute:()=>null,querySelectorAll:()=>nodes};const ctx={location:{origin:'https://pokeidle.io'},navigator:{onLine:true},localStorage:{getItem:()=>JSON.stringify({ms:1000,capturas:1,shiniesVistos:0})},document:{getElementById:id=>id==='app'?{classList:{contains:()=>false}}:id==='tr-nick'?{textContent:'A'}:null,querySelectorAll:sel=>sel.startsWith('[id*="invent"')?[inventory]:[]}};const sample=vm.runInNewContext(SAMPLE_SCRIPT,ctx);assert.equal(sample.live.inventory.pocoes,10);assert.equal(sample.live.inventory.revives,5);
});
