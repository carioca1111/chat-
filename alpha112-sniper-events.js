'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
const must=(c,m)=>{if(!c)throw new Error('Alpha 11.2 sniper: '+m);};
function once(s,a,b,label){must(s.includes(a),'âncora ausente: '+label);return s.replace(a,b);}

let runtime=read('sniper-runtime.js');
runtime=once(runtime,"constructor({persistenceFile='',onDecision=null,onPostEvent=null}={}){","constructor({persistenceFile='',onDecision=null,onPostEvent=null,onListing=null}={}){",'constructor onListing');
runtime=once(runtime,"this.onPostEvent=typeof onPostEvent==='function'?onPostEvent:null;","this.onPostEvent=typeof onPostEvent==='function'?onPostEvent:null;\n    this.onListing=typeof onListing==='function'?onListing:null;",'atribuição onListing');
runtime=once(runtime,"if(p.t!=='market'||this.mode==='OFF')return;","if(p.t!=='market')return;",'market mesmo com Lightning OFF');
runtime=once(runtime,"if(!['meus','especies'].includes(String(p.aba||'')))for(const l of rows)this.ingestOne(l,at);","if(!['meus','especies'].includes(String(p.aba||''))){if(this.mode!=='OFF')for(const l of rows)this.ingestOne(l,at);if(rows.length&&this.onListing)setImmediate(()=>{for(const l of rows)try{this.onListing(copy(l));}catch{}});}",'fanout inteligência fora do hot path');
write('sniper-runtime.js',runtime);

let main=read('main.js');
const intelFns=`
const sniperIntelCache=new Map(),sniperIntelQueued=new Map();let sniperIntelTimer=null,sniperIntelBusy=false,sniperIntelLastError=null;
function sniperIntelId(l={}){return String(l.listingId||l.id||'');}
function sniperIntelSig(l={}){return [l.price,l.currency,l.assetType,l.assetId,l.shiny===true?1:0,l.availableAt].join('|');}
function pruneSniperIntel(ts=Date.now()){for(const [k,v] of sniperIntelCache)if(ts-Number(v.at||0)>10*60*1000)sniperIntelCache.delete(k);if(sniperIntelCache.size>500){const rows=[...sniperIntelCache.entries()].sort((a,b)=>Number(a[1].at)-Number(b[1].at));for(const [k] of rows.slice(0,sniperIntelCache.size-500))sniperIntelCache.delete(k);}}
function emitSniperEvent(payload){if(win&&!win.isDestroyed())win.webContents.send('grid:sniper-event',payload);}
function queueSniperIntelligence(listing){const id=sniperIntelId(listing);if(!id)return;const sig=sniperIntelSig(listing),cached=sniperIntelCache.get(id);if(cached?.sig===sig){cached.at=Date.now();return;}sniperIntelQueued.set(id,{listing:{...listing},sig});if(!sniperIntelTimer)sniperIntelTimer=setTimeout(()=>{sniperIntelTimer=null;setImmediate(()=>void flushSniperIntelligence());},35);}
async function flushSniperIntelligence(){if(sniperIntelBusy||!sniperIntelQueued.size)return;sniperIntelBusy=true;const batch=[...sniperIntelQueued.entries()].slice(0,80);for(const [k] of batch)sniperIntelQueued.delete(k);try{const evaluated=await evaluateListingsInWorker(batch.map(([,x])=>x.listing),'balanced');const byId=new Map(batch);for(const row of evaluated||[]){const id=sniperIntelId(row);if(!id)continue;const source=byId.get(id);sniperIntelCache.set(id,{row,at:Date.now(),sig:source?.sig||sniperIntelSig(row)});}sniperIntelLastError=null;pruneSniperIntel();emitSniperEvent({kind:'intel',changed:evaluated?.map(sniperIntelId).filter(Boolean)||[],at:Date.now()});}catch(error){sniperIntelLastError=String(error?.message||error);stopAlphaAnalysisWorker(sniperIntelLastError);}finally{sniperIntelBusy=false;if(sniperIntelQueued.size&&!sniperIntelTimer)sniperIntelTimer=setTimeout(()=>{sniperIntelTimer=null;setImmediate(()=>void flushSniperIntelligence());},35);}}
function sniperIntelligenceSnapshot(){pruneSniperIntel();const opportunities=[...sniperIntelCache.values()].map(x=>x.row).filter(Boolean).sort((a,b)=>(b.evaluation?.alphaScore||0)-(a.evaluation?.alphaScore||0)).slice(0,80);return {at:Date.now(),sampleCount:sniperIntelCache.size,opportunities,analysisCore:{online:alphaAnalysisWorker!==null||!sniperIntelLastError,pending:sniperIntelQueued.size+(sniperIntelBusy?1:0),lastError:sniperIntelLastError},feePct:{...(alphaEngine?.settings?.feePct||{})}};}
`;
main=once(main,'function intelligencePass(row,cfg={}){',intelFns+'\nfunction intelligencePass(row,cfg={}){','cache incremental intelligence');
const start=main.indexOf("  handler('grid:sniper-intelligence',async()=>{");
const end=main.indexOf("  handler('grid:sniper-manual-buy'",start);
must(start>=0&&end>start,'handler sniper intelligence não encontrado');
main=main.slice(0,start)+`  handler('grid:sniper-intelligence',async()=>{if(!alphaEngine||!sniperRuntime)throw new Error('Inteligência indisponível');for(const row of (latestMarketProtocol.listings||[]).slice(-240))queueSniperIntelligence(row);return sniperIntelligenceSnapshot();});\n`+main.slice(end);
main=once(main,"if(sniperRuntime){sniperRuntime.onDecision=executeLightningBuy;sniperRuntime.onPostEvent=row=>{if(win&&!win.isDestroyed())win.webContents.send('grid:sniper-event',row);};}","if(sniperRuntime){sniperRuntime.onDecision=executeLightningBuy;sniperRuntime.onPostEvent=row=>emitSniperEvent({kind:'feed',row,at:Date.now()});sniperRuntime.onListing=listing=>queueSniperIntelligence(listing);}",'callbacks sniper');
write('main.js',main);

