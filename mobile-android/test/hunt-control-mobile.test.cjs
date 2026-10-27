const test=require('node:test');
const assert=require('node:assert/strict');
const HC=require('../app/src/main/assets/hunt-control-mobile.js');
function row(id,hunt,session){return{gridium2:{hunt:{profile:{huntSlug:hunt,speciesName:'Testmon'},session}},record:{nick:'Conta '+id}}}

test('agrega Hunt Control e projeta poções -> revives -> Centro igual ao desktop',()=>{
  const now=2*60*60*1000;
  const rows=[row(1,'outland-02',{sessionStartedAt:now-2*60*60*1000,capturesTotal:100,capturesLastHour:60,killsEstimatedTotal:1000,killsEstimatedLastHour:600,capturesByPotency:[70,20,7,2,1],shiniesSeen:2,shiniesCaught:1,potionStock:30,potionsUsedTotal:20,potionsUsedLastHour:10,reviveStock:8,revivesUsedTotal:4,revivesUsedLastHour:2}),row(2,'outland-02',{sessionStartedAt:now-2*60*60*1000,capturesTotal:80,capturesLastHour:40,killsEstimatedTotal:800,killsEstimatedLastHour:400,capturesByPotency:[60,15,4,1,0],shiniesSeen:1,shiniesCaught:0,potionStock:20,potionsUsedTotal:10,potionsUsedLastHour:10,reviveStock:7,revivesUsedTotal:2,revivesUsedLastHour:1})];
  const a=HC.aggregate(rows,now);
  assert.equal(a.captures,180);assert.equal(a.capturesPerHour,100);assert.equal(a.kills,1800);assert.equal(a.killsPerHour,1000);
  assert.deepEqual(a.potency,[130,35,11,3,1]);assert.equal(a.shiniesSeen,3);assert.equal(a.shiniesCaught,1);
  assert.equal(a.potionStock,50);assert.equal(a.potionsPerHour,20);assert.equal(a.reviveStock,15);assert.equal(a.revivesPerHour,3);
  const p=HC.sustain(a);assert.equal(p.potionEtaHours,2.5);assert.equal(p.revivesAfterPotions,8);assert.ok(Math.abs(p.centerEtaHours-5)<1e-9);
  const g=HC.goals(a,25000,1000000);assert.equal(g.captureRemaining,24820);assert.equal(g.killRemaining,998200);assert.ok(g.captureProgress>0&&g.captureProgress<1);
  const groups=HC.groups(rows);assert.equal(groups.length,1);assert.deepEqual(groups[0].indexes,[0,1]);
});

test('quando revive ainda não tem ritmo mostra apenas ETA mínimo',()=>{
  const a={potionStock:12,potionsPerHour:6,reviveStock:10,revivesPerHour:0,sessionHours:1,capturesPerHour:50};
  const p=HC.sustain(a);assert.equal(p.potionEtaHours,2);assert.equal(p.revivesAfterPotions,10);assert.equal(p.centerEtaHours,Infinity);assert.equal(p.minimumCenterEtaHours,2);
  assert.equal(HC.health(a,p).state,'good');
});

test('taxa usa média da sessão antes de uma hora e última hora depois',()=>{
  const now=10_000_000;
  assert.equal(HC.normalizedRate(30,0,now-30*60*1000,now),60);
  assert.equal(HC.normalizedRate(300,44,now-2*60*60*1000,now),44);
});
