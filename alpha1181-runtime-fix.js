'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
const must=(c,m)=>{if(!c)throw new Error('Alpha 11.8.1 Hunt runtime fix: '+m);};
function bounds(text,name){
  const start=text.indexOf('function '+name+'(');must(start>=0,name+' ausente');
  const signatureEnd=text.indexOf('){',start);must(signatureEnd>=0,name+' assinatura ausente');
  const open=signatureEnd+1;let d=0,q='',esc=false,line=false,block=false;
  for(let i=open;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(q){if(esc){esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c===q)q='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){q=c;continue;}
    if(c==='{')d++;else if(c==='}'&&--d===0)return {start,end:i+1};
  }
  throw new Error('fim de '+name+' ausente');
}
function fn(text,name,replacement){const b=bounds(text,name);return text.slice(0,b.start)+replacement+text.slice(b.end);}

let model=read('hunt-visual-model.js');
model=fn(model,'accountSnapshot',`function accountSnapshot(slot,state={},data={},minutes=60,objective='xp',now=Date.now()){
    const visual=state.visual?.accounts?.[slot]||null,legacy=state.accounts?.[slot]||{},intel=legacy.intelligence||{},row=data.rows?.[slot]||{},record=row.record||{},live=record.live||{};
    const visualWindow=visual?.windows?.[minutes]||null;
    const adaptVisual=h=>h?({...h,huntSlug:h.id||visual?.hunt||'',name:h.name||h.id||visual?.huntName||visual?.hunt||'',observedMs:Number(h.ms)||0,observedMinutes:(Number(h.ms)||0)/60000,confidence:(Number(h.ms)||0)>=300000?'amostra disponível':'coletando',confidenceDetails:{score:(Number(h.ms)||0)>=300000?.5:0,label:(Number(h.ms)||0)>=300000?'amostra disponível':'coletando',observedMinutes:(Number(h.ms)||0)/60000,samples:Number(h.samples)||0}}):null;
    const adaptLegacy=h=>h?({...h,huntSlug:h.huntSlug||h.id||'',name:h.name||h.huntSlug||h.id||'',observedMs:Number(h.observedMs)||0,observedMinutes:Number(h.observedMinutes)||((Number(h.observedMs)||0)/60000)}):null;
    const legacyPeriod=intel?.periods?.[String(minutes)]||null;
    const legacyHunts=(legacyPeriod?.hunts||intel?.hunts||[]).map(adaptLegacy).filter(Boolean),visualHunts=(visualWindow?.hunts||[]).map(adaptVisual).filter(Boolean),merged=new Map();
    const mergeHunt=h=>{const key=String(h.huntSlug||h.name||'').trim().toLowerCase();if(!key)return;const old=merged.get(key);if(!old){merged.set(key,h);return;}merged.set(key,{...old,...h,xpPerHour:finite(h.xpPerHour)?Number(h.xpPerHour):old.xpPerHour??null,goldPerHour:finite(h.goldPerHour)?Number(h.goldPerHour):old.goldPerHour??null,killsPerHour:finite(h.killsPerHour)?Number(h.killsPerHour):old.killsPerHour??null,observedMs:Math.max(Number(old.observedMs)||0,Number(h.observedMs)||0),observedMinutes:Math.max(Number(old.observedMinutes)||0,Number(h.observedMinutes)||0),samples:Math.max(Number(old.samples)||0,Number(h.samples)||0),confidenceDetails:h.confidenceDetails||old.confidenceDetails,confidence:h.confidence||old.confidence});};
    legacyHunts.forEach(mergeHunt);visualHunts.forEach(mergeHunt);
    const period={minutes,hunts:[...merged.values()]};
    const catalog=state.visual?.catalog||[];const measured=new Set(period.hunts.map(h=>String(h.huntSlug||'').toLowerCase()));for(const h of catalog){const id=String(h.id||'');if(id&&!measured.has(id.toLowerCase()))period.hunts.push({huntSlug:id,name:h.name||id,observedMs:0,observedMinutes:0,xpPerHour:null,goldPerHour:null,samples:0});}
    const hunt=String(visual?.hunt||intel.currentHunt||legacy.current?.location||legacy.current?.huntSlug||live.location||'').trim(),huntName=visual?.huntName||period.hunts.find(h=>sameHunt(h.huntSlug,hunt))?.name||hunt;
    const visualCurrent=visualWindow?.current?.ms>0?adaptVisual(visualWindow.current):null,legacyCurrent=period.hunts.find(h=>sameHunt(h.huntSlug,hunt))||null,current=visualCurrent||legacyCurrent;
    let profile=intel.profile?{...intel.profile}:null;if(visual?.profile){profile={...(profile||{})};for(const [k,v] of Object.entries(visual.profile))if(v!==null&&v!==undefined&&v!=='')profile[k]=v;}if(profile&&!Object.keys(profile).length)profile=null;
    const explicitOffline=live.browserOnline===false||live.connectionIssue===true||String(row.status||'').toLowerCase()==='offline'||String(row.health||'').toLowerCase()==='offline',legacyConn=connection(row,intel,now),visualLast=Number(visual?.lastAt)||0,visualOnline=!!visual?.connected&&visualLast>0&&now-visualLast<=120000,legacySignal=!!(record.updated||intel.lastAt||row.status||row.health||Object.keys(live).length),online=!explicitOffline&&(legacySignal?(legacyConn.online||visualOnline):visualOnline),lastAt=Math.max(Number(legacyConn.lastAt)||0,visualLast,Number(intel.lastAt)||0)||null,status=explicitOffline?'offline':online?'online':lastAt?'stale':'offline',conn={online,stale:!online&&!!lastAt,lastAt,ageMs:lastAt?Math.max(0,now-lastAt):Infinity,status};
    const visualSeries=Array.isArray(visualWindow?.chart)?visualWindow.chart:[],legacySeries=Array.isArray(intel.series)?intel.series:[],series=visualSeries.filter(p=>finite(p?.xpPerHour)||finite(p?.goldPerHour)).length>=2?visualSeries:legacySeries;
    const rateFromRecord=key=>Number(record.ms)>0&&finite(record.values?.[key])?Number(record.values[key])*3600000/Number(record.ms):null,legacyRates=legacy.current?.rates||{},legacyAllowsFallback=!visualCurrent;
    const rawXp=finite(current?.xpPerHour)?Number(current.xpPerHour):legacyAllowsFallback&&finite(legacyRates.xpPerHour)?Number(legacyRates.xpPerHour):legacyAllowsFallback?rateFromRecord('xpTreinador'):null,rawGold=finite(current?.goldPerHour)?Number(current.goldPerHour):legacyAllowsFallback&&finite(legacyRates.goldPerHour)?Number(legacyRates.goldPerHour):legacyAllowsFallback?rateFromRecord('gold'):null;
    const progress=finite(live.trainerXp)&&finite(live.trainerXpMax)&&Number(live.trainerXpMax)>0?{pct:Math.max(0,Math.min(100,Number(live.trainerXp)/Number(live.trainerXpMax)*100)),source:'jogo'}:null;
    const sessionMs=Number(visualWindow?.current?.ms)||Number(current?.observedMs)||0,sessionXp=visualWindow?.current?.xp??null,sessionGold=visualWindow?.current?.gold??null;
    const fallbackName=record.nick||intel.identity?.nick||intel.identity?.id||('Conta '+(slot+1)),name=visual?.name||fallbackName,id=visual?.id||intel.identity?.id||intel.identity?.key||null;
    return {slot,id,name,hunt,huntName,background:backgroundFor(huntName||hunt),profile,connection:conn,period,objective,current,xpPerHour:online&&finite(rawXp)?Number(rawXp):null,goldPerHour:online&&finite(rawGold)?Number(rawGold):null,progress,lastAt,series,recommendation:online?recommend(period.hunts,objective):{status:'empty',title:'Sem conexão',detail:'Aguardando dados recentes desta conta.',best:null},session:{ms:sessionMs,xp:sessionXp,goldMixed:sessionGold,goldNote:sessionGold!==null?'Recompensas explícitas de batalha · período selecionado':'Sem total de Gold de batalha nesta janela'},intelligence:intel};
  }`);
write('hunt-visual-model.js',model);

let store=read('hunt-visual-store.js');
const oldOnline="const a=this.accounts.get(s.id),p=s.profile,online=s.connected&&now-s.lastAt<=GAP,key=this.context(s);";
const newOnline="const a=this.accounts.get(s.id),p=s.profile,online=s.connected&&now-s.lastAt<=120000,key=this.context(s);";
must(store.includes(oldOnline),'âncora de presença do coletor ausente');store=store.replace(oldOnline,newOnline);write('hunt-visual-store.js',store);

const pkgPath=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));must(pkg.version==='3.0.0-alpha.11.8','base 11.8 esperada, atual '+pkg.version);pkg.version='3.0.0-alpha.11.8.1';pkg.description='Gridium Alpha 11.8.1: Hunt Intelligence runtime fallback + dados reais por conta';fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

const patched=read('hunt-visual-model.js');must(patched.includes('legacy=state.accounts?.[slot]'),'fallback legado não foi aplicado');must(patched.includes('legacyAllowsFallback=!visualCurrent'),'proteção de métrica desconhecida não foi aplicada');must(read('hunt-visual-store.js').includes('now-s.lastAt<=120000'),'janela de presença não foi ampliada');
console.log('Gridium Alpha 11.8.1: Hunt Visual combina coletor visual com a inteligência real sem inventar métricas ausentes.');
