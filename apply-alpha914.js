'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const root=path.resolve(process.argv[2]||'gridium-build');
const overlay=path.join(__dirname,'alpha914-src');
const manifest=JSON.parse(fs.readFileSync(path.join(overlay,'manifest.json'),'utf8'));
const normalizeText=text=>String(text).replace(/\r\n/g,'\n');
const readText=file=>normalizeText(fs.readFileSync(file,'utf8'));
const sha=file=>crypto.createHash('sha256').update(readText(file)).digest('hex');
for(const [rel,expected] of Object.entries(manifest)){
  const file=path.join(overlay,rel);
  if(!fs.existsSync(file))throw new Error(`Alpha 9.14 payload ausente: ${rel}`);
  const actual=sha(file);
  if(actual!==expected)throw new Error(`Alpha 9.14 hash inválido: ${rel} ${actual} != ${expected}`);
}
const must=(cond,msg)=>{if(!cond)throw new Error(msg);};
const replaceOnce=(text,search,replacement,label)=>{
  must(text.includes(search),`Alpha 9.14: marcador não encontrado: ${label}`);
  return text.replace(search,replacement);
};

fs.copyFileSync(path.join(overlay,'perf-runtime.js'),path.join(root,'perf-runtime.js'));
fs.copyFileSync(path.join(overlay,'test','alpha914-performance.test.js'),path.join(root,'test','alpha914-performance.test.js'));

let pkg=readText(path.join(root,'package.json'));
must(/3\.0\.0-alpha\.9\.13/.test(pkg),'Alpha 9.14: versão base 9.13 não encontrada');
pkg=pkg.replace(/3\.0\.0-alpha\.9\.13/g,'3.0.0-alpha.9.14');
fs.writeFileSync(path.join(root,'package.json'),pkg);

