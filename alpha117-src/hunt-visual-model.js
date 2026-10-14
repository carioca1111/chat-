'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.HuntVisualModel=api;})(typeof window!=='undefined'?window:globalThis,function(){
  const PERIODS=[15,60,180,360];
  const OBJECTIVES={xp:{label:'XP máximo'},gold:{label:'Gold máximo'},balanced:{label:'Equilíbrio'}};
  const clean=v=>String(v||'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  const label=v=>String(v||'').trim().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()||'Sem hunt identificada';
  function backgroundFor(hunt){const s=clean(hunt);let key='default';if(/\b(vulcao|volcano|lava)\b/.test(s))key='volcano';else if(/\b(floresta|forest|woods?|bosque)\b/.test(s))key='forest';else if(/\b(lago|lake|river|rio)\b/.test(s))key='lake';else if(/\b(caverna|cave|cavern)\b/.test(s))key='cave';else if(/\b(ruinas?|ruins?|torre|tower|templo|temple)\b/.test(s))key='ruins';else if(/\b(gelo|ice|snow|neve|frozen)\b/.test(s))key='ice';else if(/\b(deserto|desert|dunas?|dunes?)\b/.test(s))key='desert';else if(/\b(pantano|swamp|marsh|bog)\b/.test(s))key='swamp';else if(/\b(montanha|mountain|mount|peak|pico)\b/.test(s))key='mountain';else if(/\b(praia|beach|coast|costa|sea|mar)\b/.test(s))key='beach';else if(/\b(campo|meadow|vale|valley|plains?|planicie)\b/.test(s))key='meadow';return `assets/hunt/backgrounds/hunt-${key}.webp`;}
  function sameHunt(a,b){const x=clean(a),y=clean(b);return !!x&&!!y&&x===y;}
  function periodBlock(intel,minutes){const m=PERIODS.includes(Number(minutes))?String(Number(minutes)):'60';return intel?.periods?.[m]||{minutes:Number(m),hunts:[]};}
  function confidenceScore(h){return Number(h?.confidenceDetails?.score)||0;}
  function recommend(hunts=[],objective='xp'){
    const mode=OBJECTIVES[objective]?objective:'xp',valid=(hunts||[]).filter(h=>h&&h.huntSlug&&Number(h.observedMs)>0),usable=valid.filter(h=>mode==='xp'?Number.isFinite(Number(h.xpPerHour)):mode==='gold'?Number.isFinite(Number(h.goldPerHour)):Number.isFinite(Number(h.xpPerHour))&&Number.isFinite(Number(h.goldPerHour)));
    if(!usable.length)return {status:'empty',title:'Coletando dados',detail:'Ainda não há uma amostra válida neste período.',best:null,second:null,confidence:null};
    let ranked=[];
    if(mode==='balanced'){
      const maxXp=Math.max(1,...usable.map(h=>Number(h.xpPerHour)||0)),maxGold=Math.max(1,...usable.map(h=>Number(h.goldPerHour)||0));ranked=usable.map(h=>({...h,_score:.5*((Number(h.xpPerHour)||0)/maxXp)+.5*((Number(h.goldPerHour)||0)/maxGold)})).sort((a,b)=>b._score-a._score);
    }else ranked=[...usable].sort((a,b)=>(Number(b[mode==='xp'?'xpPerHour':'goldPerHour'])||0)-(Number(a[mode==='xp'?'xpPerHour':'goldPerHour'])||0));
    const best=ranked[0],second=ranked[1]||null,conf=best.confidenceDetails||null,minutes=Number(best.observedMinutes)||0;
    if(minutes<5||confidenceScore(best)<.24)return {status:'collecting',title:'Coletar mais dados',detail:`${label(best.huntSlug)} tem dados, mas a amostra ainda é curta para recomendar com segurança.`,best,second,confidence:conf};
    let detail='';
    if(second){if(mode==='balanced')detail=`Melhor equilíbrio observado usando 50% XP e 50% Gold normalizados, comparado a ${label(second.huntSlug)}.`;else{const k=mode==='xp'?'xpPerHour':'goldPerHour',a=Number(best[k]),b=Number(second[k]),pct=b>0?((a-b)/b)*100:null;detail=pct!==null&&Number.isFinite(pct)?`${label(best.huntSlug)} apresentou ${Math.abs(pct).toFixed(pct>=10?0:1)}% mais ${mode==='xp'?'XP/h':'Gold/h'} que ${label(second.huntSlug)} nas amostras comparáveis.`:`${label(best.huntSlug)} teve o melhor ${mode==='xp'?'XP/h':'Gold/h'} observado neste período.`;}}
    else detail=`${label(best.huntSlug)} é a única hunt com amostra válida neste período; compare outra hunt antes de concluir.`;
    return {status:second?'ready':'limited',title:second?`Melhor observada: ${label(best.huntSlug)}`:'Comparação limitada',detail,best,second,confidence:conf};
  }
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  function connection(row,intel,now=Date.now()){
    const rec=row?.record||{},live=rec.live||{},last=Math.max(Number(rec.updated)||0,Number(intel?.lastAt)||0,Number(row?.updated)||0);const explicitOffline=live.browserOnline===false||live.connectionIssue===true||String(row?.status||'').toLowerCase()==='offline'||String(row?.health||'').toLowerCase()==='offline';const age=last?Math.max(0,now-last):Infinity;return {online:!explicitOffline&&age<=120000,stale:age>120000,lastAt:last,ageMs:age,status:explicitOffline?'offline':age<=120000?'online':'stale'};
  }
  function accountSnapshot(slot,state={},data={},minutes=60,objective='xp',now=Date.now()){
    const h=state?.accounts?.[slot]||{},intel=h.intelligence||{},row=data?.rows?.[slot]||{},rec=row.record||{},live=rec.live||{},period=periodBlock(intel,minutes),hunt=intel.currentHunt||live.location||h.current?.location||intel.account?.huntSlug||'',current=period.hunts.find(x=>sameHunt(x.huntSlug,hunt))||null,conn=connection(row,intel,now),profile=intel.profile||null,name=rec.nick||intel.identity?.nick||`Conta ${slot+1}`;
    let progress=null;const lx=Number(live.trainerXp),lm=Number(live.trainerXpMax);if(Number.isFinite(lx)&&Number.isFinite(lm)&&lm>0)progress={current:lx,max:lm,pct:Math.max(0,Math.min(100,lx/lm*100)),source:'leitura do treinador'};else{const ax=Number(intel.account?.xpLevel),am=Number(intel.account?.xpNext);if(Number.isFinite(ax)&&Number.isFinite(am)&&am>0)progress={current:ax,max:am,pct:Math.max(0,Math.min(100,ax/am*100)),source:'estado do servidor'};}
    const series=(intel.series||[]).filter(p=>(Number(p.at)||0)>=now-Number(minutes)*60000),recommendation=recommend(period.hunts,objective);
    return {slot,name,hunt,background:backgroundFor(hunt),profile,connection:conn,period,objective,current,xpPerHour:conn.online&&current&&finite(current.xpPerHour)?Number(current.xpPerHour):null,goldPerHour:conn.online&&current&&finite(current.goldPerHour)?Number(current.goldPerHour):null,progress,trainerLevel:intel.trainerLevel??live.trainerLevel??h.current?.level??null,lastAt:conn.lastAt,series,recommendation,session:{ms:Number(rec.ms)||0,xp:finite(rec.values?.xpTreinador)?Number(rec.values.xpTreinador):null,goldMixed:finite(rec.values?.gold)?Number(rec.values.gold):null,goldNote:'contador da sessão do jogo; pode incluir venda automática'},intelligence:intel,row,h};
  }
  function totals(snaps=[]){const connected=snaps.filter(x=>x.connection.online).length,xpRows=snaps.filter(x=>x.connection.online&&finite(x.xpPerHour)),goldRows=snaps.filter(x=>x.connection.online&&finite(x.goldPerHour));return {connected,xp:xpRows.reduce((a,x)=>a+Number(x.xpPerHour),0),gold:goldRows.reduce((a,x)=>a+Number(x.goldPerHour),0),xpContributors:xpRows.length,goldContributors:goldRows.length,xpPartial:xpRows.length<connected,goldPartial:goldRows.length<connected};}
  return {PERIODS,OBJECTIVES,clean,label,backgroundFor,sameHunt,periodBlock,recommend,connection,accountSnapshot,totals};
});
