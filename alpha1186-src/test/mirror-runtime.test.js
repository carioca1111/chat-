'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){if(request==='electron')return {app:{getAppMetrics:()=>[]},BrowserWindow:function(){},ipcMain:{on(){},removeListener(){}},nativeImage:{createFromDataURL:()=>({toBitmap:()=>Buffer.from([255,0,0,255])})}};return originalLoad.call(this,request,parent,isMain)};
const runtime=require('../mirror-runtime');Module._load=originalLoad;
const immediate=()=>new Promise(resolve=>setImmediate(resolve));

test('2x2 profiles never exceed 5 FPS and single never exceeds 15 FPS',()=>{
  for(const profile of ['auto','economy','balanced','high']){
    const grid=runtime.buildPlan({profile,view:'grid',selectedSlot:0,cellular:false},0);assert.equal(grid.length,4);assert.ok(grid.every(p=>p.active&&p.fps<=5));
    const single=runtime.buildPlan({profile,view:'single',selectedSlot:2,cellular:false},0);assert.equal(single.filter(p=>p.active).length,1);assert.equal(single[2].active,true);assert.ok(single[2].fps<=15);assert.equal(single[0].fps,0);
  }
});

test('mobile data saver forces economy profile',()=>{const plan=runtime.buildPlan({profile:'high',view:'grid',selectedSlot:0,cellular:true,saveData:true},0);assert.ok(plan.every(p=>p.fps<=2&&p.bitrate<=150000));});

test('adaptive overload degrades FPS before resolution and bitrate',()=>{
  const base=runtime.buildPlan({profile:'high',view:'grid',selectedSlot:0},0)[0],l1=runtime.buildPlan({profile:'high',view:'grid',selectedSlot:0},1)[0],l2=runtime.buildPlan({profile:'high',view:'grid',selectedSlot:0},2)[0];
  assert.ok(l1.fps<base.fps);assert.equal(l1.w,base.w);assert.ok(l2.w<l1.w);assert.ok(l2.bitrate<l1.bitrate);
});

test('fitSize preserves aspect ratio and never upscales source',()=>{const x=runtime.fitSize(1920,1080,640,360);assert.deepEqual(x,{width:640,height:360});const y=runtime.fitSize(320,180,640,360);assert.deepEqual(y,{width:320,height:180});});

test('large source frames are bounded before IPC while near-target frames scale in publisher',()=>{
  assert.equal(runtime.preparationMode(640,360,640,360),'publisher-scale');assert.equal(runtime.preparationMode(960,540,640,360),'publisher-scale');assert.equal(runtime.preparationMode(1920,1080,640,360),'native-resize');
});

test('runtime is view-only and uses subscription frames rather than desktop capture or encoded screenshots',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','mirror-runtime.js'),'utf8');assert.match(src,/beginFrameSubscription\(false/);assert.doesNotMatch(src,/capturePage/);assert.match(src,/toBitmap\(/);assert.doesNotMatch(src,/desktopCapturer|sendInputEvent|toPNG\(|toJPEG\(|mouse|keyboard/i);
});

test('publisher exposes four video tracks, frame ACKs and no audio/data channel',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','mirror-publisher.js'),'utf8');assert.match(src,/length:4/);assert.match(src,/captureStream\(0\)/);assert.match(src,/H264/);assert.match(src,/frame-ack/);assert.doesNotMatch(src,/createDataChannel|getUserMedia|audioTrack|addTrack\([^\n]*audio/i);
});

