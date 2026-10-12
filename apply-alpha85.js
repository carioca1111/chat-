'use strict';
const fs=require('fs');
const path=require('path');
const root=process.argv[2]?path.resolve(process.argv[2]):process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const write=(f,s)=>fs.writeFileSync(path.join(root,f),s);
const must=(cond,msg)=>{if(!cond)throw new Error('Alpha 8.5: '+msg);};

const pkgPath=path.join(root,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='3.0.0-alpha.8.5';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

let html=read('index.html');
html=html.replace(/<p>Alpha 8\.4:[^<]*<\/p>/,"<p>Alpha 8.5: automático em 1 clique · sondagem numérica + autoanálise segura do cliente do Market.</p>");
write('index.html',html);

let main=read('main.js');
const oldDerive="function deriveMarketDetailCandidates(events=[]){const sorted=[...events].sort((a,b)=>(Number(a.at)||0)-(Number(b.at)||0)),out=[],seen=new Set();let pending=null;for(const e of sorted){const p=payloadOfNetworkEvent(e);if(!p||typeof p!=='object')continue;if(e.method==='SEND'&&p.t==='market.itens'&&String(p.elemento??'')===''){pending={at:Number(e.at)||0,categoria:String(p.categoria||'').slice(0,80)};continue;}if(e.method==='RECV'&&p.t==='market'&&p.aba==='itens'&&p.resumo&&pending&&((Number(e.at)||0)-pending.at)<=7000){for(const id of Object.keys(p.resumo||{})){if(!/^\\d+$/.test(String(id)))continue;const key=pending.categoria+'|'+id;if(seen.has(key))continue;seen.add(key);out.push({t:'market.itens',elemento:String(id),categoria:pending.categoria});}pending=null;}}return out.slice(-400);}";
const newDerive="function deriveMarketDetailCandidates(events=[]){const sorted=[...events].sort((a,b)=>(Number(a.at)||0)-(Number(b.at)||0)),out=[],seen=new Set();let pending=null;for(const e of sorted){const p=payloadOfNetworkEvent(e);if(!p||typeof p!=='object')continue;if(e.method==='SEND'&&p.t==='market.itens'&&String(p.elemento??'')===''){pending={at:Number(e.at)||0,categoria:String(p.categoria||'').slice(0,80)};continue;}if(e.method==='RECV'&&p.t==='market'&&p.aba==='itens'&&p.resumo&&pending&&((Number(e.at)||0)-pending.at)<=7000){for(const id of Object.keys(p.resumo||{})){if(!/^\\d+$/.test(String(id)))continue;const n=Number(id);if(!Number.isSafeInteger(n)||n<0)continue;const key=pending.categoria+'|n:'+n;if(seen.has(key))continue;seen.add(key);out.push({t:'market.itens',elemento:n,categoria:pending.categoria});}pending=null;}}return out.slice(-400);}";
must(main.includes(oldDerive),'deriveMarketDetailCandidates 8.4 não encontrado');
main=main.replace(oldDerive,newDerive);

const healthOld="detailCursor:0,detailAttempts:0,lastDetailAsset:'',lastDetailCategory:''";
const healthNew="detailCursor:0,detailAttempts:0,lastDetailAsset:'',lastDetailCategory:'',lastDetailType:'',sourceHintAt:0,sourceHints:null";
must(main.includes(healthOld),'estado detail health não encontrado');
main=main.replace(healthOld,healthNew);

const probeAssign="h.lastDetailAsset=String(cmd.elemento||'');h.lastDetailCategory=String(cmd.categoria||'');kind='detail';";
const probeAssignNew="h.lastDetailAsset=String(cmd.elemento??'');h.lastDetailCategory=String(cmd.categoria||'');h.lastDetailType=typeof cmd.elemento;kind='detail';";
must(main.includes(probeAssign),'atribuição detail probe não encontrada');
main=main.replace(probeAssign,probeAssignNew);

const sourceHelper=`\nasync function collectMarketSourceHints(slot,wc){\n  const h=marketBridgeHealth[slot];if(!h||!wc||wc.isDestroyed())return null;\n  if(h.sourceHints&&Date.now()-Number(h.sourceHintAt||0)<10*60*1000)return h.sourceHints;\n  const source=\`(async()=>{try{const urls=[...new Set(performance.getEntriesByType('resource').map(e=>String(e.name||'')).filter(u=>/\\.js(?:[?#]|$)/i.test(u)))].slice(0,48),needles=['market.itens','market.especies','market.comprar'],hits=[];for(const url of urls){try{const txt=await fetch(url,{credentials:'same-origin',cache:'force-cache'}).then(r=>r.ok?r.text():'');if(!txt)continue;const low=txt.toLowerCase();for(const needle of needles){let from=0,count=0;while(count<2){const i=low.indexOf(needle,from);if(i<0)break;const a=Math.max(0,i-360),b=Math.min(txt.length,i+760);hits.push({url:url.slice(0,240),needle,snippet:txt.slice(a,b).replace(/\\s+/g,' ').slice(0,1120)});from=i+needle.length;count++;}}if(hits.length>=12)break;}catch{}}return {ok:true,scriptCount:urls.length,hits:hits.slice(0,12)};}catch(e){return {ok:false,error:String(e&&e.message||e)}}})()\`;\n  try{const result=await wc.executeJavaScript(source,true);h.sourceHintAt=Date.now();h.sourceHints=result||null;return h.sourceHints;}catch(error){h.sourceHintAt=Date.now();h.sourceHints={ok:false,error:String(error?.message||error)};return h.sourceHints;}\n}\n`;
const helperInsertPoint=main.indexOf('async function installMarketBridge(slot,wc){');
must(helperInsertPoint>0,'ponto para source hints não encontrado');
main=main.slice(0,helperInsertPoint)+sourceHelper+main.slice(helperInsertPoint);

const marketScanPos=main.indexOf("handler('grid:market-scan'");
const scanNeedle="const scan=await wc.executeJavaScript(MARKET_DISCOVERY_SCRIPT);";
const scanPos=main.indexOf(scanNeedle,marketScanPos);
must(marketScanPos>=0&&scanPos>marketScanPos,'market-scan ponto source hints não encontrado');
main=main.slice(0,scanPos+scanNeedle.length)+"\n        const sourceHints=await collectMarketSourceHints(slot,wc);"+main.slice(scanPos+scanNeedle.length);
const scansPush="scans.push({slot,...scan,network:{attached:network.attached,error:network.error,requests:network.requests.slice(-120),marketRequests,criticalRequests:(network.criticalRequests||[]).slice(-500)},protocol});";
const scansPushNew="scans.push({slot,...scan,sourceHints,network:{attached:network.attached,error:network.error,requests:network.requests.slice(-120),marketRequests,criticalRequests:(network.criticalRequests||[]).slice(-500)},protocol});";
must(main.includes(scansPush),'scans.push esperado não encontrado');
main=main.replace(scansPush,scansPushNew);

const statusNeedle="lastDetailAsset:probeResult?.kind==='detail'?String(probeResult?.command?.elemento||''):String(marketBridgeHealth.find(h=>h.lastDetailAsset)?.lastDetailAsset||''),detailProbeKind:probeResult?.kind||'',detailCandidates:Number(probeResult?.detailCandidates)||0,health};";
const statusReplace="lastDetailAsset:probeResult?.kind==='detail'?String(probeResult?.command?.elemento??''):String(marketBridgeHealth.find(h=>h.lastDetailAsset)?.lastDetailAsset||''),lastDetailType:probeResult?.kind==='detail'?typeof probeResult?.command?.elemento:String(marketBridgeHealth.find(h=>h.lastDetailType)?.lastDetailType||''),detailProbeKind:probeResult?.kind||'',detailCandidates:Number(probeResult?.detailCandidates)||0,health};";
must(main.includes(statusNeedle),'status detail 8.4 não encontrado');
main=main.replace(statusNeedle,statusReplace);
write('main.js',main);

let renderer=read('renderer.js');
renderer=renderer.replace("'Sondagens detalhadas: '+Number(s.detailProbeAttempts||0)+(s.lastDetailAsset?' · último item '+String(s.lastDetailAsset):'')+nl", "'Sondagens detalhadas: '+Number(s.detailProbeAttempts||0)+(s.lastDetailAsset?' · último item '+String(s.lastDetailAsset)+(s.lastDetailType?' ('+String(s.lastDetailType)+')':''):'')+nl");
const oldPayload="const payload={versao:'Gridium 3.0 Alpha 8.2',listagensReais:(result?.listings||[]).length,protocolo:result?.protocol?.validation||{},crossMarket:(result?.crossMarket||[]).slice(0,30),contas:summary};";
const newPayload="const payload={versao:'Gridium 3.0 Alpha 8.5',listagensReais:(result?.listings||[]).length,protocolo:result?.protocol?.validation||{},crossMarket:(result?.crossMarket||[]).slice(0,30),autoDescoberta:(result?.scans||[]).map(x=>({conta:x.slot+1,scriptCount:x.sourceHints?.scriptCount||0,hits:(x.sourceHints?.hits||[]).slice(0,8)})),contas:summary};";
must(renderer.includes(oldPayload),'payload diagnóstico Alpha 8.2 antigo não encontrado');
renderer=renderer.replace(oldPayload,newPayload);
write('renderer.js',renderer);

const testDir=path.join(root,'test');fs.mkdirSync(testDir,{recursive:true});
fs.writeFileSync(path.join(testDir,'alpha85-numeric-probe.test.js'),`'use strict';\nconst test=require('node:test');const assert=require('node:assert/strict');\ntest('JSON mantém elemento numérico no probe',()=>{const cmd={t:'market.itens',elemento:Number('23'),categoria:'stone'};const round=JSON.parse(JSON.stringify(cmd));assert.equal(round.elemento,23);assert.equal(typeof round.elemento,'number');});\n`);
console.log('Alpha 8.5 numeric Market detail probe + source hints applied');
