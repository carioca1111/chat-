'use strict';
const path=require('path');
const {app,BrowserWindow,ipcMain,nativeImage}=require('electron');

const BACKOFF=[1000,2000,5000,10000,30000];
const PROFILE={
  economy:{grid:{w:480,h:270,fps:2,bitrate:150000},single:{w:640,h:360,fps:5,bitrate:400000}},
  balanced:{grid:{w:640,h:360,fps:4,bitrate:300000},single:{w:960,h:540,fps:10,bitrate:800000}},
  high:{grid:{w:854,h:480,fps:5,bitrate:400000},single:{w:1280,h:720,fps:15,bitrate:1500000}},
  auto:{grid:{w:640,h:360,fps:4,bitrate:280000},single:{w:1280,h:720,fps:10,bitrate:1000000}}
};

const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
function fitSize(width,height,maxW,maxH){
  width=Math.max(1,Number(width)||1);height=Math.max(1,Number(height)||1);
  const scale=Math.min(1,maxW/width,maxH/height);
  return {width:Math.max(2,Math.round(width*scale/2)*2),height:Math.max(2,Math.round(height*scale/2)*2)};
}
function detectBitmapFormat(){
  try{
    const red=nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),b=red.toBitmap();
    if(b[0]>200&&b[2]<30)return 'rgba';
    if(b[2]>200&&b[0]<30)return 'bgra';
  }catch{}
  return process.platform==='win32'?'bgra':'rgba';
}
function buildPlan(demand,adaptiveLevel=0){
  const profile=PROFILE[demand?.cellular&&demand?.saveData!==false?'economy':demand?.profile]||PROFILE.auto;
  const view=demand?.view==='single'?'single':'grid',selected=clamp(demand?.selectedSlot,0,3);
  return Array.from({length:4},(_,slot)=>{
    if(view==='single'&&slot!==selected)return {slot,active:false,w:320,h:180,fps:0,bitrate:20000};
    let p={...profile[view],slot,active:true};
    if(adaptiveLevel>=1)p.fps=Math.max(view==='single'?5:1,Math.floor(p.fps*.7));
    if(adaptiveLevel>=2){p.w=Math.max(360,Math.floor(p.w*.75/2)*2);p.h=Math.max(202,Math.floor(p.h*.75/2)*2);p.bitrate=Math.max(100000,Math.floor(p.bitrate*.7));}
    if(adaptiveLevel>=3){p.fps=view==='single'?5:1;p.bitrate=Math.max(80000,Math.floor(p.bitrate*.55));}
    return p;
  });
}

