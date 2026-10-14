'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
const must=(c,m)=>{if(!c)throw new Error('Alpha 11.4 long-session: '+m);};

let network=read('network-inspector.js');
if(!network.includes('GRID_LONG_SESSION_GUARD_114')){
  must(network.includes('module.exports={NetworkInspector'),'NetworkInspector export ausente');
  network+=`

// GRID_LONG_SESSION_GUARD_114
const GRID114_MAX_PENDING_REQUESTS=2048;
const GRID114_PENDING_TTL_MS=2*60*1000;
const GRID114_PRUNE_INTERVAL_MS=15000;
function grid114PruneNetworkState(state,ts=Date.now()){
  if(!state?.byId)return;
  const last=Number(state.__grid114ByIdPruneAt||0);
  if(state.byId.size<=GRID114_MAX_PENDING_REQUESTS&&ts-last<GRID114_PRUNE_INTERVAL_MS)return;
  state.__grid114ByIdPruneAt=ts;
  for(const [id,row] of state.byId){
    const at=Number(row?.at||0);
    if(at>0&&ts-at>GRID114_PENDING_TTL_MS)state.byId.delete(id);
  }
  if(state.byId.size>GRID114_MAX_PENDING_REQUESTS){
    const rows=[...state.byId.entries()].sort((a,b)=>Number(a[1]?.at||0)-Number(b[1]?.at||0));
    for(const [id] of rows.slice(0,state.byId.size-GRID114_MAX_PENDING_REQUESTS))state.byId.delete(id);
  }
}
const grid114BaseNetworkOnMessage=NetworkInspector.prototype._onMessage;
NetworkInspector.prototype._onMessage=function(slot,method,p={}){
  const before=this.states?.get(slot);if(before)grid114PruneNetworkState(before,Date.now());
  const result=grid114BaseNetworkOnMessage.call(this,slot,method,p);
  const state=this.states?.get(slot);if(!state)return result;
  const id=String(p?.requestId||'');
  if(id&&(method==='Network.loadingFinished'||method==='Network.loadingFailed'))state.byId?.delete(id);
  grid114PruneNetworkState(state,Date.now());
  return result;
};
`;
}
write('network-inspector.js',network);

let runtime=read('sniper-runtime.js');
const oldTrim=`    if(this.watch.size>160){const sorted=[...this.watch.entries()].sort((a,b)=>Number(a[1].updatedAt)-Number(b[1].updatedAt));for(const [k] of sorted.slice(0,this.watch.size-160))this.watch.delete(k);}`;
const newTrim=`    if(this.watch.size>160){
      let excess=this.watch.size-160;
      const terminal=[...this.watch.entries()].filter(([,row])=>['WON','LOST','FAILED'].includes(row?.state)).sort((a,b)=>Number(a[1]?.updatedAt||0)-Number(b[1]?.updatedAt||0));
      const active=[...this.watch.entries()].filter(([,row])=>!['WON','LOST','FAILED'].includes(row?.state)).sort((a,b)=>Number(b[1]?.listing?.availableAt||0)-Number(a[1]?.listing?.availableAt||0));
      for(const [k,row] of [...terminal,...active]){
        if(excess<=0)break;
        const timer=this.timers.get(k);if(timer){clearTimeout(timer);this.timers.delete(k);}
        if(!['WON','LOST','FAILED'].includes(row?.state)){
          row.state='FAILED';row.reason='queue-capacity';row.updatedAt=ts;this.metrics.failed++;
          this._push('FAILED','Fila do Sniper cheia; oportunidade descartada com timer cancelado',{listing:copy(row.listing),reason:'queue-capacity'});
        }
        this.watch.delete(k);excess--;
      }
    }
    for(const [k,timer] of this.timers){if(!this.watch.has(k)){clearTimeout(timer);this.timers.delete(k);}}`;
if(!runtime.includes('GRID_SNIPER_QUEUE_GUARD_114')){
  must(runtime.includes(oldTrim),'âncora _trim do Sniper ausente');
  runtime=runtime.replace(oldTrim,newTrim+'\n    // GRID_SNIPER_QUEUE_GUARD_114');
}
write('sniper-runtime.js',runtime);

const pkgPath=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='3.0.0-alpha.11.4';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

for(const name of ['mobile-command-center.test.js','performance-cleanup.test.js','shiny-cloud-integration.test.js','sniper-arm-ui.test.js']){
  const file=path.join(root,'test',name);
  if(!fs.existsSync(file))continue;
  const before=fs.readFileSync(file,'utf8');
  const after=before.replaceAll('3.0.0-alpha.11.3','3.0.0-alpha.11.4');
  if(before===after)throw new Error('Alpha 11.4 long-session: versão esperada não encontrada em '+name);
  fs.writeFileSync(file,after,'utf8');
}
console.log('Gridium Alpha 11.4: long-session retention guards applied.');
