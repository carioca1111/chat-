'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {SniperRuntime}=require(path.join(root,'sniper-runtime'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const listing=(id,extra={})=>({listingId:String(id),assetType:'item',assetId:String(20+Number(id)%5),name:'Stone '+id,currency:'gems',price:10,slot:0,at:Date.now(),...extra});
function readyRuntime(onDecision,{accounts=4,canUseSlot=null}={}){
  const s=new SniperRuntime({onDecision,canUseSlot});
  s.configure({mode:'AUTO',killSwitch:false,buyWhenOpen:true,watchBeforeOpen:true,rules:[{enabled:true,maxPrice:1000}],risk:{reservePct:0,maxPerMinute:120,maxPerAsset:100,hourlyBudgetGems:100000,dailyBudgetGems:100000,respectRateLimits:false}});
  for(let slot=0;slot<accounts;slot++)s.gamePacket(slot,{t:'welcome',estado:{id:'acc-'+slot,nick:'C'+(slot+1),orbs:100000,gold:100000,servidorAgora:Date.now()}},Date.now());
  return s;
}

test('Alpha 11.6 só marca SENT depois do callback de despacho real',async()=>{
  let release,dispatch;const gate=new Promise(r=>release=r),seen=[];
  const s=readyRuntime(async ctx=>{seen.push(ctx);dispatch=ctx.onDispatch;return gate;});
  try{s.ingestOne(listing(1));await new Promise(setImmediate);assert.equal(s.watch.get('1').state,'PREPARED');assert.equal(s.metrics.attempts,0);dispatch({at:Date.now(),transport:'direct',fastPath:true});assert.equal(s.watch.get('1').state,'SENT');assert.equal(s.metrics.attempts,1);release({ok:true,dispatched:true,outcome:{done:true,ok:true,price:10,at:Date.now()}});await new Promise(setImmediate);assert.equal(s.watch.get('1').state,'WON');}finally{s.close();}
});

test('dois anúncios simultâneos redistribuem para contas livres sem fanout',async()=>{
  const gates=[],calls=[];const s=readyRuntime(ctx=>new Promise(resolve=>{calls.push({slot:ctx.listing.slot,id:ctx.listing.listingId});ctx.onDispatch({at:Date.now(),transport:'direct'});gates.push(()=>resolve({ok:true,dispatched:true,outcome:{done:true,ok:true,price:10,at:Date.now()}}));}));
  try{s.ingestOne(listing(10));s.ingestOne(listing(11));await new Promise(setImmediate);assert.deepEqual(calls.map(x=>x.slot),[0,1]);assert.equal(new Set(calls.map(x=>x.id)).size,2);gates.splice(0).forEach(fn=>fn());await new Promise(setImmediate);}finally{s.close();}
});

test('quatro anúncios simultâneos usam no máximo uma conta por tentativa',async()=>{
  const releases=[],slots=[];const s=readyRuntime(ctx=>new Promise(resolve=>{slots.push(ctx.listing.slot);ctx.onDispatch({at:Date.now(),transport:'direct'});releases.push(()=>resolve({ok:true,dispatched:true,outcome:{done:true,ok:true,price:10,at:Date.now()}}));}));
  try{for(let i=20;i<24;i++)s.ingestOne(listing(i));await new Promise(setImmediate);assert.deepEqual([...slots].sort((a,b)=>a-b),[0,1,2,3]);assert.equal(new Set(slots).size,4);releases.forEach(fn=>fn());await new Promise(setImmediate);}finally{s.close();}
});

test('conta externamente ocupada é descartada antes do despacho',async()=>{
  const slots=[];const s=readyRuntime(async ctx=>{slots.push(ctx.listing.slot);ctx.onDispatch({at:Date.now(),transport:'direct'});return {ok:true,dispatched:true,outcome:{done:true,ok:true,price:10,at:Date.now()}}},{canUseSlot:slot=>slot!==0});
  try{s.ingestOne(listing(30));await new Promise(setImmediate);assert.deepEqual(slots,[1]);}finally{s.close();}
});

test('atualização de availableAt substitui timer antigo e reprograma sem busy wait',async()=>{
  let calls=0;const s=readyRuntime(async ctx=>{calls++;ctx.onDispatch({at:Date.now(),transport:'direct'});return {ok:true,dispatched:true,outcome:{done:true,ok:true,price:10,at:Date.now()}}});
  try{const t=Date.now();s.ingestOne(listing(40,{availableAt:t+120}),t);await wait(10);s.ingestOne(listing(40,{availableAt:t+35,price:9}),Date.now());await wait(70);assert.equal(calls,1);assert.equal(s.timers.size,0);assert.equal(s.watch.get('40').listing.price,9);}finally{s.close();}
});

test('relógio do servidor registra incerteza e reajusta pré-armado',async()=>{
  let calls=0;const s=readyRuntime(async ctx=>{calls++;ctx.onDispatch({at:Date.now(),transport:'direct'});return {ok:true,dispatched:true,outcome:{done:true,ok:true,price:10,at:Date.now()}}});
  try{const t=Date.now();s.gamePacket(0,{t:'estado',estado:{id:'acc-0',orbs:100000,servidorAgora:t}},t);s.ingestOne(listing(50,{availableAt:t+90}),t);await wait(10);const t2=Date.now();s.gamePacket(0,{t:'estado',estado:{id:'acc-0',servidorAgora:t2+40}},t2);const info=s._clockInfo(0);assert.ok(info.samples>=2);assert.ok(info.uncertaintyMs>=1);await wait(100);assert.equal(calls,1);assert.ok(Number.isFinite(s.watch.get('50').timing.timerLagMs));}finally{s.close();}
});

test('timeout desconhecido pode ser reconciliado tardiamente sem segunda compra',async()=>{
  let calls=0;const s=readyRuntime(async ctx=>{calls++;ctx.onDispatch({at:Date.now(),transport:'direct'});return {ok:false,dispatched:true,unknown:true,outcome:{done:true,ok:false,unknown:true,error:'timeout'}};});
  try{s.ingestOne(listing(60));await new Promise(setImmediate);assert.equal(s.watch.get('60').state,'UNKNOWN');assert.equal(calls,1);const row=s.reconcileUnknown('60',{done:true,ok:true,price:10,at:Date.now()});assert.equal(row.state,'WON');assert.equal(calls,1);assert.equal(s.spend.length,1);}finally{s.close();}
});

test('fonte 11.6 remove view do liveValidation e polling 140ms do waitMarketOutcome',()=>{
  const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
  const validation=main.match(/function liveValidationReady\(\)\{[^}]+\}/)?.[0]||'';assert.doesNotMatch(validation,/\.view\(/);assert.match(validation,/alphaEngine\?\.validation/);
  const waitFn=main.match(/async function waitMarketOutcome[\s\S]*?\n\}/)?.[0]||'';assert.doesNotMatch(waitFn,/sleep\(140\)/);assert.match(main,/beginMarketOutcomeWait/);assert.match(main,/notifyMarketOutcomePacket\(slot,packet,at\)/);
});

test('transporte ambíguo não cai em sendMarketCommand para reenviar',()=>{
  const main=fs.readFileSync(path.join(root,'main.js'),'utf8');const start=main.indexOf('async function sendLightningMarketCommand'),end=main.indexOf('async function executeLightningBuy',start),body=main.slice(start,end);assert.doesNotMatch(body,/sendMarketCommand\(/);assert.match(body,/unknownDispatch/);assert.match(body,/não será reenviado automaticamente/);
});
