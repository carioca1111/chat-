'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
const must=(c,m)=>{if(!c)throw new Error('Alpha 11.2 persistence: '+m);};
function once(s,a,b,label){must(s.includes(a),'âncora ausente: '+label);return s.replace(a,b);}
function bounds(text,name){let start=text.indexOf('function '+name+'(');if(start<0)start=text.indexOf('async function '+name+'(');must(start>=0,name+' ausente');const open=text.indexOf('{',start);let depth=0,q='',esc=false,line=false,block=false;for(let i=open;i<text.length;i++){const c=text[i],n=text[i+1];if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}if(q){if(esc){esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c===q)q='';continue;}if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}if(c==='"'||c==="'"||c==='`'){q=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return {start,end:i+1};}throw new Error('fim '+name+' ausente');}
function fn(s,n,r){const b=bounds(s,n);return s.slice(0,b.start)+r+s.slice(b.end);}

let main=read('main.js');
const queues=`
let statsWritePending=null,historyWritePending=null,statsWriteDrain=null,historyWriteDrain=null;
async function atomicWrite112(target,text){await fs.promises.mkdir(path.dirname(target),{recursive:true});const tmp=target+'.tmp';await fs.promises.writeFile(tmp,text,'utf8');await fs.promises.rename(tmp,target);}
function drainStats112(){if(statsWriteDrain)return statsWriteDrain;statsWriteDrain=(async()=>{await new Promise(resolve=>setImmediate(resolve));while(statsWritePending!==null){const item=statsWritePending;statsWritePending=null;try{await atomicWrite112(item.target,item.text);saveError=false;}catch{saveError=true;}}})().finally(()=>{statsWriteDrain=null;if(statsWritePending!==null)drainStats112();});return statsWriteDrain;}
function drainHistory112(){if(historyWriteDrain)return historyWriteDrain;historyWriteDrain=(async()=>{await new Promise(resolve=>setImmediate(resolve));while(historyWritePending!==null){const item=historyWritePending;historyWritePending=null;try{await atomicWrite112(item.target,item.text);historySaveError=false;historyDirty=false;}catch{historySaveError=true;}}})().finally(()=>{historyWriteDrain=null;if(historyWritePending!==null)drainHistory112();});return historyWriteDrain;}
async function flushRuntimePersistence112(){if(statsWritePending!==null&&!statsWriteDrain)drainStats112();if(historyWritePending!==null&&!historyWriteDrain)drainHistory112();await Promise.allSettled([statsWriteDrain,historyWriteDrain].filter(Boolean));}
`;
main=once(main,'const historyFile=()=>path.join(app.getPath(\'userData\'),\'grid-history.json\');','const historyFile=()=>path.join(app.getPath(\'userData\'),\'grid-history.json\');'+queues,'persistence queues');
main=fn(main,'save',`function save(){try{const target=file(),payload=stats.save();delete payload.history;statsWritePending={target,text:JSON.stringify({settings,...payload})};drainStats112();return true;}catch{return false;}}`);
main=fn(main,'saveHistory',`function saveHistory(){try{historyWritePending={target:historyFile(),text:JSON.stringify({version:1,history:stats.history})};drainHistory112();return true;}catch{return false;}}`);
const quitPrefix="app.on('before-quit',async event=>{if(shinyTelemetry&&!shinyQuitReady&&event?.preventDefault){event.preventDefault();await shinyTelemetry.close();shinyQuitReady=true;app.quit();return;}";
const quitReplacement="let runtimeQuitReady112=false;\napp.on('before-quit',async event=>{if(!runtimeQuitReady112&&event?.preventDefault){event.preventDefault();if(shinyTelemetry&&!shinyQuitReady){await shinyTelemetry.close();shinyQuitReady=true;}if(stats){persist();persistHistory(true);}await sniperRuntime?.flush?.();await flushRuntimePersistence112();runtimeQuitReady112=true;app.quit();return;}";
main=once(main,quitPrefix,quitReplacement,'quit flush');
main=main.replace("if(stats){persist();persistHistory(true);}networkInspector.close();huntIntelligence?.close();sniperRuntime?.close();","networkInspector.close();huntIntelligence?.close();sniperRuntime?.close();");
write('main.js',main);

let runtime=read('sniper-runtime.js');
runtime=once(runtime,"this.mode='OFF';this.killSwitch=true;this.policy=normalizePolicy({},{});this.lastTrimAt=0;","this.mode='OFF';this.killSwitch=true;this.policy=normalizePolicy({},{});this.lastTrimAt=0;this.persistPending=null;this.persistDrain=null;this.persistTimer=null;",'runtime persist fields');
runtime=fn(runtime,'save',`save(force=false){
    if(!this.persistenceFile)return Promise.resolve();
    try{const metrics={...this.metrics,decision:undefined,server:undefined};this.persistPending=JSON.stringify({policy:this.policy,metrics,feed:this.feed.slice(-120)});}catch{return Promise.resolve();}
    const start=()=>{if(this.persistDrain)return this.persistDrain;const fs=require('fs'),path=require('path');this.persistDrain=(async()=>{while(this.persistPending!==null){const text=this.persistPending;this.persistPending=null;try{await fs.promises.mkdir(path.dirname(this.persistenceFile),{recursive:true});const tmp=this.persistenceFile+'.tmp';await fs.promises.writeFile(tmp,text,'utf8');await fs.promises.rename(tmp,this.persistenceFile);}catch{}}})().finally(()=>{this.persistDrain=null;if(this.persistPending!==null)start();});return this.persistDrain;};
    if(force){if(this.persistTimer){clearTimeout(this.persistTimer);this.persistTimer=null;}return start();}
    if(!this.persistTimer&&!this.persistDrain)this.persistTimer=setTimeout(()=>{this.persistTimer=null;void start();},250);
    return this.persistDrain||Promise.resolve();
  }`);
runtime=runtime.replace('this.save();return this.snapshot();','void this.save(true);return this.snapshot();');
runtime=runtime.replace('this.busySlots.clear();this.save();return this.snapshot();','this.busySlots.clear();void this.save(true);return this.snapshot();');
runtime=runtime.replace('finally{this.busySlots.delete(Number(l.slot));const claim=this.claims.get(key);if(claim)claim.state=row.state;this.save();}','finally{this.busySlots.delete(Number(l.slot));const claim=this.claims.get(key);if(claim)claim.state=row.state;void this.save(true);}');
runtime=runtime.replace('  close(){this.kill(true);this.save();}','  async flush(){if(this.persistTimer){clearTimeout(this.persistTimer);this.persistTimer=null;}await this.save(true);if(this.persistDrain)await this.persistDrain;}\n  close(){this.kill(true);void this.save(true);}');
write('sniper-runtime.js',runtime);
console.log('Gridium Alpha 11.2: persistência normal usa fila assíncrona/atomic rename; flush crítico preservado no fechamento e no Sniper.');
