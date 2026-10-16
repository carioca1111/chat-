'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
let win=null,receiverReady=false,offerSeen=false,videoLines=0,audioLines=0,h264Seen=false,tracks=0,timer=null;
const plans=Array.from({length:4},(_,slot)=>({slot,active:true,w:320,h:180,fps:2,bitrate:120000}));
function fail(error){console.error(error);try{win?.destroy()}catch{}app.exit(1)}
app.whenReady().then(async()=>{
  timer=setTimeout(()=>fail(new Error('WebRTC smoke timeout')),20000);
  win=new BrowserWindow({show:false,width:32,height:32,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false}});
  ipcMain.on('mirror:publisher',async(e,msg={})=>{
    if(!win||e.sender!==win.webContents)return;
    if(msg.type==='error')return fail(new Error('Publisher: '+msg.error));
    if(msg.type==='offer'&&!offerSeen){
      offerSeen=true;const sdp=String(msg.payload?.sdp||'');videoLines=(sdp.match(/^m=video/gm)||[]).length;audioLines=(sdp.match(/^m=audio/gm)||[]).length;h264Seen=/H264\/90000/i.test(sdp);
      try{
        const answer=await win.webContents.executeJavaScript(`(async()=>{window.__mirrorSmokeReceiver=new RTCPeerConnection({iceServers:[]});window.__mirrorSmokeTracks=[];window.__mirrorSmokeReceiver.ontrack=e=>window.__mirrorSmokeTracks.push(e.track);await window.__mirrorSmokeReceiver.setRemoteDescription(${JSON.stringify(msg.payload)});const a=await window.__mirrorSmokeReceiver.createAnswer();await window.__mirrorSmokeReceiver.setLocalDescription(a);if(window.__mirrorSmokeReceiver.iceGatheringState!=='complete')await new Promise(r=>{const t=setTimeout(r,3000);window.__mirrorSmokeReceiver.onicegatheringstatechange=()=>{if(window.__mirrorSmokeReceiver.iceGatheringState==='complete'){clearTimeout(t);r()}}});return {type:window.__mirrorSmokeReceiver.localDescription.type,sdp:window.__mirrorSmokeReceiver.localDescription.sdp};})()`,true);
        win.webContents.send('mirror:control',{type:'answer',payload:answer});receiverReady=true;
        setTimeout(async()=>{try{tracks=await win.webContents.executeJavaScript('window.__mirrorSmokeTracks?.length||0',true);if(videoLines!==4)throw new Error('Expected 4 video m-lines, got '+videoLines);if(audioLines!==0)throw new Error('Audio m-line present');if(!h264Seen)throw new Error('H264 was not offered by Chromium');if(tracks!==4)throw new Error('Expected 4 receiver tracks, got '+tracks);clearTimeout(timer);console.log(JSON.stringify({ok:true,videoLines,audioLines,h264Seen,tracks,receiverReady}));win.webContents.send('mirror:control',{type:'destroy'});win.destroy();app.quit();}catch(err){fail(err)}},1800);
      }catch(err){fail(err)}
    }
  });
  await win.loadFile(path.join(process.argv[2]||'.','mirror-publisher.html'));
  win.webContents.send('mirror:control',{type:'init',sessionId:'smoke',iceServers:[],plans});
}).catch(fail);
app.on('window-all-closed',()=>app.quit());
