'use strict';
const fs=require('node:fs');
const path=require('node:path');

const mode=String(process.argv[2]||'');
const root=path.resolve(process.argv[3]||'gridium-build');
const pkgPath=path.join(root,'package.json');
const htmlPath=path.join(root,'index.html');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const writeJson=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const fail=message=>{throw new Error('Alpha 10.2 hotfix: '+message);};

if(mode==='prepare'){
  const pkg=readJson(pkgPath);
  if(pkg.version!=='3.0.0-alpha.9.16')fail('expected clean Alpha 9.16 base, got '+pkg.version);
  for(const name of ['opportunities-runtime.js','opportunity-core-process.js','opportunity-model.js']){
    if(fs.existsSync(path.join(root,name)))fail('Opportunities payload leaked into clean base: '+name);
  }
  // apply-alpha10 validates the historical 9.17 version string. The runtime itself is
  // intentionally the clean 9.16 base so Opportunities is not assembled at all.
  pkg.version='3.0.0-alpha.9.17';
  writeJson(pkgPath,pkg);
  console.log('Alpha 10.2 hotfix: clean 9.16 base prepared for Shiny integration');
  process.exit(0);
}

if(mode==='finalize'){
  const pkg=readJson(pkgPath);
  if(pkg.version!=='3.0.0-alpha.10')fail('Shiny integration did not finish as Alpha 10; got '+pkg.version);
  let html=fs.readFileSync(htmlPath,'utf8');
  const alphaNav='<button class="tab alpha-nav" data-section="alpha">Alpha Terminal <span class="beta-dot">α</span></button>';
  if(!html.includes(alphaNav))fail('Alpha Terminal navigation anchor not found');
  html=html.replace(alphaNav,'');
  if(/data-section="opportunities"/.test(html))fail('Oportunidades tab is still present');
  if(/data-section="alpha"/.test(html))fail('Alpha Terminal tab is still present');
  fs.writeFileSync(htmlPath,html);
  pkg.version='3.0.0-alpha.10.2';
  writeJson(pkgPath,pkg);
  console.log('Alpha 10.2 hotfix: optimized Shiny Assistant assembled without Alpha/Oportunidades tabs');
  process.exit(0);
}

fail('use mode prepare or finalize');
