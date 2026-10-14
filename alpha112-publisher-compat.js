'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build'),phase=String(process.argv[3]||'pre');
const file=path.join(root,'main.js');let s=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const old="const statePublisher=createCoalescedPublisher({delayMs:32,build:snapshot,send:payload=>{if(win&&!win.isDestroyed())win.webContents.send('grid:update',payload);}});\nfunction publish(options={}){statePublisher.request({immediate:options?.immediate===true});}";
const direct="function publish(){if(win&&!win.isDestroyed())win.webContents.send('grid:update',snapshot());}";
if(phase==='pre'){
  if(!s.includes(old))throw new Error('Alpha 11.2 publisher pre: coalesced publisher anchor missing');
  s=s.replace(old,direct);
}else{
  const patched=direct+"\nfunction publishRemoteStatus(){if(win&&!win.isDestroyed())win.webContents.send('grid:remote-status',remoteSync.status(settings.remote));}";
  const restored="const statePublisher112=createCoalescedPublisher({delayMs:32,build:snapshot,send:payload=>{if(win&&!win.isDestroyed())win.webContents.send('grid:update',payload);}});\nfunction publish(options={}){statePublisher112.request({immediate:options?.immediate===true});}\nfunction publishRemoteStatus(){if(win&&!win.isDestroyed())win.webContents.send('grid:remote-status',remoteSync.status(settings.remote));}";
  if(!s.includes(patched))throw new Error('Alpha 11.2 publisher post: direct publisher anchor missing');
  s=s.replace(patched,restored);
}
fs.writeFileSync(file,s,'utf8');console.log('Alpha 11.2 publisher '+phase+' compatibility applied.');
