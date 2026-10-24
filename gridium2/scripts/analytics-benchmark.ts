import { performance } from 'node:perf_hooks'
import { FarmGoldAnalyticsTracker } from '../src/main/farm-gold-analytics-runtime'
import { PanelAnalyticsTracker } from '../src/main/panel-analytics-runtime'
const now = Date.now(), H = 3600000
const history = (n: number, step: number) => Array.from({length:n}, (_,i) => ({at:Math.floor(now/step)*step-(n-i-1)*step,pokemonXp:1,captures:1,goldEarned:1,marketCoins:0,marketGems:0,rmtBrl:0}))
let materializations = 0, dirty = 0
const original = PanelAnalyticsTracker.prototype.persisted
PanelAnalyticsTracker.prototype.persisted = function(at) { materializations++; return original.call(this, at) }
const tracker = new FarmGoldAnalyticsTracker({ initial: {historyMinute:history(2880,60000),historyHour:history(2160,H),historyDay:history(730,24*H)}, onPersist:()=>{dirty++} })
tracker.ingestState({gold:0,pokemons:[{id:1,xp:0}]},true,now)
const measure = (fn:()=>unknown, n:number) => {const times:number[]=[];let bytes=0; for(let i=0;i<n;i++){const s=performance.now();const v=fn();times.push(performance.now()-s); if(i===0)bytes=Buffer.byteLength(JSON.stringify(v))} times.sort((a,b)=>a-b); return {meanMs:times.reduce((s,v)=>s+v,0)/n,p95Ms:times[Math.floor(n*.95)],bytes}}
global.gc?.(); const before=process.memoryUsage();const cpu=process.cpuUsage();const start=performance.now()
for(let i=1;i<=100000;i++) tracker.ingestState({gold:i,pkMud:[{id:1,xp:i}]},false,now+i)
const updatesMs=performance.now()-start
const snapshot=measure(()=>tracker.snapshot(now+100000),1000)
const persist=measure(()=>JSON.stringify(tracker.persisted(now+100000)),100)
global.gc?.();console.log(JSON.stringify({updates:100000,updatesMs,materializations,dirty,before,after:process.memoryUsage(),cpu:process.cpuUsage(cpu),snapshot,persist},null,2))