function captureFixture({width=640,height=360}={}){
  let now=10000,callback,subscriptions=0,stops=0,bitmaps=0,resizes=0;const sent=[];
  const manager=new runtime.MirrorManager({now:()=>now});manager.running=true;
  const makeImage=()=>({getSize:()=>({width,height}),isEmpty:()=>false,resize:({width:w,height:h})=>{resizes++;return {getSize:()=>({width:w,height:h}),isEmpty:()=>false,toBitmap:opts=>{assert.equal(opts.scaleFactor,1);bitmaps++;return Buffer.alloc(w*h*4);}};},toBitmap:opts=>{assert.equal(opts.scaleFactor,1);bitmaps++;return Buffer.alloc(width*height*4);}});
  const guest={isDestroyed:()=>false,beginFrameSubscription:(onlyDirty,cb)=>{assert.equal(onlyDirty,false);callback=cb;subscriptions++;},endFrameSubscription:()=>{stops++;},capturePage:()=>{throw Error('redundant capture forbidden');}};
  manager._publisherSend=msg=>{sent.push(msg);return true;};manager.registerGuest(0,guest);
  const demand={sessionId:'session-a',deviceId:'phone',profile:'balanced',view:'grid',selectedSlot:0,cellular:false,saveData:true};
  return {manager,sent,guest,demand,emit:(rect={width,height})=>callback(makeImage(),rect),advance:ms=>{now+=ms;},setNow:value=>{now=value;},now:()=>now,counts:()=>({subscriptions,stops,bitmaps,resizes})};
}
function connect(f){f.manager.demand={...f.demand};f.manager.connected=true;f.manager._invalidatePlans();f.manager._syncCapture();}
function ackLatest(f,{sessionId='session-a',ok=true,processingMs=2}={}){const frame=[...f.sent].reverse().find(x=>x.type==='frame');assert.ok(frame);f.manager._frameAck({type:'frame-ack',sessionId,slot:frame.slot,seq:frame.seq,ok,processingMs});return frame;}

test('idle has no capture; disconnect clears subscription and ignores stale callbacks',async()=>{
  const f=captureFixture();assert.deepEqual(f.counts(),{subscriptions:0,stops:0,bitmaps:0,resizes:0});connect(f);assert.equal(f.counts().bitmaps,0);f.emit();assert.equal(f.counts().bitmaps,1);assert.equal(f.sent.find(x=>x.type==='frame').seed,true);
  await f.manager._deactivate('no-viewer');f.emit();assert.deepEqual(f.counts(),{subscriptions:1,stops:1,bitmaps:1,resizes:0});assert.equal(f.manager.capture.size,0);
});

test('slow consumer has one in-flight frame and only the newest pending frame',async()=>{
  const f=captureFixture();connect(f);f.emit();const state=f.manager.capture.get(0);assert.ok(state.inFlight);for(let i=0;i<6;i++){f.advance(300);f.emit();}
  assert.ok(state.inFlight);assert.ok(state.pending);assert.equal(f.counts().bitmaps,1);assert.equal(state.superseded,5);assert.equal([...f.sent].filter(x=>x.type==='frame').length,1);
  ackLatest(f);await immediate();assert.equal(f.counts().bitmaps,2);assert.ok(state.inFlight);assert.equal(state.pending,null);f.manager._stopAllCapture();
});

test('lost ACK recovers by timeout and delayed or stale-session ACK cannot release a newer frame',async()=>{
  const f=captureFixture();connect(f);f.emit();let state=f.manager.capture.get(0),first=[...f.sent].reverse().find(x=>x.type==='frame');f.advance(300);f.emit();assert.ok(state.pending);
  f.manager._frameTimeout(0,state,first.seq);await immediate();const second=[...f.sent].reverse().find(x=>x.type==='frame');assert.notEqual(second.seq,first.seq);assert.equal(state.ackTimeouts,1);assert.ok(state.inFlight);
  f.manager._frameAck({sessionId:'old-session',slot:0,seq:second.seq,ok:true});assert.equal(state.inFlight.seq,second.seq);
  f.manager._frameAck({sessionId:'session-a',slot:0,seq:first.seq,ok:true});assert.equal(state.inFlight.seq,second.seq);
  f.manager._frameAck({sessionId:'session-a',slot:0,seq:second.seq,ok:true,processingMs:3});assert.equal(state.inFlight,null);assert.equal(state.acked,1);f.manager._stopAllCapture();
});

test('tiny dirty areas eventually reduce cadence while significant changes restore configured cadence',()=>{
  const f=captureFixture();connect(f);f.emit();ackLatest(f);f.advance(300);f.emit({width:1,height:1});ackLatest(f);f.advance(2100);f.emit({width:1,height:1});ackLatest(f);const before=f.counts().bitmaps;f.advance(300);f.emit({width:1,height:1});assert.equal(f.counts().bitmaps,before);f.emit({width:640,height:360});assert.equal(f.counts().bitmaps,before);f.advance(300);f.emit({width:640,height:360});assert.equal(f.counts().bitmaps,before+1);f.manager._stopAllCapture();
});

