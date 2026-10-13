'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SniperRuntime}=require('../sniper-runtime');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const listing=(id,overrides={})=>({at:Date.now(),slot:0,listingId:String(id),assetType:'pokemon',assetId:'25',name:'Pikachu',currency:'coins',price:10,...overrides});

test('fails closed when there are no rules',()=>{
  const s=new SniperRuntime();s.configure({mode:'OBSERVE',policy:{rules:[]}});s.ingest([listing(1)]);const snap=s.snapshot();assert.equal(snap.metrics.events,1);assert.equal(snap.metrics.matches,0);assert.equal(snap.metrics.ignored,1);s.close();
});

test('matches exact and wildcard rules without history or book',()=>{
  const s=new SniperRuntime();s.configure({mode:'OBSERVE',policy:{rules:[{query:'Pikachu',assetType:'pokemon',currency:'coins',maxPrice:12,shiny:'any'}]}});s.ingest([listing(2)]);const snap=s.snapshot();assert.equal(snap.metrics.matches,1);assert.equal(snap.feed[0].status,'MATCH');assert.equal(snap.activeEngine,'direct');assert.ok(snap.metrics.lastDecisionMs>=0);s.close();
});

test('rejects an offer above rule ceiling',()=>{
  const s=new SniperRuntime();s.configure({mode:'OBSERVE',policy:{rules:[{query:'*',assetType:'pokemon',currency:'coins',maxPrice:9,shiny:'any'}]}});s.ingest([listing(3,{price:10})]);assert.equal(s.snapshot().metrics.matches,0);s.close();
});

test('AUTO can execute different accounts in parallel',async()=>{
  const calls=[];const s=new SniperRuntime({onDecision:async({listing:l})=>{calls.push(l.slot);await sleep(5);return {ok:true,outcome:{ok:true,price:l.price}};}});
  s.configure({mode:'AUTO',killSwitch:false,policy:{maxPerMinute:20,maxPerAsset:5,hourlyBudgetCoins:1000,dailyBudgetCoins:1000,rules:[{query:'*',assetType:'pokemon',currency:'coins',maxPrice:20,shiny:'any'}]}});
  s.ingest([listing(4,{slot:0}),listing(5,{slot:1})]);await sleep(30);const snap=s.snapshot();assert.deepEqual(calls.sort(),[0,1]);assert.equal(snap.metrics.attempts,2);assert.equal(snap.metrics.wins,2);s.close();
});

test('duplicate listing id is processed only once',()=>{
  const s=new SniperRuntime();s.configure({mode:'OBSERVE',policy:{rules:[{query:'*',assetType:'pokemon',currency:'coins',maxPrice:20,shiny:'any'}]}});const x=listing(6);s.ingest([x]);s.ingest([x]);assert.equal(s.snapshot().metrics.events,1);s.close();
});
