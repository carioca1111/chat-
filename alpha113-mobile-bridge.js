'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n'),write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
const must=(c,m)=>{if(!c)throw new Error('Alpha 11.3 mobile: '+m);};
function bounds(text,name){let start=text.indexOf('function '+name+'(');const a=text.indexOf('async function '+name+'(');if(a>=0&&(start<0||a<start))start=a;must(start>=0,name+' ausente');const open=text.indexOf('{',start);let d=0,q='',esc=false,line=false,block=false;for(let i=open;i<text.length;i++){const c=text[i],n=text[i+1];if(line){if(c==='\n')line=false;continue}if(block){if(c==='*'&&n==='/'){block=false;i++}continue}if(q){if(esc){esc=false;continue}if(c==='\\'){esc=true;continue}if(c===q)q='';continue}if(c==='/'&&n==='/'){line=true;i++;continue}if(c==='/'&&n==='*'){block=true;i++;continue}if(c==='"'||c==="'"||c==='`'){q=c;continue}if(c==='{')d++;else if(c==='}'&&--d===0)return {start,end:i+1}}throw new Error('fim '+name+' ausente')}
function fn(s,name,repl){const b=bounds(s,name);return s.slice(0,b.start)+repl+s.slice(b.end)}
let remote=read('remote-sync.js');
must(remote.includes("constructor(){this.lastAttempt=0;this.lastSuccess=0;this.lastError='';this.busy=false;this.pairCode='';this.pairExpiresAt=0;}"),'constructor RemoteSync');
remote=remote.replace("constructor(){this.lastAttempt=0;this.lastSuccess=0;this.lastError='';this.busy=false;this.pairCode='';this.pairExpiresAt=0;}","constructor(){this.lastAttempt=0;this.lastSuccess=0;this.lastError='';this.busy=false;this.pairCode='';this.pairExpiresAt=0;this.mobileCommands=[];this.mobileCommandIds=new Set();}");
const oldPush="try{await this.request(config,'/api/v1/push',{method:'POST',body:payload});this.lastSuccess=now;this.lastError='';return true;}";
const newPush="try{await this.request(config,'/api/v1/push',{method:'POST',body:payload});try{const q=await this.request(config,'/api/v2/commands/pull',{timeoutMs:4500});for(const cmd of (q?.commands||[])){const id=String(cmd?.id||'');if(id&&!this.mobileCommandIds.has(id)){this.mobileCommandIds.add(id);this.mobileCommands.push(cmd);}}if(this.mobileCommandIds.size>300){const keep=new Set(this.mobileCommands.map(x=>String(x.id||'')));this.mobileCommandIds=keep;}}catch{}this.lastSuccess=now;this.lastError='';return true;}";
must(remote.includes(oldPush),'push RemoteSync');remote=remote.replace(oldPush,newPush);
const pairAnchor='  async createPairCode(config){';must(remote.includes(pairAnchor),'createPairCode RemoteSync');
remote=remote.replace(pairAnchor,"  takeCommands(){const rows=this.mobileCommands.splice(0);return rows;}\n  async ackCommand(config,id,ok=true,message=''){return this.request(config,'/api/v2/commands/ack',{method:'POST',body:{id:String(id||''),ok:ok!==false,message:String(message||'').slice(0,240)},timeoutMs:4500});}\n"+pairAnchor);
write('remote-sync.js',remote);
let main=read('main.js');
const helper=`
function mobileP95113(src=[]){const a=src.slice(-200).filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor((a.length-1)*.95)]:null;}
function mobileSniper113(){
  if(!sniperRuntime)return null;const m=sniperRuntime.metrics||{};
  const feed=(sniperRuntime.feed||[]).slice(-20).map(x=>({at:x.at,type:x.type,message:x.message,reason:x.reason||null,listing:x.listing?{listingId:x.listing.listingId,name:x.listing.name,price:x.listing.price,currency:x.listing.currency,assetType:x.listing.assetType,assetId:x.listing.assetId,shiny:x.listing.shiny===true}:null}));
  return {mode:sniperRuntime.mode,killSwitch:sniperRuntime.killSwitch,watchCount:sniperRuntime.watch?.size||0,metrics:{events:Number(m.events)||0,matches:Number(m.matches)||0,opportunities:Number(m.opportunities)||0,attempts:Number(m.attempts)||0,wins:Number(m.wins)||0,losses:Number(m.losses)||0,failed:Number(m.failed)||0,ignored:Number(m.ignored)||0,lastEventAt:Number(m.lastEventAt)||0,lastSendAt:Number(m.lastSendAt)||0,lastConfirmAt:Number(m.lastConfirmAt)||0},decisionP95Ms:mobileP95113(m.decision||[]),serverP95Ms:mobileP95113(m.server||[]),feed};
}
function mobileShiny113(){
  const c=shinyCloudCache;if(!c)return {cloud:{computed:false,engine:'render'},accounts:[],groups:[],error:shinyTelemetry?'Aguardando cálculo remoto':'Shiny indisponível'};
  const accounts=(Array.isArray(c.accounts)?c.accounts:[]).slice(0,4).map(a=>({slot:a.slot,name:a.name,online:a.online,status:a.status,calculationEnabled:a.calculationEnabled,calculationReason:a.calculationReason,hunt:a.hunt,huntSlug:a.huntSlug,area:a.area,rate:a.rate,chanceHour:a.chanceHour,eta50Ms:a.eta50Ms,measurementQuality:a.measurementQuality,stability:a.stability,trendPct:a.trendPct,stock:a.stock,today:a.today,attempts:a.attempts,sinceShiny:a.sinceShiny,lastShiny:a.lastShiny,sharedGroup:a.sharedGroup?{huntSlug:a.sharedGroup.huntSlug,hunt:a.sharedGroup.hunt,participants:a.sharedGroup.participants,slots:a.sharedGroup.slots,rate:a.sharedGroup.rate,chanceHour:a.sharedGroup.chanceHour,eta50Ms:a.sharedGroup.eta50Ms,measurementQuality:a.sharedGroup.measurementQuality,stability:a.sharedGroup.stability,trendPct:a.sharedGroup.trendPct}:null}));
  const seen=new Set(),groups=[];for(const a of accounts){const g=a.sharedGroup;if(g?.huntSlug&&!seen.has(g.huntSlug)){seen.add(g.huntSlug);groups.push(g)}}
  return {cloud:c.cloud||{computed:true,engine:'render'},accounts,groups,error:c.error||null,at:c.at||shinyCloudCacheAt||0};
}
function mobileCommandCenterPayload113(){
  const marketReady=typeof liveValidationReady==='function'?!!liveValidationReady():false,market={ready:marketReady,socketReady:marketBridgeHealth.filter(x=>x?.socketReady).length,listings:(latestMarketProtocol.listings||[]).length,lastMarketRxAt:Math.max(0,...marketBridgeHealth.map(x=>Number(x?.lastMarketRxAt)||0))},shiny=mobileShiny113();
  return {version:'3.0.0',desktop:{version:app.getVersion?.()||'3.0.0-alpha.11.3',performanceProfile:settings.performanceProfile,liveEcoMode:settings.liveEcoMode,remoteLastSuccess:remoteSync.lastSuccess||0},sniper:mobileSniper113(),shiny,market,health:{sniper:!!sniperRuntime,shinyCloud:shiny?.cloud?.computed===true,market:marketReady}};
}
let mobileCommandBusy113=false;
async function executeMobileCommand113(cmd){
  const type=String(cmd?.type||''),payload=cmd?.payload||{};
  if(type==='sniper-kill'){sniperRuntime?.kill(true);if(alphaEngine){alphaEngine.kill(true);alphaEngine.unlockLive(false);alphaEngine.configure({executionMode:'paper'});}return 'Kill Switch ativado';}
  if(type==='sniper-radar'){if(!sniperRuntime)throw new Error('Sniper indisponível');sniperRuntime.kill(true);sniperRuntime.configure({mode:'OBSERVE',killSwitch:false});if(alphaEngine){alphaEngine.kill(true);alphaEngine.unlockLive(false);alphaEngine.configure({executionMode:'paper'});}return 'Sniper em Radar / Dry Run';}
  if(type==='set-eco-mode'){settings.liveEcoMode=payload.enabled===true;applySettings();persist();return settings.liveEcoMode?'Modo economia ativado':'Modo economia desativado';}
  if(type==='set-performance-profile'){const p=String(payload.profile||'');if(!PERFORMANCE_PROFILES.has(p))throw new Error('Perfil inválido');settings.performanceProfile=p;applySettings();persist();return 'Perfil '+p+' aplicado';}
  if(type==='reconnect-account'){const slot=Number(payload.slot);if(!Number.isInteger(slot)||slot<0||slot>3)throw new Error('Conta inválida');const wc=guests.get(slot);if(wc&&!wc.isDestroyed()){wc.reload();scheduleReconnect(slot,'Reconexão solicitada pelo Gridium Mobile',Date.now(),true);return 'Conta '+(slot+1)+' recarregada';}scheduleReconnect(slot,'Reconexão solicitada pelo Gridium Mobile',Date.now(),true);return 'Reconexão da Conta '+(slot+1)+' agendada';}
  throw new Error('Comando mobile não permitido');
}
async function processMobileCommands113(){
  if(mobileCommandBusy113)return;const queue=remoteSync.takeCommands?.()||[];if(!queue.length)return;mobileCommandBusy113=true;
  try{for(const cmd of queue){let ok=true,message='';try{message=await executeMobileCommand113(cmd);}catch(error){ok=false;message=String(error?.message||error).slice(0,220);}try{await remoteSync.ackCommand(settings.remote,cmd.id,ok,message);}catch{}if(win&&!win.isDestroyed())win.webContents.send('grid:remote-command',{id:cmd.id,type:cmd.type,ok,message});}publish();}
  finally{mobileCommandBusy113=false;}
}
`;
const rp=bounds(main,'remotePayload');main=main.slice(0,rp.start)+helper+main.slice(rp.start);
main=fn(main,'remotePayload',`function remotePayload(now=Date.now()){
  const view=stats.view(),forecasts=view.rows.map((r,i)=>forecastRow(r,settings.stocks[i],now)),alpha=alphaEngine?alphaEngine.view():null;
  const alphaRemote=alpha?{settings:{executionMode:alpha.settings.executionMode,marketConcurrency:alpha.settings.marketConcurrency,killSwitch:alpha.settings.killSwitch,goal:alpha.settings.goal,dailyProfitTarget:alpha.settings.dailyProfitTarget},accounts:alpha.accounts,rankings:alpha.rankings,positions:alpha.positions.slice(0,30),recentTrades:alpha.recentTrades.slice(0,30),validation:alpha.validation,analytics:alpha.analytics?{professionalDashboard:alpha.analytics.professionalDashboard||null}:null}:null;
  return {version:6,at:now,paused:view.paused,total:view.total,rows:view.rows.map(r=>({slot:r.slot,status:r.status,health:r.health,lastChange:r.lastChange,lastActivityAgo:r.lastActivityAgo,record:r.record?{nick:r.record.nick,values:r.record.values,ms:r.record.ms,since:r.record.since,updated:r.record.updated,live:r.record.live||null}:null})),forecasts,events:stats.recentEvents(30),server:serverWatch.snapshot(now),gridium:{alpha:alphaRemote,hunt:huntView(),mobile:mobileCommandCenterPayload113()}};
}`);
main=fn(main,'publishRemoteStatus',`function publishRemoteStatus(){if(win&&!win.isDestroyed())win.webContents.send('grid:remote-status',remoteSync.status(settings.remote));void processMobileCommands113();}`);
write('main.js',main);
const pkg=JSON.parse(read('package.json'));must(pkg.version==='3.0.0-alpha.11.2','esperava Alpha 11.2, recebeu '+pkg.version);pkg.version='3.0.0-alpha.11.3';write('package.json',JSON.stringify(pkg,null,2)+'\n');
for(const name of ['test/performance-cleanup.test.js','test/shiny-cloud-integration.test.js','test/sniper-arm-ui.test.js']){
  const file=path.join(root,name);if(!fs.existsSync(file))continue;let src=fs.readFileSync(file,'utf8');src=src.replaceAll("'3.0.0-alpha.11.2'","'3.0.0-alpha.11.3'").replaceAll('"3.0.0-alpha.11.2"','"3.0.0-alpha.11.3"');fs.writeFileSync(file,src,'utf8');
}
console.log('Gridium Alpha 11.3: Mobile Command Center bridge aplicado sem novo timer global.');
