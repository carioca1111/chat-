'use strict';
const fs=require('node:fs'),path=require('node:path');
const target=process.argv[2];if(!target)throw new Error('Uso: node apply-alpha117.js <diretorio-alvo>');
const root=path.resolve(process.cwd(),target);if(!fs.existsSync(root))throw new Error('Diretório alvo não existe: '+root);
const pkgPath=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
if(pkg.version!=='3.0.0-alpha.11.6')throw new Error('Alpha 11.7: base 11.6 esperada, atual '+pkg.version);
const source=path.join(__dirname,'alpha117-src');
for(const name of ['hunt-intelligence.js','hunt-visual-model.js','hunt-visual.js','hunt-visual.css']){const src=path.join(source,name);if(!fs.existsSync(src))throw new Error('Alpha 11.7: fonte ausente '+name);fs.copyFileSync(src,path.join(root,name));}
const testDir=path.join(root,'test');fs.mkdirSync(testDir,{recursive:true});fs.copyFileSync(path.join(source,'test','hunt-visual.test.js'),path.join(testDir,'hunt-visual.test.js'));
function replaceOnce(file,from,to,label){let s=fs.readFileSync(file,'utf8');if(s.includes(to))return;if(!s.includes(from))throw new Error('Alpha 11.7: âncora ausente '+label);s=s.replace(from,to);fs.writeFileSync(file,s,'utf8');}
const html=path.join(root,'index.html');
replaceOnce(html,'<link rel="stylesheet" href="shiny.css">','<link rel="stylesheet" href="shiny.css">\n<link rel="stylesheet" href="hunt-visual.css">','hunt css');
replaceOnce(html,'<script src="asset-resolver.js"></script>','<script src="asset-resolver.js"></script>\n<script src="hunt-visual-model.js"></script>\n<script src="hunt-visual.js"></script>','hunt scripts');
const renderer=path.join(root,'renderer.js');
replaceOnce(renderer,"function renderHunt(state,data=current){\n  if(!state||!$('huntAccounts'))return;","function renderHunt(state,data=current){\n  if(window.HuntVisual?.render)return window.HuntVisual.render(state,data);\n  if(!state||!$('huntAccounts'))return;",'render Hunt delegate');
replaceOnce(renderer,"function setSection(id){activeSection=id;window.ShinyAssistant?.setVisible?.(id==='shiny-assistant');","function setSection(id){activeSection=id;window.HuntVisual?.setVisible?.(id==='hunt');window.ShinyAssistant?.setVisible?.(id==='shiny-assistant');",'Hunt visibility');
pkg.version='3.0.0-alpha.11.7';pkg.description='Gridium Alpha 11.7: Hunt Intelligence Visual + Sniper Relâmpago';fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
const backgroundDir=path.join(root,'assets','hunt','backgrounds'),required=['beach','cave','default','desert','forest','ice','lake','meadow','mountain','ruins','swamp','volcano'];
if(!fs.existsSync(backgroundDir))throw new Error('Alpha 11.7: diretório de fundos não foi preparado');for(const n of required)if(!fs.existsSync(path.join(backgroundDir,`hunt-${n}.webp`)))throw new Error('Alpha 11.7: fundo ausente hunt-'+n+'.webp');
const finalHtml=fs.readFileSync(html,'utf8'),finalRenderer=fs.readFileSync(renderer,'utf8'),main=fs.readFileSync(path.join(root,'main.js'),'utf8'),runtime=fs.readFileSync(path.join(root,'sniper-runtime.js'),'utf8');
if(!finalHtml.includes('hunt-visual.js')||!finalRenderer.includes('window.HuntVisual?.render'))throw new Error('Alpha 11.7: UI Hunt não integrada');
if(!main.includes('alphaEngine?.validation'))throw new Error('Alpha 11.7: guard da validação direta do Sniper 11.6 ausente');
if(!runtime.includes("'PREPARED','SENT','UNKNOWN'"))throw new Error('Alpha 11.7: estados de despacho do Sniper 11.6 ausentes');
console.log('Gridium Alpha 11.7: Hunt Intelligence Visual aplicado sobre Alpha 11.6.');
