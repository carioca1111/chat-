'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,'test',n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,'test',n),s,'utf8');
const must=(c,m)=>{if(!c)throw new Error('Alpha 11.2 test contracts: '+m);};
function swap(file,from,to,label){let s=read(file);must(s.includes(from),file+' / '+label);s=s.replace(from,to);write(file,s);}

swap('alpha88-single-account-performance.test.js',
"test('auto trader opera somente a conta ativa',()=>{const a=main.indexOf('async function autoTradingTick(){'),b=main.indexOf('function installHandlers(){',a),s=main.slice(a,b);assert.match(s,/slot=ensureMarketFocus\\(\\)/);assert.doesNotMatch(s,/for\\(let slot=0;slot<4;slot\\+\\+\\)/);});",
"test('Auto Trader legado não mantém ciclo automático oculto',()=>{assert.match(main,/async function autoTradingTick\\(\\)\\{return;\\}/);assert.doesNotMatch(main,/autoTradingTimer=setInterval/);});",
'legacy trader');
swap('alpha88-single-account-performance.test.js',
"test('snapshot não envia lista completa de anúncios para renderer',()=>{const a=main.indexOf('function snapshot(){'),b=main.indexOf('function publish(){',a),s=main.slice(a,b);assert.match(s,/marketView=\\{at:latestMarketProtocol\\.at/);assert.doesNotMatch(s,/marketProtocol:latestMarketProtocol/);});",
"test('snapshot core não envia Market pesado para renderer',()=>{const a=main.indexOf('function snapshot(){'),b=main.indexOf('const statePublisher112',a),s=main.slice(a,b);assert.ok(a>0&&b>a);assert.doesNotMatch(s,/marketView|marketProtocol:latestMarketProtocol|latestMarketProtocol\\.listings/);});",
'light snapshot');
swap('alpha88-single-account-performance.test.js',
"test('timers pesados foram desacelerados',()=>{assert.match(main,/timer=setInterval\\(poll,5000\\)/);assert.match(main,/autoInspectionTimer=setInterval\\(\\(\\)=>void autoMarketInspectionTick\\(\\),12000\\)/);assert.match(main,/autoTradingTimer=setInterval\\(\\(\\)=>void autoTradingTick\\(\\),6000\\)/);});",
"test('timers pesados ficam limitados e legados desligados',()=>{assert.match(main,/timer=setInterval\\(poll,5000\\)/);assert.match(main,/autoInspectionTimer=setInterval\\(\\(\\)=>void autoMarketInspectionTick\\(\\),20000\\)/);assert.doesNotMatch(main,/autoTradingTimer=setInterval|listingRecoveryTimer=setInterval/);});",
'timers');

swap('alpha90-worker-format.test.js',
"test('Auto Trader usa worker separado para avaliação',()=>{assert.match(main,/require\\('worker_threads'\\)/);assert.match(main,/evaluateListingsInWorker\\(usable,'balanced'\\)/);assert.doesNotMatch(main,/const evaluated=usable\\.map\\(x=>\\(\\{\\.\\.\\.x,evaluation:alphaEngine\\.evaluate/);assert.match(worker,/parentPort\\.on\\('message'/);assert.match(worker,/alpha_market/);});",
"test('Inteligente usa worker separado para avaliação fora do Relâmpago',()=>{assert.match(main,/require\\('worker_threads'\\)/);assert.match(main,/evaluateListingsInWorker\\(batch\\.map/);assert.match(main,/flushSniperIntelligence/);assert.match(worker,/parentPort\\.on\\('message'/);assert.match(worker,/alpha_market/);});",
'worker role');
swap('alpha90-worker-format.test.js',
"test('worker falha fechado sem compra',()=>{assert.match(main,/nenhuma compra será feita neste ciclo/);assert.match(main,/stopAlphaAnalysisWorker\\(alphaAnalysisLastError\\)/);});",
"test('worker do Inteligente falha isolado do executor de compra',()=>{assert.match(main,/sniperIntelLastError=String/);assert.match(main,/stopAlphaAnalysisWorker\\(sniperIntelLastError\\)/);const a=main.indexOf('async function executeLightningBuy'),b=main.indexOf('const sniperIntelCache',a),hot=main.slice(a,b);assert.ok(a>0&&b>a);assert.doesNotMatch(hot,/evaluateListingsInWorker/);});",
'worker fail isolation');

swap('alpha91-process-core.test.js',
"test('Auto Trader usa processo separado e banco próprio',()=>{assert.match(main,/require\\('child_process'\\)/);assert.match(main,/gridium-alpha-core\\.sqlite/);assert.match(main,/alphaCoreRequest\\('plan'/);assert.match(main,/return autoTradingProcessTick\\(\\)/);assert.match(main,/dbSeparated:true/);});",
"test('core legado permanece separado, mas seu ciclo automático fica desativado',()=>{assert.match(main,/require\\('child_process'\\)/);assert.match(main,/gridium-alpha-core\\.sqlite/);assert.match(main,/alphaCoreRequest\\('plan'/);assert.match(main,/async function autoTradingProcessTick/);assert.match(main,/async function autoTradingTick\\(\\)\\{return;\\}/);assert.doesNotMatch(main,/autoTradingTimer=setInterval/);assert.match(main,/dbSeparated:true/);});",
'process core dormant');

