'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
test('desktop envia projeção mínima ao Render e não usa view pesada do Shiny',()=>{
  const main=read('main.js'),telemetry=read('shiny-telemetry.js'),ui=read('shiny-ui.js'),pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'3.0.0-alpha.11');
  assert.match(main,/\/api\/v1\/shiny\/compute/);
  assert.match(main,/shinyTelemetry\.cloudInput\(\)/);
  assert.match(main,/shinyTelemetry\.visualView/);
  assert.doesNotMatch(main,/grid:shiny-state[^\n]+shinyTelemetry\?\.view/);
  assert.match(telemetry,/cloudInput\(\)/);
  assert.match(telemetry,/eligibility\(s\)/);
  assert.match(telemetry,/area === 'outland'/);
  assert.match(ui,/☁ REMOTO/);
  assert.match(ui,/contas juntas/);
  assert.match(ui,/Cálculo pausado/);
  assert.match(ui,/5000/);
});
test('fallback remoto continua visual e não reativa cálculos locais pesados',()=>{
  const main=read('main.js');
  assert.match(main,/Cálculo remoto aguardando configuração do Relay/);
  assert.match(main,/Cálculo remoto indisponível/);
  assert.doesNotMatch(main,/\.catch\([^\n]*shinyTelemetry\.view/);
});
