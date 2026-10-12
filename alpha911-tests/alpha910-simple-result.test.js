'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const renderer=fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
test('mantém métricas técnicas e adiciona resumo simples',()=>{assert.match(renderer,/Realizado/);assert.match(renderer,/Em aberto/);assert.match(renderer,/GANHOU/);assert.match(renderer,/PERDEU/);assert.match(renderer,/AINDA NÃO VENDEU/);});
test('resumo simples aparece no geral e em cada conta',()=>{assert.match(html,/id="alphaSimpleOverall"/);assert.ok(renderer.includes("fillAlphaSimpleSummary($('alphaSimpleOverall')"));assert.match(renderer,/alpha-simple-account/);});
test('ganhou e perdeu usam apenas resultado já vendido',()=>{assert.ok(renderer.includes("sold>0?sold:0"));assert.ok(renderer.includes("sold<0?Math.abs(sold):0"));assert.match(renderer,/já vendido/);});
test('ainda não vendeu mostra resultado em aberto e quantidade de posições',()=>{assert.match(renderer,/AINDA NÃO VENDEU/);assert.match(renderer,/tone==='open'/);assert.match(renderer,/posição/);});
test('cores deixam leitura fácil sem remover o painel atual',()=>{assert.match(css,/GRID_ALPHA910_SIMPLE_RESULT_LABELS/);assert.match(css,/alpha-simple-chip.gain/);assert.match(css,/alpha-simple-chip.loss/);assert.match(css,/alpha-simple-chip.open/);});
