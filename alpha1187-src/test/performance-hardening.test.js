'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('Alpha 11.8.7 release marker and persistent account partitions are intact',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.0.0-alpha.11.8.7');
  const html=read('index.html');for(let i=1;i<=4;i++)assert.ok(html.includes(`partition="persist:pokeidle-account-${i}"`));
});

test('assembled mirror uses bounded ACK backpressure and cached plans',()=>{
  const runtime=read('mirror-runtime.js'),publisher=read('mirror-publisher.js');
  assert.match(runtime,/FRAME_ACK_TIMEOUT_MS/);assert.match(runtime,/inFlight/);assert.match(runtime,/pending/);assert.match(runtime,/planCacheKey/);assert.match(runtime,/frame-ack/);assert.match(publisher,/frame-ack/);assert.match(publisher,/pendingPlans/);
});

test('normal account webviews avoid the offscreen-only setFrameRate optimization',()=>{
  const main=read('main.js'),start=main.indexOf('async function applyGuestPerformance'),end=main.indexOf('function queueGuestPerformance',start);assert.ok(start>=0&&end>start);const body=main.slice(start,end);assert.doesNotMatch(body,/\.setFrameRate\s*\(/);assert.match(body,/setBackgroundThrottling/);assert.match(body,/insertCSS/);
});

test('mobile-visible hidden accounts bypass visual reduction and background throttling',()=>{
  const main=read('main.js'),start=main.indexOf('async function applyGuestPerformance'),end=main.indexOf('function queueGuestPerformance',start);const body=main.slice(start,end);
  assert.match(body,/mirrorVisible=!!mirrorState\?\.connected/);assert.match(body,/reduceVisuals:mirrorVisible\?false/);assert.match(body,/backgroundThrottling:mirrorVisible\?false/);assert.match(main,/onDemandChange:\(\)=>scheduleGuestPerformance\(50\)/);
});

test('raw IPC budget keeps full 1080p bitmaps out while mid-size frames may scale in publisher',()=>{
  const originalLoad=Module._load;Module._load=function(request,parent,isMain){if(request==='electron')return {app:{getAppMetrics:()=>[]},BrowserWindow:function(){},ipcMain:{on(){},removeListener(){}},nativeImage:{createFromDataURL:()=>({toBitmap:()=>Buffer.from([255,0,0,255])})}};return originalLoad.call(this,request,parent,isMain)};
  let runtime;try{delete require.cache[require.resolve('../mirror-runtime')];runtime=require('../mirror-runtime');}finally{Module._load=originalLoad;}
  assert.equal(runtime.MAX_RAW_IPC_BYTES,4*1024*1024);assert.equal(runtime.preparationMode(960,540,640,360),'publisher-scale');assert.equal(runtime.preparationMode(1920,1080,1280,720),'native-resize');
});

test('mirror lifecycle notifies account performance policy on connect and view changes',()=>{
  const originalLoad=Module._load;Module._load=function(request,parent,isMain){if(request==='electron')return {app:{getAppMetrics:()=>[]},BrowserWindow:function(){},ipcMain:{on(){},removeListener(){}},nativeImage:{createFromDataURL:()=>({toBitmap:()=>Buffer.from([255,0,0,255])})}};return originalLoad.call(this,request,parent,isMain)};
  let runtime;try{delete require.cache[require.resolve('../mirror-runtime')];runtime=require('../mirror-runtime');}finally{Module._load=originalLoad;}
  let changes=0;const m=new runtime.MirrorManager({onDemandChange:()=>changes++});const sender={};m.publisher={webContents:sender,isDestroyed:()=>false};m.publisherReady=true;m.running=true;m.demand={sessionId:'s',deviceId:'phone',profile:'balanced',view:'grid',selectedSlot:0};m._publisherSend=()=>true;m._syncCapture=()=>{};
  m._onPublisher({sender},{type:'connection',state:'connected'});assert.equal(m.connected,true);assert.equal(changes,1);m._updateDemand({...m.demand,view:'single',selectedSlot:2});assert.equal(changes,2);
});

test('view-only guarantees remain present',()=>{
  const runtime=read('mirror-runtime.js'),publisher=read('mirror-publisher.js');assert.doesNotMatch(runtime,/desktopCapturer|sendInputEvent|toPNG\(|toJPEG\(/);assert.doesNotMatch(publisher,/createDataChannel|getUserMedia|audioTrack/i);assert.match(publisher,/length:4/);
});
