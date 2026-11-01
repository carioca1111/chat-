(()=>{
'use strict';
const $=id=>document.getElementById(id);
const prefsKey='starforge-dashboard-alpha-1.2';
const prefs=(()=>{try{return {...{autoMine:false,autoCargo:true,cargoLimit:90},...JSON.parse(localStorage.getItem(prefsKey)||'{}')}}catch{return{autoMine:false,autoCargo:true,cargoLimit:90}}})();
const save=()=>localStorage.setItem(prefsKey,JSON.stringify(prefs));
const autoMine=$('autoMineToggle'),autoCargo=$('autoCargoToggle'),limit=$('cargoLimitRange'),limitLabel=$('cargoLimitValue');
if(autoMine){autoMine.checked=!!prefs.autoMine;autoMine.addEventListener('change',()=>{prefs.autoMine=autoMine.checked;save()})}
if(autoCargo){autoCargo.checked=!!prefs.autoCargo;autoCargo.addEventListener('change',()=>{prefs.autoCargo=autoCargo.checked;save()})}
if(limit){limit.value=String(prefs.cargoLimit||90);limitLabel.textContent=limit.value+'%';limit.addEventListener('input',()=>{prefs.cargoLimit=Number(limit.value);limitLabel.textContent=limit.value+'%';save()})}
const navMap=$('navMap'),sector=$('sectorButton');if(navMap&&sector)navMap.addEventListener('click',()=>sector.click());
$('navResearch')?.addEventListener('click',()=>toastLocal('Pesquisa será adicionada à árvore econômica.'));
$('navFleet')?.addEventListener('click',()=>toastLocal('Frota: 1 nave ativa · 2 slots bloqueados.'));
const rmt=$('rmtModal');$('rmtButton')?.addEventListener('click',()=>{if(rmt)rmt.hidden=false});$('closeRmt')?.addEventListener('click',()=>{if(rmt)rmt.hidden=true});rmt?.addEventListener('click',e=>{if(e.target===rmt)rmt.hidden=true});
function toastLocal(text){const t=$('toast');if(!t)return;t.textContent=text;t.classList.add('show');clearTimeout(toastLocal.timer);toastLocal.timer=setTimeout(()=>t.classList.remove('show'),2200)}
document.querySelectorAll('.nav-button.tab').forEach(btn=>btn.addEventListener('click',()=>{$('panelLabel').textContent=(btn.dataset.tab||'painel').toUpperCase();document.querySelectorAll('.nav-button.tab').forEach(x=>x.classList.toggle('active',x===btn))}));
const chatForm=$('chatForm'),chatInput=$('chatInput'),chatLog=$('chatLog');chatForm?.addEventListener('submit',e=>{e.preventDefault();const value=(chatInput.value||'').trim();if(!value)return;const p=document.createElement('p'),d=new Date();p.innerHTML=`<time>${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}</time> <b>[Você]</b> ${escapeHtml(value)}`;chatLog.appendChild(p);chatLog.scrollTop=chatLog.scrollHeight;chatInput.value=''});
function escapeHtml(v){return v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function parseCargo(){const txt=$('cargoText')?.textContent||'';const m=txt.match(/([\d.]+)\s*\/\s*([\d.]+)/);if(!m)return null;const used=Number(m[1].replace(/\./g,'')),max=Number(m[2].replace(/\./g,''));return max?used/max*100:null}
function tick(){const rate=$('rateValue')?.textContent||'1.00';if($('shipRateMirror'))$('shipRateMirror').textContent=rate+'/s';const op=$('operationText')?.textContent||'PRONTA';if($('shipStatusMirror'))$('shipStatusMirror').textContent=op.includes('MINER')?'Minerando':op.includes('VIAJ')?'Em viagem':'Pronta';const mine=$('mineButton');const cargo=parseCargo();if(mine&&prefs.autoCargo&&cargo!==null&&cargo>=prefs.cargoLimit&&mine.classList.contains('active'))mine.click();if(mine&&prefs.autoMine&&!mine.disabled&&!mine.classList.contains('active')&&(cargo===null||cargo<prefs.cargoLimit))mine.click()}
setInterval(tick,700);tick();
})();
