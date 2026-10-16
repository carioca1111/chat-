'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {MirrorRelay}=require('../mirror-relay');

function harness(){
  let now=1000;
  const json=(res,status,data)=>{res.status=status;res.data=data;return data};
  const body=async req=>JSON.stringify(req.payload||{});
  const relay=new MirrorRelay({isAdmin:req=>req.admin===true,getDevice:req=>req.device||null,json,body,now:()=>now,longPollMs:2});
  const call=async(path,method='GET',req={})=>{const res={};await relay.handle({...req,method},res,new URL(path,'http://x'));return res;};
  return {relay,call,tick:ms=>{now+=ms}};
}

test('mobile mirror session is ephemeral, authenticated and visible to desktop',async()=>{
  const h=harness(),device={id:'phone-1',name:'Android'};
  let r=await h.call('/api/v1/mirror/mobile/state','POST',{device,payload:{active:true,suspended:false,profile:'balanced',selectedSlot:2,cellular:false}});
  assert.equal(r.status,200);assert.ok(r.data.sessionId);assert.equal(r.data.demand.deviceId,'phone-1');assert.equal(r.data.demand.selectedSlot,2);
  const sessionId=r.data.sessionId;
  r=await h.call('/api/v1/mirror/desktop/poll','GET',{admin:true});
  assert.equal(r.status,200);assert.equal(r.data.demand.sessionId,sessionId);assert.equal(r.data.event.kind,'state');
});

test('relay rejects unauthorized and stale signaling',async()=>{
  const h=harness(),device={id:'phone-2',name:'Android'};
  let r=await h.call('/api/v1/mirror/mobile/state','POST',{payload:{active:true}});assert.equal(r.status,401);
  r=await h.call('/api/v1/mirror/desktop/poll','GET',{});assert.equal(r.status,401);
  r=await h.call('/api/v1/mirror/mobile/state','POST',{device,payload:{active:true}});const sessionId=r.data.sessionId;
  r=await h.call('/api/v1/mirror/mobile/signal','POST',{device,payload:{sessionId:'wrong',type:'answer',payload:{}}});assert.equal(r.status,409);
  r=await h.call('/api/v1/mirror/mobile/signal','POST',{device,payload:{sessionId,type:'mouse',payload:{x:1}}});assert.equal(r.status,400);
});

test('only whitelisted WebRTC signaling crosses the relay',async()=>{
  const h=harness(),device={id:'phone-3',name:'Android'};
  let r=await h.call('/api/v1/mirror/mobile/state','POST',{device,payload:{active:true}});const sessionId=r.data.sessionId;
  await h.call('/api/v1/mirror/desktop/poll','GET',{admin:true});
  r=await h.call('/api/v1/mirror/mobile/signal','POST',{device,payload:{sessionId,type:'answer',payload:{type:'answer',sdp:'x'}}});assert.equal(r.status,200);
  r=await h.call('/api/v1/mirror/desktop/poll','GET',{admin:true});assert.equal(r.data.event.type,'answer');
  r=await h.call('/api/v1/mirror/desktop/signal','POST',{admin:true,payload:{deviceId:device.id,sessionId,type:'offer',payload:{type:'offer',sdp:'y'}}});assert.equal(r.status,200);
  r=await h.call('/api/v1/mirror/mobile/poll?sessionId='+encodeURIComponent(sessionId),'GET',{device});assert.equal(r.status,200);assert.equal(r.data.event.type,'offer');
});

test('inactive and expired mobile demand disables capture demand',async()=>{
  const h=harness(),device={id:'phone-4',name:'Android'};
  let r=await h.call('/api/v1/mirror/mobile/state','POST',{device,payload:{active:true}});const sessionId=r.data.sessionId;
  await h.call('/api/v1/mirror/desktop/poll','GET',{admin:true});
  r=await h.call('/api/v1/mirror/mobile/state','POST',{device,payload:{active:false,sessionId}});assert.equal(r.data.demand,null);
  r=await h.call('/api/v1/mirror/mobile/state','POST',{device,payload:{active:true}});assert.ok(r.data.demand);
  h.tick(46000);
  r=await h.call('/api/v1/mirror/status','GET',{admin:true});assert.equal(r.data.demand,null);
});

test('renewed session discards old offers and ICE, suspended sessions reject signals',async()=>{
  const h=harness(),device={id:'renew',name:'Android'};
  let r=await h.call('/api/v1/mirror/mobile/state','POST',{device,payload:{active:true}});const old=r.data.sessionId;
  await h.call('/api/v1/mirror/desktop/signal','POST',{admin:true,payload:{deviceId:device.id,sessionId:old,type:'offer',payload:{sdp:'old'}}});
  r=await h.call('/api/v1/mirror/mobile/state','POST',{device,payload:{active:true}});const fresh=r.data.sessionId;assert.notEqual(fresh,old);
  r=await h.call('/api/v1/mirror/mobile/poll?sessionId='+fresh,'GET',{device});assert.equal(r.data.event,null);
  await h.call('/api/v1/mirror/mobile/state','POST',{device,payload:{active:true,suspended:true,sessionId:fresh}});
  r=await h.call('/api/v1/mirror/mobile/signal','POST',{device,payload:{sessionId:fresh,type:'ice',payload:{}}});assert.equal(r.status,409);
  r=await h.call('/api/v1/mirror/desktop/signal','POST',{admin:true,payload:{deviceId:device.id,sessionId:fresh,type:'offer',payload:{}}});assert.equal(r.status,409);
});
