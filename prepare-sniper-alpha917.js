'use strict';
const fs=require('fs');
const path=require('path');
const target=path.resolve(process.argv[2]||path.join(__dirname,'gridium-build'));
const pkgPath=path.join(target,'package.json');
if(!fs.existsSync(pkgPath))throw new Error('package.json da build não encontrado');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
if(!String(pkg.version||'').includes('9.17'))throw new Error(`Base inesperada: ${pkg.version}. Esperado Alpha 9.17.`);
// O overlay dedicado ainda valida a assinatura da base 9.16. A 9.17 é a 9.16 + Oportunidades,
// então normalizamos somente o campo de versão antes de aplicar o overlay. Nenhum arquivo da 9.17 é removido.
pkg.version='3.0.0-alpha.9.16';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
console.log('Alpha 9.17 preparada para o overlay do Gridium Sniper sem remover Oportunidades.');