class MirrorManager{
  constructor({getRemote,getAccounts,logger=()=>{}}={}){
    this.getRemote=getRemote||(()=>({}));this.getAccounts=getAccounts||(()=>[]);this.logger=logger;
    this.guests=new Map();this.capture=new Map();this.publisher=null;this.publisherReady=false;this.connected=false;this.running=false;
    this.controllers=new Set();this.delays=new Map();this.demand=null;this.iceServers=[];this.pixelFormat=detectBitmapFormat();this.adaptiveLevel=0;this.overloadSamples=0;this.baseline=null;this.lastMetrics=null;this.backoffIndex=0;
    this.onPublisher=this._onPublisher.bind(this);
  }
  start(){if(this.running)return;this.running=true;ipcMain.on('mirror:publisher',this.onPublisher);void this._pollLoop();}
  async stop(){
    this.running=false;for(const c of [...this.controllers])try{c.abort()}catch{}this.controllers.clear();for(const [timer,resolve] of [...this.delays]){clearTimeout(timer);this.delays.delete(timer);try{resolve()}catch{}}
    ipcMain.removeListener('mirror:publisher',this.onPublisher);await this._deactivate('app-stop');
  }
  _delay(ms){if(!this.running)return Promise.resolve();return new Promise(resolve=>{const timer=setTimeout(()=>{this.delays.delete(timer);resolve()},ms);this.delays.set(timer,resolve);});}
  registerGuest(slot,wc){
    slot=Number(slot);if(!Number.isInteger(slot)||slot<0||slot>3||!wc)return;const old=this.guests.get(slot);if(old===wc)return;if(old)this._stopCapture(slot);
    this.guests.set(slot,wc);wc.once?.('destroyed',()=>{if(this.guests.get(slot)===wc){this._stopCapture(slot);this.guests.delete(slot);this._sendMetricsSoon();}});
    if(this.connected)this._syncCapture();
  }
  unregisterGuest(slot,wc){slot=Number(slot);if(!wc||this.guests.get(slot)===wc){this._stopCapture(slot);this.guests.delete(slot);}}
  status(){return {active:!!this.demand,connected:this.connected,sessionId:this.demand?.sessionId||'',profile:this.demand?.profile||'auto',view:this.demand?.view||'grid',selectedSlot:this.demand?.selectedSlot||0,adaptiveLevel:this.adaptiveLevel,baseline:this.baseline,lastMetrics:this.lastMetrics};}
  _remote(){const x=this.getRemote?.()||{};return {enabled:x.enabled===true,endpoint:String(x.endpoint||'').replace(/\/+$/,''),token:String(x.token||'')};}
  async _request(route,{method='GET',body=null,timeoutMs=26000}={}){
    const c=this._remote();if(!c.enabled||!c.endpoint||!c.token)throw new Error('remote-disabled');
    const url=new URL(c.endpoint+route),controller=new AbortController();this.controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(url,{method,headers:{authorization:'Bearer '+c.token,'content-type':'application/json'},body:body===null?undefined:JSON.stringify(body),signal:controller.signal});
      let data={};try{data=await response.json()}catch{}if(!response.ok)throw new Error(data?.error||('HTTP '+response.status));return data;
    }finally{clearTimeout(timeout);this.controllers.delete(controller);}
  }
  async _pollLoop(){
    while(this.running){
      const c=this._remote();if(!c.enabled||!c.endpoint||!c.token){if(this.demand)await this._deactivate('remote-disabled');await this._delay(4000);continue;}
      try{
        const data=await this._request('/api/v1/mirror/desktop/poll',{timeoutMs:26000});this.backoffIndex=0;this.iceServers=Array.isArray(data.iceServers)?data.iceServers:[];await this._handlePoll(data);
      }catch(error){
        if(!this.running)break;const wait=BACKOFF[Math.min(this.backoffIndex++,BACKOFF.length-1)];if(this.demand&&String(error?.message)!=='remote-disabled')this.logger('mirror signaling: '+String(error?.message||error));await this._delay(wait);
      }
    }
  }
  async _handlePoll(data){
    const demand=data?.demand||null,event=data?.event||null;
    if(!demand){if(this.demand)await this._deactivate('no-viewer');return;}
    if(!this.demand||this.demand.sessionId!==demand.sessionId||this.demand.deviceId!==demand.deviceId)await this._activate(demand);
    else this._updateDemand(demand);
    if(event?.kind==='signal'&&event.sessionId===this.demand?.sessionId){
      if(event.type==='answer'||event.type==='ice')this._publisherSend({type:event.type,payload:event.payload});
      else if(event.type==='bye')await this._deactivate('mobile-bye');
    }
  }
  async _activate(demand){
    await this._deactivate('replace');this.demand={profile:'auto',view:'grid',selectedSlot:0,cellular:false,saveData:true,...demand};this.baseline=this._systemMetrics();this.adaptiveLevel=0;this.overloadSamples=0;
    const bw=new BrowserWindow({show:false,width:16,height:16,frame:false,skipTaskbar:true,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});this.publisher=bw;this.publisherReady=false;
    bw.on('closed',()=>{if(this.publisher===bw){this.publisher=null;this.publisherReady=false;this.connected=false;this._stopAllCapture();}});
    await bw.loadFile(path.join(__dirname,'mirror-publisher.html'));if(!this.running||!this.demand||bw.isDestroyed())return;
    this.publisherReady=true;this._publisherSend({type:'init',sessionId:this.demand.sessionId,iceServers:this.iceServers,plans:buildPlan(this.demand,this.adaptiveLevel)});
  }
  _updateDemand(next){
    if(!this.demand)return;const before=JSON.stringify([this.demand.profile,this.demand.view,this.demand.selectedSlot,this.demand.cellular,this.demand.saveData]);Object.assign(this.demand,next);const after=JSON.stringify([this.demand.profile,this.demand.view,this.demand.selectedSlot,this.demand.cellular,this.demand.saveData]);
    if(before!==after){this._publisherSend({type:'quality',plans:buildPlan(this.demand,this.adaptiveLevel)});if(this.connected)this._syncCapture();}
  }
  async _deactivate(reason){
    this.connected=false;this._stopAllCapture();const p=this.publisher;this.publisher=null;this.publisherReady=false;const old=this.demand;this.demand=null;
    if(p&&!p.isDestroyed()){try{p.webContents.send('mirror:control',{type:'destroy',reason})}catch{}try{p.destroy()}catch{}}
    if(old&&!['replace','no-viewer','mobile-bye','app-stop'].includes(reason))try{await this._signal('bye',{reason},old)}catch{}
  }
  _publisherSend(msg){const p=this.publisher;if(!p||p.isDestroyed()||!this.publisherReady)return false;try{p.webContents.send('mirror:control',msg);return true}catch{return false}}
  async _signal(type,payload,demand=this.demand){if(!demand)return false;await this._request('/api/v1/mirror/desktop/signal',{method:'POST',body:{deviceId:demand.deviceId,sessionId:demand.sessionId,type,payload},timeoutMs:8000});return true;}
  _onPublisher(event,msg={}){
    if(!this.publisher||event.sender!==this.publisher.webContents||!this.demand)return;
    if(msg.type==='offer'||msg.type==='ice'){void this._signal(msg.type,msg.payload).catch(()=>{});return;}
    if(msg.type==='connection'){
      this.connected=msg.state==='connected';if(this.connected){this.backoffIndex=0;this._syncCapture();}else {this._stopAllCapture();}
      return;
    }
    if(msg.type==='stats'){this._processStats(msg.stats||{});return;}
    if(msg.type==='error')this.logger('mirror publisher: '+String(msg.error||'unknown'));
  }
  _planFor(slot){return buildPlan(this.demand,this.adaptiveLevel)[slot]||{active:false,fps:0,w:320,h:180,bitrate:20000};}
  _syncCapture(){
    if(!this.connected||!this.demand){this._stopAllCapture();return;}const plans=buildPlan(this.demand,this.adaptiveLevel);this._publisherSend({type:'quality',plans});
    for(let slot=0;slot<4;slot++){if(plans[slot].active&&this.guests.has(slot))this._startCapture(slot);else this._stopCapture(slot);}
  }
  _startCapture(slot){
    const wc=this.guests.get(slot);if(!wc||wc.isDestroyed?.())return;const current=this.capture.get(slot);if(current?.wc===wc)return;this._stopCapture(slot);
    const state={wc,busy:false,lastAt:null,quietSince:null,frames:0,dropped:0,startedAt:Date.now(),subscribed:false};this.capture.set(slot,state);
    if(typeof wc.beginFrameSubscription!=='function'){state.unsupported=true;return;}
    try{
      // Electron 35: onlyDirty=true yields a cropped image. False supplies a
      // complete NativeImage plus dirtyRect, allowing safe frame dropping.
      // The first subscription frame seeds the publisher; no second capture.
      wc.beginFrameSubscription(false,(image,dirtyRect)=>this._onFrame(slot,state,image,dirtyRect));state.subscribed=true;
    }catch{state.unsupported=true;}
  }
  _stopCapture(slot){const state=this.capture.get(Number(slot));if(!state)return;if(state.subscribed&&state.wc&&!state.wc.isDestroyed?.()&&typeof state.wc.endFrameSubscription==='function')try{state.wc.endFrameSubscription()}catch{}this.capture.delete(Number(slot));}
  _stopAllCapture(){for(const slot of [...this.capture.keys()])this._stopCapture(slot);}
  _onFrame(slot,state,image,dirtyRect){
    const plan=this._planFor(slot);
    if(this.capture.get(slot)!==state||!this.connected||!this.demand||!plan.active||!image||image.isEmpty?.())return;
    const now=Date.now(),source=image.getSize();
    if(!source.width||!source.height)return;
    const scale=image.getScaleFactors?.()[0]||1;
    const area=source.width*source.height*scale*scale;
    const ratio=dirtyRect?Math.max(0,dirtyRect.width)*Math.max(0,dirtyRect.height)/area:1;
    if(ratio<=0.01){if(state.quietSince===null)state.quietSince=now;}else state.quietSince=null;
    const fps=state.quietSince!==null&&now-state.quietSince>=2000?1:plan.fps;
    if(state.busy||(state.lastAt!==null&&now-state.lastAt<1000/Math.max(1,fps))){state.dropped++;return;}
    state.busy=true;
    try{
      const target=fitSize(source.width,source.height,plan.w,plan.h);
      const scaled=(source.width===target.width&&source.height===target.height)?image:image.resize({...target,quality:'good'});
      // Explicit scaleFactor avoids oversized bitmaps on Windows HiDPI screens.
      const bitmap=scaled.toBitmap({scaleFactor:1});
      if(bitmap.length!==target.width*target.height*4)throw new Error('unexpected-bitmap-size');
      if(this._publisherSend({type:'frame',slot,width:target.width,height:target.height,pixelFormat:this.pixelFormat,bitmap,seed:state.frames===0,at:now})){
        state.lastAt=now;state.frames++;
      }
    }catch{state.dropped++;}
    finally{state.busy=false;}
  }
  _systemMetrics(){
    try{const rows=app.getAppMetrics?.()||[],cpu=rows.reduce((n,x)=>n+(Number(x.cpu?.percentCPUUsage)||0),0),memoryMB=rows.reduce((n,x)=>n+(Number(x.memory?.workingSetSize)||0),0)/1024;return {cpu:Number(cpu.toFixed(1)),memoryMB:Math.round(memoryMB),processes:rows.length};}catch{return {cpu:null,memoryMB:Math.round(process.memoryUsage().rss/1024/1024),processes:null};}
  }
  _processStats(stats){
    const system=this._systemMetrics(),delta=this.baseline?.cpu==null||system.cpu==null?null:Number((system.cpu-this.baseline.cpu).toFixed(1));
    if(delta!==null&&delta>18)this.overloadSamples++;else this.overloadSamples=Math.max(0,this.overloadSamples-1);
    if(this.overloadSamples>=2&&this.adaptiveLevel<3){this.adaptiveLevel++;this.overloadSamples=0;this._publisherSend({type:'quality',plans:buildPlan(this.demand,this.adaptiveLevel)});this._syncCapture();}
    const captures=Array.from({length:4},(_,slot)=>{const s=this.capture.get(slot);return {slot,active:!!s,frames:s?.frames||0,dropped:s?.dropped||0};});
    const accounts=(this.getAccounts?.()||[]).slice(0,4).map((x,slot)=>({slot,name:x?.record?.nick||`Conta ${slot+1}`,online:x?.health==='online'||x?.record?.live?.browserOnline===true}));
    this.lastMetrics={at:Date.now(),system,baseline:this.baseline,cpuDelta:delta,adaptiveLevel:this.adaptiveLevel,streams:stats.streams||[],captures,accounts,codec:stats.codec||null,encoderImplementation:stats.encoderImplementation||null,totalBitrate:stats.totalBitrate||0};
    void this._signal('metrics',this.lastMetrics).catch(()=>{});
  }
  _sendMetricsSoon(){if(this.lastMetrics)void this._signal('metrics',{...this.lastMetrics,accounts:(this.getAccounts?.()||[]).slice(0,4)}).catch(()=>{});}
}
module.exports={MirrorManager,PROFILE,buildPlan,fitSize,detectBitmapFormat};
