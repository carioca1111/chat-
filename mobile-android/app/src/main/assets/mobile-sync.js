/* Shared by the APK and executable flow tests. No WebView fetch. */
(function(root){
'use strict';
class MobileSync {
 constructor(io){this.io=io;this.busy=false;this.state={internet:'VERIFICANDO',relay:'VERIFICANDO',auth:'VERIFICANDO',pc:'DESCONHECIDO',snapshot:'SEM SNAPSHOT',healthHttp:0,authHttp:0,lastError:'',lastRequest:'',lastSnapshot:0,tokenPresent:false,status:'VERIFICANDO'};}
 async request(path,method='GET',body=''){
  this.state.lastRequest=method+' '+path+' · '+new Date().toISOString();
  const r=await this.io.request(path,method,body);r.endpoint=path;
  return r;
 }
 fail(r){const e=new Error(r.error||('HTTP '+r.status));e.response=r;return e;}
 async run(){
  if(this.busy)return this.state;
  this.busy=true;const s=this.state;
  s.network=this.io.network();s.tokenPresent=this.io.hasToken();s.auth=s.tokenPresent?'NÃO VERIFICADA':'SEM PAREAMENTO';s.healthHttp=0;s.authHttp=0;s.pc='DESCONHECIDO';s.snapshot='NÃO ATUALIZADO';s.lastError='';
  try{
   if(s.network==='offline'){s.internet='SEM INTERNET';s.relay='NÃO VERIFICADO';s.status='SEM INTERNET';return s;}
   s.internet='VERIFICANDO';
   const h=await this.request('/health');s.healthHttp=h.status||0;
   if(h.status===200){s.internet='OK';s.relay='ONLINE';}
   else{s.relay=h.status?'HTTP '+h.status:'OFFLINE';s.internet=h.status?'OK':'NÃO CONFIRMADA';throw this.fail(h);}
   if(h.error)throw this.fail(h);
   if(!h.data || h.data.ok!==true)throw this.fail({error:'HEALTH INVÁLIDO',status:h.status,endpoint:'/health'});
   if(!s.tokenPresent){s.status='Relay online · Pareamento necessário';return s;}
   const r=await this.request('/api/v1/latest');s.authHttp=r.status||0;
   if(r.status===401||r.status===403){this.io.clearToken();s.tokenPresent=false;s.auth='TOKEN INVÁLIDO / PAREAR NOVAMENTE';s.status='Relay online · Token inválido / parear novamente';s.lastError='HTTP '+r.status+' /api/v1/latest';return s;}
   if(r.status===404 && r.data?.error==='no-data'){s.auth='OK';s.pc='OFFLINE';s.snapshot='SEM SNAPSHOT';s.status='Relay online · PC offline';s.lastError='HTTP 404 /api/v1/latest: no-data (sem snapshot do PC)';return s;}
   if(r.status!==200 || r.error)throw this.fail(r);
   s.auth='OK';const d=r.data;
   if(!d || !Array.isArray(d.rows) || !d.total || !Number.isFinite(Number(d.at)) || Number(d.at)<=0)throw this.fail({error:'SNAPSHOT INVÁLIDO',status:200,endpoint:'/api/v1/latest'});
   const clock=r.serverTime||Date.now();
   const reference=Number(d.receivedAt)||Number(d.at);
   const delta=clock-reference;
   s.lastSnapshot=Number(d.at);s.ageSeconds=Math.max(0,Math.floor(delta/1000));
   s.clockWarning=Math.abs(clock-Number(d.at))>60000 && Number(d.receivedAt)>0?'Relógio do PC difere do servidor':'';
   if(delta < -60000){s.pc='DESCONHECIDO';s.snapshot='RELÓGIO DO PC ADIANTADO';s.status='Relay online · Relógio divergente';}
   else if(delta>45000){s.pc='OFFLINE';s.snapshot='SNAPSHOT DESATUALIZADO';s.status='Relay online · PC offline · Snapshot desatualizado';}
   else{s.pc='ONLINE';s.snapshot='há '+s.ageSeconds+'s';s.status='CONECTADO';}
   try{this.io.snapshot(d);}catch(e){throw this.fail({error:'ERRO NO DASHBOARD',message:e.message,status:200,endpoint:'/api/v1/latest'});}
  }catch(e){
   const r=e.response||{error:'ERRO INTERNO',message:e.message};
   s.lastError=(r.endpoint||s.lastRequest)+' · '+(r.status?'HTTP '+r.status+' · ':'')+(r.error||'')+(r.message?' · '+r.message:'');
   s.status=s.relay==='ONLINE'?'Relay online · '+(r.error||'HTTP '+r.status):'Relay offline · '+(r.error||'HTTP '+r.status);
   this.io.log(s.lastError);
  }finally{this.busy=false;this.io.update(s);}
  return s;
 }
}
if(typeof module!=='undefined')module.exports=MobileSync;else root.MobileSync=MobileSync;
})(typeof window!=='undefined'?window:globalThis);
