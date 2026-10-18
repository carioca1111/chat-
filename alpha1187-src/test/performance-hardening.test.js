'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
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
  const main=read('main.js'),start=main.indexOf('async function applyGuestPerformance'),end=main.indexOf('function queueGuestPerformance',start);assert.ok(start>=0&&end>start);const body=main.slice(start,end);assert.doesNotMatch(body,/\.setFrameRate\(/);assert.match(body,/setBackgroundThrottling/);assert.match(body,/insertCSS/);
});

test('view-only guarantees remain present',()=>{
  const runtime=read('mirror-runtime.js'),publisher=read('mirror-publisher.js');assert.doesNotMatch(runtime,/desktopCapturer|sendInputEvent|toPNG\(|toJPEG\(/);assert.doesNotMatch(publisher,/createDataChannel|getUserMedia|audioTrack/i);assert.match(publisher,/length:4/);
});
