'use strict';
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(process.argv[2]||'gridium-build'),file=path.join(root,'sniper-runtime.js');let s=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
if(!s.includes('this.lastTrimAt=0;'))s=s.replace("this.mode='OFF';this.killSwitch=true;this.policy=normalizePolicy({},{});","this.mode='OFF';this.killSwitch=true;this.policy=normalizePolicy({},{});this.lastTrimAt=0;");
if(s.includes('  _trim(ts=now()){\n    for(const [k,t] of this.seen)'))s=s.replace('  _trim(ts=now()){\n    for(const [k,t] of this.seen)','  _trim(ts=now(),force=false){\n    if(!force&&ts-this.lastTrimAt<1000)return;this.lastTrimAt=ts;\n    for(const [k,t] of this.seen)');
if(s.includes('    this._trim();const d=this.metrics.decision,s=this.metrics.server'))s=s.replace('    this._trim();const d=this.metrics.decision,s=this.metrics.server','    this._trim(now(),true);const d=this.metrics.decision,s=this.metrics.server');
const busy="if(this.busySlots.has(Number(l.slot))){row.state='FAILED';row.reason='slot-busy';row.updatedAt=now();this.metrics.failed++;return;}this.busySlots.add(Number(l.slot));";
while(s.includes(busy+busy))s=s.replace(busy+busy,busy);
fs.writeFileSync(file,s);console.log('Alpha 11 runtime hot path normalized.');
