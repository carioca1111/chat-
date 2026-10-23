const {test}=require('node:test');
const assert=require('node:assert/strict');
const Sync=require('../app/src/main/assets/mobile-sync.js');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function harness(responses,token=true){
 const store={token};let rendered=null,calls=[];
 const io={network:()=> 'wifi',hasToken:()=>store.token,clearToken:()=>store.token=false,request:async p=>{calls.push(p);return responses.shift()},snapshot:d=>rendered=d,update:()=>{},log:()=>{}};
 return {sync:new Sync(io),io,store,calls,get rendered(){return rendered}};
}
const health=()=>({status:200,data:{ok:true}});
const fresh=()=>({status:200,serverTime:Date.now(),data:{at:Date.now(),receivedAt:Date.now(),rows:Array.from({length:4},(_,i)=>({slot:i,gridium2:{panel:{capturesTotal:12}}})),total:{values:{capturas:48},rates:{}}}});
test('1 inaccessible relay is offline with exact DNS error',async()=>{let h=harness([{error:'DNS FALHOU',message:'UnknownHostException'}]);await h.sync.run();assert.match(h.sync.state.status,/Relay offline/);assert.match(h.sync.state.lastError,/DNS FALHOU/)});
test('2 health 200 without token is online and requests pairing',async()=>{let h=harness([health()],false);await h.sync.run();assert.equal(h.sync.state.relay,'ONLINE');assert.match(h.sync.state.status,/Pareamento necessário/);assert.equal(h.calls.length,1)});
test('3 invalid token 401 and 403 clear persistent token, never offline',async()=>{for(const status of [401,403]){let h=harness([health(),{status,data:{error:'unauthorized'}}]);await h.sync.run();assert.equal(h.store.token,false);assert.equal(h.sync.state.relay,'ONLINE');assert.match(h.sync.state.status,/Token inválido/)}});
test('4 authenticated no-data 404 is PC offline',async()=>{let h=harness([health(),{status:404,data:{error:'no-data'}}]);await h.sync.run();assert.equal(h.sync.state.auth,'OK');assert.equal(h.sync.state.pc,'OFFLINE');assert.equal(h.sync.state.relay,'ONLINE')});
test('5 fresh snapshot populates all four accounts',async()=>{let h=harness([health(),fresh()]);await h.sync.run();assert.equal(h.sync.state.status,'CONECTADO');assert.equal(h.rendered.rows.length,4);assert.equal(h.rendered.total.values.capturas,48)});
test('6 recreated controller automatically reuses persisted token',async()=>{let h=harness([health(),fresh(),health(),fresh()]);await h.sync.run();h.sync=new Sync(h.io);await h.sync.run();assert.equal(h.sync.state.status,'CONECTADO');assert(!h.calls.includes('/api/v1/pair/claim'))});
test('7 network loss and wifi to cellular recovery',async()=>{let h=harness([health(),fresh(),health(),fresh()]);await h.sync.run();h.io.network=()=> 'offline';await h.sync.run();assert.equal(h.sync.state.status,'SEM INTERNET');h.io.network=()=> 'cellular';await h.sync.run();assert.equal(h.sync.state.status,'CONECTADO')});
test('8 relay restart, empty store, then new push recovers without pairing',async()=>{let h=harness([health(),fresh(),{status:503},health(),{status:404,data:{error:'no-data'}},health(),fresh()]);await h.sync.run();await h.sync.run();assert.match(h.sync.state.status,/HTTP 503/);await h.sync.run();assert.equal(h.sync.state.pc,'OFFLINE');await h.sync.run();assert.equal(h.sync.state.status,'CONECTADO');assert(h.store.token)});
test('invalid JSON and dashboard exceptions do not mark healthy relay offline',async()=>{let h=harness([health(),{status:200,error:'JSON INVÁLIDO'}]);await h.sync.run();assert.equal(h.sync.state.relay,'ONLINE');assert.match(h.sync.state.status,/JSON INVÁLIDO/);h=harness([health(),fresh()]);h.io.snapshot=()=>{throw new Error('render broke')};await h.sync.run();assert.match(h.sync.state.status,/ERRO NO DASHBOARD/);assert.equal(h.sync.state.relay,'ONLINE')});
test('server receive time ignores incorrect phone and PC clocks; stale data never connected',async()=>{let r=fresh();r.data.at-=86400000;let h=harness([health(),r]);await h.sync.run();assert.equal(h.sync.state.status,'CONECTADO');r=fresh();r.data.receivedAt-=120000;h=harness([health(),r]);await h.sync.run();assert.equal(h.sync.state.snapshot,'SNAPSHOT DESATUALIZADO')});
test('actual relay: pairing -> no snapshot -> push -> dashboard -> invalid auth',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gridium-flow-'));
 const port=19000+Math.floor(Math.random()*10000),base='http://127.0.0.1:'+port;
 const server=spawn(process.execPath,['server.js'],{cwd:process.env.RELAY_TEST_DIR||path.resolve(__dirname,'../..'),env:{...process.env,PORT:String(port),POKEGRID_TOKEN:'local-test-only',POKEGRID_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 const request=async(p,method='GET',body,token='')=>{const r=await fetch(base+p,{method,body,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token}});return {status:r.status,data:await r.json(),serverTime:Date.parse(r.headers.get('date'))};};
 try{
  for(let i=0;i<50;i++){try{await request('/health');break}catch(e){if(i===49)throw e;await new Promise(r=>setTimeout(r,30))}}
  const pair=await request('/api/v1/pair/start','POST','{}','local-test-only');
  let token=(await request('/api/v1/pair/claim','POST',JSON.stringify({code:pair.data.code}))).data.token;
  let rendered;
  const sync=new Sync({network:()=> 'wifi',hasToken:()=>!!token,clearToken:()=>token='',request:(p,m,b)=>request(p,m,b||undefined,token),snapshot:d=>rendered=d,update:()=>{},log:()=>{}});
  await sync.run();assert.equal(sync.state.pc,'OFFLINE');assert.equal(sync.state.auth,'OK');
  const snapshot=fresh().data;await request('/api/v1/push','POST',JSON.stringify(snapshot),'local-test-only');
  await sync.run();assert.equal(sync.state.status,'CONECTADO');assert.equal(rendered.rows.length,4);
  token='invalid';await sync.run();assert.equal(token,'');assert.equal(sync.state.relay,'ONLINE');
 }finally{server.kill();await new Promise(r=>server.once('exit',r));fs.rmSync(dir,{recursive:true,force:true})}
});
