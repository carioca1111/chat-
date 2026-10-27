/* Pure Hunt Control calculations shared by the APK UI and Node tests. */
(function(root){
'use strict';
const HOUR=60*60*1000;
const num=v=>Number.isFinite(Number(v))?Number(v):0;
function g2(row){return row&&row.gridium2||{}}
function session(row){return g2(row).hunt&&g2(row).hunt.session||{}}
function profile(row){return g2(row).hunt&&g2(row).hunt.profile||{}}
function huntSlug(row){return String(profile(row).huntSlug||session(row).huntSlug||'').trim()}
function normalizedRate(total,lastHour,startedAt,now=Date.now()){
  const elapsed=Math.max(1/60,(now-num(startedAt))/HOUR);
  return elapsed<1?num(total)/elapsed:num(lastHour);
}
function aggregate(rows,now=Date.now()){
  const potency=[0,0,0,0,0];
  let captures=0,capturesPerHour=0,kills=0,killsPerHour=0,shiniesSeen=0,shiniesCaught=0;
  let potionStock=0,potionsUsed=0,potionsPerHour=0,reviveStock=0,revivesUsed=0,revivesPerHour=0;
  let startedAt=now;
  rows.forEach(row=>{
    const s=session(row);captures+=num(s.capturesTotal);capturesPerHour+=normalizedRate(s.capturesTotal,s.capturesLastHour,s.sessionStartedAt,now);
    kills+=num(s.killsEstimatedTotal);killsPerHour+=normalizedRate(s.killsEstimatedTotal,s.killsEstimatedLastHour,s.sessionStartedAt,now);
    shiniesSeen+=num(s.shiniesSeen);shiniesCaught+=num(s.shiniesCaught);
    potionStock+=num(s.potionStock);potionsUsed+=num(s.potionsUsedTotal);potionsPerHour+=normalizedRate(s.potionsUsedTotal,s.potionsUsedLastHour,s.sessionStartedAt,now);
    reviveStock+=num(s.reviveStock);revivesUsed+=num(s.revivesUsedTotal);revivesPerHour+=normalizedRate(s.revivesUsedTotal,s.revivesUsedLastHour,s.sessionStartedAt,now);
    const p=Array.isArray(s.capturesByPotency)?s.capturesByPotency:[];for(let i=0;i<5;i++)potency[i]+=num(p[i]);
    if(num(s.sessionStartedAt)>0)startedAt=Math.min(startedAt,num(s.sessionStartedAt));
  });
  return {captures,capturesPerHour,kills,killsPerHour,shiniesSeen,shiniesCaught,potency,potionStock,potionsUsed,potionsPerHour,reviveStock,revivesUsed,revivesPerHour,sessionHours:Math.max(0,(now-startedAt)/HOUR),startedAt};
}
function sustain(a){
  const potionEta=a.potionStock<=0?0:a.potionsPerHour>0?a.potionStock/a.potionsPerHour:Infinity;
  const projected=Number.isFinite(potionEta)?Math.max(0,a.reviveStock-a.revivesPerHour*potionEta):a.reviveStock;
  const revivesAfter=Math.max(0,Math.round(projected));
  if(a.potionStock<=0&&revivesAfter<=0)return{potionEtaHours:0,centerEtaHours:0,minimumCenterEtaHours:0,revivesAfterPotions:0};
  if(!Number.isFinite(potionEta))return{potionEtaHours:potionEta,centerEtaHours:Infinity,minimumCenterEtaHours:Infinity,revivesAfterPotions:revivesAfter};
  if(projected<=0)return{potionEtaHours:potionEta,centerEtaHours:potionEta,minimumCenterEtaHours:potionEta,revivesAfterPotions:0};
  if(a.revivesPerHour>0)return{potionEtaHours:potionEta,centerEtaHours:potionEta+projected/a.revivesPerHour,minimumCenterEtaHours:potionEta,revivesAfterPotions:revivesAfter};
  return{potionEtaHours:potionEta,centerEtaHours:Infinity,minimumCenterEtaHours:potionEta,revivesAfterPotions:revivesAfter};
}
function groups(rows){
  const map=new Map();rows.forEach((row,i)=>{const key=huntSlug(row).toLowerCase().replace(/[\s-]+/g,'_');if(!key)return;const list=map.get(key)||[];list.push({row,index:i});map.set(key,list)});
  return[...map.entries()].filter(([,list])=>list.length>=2).map(([key,list])=>({key,rows:list.map(x=>x.row),indexes:list.map(x=>x.index)})).sort((a,b)=>b.rows.length-a.rows.length);
}
function health(a,p){
  const risk=Number.isFinite(p.centerEtaHours)?p.centerEtaHours:p.minimumCenterEtaHours;
  if(a.sessionHours>.25&&a.capturesPerHour<=0)return{label:'SEM CAPTURAS',state:'bad'};
  if(Number.isFinite(risk)&&risk<=.25)return{label:'CENTRO LOGO',state:'bad'};
  if(Number.isFinite(risk)&&risk<=.75)return{label:'ATENÇÃO',state:'warn'};
  return{label:'HUNT ESTÁVEL',state:'good'};
}
function goals(a,captureGoal,killGoal){
  captureGoal=Math.max(1,num(captureGoal)||1000);killGoal=Math.max(1,num(killGoal)||5000);
  const captureRemaining=Math.max(0,captureGoal-a.captures),killRemaining=Math.max(0,killGoal-a.kills);
  return{captureGoal,killGoal,captureRemaining,killRemaining,captureProgress:Math.min(100,a.captures/captureGoal*100),killProgress:Math.min(100,a.kills/killGoal*100),captureEtaHours:a.capturesPerHour>0?captureRemaining/a.capturesPerHour:Infinity,killEtaHours:a.killsPerHour>0?killRemaining/a.killsPerHour:Infinity};
}
const api={HOUR,num,session,profile,huntSlug,normalizedRate,aggregate,sustain,groups,health,goals};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HuntControl=api;
})(typeof window!=='undefined'?window:globalThis);
