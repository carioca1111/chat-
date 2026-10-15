'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../hunt-visual-model');
const {HuntVisualStore}=require('../hunt-visual-store');

function legacyIntel(now){
  const hunt={huntSlug:'forest',name:'Floresta',xpPerHour:248000,goldPerHour:18400,observedMs:20*60000,observedMinutes:20,samples:8,lastAt:now,confidence:'moderada',confidenceDetails:{score:.55,label:'moderada',observedMinutes:20,samples:8}};
  return {currentHunt:'forest',lastAt:now,identity:{id:'A',nick:'Conta A'},profile:{id:6,speciesId:6,name:'Charizard',level:82,ivs:{hp:24,atk:28}},periods:{'60':{minutes:60,hunts:[hunt]}},hunts:[hunt],series:[{at:now-60000,huntSlug:'forest',xpPerHour:240000,goldPerHour:18000},{at:now,huntSlug:'forest',xpPerHour:248000,goldPerHour:18400}]};
}
function liveRow(now){return {status:'online',health:'online',record:{nick:'Conta A',updated:now,ms:3600000,values:{xpTreinador:248000,gold:18400},live:{browserOnline:true,location:'forest',trainerXp:72,trainerXpMax:100}}};}

test('UI usa Hunt Intelligence existente quando coletor visual ainda não recebeu pacote compatível',()=>{
  const now=Date.now(),state={accounts:[{current:{location:'forest'},intelligence:legacyIntel(now)}]},data={rows:[liveRow(now)]};
  const s=M.accountSnapshot(0,state,data,60,'xp',now);
  assert.equal(s.connection.online,true);
  assert.equal(s.name,'Conta A');
  assert.equal(s.profile.name,'Charizard');
  assert.equal(s.hunt,'forest');
  assert.equal(s.xpPerHour,248000);
  assert.equal(s.goldPerHour,18400);
  assert.equal(Math.round(s.progress.pct),72);
  assert.equal(s.period.hunts[0].name,'Floresta');
});

test('coletor visual vazio ou atrasado não apaga dados reais saudáveis da conta',()=>{
  const now=Date.now(),state={visual:{catalog:[],accounts:[{slot:0,id:'A',name:'Conta A',connected:true,lastAt:now-30000,hunt:'forest',profile:null,windows:{60:{current:{ms:0},hunts:[],chart:[]}}}]},accounts:[{current:{location:'forest'},intelligence:legacyIntel(now)}]},data={rows:[liveRow(now)]};
  const s=M.accountSnapshot(0,state,data,60,'xp',now);
  assert.equal(s.connection.online,true);
  assert.equal(s.profile.name,'Charizard');
  assert.equal(s.xpPerHour,248000);
  assert.equal(s.series.length,2);
});

test('offline explícito continua fail-closed e não mostra rendimento atual',()=>{
  const now=Date.now(),state={accounts:[{intelligence:legacyIntel(now)}]},data={rows:[{status:'offline',health:'offline',record:{nick:'Conta A',updated:now,live:{browserOnline:false}}}]};
  const s=M.accountSnapshot(0,state,data,60,'xp',now);
  assert.equal(s.connection.online,false);
  assert.equal(s.xpPerHour,null);
  assert.equal(s.goldPerHour,null);
});

test('presença visual tolera intervalos normais sem marcar conta offline em 15 segundos',()=>{
  const now=Date.now(),store=new HuntVisualStore();
  store.frame(0,{t:'welcome',estado:{id:'A',nick:'Conta A',huntSlug:'forest',activeId:6,pokemons:[{id:6,speciesId:6,nome:'Charizard',level:82}]},hunts:[{slug:'forest',nome:'Floresta'}]},now);
  assert.equal(store.view(now+60000).accounts[0].connected,true);
  assert.equal(store.view(now+121000).accounts[0].connected,false);
});
