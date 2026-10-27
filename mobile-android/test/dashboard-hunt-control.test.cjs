const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/index.html'),'utf8');

test('dashboard mobile contém Hunt Control e remove Market antigo',()=>{
  assert.match(html,/id="sec-huntctrl"/);
  assert.match(html,/Hunt Ctrl/);
  assert.match(html,/POÇÕES → REVIVES → CENTRO/);
  assert.match(html,/SHINY VISTO/);
  assert.doesNotMatch(html,/id="sec-market"/);
  assert.doesNotMatch(html,/>Market<\/button>/);
});

test('JavaScript inline do dashboard é sintaticamente válido',()=>{
  const blocks=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean);
  assert.ok(blocks.length>0);
  blocks.forEach(code=>new vm.Script(code));
});
