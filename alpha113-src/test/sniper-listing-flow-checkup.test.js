'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {SniperRuntime}=require('../sniper-runtime');

function account(rt, now=Date.now()){
  rt.gamePacket(0,{t:'estado',estado:{id:'account-1',nick:'Conta 1',gold:1_000_000,orbs:10_000,servidorAgora:now}},now);
}
function configureLikeScreenshot(rt){
  rt.configure({mode:'OBSERVE',killSwitch:false,policy:{rules:[{id:'lightning',enabled:true,query:'*',maxPrice:80000,currency:'coins',pokemon:true,shiny:true,items:false,stones:false}],risk:{reservePct:20,maxPerPurchaseCoins:2_000_000,maxPerMinute:3,maxPerAsset:3,hourlyBudgetCoins:5_000_000,dailyBudgetCoins:15_000_000,blockOwn:true,blockDuplicate:true,respectRateLimits:true},watchBeforeOpen:true,buyWhenOpen:true,priorityMax:true}});
}
function pokemonRow(id,{price=30,shiny=false,availableAt=0}={}){
  return {id:String(id),preco:price,moeda:'gold',tipo:'pokemon',pokemonId:25,qtd:1,vendedor:'Seller',vendedorId:'seller-9',compravelEm:availableAt,criadoEm:Date.now(),ficha:{id:'pk-'+id,speciesId:25,nome:'Pikachu',level:10,shiny}};
}

test('raw PokeIdle market listing reaches Radar queue and TERIA COMPRADO feed',()=>{
  const rt=new SniperRuntime();const now=Date.now();account(rt,now);configureLikeScreenshot(rt);
  rt.gamePacket(0,{t:'market',aba:'listar',linhas:[pokemonRow('raw-ready',{price:30})]},now+1);
  const s=rt.snapshot();
  assert.equal(s.metrics.events,1);assert.equal(s.metrics.matches,1);assert.equal(s.metrics.opportunities,1);
  assert.equal(s.watchQueue.length,1);assert.equal(s.watchQueue[0].listing.listingId,'raw-ready');assert.equal(s.watchQueue[0].state,'READY');
  assert.match(s.feed[0].message,/TERIA COMPRADO/);
});

test('pre-release raw listing is visible in Watch Queue as WATCHING',()=>{
  const rt=new SniperRuntime();const now=Date.now();account(rt,now);configureLikeScreenshot(rt);
  rt.gamePacket(0,{t:'market',aba:'listar',anuncios:[pokemonRow('raw-watching',{price:10,availableAt:now+30_000})]},now+2);
  const s=rt.snapshot();assert.equal(s.watchQueue.length,1);assert.equal(s.watchQueue[0].state,'WATCHING');assert.ok(s.watchQueue[0].delayMs>0);
});

test('shiny Pokemon raw listing also reaches queue with screenshot filters',()=>{
  const rt=new SniperRuntime();const now=Date.now();account(rt,now);configureLikeScreenshot(rt);
  rt.gamePacket(0,{t:'market',aba:'pokemon',ofertas:[pokemonRow('raw-shiny',{price:100,shiny:true})]},now+3);
  const s=rt.snapshot();assert.equal(s.watchQueue.length,1);assert.equal(s.watchQueue[0].listing.pokemon.shiny,true);
});

test('species catalog summary is intentionally not treated as a buyable listing',()=>{
  const rt=new SniperRuntime();const now=Date.now();account(rt,now);configureLikeScreenshot(rt);
  rt.gamePacket(0,{t:'market',aba:'especies',linhas:[{speciesId:25,nome:'Pikachu',anuncios:12,shinys:1,minGold:30,minOrb:1}]},now+4);
  const s=rt.snapshot();assert.equal(s.metrics.events,0);assert.equal(s.watchQueue.length,0);
});

test('Sniper UI renders non-terminal watchQueue rows in the visible queue',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'..','sniper-ui.js'),'utf8');
  assert.match(ui,/s\?\.sniper\?\.watchQueue\|\|\[\]/);
  assert.match(ui,/filter\(x=>!\['WON','LOST','FAILED'\]\.includes\(x\.state\)\)/);
  assert.match(ui,/setHTML\('msQueue'/);
  assert.match(ui,/listing\?\.listingId/);
});
