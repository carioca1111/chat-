'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
const must=(condition,message)=>{if(!condition)throw new Error('Alpha 11.8.7 Performance Hardening: '+message);};
function once(text,from,to,label){const count=text.split(from).length-1;must(count===1,`${label}: expected one anchor, got ${count}`);return text.replace(from,to);}
const BASE_VERSION='3.0.0-alpha.11.8.6',NEXT_VERSION='3.0.0-alpha.11.8.7';
const pkg=JSON.parse(read('package.json'));must(pkg.version===BASE_VERSION,'exact Alpha 11.8.6 base expected, current '+pkg.version);
const htmlBefore=read('index.html'),partitions=htmlBefore.match(/partition="persist:pokeidle-account-[1-4]"/g)||[];
must(partitions.length===4,'four persistent account partitions expected before release bump');
let main=read('main.js'),runtime=read('mirror-runtime.js');const publisher=read('mirror-publisher.js');
must(main.includes('mirrorRuntime?.registerGuest(slot,wc)'),'mirror guest registration missing');
must(runtime.includes("msg.type==='frame-ack'"),'bounded mirror ACK handling missing');
must(runtime.includes('FRAME_ACK_TIMEOUT_MS'),'mirror ACK timeout recovery missing');
must(runtime.includes('planCacheKey'),'mirror plan cache missing');
must(publisher.includes("type:'frame-ack'"),'publisher frame ACK missing');
must(publisher.includes('pendingPlans'),'encoder plan coalescing missing');
// A full 1080p RGBA frame is ~7.9 MiB. Keep that out of the main->publisher IPC
// path and accept native resize in the main process when the raw transfer would
// exceed 4 MiB. Mid-size frames still skip resize and are scaled by WebGL.
runtime=once(runtime,'const MAX_RAW_IPC_BYTES=8*1024*1024;','const MAX_RAW_IPC_BYTES=4*1024*1024;','raw IPC budget');
runtime=once(runtime,'constructor({getRemote,getAccounts,logger=()=>{},now=()=>Date.now()}={}){','constructor({getRemote,getAccounts,logger=()=>{},now=()=>Date.now(),onDemandChange=()=>{}}={}){','mirror callback constructor');
runtime=once(runtime,'this.getRemote=getRemote||(()=>({}));this.getAccounts=getAccounts||(()=>[]);this.logger=logger;this.now=now;','this.getRemote=getRemote||(()=>({}));this.getAccounts=getAccounts||(()=>[]);this.logger=logger;this.now=now;this.onDemandChange=onDemandChange;','mirror callback assignment');
runtime=once(runtime,'if(before!==after){this._invalidatePlans();this._sendPlans();if(this.connected)this._syncCapture();}','if(before!==after){this._invalidatePlans();this._sendPlans();if(this.connected)this._syncCapture();try{this.onDemandChange(this.status())}catch{}}','demand-change callback');
runtime=once(runtime,"this.connected=msg.state==='connected';if(this.connected){this.backoffIndex=0;this._syncCapture();}else {this._stopAllCapture();}","this.connected=msg.state==='connected';if(this.connected){this.backoffIndex=0;this._syncCapture();}else {this._stopAllCapture();}try{this.onDemandChange(this.status())}catch{}",'connection callback');
runtime=once(runtime,"this.connected=false;this._stopAllCapture();const p=this.publisher;this.publisher=null;this.publisherReady=false;const old=this.demand;this.demand=null;this.plans=[];this.planCacheKey='';this.sentPlanKey='';","this.connected=false;this._stopAllCapture();const p=this.publisher;this.publisher=null;this.publisherReady=false;const old=this.demand;this.demand=null;this.plans=[];this.planCacheKey='';this.sentPlanKey='';try{this.onDemandChange(this.status())}catch{}",'deactivation callback');
// Hidden-on-PC accounts can still be visible on the phone. Mobile-visible slots
// must not receive visual CSS reduction or background throttling while streamed.
main=once(main,"const plan=performancePlan(slot),next={wcId:Number(wc.id)||0,reduceVisuals:!!plan.reduceVisuals,backgroundThrottling:settings.liveEcoMode?false:!settings.background,mute:!!settings.mute,zoom:settings.zoom[slot]||1}","const plan=performancePlan(slot),mirrorState=mirrorRuntime?.status?.(),mirrorVisible=!!mirrorState?.connected&&(mirrorState.view!=='single'||Number(mirrorState.selectedSlot)===Number(slot)),next={wcId:Number(wc.id)||0,reduceVisuals:mirrorVisible?false:!!plan.reduceVisuals,backgroundThrottling:mirrorVisible?false:(settings.liveEcoMode?false:!settings.background),mute:!!settings.mute,zoom:settings.zoom[slot]||1}",'mobile-visible guest policy');
main=once(main,"mirrorRuntime=new MirrorManager({getRemote:()=>settings.remote,getAccounts:()=>stats?.view()?.rows||[],logger:message=>{if(process.env.GRID_MIRROR_DEBUG==='1')console.log('[mirror]',message);}});","mirrorRuntime=new MirrorManager({getRemote:()=>settings.remote,getAccounts:()=>stats?.view()?.rows||[],onDemandChange:()=>scheduleGuestPerformance(50),logger:message=>{if(process.env.GRID_MIRROR_DEBUG==='1')console.log('[mirror]',message);}});",'mirror performance invalidation hook');
write('main.js',main);write('mirror-runtime.js',runtime);
fs.mkdirSync(path.join(root,'test'),{recursive:true});
fs.copyFileSync(path.join(__dirname,'alpha1187-src/test/performance-hardening.test.js'),path.join(root,'test/performance-hardening.test.js'));
let versionChecksUpdated=0;
for(const name of fs.readdirSync(path.join(root,'test'))){
  if(!name.endsWith('.test.js'))continue;const file=path.join(root,'test',name),source=fs.readFileSync(file,'utf8');if(!source.includes(BASE_VERSION))continue;
  versionChecksUpdated+=source.split(BASE_VERSION).length-1;fs.writeFileSync(file,source.split(BASE_VERSION).join(NEXT_VERSION));
}
pkg.version=NEXT_VERSION;pkg.description='Gridium Alpha 11.8.7 — Performance hardening do espelhamento e das contas';write('package.json',JSON.stringify(pkg,null,2)+'\n');
const htmlAfter=read('index.html'),partitionsAfter=htmlAfter.match(/partition="persist:pokeidle-account-[1-4]"/g)||[];
must(JSON.stringify(partitionsAfter)===JSON.stringify(partitions),'persistent account partitions changed during release layer');
console.log(`Alpha 11.8.7 performance hardening applied; mobile-visible accounts protected; 4 MiB raw IPC budget; ${versionChecksUpdated} inherited release marker(s) synchronized.`);
