'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');

test('Alpha 11.2 usa snapshot core sem estados pesados legados',()=>{
  const main=read('main.js'),pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'3.0.0-alpha.11.2');
  const a=main.indexOf('function snapshot()'),b=main.indexOf('const statePublisher112',a),snap=main.slice(a,b);
  assert.ok(a>0&&b>a);for(const forbidden of ['alphaSnapshot()','huntView()','marketProtocolSummary()','autoTraderStatus()','autopilotPublicState()'])assert.doesNotMatch(snap,new RegExp(forbidden.replace(/[()]/g,'\\$&')));
  assert.match(main,/grid:remote-status/);assert.doesNotMatch(main,/remoteSync\.push\([^\n]+then\(\(\)=>publish\(\)\)/);
});

test('renderer faz trabalho pesado somente para a seção ativa',()=>{
  const r=read('renderer.js');
  assert.match(r,/if\(activeSection==='hunt'\)\{void refreshHunt112\(\);return;\}/);
  assert.match(r,/if\(activeSection!=='dashboard'\)return;/);
  assert.match(r,/if\(activeSection!=='dashboard'\|\|extrasBusy\)return/);
  assert.match(r,/MarketSniper\?\.setVisible/);assert.match(r,/ShinyAssistant\?\.setVisible/);
  assert.doesNotMatch(r,/setInterval\(\(\)=>\{if\(current\)renderRemote\(current\);\},1000\)/);
});

test('Quality reduz render de webview invisível sem destruir sessão',()=>{
  const main=read('main.js');
  assert.match(main,/profile==='quality'/);assert.match(main,/visible\?\(layout==='duo'\?40:30\):4/);
  assert.match(main,/minimized\)return \{fps:2/);assert.doesNotMatch(main,/profile==='quality'\)return \{fps:60/);
  assert.doesNotMatch(main,/destroy\(\).*performancePlan|performancePlan[\s\S]{0,500}\.loadURL/);
});

test('Sniper UI é event-driven e Relâmpago não recebe worker ou cloud no hot path',()=>{
  const ui=read('sniper-ui.js'),main=read('main.js'),runtime=read('sniper-runtime.js'),preload=read('preload.js');
  assert.doesNotMatch(ui,/setInterval\(refresh,600\)|setInterval\(refreshIntel,3500\)/);
  assert.match(ui,/onSniper/);assert.match(preload,/onSniper:/);assert.match(main,/grid:sniper-event/);assert.match(main,/sniperIntelCache/);
  const a=runtime.indexOf('ingestOne('),b=runtime.indexOf('_schedule(',a),hot=runtime.slice(a,b);assert.ok(a>0&&b>a);assert.doesNotMatch(hot,/evaluateListingsInWorker|fetch\(|SQLite|sqlite|cloud/);
  for(const ipc of ['grid:sniper-state','grid:sniper-config','grid:sniper-arm','grid:sniper-kill','grid:sniper-intelligence','grid:sniper-manual-buy'])assert.match(main,new RegExp(ipc));
});

test('Hunt é cacheado e renderizado por conta com keyed rows',()=>{
  const main=read('main.js'),r=read('renderer.js');
  assert.match(main,/huntRevision112/);assert.match(main,/huntCache112/);assert.match(main,/lastAccountPacketAt112/);
  assert.match(r,/patchKeyedRows/);assert.match(r,/signatureOf=x=>JSON\.stringify/);assert.match(r,/ABRIR HUNT INTELLIGENCE/);
});

test('persistência de runtime sai do writeFileSync e mantém atomic rename/flush',()=>{
  const main=read('main.js'),runtime=read('sniper-runtime.js');
  const a=main.indexOf('function save()'),b=main.indexOf('function saveHistory',a),block=main.slice(a,b);assert.ok(a>0&&b>a);assert.doesNotMatch(block,/writeFileSync/);assert.match(main,/atomicWrite112/);assert.match(main,/fs\.promises\.rename/);
  const s=runtime.indexOf('save(force=false)'),e=runtime.indexOf('configure(',s),rb=runtime.slice(s,e);assert.ok(s>0&&e>s);assert.doesNotMatch(rb,/writeFileSync/);assert.match(rb,/fs\.promises\.writeFile/);assert.match(rb,/riskRuntime/);assert.match(runtime,/async flush\(\)/);
});

test('telemetria de performance fica desligada por padrão',()=>{
  const r=read('renderer.js');assert.match(r,/gridiumDiagnostics/);assert.match(r,/alpha916Diagnostics&&window\.GridiumUltra/);assert.match(r,/if\(alpha916Diagnostics\)setInterval/);
});

test('Auto Trader e recovery legados não mantêm timers globais',()=>{
  const main=read('main.js');assert.match(main,/autoTradingTimer=null;listingRecoveryTimer=null/);assert.doesNotMatch(main,/autoTradingTimer=setInterval/);assert.doesNotMatch(main,/listingRecoveryTimer=setInterval/);
  assert.match(main,/async function autoTradingTick\(\)\{return;\}/);
});
