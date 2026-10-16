'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s);
function once(s,a,b){const count=s.split(a).length-1;if(count!==1)throw Error('Alpha1186 expected unique anchor, got '+count+': '+a.slice(0,100));return s.replace(a,b);}
const BASE_VERSION='3.0.0-alpha.11.8.5',NEXT_VERSION='3.0.0-alpha.11.8.6';
const pkg=JSON.parse(read('package.json'));if(pkg.version!==BASE_VERSION)throw Error('Expected exact 11.8.5 base');
let main=read('main.js'),html=read('index.html');
const partitions=html.match(/partition="[^"]+"/g);
main=once(main,"const {RemoteSync}=require('./remote-sync');","const {RemoteSync}=require('./remote-sync');\nconst {MirrorManager}=require('./mirror-runtime');");
main=once(main,'const remoteSync=new RemoteSync();','const remoteSync=new RemoteSync();\nlet mirrorRuntime=null;');
main=once(main,'guests.set(slot,wc);','guests.set(slot,wc);\n    mirrorRuntime?.registerGuest(slot,wc);');
main=once(main,'installHandlers();createWindow();applySettings();stats.sampleHistory(Date.now(),true);historyDirty=true;',"installHandlers();mirrorRuntime=new MirrorManager({getRemote:()=>settings.remote,getAccounts:()=>stats?.view()?.rows||[],logger:message=>{if(process.env.GRID_MIRROR_DEBUG==='1')console.log('[mirror]',message);}});mirrorRuntime.start();createWindow();applySettings();stats.sampleHistory(Date.now(),true);historyDirty=true;");
main=once(main,"app.on('before-quit',async event=>{","app.on('before-quit',async event=>{await mirrorRuntime?.stop();");
if(JSON.stringify(partitions)!==JSON.stringify(html.match(/partition="[^"]+"/g)))throw Error('Session partitions changed before mirror copy');
write('main.js',main);
for(const n of ['mirror-runtime.js','mirror-publisher.html','mirror-publisher.js'])fs.copyFileSync(path.join(__dirname,'alpha1186-src',n),path.join(root,n));
fs.mkdirSync(path.join(root,'test'),{recursive:true});fs.copyFileSync(path.join(__dirname,'alpha1186-src/test/mirror-runtime.test.js'),path.join(root,'test/mirror-runtime.test.js'));
// Execute the real mirror lifecycle with the same Electron double as main.js.
let mainTest=read('test/main.test.js');
mainTest=once(mainTest," const ctx={URL,require:",` const Module=require('node:module'),originalLoad=Module._load;
 Module._load=function(name,parent,isMain){return name==='electron'?electron:originalLoad.call(this,name,parent,isMain);};
 let mirrorModule;try{mirrorModule=require(path.join(root,'mirror-runtime'));}finally{Module._load=originalLoad;}
 electron.ipcMain.on=()=>{};electron.ipcMain.removeListener=()=>{};
 const ctx={URL,require:`);
mainTest=once(mainTest,"name==='electron'?electron:name.startsWith('./')?", "name==='electron'?electron:name==='./mirror-runtime'?mirrorModule:name.startsWith('./')?");
write('test/main.test.js',mainTest);
let versionChecksUpdated=0;
for(const name of fs.readdirSync(path.join(root,'test'))){if(!name.endsWith('.test.js'))continue;const file=path.join(root,'test',name),source=fs.readFileSync(file,'utf8');if(!source.includes(BASE_VERSION))continue;const next=source.split(BASE_VERSION).join(NEXT_VERSION);versionChecksUpdated+=source.split(BASE_VERSION).length-1;fs.writeFileSync(file,next);}
pkg.version=NEXT_VERSION;pkg.description='Gridium Alpha 11.8.6 — Espelhamento mobile WebRTC sob demanda';write('package.json',JSON.stringify(pkg,null,2)+'\n');
if(JSON.stringify(partitions)!==JSON.stringify(read('index.html').match(/partition="[^"]+"/g)))throw Error('Session partitions changed');
console.log(`Alpha 11.8.6 mirror applied; 4 persistent account partitions preserved; ${versionChecksUpdated} inherited release marker(s) synchronized.`);
