'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'.'),out=path.resolve(process.argv[3]||path.join(root,'alpha1186-benchmark.json'));
let publisher=null,receiver=null,readyResolve=null,connectedResolve=null,latestStats=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function appSample(excludePid=0){
  const rows=app.getAppMetrics().filter(x=>Number(x.pid)!==Number(excludePid));
  return {cpu:rows.reduce((n,x)=>n+(Number(x.cpu?.percentCPUUsage)||0),0),memoryMB:rows.reduce((n,x)=>n+(Number(x.memory?.workingSetSize)||0),0)/1024,processes:rows.length};
}
async function average(durationMs,excludePid=0){const rows=[];for(let t=0;t<durationMs;t+=500){await wait(500);rows.push(appSample(excludePid));}const avg=k=>rows.reduce((n,x)=>n+x[k],0)/Math.max(1,rows.length);return {cpu:Number(avg('cpu').toFixed(2)),memoryMB:Number(avg('memoryMB').toFixed(1)),processes:Number(avg('processes').toFixed(1)),samples:rows.length};}
function frame(slot,w,h,seed){const b=Buffer.allocUnsafe(w*h*4);for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=(y*w+x)*4;b[i]=(x+seed*7+slot*31)&255;b[i+1]=(y+seed*11)&255;b[i+2]=(x+y+seed*3)&255;b[i+3]=255;}}publisher.webContents.send('mirror:control',{type:'frame',slot,width:w,height:h,pixelFormat:'rgba',bitmap:b,at:Date.now()});}
async function runProfile(name,plans,durationMs){publisher.webContents.send('mirror:control',{type:'quality',plans});const timers=[];let stop=false;for(const p of plans){if(p.active===false||!p.fps)continue;let seed=0;const tick=()=>{if(stop)return;frame(p.slot,p.w,p.h,seed++);timers.push(setTimeout(tick,Math.max(1,Math.round(1000/p.fps))))};tick();}const exclude=receiver.webContents.getOSProcessId();const measured=await average(durationMs,exclude);stop=true;for(const t of timers)clearTimeout(t);await wait(800);return {name,...measured,webrtc:latestStats||null};}
function fail(e){console.error(e);try{publisher?.destroy();receiver?.destroy()}catch{}app.exit(1)}
app.whenReady().then(async()=>{
  const baseline=await average(4000,0);
  publisher=new BrowserWindow({show:false,width:16,height:16,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});
  receiver=new BrowserWindow({show:false,width:16,height:16,webPreferences:{nodeIntegration:false,contextIsolation:false,sandbox:false,backgroundThrottling:false}});
  await receiver.loadURL('data:text/html,<html><body></body></html>');
  ipcMain.on('mirror:publisher',async(e,msg={})=>{
    if(e.sender!==publisher.webContents)return;
    if(msg.type==='stats')latestStats=msg.stats;
    if(msg.type==='offer'){
      try{const answer=await receiver.webContents.executeJavaScript(`(async()=>{window.pc?.close();window.pc=new RTCPeerConnection({iceServers:[]});window.pc.ontrack=e=>{window.tracks=window.tracks||[];window.tracks.push(e.track)};await window.pc.setRemoteDescription(${JSON.stringify(msg.payload)});const a=await window.pc.createAnswer();await window.pc.setLocalDescription(a);if(window.pc.iceGatheringState!=='complete')await new Promise(r=>{const t=setTimeout(r,2500);window.pc.onicegatheringstatechange=()=>{if(window.pc.iceGatheringState==='complete'){clearTimeout(t);r()}}});return {type:window.pc.localDescription.type,sdp:window.pc.localDescription.sdp};})()`,true);publisher.webContents.send('mirror:control',{type:'answer',payload:answer});readyResolve?.();}catch(err){fail(err)}}
    if(msg.type==='connection'&&msg.state==='connected')connectedResolve?.();
    if(msg.type==='error')fail(new Error(msg.error));
  });
  await publisher.loadFile(path.join(root,'mirror-publisher.html'));
  const gridPlans=Array.from({length:4},(_,slot)=>({slot,active:true,w:640,h:360,fps:4,bitrate:280000}));
  const timeout=ms=>new Promise((_,reject)=>setTimeout(()=>reject(Error('Benchmark peer connection timeout')),ms));
  const initReady=new Promise(r=>readyResolve=r),connected=new Promise(r=>connectedResolve=r);publisher.webContents.send('mirror:control',{type:'init',sessionId:'benchmark',iceServers:[],plans:gridPlans});await Promise.race([initReady,timeout(10000)]);await Promise.race([connected,timeout(10000)]);
  const grid=await runProfile('2x2-auto-640x360-4fps',gridPlans,8000);
  const singlePlans=Array.from({length:4},(_,slot)=>slot===0?{slot,active:true,w:1280,h:720,fps:10,bitrate:1000000}:{slot,active:false,w:320,h:180,fps:0,bitrate:20000});
  const single=await runProfile('single-auto-1280x720-10fps',singlePlans,8000);
  if(!grid.webrtc?.streams?.some(s=>s.framesEncoded>0)||!single.webrtc?.streams?.some(s=>s.framesEncoded>0))throw Error('Benchmark produced no encoded frames');
  const report={kind:'synthetic-ci-webrtc-benchmark',note:'Measures Gridium Electron publisher/encoder path with generated raw frames; excludes the synthetic receiver renderer from CPU/RAM totals. It is not a physical-phone or four-live-account benchmark.',at:new Date().toISOString(),baseline,grid,single};
  fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));publisher.webContents.send('mirror:control',{type:'destroy'});publisher.destroy();receiver.destroy();app.quit();
}).catch(fail);
app.on('window-all-closed',()=>app.quit());
