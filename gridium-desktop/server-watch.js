'use strict';
class ServerWatch {
  constructor(){
    this.status='unknown';
    this.since=Date.now();
    this.lastOnlineAt=0;
    this.lastOfflineAt=0;
    this.lastReason='';
    this.failures=new Map();
    this.retries=0;
  }
  fail(slot,reason='Falha de conexão',now=Date.now()){
    this.failures.set(Number(slot),now);
    for(const [k,at] of this.failures)if(now-at>20000)this.failures.delete(k);
    this.lastReason=String(reason||'Falha de conexão').slice(0,180);
    const count=this.failures.size;
    if(count>=2){
      if(this.status!=='offline'){this.status='offline';this.since=now;this.lastOfflineAt=now;this.retries=0;return {changed:true,offline:true};}
      return {changed:false,offline:true};
    }
    if(this.status==='online'||this.status==='unknown'){
      this.status='degraded';this.since=now;return {changed:true,offline:false};
    }
    return {changed:false,offline:this.status==='offline'};
  }
  success(slot,now=Date.now()){
    this.failures.delete(Number(slot));
    this.lastOnlineAt=now;
    const was=this.status;
    if(was!=='online'){this.status='online';this.since=now;this.lastReason='';this.retries=0;return {changed:true,recovered:was==='offline'||was==='recovering'||was==='degraded'};}
    return {changed:false,recovered:false};
  }
  retrying(now=Date.now()){
    if(this.status==='offline'||this.status==='degraded'){
      this.status='recovering';this.since=now;this.retries++;return true;
    }
    if(this.status==='recovering'){this.retries++;return true;}
    return false;
  }
  snapshot(now=Date.now()){
    return {status:this.status,since:this.since,lastOnlineAt:this.lastOnlineAt,lastOfflineAt:this.lastOfflineAt,lastReason:this.lastReason,retries:this.retries,ageMs:Math.max(0,now-this.since)};
  }
}
module.exports={ServerWatch};
