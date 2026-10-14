'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {NetworkInspector}=require('../network-inspector');
const {SniperRuntime}=require('../sniper-runtime');

function attachedInspector(){
  const inspector=new NetworkInspector();
  const dbg=new EventEmitter();
  dbg.isAttached=()=>true;
  dbg.sendCommand=()=>Promise.resolve();
  dbg.detach=()=>{};
  const wc={debugger:dbg,isDestroyed:()=>false};
  assert.equal(inspector.attach(0,wc),true);
  return inspector;
}
function request(inspector,id){
  inspector._onMessage(0,'Network.requestWillBeSent',{requestId:String(id),type:'Fetch',request:{method:'GET',url:'https://pokeidle.io/api/long-session?id='+id}});
}

test('Alpha 11.4 libera byId de requisições concluídas em sessão longa',()=>{
  const inspector=attachedInspector();
  for(let i=0;i<10000;i++){
    request(inspector,i);
    inspector._onMessage(0,'Network.loadingFinished',{requestId:String(i)});
  }
  const state=inspector.states.get(0);
  assert.equal(state.byId.size,0);
  assert.ok(state.events.length<=5000,'buffer visual também deve permanecer limitado');
  inspector.close();
});

test('Alpha 11.4 libera byId em falha e limita requisições que nunca terminam',()=>{
  const inspector=attachedInspector();
  for(let i=0;i<3000;i++){
    request(inspector,'failed-'+i);
    inspector._onMessage(0,'Network.loadingFailed',{requestId:'failed-'+i,errorText:'net::ERR_ABORTED'});
  }
  assert.equal(inspector.states.get(0).byId.size,0);
  for(let i=0;i<6000;i++)request(inspector,'pending-'+i);
  assert.ok(inspector.states.get(0).byId.size<=2048,'índice de pendências precisa ter teto duro');
  inspector.close();
});

function configuredSniper(){
  const rt=new SniperRuntime({onDecision:async()=>({ok:false,error:'test-only'})});
  rt.configure({mode:'AUTO',killSwitch:false,policy:{rules:[{id:'all',enabled:true,query:'*',maxPrice:1000,currency:'gems',pokemon:true,shiny:true,items:true,stones:true}],risk:{reservePct:0,maxPerPurchaseGems:1000,maxPerMinute:120,maxPerAsset:100,hourlyBudgetGems:1000000,dailyBudgetGems:10000000},watchBeforeOpen:true,buyWhenOpen:true}});
  rt.gamePacket(0,{t:'welcome',estado:{id:'account-1',nick:'Conta 1',orbs:1000000,gold:1000000,servidorAgora:Date.now()}});
  return rt;
}
function prearmed(id,availableAt){
  return {listingId:String(id),assetType:'item',assetId:String(id),name:'Item '+id,currency:'gems',price:1,slot:0,at:Date.now(),availableAt};
}

test('Alpha 11.4 não deixa timer órfão quando a Watch Queue ultrapassa o limite',()=>{
  const rt=configuredSniper();
  try{
    const releaseAt=Date.now()+60000;
    for(let i=0;i<170;i++)rt.ingestOne(prearmed('pre-'+i,releaseAt+i));
    rt.snapshot();
    assert.ok(rt.watch.size<=160);
    assert.ok(rt.timers.size<=160);
    for(const key of rt.timers.keys())assert.ok(rt.watch.has(key),'todo timer precisa apontar para uma oportunidade viva');
    assert.ok(rt.metrics.failed>=10,'descartes por capacidade devem ser explícitos');
  }finally{rt.close();}
  assert.equal(rt.timers.size,0);
});

test('Alpha 11.4 mantém timers e fila limitados em rajadas repetidas',()=>{
  const rt=configuredSniper();
  try{
    for(let batch=0;batch<8;batch++){
      const base=Date.now()+120000+batch*1000;
      for(let i=0;i<200;i++)rt.ingestOne(prearmed('b'+batch+'-'+i,base+i));
      rt.snapshot();
      assert.ok(rt.watch.size<=160,'watch não pode crescer por tempo de execução');
      assert.ok(rt.timers.size<=160,'timers não podem crescer por tempo de execução');
      for(const key of rt.timers.keys())assert.ok(rt.watch.has(key));
    }
  }finally{rt.close();}
  assert.equal(rt.timers.size,0);
});
