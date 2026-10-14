'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Core=require('./mobile-command-core');
const TOKEN=String(process.env.POKEGRID_TOKEN||'').trim(),DATA=process.env.POKEGRID_DATA_DIR||path.join(__dirname,'data');
const LEGACY_STORE=path.join(DATA,'store.json'),MOBILE_STORE=path.join(DATA,'mobile-command-center.json');
fs.mkdirSync(DATA,{recursive:true});
let state={latest:null,commands:[],seq:0};try{const x=JSON.parse(fs.readFileSync(MOBILE_STORE,'utf8'));if(x&&typeof x==='object')state={...state,...x,commands:Array.isArray(x.commands)?x.commands:[]};}catch{}
let saveTimer=null;const clients=new Set();
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{fs.writeFileSync(MOBILE_STORE,JSON.stringify({...state,commands:state.commands.slice(-120)}))}catch{}},120);}
function revocations(){try{const x=JSON.parse(fs.readFileSync(LEGACY_STORE,'utf8'));return {revokedBefore:Number(x.revokedBefore)||0,revokedIds:Array.isArray(x.revokedIds)?x.revokedIds:[]};}catch{return {revokedBefore:0,revokedIds:[]};}}
function identity(req){return Core.readIdentity(req,TOKEN,revocations());}
function json(res,status,data){const out=status===204?'':JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(out),'cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'GET,POST,OPTIONS'});res.end(out);}
function readBody(req,limit=131072){return new Promise((resolve,reject)=>{let n=0,a=[];req.on('data',c=>{n+=c.length;if(n>limit){reject(new Error('too-large'));return;}a.push(c)});req.on('end',()=>resolve(Buffer.concat(a).toString('utf8')));req.on('error',reject);});}
function publicState(){const now=Date.now(),latest=state.latest;return {version:2,at:now,pcOnline:!!latest&&now-Number(latest.at||0)<45000,relayOnline:true,snapshot:latest,commands:state.commands.slice(-25).map(Core.commandPublic),capabilities:{stream:true,pwa:true,commands:['sniper-kill','sniper-radar','set-eco-mode','set-performance-profile','reconnect-account'],remoteAutoArm:false}};}
function emit(event,data){const payload=`id: ${++state.seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;for(const res of [...clients])try{res.write(payload)}catch{clients.delete(res);}save();}
function observePush(req){let size=0,chunks=[];req.on('data',c=>{size+=c.length;if(size<=2*1024*1024)chunks.push(c);});req.on('end',()=>{if(size>2*1024*1024)return;try{const projected=Core.projectMobileSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(!projected)return;state.latest=projected;save();emit('snapshot',publicState());}catch{}});}
function queueCommand(raw,who){const clean=Core.sanitizeCommand(raw),row={id:crypto.randomUUID(),...clean,state:'pending',createdAt:Date.now(),device:{id:who.id,name:who.name}};state.commands.push(row);if(state.commands.length>120)state.commands.splice(0,state.commands.length-120);save();emit('command',Core.commandPublic(row));return row;}
function pullCommands(){const now=Date.now(),rows=state.commands.filter(x=>x.state==='pending'||(x.state==='delivered'&&now-Number(x.deliveredAt||0)>30000)).slice(0,12);for(const x of rows){x.state='delivered';x.deliveredAt=now;}if(rows.length)save();return rows.map(Core.commandPublic);}
function ackCommand(raw){const id=String(raw?.id||''),row=state.commands.find(x=>x.id===id);if(!row)throw new Error('command-not-found');row.state=raw.ok===false?'failed':'done';row.ackedAt=Date.now();row.result={ok:raw.ok!==false,message:String(raw.message||'').slice(0,240)};save();emit('command',Core.commandPublic(row));return row;}

const realCreateServer=http.createServer;
http.createServer=function(options,listener){
  if(typeof options==='function'){listener=options;options=undefined;}
  const wrapped=async(req,res)=>{
    let u;try{u=new URL(req.url,'http://relay.local');}catch{return listener(req,res);}
    if(req.method==='OPTIONS'&&u.pathname.startsWith('/api/v2/'))return json(res,204,{});
    const who=identity(req);
    if(u.pathname==='/api/v2/health'&&req.method==='GET')return json(res,200,{ok:true,version:'2.0.0',pcOnline:publicState().pcOnline,streamClients:clients.size,lastUpdate:state.latest?.at||0});
    if(u.pathname==='/api/v2/state'&&req.method==='GET'){if(!who)return json(res,401,{error:'unauthorized'});return json(res,200,publicState());}
    if(u.pathname==='/api/v2/stream'&&req.method==='GET'){
      if(!who)return json(res,401,{error:'unauthorized'});
      res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-store','connection':'keep-alive','x-accel-buffering':'no','access-control-allow-origin':'*'});res.write(`event: snapshot\ndata: ${JSON.stringify(publicState())}\n\n`);clients.add(res);
      const ping=setInterval(()=>{try{res.write(`: keepalive ${Date.now()}\n\n`)}catch{}},20000);req.on('close',()=>{clearInterval(ping);clients.delete(res);});return;
    }
    if(u.pathname==='/api/v2/commands'&&req.method==='POST'){
      if(!who)return json(res,401,{error:'unauthorized'});if(who.kind!=='device'&&who.kind!=='admin')return json(res,403,{error:'forbidden'});
      try{return json(res,202,{ok:true,command:Core.commandPublic(queueCommand(JSON.parse(await readBody(req)||'{}'),who))});}catch(e){const m=String(e?.message||'bad-request');return json(res,m==='command-not-allowed'?403:400,{error:m});}
    }
    if(u.pathname==='/api/v2/commands'&&req.method==='GET'){if(!who)return json(res,401,{error:'unauthorized'});return json(res,200,{commands:state.commands.slice(-50).map(Core.commandPublic)});}
    if(u.pathname==='/api/v2/commands/pull'&&req.method==='GET'){if(!who||who.kind!=='admin')return json(res,401,{error:'unauthorized'});return json(res,200,{commands:pullCommands()});}
    if(u.pathname==='/api/v2/commands/ack'&&req.method==='POST'){
      if(!who||who.kind!=='admin')return json(res,401,{error:'unauthorized'});try{return json(res,200,{ok:true,command:Core.commandPublic(ackCommand(JSON.parse(await readBody(req)||'{}')))});}catch(e){return json(res,404,{error:String(e?.message||'bad-request')});}
    }
    if(u.pathname==='/api/v1/push'&&req.method==='POST'&&who?.kind==='admin')observePush(req);
    return listener(req,res);
  };
  return options===undefined?realCreateServer.call(http,wrapped):realCreateServer.call(http,options,wrapped);
};

require('./shiny-cloud-wrapper');
