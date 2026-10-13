'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const {performance}=require('perf_hooks');

const root=path.resolve(process.argv[2]||'gridium-build');
const label=process.argv[3]||'profile';
const mod=path.join(root,'alpha-engine.js');
delete require.cache[require.resolve(mod)];
const {AlphaEngine}=require(mod);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gridium-profile-'));
const dbFile=path.join(dir,'alpha.sqlite');
const engine=new AlphaEngine(dbFile);

if(engine.db){
  const stmt=engine.db.prepare('INSERT INTO alpha_trades(id,at,slot,strategy,mode,asset_type,asset_id,name,currency,qty,entry,exit,fees,pnl,hold_ms,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  engine.db.exec('BEGIN IMMEDIATE');
  try{
    for(let i=0;i<2000;i++)stmt.run(`bench-${i}`,Date.now()-i*1000,i%4,'balanced','real','item',`asset-${i%80}`,`Asset ${i%80}`,i%2?'gems':'coins',1,100+i%20,120+i%20,3,(i%5)-1,60000,'{}');
    engine.db.exec('COMMIT');
  }catch(error){engine.db.exec('ROLLBACK');throw error;}
}
const originalRows=engine._rows.bind(engine);
let fullReads=0;
engine._rows=table=>{fullReads++;return originalRows(table);};
engine.view();
fullReads=0;
const samples=[];
const iterations=5;
for(let i=0;i<iterations;i++){
  const start=performance.now();
  engine.view();
  samples.push(performance.now()-start);
}
samples.sort((a,b)=>a-b);
const median=samples[Math.floor(samples.length/2)];
const result={label,medianMs:Number(median.toFixed(3)),minMs:Number(samples[0].toFixed(3)),maxMs:Number(samples.at(-1).toFixed(3)),fullTableReadsPerView:Number((fullReads/iterations).toFixed(2)),trades:engine.db?2000:0};
console.log('GRIDIUM_PROFILE '+JSON.stringify(result));
engine.close();
fs.rmSync(dir,{recursive:true,force:true});
