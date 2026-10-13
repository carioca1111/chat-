'use strict';
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GridiumUltra=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
  const percentile=(values,p=.95)=>{
    const rows=(values||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!rows.length)return 0;
    const i=Math.max(0,Math.min(rows.length-1,Math.ceil(rows.length*clamp(p,0,1))-1));
    return rows[i];
  };
  function signature(value){
    let text='';try{text=JSON.stringify(value)||'';}catch{text=String(value??'');}
    let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return (hash>>>0).toString(16)+':'+text.length;
  }
  function createRenderLanes({raf,ric,timeout,cancelRaf,cancelTimeout}={}){
    const rAF=raf||((fn)=>root?.requestAnimationFrame?root.requestAnimationFrame(fn):setTimeout(()=>fn(Date.now()),16));
    const cancelAF=cancelRaf||((id)=>root?.cancelAnimationFrame?root.cancelAnimationFrame(id):clearTimeout(id));
    const idle=ric||((fn)=>root?.requestIdleCallback?root.requestIdleCallback(fn,{timeout:350}):setTimeout(()=>fn({didTimeout:true,timeRemaining:()=>0}),32));
    const delay=timeout||setTimeout,clear=cancelTimeout||clearTimeout;
    const fastJobs=new Map(),slowJobs=new Map();let fastToken=0,slowToken=0;
    const stats={fastQueued:0,fastFlushed:0,slowQueued:0,slowFlushed:0,coalescedFast:0,coalescedSlow:0};
    const flushFast=()=>{fastToken=0;const jobs=[...fastJobs.values()];fastJobs.clear();stats.fastFlushed+=jobs.length;for(const fn of jobs)try{fn();}catch(e){console.error(e);}};
    const flushSlow=(deadline)=>{slowToken=0;const jobs=[...slowJobs.values()];slowJobs.clear();stats.slowFlushed+=jobs.length;for(const fn of jobs)try{fn(deadline);}catch(e){console.error(e);}};
    return {
      fast(key,fn){if(typeof fn!=='function')return;if(fastJobs.has(key))stats.coalescedFast++;fastJobs.set(key,fn);stats.fastQueued++;if(!fastToken)fastToken=rAF(flushFast);},
      slow(key,fn){if(typeof fn!=='function')return;if(slowJobs.has(key))stats.coalescedSlow++;slowJobs.set(key,fn);stats.slowQueued++;if(!slowToken)slowToken=idle(flushSlow);},
      cancel(){if(fastToken)cancelAF(fastToken);if(slowToken)clear(slowToken);fastToken=slowToken=0;fastJobs.clear();slowJobs.clear();},
      flushFast,flushSlow,stats(){return {...stats,pendingFast:fastJobs.size,pendingSlow:slowJobs.size};}
    };
  }
  function patchKeyedRows(parent,items,{key,create,update,limit=220,signatureOf}={}){
    if(!parent||typeof key!=='function'||typeof create!=='function'||typeof update!=='function')return {created:0,updated:0,reused:0,removed:0,shown:0,total:0};
    const list=(Array.isArray(items)?items:[]).slice(0,Math.max(1,limit));
    const existing=new Map();for(const node of [...parent.children]){const k=node?.dataset?.gridiumKey;if(k)existing.set(k,node);}
    const keep=new Set();let created=0,updated=0,reused=0;const frag=parent.ownerDocument?.createDocumentFragment?.()||null;
    for(const item of list){const k=String(key(item));keep.add(k);let row=existing.get(k);if(!row){row=create(item);if(!row)continue;row.dataset.gridiumKey=k;created++;}else reused++;
      const sig=signatureOf?String(signatureOf(item)):signature(item),old=row.dataset.gridiumSig||'';
      if(sig!==old){update(row,item);row.dataset.gridiumSig=sig;updated++;}
      if(frag)frag.append(row);else parent.append(row);
    }
    let removed=0;for(const [k,row] of existing)if(!keep.has(k)){row.remove();removed++;}
    if(frag)parent.append(frag);
    return {created,updated,reused,removed,shown:list.length,total:Array.isArray(items)?items.length:0};
  }
  function createPerfTelemetry({win=root,now=()=>win?.performance?.now?.()??Date.now(),sampleMs=1000,maxSamples=240}={}){
    const fpsSamples=[],renderSamples=[],longSamples=[];let frames=0,lastSample=now(),fps=0,longCount=0,longMax=0,rafToken=0,observer=null;
    const trim=a=>{if(a.length>maxSamples)a.splice(0,a.length-maxSamples);};
    const frame=()=>{frames++;const t=now(),elapsed=t-lastSample;if(elapsed>=sampleMs){fps=frames*1000/Math.max(1,elapsed);fpsSamples.push(fps);trim(fpsSamples);frames=0;lastSample=t;}rafToken=win?.requestAnimationFrame?.(frame)||0;};
    if(win?.requestAnimationFrame)rafToken=win.requestAnimationFrame(frame);
    try{if(win?.PerformanceObserver){observer=new win.PerformanceObserver(list=>{for(const e of list.getEntries()){const d=Number(e.duration)||0;if(d>=50){longCount++;longMax=Math.max(longMax,d);longSamples.push(d);trim(longSamples);}}});observer.observe({entryTypes:['longtask']});}}catch{}
    return {
      markRender(ms){const n=Number(ms);if(Number.isFinite(n)){renderSamples.push(n);trim(renderSamples);}},
      snapshot(){return {fps:Math.round(fps*10)/10,fpsP50:Math.round(percentile(fpsSamples,.5)*10)/10,renderP50:Math.round(percentile(renderSamples,.5)*100)/100,renderP95:Math.round(percentile(renderSamples,.95)*100)/100,longTasks:longCount,longTaskP95:Math.round(percentile(longSamples,.95)*100)/100,longTaskMax:Math.round(longMax*100)/100,samples:renderSamples.length};},
      stop(){try{observer?.disconnect();}catch{}if(rafToken&&win?.cancelAnimationFrame)win.cancelAnimationFrame(rafToken);}
    };
  }
  return {percentile,signature,createRenderLanes,patchKeyedRows,createPerfTelemetry};
});
