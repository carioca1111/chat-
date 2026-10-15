'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const files=[
  'test/mobile-command-center.test.js',
  'test/performance-cleanup.test.js',
  'test/shiny-cloud-integration.test.js',
  'test/sniper-arm-ui.test.js'
];
for(const rel of files){
  const p=path.join(root,rel);
  if(!fs.existsSync(p))throw new Error(`Alpha 11.8.1 contract ausente: ${rel}`);
  let s=fs.readFileSync(p,'utf8');
  if(s.includes('3.0.0-alpha.11.8.1'))continue;
  if(!s.includes('3.0.0-alpha.11.8'))throw new Error(`Alpha 11.8.1 versão-base não encontrada em ${rel}`);
  s=s.replaceAll('3.0.0-alpha.11.8','3.0.0-alpha.11.8.1');
  fs.writeFileSync(p,s,'utf8');
}
console.log(`Alpha 11.8.1: ${files.length} contratos de versão normalizados.`);
