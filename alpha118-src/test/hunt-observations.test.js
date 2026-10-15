'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {HuntVisualStore}=require('../hunt-visual-store');
const M=require('../hunt-visual-model');
const T=Math.floor(Date.now()/60000)*60000-12*60000;
const welcome=(id='a',pokemonId=1)=>({t:'welcome',estado:{id,nick:id,activeId:pokemonId,huntSlug:'real-hunt',pokemons:[{id:pokemonId,speciesId:6,nome:'Charizard',level:30,shiny:true}]},hunts:[{slug:'real-hunt',nome:'Floresta real'}]});
const battle={t:'batalha',ev:[{k:'morte',quem:'selvagem',xpTreinador:100,ouro:10}]};
function feed(s,slot=0,start=T,n=72){for(let i=1;i<=n;i++)s.frame(slot,battle,start+i*5000);}
test('four identities; only explicit battle income, trainer XP crosses levels without counter reset',()=>{
 const s=new HuntVisualStore();for(let i=0;i<4;i++){s.frame(i,welcome('a'+i),T);feed(s,i);s.frame(i,{t:'estado',estado:{gold:999999,xp:0,level:99}},T+365000);}
 const v=s.view(T+370000);assert.equal(v.accounts.length,4);assert.equal(v.accounts[0].windows[60].current.gold,710);assert.equal(v.accounts[0].windows[60].current.xp,7100);assert.equal(v.accounts[0].profile.shiny,true);
 assert.equal(s.frame(0,{t:'market',gold:999},T+371000),false);
});
test('repeated callback cannot duplicate reward; unknown reward is null, not zero',()=>{
 const s=new HuntVisualStore();s.frame(0,welcome(),T);s.frame(0,battle,T+5000);s.frame(0,battle,T+5000);assert.equal(s.accounts.get('a').bins[0].kills,1);
 s.frame(0,{t:'batalha',ev:[{k:'morte',quem:'selvagem'}]},T+10000);feed(s,0,T+10000,15);
 assert.equal(s.view(T+90000).accounts[0].windows[60].current.gold,null);
});
test('unknown active Pokemon never picks highest level; switches isolate profile and level',()=>{
 const s=new HuntVisualStore();s.frame(0,welcome(),T);feed(s);s.frame(0,{t:'estado',estado:{activeId:2}},T+365000);assert.equal(s.view(T+365000).accounts[0].profile,null);
 s.frame(0,{t:'estado',estado:{pkMud:[{id:2,speciesId:143,nome:'Snorlax',level:60}]}},T+370000);assert.equal(s.view(T+370000).accounts[0].windows[60].current.ms,0);
 s.frame(0,{t:'estado',estado:{pkMud:[{id:2,level:61}]}},T+375000);assert.equal(s.view(T+375000).accounts[0].windows[60].current.ms,0);
});
test('same slot different account cannot inherit samples, nick, objectives or identity',()=>{
 const s=new HuntVisualStore();s.frame(0,welcome('first'),T);feed(s);s.frame(0,welcome('second'),T+365000);
 const v=s.view(T+365000);assert.equal(v.accounts[0].id,'second');assert.equal(v.accounts[0].windows[60].current.ms,0);
});
test('hunt change and disconnect close measurement; stale disconnected rates excluded from totals',()=>{
 const s=new HuntVisualStore();s.frame(0,welcome(),T);feed(s);s.frame(0,{t:'estado',estado:{huntSlug:'other'}},T+365000);
 assert.equal(s.view(T+365000).accounts[0].windows[60].current.ms,0);s.disconnect(0);
 assert.equal(s.frame(0,battle,T+370000),false);
 const snap=M.accountSnapshot(0,{visual:s.view(T+375000)},{},60,'xp',T+375000);assert.equal(snap.xpPerHour,null);assert.equal(M.totals([snap]).xpContributors,0);
});
test('short or missing competitor cannot yield recommendation and null cannot be treated as zero',()=>{
 const h={huntSlug:'x',observedMs:600000,observedMinutes:10,samples:10,confidenceDetails:{score:.5},xpPerHour:null,goldPerHour:null};assert.equal(M.recommend([h],'xp').status,'empty');
 const a={...h,xpPerHour:100},b={...h,huntSlug:'y',xpPerHour:50,observedMinutes:1};assert.equal(M.recommend([a,b]).status,'collecting');
});
test('restart retains history but does not restore stale live sessions; no downtime is counted',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hunt-')),file=path.join(dir,'state.json');try{
 const s=new HuntVisualStore(file);s.frame(0,welcome(),T);feed(s);await s.flush();const r=new HuntVisualStore(file);assert.equal(r.accounts.get('a').bins.length>0,true);assert.equal(r.view(T+400000).accounts[0].connected,false);
 r.frame(0,welcome(),T+400000);assert.equal(r.view(T+400000).accounts[0].windows[60].current.ms,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('bounded bins, identities and dedup history over long sessions',()=>{
 const s=new HuntVisualStore();s.frame(0,welcome(),T);for(let i=1;i<20000;i++)s.frame(0,battle,T+i*5000);
 assert.ok(s.accounts.get('a').bins.length<=1440);assert.ok(s.slots[0].seen.size<=128);
 for(let i=0;i<40;i++)s.frame(0,welcome('id'+i),T+100000000+i);assert.ok(s.accounts.size<=16);
});
test('out of order state cannot roll back identity or hunt',()=>{
 const s=new HuntVisualStore();s.frame(0,welcome('a'),T);feed(s);s.frame(0,{t:'estado',estado:{huntSlug:'old'}},T+1);assert.equal(s.slots[0].state.huntSlug,'real-hunt');
});
