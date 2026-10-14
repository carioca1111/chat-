'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');

test('Alpha 11.1 arma AUTO sem window.prompt',()=>{
  const ui=read('sniper-ui.js'),html=read('index.html'),pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'3.0.0-alpha.11.1');
  assert.doesNotMatch(ui,/\bprompt\s*\(/);
  assert.match(ui,/showArmConfirm/);
  assert.match(ui,/confirmArm/);
  assert.match(ui,/Não foi possível armar:/);
  for(const id of ['msArmConfirm','msArmPhrase','msArmConfirmBtn','msArmCancel'])assert.match(html,new RegExp(`id="${id}"`));
});

test('confirmação inline mantém a trava explícita do backend',()=>{
  const main=read('main.js'),ui=read('sniper-ui.js');
  assert.match(main,/grid:sniper-arm/);
  assert.match(main,/ATIVAR SNIPER/);
  assert.match(main,/Protocolo real do Market ainda não está validado/);
  assert.match(main,/Configure ao menos uma regra válida/);
  assert.match(ui,/phrase\.toUpperCase\(\)!=='ATIVAR SNIPER'/);
  assert.match(ui,/Armando Sniper AUTO/);
  assert.match(ui,/compras reais liberadas/);
});
