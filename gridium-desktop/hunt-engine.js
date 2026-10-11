'use strict';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const OBJECTIVES={
  balanced:{xp:.25,gold:.30,captures:.15,drops:.20,safety:.10,conversion:0},
  xp:{xp:.70,gold:.10,captures:.10,drops:.05,safety:.05,conversion:0},
  gold:{xp:.05,gold:.65,captures:.05,drops:.20,safety:.05,conversion:0},
  captures:{xp:.10,gold:.10,captures:.65,drops:.10,safety:.05,conversion:0},
  bootstrap:{xp:.03,gold:.34,captures:.03,drops:.25,safety:.10,conversion:.25},
  items:{xp:.05,gold:.10,captures:.05,drops:.65,safety:.10,conversion:.05}
};
function rankHunts(candidates=[],objective='balanced'){
  const list=candidates.filter(x=>x&&x.name),w=OBJECTIVES[objective]||OBJECTIVES.balanced;if(!list.length)return [];
  const maxima={xp:1,gold:1,captures:1,drops:1,conversion:1};for(const c of list){maxima.xp=Math.max(maxima.xp,Number(c.xpRate)||0);maxima.gold=Math.max(maxima.gold,Number(c.goldRate)||0);maxima.captures=Math.max(maxima.captures,Number(c.capturesRate)||0);maxima.drops=Math.max(maxima.drops,Number(c.dropValueRate)||0);maxima.conversion=Math.max(maxima.conversion,Number(c.conversionScore)||0);}
  return list.map(c=>{const safety=1-clamp(c.deathRisk||0,0,1),parts={xp:(Number(c.xpRate)||0)/maxima.xp,gold:(Number(c.goldRate)||0)/maxima.gold,captures:(Number(c.capturesRate)||0)/maxima.captures,drops:(Number(c.dropValueRate)||0)/maxima.drops,safety,conversion:(Number(c.conversionScore)||0)/maxima.conversion};const score=Object.entries(w).reduce((a,[k,v])=>a+(parts[k]||0)*v,0)*100;return {...c,score:Math.round(score*10)/10,objective,parts};}).sort((a,b)=>b.score-a.score);
}
class HuntEngine{
  constructor(){this.objectives=['balanced','balanced','balanced','balanced'];this.last=Array(4).fill(null);this.catalog=Array.from({length:4},()=>[]);}
  setObjective(slot,objective){if(!Number.isInteger(slot)||slot<0||slot>3)throw new Error('Conta inválida');this.objectives[slot]=OBJECTIVES[objective]?objective:'balanced';return this.view();}
  observe(slot,sample){if(!Number.isInteger(slot)||slot<0||slot>3)return;const live=sample?.live||{};this.last[slot]={at:Date.now(),nick:sample?.nick||'',location:live.location||'',level:live.trainerLevel??null,xp:live.trainerXp??null,balances:live.balances||null,rates:null};}
  setCandidates(slot,candidates){if(!Number.isInteger(slot)||slot<0||slot>3)return;this.catalog[slot]=Array.isArray(candidates)?candidates.slice(0,500):[];}
  view(){return {objectives:[...this.objectives],accounts:this.last.map((x,i)=>({slot:i,objective:this.objectives[i],current:x,recommendations:rankHunts(this.catalog[i],this.objectives[i]).slice(0,20)})),features:{xp:true,gold:true,captures:true,items:true,bootstrap:true,autoHunt:'disabled-until-navigation-is-validated'}};}
}
const HUNT_DISCOVERY_SCRIPT=`(() => {
  const clean=s=>String(s||'').replace(/\\s+/g,' ').trim();
  const out={at:Date.now(),url:location.href,current:'',candidates:[],resources:[]};
  const loc=[...document.querySelectorAll('[id*="location" i],[class*="location" i],[id*="map" i],[class*="map-name" i]')].map(x=>clean(x.textContent)).find(x=>x&&x.length<120);if(loc)out.current=loc;
  const nodes=[...document.querySelectorAll('button,option,[role="option"],[data-hunt],[data-location],[class*="hunt" i],[id*="hunt" i]')];
  const seen=new Set();for(const el of nodes){const text=clean(el.textContent);if(!text||text.length>180||seen.has(text))continue;if(!/hunt|route|rota|cave|forest|island|outland|city|mount|lake|sea|desert|tower|road|path|vale|floresta|caverna/i.test(text)&&!el.hasAttribute('data-hunt')&&!el.hasAttribute('data-location'))continue;seen.add(text);const num=x=>{if(!x)return 0;const d=String(x).replace(/[^0-9]/g,'');return Number(d)||0;};const xp=text.match(/(?:xp)\\s*(?:\/h|por hora|h)?\\s*[:·-]?\\s*([0-9][0-9.,]*)/i),gold=text.match(/(?:gold|coins?)\\s*(?:\/h|por hora|h)?\\s*[:·-]?\\s*([0-9][0-9.,]*)/i),cap=text.match(/(?:capturas?|captures?|kills?|abates?)\\s*(?:\/h|por hora|h)?\\s*[:·-]?\\s*([0-9][0-9.,]*)/i);out.candidates.push({name:text.slice(0,160),id:el.getAttribute('data-hunt')||el.getAttribute('data-location')||el.id||'',disabled:!!el.disabled,xpRate:num(xp?.[1]),goldRate:num(gold?.[1]),capturesRate:num(cap?.[1]),deathRisk:/muito alto|very high|letal|fatal/i.test(text)?.8:/alto|high risk|perig/i.test(text)?.55:/médio|medium/i.test(text)?.3:.1});if(out.candidates.length>=100)break;}
  try{out.resources=performance.getEntriesByType('resource').map(x=>{try{const u=new URL(x.name);return u.origin+u.pathname}catch{return ''}}).filter(x=>/hunt|map|location|route/i.test(x)).slice(-50);}catch{}
  return out;
})()`;
module.exports={HuntEngine,rankHunts,OBJECTIVES,HUNT_DISCOVERY_SCRIPT};
