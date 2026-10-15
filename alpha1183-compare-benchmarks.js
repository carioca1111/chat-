'use strict';
const fs=require('node:fs'),path=require('node:path');
const before=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8')),after=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]),'utf8')),out=path.resolve(process.argv[4]||'alpha1183-hunt-comparison.json');
const ratio=(a,b)=>a?b/a:null,pct=(a,b)=>a?((b-a)/a)*100:null;
const sections=['ingestion','view','accountSnapshot'],comparison={};let fail=false;
for(const name of sections){const a=before[name],b=after[name];const opsRatio=ratio(a.opsPerSecond,b.opsPerSecond),p95Ratio=ratio(a.p95Ms,b.p95Ms);comparison[name]={before:a,after:b,opsRatio,p95Ratio,opsChangePct:pct(a.opsPerSecond,b.opsPerSecond),p95ChangePct:pct(a.p95Ms,b.p95Ms)};if(opsRatio!==null&&p95Ratio!==null&&opsRatio<0.95&&p95Ratio>1.05)fail=true;}
const rb=before.renderer||{},ra=after.renderer||{};comparison.renderer={before:rb,after:ra,wakeupsPerPaintBefore:rb.wakeupsPerPaint??null,wakeupsPerPaintAfter:ra.wakeupsPerPaint??null};if(Number.isFinite(Number(rb.wakeupsPerPaint))&&Number.isFinite(Number(ra.wakeupsPerPaint))&&Number(ra.wakeupsPerPaint)>Number(rb.wakeupsPerPaint)*1.05)fail=true;
const result={beforeLabel:before.label,afterLabel:after.label,sections:comparison,pass:!fail,policy:'Fail only when throughput and p95 both regress >5% for a measured Hunt section, or renderer wakeups/paint regress >5%. No threshold is relaxed to hide a Sniper regression.'};fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(fail)process.exit(1);