let preload=read('preload.js');
preload=once(preload,"  sniperManualBuy:listing=>ipcRenderer.invoke('grid:sniper-manual-buy',listing),",`  sniperManualBuy:listing=>ipcRenderer.invoke('grid:sniper-manual-buy',listing),
  onSniper:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('grid:sniper-event',listener);return ()=>ipcRenderer.removeListener('grid:sniper-event',listener);},`,'preload sniper event');
write('preload.js',preload);

let ui=read('sniper-ui.js');
ui=once(ui,"let active=false,state=null,intel=null,pollTimer=null,intelTimer=null,localLogs=[];","let active=false,state=null,intel=null,eventUnsub=null,refreshQueued=false,intelQueued=false,localLogs=[];",'estado UI event driven');
const oldStart="function start(){if(pollTimer)return;void refresh();void refreshIntel();pollTimer=setInterval(refresh,600);intelTimer=setInterval(refreshIntel,3500);}\n  function stop(){clearInterval(pollTimer);clearInterval(intelTimer);pollTimer=intelTimer=null;}";
const newStart=`function queueRefresh(kind='state'){if(!active)return;if(kind==='intel'){if(intelQueued)return;intelQueued=true;queueMicrotask(async()=>{try{await refreshIntel();}finally{intelQueued=false;}});return;}if(refreshQueued)return;refreshQueued=true;queueMicrotask(async()=>{try{await refresh();}finally{refreshQueued=false;}});}
  function applySniperEvent(evt){if(!active||!evt)return;if(evt.kind==='feed'&&evt.row){localLogs.unshift(evt.row);if(localLogs.length>120)localLogs.length=120;renderLogs(state);queueRefresh('state');}else if(evt.kind==='intel')queueRefresh('intel');else queueRefresh('state');}
  function start(){if(eventUnsub)return;void refresh();void refreshIntel();eventUnsub=window.gridAPI.onSniper?.(applySniperEvent)||(()=>{});}
  function stop(){try{eventUnsub?.();}catch{}eventUnsub=null;refreshQueued=intelQueued=false;}`;
ui=once(ui,oldStart,newStart,'polling UI sniper');
write('sniper-ui.js',ui);
console.log('Gridium Alpha 11.2: Market Sniper UI e Inteligência agora são event-driven/incrementais; nenhum polling 600ms/3.5s permanece.');
