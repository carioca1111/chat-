'use strict';
const fs=require('fs');
const path=require('path');
const root=process.argv[2]?path.resolve(process.argv[2]):process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const write=(f,s)=>fs.writeFileSync(path.join(root,f),s);
const must=(c,m)=>{if(!c)throw new Error('Alpha 8.7: '+m);};

const pkgPath=path.join(root,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='3.0.0-alpha.8.7';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

let html=read('index.html');
html=html.replace(/<p>Alpha 8\.6:[^<]*<\/p>/,"<p>Alpha 8.7: Market em modo leve · protocolo market.item já validado, sem redescoberta pesada nas 4 contas.</p>");
write('index.html',html);

let main=read('main.js');

const deriveStart=main.indexOf('function deriveClientReadCandidates(');
const deriveEnd=main.indexOf('async function collectMarketSourceHints',deriveStart);
must(deriveStart>=0&&deriveEnd>deriveStart,'deriveClientReadCandidates não encontrado');
const leanDerive=`function deriveClientReadCandidates(_hints={},detail=[]){\n  const out=[],seen=new Set();\n  for(const d of detail.slice(-120)){\n    const id=Number(d?.elemento);if(!Number.isSafeInteger(id)||id<=0)continue;\n    const cmd={t:'market.item',tipo:'item',itemId:id,pagina:1};\n    const k=JSON.stringify(cmd);if(seen.has(k))continue;seen.add(k);out.push(cmd);\n  }\n  return out.slice(0,160);\n}\n\n`;
main=main.slice(0,deriveStart)+leanDerive+main.slice(deriveEnd);

const probeStart=main.indexOf('async function sendPassiveMarketProbe(');
const probeEnd=main.indexOf('function mergeNetworkRows',probeStart);
must(probeStart>=0&&probeEnd>probeStart,'sendPassiveMarketProbe não encontrado');
const leanProbe=`async function sendPassiveMarketProbe(slot){\n  const wc=guests.get(slot),h=marketBridgeHealth[slot];if(!wc||wc.isDestroyed()||!h)return {ok:false,reason:'conta-indisponivel'};\n  const recent=networkInspector.recent(slot,{sinceMs:3*60*1000,limit:1200,marketOnly:true});learnMarketReadTemplates(slot,recent.requests);\n  await installMarketBridge(slot,wc);await marketBridgeState(slot,wc);h.lastProbeAt=Date.now();\n  if(!h.socketReady){h.lastProbeOk=false;h.lastProbeError='WebSocket do jogo ainda não foi capturado';return {ok:false,reason:'socket-unavailable'};}\n  const detail=deriveMarketDetailCandidates(recent.requests),rows=[...marketReadTemplates[slot].values()],client=deriveClientReadCandidates({},detail);\n  if(!rows.length&&!detail.length&&!client.length){h.lastProbeOk=false;h.lastProbeError='Nenhum comando de leitura seguro aprendido';return {ok:false,reason:'no-read-template'};}\n  let cmd,kind='summary';\n  if(client.length){cmd=client[h.clientCursor%client.length];h.clientCursor++;h.clientAttempts++;h.lastClientCommand='market.item';h.lastClientAsset=String(cmd.itemId??'');kind='client-list';}\n  else if(detail.length&&h.detailCursor%4!==3){cmd=detail[h.detailCursor%detail.length];h.detailCursor++;h.detailAttempts++;h.lastDetailAsset=String(cmd.elemento??'');h.lastDetailCategory=String(cmd.categoria||'');h.lastDetailType=typeof cmd.elemento;kind='detail';}\n  else{cmd=rows[h.templateCursor%Math.max(1,rows.length)]||{t:'market.itens',elemento:'',categoria:'stone'};h.templateCursor=(h.templateCursor+1)%Math.max(1,rows.length);}\n  const safe=safeMarketReadCommand(cmd);if(!safe){h.lastProbeOk=false;h.lastProbeError='Probe de leitura rejeitado pela lista segura';return {ok:false,reason:'unsafe-read-probe'};}\n  const encoded=JSON.stringify(safe);try{const result=await wc.executeJavaScript(\`window.__gridiumMarketSend?window.__gridiumMarketSend(\${encoded}):({ok:false,reason:'bridge-missing'})\`,true);h.lastProbeOk=result?.ok===true;h.lastProbeError=h.lastProbeOk?null:String(result?.reason||'probe-failed');if(h.lastProbeOk)h.lastMarketTxAt=Date.now();return {...result,command:safe,kind,detailCandidates:detail.length,clientCandidates:client.length,clientTypes:['market.item']};}catch(error){h.lastProbeOk=false;h.lastProbeError=String(error?.message||error);return {ok:false,reason:h.lastProbeError};}\n}\n`;
main=main.slice(0,probeStart)+leanProbe+'\n'+main.slice(probeEnd);

const healthStart=main.indexOf('function marketRuntimeHealth(){');
const healthEnd=main.indexOf('function setAutopilotSafeStop',healthStart);
must(healthStart>=0&&healthEnd>healthStart,'marketRuntimeHealth não encontrado');
const leanHealth=`function marketRuntimeHealth(){\n  const now=Date.now(),slots=[];let attached=0,bridges=0,sockets=0,marketRx=0,marketTx=0,summaryRows=0,listingRows=0,usable=0,lastMarketRxAt=0;\n  for(let slot=0;slot<4;slot++){\n    const market=networkInspector.recent(slot,{sinceMs:90000,limit:700,marketOnly:true}),h=marketBridgeHealth[slot],acc=(latestMarketProtocol.accounts||[]).find(x=>Number(x.slot)===slot);\n    if(market.attached)attached++;if(h.installed)bridges++;if(h.socketReady)sockets++;\n    let rxCount=0,txCount=0,rxAt=0;for(const x of market.requests){if(x.method==='RECV'){rxCount++;rxAt=Math.max(rxAt,Number(x.at)||0);}else if(x.method==='SEND')txCount++;}\n    marketRx+=rxCount;marketTx+=txCount;h.lastMarketRxAt=Math.max(h.lastMarketRxAt||0,rxAt);lastMarketRxAt=Math.max(lastMarketRxAt,h.lastMarketRxAt||0);\n    const s=Number(acc?.summaryRows)||0,l=(latestMarketProtocol.listings||[]).filter(x=>Number(x.slot)===slot&&now-(Number(x.at)||0)<=90000).length;summaryRows+=s;listingRows+=l;\n    slots.push({slot,attached:market.attached===true,bridge:h.installed===true,socket:h.socketReady===true,marketRx:rxCount,marketTx:txCount,lastMarketRxAt:h.lastMarketRxAt||0,summaryRows:s,listingRows:l,probeOk:h.lastProbeOk===true,probeError:h.lastProbeError||null,learned:h.learned||0});\n  }\n  for(const l of latestMarketProtocol.listings||[]){if(now-(Number(l.at)||0)<=45000&&Number.isInteger(Number(l.listingId))&&Number(l.listingId)>0&&['item','pokemon'].includes(l.assetType))usable++;}\n  const recentRx=lastMarketRxAt>0&&now-lastMarketRxAt<=90000;return {at:now,attached,bridges,sockets,marketRx,marketTx,summaryRows,listingRows,usable,lastMarketRxAt,recentRx,ready:attached>0&&sockets>0&&recentRx&&usable>0,slots};\n}\n`;
main=main.slice(0,healthStart)+leanHealth+main.slice(healthEnd);

const refreshStart=main.indexOf('function refreshProtocolFromNetwork(');
const refreshEnd=main.indexOf('const AUTOPILOT_ROUTES=[',refreshStart);
must(refreshStart>=0&&refreshEnd>refreshStart,'refreshProtocolFromNetwork não encontrado');
const leanRefresh=`function refreshProtocolFromNetwork({recordMarket=false,force=false}={}){\n  const now=Date.now();if(!force&&now-(Number(refreshProtocolFromNetwork.lastAt)||0)<4500)return latestMarketProtocol;refreshProtocolFromNetwork.lastAt=now;\n  const shouldRecord=recordMarket&&now-(Number(refreshProtocolFromNetwork.lastRecordAt)||0)>=6000;if(shouldRecord)refreshProtocolFromNetwork.lastRecordAt=now;\n  const protocols=[],allListings=[];for(const [slot,wc] of guests){if(wc.isDestroyed())continue;const general=networkInspector.recent(slot,{sinceMs:6*60*1000,limit:650,marketOnly:false}),market=networkInspector.recent(slot,{sinceMs:3*60*1000,limit:1200,marketOnly:true}),events=mergeNetworkRows(general.requests,market.requests);learnMarketReadTemplates(slot,market.requests);const protocol=analyzeProtocolEvents(events,slot);protocols.push(protocol);alphaEngine?.ingestProtocol(protocol);huntEngine.observeTelemetry(slot,protocol.hunt);for(const l of protocol.listings){allListings.push(l);if(shouldRecord)alphaEngine?.recordMarket(l);}}\n  if(!protocols.length)return latestMarketProtocol;const validation={...mergeValidation(protocols),...ALPHA5_VALIDATION};alphaEngine?.setValidation(validation);const retained=(latestMarketProtocol.listings||[]).filter(l=>now-(Number(l.at)||0)<=90000);const unique=new Map();for(const l of [...retained,...allListings]){const key=l.listingId?(String(l.slot)+':'+String(l.listingId)):(String(l.slot)+':'+String(l.assetType||'')+':'+String(l.assetId||l.name||'')+':'+String(l.currency||'')+':'+String(l.price||0));const prev=unique.get(key);if(!prev||Number(l.at)>Number(prev.at))unique.set(key,l);}const listings=[...unique.values()].sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0)),crossMarket=crossMarketPairs(listings);latestMarketProtocol={at:now,validation,accounts:protocols.map(p=>({slot:p.slot,account:p.account,hunt:p.hunt,buyAttempts:p.buyAttempts,warnings:p.warnings,ownListings:p.ownListings||[],actions:(p.actions||[]).slice(-40),summaryRows:p.summaries.length,speciesRows:p.species.length,listingRows:p.listings.length})),crossMarket:crossMarket.slice(0,60),listings:listings.slice(0,800)};reconcileRealSales(protocols);return latestMarketProtocol;\n}\nrefreshProtocolFromNetwork.lastAt=0;refreshProtocolFromNetwork.lastRecordAt=0;\n`;
main=main.slice(0,refreshStart)+leanRefresh+main.slice(refreshEnd);

const afterProbe="if(slots.length){const probeSlot=slots[passiveProbeCursor%slots.length];passiveProbeCursor=(passiveProbeCursor+1)%slots.length;probeResult=await sendPassiveMarketProbe(probeSlot);if(probeResult?.ok)await sleep(180);refreshProtocolFromNetwork({recordMarket:true});}";
const afterProbeNew="if(slots.length){const probeSlot=slots[passiveProbeCursor%slots.length];passiveProbeCursor=(passiveProbeCursor+1)%slots.length;probeResult=await sendPassiveMarketProbe(probeSlot);if(probeResult?.ok)await sleep(180);refreshProtocolFromNetwork({recordMarket:true,force:true});}";
must(main.includes(afterProbe),'refresh após probe não encontrado');
main=main.replace(afterProbe,afterProbeNew);

main=main.replace('timer=setInterval(poll,2000);','timer=setInterval(poll,3000);');
write('main.js',main);

let renderer=read('renderer.js');
renderer=renderer.replace(/Gridium 3\.0 Alpha 8\.6/g,'Gridium 3.0 Alpha 8.7');
write('renderer.js',renderer);

const testDir=path.join(root,'test');fs.mkdirSync(testDir,{recursive:true});
fs.writeFileSync(path.join(testDir,'alpha87-performance.test.js'),`'use strict';\nconst test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');\nconst src=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');\ntest('probe automático usa market.item sem varrer scripts',()=>{const a=src.indexOf('async function sendPassiveMarketProbe('),b=src.indexOf('function mergeNetworkRows',a),seg=src.slice(a,b);assert.match(seg,/lastClientCommand='market\\.item'/);assert.doesNotMatch(seg,/collectMarketSourceHints\\(/);assert.match(src,/const cmd=\\{t:'market\\.item',tipo:'item',itemId:id,pagina:1\\}/);});\ntest('health não reprocessa protocolo inteiro',()=>{const a=src.indexOf('function marketRuntimeHealth(){'),b=src.indexOf('function setAutopilotSafeStop',a),seg=src.slice(a,b);assert.doesNotMatch(seg,/analyzeProtocolEvents\\(/);});\ntest('refresh de protocolo tem throttle e janela reduzida',()=>{assert.match(src,/lastAt\\)\\|\\|0\\)<4500/);assert.match(src,/sinceMs:3\\*60\\*1000,limit:1200,marketOnly:true/);});\n`);
console.log('Alpha 8.7 performance patch applied');
