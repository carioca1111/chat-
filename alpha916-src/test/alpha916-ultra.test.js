'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRenderLanes,percentile}=require('../ultra-runtime');

test('Fast/Slow Render Lanes agrupam atualizações pela chave',()=>{
 let rafFn=null,idleFn=null,fast=0,slow=0;
 const lanes=createRenderLanes({raf:fn=>{rafFn=fn;return 1;},ric:fn=>{idleFn=fn;return 2;},cancelRaf:()=>{},cancelTimeout:()=>{}});
 lanes.fast('k',()=>fast++);lanes.fast('k',()=>fast+=10);lanes.slow('s',()=>slow++);lanes.slow('s',()=>slow+=10);
 assert.equal(lanes.stats().coalescedFast,1);assert.equal(lanes.stats().coalescedSlow,1);rafFn();idleFn({didTimeout:false,timeRemaining:()=>20});assert.equal(fast,10);assert.equal(slow,10);
});

test('percentil de telemetria é determinístico',()=>{assert.equal(percentile([5,10,20,100],.95),100);assert.equal(percentile([5,10,20,100],.5),10);});

test('renderer usa DOM incremental em Comprei e dashboard pré-calculado pelo Alpha Core',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8');
 assert.match(src,/function renderProfessionalPositions\(/);assert.match(src,/patchKeyedRows/);assert.match(src,/state\.professionalDashboard\?\.\[alphaCurrency\]/);assert.doesNotMatch(src,/window\.GridiumProfessional\.dashboardModel\(state,alphaCurrency\)/);assert.match(src,/alpha916Lanes\.slow\('alpha-heavy'/);
});

test('Alpha Core possui comando dashboard e main usa cache assíncrono',()=>{
 const core=fs.readFileSync(path.join(__dirname,'..','alpha-core-process.js'),'utf8'),main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 assert.match(core,/ProfessionalDashboard/);assert.match(core,/t==='dashboard'/);assert.match(main,/scheduleProfessionalCore/);assert.match(main,/alphaCoreRequest\('dashboard'/);assert.match(main,/decorateAlphaView/);
});

test('Ultra GPU mantém otimizações visuais sem suspender WebSocket ou proteções',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8'),main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 assert.match(css,/GRID_ALPHA916_ULTRA_PERFORMANCE/);assert.match(css,/content-visibility:auto/);assert.match(css,/contain:layout paint style/);assert.match(css,/gridium-ultra/);assert.match(main,/sniperRuntime/);assert.match(main,/alphaCoreProcess/);assert.match(main,/isOwnAccountListing/);
});

test('telemetria mede FPS, render e long tasks e atravessa IPC',()=>{
 const u=fs.readFileSync(path.join(__dirname,'..','ultra-runtime.js'),'utf8'),p=fs.readFileSync(path.join(__dirname,'..','preload.js'),'utf8'),m=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 assert.match(u,/PerformanceObserver/);assert.match(u,/longtask/);assert.match(u,/requestAnimationFrame/);assert.match(p,/grid:perf-telemetry/);assert.match(m,/rendererPerfTelemetry/);
});

test('analytics remoto reutiliza o relay existente e envia somente o modelo Alpha já sanitizado',()=>{
 const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 assert.match(main,/function alpha916RemoteAnalytics/);assert.match(main,/performance:\{renderer:rendererPerfTelemetry/);assert.match(main,/gridium:\{alpha:alphaRemote/);
 assert.doesNotMatch(main,/analytics-client/);assert.doesNotMatch(main,/DATABASE_URL/);
});