let html=readText(path.join(root,'index.html'));
const rendererTag=/<script\s+src=["']renderer\.js["']><\/script>/;
must(rendererTag.test(html),'Alpha 9.14: script renderer.js não encontrado no index');
html=html.replace(rendererTag,'<script src="perf-runtime.js"></script>\n<script src="renderer.js"></script>');
fs.writeFileSync(path.join(root,'index.html'),html);

let engine=readText(path.join(root,'alpha-engine.js'));
engine=replaceOnce(
  engine,
  "  _rows(table){if(this.db)return this.db.prepare(`SELECT * FROM ${table} ORDER BY ${table==='alpha_positions'?'opened_at':'at'} DESC`).all();return this.fallback.data[table.replace('alpha_','')]||[];}",
  "  _rows(table){if(this._viewReadCache)this._viewReadCache.fullTableReads=(this._viewReadCache.fullTableReads||0)+1;if(this.db)return this.db.prepare(`SELECT * FROM ${table} ORDER BY ${table==='alpha_positions'?'opened_at':'at'} DESC`).all();return this.fallback.data[table.replace('alpha_','')]||[];}",
  'contador de full-table reads'
);
engine=replaceOnce(
  engine,
  "  positions(openOnly=true){let rows=this._rows('alpha_positions');if(openOnly)rows=rows.filter(x=>x.status==='open');return rows.map(x=>({...x,metadata:typeof x.metadata==='string'?(()=>{try{return JSON.parse(x.metadata)}catch{return null}})():x.metadata}));}",
  "  positions(openOnly=true){let rows=this._viewReadCache?.positions;if(rows){this._viewReadCache.cacheHits=(this._viewReadCache.cacheHits||0)+1;}else{rows=this._rows('alpha_positions').map(x=>({...x,metadata:typeof x.metadata==='string'?(()=>{try{return JSON.parse(x.metadata)}catch{return null}})():x.metadata}));if(this._viewReadCache)this._viewReadCache.positions=rows;}return openOnly?rows.filter(x=>x.status==='open'):rows;}",
  'cache de posições'
);
engine=replaceOnce(
  engine,
  "  trades(){return this._rows('alpha_trades').map(x=>({...x,metadata:typeof x.metadata==='string'?(()=>{try{return JSON.parse(x.metadata)}catch{return null}})():x.metadata}));}",
  "  trades(){let rows=this._viewReadCache?.trades;if(rows){this._viewReadCache.cacheHits=(this._viewReadCache.cacheHits||0)+1;return rows;}rows=this._rows('alpha_trades').map(x=>({...x,metadata:typeof x.metadata==='string'?(()=>{try{return JSON.parse(x.metadata)}catch{return null}})():x.metadata}));if(this._viewReadCache)this._viewReadCache.trades=rows;return rows;}",
  'cache de trades'
);
const viewStart=engine.indexOf('  view(){');
const proStart=engine.indexOf('\n  proState(){',viewStart);
must(viewStart>=0&&proStart>viewStart,'Alpha 9.14: bloco view() não encontrado');
let view=engine.slice(viewStart,proStart);
view=replaceOnce(
  view,
  "  view(){\n    const positions=",
  "  view(){\n    const previousViewCache=this._viewReadCache;this._viewReadCache={};const viewStarted=Date.now();\n    try{\n    const positions=",
  'abertura do cache de view'
);
const close=view.lastIndexOf('\n  }');
must(close>0,'Alpha 9.14: fechamento de view() não encontrado');
view=view.slice(0,close)+
  "\n    } finally {const cache=this._viewReadCache||{};this.lastViewProfile={at:Date.now(),ms:Math.max(0,Date.now()-viewStarted),fullTableReads:Number(cache.fullTableReads)||0,cacheHits:Number(cache.cacheHits)||0};this._viewReadCache=previousViewCache;}\n  }"+
  view.slice(close+4);
engine=engine.slice(0,viewStart)+view+engine.slice(proStart);
fs.writeFileSync(path.join(root,'alpha-engine.js'),engine);

let main=readText(path.join(root,'main.js'));
main=replaceOnce(
  main,
  "const {Worker}=require('worker_threads');\n",
  "const {Worker}=require('worker_threads');\nconst {createCoalescedPublisher}=require('./perf-runtime');\n",
  'import do publisher'
);
main=replaceOnce(
  main,
  "function publish(){if(win&&!win.isDestroyed())win.webContents.send('grid:update',snapshot());}",
  "const statePublisher=createCoalescedPublisher({delayMs:32,build:snapshot,send:payload=>{if(win&&!win.isDestroyed())win.webContents.send('grid:update',payload);}});\nfunction publish(options={}){statePublisher.request({immediate:options?.immediate===true});}",
  'publish coalescido'
);
fs.writeFileSync(path.join(root,'main.js'),main);

let renderer=readText(path.join(root,'renderer.js'));
renderer=replaceOnce(
  renderer,
  "async function refreshAlpha(force=false){if(alphaRefreshBusy)return;if(!force&&alphaState&&Date.now()-(alphaState._loadedAt||0)<5000)return;alphaRefreshBusy=true;try{const s=await window.gridAPI.alphaState();if(s){s._loadedAt=Date.now();renderAlpha(s);}}catch(e){console.error(e);}finally{alphaRefreshBusy=false;}}",
  "let alphaRenderFrame=0,pendingAlphaRender=null,lastAlphaRenderSignature='';\nfunction scheduleAlphaRender(state,{force=false}={}){if(!state)return;alphaState=state;if(activeSection!=='alpha')return;pendingAlphaRender=state;if(alphaRenderFrame)return;alphaRenderFrame=requestAnimationFrame(()=>{alphaRenderFrame=0;const next=pendingAlphaRender;pendingAlphaRender=null;if(!next||activeSection!=='alpha')return;const sig=window.GridiumPerf?.signature?window.GridiumPerf.signature(next):String(Date.now());if(!force&&sig===lastAlphaRenderSignature)return;lastAlphaRenderSignature=sig;const started=performance.now();renderAlpha(next);window.__gridiumPerf=window.__gridiumPerf||{};window.__gridiumPerf.lastAlphaRenderMs=Math.round((performance.now()-started)*100)/100;window.__gridiumPerf.lastAlphaRenderAt=Date.now();});}\nasync function refreshAlpha(force=false){if(alphaRefreshBusy)return;if(!force&&alphaState&&Date.now()-(alphaState._loadedAt||0)<5000)return;alphaRefreshBusy=true;try{const s=await window.gridAPI.alphaState();if(s){s._loadedAt=Date.now();scheduleAlphaRender(s,{force});}}catch(e){console.error(e);}finally{alphaRefreshBusy=false;}}",
  'scheduler de render Alpha'
);
renderer=replaceOnce(
  renderer,
  "renderComparison(data);renderHealth(data);renderHuntPerformance(data);renderResources(value);renderGoals();$('reset').textContent=selected==='all'?'Zerar geral':'Zerar conta';",
  "if(activeSection==='dashboard'){renderComparison(data);renderHealth(data);renderHuntPerformance(data);renderResources(value);renderGoals();}$('reset').textContent=selected==='all'?'Zerar geral':'Zerar conta';",
  'DOM pesado do dashboard sob demanda'
);
renderer=replaceOnce(
  renderer,
  "if(data.hunt)renderHunt(data.hunt,data);if(data.marketProtocol)renderMarketProtocol(data.marketProtocol);if(data.alpha){const audit=alphaState?.audit||[];renderAlpha({...data.alpha,audit});}\n  if(Date.now()-lastExtras>10000)void refreshExtras();if(activeSection==='alpha')void refreshAlpha();",
  "if(data.hunt&&activeSection==='hunt')renderHunt(data.hunt,data);if(data.marketProtocol&&activeSection==='alpha')renderMarketProtocol(data.marketProtocol);if(data.alpha){const audit=alphaState?.audit||[];alphaState={...data.alpha,audit};if(activeSection==='alpha')scheduleAlphaRender(alphaState);}\n  if(Date.now()-lastExtras>10000&&activeSection==='dashboard')void refreshExtras();",
  'render por seção e remoção de refresh duplicado'
);
renderer=replaceOnce(
  renderer,
  "function setSection(id){activeSection=id;document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===id));document.querySelectorAll('.workspace-section').forEach(s=>s.classList.toggle('active',s.id===id));sendPerformanceView();if(id==='dashboard')requestAnimationFrame(drawChart);if(id==='alpha'){void refreshAlpha(true);void refreshMarketDesk();requestAnimationFrame(()=>alphaState&&drawAlphaCurve(alphaState));}}",
  "function setSection(id){activeSection=id;document.querySelectorAll('[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===id));document.querySelectorAll('.workspace-section').forEach(s=>s.classList.toggle('active',s.id===id));sendPerformanceView();if(id==='dashboard'){if(current){const row=selected==='all'?null:current.rows?.[Number(selected)],value=selected==='all'?current.total?.values:row?.record?.values;renderComparison(current);renderHealth(current);renderHuntPerformance(current);renderResources(value);renderGoals();void refreshExtras(true);}requestAnimationFrame(drawChart);}if(id==='hunt'&&current?.hunt)renderHunt(current.hunt,current);if(id==='alpha'){if(current?.marketProtocol)renderMarketProtocol(current.marketProtocol);if(alphaState)scheduleAlphaRender(alphaState,{force:true});void refreshAlpha(true);void refreshMarketDesk();requestAnimationFrame(()=>alphaState&&drawAlphaCurve(alphaState));}}",
  'hidratação ao trocar seção'
);
fs.writeFileSync(path.join(root,'renderer.js'),renderer);

for(const file of ['main.js','renderer.js','alpha-engine.js','perf-runtime.js']) {
  const text=fs.readFileSync(path.join(root,file),'utf8');
  must(!text.includes('\u0000'),`Alpha 9.14: NUL em ${file}`);
}
console.log(`Gridium 3.0.0-alpha.9.14 aplicado: cache transacional de view, publish agrupado e renderização por seção.`);
