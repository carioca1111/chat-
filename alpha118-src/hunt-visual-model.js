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
    const mode=OBJECTIVES[objective]?objective:'xp',valid=(hunts||[]).filter(h=>h&&h.huntSlug&&Number(h.observedMs)>0),usable=valid.filter(h=>mode==='xp'?finite(h.xpPerHour):mode==='gold'?finite(h.goldPerHour):finite(h.xpPerHour)&&finite(h.goldPerHour));
    if(!usable.length)return {status:'empty',title:'Coletando dados',detail:'Ainda não há uma amostra válida neste período.',best:null,second:null,confidence:null};
    let ranked=[];
    if(mode==='balanced'){
      const maxXp=Math.max(1,...usable.map(h=>Number(h.xpPerHour)||0)),maxGold=Math.max(1,...usable.map(h=>Number(h.goldPerHour)||0));ranked=usable.map(h=>({...h,_score:.5*((Number(h.xpPerHour)||0)/maxXp)+.5*((Number(h.goldPerHour)||0)/maxGold)})).sort((a,b)=>b._score-a._score);
    }else ranked=[...usable].sort((a,b)=>(Number(b[mode==='xp'?'xpPerHour':'goldPerHour'])||0)-(Number(a[mode==='xp'?'xpPerHour':'goldPerHour'])||0));
    const best=ranked[0],second=ranked[1]||null,conf=best.confidenceDetails||null,minutes=Number(best.observedMinutes)||0;
    if(minutes<5||confidenceScore(best)<.24|| (second && Number(second.observedMinutes)<5))return {status:'collecting',title:'Coletar mais dados',detail:`${label(best.huntSlug)} tem dados, mas a amostra ainda é curta para recomendar com segurança.`,best,second,confidence:conf};
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
    const v=state.visual?.accounts?.[slot];
    if(!v) return {slot,id:null,name:`Conta ${slot+1}`,hunt:'',background:backgroundFor(''),profile:null,connection:{online:false,status:'stale'},period:{hunts:[]},objective,current:null,xpPerHour:null,goldPerHour:null,progress:null,lastAt:null,series:[],recommendation:recommend([],objective),session:{ms:0,xp:null,goldMixed:null,goldNote:'Sem leitura de batalha'},intelligence:{}};
    const w=v.windows?.[minutes]||{current:{},hunts:[],chart:[]},conn={online:v.connected&&now-v.lastAt<=15000,status:v.connected&&now-v.lastAt<=15000?'online':'offline',lastAt:v.lastAt};
    const adapt=h=>({...h,huntSlug:h.id||v.hunt,observedMs:h.ms,observedMinutes:h.ms/60000,confidence:h.ms>=300000?'amostra disponível':'coletando',confidenceDetails:{score:h.ms>=300000?.5:0,label:h.ms>=300000?'amostra disponível':'coletando',observedMinutes:h.ms/60000,samples:h.samples}});
    const period={minutes,hunts:w.hunts.map(adapt)},current=w.current.ms>0?adapt(w.current):null;
    const measured=new Set(period.hunts.map(h=>h.huntSlug));
    for(const h of state.visual.catalog||[])if(!measured.has(h.id))period.hunts.push({huntSlug:h.id,name:h.name,observedMs:0,observedMinutes:0,xpPerHour:null,goldPerHour:null,samples:0});
    return {slot,id:v.id,name:v.name,hunt:v.hunt,huntName:v.huntName,background:backgroundFor(v.huntName||v.hunt),profile:v.profile,connection:conn,period,objective,current,xpPerHour:conn.online?current?.xpPerHour??null:null,goldPerHour:conn.online?current?.goldPerHour??null:null,progress:null,lastAt:v.lastAt,series:w.chart,recommendation:conn.online?recommend(period.hunts,objective):{status:'empty',title:'Sem conexão',detail:'Reconecte a conta para medir o rendimento atual.',best:null},session:{ms:w.current.ms||0,xp:w.current.xp??null,goldMixed:w.current.gold??null,goldNote:'Recompensas explícitas de batalha · período selecionado'},intelligence:{identity:{id:v.id},currentHunt:v.hunt}};
  }

  function totals(snaps=[]){const connected=snaps.filter(x=>x.connection.online).length,xpRows=snaps.filter(x=>x.connection.online&&finite(x.xpPerHour)),goldRows=snaps.filter(x=>x.connection.online&&finite(x.goldPerHour));return {connected,xp:xpRows.reduce((a,x)=>a+Number(x.xpPerHour),0),gold:goldRows.reduce((a,x)=>a+Number(x.goldPerHour),0),xpContributors:xpRows.length,goldContributors:goldRows.length,xpPartial:xpRows.length<connected,goldPartial:goldRows.length<connected};}
  return {PERIODS,OBJECTIVES,clean,label,backgroundFor,sameHunt,periodBlock,recommend,connection,accountSnapshot,totals};
});
