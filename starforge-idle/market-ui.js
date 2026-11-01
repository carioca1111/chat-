(()=>{
'use strict';
const SAVE_KEY='starforge-alpha-1.0';
const $=id=>document.getElementById(id);
const fmt=n=>Math.floor(Number(n)||0).toLocaleString('pt-BR');
let marketActive=false;

function readState(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    const s=raw?JSON.parse(raw):{};
    if(!Number.isFinite(s.credits))s.credits=260;
    if(!Number.isFinite(s.fuel))s.fuel=1000;
    if(!Number.isFinite(s.maxFuel))s.maxFuel=1000;
    if(!Number.isFinite(s.repairKits))s.repairKits=0;
    if(!Number.isFinite(s.recoveryBeacons))s.recoveryBeacons=0;
    if(!Number.isFinite(s.shield))s.shield=100;
    return s;
  }catch{return{credits:260,fuel:1000,maxFuel:1000,repairKits:0,recoveryBeacons:0,shield:100};}
}
function writeState(s){localStorage.setItem(SAVE_KEY,JSON.stringify(s));}
function toast(text){const e=$('toast');if(!e)return;e.textContent=text;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800);}
function render(){
  if(!marketActive)return;
  const panel=$('panelContent'),label=$('panelLabel');
  if(!panel)return;
  const s=readState();
  if(label)label.textContent='SUPRIMENTOS';
  panel.innerHTML=`<div class="panel-title"><h2>Suprimentos</h2><span>LOJA DO SISTEMA</span></div>
  <p class="market-note">Consumíveis operacionais. Os Credits gastos aqui saem permanentemente da economia.</p>
  <div class="market-card"><div><strong>⛽ Combustível</strong><span>${fmt(s.fuel)} / ${fmt(s.maxFuel)} · usado em viagens entre sub-setores e setores</span></div><b>120 C</b><button data-supply="fuel" ${s.fuel>=s.maxFuel?'disabled':''}>COMPRAR +250</button></div>
  <div class="market-card"><div><strong>🔧 Kit de Reparo</strong><span>Estoque: ${fmt(s.repairKits)} · recupera 45% da nave</span></div><b>180 C</b><button data-supply="repair">COMPRAR</button>${s.repairKits>0&&s.shield<100?'<button data-supply="use-repair">USAR KIT</button>':''}</div>
  <div class="market-card"><div><strong>📡 Recovery Beacon</strong><span>Estoque: ${fmt(s.recoveryBeacons)} · usado automaticamente em colapso</span></div><b>650 C</b><button data-supply="beacon">COMPRAR</button></div>`;
}
function buy(type){
  const s=readState(),cfg={fuel:120,repair:180,beacon:650},cost=cfg[type];
  if(type==='use-repair'){
    if(s.repairKits<1)return toast('Você não possui Kit de Reparo.');
    if(s.shield>=100)return toast('A nave já está totalmente reparada.');
    s.repairKits--;s.shield=Math.min(100,s.shield+45);writeState(s);toast('Kit de Reparo usado.');setTimeout(()=>location.reload(),250);return;
  }
  if(!cost)return;
  if(s.credits<cost)return toast('Credits insuficientes.');
  if(type==='fuel'&&s.fuel>=s.maxFuel)return toast('Tanque já está cheio.');
  s.credits-=cost;
  if(type==='fuel')s.fuel=Math.min(s.maxFuel,s.fuel+250);
  if(type==='repair')s.repairKits++;
  if(type==='beacon')s.recoveryBeacons++;
  writeState(s);toast('Suprimento comprado.');setTimeout(()=>location.reload(),250);
}
function attach(){
  const market=document.querySelector('.tab[data-tab="market"]'),panel=$('panelContent');
  if(!market||!panel)return false;
  market.addEventListener('click',()=>{marketActive=true;setTimeout(render,0);setTimeout(render,60);},true);
  document.querySelectorAll('.tab:not([data-tab="market"])').forEach(btn=>btn.addEventListener('click',()=>{marketActive=false;},true));
  panel.addEventListener('click',e=>{const b=e.target.closest('[data-supply]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();buy(b.dataset.supply);},true);
  new MutationObserver(()=>{if(marketActive&&panel.textContent.includes('Market P2P'))render();}).observe(panel,{childList:true,subtree:true,characterData:true});
  return true;
}
let tries=0;const timer=setInterval(()=>{if(attach()||++tries>80)clearInterval(timer);},100);
})();
