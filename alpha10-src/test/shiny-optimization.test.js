'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {ShinyTelemetry,chanceAtRate,attemptsForChance,measurementQuality,rateStability}=require('../shiny-telemetry');

const START=Date.UTC(2026,9,13,15);
function fixture({file=null}={}){
  let now=START;
  const t=new ShinyTelemetry(file,{clock:()=>now});
  const welcome=(patch={})=>t.frame(0,{t:'welcome',catalogoBolas:[{id:3,nome:'Ultra Ball',catchRate:4,priceGold:1200}],hunts:[{slug:'forest',nome:'Forest',area:'kanto'}],estado:{id:1,nick:'Conta 1',cheio:true,huntSlug:'forest',noCentro:false,servidorAgora:now,activeId:1,pokemons:[{id:1,level:50,ivTotal:150}],balls:{3:500},loja:{boosts:{shiny:0,captura:0}},kick:{bonus:{shiny:0,captura:0}},...patch}},now);
  const tick=(ms=5000)=>now+=ms;
  const throwBall=({shiny=false,captured=true}={})=>{t.frame(0,{t:'campo',mobs:[{s:0,n:'Charmander',x:true,xr:20000}]},now);t.frame(0,{t:'batalha',ev:[{k:'bola',slot:0,ballId:3,shiny,sucesso:captured},captured?{k:'capturado',pokemon:{speciesId:4,nome:'Charmander',shiny}}:{k:'fugiu',nome:'Charmander'}]},now);};
  return {t,welcome,tick,throwBall,get now(){return now;}};
}

test('chance por hora e janela de 50% são coerentes',()=>{
  assert.equal(chanceAtRate(null,false),null);
  assert.ok(chanceAtRate(24000,false)>0.63&&chanceAtRate(24000,false)<0.64);
  assert.ok(chanceAtRate(12000,true)>0.63&&chanceAtRate(12000,true)<0.64);
  assert.ok(Math.abs(attemptsForChance(.5,false)-16635)<2);
  assert.ok(Math.abs(attemptsForChance(.5,true)-8317)<2);
});

test('qualidade e estabilidade são limitadas e monotônicas',()=>{
  assert.equal(measurementQuality(0,0),0);
  assert.ok(measurementQuality(15*60000,100)>=99);
  assert.ok(measurementQuality(10*60000,50)>measurementQuality(2*60000,10));
  assert.equal(rateStability(100,100),100);
  assert.equal(rateStability(0,100),0);
  assert.equal(rateStability(null,100),null);
});

test('view calcula autonomia, tendência, qualidade e chance sem varrer histórico',()=>{
  const f=fixture();f.welcome({balls:{3:40}});
  for(let i=0;i<80;i++){f.tick(5000);f.throwBall({shiny:i%25===0});}
  const a=f.t.view().accounts[0];
  assert.ok(a.measurementQuality>0);
  assert.ok(a.stability>=0&&a.stability<=100);
  assert.ok(Number.isFinite(a.ballRunwayMs));
  assert.ok(a.chanceHour>0);
  assert.ok(a.eta50Ms>0);
  assert.ok(a.recent.length<=6);
  assert.equal(a.species.includes('Charmander'),true);
});

test('histórico pagina em ordem reversa sem materializar cópia completa',()=>{
  const f=fixture();f.welcome();
  for(let i=0;i<120;i++){f.tick();f.throwBall({shiny:true,captured:i%2===0});}
  const first=f.t.history({days:30});
  const third=f.t.history({days:30,offset:100});
  assert.equal(first.total,120);
  assert.equal(first.rows.length,50);
  assert.equal(third.rows.length,20);
  assert.ok(first.rows[0].timestamp>third.rows.at(-1).timestamp);
});

test('recentes são reconstruídos ao reconectar sem perder histórico',()=>{
  const f=fixture();f.welcome();
  for(let i=0;i<8;i++){f.tick();f.throwBall({shiny:true});}
  assert.equal(f.t.view().accounts[0].recent.length,6);
  f.tick();f.welcome();
  assert.equal(f.t.view().accounts[0].recent.length,6);
  assert.equal(f.t.history().total,8);
});

test('save coalescido preserva alteração feita durante escrita',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gridium-shiny-opt-'));
  try{
    const file=path.join(dir,'shiny.json'),f=fixture({file});f.welcome();f.throwBall({shiny:true});
    const p=f.t.save();
    f.t.configure({target:'Charmander'});
    await p;await f.t.close();
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(saved.preferences.target,'Charmander');
    assert.equal(saved.history.length,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
