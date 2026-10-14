'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const target=process.argv[2];if(!target)throw new Error('Uso: node apply-alpha115.js <diretorio-alvo>');
const root=path.resolve(process.cwd(),target);if(!fs.existsSync(root))throw new Error('Diretório alvo não existe: '+root);
const pkgPath=path.join(root,'package.json'),before=JSON.parse(fs.readFileSync(pkgPath,'utf8'));if(before.version!=='3.0.0-alpha.11.4')throw new Error('Alpha 11.5: base 11.4 esperada, atual '+before.version);
const partsDir=path.join(__dirname,'alpha115-parts'),parts=fs.readdirSync(partsDir).filter(x=>/^part\d+\.b64$/.test(x)).sort();if(!parts.length)throw new Error('Alpha 11.5: payload ausente');
const b64=parts.map(n=>fs.readFileSync(path.join(partsDir,n),'utf8').trim()).join(''),patch=zlib.gunzipSync(Buffer.from(b64,'base64'));
const digest=crypto.createHash('sha256').update(patch).digest('hex'),expected='21e01996099924558ec7ab054ffd17faa08bbe866bb28b1bfe42ed286923104d';if(digest!==expected)throw new Error('Alpha 11.5: hash do patch inválido '+digest);
const tmp=path.join(__dirname,'.alpha115.patch.tmp');fs.writeFileSync(tmp,patch);
try{const rel=path.relative(process.cwd(),root).replace(/\\/g,'/');if(!rel||rel.startsWith('..'))throw new Error('Diretório alvo inválido: '+rel);const r=spawnSync('git',['apply','--unsafe-paths','--whitespace=nowarn',`--directory=${rel}`,tmp],{cwd:process.cwd(),stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error('Alpha 11.5: git apply falhou com código '+r.status);}finally{try{fs.unlinkSync(tmp)}catch{}}
const after=JSON.parse(fs.readFileSync(pkgPath,'utf8'));if(after.version!=='3.0.0-alpha.11.5')throw new Error('Alpha 11.5: versão final incorreta '+after.version);
for(const name of ['main.js','network-inspector.js','sniper-runtime.js','sniper-ui.js','hunt-intelligence.js','collector.js','alpha-analysis-worker.js','alpha-engine.js'])if(!fs.existsSync(path.join(root,name)))throw new Error('Alpha 11.5: arquivo final ausente '+name);
console.log('Gridium Alpha 11.5: 14 falhas da auditoria corrigidas; guardas de retenção 11.4 preservadas.');
