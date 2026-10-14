'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {computeShiny,probability}=require('./shiny-cloud-compute');
const NOW=1_800_000_000_000;
const bin=(attempts,ms=15*60_000)=>({at:NOW-1000,ms,attempts,kills:attempts,bodies:attempts});
function account({slot,hunt='forest',name='C'+(slot+1),attempts=120,lure=false,eligible=true,area='forest'}={}){
  return {id:String(slot+1),slot,name,online:true,inHunt:true,eligibility:{eligible,reason:eligible?'Roll shiny disponível':'Área sem roll shiny'},context:'p|'+lure+'|false|false|false',hunt:{slug:hunt,name:hunt,area},inventory:{1:500},boosts:{secretLure:lure,captureBoost:false,kickShiny:false,kickCapture:false,lureMs:lure?3_600_000:0,captureMs:0},farmMs:900000,totals:{attempts,normal:lure?0:attempts,lure:lure?attempts:0,unknown:0,seen:0,captured:0,escaped:0,started:NOW-900000},today:{attempts,seen:0,captured:0,escaped:0},bins:[bin(attempts)],huntGroups:[],species:['Pikachu'],recent:[]};
}
test('duas contas na mesma Hunt compartilham ritmo e chance sem misturar Lure',()=>{
  const out=computeShiny({at:NOW,preferences:{mode:'more'},accounts:[account({slot:0,attempts:120,lure:false}),account({slot:1,attempts:240,lure:true})]});
  const [a,b]=out.accounts;
  assert.equal(a.sharedGroup.participants,2);
  assert.equal(b.sharedGroup.participants,2);
  assert.equal(a.sharedGroup.rate,1440);
  assert.equal(a.sharedGroup.normalRate,480);
  assert.equal(a.sharedGroup.lureRate,960);
  assert.ok(Math.abs(a.chanceHour-probability(480,960))<1e-12);
  assert.equal(a.chanceHour,b.chanceHour);
  assert.equal(out.cloud.computed,true);
});
test('Hunts diferentes não são agrupadas',()=>{
  const out=computeShiny({at:NOW,accounts:[account({slot:0,hunt:'forest'}),account({slot:1,hunt:'cave'})]});
  assert.equal(out.accounts[0].sharedGroup.participants,1);
  assert.equal(out.accounts[1].sharedGroup.participants,1);
  assert.notEqual(out.accounts[0].sharedGroup.huntSlug,out.accounts[1].sharedGroup.huntSlug);
});
test('área sem shiny pausa cálculo mesmo com tentativas no buffer',()=>{
  const out=computeShiny({at:NOW,accounts:[account({slot:0,hunt:'outland',area:'outland',eligible:false,attempts:999,lure:true})]});
  const a=out.accounts[0];
  assert.equal(a.calculationEnabled,false);
  assert.match(a.status,/Cálculo pausado/);
  assert.equal(a.rate,null);
  assert.equal(a.chanceHour,null);
  assert.equal(a.eta50Ms,null);
  assert.equal(a.sharedGroup,null);
});
test('payload rejeita formato inválido',()=>assert.throws(()=>computeShiny({}),/invalid-shiny-payload/));
