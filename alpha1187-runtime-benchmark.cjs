'use strict';
const {app,nativeImage}=require('electron');
const {monitorEventLoopDelay}=require('node:perf_hooks');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'.'),out=path.resolve(process.argv[3]||path.join(root,'alpha1187-runtime-benchmark.json'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function image(width,height,seed){const b=Buffer.alloc(width*height*4);for(let i=0;i<b.length;i+=4){b[i]=(seed*31+i)&255;b[i+1]=(seed*17+(i>>2))&255;b[i+2]=(seed*7)&255;b[i+3]=255;}return nativeImage.createFromBitmap(b,{width,height,scaleFactor:1});}
function cpuMs(delta){return (delta.user+delta.system)/1000;}
async function profile(manager,{name,demand,sources,durationMs=5000,ackDelayMs=25}){
  manager._stopAllCapture();manager.demand={sessionId:'bench-'+name,deviceId:'synthetic',cellular:false,saveData:true,...demand};manager.connected=true;manager._invalidatePlans();
  const callbacks=new Map(),images=new Map();
  for(const [slot,source] of Object.entries(sources)){const s=Number(slot);images.set(s,image(source.width,source.height,s+1));manager.registerGuest(s,{isDestroyed:()=>false,beginFrameSubscription:(_dirty,cb)=>callbacks.set(s,cb),endFrameSubscription:()=>callbacks.delete(s)});}
  manager._publisherSend=msg=>{if(msg.type==='frame')setTimeout(()=>manager._frameAck({sessionId:msg.sessionId,slot:msg.slot,seq:msg.seq,ok:true,processingMs:ackDelayMs}),ackDelayMs);return true;};
  manager._syncCapture();const plans=manager._refreshPlans(),timers=[];let stopped=false;
  const histogram=monitorEventLoopDelay({resolution:10});histogram.enable();const cpuStart=process.cpuUsage(),memoryStart=process.memoryUsage().rss,started=Date.now();
  for(const [slot,cb] of callbacks){const p=plans[slot],source=sources[slot];if(!p?.active||!p.fps)continue;const tick=()=>{if(stopped)return;cb(images.get(slot),{x:0,y:0,width:source.width,height:source.height});timers.push(setTimeout(tick,Math.max(1,Math.round(1000/p.fps))))};tick();}
  await sleep(durationMs);stopped=true;for(const t of timers)clearTimeout(t);await sleep(Math.max(100,ackDelayMs*3));histogram.disable();const elapsed=Date.now()-started,cpu=process.cpuUsage(cpuStart),memoryEnd=process.memoryUsage().rss;
  const captures=[...manager.capture.entries()].map(([slot,s])=>({slot,frames:s.frames,dropped:s.dropped,superseded:s.superseded,acked:s.acked,ackTimeouts:s.ackTimeouts,pending:!!s.pending,inFlight:!!s.inFlight,prepareMs:s.prepareEmaMs==null?null:Number(s.prepareEmaMs.toFixed(2)),ackLagMs:s.ackLagEmaMs==null?null:Number(s.ackLagEmaMs.toFixed(1)),consumerMs:s.consumerEmaMs==null?null:Number(s.consumerEmaMs.toFixed(2)),nativeResizeFrames:s.nativeResizeFrames,publisherScaleFrames:s.publisherScaleFrames}));
  const report={name,durationMs:elapsed,cpuMs:Number(cpuMs(cpu).toFixed(1)),cpuEquivalentPercent:Number((cpuMs(cpu)/elapsed*100).toFixed(1)),rssDeltaMB:Number(((memoryEnd-memoryStart)/1024/1024).toFixed(1)),eventLoopDelayMs:{mean:Number((histogram.mean/1e6).toFixed(2)),p95:Number((histogram.percentile(95)/1e6).toFixed(2)),max:Number((histogram.max/1e6).toFixed(2))},captures};manager._stopAllCapture();manager.guests.clear();return report;
}
app.whenReady().then(async()=>{
  const {MirrorManager}=require(path.join(root,'mirror-runtime'));const manager=new MirrorManager();manager.running=true;
  const grid=await profile(manager,{name:'grid-4x-960x540-to-640x360-4fps',demand:{profile:'balanced',view:'grid',selectedSlot:0},sources:{0:{width:960,height:540},1:{width:960,height:540},2:{width:960,height:540},3:{width:960,height:540}}});
  const single=await profile(manager,{name:'single-1920x1080-to-1280x720-10fps',demand:{profile:'auto',view:'single',selectedSlot:0},sources:{0:{width:1920,height:1080}}});
  const report={kind:'synthetic-main-frame-preparation-benchmark',note:'Synthetic Electron main-process benchmark using generated NativeImage frames and delayed synthetic consumer ACKs. It measures preparation/backpressure behavior only; it is not four live PokeIdle accounts or a physical-phone measurement.',electron:process.versions.electron,at:new Date().toISOString(),grid,single};fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));manager._stopAllCapture();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
app.on('window-all-closed',()=>{});
