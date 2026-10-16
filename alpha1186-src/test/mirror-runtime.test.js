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
  const src=fs.readFileSync(path.join(__dirname,'..','mirror-runtime.js'),'utf8');assert.match(src,/beginFrameSubscription\(true/);assert.match(src,/capturePage\(\)/);assert.match(src,/toBitmap\(\)/);assert.doesNotMatch(src,/desktopCapturer|sendInputEvent|toPNG\(|toJPEG\(|mouse|keyboard/i);
});

test('publisher exposes four video tracks and no audio/data channel',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','mirror-publisher.js'),'utf8');assert.match(src,/length:4/);assert.match(src,/captureStream\(0\)/);assert.match(src,/H264/);assert.doesNotMatch(src,/createDataChannel|getUserMedia|audioTrack|addTrack\([^\n]*audio/i);
});
