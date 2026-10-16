'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){if(request==='electron')return {app:{getAppMetrics:()=>[]},BrowserWindow:function(){},ipcMain:{on(){},removeListener(){}},nativeImage:{createFromDataURL:()=>({toBitmap:()=>Buffer.from([255,0,0,255])})}};return originalLoad.call(this,request,parent,isMain)};
const runtime=require('../mirror-runtime');Module._load=originalLoad;

test('2x2 profiles never exceed 5 FPS and single never exceeds 15 FPS',()=>{
  for(const profile of ['auto','economy','balanced','high']){
    const grid=runtime.buildPlan({profile,view:'grid',selectedSlot:0,cellular:false},0);assert.equal(grid.length,4);assert.ok(grid.every(p=>p.active&&p.fps<=5));
    const single=runtime.buildPlan({profile,view:'single',selectedSlot:2,cellular:false},0);assert.equal(single.filter(p=>p.active).length,1);assert.equal(single[2].active,true);assert.ok(single[2].fps<=15);assert.equal(single[0].fps,0);
  }
});

test('mobile data saver forces economy profile',()=>{
  const plan=runtime.buildPlan({profile:'high',view:'grid',selectedSlot:0,cellular:true,saveData:true},0);assert.ok(plan.every(p=>p.fps<=2&&p.bitrate<=150000));
});

test('adaptive overload degrades FPS before resolution and bitrate',()=>{
  const base=runtime.buildPlan({profile:'high',view:'grid',selectedSlot:0},0)[0],l1=runtime.buildPlan({profile:'high',view:'grid',selectedSlot:0},1)[0],l2=runtime.buildPlan({profile:'high',view:'grid',selectedSlot:0},2)[0];
  assert.ok(l1.fps<base.fps);assert.equal(l1.w,base.w);assert.ok(l2.w<l1.w);assert.ok(l2.bitrate<l1.bitrate);
});

test('fitSize preserves aspect ratio and never upscales source',()=>{const x=runtime.fitSize(1920,1080,640,360);assert.deepEqual(x,{width:640,height:360});const y=runtime.fitSize(320,180,640,360);assert.deepEqual(y,{width:320,height:180});});

test('runtime is view-only and uses direct guest capture rather than desktop capture or encoded screenshots',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','mirror-runtime.js'),'utf8');assert.match(src,/beginFrameSubscription\(false/);assert.doesNotMatch(src,/capturePage/);assert.match(src,/toBitmap\(/);assert.doesNotMatch(src,/desktopCapturer|sendInputEvent|toPNG\(|toJPEG\(|mouse|keyboard/i);
});

test('publisher exposes four video tracks and no audio/data channel',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','mirror-publisher.js'),'utf8');assert.match(src,/length:4/);assert.match(src,/captureStream\(0\)/);assert.match(src,/H264/);assert.doesNotMatch(src,/createDataChannel|getUserMedia|audioTrack|addTrack\([^\n]*audio/i);
});

function captureFixture(){
  const manager=new runtime.MirrorManager(),sent=[];let callback,subscriptions=0,stops=0,bitmaps=0;
  const guest={isDestroyed:()=>false,beginFrameSubscription:(onlyDirty,cb)=>{assert.equal(onlyDirty,false);callback=cb;subscriptions++;},endFrameSubscription:()=>{stops++;},capturePage:()=>{throw Error('redundant capture forbidden');}};
  const image={getSize:()=>({width:640,height:360}),getScaleFactors:()=>[1],isEmpty:()=>false,toBitmap:opts=>{assert.equal(opts.scaleFactor,1);bitmaps++;return Buffer.alloc(640*360*4);}};
  manager._publisherSend=msg=>{sent.push(msg);return true;};manager.registerGuest(0,guest);
  return {manager,sent,image,emit:rect=>callback(image,rect),counts:()=>({subscriptions,stops,bitmaps})};
}
test('idle has no subscription; callback is the only capture and stale callbacks are ignored',async()=>{
  const f=captureFixture();assert.deepEqual(f.counts(),{subscriptions:0,stops:0,bitmaps:0});
  f.manager.demand={profile:'balanced',view:'grid'};f.manager.connected=true;f.manager._syncCapture();
  assert.equal(f.counts().bitmaps,0);f.emit({width:640,height:360});assert.equal(f.counts().bitmaps,1);
  assert.equal(f.sent.find(x=>x.type==='frame').seed,true);
  f.emit({width:640,height:360});assert.equal(f.counts().bitmaps,1);
  await f.manager._deactivate('no-viewer');f.emit({width:640,height:360});
  assert.deepEqual(f.counts(),{subscriptions:1,stops:1,bitmaps:1});assert.equal(f.manager.capture.size,0);
});
test('tiny dirty areas reduce emission to 1 FPS and significant changes recover immediately',t=>{
  const f=captureFixture(),old=Date.now;let now=10000;Date.now=()=>now;t.after(()=>{Date.now=old;});
  f.manager.demand={profile:'balanced',view:'grid'};f.manager.connected=true;f.manager._syncCapture();
  f.emit({width:640,height:360});now+=250;f.emit({width:1,height:1});
  now+=2000;f.emit({width:1,height:1});const before=f.counts().bitmaps;
  now+=250;f.emit({width:1,height:1});assert.equal(f.counts().bitmaps,before);
  f.emit({width:640,height:360});assert.equal(f.counts().bitmaps,before+1);
  f.manager._stopAllCapture();
});
test('temporary peer disconnect immediately unsubscribes all guests',()=>{
  const f=captureFixture();f.manager.demand={profile:'balanced'};f.manager.connected=true;f.manager._syncCapture();
  const sender={};f.manager.publisher={webContents:sender};
  f.manager._onPublisher({sender},{type:'connection',state:'disconnected'});
  assert.equal(f.manager.capture.size,0);assert.equal(f.counts().stops,1);
});