test('plan cache is reused per frame and invalidated only by demand or adaptive changes',()=>{
  const f=captureFixture();connect(f);const base=f.manager.planBuilds;for(let i=0;i<20;i++)f.manager._planFor(i%4);assert.equal(f.manager.planBuilds,base);
  f.manager._updateDemand({...f.manager.demand,view:'single',selectedSlot:2});assert.equal(f.manager.planBuilds,base+1);for(let i=0;i<20;i++)f.manager._planFor(i%4);assert.equal(f.manager.planBuilds,base+1);
  f.manager._setAdaptiveLevel(1);assert.equal(f.manager.planBuilds,base+2);const active=f.manager.plans.filter(p=>p.active);assert.equal(active.length,1);assert.equal(active[0].slot,2);f.manager._stopAllCapture();
});

test('rapid grid/single account switching never leaves captures on inactive slots',()=>{
  let now=1000;const m=new runtime.MirrorManager({now:()=>now});m.running=true;m._publisherSend=()=>true;for(let slot=0;slot<4;slot++)m.registerGuest(slot,{isDestroyed:()=>false,beginFrameSubscription:(_dirty,cb)=>{void cb;},endFrameSubscription(){}});m.demand={sessionId:'s',profile:'balanced',view:'grid',selectedSlot:0};m.connected=true;m._syncCapture();assert.equal(m.capture.size,4);
  for(const selectedSlot of [3,1,2,0]){m._updateDemand({...m.demand,view:'single',selectedSlot});assert.deepEqual([...m.capture.keys()],[selectedSlot]);now+=100;}
  m._updateDemand({...m.demand,view:'grid'});assert.equal(m.capture.size,4);m._stopAllCapture();
});

test('disconnect and reconnect during capture clear ACK timers and create a fresh capture state',()=>{
  const f=captureFixture();connect(f);f.emit();const old=f.manager.capture.get(0);assert.ok(old.ackTimer);const sender={};f.manager.publisher={webContents:sender,isDestroyed:()=>false};f.manager._onPublisher({sender},{type:'connection',state:'disconnected'});assert.equal(f.manager.capture.size,0);assert.equal(old.ackTimer,null);assert.equal(old.inFlight,null);assert.equal(f.counts().stops,1);
  f.manager.publisherReady=true;f.manager._onPublisher({sender},{type:'connection',state:'connected'});assert.equal(f.manager.capture.size,1);assert.notEqual(f.manager.capture.get(0),old);f.manager._stopAllCapture();
});

test('stopping capture drops pending references, timers and deferred drains',async()=>{
  const f=captureFixture();connect(f);f.emit();f.advance(300);f.emit();const state=f.manager.capture.get(0);assert.ok(state.inFlight&&state.pending&&state.ackTimer);f.manager._stopAllCapture();assert.equal(state.inFlight,null);assert.equal(state.pending,null);assert.equal(state.ackTimer,null);assert.equal(state.drainHandle,null);assert.equal(f.manager.capture.size,0);await immediate();assert.equal(f.manager.capture.size,0);
});

test('adaptive quality degrades on sustained pressure and recovers only after a longer stable window',()=>{
  let now=10000,cpu=30;const m=new runtime.MirrorManager({now:()=>now});m.running=true;m.demand={sessionId:'s',profile:'high',view:'grid',selectedSlot:0};m.connected=true;m._publisherSend=()=>true;m._systemMetrics=()=>({cpu,memoryMB:100,processes:4});m.cpuReference=20;m.cpuEma=20;m.lastAdaptiveChangeAt=0;
  const pressured={streams:[{qualityLimitationReason:'cpu'}]};m._processStats(pressured);now+=6000;m._processStats(pressured);assert.equal(m.adaptiveLevel,1);const changedAt=m.lastAdaptiveChangeAt;
  cpu=21;for(let i=0;i<5;i++){now+=3000;m._processStats({streams:[]});}assert.equal(m.adaptiveLevel,1);assert.ok(now-changedAt<18000);
  now+=3000;m._processStats({streams:[]});assert.equal(m.adaptiveLevel,0);assert.equal(m.stableSamples,0);
});

test('data saver remains economy while adaptive level changes',()=>{
  const m=new runtime.MirrorManager();m.demand={sessionId:'s',profile:'high',view:'grid',cellular:true,saveData:true};m._refreshPlans(true);assert.ok(m.plans.every(p=>p.bitrate<=150000));m._setAdaptiveLevel(2);assert.ok(m.plans.every(p=>p.bitrate<=150000));
});
