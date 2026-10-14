'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const target=process.argv[2];if(!target)throw new Error('Uso: node apply-alpha116.js <diretorio-alvo>');
const root=path.resolve(process.cwd(),target);if(!fs.existsSync(root))throw new Error('Diretório alvo não existe: '+root);
const pkgPath=path.join(root,'package.json'),before=JSON.parse(fs.readFileSync(pkgPath,'utf8'));if(before.version!=='3.0.0-alpha.11.5')throw new Error('Alpha 11.6: base 11.5 esperada, atual '+before.version);
const partsDir=path.join(__dirname,'alpha116-parts'),parts=fs.readdirSync(partsDir).filter(x=>/^part\d+\.b64$/.test(x)).sort();if(!parts.length)throw new Error('Alpha 11.6: payload ausente');
const b64=parts.map(n=>fs.readFileSync(path.join(partsDir,n),'utf8').trim()).join(''),patch=zlib.gunzipSync(Buffer.from(b64,'base64'));
const digest=crypto.createHash('sha256').update(patch).digest('hex'),expected='adc4e38402376568735aaf78e30aa683c21de616f0f77f76fe8bb0fae0a16b8c';if(digest!==expected)throw new Error('Alpha 11.6: hash do patch inválido '+digest);
const tmp=path.join(__dirname,'.alpha116.patch.tmp');fs.writeFileSync(tmp,patch);
try{const rel=path.relative(process.cwd(),root).replace(/\\/g,'/');if(!rel||rel.startsWith('..'))throw new Error('Diretório alvo inválido: '+rel);const check=spawnSync('git',['apply','--check','--unsafe-paths','--whitespace=nowarn',`--directory=${rel}`,tmp],{cwd:process.cwd(),stdio:'inherit'});if(check.error)throw check.error;if(check.status!==0)throw new Error('Alpha 11.6: patch não aplica limpo sobre 11.5');const r=spawnSync('git',['apply','--unsafe-paths','--whitespace=nowarn',`--directory=${rel}`,tmp],{cwd:process.cwd(),stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)throw new Error('Alpha 11.6: git apply falhou com código '+r.status);}finally{try{fs.unlinkSync(tmp)}catch{}}
const after=JSON.parse(fs.readFileSync(pkgPath,'utf8'));if(after.version!=='3.0.0-alpha.11.6')throw new Error('Alpha 11.6: versão final incorreta '+after.version);
const main=fs.readFileSync(path.join(root,'main.js'),'utf8'),runtime=fs.readFileSync(path.join(root,'sniper-runtime.js'),'utf8');
if(/function liveValidationReady\(\)\{[^}]*\.view\(\)/.test(main))throw new Error('Alpha 11.6: validação pesada ainda está no hot path');
if(/async function waitMarketOutcome[\s\S]*?sleep\(140\)/.test(main))throw new Error('Alpha 11.6: polling de confirmação ainda está ativo');
if(!runtime.includes("'PREPARED','SENT','UNKNOWN'"))throw new Error('Alpha 11.6: estados de despacho não foram aplicados');
console.log('Gridium Alpha 11.6: Lightning Latency & Precision patch aplicado sobre Alpha 11.5.');
