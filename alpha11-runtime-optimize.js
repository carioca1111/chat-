'use strict';
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(process.argv[2]||'gridium-build'),file=path.join(root,'sniper-runtime.js');let s=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
function patch(a,b){if(!s.includes(a))throw new Error('Runtime optimize anchor missing: '+a.slice(0,100));s=s.replace(a,b);}
patch("this.mode='OFF';this.killSwitch=true;this.policy=normalizePolicy({},{});","this.mode='OFF';this.killSwitch=true;this.policy=normalizePolicy({},{});this.lastTrimAt=0;");
patch("  _trim(ts=now()){\n    for(const [k,t] of this.seen)","  _trim(ts=now(),force=false){\n    if(!force&&ts-this.lastTrimAt<1000)return;this.lastTrimAt=ts;\n    for(const [k,t] of this.seen)");
patch("    this._trim();const d=this.metrics.decision,s=this.metrics.server", "    this._trim(now(),true);const d=this.metrics.decision,s=this.metrics.server");
fs.writeFileSync(file,s);console.log('Alpha 11 runtime maintenance moved off the per-event hot path.');