swap('alpha911-listing-recovery.test.js',
"test('recuperador procura posições sem anúncio, usa backoff e confirmação real',()=>{const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');assert.ok(main.includes('recoverUnlistedPositionsTick'));assert.ok(main.includes('uncoveredRealPositions'));assert.ok(main.includes('executeLiveCreate(slot,listing,price'));assert.ok(main.includes('2**Math.min(attempts,5)'));assert.ok(main.includes('listingRecoveryTimer=setInterval'));assert.ok(main.includes('Anúncio não encontrado em Meus anúncios'));});",
"test('recuperador legado permanece disponível sem timer global',()=>{const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');assert.ok(main.includes('recoverUnlistedPositionsTick'));assert.ok(main.includes('uncoveredRealPositions'));assert.ok(main.includes('executeLiveCreate(slot,listing,price'));assert.ok(main.includes('2**Math.min(attempts,5)'));assert.doesNotMatch(main,/listingRecoveryTimer=setInterval/);assert.ok(main.includes('Anúncio não encontrado em Meus anúncios'));});",
'recovery timer');

swap('alpha914-performance.test.js',
"  assert.match(src,/setInterval\\(\\(\\)=>\\{if\\(activeSection==='alpha'\\)void refreshAlpha\\(\\);\\},5000\\)/);",
"  assert.doesNotMatch(src,/setInterval\\(\\(\\)=>\\{if\\(activeSection==='alpha'\\)void refreshAlpha\\(\\);\\},5000\\)/);",
'hidden alpha timer');

swap('alpha96-hunt-intelligence.test.js',
"assert.match(renderer,/Melhor XP/);assert.match(renderer,/Melhor Gold/);",
"assert.match(renderer,/Melhor atual/);assert.match(renderer,/ABRIR HUNT INTELLIGENCE/);",
'hunt compact UI');

swap('shiny-integration.test.js',
"assert.match(main,/event\\.preventDefault\\(\\);await shinyTelemetry\\.close\\(\\)/);",
"assert.match(main,/await shinyTelemetry\\.close\\(\\)/);assert.match(main,/await flushRuntimePersistence112\\(\\)/);",
'async quit contract');

swap('sniper-integration.test.js',
"const main=read('main.js'),a=main.indexOf('async function executeLightningBuy'),b=main.indexOf('function intelligencePass',a);",
"const main=read('main.js'),a=main.indexOf('async function executeLightningBuy'),b=main.indexOf('const sniperIntelCache',a);",
'Lightning hot path boundary');

let parity=read('sniper-parity.test.js');
const parityOld="test('daily/hourly/rate and per-asset counters survive restart',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gridium-sniper11-')),file=path.join(dir,'state.json'),first=new SniperRuntime({persistenceFile:file}),ts=Date.now();first.attemptTimes=[ts];first.spend=[{at:ts,currency:'coins',amount:1234}];first.assetWins.set('pokemon:25:coins',1);first.save();first.close();const restored=new SniperRuntime({persistenceFile:file});assert.equal(restored.attemptTimes.length,1);assert.equal(restored.spend[0]?.amount,1234);assert.equal(restored.assetWins.get('pokemon:25:coins'),1);restored.close();fs.rmSync(dir,{recursive:true,force:true});});";
const parityNew="test('daily/hourly/rate and per-asset counters survive restart',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gridium-sniper11-')),file=path.join(dir,'state.json'),first=new SniperRuntime({persistenceFile:file}),ts=Date.now();first.attemptTimes=[ts];first.spend=[{at:ts,currency:'coins',amount:1234}];first.assetWins.set('pokemon:25:coins',1);await first.flush();const restored=new SniperRuntime({persistenceFile:file});assert.equal(restored.attemptTimes.length,1);assert.equal(restored.spend[0]?.amount,1234);assert.equal(restored.assetWins.get('pokemon:25:coins'),1);await restored.flush();fs.rmSync(dir,{recursive:true,force:true});});";
must(parity.includes(parityOld),'sniper parity async flush');write('sniper-parity.test.js',parity.replace(parityOld,parityNew));

let mainTest=read('main.test.js');
const quitStub="app.getPath=()=>tmp;app.whenReady=()=>({then:fn=>{ready=fn;}});app.quit=()=>{};";
const quitLifecycle="app.getPath=()=>tmp;app.whenReady=()=>({then:fn=>{ready=fn;}});app.quit=()=>{app.emit('before-quit',{});};";
must(mainTest.includes(quitStub),'main Electron quit stub');mainTest=mainTest.replace(quitStub,quitLifecycle);
const ctxOld=" const ctx={URL,require:name=>name==='electron'?electron:name.startsWith('./')?require(path.join(root,name)):require(name),__dirname:root,console,setInterval:(fn)=>{timers.push(fn);return timers.length;},clearInterval:()=>{}};";
const ctxNew=" const ctx={URL,require:name=>name==='electron'?electron:name.startsWith('./')?require(path.join(root,name)):require(name),__dirname:root,console,setInterval:(fn)=>{timers.push(fn);return timers.length;},clearInterval:()=>{},setTimeout,clearTimeout,setImmediate,clearImmediate};";
must(mainTest.includes(ctxOld),'main VM timing globals');mainTest=mainTest.replace(ctxOld,ctxNew);
const quitOld=" app.emit('before-quit');assert(fs.existsSync(path.join(tmp,'grid-statistics.json')));";
const quitNew=" app.emit('before-quit',{preventDefault(){}});await new Promise(resolve=>setTimeout(resolve,100));assert(fs.existsSync(path.join(tmp,'grid-statistics.json')));";
must(mainTest.includes(quitOld),'main async quit');write('main.test.js',mainTest.replace(quitOld,quitNew));

console.log('Gridium Alpha 11.2: contratos de regressão legados normalizados para timers removidos, snapshot core, hot path isolado e persistência assíncrona.');
