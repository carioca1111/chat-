'use strict';

const SENSITIVE_KEY=/pass|password|token|secret|auth|authorization|cookie|session|csrf|email|credential|bearer/i;
const INTERESTING_KEY=/market|listing|offer|trade|auction|buy|sell|order|price|currency|gem|coin|gold|pokemon|item|asset/i;

function redactUrl(raw=''){
  try{
    const u=new URL(String(raw));
    for(const [k] of u.searchParams){if(SENSITIVE_KEY.test(k))u.searchParams.set(k,'[redacted]');}
    return u.toString();
  }catch{return String(raw||'').slice(0,1200);}
}
function redactValue(value,key=''){
  if(SENSITIVE_KEY.test(String(key)))return '[redacted]';
  if(Array.isArray(value))return value.slice(0,40).map(v=>redactValue(v,key));
  if(value&&typeof value==='object'){
    const out={};for(const [k,v] of Object.entries(value).slice(0,80))out[k]=redactValue(v,k);return out;
  }
  if(typeof value==='string')return value.length>500?value.slice(0,500)+'…':value;
  return value;
}
function summarizePostData(postData=''){
  const text=String(postData||'').trim();if(!text)return null;
  try{return redactValue(JSON.parse(text));}catch{}
  try{
    const p=new URLSearchParams(text),out={};let found=false;
    for(const [k,v] of p){found=true;out[k]=SENSITIVE_KEY.test(k)?'[redacted]':String(v).slice(0,300);}
    if(found)return out;
  }catch{}
  // Preserve only a short shape. Never persist opaque auth-like payloads in full.
  return {rawPreview:SENSITIVE_KEY.test(text)?'[redacted]':text.slice(0,500)};
}
function isLikelyMarketRequest(entry){
  const hay=`${entry.url||''} ${JSON.stringify(entry.postData||'')}`;
  return INTERESTING_KEY.test(hay);
}
class NetworkInspector{
  constructor(){this.states=new Map();}
  attach(slot,wc){
    if(!wc||wc.isDestroyed?.())return false;
    this.detach(slot);
    const state={wc,events:[],byId:new Map(),attached:false,handler:null};this.states.set(slot,state);
    try{
      if(!wc.debugger.isAttached())wc.debugger.attach('1.3');
      wc.debugger.sendCommand('Network.enable',{maxTotalBufferSize:10000000,maxResourceBufferSize:2000000}).catch?.(()=>{});
      state.attached=true;
      state.handler=(_event,method,params)=>this._onMessage(slot,method,params||{});
      wc.debugger.on('message',state.handler);
      wc.debugger.once('detach',()=>{const s=this.states.get(slot);if(s)s.attached=false;});
      return true;
    }catch(error){state.error=String(error?.message||error);return false;}
  }
  detach(slot){
    const state=this.states.get(slot);if(!state)return;
    try{if(state.handler)state.wc?.debugger?.removeListener('message',state.handler);}catch{}
    try{if(state.wc?.debugger?.isAttached())state.wc.debugger.detach();}catch{}
    this.states.delete(slot);
  }
  _push(state,event){state.events.push(event);if(state.events.length>600)state.events.splice(0,state.events.length-600);}
  _onMessage(slot,method,p){
    const state=this.states.get(slot);if(!state)return;
    const now=Date.now();
    if(method==='Network.requestWillBeSent'){
      const req=p.request||{},type=String(p.type||'');
      if(!['XHR','Fetch'].includes(type))return;
      const url=redactUrl(req.url||'');
      if(!/^https?:\/\//i.test(url))return;
      const entry={id:String(p.requestId||''),at:now,slot,phase:'request',type,method:String(req.method||'GET'),url,postData:summarizePostData(req.postData),status:null,mimeType:null};
      state.byId.set(entry.id,entry);this._push(state,entry);return;
    }
    if(method==='Network.responseReceived'){
      const id=String(p.requestId||''),res=p.response||{},entry=state.byId.get(id);if(!entry)return;
      entry.status=Number(res.status)||0;entry.mimeType=String(res.mimeType||'').slice(0,120);entry.responseUrl=redactUrl(res.url||entry.url);return;
    }
    if(method==='Network.loadingFailed'){
      const entry=state.byId.get(String(p.requestId||''));if(entry)entry.error=String(p.errorText||'failed').slice(0,180);
    }
  }
  recent(slot,{sinceMs=10*60*1000,limit=200,marketOnly=false}={}){
    const state=this.states.get(slot);if(!state)return {attached:false,error:null,requests:[]};
    const cutoff=Date.now()-Math.max(1000,Number(sinceMs)||0);
    let rows=state.events.filter(x=>x.at>=cutoff);
    if(marketOnly)rows=rows.filter(isLikelyMarketRequest);
    rows=rows.slice(-Math.max(1,Math.min(500,Number(limit)||200))).map(x=>({...x}));
    return {attached:!!state.attached,error:state.error||null,requests:rows};
  }
  clear(slot=null){if(slot===null){for(const s of this.states.values()){s.events.length=0;s.byId.clear();}return;}const s=this.states.get(slot);if(s){s.events.length=0;s.byId.clear();}}
  close(){for(const slot of [...this.states.keys()])this.detach(slot);}
}
module.exports={NetworkInspector,redactUrl,summarizePostData,isLikelyMarketRequest};
