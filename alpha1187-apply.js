'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
const must=(condition,message)=>{if(!condition)throw new Error('Alpha 11.8.7 Performance Hardening: '+message);};
const BASE_VERSION='3.0.0-alpha.11.8.6',NEXT_VERSION='3.0.0-alpha.11.8.7';
const pkg=JSON.parse(read('package.json'));must(pkg.version===BASE_VERSION,'exact Alpha 11.8.6 base expected, current '+pkg.version);
const htmlBefore=read('index.html'),partitions=htmlBefore.match(/partition="persist:pokeidle-account-[1-4]"/g)||[];
must(partitions.length===4,'four persistent account partitions expected before release bump');
const main=read('main.js'),runtime=read('mirror-runtime.js'),publisher=read('mirror-publisher.js');
must(main.includes('mirrorRuntime?.registerGuest(slot,wc)'),'mirror guest registration missing');
must(runtime.includes("msg.type==='frame-ack'"),'bounded mirror ACK handling missing');
must(runtime.includes('FRAME_ACK_TIMEOUT_MS'),'mirror ACK timeout recovery missing');
must(runtime.includes('planCacheKey'),'mirror plan cache missing');
must(publisher.includes("type:'frame-ack'"),'publisher frame ACK missing');
must(publisher.includes('pendingPlans'),'encoder plan coalescing missing');
fs.mkdirSync(path.join(root,'test'),{recursive:true});
fs.copyFileSync(path.join(__dirname,'alpha1187-src/test/performance-hardening.test.js'),path.join(root,'test/performance-hardening.test.js'));
let versionChecksUpdated=0;
for(const name of fs.readdirSync(path.join(root,'test'))){
  if(!name.endsWith('.test.js'))continue;const file=path.join(root,'test',name),source=fs.readFileSync(file,'utf8');if(!source.includes(BASE_VERSION))continue;
  versionChecksUpdated+=source.split(BASE_VERSION).length-1;fs.writeFileSync(file,source.split(BASE_VERSION).join(NEXT_VERSION));
}
pkg.version=NEXT_VERSION;pkg.description='Gridium Alpha 11.8.7 — Performance hardening do espelhamento e das contas';write('package.json',JSON.stringify(pkg,null,2)+'\n');
const htmlAfter=read('index.html'),partitionsAfter=htmlAfter.match(/partition="persist:pokeidle-account-[1-4]"/g)||[];
must(JSON.stringify(partitionsAfter)===JSON.stringify(partitions),'persistent account partitions changed during release layer');
console.log(`Alpha 11.8.7 performance hardening applied; ${versionChecksUpdated} inherited release marker(s) synchronized.`);
