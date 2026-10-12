'use strict';
const fs=require('fs');
const path=require('path');
const root=process.argv[2]?path.resolve(process.argv[2]):process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const write=(f,s)=>fs.writeFileSync(path.join(root,f),s);
const must=(cond,msg)=>{if(!cond)throw new Error('Alpha 8.4: '+msg);};

const pkgPath=path.join(root,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='3.0.0-alpha.8.4';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

let html=read('index.html');
html=html.replace(/<p>Alpha 8\.3:[^<]*<\/p>/,"<p>Alpha 8.4: automático em 1 clique · descoberta segura de anúncios detalhados pelo protocolo do próprio Market.</p>");
write('index.html',html);

let protocol=read('market-protocol.js');
const oldListings="if(p.aba==='vitrine'&&Array.isArray(p.linhas)){validation.marketListingsMapped=true;for(const row of p.linhas){const n=normalizeListing(row,slot,Number(e.at)||Date.now());if(n)listings.push(n);}}";
const newListings="if(['vitrine','itens'].includes(p.aba)&&Array.isArray(p.linhas)){let found=0;for(const row of p.linhas){const n=normalizeListing(row,slot,Number(e.at)||Date.now());if(n){listings.push(n);found++;}}if(found>0)validation.marketListingsMapped=true;}";
must(protocol.includes(oldListings),'parser de listagens esperado não encontrado');
protocol=protocol.replace(oldListings,newListings);
write('market-protocol.js',protocol);

let main=read('main.js');
const oldHealth="const marketBridgeHealth=Array.from({length:4},()=>({installed:false,socketReady:false,lastInstallAt:0,lastProbeAt:0,lastProbeOk:false,lastProbeError:null,lastMarketRxAt:0,lastMarketTxAt:0,learned:1,templateCursor:0}));";
const newHealth="const marketBridgeHealth=Array.from({length:4},()=>({installed:false,socketReady:false,lastInstallAt:0,lastProbeAt:0,lastProbeOk:false,lastProbeError:null,lastMarketRxAt:0,lastMarketTxAt:0,learned:1,templateCursor:0,detailCursor:0,detailAttempts:0,lastDetailAsset:'',lastDetailCategory:''}));";
must(main.includes(oldHealth),'estado da ponte esperado não encontrado');
main=main.replace(oldHealth,newHealth);

const learnLine="function learnMarketReadTemplates(slot,events=[]){const map=marketReadTemplates[slot];if(!map)return 0;for(const e of events){if(e.method!=='SEND')continue;const c=safeMarketReadCommand(payloadOfNetworkEvent(e));if(c)map.set(JSON.stringify(c),c);}marketBridgeHealth[slot].learned=map.size;return map.size;}";
const detailHelpers=`function learnMarketReadTemplates(slot,events=[]){const map=marketReadTemplates[slot];if(!map)return 0;for(const e of events){if(e.method!=='SEND')continue;const c=safeMarketReadCommand(payloadOfNetworkEvent(e));if(c)map.set(JSON.stringify(c),c);}marketBridgeHealth[slot].learned=map.size;return map.size;}\nfunction deriveMarketDetailCandidates(events=[]){const sorted=[...events].sort((a,b)=>(Number(a.at)||0)-(Number(b.at)||0)),out=[],seen=new Set();let pending=null;for(const e of sorted){const p=payloadOfNetworkEvent(e);if(!p||typeof p!=='object')continue;if(e.method==='SEND'&&p.t==='market.itens'&&String(p.elemento??'')===''){pending={at:Number(e.at)||0,categoria:String(p.categoria||'').slice(0,80)};continue;}if(e.method==='RECV'&&p.t==='market'&&p.aba==='itens'&&p.resumo&&pending&&((Number(e.at)||0)-pending.at)<=7000){for(const id of Object.keys(p.resumo||{})){if(!/^\\d+$/.test(String(id)))continue;const key=pending.categoria+'|'+id;if(seen.has(key))continue;seen.add(key);out.push({t:'market.itens',elemento:String(id),categoria:pending.categoria});}pending=null;}}return out.slice(-400);}`;
must(main.includes(learnLine),'função de aprendizado esperada não encontrada');
main=main.replace(learnLine,detailHelpers);

const probeStart=main.indexOf('async function sendPassiveMarketProbe(slot){');
const probeEnd=main.indexOf('function mergeNetworkRows',probeStart);
must(probeStart>=0&&probeEnd>probeStart,'função sendPassiveMarketProbe não encontrada');
const newProbe=`async function sendPassiveMarketProbe(slot){\n  const wc=guests.get(slot),h=marketBridgeHealth[slot];if(!wc||wc.isDestroyed()||!h)return {ok:false,reason:'conta-indisponivel'};\n  const recent=networkInspector.recent(slot,{sinceMs:10*60*1000,limit:2500,marketOnly:true});learnMarketReadTemplates(slot,recent.requests);\n  await installMarketBridge(slot,wc);await marketBridgeState(slot,wc);h.lastProbeAt=Date.now();\n  if(!h.socketReady){h.lastProbeOk=false;h.lastProbeError='WebSocket do jogo ainda não foi capturado';return {ok:false,reason:'socket-unavailable'};}\n  const detail=deriveMarketDetailCandidates(recent.requests),rows=[...marketReadTemplates[slot].values()];\n  if(!rows.length&&!detail.length){h.lastProbeOk=false;h.lastProbeError='Nenhum comando de leitura seguro aprendido';return {ok:false,reason:'no-read-template'};}\n  let cmd,kind='summary';\n  if(detail.length&&h.detailCursor%4!==3){cmd=detail[h.detailCursor%detail.length];h.detailCursor++;h.detailAttempts++;h.lastDetailAsset=String(cmd.elemento||'');h.lastDetailCategory=String(cmd.categoria||'');kind='detail';}\n  else{cmd=rows[h.templateCursor%Math.max(1,rows.length)]||{t:'market.itens',elemento:'',categoria:'stone'};h.templateCursor=(h.templateCursor+1)%Math.max(1,rows.length);if(detail.length)h.detailCursor++;}\n  const safe=safeMarketReadCommand(cmd);if(!safe){h.lastProbeOk=false;h.lastProbeError='Probe de leitura rejeitado pela lista segura';return {ok:false,reason:'unsafe-read-probe'};}\n  const encoded=JSON.stringify(safe);try{const result=await wc.executeJavaScript(\`window.__gridiumMarketSend?window.__gridiumMarketSend(\${encoded}):({ok:false,reason:'bridge-missing'})\`,true);h.lastProbeOk=result?.ok===true;h.lastProbeError=h.lastProbeOk?null:String(result?.reason||'probe-failed');if(h.lastProbeOk)h.lastMarketTxAt=Date.now();return {...result,command:safe,kind,detailCandidates:detail.length};}catch(error){h.lastProbeOk=false;h.lastProbeError=String(error?.message||error);return {ok:false,reason:h.lastProbeError};}\n}\n`;
main=main.slice(0,probeStart)+newProbe+main.slice(probeEnd);

const statusNeedle="probeOk:probeResult?.ok===true,probeError:probeResult?.ok?null:String(probeResult?.reason||marketBridgeHealth[slots[0]]?.lastProbeError||''),health};";
const statusReplace="probeOk:probeResult?.ok===true,probeError:probeResult?.ok?null:String(probeResult?.reason||marketBridgeHealth[slots[0]]?.lastProbeError||''),detailProbeAttempts:marketBridgeHealth.reduce((n,h)=>n+(Number(h.detailAttempts)||0),0),lastDetailAsset:probeResult?.kind==='detail'?String(probeResult?.command?.elemento||''):String(marketBridgeHealth.find(h=>h.lastDetailAsset)?.lastDetailAsset||''),detailProbeKind:probeResult?.kind||'',detailCandidates:Number(probeResult?.detailCandidates)||0,health};";
must(main.includes(statusNeedle),'status do scanner esperado não encontrado');
main=main.replace(statusNeedle,statusReplace);
write('main.js',main);

let renderer=read('renderer.js');
const uiNeedle="+'Resumos do Market: '+Number(s.summaryRows||0)+nl+'Anúncios detalhados WS: '+Number(s.listingRows||0)+nl+'Anúncios operáveis agora: '+usable";
const uiReplace="+'Resumos do Market: '+Number(s.summaryRows||0)+nl+'Sondagens detalhadas: '+Number(s.detailProbeAttempts||0)+(s.lastDetailAsset?' · último item '+String(s.lastDetailAsset):'')+nl+'Anúncios detalhados WS: '+Number(s.listingRows||0)+nl+'Anúncios operáveis agora: '+usable";
must(renderer.includes(uiNeedle),'texto da inspeção esperado não encontrado');
renderer=renderer.replace(uiNeedle,uiReplace);
write('renderer.js',renderer);

const testDir=path.join(root,'test');fs.mkdirSync(testDir,{recursive:true});
fs.writeFileSync(path.join(testDir,'alpha84-detail-probe.test.js'),`'use strict';\nconst test=require('node:test');const assert=require('node:assert/strict');const {analyzeProtocolEvents}=require('../market-protocol');\ntest('market aba itens com linhas detalhadas vira listagem operável',()=>{const p=analyzeProtocolEvents([{at:1,method:'RECV',postData:{t:'market',aba:'itens',linhas:[{id:987,tipo:'item',itemId:23,nome:'Pedra',preco:2500000,moeda:'gold',qtd:1}]}}],0);assert.equal(p.listings.length,1);assert.equal(p.listings[0].listingId,'987');assert.equal(p.listings[0].assetId,'23');assert.equal(p.listings[0].currency,'coins');assert.equal(p.listings[0].price,2500000);});\n`);
console.log('Alpha 8.4 safe detailed Market probing applied');
