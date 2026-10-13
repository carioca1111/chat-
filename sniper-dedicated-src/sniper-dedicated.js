'use strict';

(()=>{
  const api=window.gridAPI;
  if(!api)return;
  const $=id=>document.getElementById(id);
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const fmt=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(num(n));
  const ms=n=>num(n)<1?`${num(n).toFixed(3)} ms`:`${num(n).toFixed(1)} ms`;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state=null,rules=[],loadedPolicy=false,busy=false;

  function activate(){
    qa('.workspace-section').forEach(x=>x.classList.remove('active'));
    qa('.primary-nav .tab').forEach(x=>x.classList.remove('active'));
    $('sniper')?.classList.add('active');q('.sniper-nav')?.classList.add('active');
  }
  function notice(text,type=''){
    const el=$('sniperNotice');if(!el)return;el.textContent=text||'';el.className=`sniper-notice ${type}`;el.hidden=!text;if(text)setTimeout(()=>{if(el.textContent===text)el.hidden=true;},5000);
  }
  function field(id,value){const el=$(id);if(el&&!loadedPolicy)el.value=value??'';}
  function check(id,value){const el=$(id);if(el&&!loadedPolicy)el.checked=value!==false;}
  function renderRuleEditor(){
    const host=$('sniperRules');if(!host)return;
    if(!rules.length){host.innerHTML='<div class="sniper-empty">Nenhuma regra. O sniper não compra nada até você adicionar pelo menos uma.</div>';return;}
    host.innerHTML=rules.map((r,i)=>`<div class="sniper-rule" data-i="${i}">
      <label>Ativo<input data-k="query" value="${esc(r.query||'*')}" placeholder="Pikachu, 25 ou *"></label>
      <label>Tipo<select data-k="assetType"><option value="any" ${r.assetType==='any'?'selected':''}>Qualquer</option><option value="pokemon" ${r.assetType==='pokemon'?'selected':''}>Pokémon</option><option value="item" ${r.assetType==='item'?'selected':''}>Item</option></select></label>
      <label>Moeda<select data-k="currency"><option value="coins" ${r.currency==='coins'?'selected':''}>Coins</option><option value="gems" ${r.currency==='gems'?'selected':''}>Gems</option><option value="any" ${r.currency==='any'?'selected':''}>Qualquer</option></select></label>
      <label>Preço máximo<input data-k="maxPrice" type="number" min="0.0001" step="any" value="${esc(r.maxPrice||'')}"></label>
      <label>Shiny<select data-k="shiny"><option value="any" ${r.shiny==='any'?'selected':''}>Tanto faz</option><option value="only" ${r.shiny==='only'?'selected':''}>Somente shiny</option><option value="exclude" ${r.shiny==='exclude'?'selected':''}>Excluir shiny</option></select></label>
      <button class="sniper-rule-remove" data-remove="${i}" title="Excluir regra">×</button>
    </div>`).join('');
    host.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{syncRuleInputs();rules.splice(Number(b.dataset.remove),1);renderRuleEditor();}));
  }
  function syncRuleInputs(){
    qa('.sniper-rule').forEach(row=>{const i=Number(row.dataset.i),r=rules[i]||{};row.querySelectorAll('[data-k]').forEach(el=>{r[el.dataset.k]=el.dataset.k==='maxPrice'?num(el.value,0):el.value;});rules[i]=r;});
  }
  function policyFromForm(){
    syncRuleInputs();const list=id=>String($(id)?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
    return {
      maxEventAgeMs:num($('sniperFreshMs')?.value,5000),maxPerMinute:num($('sniperMaxMinute')?.value,12),maxPerAsset:num($('sniperMaxAsset')?.value,3),
      hourlyBudgetCoins:num($('sniperHourCoins')?.value,0),dailyBudgetCoins:num($('sniperDayCoins')?.value,0),hourlyBudgetGems:num($('sniperHourGems')?.value,0),dailyBudgetGems:num($('sniperDayGems')?.value,0),
      reserveCoins:num($('sniperReserveCoins')?.value,0),reserveGems:num($('sniperReserveGems')?.value,0),allowShiny:$('sniperAllowShiny')?.checked!==false,
      whitelist:list('sniperWhitelist'),blacklist:list('sniperBlacklist'),rules:rules.map((r,i)=>({...r,id:r.id||`rule-${i+1}`,enabled:true}))
    };
  }
  async function save(silent=false){
    if(busy)return;busy=true;try{state=await api.sniperConfig({policy:policyFromForm()});if(!silent)notice('Regras salvas.','ok');render(state);}catch(e){notice(String(e?.message||e),'bad');}finally{busy=false;}
  }
  async function arm(){
    await save(true);if(!rules.some(r=>num(r.maxPrice)>0)){notice('Adicione ao menos uma regra com preço máximo antes de armar.','bad');return;}
    if(!confirm('Armar o Gridium Sniper para compras REAIS que baterem nas regras?'))return;
    try{state=await api.sniperArm(true,'ATIVAR SNIPER');notice('SNIPER ARMADO — compras reais habilitadas.','ok');render(state);}catch(e){notice(String(e?.message||e),'bad');}
  }
  async function disarm(){try{state=await api.sniperKill(true);notice('Kill Switch acionado. Nenhuma nova compra será enviada.','warn');render(state);}catch(e){notice(String(e?.message||e),'bad');}}
  async function observe(){try{await save(true);state=await api.sniperConfig({mode:'OBSERVE',killSwitch:true});notice('Modo observar ativo. Ele detecta regras, mas não compra.','ok');render(state);}catch(e){notice(String(e?.message||e),'bad');}}
  async function prime(){try{notice('Preparando feed do Market…');state=await api.sniperPrime();render(state);notice('Feed atualizado.','ok');}catch(e){notice(String(e?.message||e),'bad');}}

  function statusClass(on,kind='good'){return on?kind:'off';}
  function render(s){
    if(!s)return;state=s;const sn=s.sniper||s,m=sn.metrics||{},market=s.market||{},live=s.live||{};
    const armed=sn.mode==='AUTO'&&!sn.killSwitch&&live.unlocked===true&&live.killSwitch!==true;
    const set=(id,val)=>{const el=$(id);if(el)el.textContent=val;};
    const pill=(id,text,cls)=>{const el=$(id);if(el){el.textContent=text;el.className=`sniper-status ${cls||''}`;}};
    pill('sniperArmState',armed?'ARMADO':'SEGURO',armed?'armed':'safe');
    pill('sniperSocketState',market.socketReady?`${market.socketReady} SOCKET${market.socketReady===1?'':'S'}`:'SEM SOCKET',statusClass(market.socketReady));
    pill('sniperProtocolState',s.protocolReady?'PROTOCOLO OK':'PREPARANDO',statusClass(s.protocolReady));
    set('sniperEvents',fmt(m.events));set('sniperMatches',fmt(m.matches));set('sniperAttempts',fmt(m.attempts));set('sniperWins',fmt(m.wins));set('sniperLosses',fmt(m.losses));set('sniperWinRate',`${num(m.winRate).toFixed(1)}%`);
    set('sniperDecisionP50',ms(m.decisionP50Ms));set('sniperDecisionP95',ms(m.decisionP95Ms));set('sniperAgeP50',ms(m.eventAgeP50Ms));set('sniperSpent',`${fmt(m.spentCoins)} coins · ${fmt(m.spentGems)} gems`);
    set('sniperAccounts',market.activeSlots?.length?market.activeSlots.map(x=>`C${Number(x)+1}`).join(' · '):'nenhuma');
    set('sniperLastEvent',m.lastEventAt?new Date(m.lastEventAt).toLocaleTimeString('pt-BR'):'—');
    const armBtn=$('sniperArm');if(armBtn){armBtn.disabled=armed;armBtn.textContent=armed?'SNIPER ARMADO':'ARMAR SNIPER';}
    const kill=$('sniperKill');if(kill)kill.disabled=!armed&&sn.killSwitch;
    if(!loadedPolicy&&sn.policy){
      const p=sn.policy;field('sniperFreshMs',p.maxEventAgeMs);field('sniperMaxMinute',p.maxPerMinute);field('sniperMaxAsset',p.maxPerAsset);field('sniperHourCoins',p.hourlyBudgetCoins);field('sniperDayCoins',p.dailyBudgetCoins);field('sniperHourGems',p.hourlyBudgetGems);field('sniperDayGems',p.dailyBudgetGems);field('sniperReserveCoins',p.reserveCoins);field('sniperReserveGems',p.reserveGems);field('sniperWhitelist',(p.whitelist||[]).join(', '));field('sniperBlacklist',(p.blacklist||[]).join(', '));check('sniperAllowShiny',p.allowShiny);rules=(p.rules||[]).map(x=>({...x}));renderRuleEditor();loadedPolicy=true;
    }
    const feed=$('sniperFeed');if(feed){const rows=sn.feed||[];feed.innerHTML=rows.length?rows.slice(0,35).map(x=>{const l=x.listing||{},klass=String(x.status||'').toLowerCase();return `<div class="sniper-feed-row ${klass}"><time>${new Date(x.at||Date.now()).toLocaleTimeString('pt-BR')}</time><b>${esc(l.name||l.assetId||'Ativo')}</b><span>${esc(l.currency||'')} ${fmt(l.price)}</span><strong>${esc(x.status||'')}</strong><small>${esc(x.reason||x.evaluation?.reason||'')}</small></div>`;}).join(''):'<div class="sniper-empty">Nenhuma oportunidade vista ainda.</div>';}
  }
  async function refresh(){if(document.hidden)return;try{const s=await api.sniperState();render(s);}catch{} }
  function bind(){
    q('.sniper-nav')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();activate();},true);
    $('sniperAddRule')?.addEventListener('click',()=>{syncRuleInputs();rules.push({id:`rule-${Date.now()}`,query:'*',assetType:'pokemon',currency:'coins',maxPrice:10,shiny:'any',enabled:true});renderRuleEditor();});
    $('sniperSave')?.addEventListener('click',()=>save(false));$('sniperArm')?.addEventListener('click',arm);$('sniperKill')?.addEventListener('click',disarm);$('sniperObserve')?.addEventListener('click',observe);$('sniperPrime')?.addEventListener('click',prime);
  }
  window.addEventListener('DOMContentLoaded',()=>{bind();setTimeout(()=>{activate();refresh();},120);setInterval(refresh,750);});
})();
