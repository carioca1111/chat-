'use strict';
const crypto=require('crypto');

const SIGNAL_TYPES=new Set(['offer','answer','ice','bye','ready','error','metrics']);
const PROFILES=new Set(['auto','economy','balanced','high']);
const ACTIVE_TTL_MS=45000;
const LONG_POLL_MS=20000;
const MAX_QUEUE=64;

function safeIceServers(){
  const raw=String(process.env.POKEGRID_ICE_SERVERS||'').trim();
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      if(Array.isArray(parsed))return parsed.slice(0,4).map(x=>({
        urls:Array.isArray(x?.urls)?x.urls.slice(0,4).map(String):String(x?.urls||''),
        ...(x?.username?{username:String(x.username).slice(0,256)}:{}),
        ...(x?.credential?{credential:String(x.credential).slice(0,512)}:{})
      })).filter(x=>Array.isArray(x.urls)?x.urls.length:!!x.urls);
    }catch{}
  }
  return [{urls:['stun:stun.cloudflare.com:3478']}];
}

class MirrorRelay{
  constructor({isAdmin,getDevice,json,body,now=()=>Date.now(),longPollMs=LONG_POLL_MS}={}){
    this.isAdmin=isAdmin;this.getDevice=getDevice;this.json=json;this.body=body;this.now=now;this.longPollMs=longPollMs;
    this.clients=new Map();this.desktopQueue=[];this.desktopWaiters=new Set();this.iceServers=safeIceServers();
  }
  _push(queue,item){queue.push(item);if(queue.length>MAX_QUEUE)queue.splice(0,queue.length-MAX_QUEUE);}
  _wake(set){for(const fn of set){try{fn();}catch{}}set.clear();}
  _sweep(){const now=this.now();for(const [id,c] of this.clients){if(now-c.lastSeen>ACTIVE_TTL_MS){if(c.active)this._push(this.desktopQueue,{kind:'state',deviceId:id,sessionId:c.sessionId,active:false,suspended:true,at:now});c.active=false;c.suspended=true;c.mobileQueue.length=0;if(now-c.lastSeen>ACTIVE_TTL_MS*8)this.clients.delete(id);}}}
  _demand(){this._sweep();const active=[...this.clients.values()].filter(c=>c.active&&!c.suspended&&this.now()-c.lastSeen<=ACTIVE_TTL_MS).sort((a,b)=>b.lastSeen-a.lastSeen)[0];return active?{deviceId:active.deviceId,deviceName:active.deviceName,sessionId:active.sessionId,profile:active.profile,view:active.view,selectedSlot:active.selectedSlot,cellular:active.cellular,saveData:active.saveData,lastSeen:active.lastSeen}:null;}
  async _read(req,limit=131072){return JSON.parse(await this.body(req,limit)||'{}');}
  _device(req){try{return this.getDevice?.(req)||null}catch{return null}}
  async _wait(set,check){const first=check();if(first)return first;await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);set.delete(finish);resolve();};const timer=setTimeout(finish,this.longPollMs);set.add(finish);});return check()||null;}
  async handle(req,res,u){
    if(!u.pathname.startsWith('/api/v1/mirror/'))return false;const json=this.json;
    if(u.pathname==='/api/v1/mirror/mobile/state'&&req.method==='POST'){
      const device=this._device(req);if(!device)return json(res,401,{error:'unauthorized'}),true;
      try{const x=await this._read(req,32768),now=this.now(),id=String(device.id),previous=this.clients.get(id),active=x.active===true,suspended=x.suspended===true;const sessionId=active&&(previous?.sessionId&&String(x.sessionId||'')===previous.sessionId)?previous.sessionId:(active?crypto.randomUUID():'');const c=previous||{deviceId:id,deviceName:String(device.name||'Mobile').slice(0,60),mobileQueue:[]};Object.assign(c,{sessionId,active,suspended,profile:PROFILES.has(String(x.profile))?String(x.profile):'auto',view:x.view==='single'?'single':'grid',selectedSlot:Math.max(0,Math.min(3,Number(x.selectedSlot)||0)),cellular:x.cellular===true,saveData:x.saveData!==false,lastSeen:now});if(!active)c.mobileQueue.length=0;this.clients.set(id,c);this._push(this.desktopQueue,{kind:'state',deviceId:id,sessionId,active,suspended,profile:c.profile,view:c.view,selectedSlot:c.selectedSlot,cellular:c.cellular,saveData:c.saveData,at:now});this._wake(this.desktopWaiters);return json(res,200,{ok:true,sessionId,expiresInMs:ACTIVE_TTL_MS,iceServers:this.iceServers,demand:this._demand()}),true;}catch{return json(res,400,{error:'bad-request'}),true;}
    }
    if(u.pathname==='/api/v1/mirror/mobile/signal'&&req.method==='POST'){
      const device=this._device(req);if(!device)return json(res,401,{error:'unauthorized'}),true;
      try{const x=await this._read(req),c=this.clients.get(String(device.id));if(!c||!c.active||String(x.sessionId||'')!==c.sessionId)return json(res,409,{error:'stale-session'}),true;if(!SIGNAL_TYPES.has(String(x.type))||String(x.type)==='metrics')return json(res,400,{error:'invalid-signal'}),true;c.lastSeen=this.now();this._push(this.desktopQueue,{kind:'signal',deviceId:c.deviceId,sessionId:c.sessionId,type:String(x.type),payload:x.payload??null,at:c.lastSeen});this._wake(this.desktopWaiters);return json(res,200,{ok:true}),true;}catch{return json(res,400,{error:'bad-request'}),true;}
    }
    if(u.pathname==='/api/v1/mirror/mobile/poll'&&req.method==='GET'){
      const device=this._device(req);if(!device)return json(res,401,{error:'unauthorized'}),true;const c=this.clients.get(String(device.id)),sessionId=String(u.searchParams.get('sessionId')||'');if(!c||!c.active||!sessionId||sessionId!==c.sessionId)return json(res,409,{error:'stale-session'}),true;c.lastSeen=this.now();const event=await this._wait(c.waiters||(c.waiters=new Set()),()=>c.mobileQueue.shift());return json(res,200,{event:event||null,sessionId:c.sessionId,expiresInMs:ACTIVE_TTL_MS}),true;
    }
    if(u.pathname==='/api/v1/mirror/desktop/poll'&&req.method==='GET'){
      if(!this.isAdmin?.(req))return json(res,401,{error:'unauthorized'}),true;const event=await this._wait(this.desktopWaiters,()=>this.desktopQueue.shift());return json(res,200,{event:event||null,demand:this._demand(),iceServers:this.iceServers}),true;
    }
    if(u.pathname==='/api/v1/mirror/desktop/signal'&&req.method==='POST'){
      if(!this.isAdmin?.(req))return json(res,401,{error:'unauthorized'}),true;
      try{const x=await this._read(req),id=String(x.deviceId||''),c=this.clients.get(id);if(!c||!c.active||String(x.sessionId||'')!==c.sessionId)return json(res,409,{error:'stale-session'}),true;if(!SIGNAL_TYPES.has(String(x.type)))return json(res,400,{error:'invalid-signal'}),true;const item={type:String(x.type),payload:x.payload??null,sessionId:c.sessionId,at:this.now()};this._push(c.mobileQueue,item);this._wake(c.waiters||(c.waiters=new Set()));return json(res,200,{ok:true}),true;}catch{return json(res,400,{error:'bad-request'}),true;}
    }
    if(u.pathname==='/api/v1/mirror/status'&&req.method==='GET'){
      if(!this.isAdmin?.(req))return json(res,401,{error:'unauthorized'}),true;return json(res,200,{demand:this._demand(),clients:[...this.clients.values()].filter(c=>c.active).map(c=>({deviceId:c.deviceId,sessionId:c.sessionId,suspended:c.suspended,lastSeen:c.lastSeen,profile:c.profile,view:c.view,selectedSlot:c.selectedSlot,cellular:c.cellular,saveData:c.saveData}))}),true;
    }
    return json(res,404,{error:'not-found'}),true;
  }
}
module.exports={MirrorRelay,ACTIVE_TTL_MS,SIGNAL_TYPES,PROFILES,safeIceServers};
