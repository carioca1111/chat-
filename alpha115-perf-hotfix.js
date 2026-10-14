'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const file=path.join(root,'sniper-runtime.js');
let src=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const before=`SniperRuntime.prototype._trim=function(ts=now(),force=false){
  // preserve 11.4 cleanup, but temporarily protect in-flight/unknown rows from queue eviction
  const protectedRows=[];for(const [k,row] of this.watch)if(['SENT','UNKNOWN'].includes(row?.state)){protectedRows.push([k,row]);this.watch.delete(k);}
  try{grid115OriginalTrim.call(this,ts,force);}finally{for(const [k,row] of protectedRows)this.watch.set(k,row);}
  for(const [k,v] of this.seenSig115||[])if(ts-Number(v?.at||0)>30*60*1000)this.seenSig115.delete(k);
  for(const [k,r] of this.reservations115||[])if(ts-Number(r?.at||0)>60*60*1000)this.reservations115.delete(k);
  for(const [k,timer] of this.timers){if(!this.watch.has(k)){clearTimeout(timer);this.timers.delete(k);}}
};`;
const after=`SniperRuntime.prototype._trim=function(ts=now(),force=false){
  // GRID115_PERF_GUARD: auxiliary cleanup stays on the original 1s maintenance cadence.
  const shouldTrim=force||ts-Number(this.lastTrimAt||0)>=1000;
  if(!shouldTrim)return;
  // Preserve 11.4 cleanup, but temporarily protect in-flight/unknown rows from queue eviction.
  const protectedRows=[];
  for(const [k,row] of this.watch)if(['SENT','UNKNOWN'].includes(row?.state)){protectedRows.push([k,row]);this.watch.delete(k);}
  try{grid115OriginalTrim.call(this,ts,true);}finally{for(const [k,row] of protectedRows)this.watch.set(k,row);}
  for(const [k,v] of this.seenSig115||[])if(ts-Number(v?.at||0)>30*60*1000)this.seenSig115.delete(k);
  for(const [k,r] of this.reservations115||[])if(ts-Number(r?.at||0)>60*60*1000)this.reservations115.delete(k);
  for(const [k,timer] of this.timers){if(!this.watch.has(k)){clearTimeout(timer);this.timers.delete(k);}}
};`;
if(src.includes('GRID115_PERF_GUARD')){console.log('Alpha 11.5 perf guard already applied.');process.exit(0);}
if(!src.includes(before))throw new Error('Alpha 11.5 perf hotfix anchor not found');
src=src.replace(before,after);
fs.writeFileSync(file,src,'utf8');
console.log('Alpha 11.5 perf guard applied: maintenance scans remain outside the per-listing hot path.');
