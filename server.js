'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const PORT=Number(process.env.PORT)||8787;
const TOKEN=String(process.env.POKEGRID_TOKEN||'').trim();
const HOST=process.env.HOST||'0.0.0.0';
const DATA=process.env.POKEGRID_DATA_DIR||path.join(__dirname,'data');
const STORE=path.join(DATA,'store.json');
if(!TOKEN){console.error('Defina POKEGRID_TOKEN antes de iniciar o relay.');process.exit(1);}
fs.mkdirSync(DATA,{recursive:true});
let store={latest:null,history:[],devices:[],revokedIds:[],revokedBefore:0};
try{const parsed=JSON.parse(fs.readFileSync(STORE,'utf8'));if(parsed&&typeof parsed==='object')store={latest:parsed.latest||null,history:Array.isArray(parsed.history)?parsed.history:[],devices:Array.isArray(parsed.devices)?parsed.devices:[],revokedIds:Array.isArray(parsed.revokedIds)?parsed.revokedIds:[],revokedBefore:Number(parsed.revokedBefore)||0};}catch{}
let saveTimer=null,activePair=null;
function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{const tmp=STORE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(store));fs.renameSync(tmp,STORE);}catch(e){console.error('Falha ao salvar:',e.message);}},300);}
function timingSafe(a,b){const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function bearer(req){const header=req.headers.authorization||'';return header.startsWith('Bearer ')?header.slice(7).trim():'';}
function adminAuth(req){return timingSafe(bearer(req),TOKEN);}
function hash(value){return crypto.createHash('sha256').update(String(value)).digest('hex');}
function b64json(value){return Buffer.from(JSON.stringify(value),'utf8').toString('base64url');}
function signDevice(payload){const body=b64json(payload),head='pg1.'+body,sig=crypto.createHmac('sha256',TOKEN).update(head).digest('base64url');return head+'.'+sig;}
function verifyDevice(token){const parts=String(token||'').split('.');if(parts.length!==3||parts[0]!=='pg1')return null;const head=parts[0]+'.'+parts[1],sig=crypto.createHmac('sha256',TOKEN).update(head).digest('base64url');if(!timingSafe(parts[2],sig))return null;let payload;try{payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));}catch{return null;}if(!payload||typeof payload.id!=='string'||!Number.isFinite(Number(payload.iat)))return null;if(Number(payload.iat)<=Number(store.revokedBefore||0)||store.revokedIds.includes(payload.id))return null;return {id:payload.id,name:String(payload.name||'Celular').slice(0,60),createdAt:Number(payload.iat)};}
function deviceFor(req){const token=bearer(req),signed=verifyDevice(token);if(!signed)return null;let device=store.devices.find(x=>x&&x.id===signed.id);if(!device){device={...signed,lastSeen:Date.now(),revoked:false};store.devices.push(device);}else{device.name=signed.name;device.lastSeen=Date.now();device.revoked=false;}if(store.devices.length>50)store.devices.splice(0,store.devices.length-50);saveSoon();return device;}
function readAuth(req){return adminAuth(req)||!!deviceFor(req);}
function json(res,status,data){const out=status===204?'':JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(out),'cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'GET,POST,OPTIONS'});res.end(out);}
function safeLatest(raw){if(!raw||typeof raw!=='object'||!Number.isFinite(Number(raw.at))||!Array.isArray(raw.rows)||!raw.total)return null;return {version:3,at:Number(raw.at),paused:raw.paused===true,total:raw.total,rows:raw.rows.slice(0,4),forecasts:Array.isArray(raw.forecasts)?raw.forecasts.slice(0,4):[],events:Array.isArray(raw.events)?raw.events.slice(0,30):[],server:raw.server&&typeof raw.server==='object'?raw.server:null};}
function compact(raw){return {at:raw.at,total:{values:raw.total?.values||{},rates:raw.total?.rates||{},ms:raw.total?.ms||0,accountMs:raw.total?.accountMs||0,count:raw.total?.count||0},rows:(raw.rows||[]).slice(0,4).map(r=>({slot:r.slot,status:r.status,health:r.health,lastChange:r.lastChange,record:r.record?{nick:r.record.nick,values:r.record.values,ms:r.record.ms,since:r.record.since,updated:r.record.updated}:null}))};}
function body(req,limit=1024*1024){return new Promise((resolve,reject)=>{let total=0,chunks=[];req.on('data',c=>{total+=c.length;if(total>limit){reject(new Error('too-large'));req.destroy();return;}chunks.push(c);});req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));req.on('error',reject);});}
function pairStart(){const code=String(crypto.randomInt(100000,1000000));activePair={hash:hash(code),expiresAt:Date.now()+10*60000};return {code,expiresAt:activePair.expiresAt};}
function claimPair(code,name){if(!activePair||Date.now()>activePair.expiresAt){activePair=null;return null;}if(!/^\d{6}$/.test(String(code||''))||!timingSafe(hash(String(code)),activePair.hash))return null;activePair=null;const device={id:crypto.randomUUID(),name:String(name||'Celular').replace(/[\r\n\t]/g,' ').trim().slice(0,60)||'Celular',createdAt:Date.now(),lastSeen:Date.now(),revoked:false};const token=signDevice({id:device.id,name:device.name,iat:device.createdAt});store.devices.push(device);if(store.devices.length>50)store.devices.splice(0,store.devices.length-50);saveSoon();return {token,device:{id:device.id,name:device.name,createdAt:device.createdAt}};}
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://relay.local');if(req.method==='OPTIONS')return json(res,204,{});if(url.pathname==='/health')return json(res,200,{ok:true,hasData:!!store.latest,lastUpdate:store.latest?.at||0,version:'1.2.0'});if(url.pathname==='/'&&req.method==='GET')return json(res,200,{ok:true,name:'PokeGrid Relay',version:'1.2.0'});
if(url.pathname==='/api/v1/pair/start'&&req.method==='POST'){if(!adminAuth(req))return json(res,401,{error:'unauthorized'});return json(res,200,pairStart());}
if(url.pathname==='/api/v1/pair/claim'&&req.method==='POST'){try{const raw=JSON.parse(await body(req,16*1024)||'{}'),claimed=claimPair(String(raw.code||''),raw.deviceName);return claimed?json(res,200,claimed):json(res,401,{error:'invalid-or-expired-code'});}catch{return json(res,400,{error:'bad-request'});}}
if(url.pathname==='/api/v1/devices'&&req.method==='GET'){if(!adminAuth(req))return json(res,401,{error:'unauthorized'});return json(res,200,{devices:store.devices.filter(x=>!store.revokedIds.includes(x.id)).slice(-50)});}
if(url.pathname==='/api/v1/devices/revoke'&&req.method==='POST'){if(!adminAuth(req))return json(res,401,{error:'unauthorized'});try{const raw=JSON.parse(await body(req,16*1024)||'{}');if(raw.all===true){store.revokedBefore=Date.now();store.revokedIds=[];}else if(typeof raw.id==='string'&&!store.revokedIds.includes(raw.id))store.revokedIds.push(raw.id);saveSoon();return json(res,200,{ok:true});}catch{return json(res,400,{error:'bad-request'});}}
if(url.pathname==='/api/v1/push'&&req.method==='POST'){if(!adminAuth(req))return json(res,401,{error:'unauthorized'});try{const raw=safeLatest(JSON.parse(await body(req)));if(!raw)return json(res,400,{error:'invalid-payload'});store.latest=raw;const last=store.history[store.history.length-1];if(!last||raw.at-last.at>=60000){store.history.push(compact(raw));const cut=raw.at-8*24*3600000;store.history=store.history.filter(x=>x.at>=cut).slice(-11000);}saveSoon();return json(res,200,{ok:true,historyPoints:store.history.length});}catch(e){return json(res,e.message==='too-large'?413:400,{error:'bad-request'});}}
if(url.pathname==='/api/v1/latest'&&req.method==='GET'){if(!readAuth(req))return json(res,401,{error:'unauthorized'});return store.latest?json(res,200,store.latest):json(res,404,{error:'no-data'});}
if(url.pathname==='/api/v1/history'&&req.method==='GET'){if(!readAuth(req))return json(res,401,{error:'unauthorized'});const range=Math.max(3600000,Math.min(8*24*3600000,Number(url.searchParams.get('range'))||21600000)),since=Date.now()-range;return json(res,200,{points:store.history.filter(x=>x.at>=since)});}
return json(res,404,{error:'not-found'});});
server.listen(PORT,HOST,()=>console.log(`PokeGrid Relay em http://${HOST}:${PORT}`));
process.on('SIGTERM',()=>{try{fs.writeFileSync(STORE,JSON.stringify(store));}catch{}server.close(()=>process.exit(0));});
