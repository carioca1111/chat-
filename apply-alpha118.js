'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build'),pkgPath=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgPath));
if(pkg.version!=='3.0.0-alpha.11.7')throw new Error('Expected Alpha 11.7 assembled base');
for(const name of ['hunt-visual-store.js','hunt-visual-model.js','hunt-visual.js'])fs.copyFileSync(path.join(__dirname,'alpha118-src',name),path.join(root,name));
for(const name of fs.readdirSync(path.join(__dirname,'alpha118-src/test')))fs.copyFileSync(path.join(__dirname,'alpha118-src/test',name),path.join(root,'test',name));
function edit(name,from,to){const p=path.join(root,name);let s=fs.readFileSync(p,'utf8');if(!s.includes(from))throw new Error('Anchor missing: '+name+' '+from.slice(0,80));fs.writeFileSync(p,s.replace(from,to));}
edit('main.js','let huntIntelligence=null;',"let huntIntelligence=null;\nconst {HuntVisualStore}=require('./hunt-visual-store');\nlet huntVisual=null;");
// Leave legacy consumers intact; expose the new observation layer on the same IPC response.
edit('main.js','function huntView(){','function legacyHuntView118(){');
edit('main.js','function observeHuntIntelligence(',"function huntView(){return {...legacyHuntView118(),visual:huntVisual?.view()||null};}\nfunction observeHuntIntelligence(");
edit('main.js','void shinyTelemetry?.save();','void shinyTelemetry?.save();void huntVisual?.flush();');
edit('main.js','networkInspector.onGamePacket=(slot,packet,at)=>',"huntVisual=new HuntVisualStore(path.join(app.getPath('userData'),'gridium-hunt-visual.json'));networkInspector.onGamePacket=(slot,packet,at)=>");
edit('main.js','sniperRuntime?.gamePacket(slot,packet,at);','sniperRuntime?.gamePacket(slot,packet,at);huntVisual?.frame(Number(slot),packet,Number(at)||Date.now());');
edit('main.js','sniperRuntime?.disconnect(slot);','sniperRuntime?.disconnect(slot);huntVisual?.disconnect(Number(slot));');
edit('main.js','await sniperRuntime?.flush?.();','await huntVisual?.flush();await sniperRuntime?.flush?.();');
// Refresh already runs only for visible Hunt/dashboard. Include new data in its change signature.
edit('renderer.js',"window.GridiumUltra.signature(next.accounts||[]):JSON.stringify(next.accounts||[])","window.GridiumUltra.signature(next.visual||next.accounts||[]):JSON.stringify(next.visual||next.accounts||[])");
pkg.build.files.push('!alpha*-screenshots/**','!alpha*-visual-fixture.html','!regression-output.txt','!*benchmark*.json');pkg.version='3.0.0-alpha.11.8';pkg.description='Gridium Alpha 11.8 — Hunt Intelligence Visual';fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
console.log('Alpha 11.8 integrated; Sniper dispatch, legacy Hunt and Shiny remain in place.');

// Version contracts follow the packaged product; behavior assertions are unchanged.
for(const n of fs.readdirSync(path.join(root,'test'))){if(!n.endsWith('.test.js'))continue;const f=path.join(root,'test',n);let s=fs.readFileSync(f,'utf8');s=s.replaceAll("'3.0.0-alpha.11.6'","'3.0.0-alpha.11.8'");fs.writeFileSync(f,s);}
