'use strict';
(function(root){
 function accountHeader(account={},now=Date.now()){
  const timestamps=account.balanceTimes||{},parts=[];
  for(const [key,label] of [['gold','Coins'],['gems','Gemas'],['diamonds','Diamantes']]){
   const value=account[key],at=Number(timestamps[key])||0;
   parts.push(label+': '+(value!=null&&Number.isFinite(Number(value))&&at&&now-at<=120000?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Number(value)):'—'));
  }
  return parts.join(' · ');
 }
 function squareTileSize(width,height,layout='grid'){
  const columns=layout==='focus'?1:2,rows=layout==='grid'?2:1;
  return Math.max(160,Math.floor(Math.min((width-8*(columns-1))/columns,(height-8*(rows-1))/rows)));
 }
 function dashboardModel(state,currency,now=Date.now()){
  const pro=state.professional||{},metrics=pro.metrics?.[currency]||{},accounts=state.accounts?.[currency]||[],positions=(state.positions||[]).filter(x=>x.mode==='real'&&x.currency===currency),pending=pro.pending||[],sum=k=>accounts.reduce((s,x)=>s+(Number(x[k])||0),0),live=state.settings?.liveExecutionUnlocked===true&&state.settings?.killSwitch===false;
  const statuses=positions.map(p=>{const cover=pro.coverage?.[p.id],snapshot=Number(pro.ownSnapshots?.[p.slot])||0,metadata=p.metadata||{},unknown=pending.some(x=>Number(x.slot)===Number(p.slot)),fresh=now-snapshot<=90000;let status,next;
   if(unknown){status='AGUARDANDO SERVIDOR';next='Conferindo a resposta; nenhum envio duplicado';}
   else if(metadata.locked){status='ITEM TRAVADO';next='Aguardando liberação do item pelo jogo';}
   else if(cover?.covered){status=fresh?'ANUNCIADO':'ANÚNCIO A CONFERIR';next=fresh?'Esperando comprador; lucro ainda não realizado':'Aguardando nova leitura de Meus anúncios';}
   else if(metadata.listingStatus==='manual'){status='VENDA MANUAL';next='Compra configurada sem revenda automática';}
   else if(!fresh){status='CONFERINDO ANÚNCIO';next='Aguardando Meus anúncios para confirmar ausência';}
   else{status='SEM ANÚNCIO';next=live?'Recuperador tentará anunciar dentro dos limites':'Recuperação aguardando automático ativo';}
   const fee=Number(state.settings?.feePct?.[p.currency])||0,roi=Number(state.settings?.liveSafety?.minExitProfitPct)||5,floor=Math.ceil(Number(p.entry)*(1+roi/100)/Math.max(.01,1-fee/100));
   return {id:p.id,slot:p.slot,name:p.name||p.asset_id,cost:Number(p.entry)*Number(p.qty||1),floor,status,next,ageMs:Math.max(0,now-Number(p.opened_at)),stale:now-Number(p.opened_at)>21600000};
  });
  const title=pending.length?'Aguardando confirmação do servidor':live?'Automático ativo, com proteção':'Automático parado ou em preparação';
  const decisions=Array.from({length:4},(_,slot)=>(pro.decisions||[]).find(x=>Number(x.slot)===slot)||{slot,reason:'Aguardando primeira análise desta conta'});
  return {title,live,pending,positions:statuses,decisions,metrics,realized:sum('realized'),unrealized:sum('unrealized'),capitalInItems:sum('inPositions'),available:sum('available'),policy:pro.policy||{},profile:pro.profile||'balanced',unmatched:pro.unmatchedSales||[],paperCount:(state.positions||[]).filter(x=>x.mode==='paper').length};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={dashboardModel,accountHeader,squareTileSize};else root.GridiumProfessional={dashboardModel,accountHeader,squareTileSize};
})(typeof window!=='undefined'?window:globalThis);
