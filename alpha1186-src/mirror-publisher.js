'use strict';
const {ipcRenderer}=require('electron');
let pc=null,plans=[],statsTimer=null,heartbeatTimer=null,lastStatsAt=0,lastBytes=0;
const previousStreams=new Map();
let pendingIce=[];
const slots=Array.from({length:4},(_,slot)=>({slot,canvas:document.getElementById('c'+slot),gl:null,program:null,texture:null,track:null,sender:null,transceiver:null,texW:0,texH:0,pixelFormat:'rgba',lastFrameAt:0}));
const send=(type,payload)=>ipcRenderer.send('mirror:publisher',{type,payload});
const vertex=`attribute vec2 a;varying vec2 v;void main(){v=(a+1.0)*0.5;gl_Position=vec4(a,0.0,1.0);}`;
const fragment=`precision mediump float;varying vec2 v;uniform sampler2D t;uniform float swapRB;void main(){vec4 c=texture2D(t,vec2(v.x,1.0-v.y));gl_FragColor=swapRB>0.5?vec4(c.b,c.g,c.r,c.a):c;}`;
function shader(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'shader');return s;}
function setupGL(s){
  if(s.gl)return s.gl;const gl=s.canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'});if(!gl)throw new Error('WebGL indisponível');
  const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'program');gl.useProgram(p);
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(p,'a');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(p,'t'),0);
  s.gl=gl;s.program=p;s.texture=tex;return gl;
}
function drawFrame(msg){
  const s=slots[Number(msg.slot)];if(!s||!s.track)return;const width=Math.max(2,Number(msg.width)||2),height=Math.max(2,Number(msg.height)||2),raw=msg.bitmap instanceof Uint8Array?msg.bitmap:new Uint8Array(msg.bitmap?.data||msg.bitmap||[]);if(raw.byteLength!==width*height*4)return;
  if(s.canvas.width!==width||s.canvas.height!==height){s.canvas.width=width;s.canvas.height=height;s.texW=0;s.texH=0;}
  const gl=setupGL(s);gl.viewport(0,0,width,height);gl.useProgram(s.program);gl.bindTexture(gl.TEXTURE_2D,s.texture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
  if(s.texW===width&&s.texH===height)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,raw);else{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,raw);s.texW=width;s.texH=height;}
  gl.uniform1f(gl.getUniformLocation(s.program,'swapRB'),String(msg.pixelFormat)==='bgra'?1:0);gl.drawArrays(gl.TRIANGLES,0,6);gl.flush();s.lastFrameAt=Date.now();try{s.track.requestFrame?.()}catch{}
}
function orderedCodecs(){const codecs=RTCRtpSender.getCapabilities?.('video')?.codecs||[];return [...codecs].sort((a,b)=>{const score=c=>/video\/H264/i.test(c.mimeType)?0:/video\/VP8/i.test(c.mimeType)?1:/video\/VP9/i.test(c.mimeType)?2:3;return score(a)-score(b);});}
async function applyPlans(next){
  plans=Array.isArray(next)?next:plans;
  for(const s of slots){const plan=plans[s.slot]||{};if(!s.sender)continue;try{const p=s.sender.getParameters();if(!p.encodings?.length)p.encodings=[{}];p.encodings[0].maxBitrate=Math.max(20000,Number(plan.bitrate)||20000);p.encodings[0].maxFramerate=Math.max(1,Number(plan.fps)||1);p.encodings[0].active=plan.active!==false;await s.sender.setParameters(p);}catch{}
  }
}
async function init(msg){
  destroy();pc=new RTCPeerConnection({iceServers:Array.isArray(msg.iceServers)?msg.iceServers:[],bundlePolicy:'max-bundle',rtcpMuxPolicy:'require'});plans=Array.isArray(msg.plans)?msg.plans:[];
  pc.onicecandidate=e=>{if(e.candidate)send('ice',e.candidate.toJSON?e.candidate.toJSON():e.candidate)};
  pc.onconnectionstatechange=()=>ipcRenderer.send('mirror:publisher',{type:'connection',state:pc?.connectionState||'closed'});
  const codecs=orderedCodecs();
  for(const s of slots){const plan=plans[s.slot]||{w:640,h:360};s.canvas.width=Number(plan.w)||640;s.canvas.height=Number(plan.h)||360;setupGL(s);const stream=s.canvas.captureStream(0);s.track=stream.getVideoTracks()[0];if(!s.track||typeof s.track.requestFrame!=='function'){stream.getTracks().forEach(t=>t.stop());const fallback=s.canvas.captureStream(1);s.track=fallback.getVideoTracks()[0];}
    const tr=pc.addTransceiver(s.track,{direction:'sendonly',streams:[new MediaStream([s.track])]});s.transceiver=tr;s.sender=tr.sender;if(codecs.length&&typeof tr.setCodecPreferences==='function')try{tr.setCodecPreferences(codecs)}catch{}
  }
  await applyPlans(plans);const offer=await pc.createOffer({offerToReceiveAudio:false,offerToReceiveVideo:false});await pc.setLocalDescription(offer);send('offer',{type:pc.localDescription.type,sdp:pc.localDescription.sdp});
  heartbeatTimer=setInterval(()=>{for(const s of slots){const plan=plans[s.slot]||{};if(plan.active!==false&&s.track)try{s.track.requestFrame?.()}catch{}}},1000);
  statsTimer=setInterval(()=>void collectStats(),3000);
}
async function collectStats(){
  if(!pc||pc.connectionState==='closed')return;try{const reports=await pc.getStats(),streams=[],codecs=new Map();for(const r of reports.values())if(r.type==='codec')codecs.set(r.id,r);let bytes=0,codec=null,encoderImplementation=null;for(const r of reports.values())if(r.type==='outbound-rtp'&&r.kind==='video'&&!r.isRemote){const c=codecs.get(r.codecId),slot=Number(r.mid),prev=previousStreams.get(r.id),elapsed=prev?Math.max(.001,(r.timestamp-prev.timestamp)/1000):0;const fps=elapsed?Math.max(0,((r.framesEncoded||0)-prev.frames)/elapsed):null,bitrate=elapsed?Math.max(0,Math.round(((r.bytesSent||0)-prev.bytes)*8/elapsed)):null;previousStreams.set(r.id,{timestamp:r.timestamp,frames:r.framesEncoded||0,bytes:r.bytesSent||0});bytes+=Number(r.bytesSent)||0;codec=codec||c?.mimeType||null;encoderImplementation=encoderImplementation||r.encoderImplementation||null;streams.push({slot:Number.isInteger(slot)?slot:streams.length,framesEncoded:Number(r.framesEncoded)||0,framesSent:Number(r.framesSent)||0,bytesSent:Number(r.bytesSent)||0,fps,bitrate,framesDropped:r.framesDropped==null?null:Number(r.framesDropped),qualityLimitationReason:r.qualityLimitationReason||null,codec:c?.mimeType||null});}
    const now=Date.now(),seconds=lastStatsAt?Math.max(.1,(now-lastStatsAt)/1000):3,totalBitrate=lastStatsAt?Math.max(0,Math.round((bytes-lastBytes)*8/seconds)):0;lastStatsAt=now;lastBytes=bytes;ipcRenderer.send('mirror:publisher',{type:'stats',stats:{streams,codec,encoderImplementation,totalBitrate}});
  }catch{}
}
async function remoteDescription(payload){if(!pc||!payload)return;await pc.setRemoteDescription(payload);for(const c of pendingIce.splice(0))await pc.addIceCandidate(c);}
async function ice(payload){if(!pc||!payload)return;if(!pc.remoteDescription){pendingIce.push(payload);return;}try{await pc.addIceCandidate(payload)}catch{}}
function destroy(){pendingIce=[];clearInterval(statsTimer);clearInterval(heartbeatTimer);statsTimer=null;heartbeatTimer=null;previousStreams.clear();lastStatsAt=0;lastBytes=0;if(pc){try{pc.onicecandidate=null;pc.onconnectionstatechange=null;pc.close()}catch{}pc=null;}for(const s of slots){try{s.track?.stop()}catch{}s.track=null;s.sender=null;s.transceiver=null;s.lastFrameAt=0;}}
ipcRenderer.on('mirror:control',async(_event,msg={})=>{try{if(msg.type==='init')await init(msg);else if(msg.type==='frame')drawFrame(msg);else if(msg.type==='quality')await applyPlans(msg.plans);else if(msg.type==='answer')await remoteDescription(msg.payload);else if(msg.type==='ice')await ice(msg.payload);else if(msg.type==='destroy')destroy();}catch(error){ipcRenderer.send('mirror:publisher',{type:'error',error:String(error?.message||error)})}});
window.addEventListener('beforeunload',destroy);
