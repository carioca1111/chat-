'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {NetworkInspector}=require('../network-inspector');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');

function wc(){
  const debuggerApi=new EventEmitter();
  debuggerApi.attach=()=>{};
  debuggerApi.detach=()=>{};
  debuggerApi.isAttached=()=>false;
  debuggerApi.sendCommand=async()=>{};
  return {isDestroyed:()=>false,debugger:debuggerApi};
}

test('Shiny não faz parte do snapshot global nem renderiza quando aba está fechada',()=>{
  const main=read('main.js'),renderer=read('renderer.js'),ui=read('shiny-ui.js');
  assert.doesNotMatch(main,/shiny\s*:\s*shinyTelemetry\?\.view/);
  assert.match(main,/handler\('grid:shiny-state'/);
  assert.doesNotMatch(renderer,/data\.shiny|current\?\.shiny/);
  assert.match(renderer,/ShinyAssistant\?\.setVisible/);
  assert.match(ui,/refreshTimer\s*=\s*setInterval/);
  assert.match(ui,/if \(!active \|\| refreshTimer\) return/);
  assert.match(ui,/else stopPolling\(\)/);
});

test('campo alimenta telemetria mas não é copiado para o buffer do NetworkInspector',()=>{
  const n=new NetworkInspector(),w=wc(),packets=[];
  n.onGamePacket=(slot,p)=>packets.push({slot,t:p.t});
  n.attach(0,w);n.setFocusSlots?.([0]);
  n._onMessage(0,'Network.webSocketCreated',{requestId:'socket',url:'wss://pokeidle.io/'});
  for(let i=0;i<500;i++){
    n._onMessage(0,'Network.webSocketFrameReceived',{requestId:'socket',response:{opcode:1,payloadData:JSON.stringify({t:'campo',mobs:[{s:i%20,n:'Poke',x:false}]})}});
  }
  assert.equal(packets.length,500);
  assert.equal(n.recent(0,{sinceMs:60_000,limit:900}).requests.filter(x=>x.phase==='frame').length,0);
  n.close();
});

test('batalha continua disponível ao protocolo e à telemetria sem perder eventos',()=>{
  const n=new NetworkInspector(),w=wc(),packets=[];
  n.onGamePacket=(slot,p)=>packets.push(p);
  n.attach(0,w);n.setFocusSlots?.([0]);
  n._onMessage(0,'Network.webSocketCreated',{requestId:'socket',url:'wss://pokeidle.io/'});
  const payload={t:'batalha',ev:[{k:'bola',slot:0,ballId:3,shiny:true,sucesso:true}]};
  n._onMessage(0,'Network.webSocketFrameReceived',{requestId:'socket',response:{opcode:1,payloadData:JSON.stringify(payload)}});
  assert.equal(packets.length,1);
  assert.equal(packets[0].ev[0].shiny,true);
  const frames=n.recent(0,{sinceMs:60_000,limit:50}).requests.filter(x=>x.phase==='frame');
  assert.equal(frames.length,1);
  assert.equal(frames[0].postData.t,'batalha');
  n.close();
});

test('fonte do inspector possui caminho rápido e reutiliza pacote parseado',()=>{
  const net=read('network-inspector.js');
  assert.match(net,/GAME_FRAME_TYPE_RE/);
  assert.match(net,/__gridiumGamePacket/);
  assert.match(net,/packet\.t==='campo'\|\|packet\.t==='campo\.init'/);
});

test('persistência pesada é limitada sem atrasar shiny, configuração ou fechamento',()=>{
  const src=read('shiny-telemetry.js');
  assert.match(src,/minSaveInterval\s*=\s*60_000/);
  assert.match(src,/async save\(force = false\)/);
  assert.match(src,/!force && this\.lastSavedAt/);
  assert.ok((src.match(/this\.save\(true\)/g)||[]).length>=3);
});
