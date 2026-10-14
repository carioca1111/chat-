'use strict';
const crypto=require('node:crypto');

const COMMANDS=new Set(['sniper-kill','sniper-radar','set-eco-mode','set-performance-profile','reconnect-account']);
const PROFILES=new Set(['ultra','balanced','quality']);
const safe=(a,b)=>{a=Buffer.from(String(a??''));b=Buffer.from(String(b??''));return a.length===b.length&&crypto.timingSafeEqual(a,b);};
const text=(v,n=160)=>String(v??'').slice(0,n);
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const clone=x=>{try{return JSON.parse(JSON.stringify(x));}catch{return null;}};

function signDevice(payload,secret){
  const b=Buffer.from(JSON.stringify(payload)).toString('base64url'),head='pg1.'+b;
  return head+'.'+crypto.createHmac('sha256',String(secret)).update(head).digest('base64url');
}
function verifyDevice(token,secret,{revokedBefore=0,revokedIds=[]}={}){
  const p=String(token||'').split('.');if(p.length!==3||p[0]!=='pg1'||!secret)return null;
  const head=p[0]+'.'+p[1],sig=crypto.createHmac('sha256',String(secret)).update(head).digest('base64url');if(!safe(p[2],sig))return null;
  let x;try{x=JSON.parse(Buffer.from(p[1],'base64url').toString('utf8'));}catch{return null;}
  if(!x?.id||!Number.isFinite(Number(x.iat))||Number(x.iat)<=Number(revokedBefore||0)||(revokedIds||[]).includes(x.id))return null;
  return {id:text(x.id,120),name:text(x.name||'Celular',80),iat:Number(x.iat)};
}
function bearer(req){const h=String(req?.headers?.authorization||'');return h.startsWith('Bearer ')?h.slice(7).trim():'';}
function readIdentity(req,secret,revocations={}){
  const token=bearer(req);if(secret&&safe(token,secret))return {kind:'admin',id:'desktop',name:'Gridium Desktop'};
  const device=verifyDevice(token,secret,revocations);return device?{kind:'device',...device}:null;
}
function sanitizeCommand(raw={}){
  const type=text(raw.type,80);if(!COMMANDS.has(type))throw new Error('command-not-allowed');
  let payload={};
  if(type==='set-eco-mode')payload={enabled:raw.payload?.enabled===true};
  else if(type==='set-performance-profile'){
    const profile=text(raw.payload?.profile,20);if(!PROFILES.has(profile))throw new Error('invalid-profile');payload={profile};
  }else if(type==='reconnect-account'){
    const slot=Number(raw.payload?.slot);if(!Number.isInteger(slot)||slot<0||slot>3)throw new Error('invalid-slot');payload={slot};
  }
  return {type,payload};
}
function compactRecord(record){
  if(!record||typeof record!=='object')return null;
  return {nick:text(record.nick,80),values:clone(record.values)||{},ms:num(record.ms),since:num(record.since),updated:num(record.updated),live:clone(record.live)||null};
}
function compactRow(row={}){return {slot:num(row.slot),status:text(row.status,80),health:text(row.health,30),lastChange:num(row.lastChange),lastActivityAgo:num(row.lastActivityAgo),record:compactRecord(row.record)};}
function compactAlpha(alpha){
  if(!alpha||typeof alpha!=='object')return null;
  return {
    settings:alpha.settings?{executionMode:text(alpha.settings.executionMode,20),marketConcurrency:num(alpha.settings.marketConcurrency),killSwitch:alpha.settings.killSwitch!==false,goal:clone(alpha.settings.goal),dailyProfitTarget:alpha.settings.dailyProfitTarget??null}:null,
    accounts:clone(alpha.accounts)||null,
    rankings:clone(alpha.rankings)||null,
    positions:Array.isArray(alpha.positions)?clone(alpha.positions.slice(0,30)):[],
    recentTrades:Array.isArray(alpha.recentTrades)?clone(alpha.recentTrades.slice(0,30)):[],
    validation:clone(alpha.validation)||null,
    analytics:alpha.analytics?{professionalDashboard:clone(alpha.analytics.professionalDashboard),performance:clone(alpha.analytics.performance)}:null
  };
}
function compactHunt(hunt){
  if(!hunt||typeof hunt!=='object')return null;
  const out={};for(const k of ['at','revision','updatedAt','best','summary'])if(hunt[k]!==undefined)out[k]=clone(hunt[k]);
  if(Array.isArray(hunt.accounts))out.accounts=clone(hunt.accounts.slice(0,4));
  else if(Array.isArray(hunt.rows))out.rows=clone(hunt.rows.slice(0,4));
  return Object.keys(out).length?out:clone(hunt);
}
function compactMobile(mobile){
  if(!mobile||typeof mobile!=='object')return {};
  return {
    version:text(mobile.version,40),desktop:clone(mobile.desktop)||null,
    sniper:clone(mobile.sniper)||null,shiny:clone(mobile.shiny)||null,
    health:clone(mobile.health)||null,market:clone(mobile.market)||null
  };
}
function projectMobileSnapshot(raw){
  if(!raw||typeof raw!=='object'||!Number.isFinite(Number(raw.at)))return null;
  return {
    version:6,at:Number(raw.at),paused:raw.paused===true,
    total:clone(raw.total)||{},rows:Array.isArray(raw.rows)?raw.rows.slice(0,4).map(compactRow):[],
    forecasts:Array.isArray(raw.forecasts)?clone(raw.forecasts.slice(0,12)):[],events:Array.isArray(raw.events)?clone(raw.events.slice(0,40)):[],
    server:clone(raw.server)||null,
    gridium:{alpha:compactAlpha(raw.gridium?.alpha),hunt:compactHunt(raw.gridium?.hunt),mobile:compactMobile(raw.gridium?.mobile)}
  };
}
function commandPublic(x){if(!x)return null;return {id:x.id,type:x.type,payload:x.payload,state:x.state,createdAt:x.createdAt,deliveredAt:x.deliveredAt||0,ackedAt:x.ackedAt||0,result:x.result||null,device:x.device?{id:x.device.id,name:x.device.name}:null};}
module.exports={COMMANDS,PROFILES,safe,bearer,signDevice,verifyDevice,readIdentity,sanitizeCommand,projectMobileSnapshot,commandPublic};
