'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const between=(src,a,b)=>{const start=src.indexOf(a),end=src.indexOf(b,start+a.length);assert.ok(start>=0,`missing ${a}`);assert.ok(end>start,`missing ${b}`);return src.slice(start,end);};

test('Alpha 11.8.5 package marker is applied',()=>{
  assert.equal(JSON.parse(read('package.json')).version,'3.0.0-alpha.11.8.5');
});

test('account focus IPC is deferred instead of reconfiguring four webviews inline',()=>{
  const src=read('main.js');
  const handler=between(src,"handler('grid:performance-view'","handler('grid:goals'");
  assert.match(handler,/scheduleGuestPerformance\(\)/);
  assert.doesNotMatch(handler,/for\(const \[slot,wc\] of guests\).*applyGuestPerformance/);
});

test('performance application is cached and CSS churn only happens when visual reduction changes',()=>{
  const src=read('main.js');
  assert.match(src,/performanceApplied=new Map\(\)/);
  assert.match(src,/performanceApplyQueues=Array\.from\(\{length:4\}/);
  const body=between(src,'async function applyGuestPerformance','function queueGuestPerformance');
  assert.match(body,/sameGuestPerformance/);
  assert.match(body,/prev\.reduceVisuals!==next\.reduceVisuals/);
  assert.match(body,/prev\.fps!==next\.fps/);
  assert.match(body,/prev\.zoom!==next\.zoom/);
});

test('2x2 grid keeps a stable guest plan while selected account changes',()=>{
  const src=read('main.js');
  const plan=between(src,'function performancePlan','function performanceCSS');
  assert.match(plan,/if\(layout==='grid'\)/);
  assert.match(plan,/profile==='ultra'[^\n]+fps:visible\?30:6/);
  assert.match(plan,/return \{fps:visible\?30:15,reduceVisuals:!visible,sampleMs:visible\?5000:10000/);
});

test('performance updates are coalesced away from the click event path',()=>{
  const src=read('main.js');
  const schedule=between(src,'function scheduleGuestPerformance','function applySettings');
  assert.match(schedule,/setTimeout/);
  assert.match(schedule,/120/);
  assert.match(schedule,/queueGuestPerformance/);
});
