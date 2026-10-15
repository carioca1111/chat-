'use strict';
const fs=require('node:fs'),path=require('node:path');
const before=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8')),after=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]),'utf8')),out=path.resolve(process.argv[4]||'alpha1183-sniper-comparison.json');
const b=before.localDetectionToDispatch||{},a=after.localDetectionToDispatch||{};
const ratio=(x,y)=>Number(x)>0?Number(y)/Number(x):null;
const p50Ratio=ratio(b.p50Ms,a.p50Ms),p95Ratio=ratio(b.p95Ms,a.p95Ms),p99Ratio=ratio(b.p99Ms,a.p99Ms),throughputRatio=ratio(b.attemptsPerSecond,a.attemptsPerSecond),medianRatio=ratio(b.medianTotalMs,a.medianTotalMs);
const significantLatencyRegression=p95Ratio!==null&&medianRatio!==null&&p95Ratio>1.15&&medianRatio>1.15,significantThroughputRegression=throughputRatio!==null&&throughputRatio<0.85,pass=!significantLatencyRegression&&!significantThroughputRegression;
const result={before:{label:before.label,localDetectionToDispatch:b},after:{label:after.label,localDetectionToDispatch:a},ratios:{p50Ratio,p95Ratio,p99Ratio,medianRatio,throughputRatio},pass,policy:'Fail if both median and p95 local detection-to-dispatch regress >15%, or attempts/s falls below 85%. Synthetic local benchmark only; Internet/server latency excluded.'};fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(!pass)process.exit(1);
