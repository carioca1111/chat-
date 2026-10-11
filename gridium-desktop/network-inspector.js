'use strict';

const SENSITIVE_KEY=/pass|password|token|secret|auth|authorization|cookie|session|csrf|email|credential|bearer/i;
const INTERESTING_KEY=/market|mercado|listing|offer|trade|auction|buy|sell|order|price|currency|gem|gems|coin|coins|gold|pokemon|item|asset|anuncio|venda|compra|preco|preço/i;

function redactUrl(raw=''){
  try{
    const u=new URL(String(raw));
    for(const [k] of u.searchParams){if(SENSITIVE_KEY.test(k))u.searchParams.set(k,'[redacted]');}
    return u.toString();
  }catch{return String(raw||'').slice(0,1200);}
}
function redactValue(value,key=''){
  if(SENSITIVE_KEY.test(String(key)))return '[redacted]';
  if(Array.isArray(value))return value.slice(0,60).map(v=>redactValue(v,key));
  if(value&&typeof value==='object'){
    const out={};for(const [k,v] of Object.entries(value).slice(0,120))out[k]=redactValue(v,k);return out;
  }
  if(typeof value==='string')return redactText(value).slice(0,1500);
  return value;
}
function redactText(input=''){
  let text=String(input||'');
  text=text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/ig,'Bearer [redacted]');
  text=text.replace(/(["']?(?:pass(?:word)?|token|secret|auth(?:orization)?|cookie|session|csrf|email|credential)["']?\s*[:=]\s*["']?)([^"'\s,;&}\]]+)/ig,'$1[redacted]');
  text=text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig,'[redacted-email]');
  return text;
}
function summarizePostData(postData=''){
  const text=String(postData||'').trim();if(!text)return null;
  try{return redactValue(JSON.parse(text));}catch{}
  try{
    const p=new URLSearchParams(text),out={};let found=false;
    for(const [k,v] of p){found=true;out[k]=SENSITIVE_KEY.test(k)?'[redacted]':redactText(String(v)).slice(0,500);}
    if(found)return out;
  }catch{}
  return {rawPreview:redactText(text).slice(0,1000)};
}
function summarizeSocketPayload(payload='',opcode=1){
  const text=String(payload||'');
  if(Number(opcode)!==1)return {binary:true,bytes:text.length};
  if(!text)return null;
  try{return redactValue(JSON.parse(text));}catch{}
  const m=text.match(/^(\d+)([\[{].*)$/s);
  if(m){
    try{return {protocolPrefix:m[1],data:redactValue(JSON.parse(m[2]))};}catch{}
  }
  return {rawPreview:redactText(text).slice(0,1500)};
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
    const state={wc,events:[],byId:new Map(),sockets:new Map(),attached:false,handler:null};this.states.set(slot,state);
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
  _push(state,event){state.events.push(event);if(state.events.length>1400)state.events.splice(0,state.events.length-1400);}
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
      const entry=state.byId.get(String(p.requestId||''));if(entry)entry.error=String(p.errorText||'failed').slice(0,180);return;
    }
    if(method==='Network.webSocketCreated'){
      const id=String(p.requestId||''),url=redactUrl(p.url||'');
      state.sockets.set(id,url);
      this._push(state,{id,at:now,slot,phase:'open',type:'WebSocket',method:'OPEN',url,postData:null,status:null,mimeType:null});return;
    }
    if(method==='Network.webSocketHandshakeResponseReceived'){
      const id=String(p.requestId||''),entry=[...state.events].reverse().find(x=>x.id===id&&x.type==='WebSocket'&&x.method==='OPEN');
      if(entry)entry.status=Number(p.response?.status)||101;return;
    }
    if(method==='Network.webSocketFrameSent'||method==='Network.webSocketFrameReceived'){
      const id=String(p.requestId||''),frame=p.response||{},url=state.sockets.get(id)||'';
      const direction=method.endsWith('Sent')?'SEND':'RECV';
      this._push(state,{id,at:now,slot,phase:'frame',type:'WebSocket',method:direction,url,postData:summarizeSocketPayload(frame.payloadData,frame.opcode),status:null,mimeType:'websocket'});return;
    }
    if(method==='Network.webSocketClosed'){
      const id=String(p.requestId||''),url=state.sockets.get(id)||'';
      this._push(state,{id,at:now,slot,phase:'close',type:'WebSocket',method:'CLOSE',url,postData:null,status:null,mimeType:'websocket'});
      state.sockets.delete(id);
    }
  }
  recent(slot,{sinceMs=10*60*1000,limit=300,marketOnly=false}={}){
    const state=this.states.get(slot);if(!state)return {attached:false,error:null,requests:[]};
    const cutoff=Date.now()-Math.max(1000,Number(sinceMs)||0);
    let rows=state.events.filter(x=>x.at>=cutoff);
    if(marketOnly)rows=rows.filter(isLikelyMarketRequest);
    rows=rows.slice(-Math.max(1,Math.min(900,Number(limit)||300))).map(x=>({...x}));
    return {attached:!!state.attached,error:state.error||null,requests:rows};
  }
  clear(slot=null){if(slot===null){for(const s of this.states.values()){s.events.length=0;s.byId.clear();s.sockets.clear();}return;}const s=this.states.get(slot);if(s){s.events.length=0;s.byId.clear();s.sockets.clear();}}
  close(){for(const slot of [...this.states.keys()])this.detach(slot);}
}
module.exports={NetworkInspector,redactUrl,redactText,summarizePostData,summarizeSocketPayload,isLikelyMarketRequest};
