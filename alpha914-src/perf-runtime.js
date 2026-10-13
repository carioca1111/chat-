'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GridiumPerf=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function stableString(value){
    const seen=new WeakSet();
    return JSON.stringify(value,(key,val)=>{
      if(typeof val==='object'&&val){
        if(seen.has(val))return '[Circular]';
        seen.add(val);
        if(!Array.isArray(val)){
          const out={};
          for(const k of Object.keys(val).sort())if(k!=='_loadedAt')out[k]=val[k];
          return out;
        }
      }
      return val;
    });
  }
  function signature(value){
    const text=stableString(value)||'';
    let hash=2166136261;
    for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return (hash>>>0).toString(16).padStart(8,'0')+':'+text.length;
  }
  function createCoalescedPublisher({build,send,delayMs=32,schedule=setTimeout,cancel=clearTimeout,now=Date.now}={}){
    if(typeof build!=='function'||typeof send!=='function')throw new TypeError('build/send obrigatórios');
    let timer=null,firstAt=0;
    const stats={requested:0,sent:0,coalesced:0,lastBuildMs:0,maxBuildMs:0,lastSentAt:0};
    const flush=()=>{
      if(timer!==null){cancel(timer);timer=null;}
      firstAt=0;
      const started=now(),payload=build(),elapsed=Math.max(0,now()-started);
      stats.lastBuildMs=elapsed;stats.maxBuildMs=Math.max(stats.maxBuildMs,elapsed);
      send(payload);stats.sent++;stats.lastSentAt=now();
      return payload;
    };
    const request=({immediate=false}={})=>{
      stats.requested++;
      if(immediate)return flush();
      if(timer!==null){stats.coalesced++;return false;}
      firstAt=now();
      timer=schedule(()=>{timer=null;flush();},Math.max(0,delayMs));
      return true;
    };
    return {request,flush,cancel(){if(timer!==null)cancel(timer);timer=null;firstAt=0;},stats(){return {...stats,pending:timer!==null,pendingMs:firstAt?Math.max(0,now()-firstAt):0};}};
  }
  return {signature,stableString,createCoalescedPublisher};
});
