'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../../hunt-visual-model');

function onlineRow(now=Date.now()){return {status:'online',health:'online',record:{nick:'Conta',updated:now,live:{browserOnline:true}}};}
function intel(types,hunt='forest',now=Date.now()){return {currentHunt:hunt,lastAt:now,identity:{id:'A',nick:'A'},profile:{id:1,speciesId:6,name:'Pokemon',level:80,types},periods:{'60':{minutes:60,hunts:[{huntSlug:hunt,xpPerHour:100,goldPerHour:20,observedMs:1200000,observedMinutes:20,samples:5,confidenceDetails:{score:.5,label:'moderada',observedMinutes:20,samples:5}}]}},series:[]};}

test('paisagem principal segue tipo do Pokemon, nao o nome da hunt',()=>{
  assert.match(M.backgroundForPokemon({types:['fire','flying']},'forest'),/hunt-volcano\.webp$/);
  assert.match(M.backgroundForPokemon({types:['water']},'volcano'),/hunt-lake\.webp$/);
  assert.match(M.backgroundForPokemon({types:['ghost','poison']},'meadow'),/hunt-ruins\.webp$/);
});

test('snapshot usa tipo do Pokemon para o fundo',()=>{
  const now=Date.now();
  const s=M.accountSnapshot(0,{accounts:[{intelligence:intel(['fire','flying'],'forest',now)}]},{rows:[onlineRow(now)]},60,'xp',now);
  assert.match(s.background,/hunt-volcano\.webp$/);
});

test('renderer da Hunt agrupa rajadas e limita pontos do grafico',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','hunt-visual.js'),'utf8');
  assert.match(src,/requestAnimationFrame\(frame\)/);
  assert.match(src,/slice\(-60\)/);
  assert.match(src,/lastAlerts:''/);
  assert.doesNotMatch(src,/if\(ctx\.visible\)renderNow\(false\)/);
});

test('CSS remove efeitos caros nos cards em atualizacao constante',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','hunt-visual.css'),'utf8');
  assert.match(css,/Alpha 11\.8\.2 Hunt performance overrides/);
  assert.match(css,/\.hv-account-card\{contain:layout paint;box-shadow:none\}/);
  assert.match(css,/\.hv-pokemon\{filter:none\}/);
});
