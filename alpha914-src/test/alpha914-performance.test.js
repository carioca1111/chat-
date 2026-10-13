'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {signature,createCoalescedPublisher}=require('../perf-runtime');
const {AlphaEngine}=require('../alpha-engine');

test('publisher agrupa rajadas sem perder o estado mais recente',()=>{
  let scheduled=null,builds=0,sends=0,revision=0,last=null;
  const publisher=createCoalescedPublisher({
    delayMs:32,
    schedule:fn=>{scheduled=fn;return 1;},
    cancel:()=>{},
    now:(()=>{let n=0;return()=>++n;})(),
    build:()=>({revision,build:++builds}),
    send:value=>{sends++;last=value;}
  });
  for(let i=1;i<=100;i++){revision=i;publisher.request();}
  assert.equal(builds,0);
  assert.equal(sends,0);
  assert.equal(publisher.stats().coalesced,99);
  scheduled();
  assert.equal(builds,1);
  assert.equal(sends,1);
  assert.equal(last.revision,100);
});

test('assinatura ignora somente timestamp de carregamento e detecta dado real',()=>{
  const a={balance:{coins:10,gems:2},_loadedAt:1,positions:[{id:'x',mark:4}]};
  const b={balance:{coins:10,gems:2},_loadedAt:999,positions:[{id:'x',mark:4}]};
  const c={balance:{coins:10,gems:2},_loadedAt:999,positions:[{id:'x',mark:5}]};
  assert.equal(signature(a),signature(b));
  assert.notEqual(signature(b),signature(c));
});

test('AlphaEngine.view reutiliza as leituras completas síncronas de SQLite',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gridium-alpha914-'));
  const file=path.join(dir,'alpha.sqlite');
  const engine=new AlphaEngine(file);
  const original=engine._rows.bind(engine);
  let fullReads=0;
  engine._rows=(table)=>{fullReads++;return original(table);};
  const state=engine.view();
  assert.ok(state&&state.accounts&&state.professional);
  assert.ok(fullReads<=2,`view fez ${fullReads} leituras completas; esperado no máximo 2`);
  engine.close();
  fs.rmSync(dir,{recursive:true,force:true});
});

test('renderer não reconstrói Alpha escondido nem pede alphaState a cada grid:update',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8');
  assert.match(src,/function scheduleAlphaRender\(/);
  assert.match(src,/activeSection!=='alpha'/);
  assert.doesNotMatch(src,/if\(activeSection==='alpha'\)void refreshAlpha\(\);/);
  assert.match(src,/requestAnimationFrame/);
});

test('main agrupa publish sem alterar scanner, WebSocket ou proteções de ordem',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
  assert.match(src,/createCoalescedPublisher/);
  assert.match(src,/function publish\(options=\{\}\)/);
  assert.match(src,/isOwnAccountListing/);
  assert.match(src,/alphaCoreProcess/);
  assert.match(src,/sniperRuntime/);
});

test('recursos obrigatórios de UI e leitura segura continuam presentes',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const renderer=fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8');
  for(const token of ['data-layout="grid"','data-layout="duo"','data-layout="focus"','liveEcoMode'])assert.ok(html.includes(token),token);
  for(const token of ['SEM ANÚNCIO','estimativa, não garantida','zoom-plus','marketConcurrency'])assert.ok(renderer.includes(token),token);
  assert.ok(html.includes('Coins')||renderer.includes('Coins'));
  assert.ok(html.includes('Gems')||renderer.includes('Gems'));
  assert.ok(html.includes('Diamonds')||renderer.includes('Diamonds')||html.includes('Diamantes')||renderer.includes('Diamantes'));
});
