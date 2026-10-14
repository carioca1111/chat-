'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
for(const file of fs.readdirSync(path.join(root,'test')).filter(x=>x.endsWith('.test.js'))){
  const p=path.join(root,'test',file);let s=fs.readFileSync(p,'utf8');
  s=s.replaceAll("'3.0.0-alpha.11.5'","'3.0.0-alpha.11.6'").replaceAll('"3.0.0-alpha.11.5"','"3.0.0-alpha.11.6"');
  if(file==='audit-fixes.test.js'){
    s=s.replace("assert.equal(s.metrics.attempts,1);release({ok:true,outcome:{ok:true,price:60}});", "assert.equal(s.metrics.attempts,0);assert.equal(s.watch.get('1').state,'PREPARED');release({ok:true,outcome:{ok:true,price:60}});");
    s=s.replace("assert.equal(s.watch.get('100').state,'SENT');s.configure({mode:'OBSERVE'});", "assert.equal(s.watch.get('100').state,'PREPARED');s.configure({mode:'OBSERVE'});");
    s=s.replace("assert.equal(s.watch.get('100').state,'SENT');release({ok:true,outcome:{ok:true,price:1}});", "assert.equal(s.watch.get('100').state,'PREPARED');release({ok:true,outcome:{ok:true,price:1}});");
  }
  if(file==='sniper-listing-flow-checkup.test.js'){
    s=s.replace("assert.match(ui,/filter\\(x=>!\\['WON','LOST','FAILED'\\]\\.includes\\(x\\.state\\)\\)/);","assert.match(ui,/filter\\(x=>!\\['WON','LOST','FAILED','UNKNOWN'\\]\\.includes\\(x\\.state\\)\\)/);");
  }
  fs.writeFileSync(p,s,'utf8');
}
console.log('Alpha 11.6: contratos legados normalizados para PREPARADO → ENVIADO, UNKNOWN terminal e versão 11.6.');
