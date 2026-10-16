'use strict';
// Real Chromium peers plus four synthetic webContents exercising the sender runtime.
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const root=path.resolve(process.argv[2]||'.');
let manager,receiver,guests=[],timer;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function finish(error){clearTimeout(timer);await manager?.stop();for(const w of guests)if(!w.isDestroyed())w.destroy();if(receiver&&!receiver.isDestroyed())receiver.destroy();if(error)console.error(error);app.exit(error?1:0);}
app.whenReady().then(async()=>{
  timer=setTimeout(()=>void finish(new Error('WebRTC/capture smoke timeout')),45000);
  const {MirrorManager}=require(path.join(root,'mirror-runtime'));
  manager=new MirrorManager();manager.running=true;
  ipcMain.on('mirror:publisher',manager.onPublisher);
  receiver=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
  await receiver.loadURL('data:text/html,<body>receiver</body>');
  let offer;
  manager._signal=async(type,payload)=>{
    if(type==='offer'){
      offer=payload.sdp;
      const answer=await receiver.webContents.executeJavaScript(`(async()=>{
        window.pc=new RTCPeerConnection({iceServers:[]});window.tracks=[];window.channels=0;
        pc.ondatachannel=()=>window.channels++;
        pc.ontrack=e=>{tracks.push(e.track);const v=document.createElement('video');v.muted=true;v.autoplay=true;v.srcObject=new MediaStream([e.track]);document.body.appendChild(v);};
        await pc.setRemoteDescription(${JSON.stringify(payload)});
        await pc.setLocalDescription(await pc.createAnswer());
        if(pc.iceGatheringState!=='complete')await new Promise(r=>{const t=setTimeout(r,3000);pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(t);r()}}});
        return {type:pc.localDescription.type,sdp:pc.localDescription.sdp};})()`);
      manager._publisherSend({type:'answer',payload:answer});
    }else if(type==='ice'){
      await receiver.webContents.executeJavaScript(`window.pc&&pc.addIceCandidate(${JSON.stringify(payload)}).catch(()=>{})`);
    }
    return true;
  };
  for(let slot=0;slot<4;slot++){
    const w=new BrowserWindow({show:true,width:400,height:300,webPreferences:{backgroundThrottling:false}});guests.push(w);
    await w.loadURL('data:text/html,'+encodeURIComponent(`<body style="background:hsl(${slot*80},70%,40%)"><h1>Conta ${slot+1}</h1><div id="n"></div><script>let n=0;setInterval(()=>document.getElementById('n').textContent=++n,100)</script></body>`));
    manager.registerGuest(slot,w.webContents);
  }
  if(manager.capture.size!==0||manager.publisher!==null)throw Error('Idle sender allocated capture/publisher');
  await manager._activate({sessionId:'smoke',deviceId:'synthetic',profile:'balanced',view:'grid'});
  let result;
  for(let i=0;i<60;i++){
    await sleep(500);
    result=await receiver.webContents.executeJavaScript(`(async()=>{if(!window.pc)return {};const r=await pc.getStats();return {state:pc.connectionState,tracks:tracks.length,audio:tracks.filter(t=>t.kind==='audio').length,channels,decoded:[...r.values()].filter(s=>s.type==='inbound-rtp'&&s.kind==='video').map(s=>s.framesDecoded||0)};})()`);
    if(manager.connected&&result.decoded?.length===4&&result.decoded.every(n=>n>0))break;
  }
  if((offer?.match(/^m=video/gm)||[]).length!==4||/^m=(audio|application)/m.test(offer)||!/H264\/90000/i.test(offer))throw Error('Invalid SDP media/codec contract');
  if(!manager.connected||result.tracks!==4||result.audio!==0||result.channels!==0||result.decoded?.length!==4||!result.decoded.every(n=>n>0))throw Error('Frames did not reach all four receivers: '+JSON.stringify(result));
  await manager._deactivate('no-viewer');
  if(manager.capture.size||manager.publisher)throw Error('Capture leaked after disconnect');
  console.log(JSON.stringify({ok:true,videoTracks:4,audioTracks:0,dataChannels:0,h264Offered:true,decoded:result.decoded,directSubscription:true,idleCaptureCount:manager.capture.size}));
  await finish();
}).catch(finish);
app.on('window-all-closed',()=>{});
