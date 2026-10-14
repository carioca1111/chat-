'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build'),file=path.join(root,'main.js');let s=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const must=(c,m)=>{if(!c)throw new Error('Alpha 11.2 shiny delta: '+m);};
const start=s.indexOf('let shinyCloudCache=null,shinyCloudCacheAt=0,shinyCloudPending=null;');
const sniperHandler=s.indexOf("  handler('grid:sniper-state'",start),shinyHandler=s.indexOf("  handler('grid:shiny-state'",start);
const end=sniperHandler>=0&&sniperHandler<shinyHandler?sniperHandler:shinyHandler;
must(start>=0&&shinyHandler>start&&end>start,'bloco shinyCloudView não encontrado');
const replacement=`let shinyCloudCache=null,shinyCloudCacheAt=0,shinyCloudPending=null,shinyDeltaBaseline=null,shinyDeltaFullAt=0,shinyDeltaSeq=0,shinyDeltaSupported=null;
  const shinyDeltaClientId='gridium-'+nodeProcess.pid+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  function shinyJson112(x){try{return JSON.stringify(x);}catch{return '';}}
  function shinyAccountBase112(a={}){const {bins,huntGroups,species,recent,...base}=a;return base;}
  function shinyGroupKey112(g={}){return String(g.hunt||'')+'|'+String(g.context||'');}
  function shinyDelta112(prev,next){
    const delta={top:{},accounts:[],removedIds:[]};
    for(const k of ['preferences','catalog','diagnostics','historyCount','historyRevision'])if(shinyJson112(prev?.[k])!==shinyJson112(next?.[k]))delta.top[k]=next[k];
    const before=new Map((prev?.accounts||[]).map(a=>[String(a.id),a])),after=new Set();
    for(const a of next?.accounts||[]){const id=String(a.id||'');if(!id)continue;after.add(id);const p=before.get(id);if(!p){delta.accounts.push({id,full:a});continue;}const ch={id,slot:a.slot};
      const base=shinyAccountBase112(a),oldBase=shinyAccountBase112(p);if(shinyJson112(base)!==shinyJson112(oldBase))ch.base=base;
      const oldBins=new Map((p.bins||[]).map(b=>[Number(b.at),b])),bins=[];for(const b of a.bins||[]){const ob=oldBins.get(Number(b.at));if(!ob||shinyJson112(ob)!==shinyJson112(b))bins.push(b);}if(bins.length)ch.binsUpsert=bins;if(a.bins?.length)ch.binsMinAt=Number(a.bins[0].at)||0;
      const oldGroups=new Map((p.huntGroups||[]).map(g=>[shinyGroupKey112(g),g])),groups=[];for(const g of a.huntGroups||[]){const og=oldGroups.get(shinyGroupKey112(g));if(!og||shinyJson112(og)!==shinyJson112(g))groups.push(g);}if(groups.length)ch.huntGroupsUpsert=groups;
      if(shinyJson112(p.species||[])!==shinyJson112(a.species||[]))ch.speciesReplace=a.species||[];if(shinyJson112(p.recent||[])!==shinyJson112(a.recent||[]))ch.recentReplace=a.recent||[];
      if(Object.keys(ch).length>2)delta.accounts.push(ch);
    }
    for(const id of before.keys())if(!after.has(id))delta.removedIds.push(id);return delta;
  }
  async function shinyCloudRequest112(input){
    const now=Date.now(),full=!shinyDeltaBaseline||now-shinyDeltaFullAt>=60000||shinyDeltaSupported===false;
    let body;if(full){body={...input,deltaVersion:1,clientId:shinyDeltaClientId,seq:++shinyDeltaSeq,full:true};}else{body={deltaVersion:1,clientId:shinyDeltaClientId,seq:++shinyDeltaSeq,at:input.at,delta:shinyDelta112(shinyDeltaBaseline,input)};}
    try{const result=await remoteSync.request(settings.remote,'/api/v1/shiny/compute',{method:'POST',body,timeoutMs:3500});shinyDeltaSupported=result?.cloud?.deltaVersion===1;if(full)shinyDeltaFullAt=now;shinyDeltaBaseline=input;return result;}
    catch(error){if(!full){shinyDeltaBaseline=null;const retry={...input,deltaVersion:1,clientId:shinyDeltaClientId,seq:++shinyDeltaSeq,full:true};const result=await remoteSync.request(settings.remote,'/api/v1/shiny/compute',{method:'POST',body:retry,timeoutMs:3500});shinyDeltaSupported=result?.cloud?.deltaVersion===1;shinyDeltaFullAt=Date.now();shinyDeltaBaseline=input;return result;}throw error;}
  }
  async function shinyCloudView(){
    if(!shinyTelemetry)return {accounts:[],error:'Dados temporariamente indisponíveis'};
    const now=Date.now();if(shinyCloudCache&&now-shinyCloudCacheAt<4500)return shinyCloudCache;if(shinyCloudPending)return shinyCloudPending;
    if(!settings.remote?.endpoint||!settings.remote?.token)return shinyTelemetry.visualView('Cálculo remoto aguardando configuração do Relay');
    const input=shinyTelemetry.cloudInput();
    shinyCloudPending=shinyCloudRequest112(input).then(result=>{shinyCloudCache=result;shinyCloudCacheAt=Date.now();return result;}).catch(error=>shinyTelemetry.visualView('Cálculo remoto indisponível · '+String(error?.message||error).slice(0,120))).finally(()=>{shinyCloudPending=null;});
    return shinyCloudPending;
  }
  `;
s=s.slice(0,start)+replacement+s.slice(end);
fs.writeFileSync(file,s,'utf8');console.log('Gridium Alpha 11.2: Shiny Cloud usa delta incremental sem remover handlers do Sniper; full sync de segurança a cada 60s.');
