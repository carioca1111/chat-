'use strict';
class RemoteSync {
  constructor(){this.lastAttempt=0;this.lastSuccess=0;this.lastError='';this.busy=false;this.pairCode='';this.pairExpiresAt=0;}
  status(config={}){return {enabled:!!config.enabled,endpoint:config.endpoint||'',tokenConfigured:!!config.token,lastSuccess:this.lastSuccess,lastError:this.lastError,pairCode:this.pairExpiresAt>Date.now()?this.pairCode:'',pairExpiresAt:this.pairExpiresAt};}
  base(config){const base=String(config?.endpoint||'').replace(/\/+$/,'');const url=new URL(base);if(!['https:','http:'].includes(url.protocol))throw new Error('Endpoint inválido');return base;}
  async request(config,path,{method='GET',body=null,timeoutMs=8000}={}){
    if(!config?.endpoint||!config?.token)throw new Error('Acesso remoto não configurado');
    const url=new URL(this.base(config)+path);const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(url,{method,headers:{'content-type':'application/json','authorization':'Bearer '+config.token},body:body===null?undefined:JSON.stringify(body),signal:controller.signal});
      let data={};try{data=await response.json();}catch{}
      if(!response.ok)throw new Error(data?.error?`${response.status}: ${data.error}`:`HTTP ${response.status}`);return data;
    }finally{clearTimeout(timeout);}
  }
  async push(config,payload,now=Date.now()){
    if(!config?.enabled||!config.endpoint||!config.token||this.busy||now-this.lastAttempt<10000)return false;
    this.lastAttempt=now;this.busy=true;
    try{await this.request(config,'/api/v1/push',{method:'POST',body:payload});this.lastSuccess=now;this.lastError='';return true;}
    catch(error){this.lastError=error?.name==='AbortError'?'Tempo limite ao sincronizar':String(error?.message||'Falha na sincronização').slice(0,160);return false;}
    finally{this.busy=false;}
  }
  async createPairCode(config){
    try{const data=await this.request(config,'/api/v1/pair/start',{method:'POST',body:{}});this.pairCode=String(data.code||'');this.pairExpiresAt=Number(data.expiresAt)||0;this.lastError='';return {code:this.pairCode,expiresAt:this.pairExpiresAt};}
    catch(error){this.lastError=String(error?.message||'Falha ao gerar código').slice(0,160);throw error;}
  }
}
module.exports={RemoteSync};
