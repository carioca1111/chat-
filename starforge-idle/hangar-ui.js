(()=>{
'use strict';

const SAVE_KEY='starforge-alpha-1.0';
const HANGAR_KEY='starforge-hangar-alpha-1.8';
const CORE_SLOTS=new Set(['laser','cargo','efficiency']);
const SLOT_META={
  laser:{label:'Laser',icon:'⚡',accept:'laser'},
  cargo:{label:'Carga',icon:'▦',accept:'cargo'},
  efficiency:{label:'Eficiência',icon:'⌬',accept:'efficiency'},
  engine:{label:'Motor',icon:'◈',accept:'engine'},
  shield:{label:'Shield',icon:'⬡',accept:'shield'},
  utility:{label:'Utilitário',icon:'⌖',accept:'utility'}
};
const nav=document.getElementById('navFleet');
if(!nav)return;
nav.innerHTML='▰ <span>Hangar</span>';

const $=s=>document.querySelector(s);
const readGame=()=>{try{return JSON.parse(localStorage.getItem(SAVE_KEY)||'{}')}catch{return{}}};
const writeGame=s=>localStorage.setItem(SAVE_KEY,JSON.stringify(s));
const fmt=n=>Math.floor(Number(n)||0).toLocaleString('pt-BR');
const uid=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

function item({id=uid(),type,name,icon,level=1,rarity='Comum',desc='',stats=[]}){
  return {id,type,name,icon,level,rarity,desc,stats};
}
function baseInventory(){
  return [
    item({id:'starter-laser',type:'laser',name:'Laser Curto Mk I',icon:'⚡',level:1,desc:'Modelo inicial de curto alcance.',stats:['Alcance 52u','Dano básico']}),
    item({id:'starter-cargo',type:'cargo',name:'Carga Compacta Mk I',icon:'▦',level:1,desc:'Compartimento básico de carga.',stats:['100 espaços']}),
    item({id:'starter-eff',type:'efficiency',name:'Núcleo Econômico Mk I',icon:'⌬',level:1,desc:'Núcleo simples de eficiência.',stats:['Eficiência base']}),
    item({id:'engine-cruise',type:'engine',name:'Motor de Cruzeiro Mk I',icon:'◈',level:1,rarity:'Incomum',desc:'Motor equilibrado para viagens.',stats:['+10% velocidade de cruzeiro']}),
    item({id:'engine-eco',type:'engine',name:'Motor Econômico Mk I',icon:'◈',level:1,desc:'Menor consumo, aceleração mais conservadora.',stats:['-12% consumo de combustível']}),
    item({id:'shield-basic',type:'shield',name:'Gerador de Shield Mk I',icon:'⬡',level:1,rarity:'Incomum',desc:'Gerador defensivo básico.',stats:['+10% resistência estrutural']}),
    item({id:'scanner-basic',type:'utility',name:'Scanner Mineral Mk I',icon:'⌖',level:1,rarity:'Incomum',desc:'Analisa asteroides antes da aproximação.',stats:['Scanner mineral básico']})
  ];
}
function currentCoreItem(type,level){
  const map={
    laser:['Laser de Mineração','⚡',`Alcance ${52+(level-1)*24}u · dano escalado`],
    cargo:['Compartimento de Carga','▦',`${100+(level-1)*40} espaços`],
    efficiency:['Núcleo de Eficiência','⌬',`+${Math.max(0,(level-1)*5)}% eficiência`]
  };
  const [name,icon,desc]=map[type];
  return item({id:`legacy-${type}-${level}`,type,name:`${name} Mk ${roman(level)}`,icon,level,rarity:level>=6?'Raro':level>=3?'Incomum':'Comum',desc:'Migrado do progresso anterior.',stats:[desc]});
}
function roman(n){
  const vals=[[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; let out='',x=Math.max(1,Math.min(20,Math.floor(n)||1));
  for(const [v,s] of vals) while(x>=v){out+=s;x-=v}
  return out;
}
function readMeta(){
  try{
    const m=JSON.parse(localStorage.getItem(HANGAR_KEY)||'null');
    if(m&&m.version===1&&m.equipped&&Array.isArray(m.inventory)) return m;
  }catch{}
  const s=readGame();
  const m={
    version:1,
    equipped:{
      laser:currentCoreItem('laser',s.laserLevel||1),
      cargo:currentCoreItem('cargo',s.cargoLevel||1),
      efficiency:currentCoreItem('efficiency',s.efficiencyLevel||1),
      engine:null,shield:null,utility:null
    },
    inventory:baseInventory(),
    selected:null
  };
  saveMeta(m);
  return m;
}
function saveMeta(m){localStorage.setItem(HANGAR_KEY,JSON.stringify(m))}
function syncCore(meta){
  const s=readGame();
  for(const slot of CORE_SLOTS){
    const eq=meta.equipped[slot];
    const lv=eq?.level||1;
    if(slot==='laser')s.laserLevel=lv;
    if(slot==='cargo')s.cargoLevel=lv;
    if(slot==='efficiency')s.efficiencyLevel=lv;
  }
  writeGame(s);
}
function toast(msg){
  const t=document.getElementById('toast');
  if(!t)return;
  t.textContent=msg;t.classList.add('show');
  clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),1800);
}

const style=document.createElement('style');
style.textContent=`
.hangar-backdrop{position:absolute;inset:0;z-index:82;display:grid;place-items:center;padding:10px;background:rgba(0,3,9,.9);backdrop-filter:blur(9px)}.hangar-backdrop[hidden]{display:none}
.hangar-shell{width:min(1440px,98vw);height:min(880px,96dvh);display:grid;grid-template-rows:62px minmax(0,1fr);overflow:hidden;border:1px solid rgba(66,220,255,.4);border-radius:14px;background:linear-gradient(180deg,#081728,#030a13);box-shadow:0 25px 90px rgba(0,0,0,.65),inset 0 1px rgba(255,255,255,.04)}
.hangar-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(66,220,255,.2)}.hangar-head small{display:block;color:#36e7ff;font-size:8px;font-weight:900;letter-spacing:.14em}.hangar-head h2{margin:2px 0 0;font-size:20px}.hangar-close{width:38px;height:38px;border:1px solid rgba(66,220,255,.3);border-radius:8px;background:#0a1b2d;font-size:20px}
.hangar-body{min-height:0;display:grid;grid-template-columns:270px minmax(0,1.15fr) minmax(330px,.85fr);gap:10px;padding:10px}.hangar-card{min-height:0;border:1px solid rgba(66,220,255,.18);border-radius:11px;background:rgba(7,21,35,.78);padding:11px;overflow:auto}.hangar-title{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px}.hangar-title strong{font-size:11px}.hangar-title span{font-size:8px;color:#89a7ba}
.hangar-ship-view{height:200px;display:grid;place-items:center;position:relative;overflow:hidden;border:1px solid rgba(66,220,255,.15);border-radius:10px;background:radial-gradient(circle,rgba(54,231,255,.09),transparent 48%),linear-gradient(#06111f,#02060c)}.hangar-ship-view:before{content:"";position:absolute;inset:0;background-image:radial-gradient(#dffcff 0 1px,transparent 1.2px);background-size:34px 34px;opacity:.22}.hangar-ship-icon{position:relative;font-size:78px;filter:drop-shadow(0 0 16px rgba(54,231,255,.32))}.hangar-ship-name{text-align:center;margin:10px 0}.hangar-ship-name b{display:block;font-size:15px}.hangar-ship-name span{font-size:8px;color:#89a7ba}
.hangar-bars{display:grid;gap:8px}.hangar-barline{display:grid;grid-template-columns:52px 1fr 58px;gap:7px;align-items:center;font-size:8px}.hangar-meter{height:8px;border:1px solid rgba(66,220,255,.24);border-radius:99px;background:#07111c;overflow:hidden}.hangar-meter i{display:block;height:100%;background:linear-gradient(90deg,#4f8fff,#36e7ff)}
.equip-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.equip-slot{min-height:102px;padding:8px;border:1px dashed rgba(66,220,255,.26);border-radius:10px;background:rgba(255,255,255,.018);transition:.14s}.equip-slot.drop-ok{border-color:#42e59b;background:rgba(66,229,155,.08);box-shadow:inset 0 0 25px rgba(66,229,155,.07)}.equip-slot.drop-bad{border-color:#ff6582;background:rgba(255,101,130,.05)}.slot-label{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:8px;color:#89a7ba}.slot-label b{color:#edfaff;font-size:9px}.slot-empty{height:62px;display:grid;place-items:center;text-align:center;color:#627f91;font-size:8px}
.module-item{display:grid;grid-template-columns:42px 1fr;gap:8px;align-items:center;padding:8px;border:1px solid rgba(66,220,255,.2);border-radius:9px;background:#071827;cursor:grab;user-select:none}.module-item:active{cursor:grabbing}.module-item.selected{border-color:#36e7ff;box-shadow:0 0 0 1px rgba(54,231,255,.25),inset 0 0 22px rgba(54,231,255,.08)}.module-item.dragging{opacity:.42}.module-icon{width:42px;height:42px;display:grid;place-items:center;border:1px solid rgba(66,220,255,.24);border-radius:8px;background:#0a1d2e;font-size:20px}.module-item b,.module-item span,.module-item small{display:block}.module-item b{font-size:9px}.module-item span,.module-item small{font-size:7px;color:#89a7ba;margin-top:2px}.rarity-Incomum{color:#42e59b!important}.rarity-Raro{color:#a05cff!important}
.inventory-zone{min-height:240px;border:1px dashed rgba(66,220,255,.18);border-radius:10px;padding:8px;transition:.14s}.inventory-zone.drop-ok{border-color:#42e59b;background:rgba(66,229,155,.05)}.inventory-grid{display:grid;grid-template-columns:1fr;gap:7px}.inventory-empty{padding:35px 10px;text-align:center;color:#6d899a;font-size:8px}
.item-details{margin-top:10px;padding:10px;border:1px solid rgba(66,220,255,.15);border-radius:9px;background:rgba(255,255,255,.02)}.item-details h3{margin:0 0 4px;font-size:12px}.item-details p{font-size:8px;color:#89a7ba;line-height:1.45}.item-stats{display:grid;gap:4px;margin:8px 0}.item-stat{padding:5px 7px;border-radius:6px;background:#081b2b;font-size:8px;color:#b9deef}.item-actions{display:flex;gap:6px;flex-wrap:wrap}.item-actions button,.hangar-service button{border:1px solid rgba(66,220,255,.4);border-radius:7px;background:#0d2a40;padding:7px 9px;font-size:8px;font-weight:900}.item-actions button:disabled{opacity:.45}.danger-btn{border-color:rgba(255,101,130,.4)!important;color:#ff91a7}
.hangar-help{font-size:8px;line-height:1.5;color:#89a7ba;padding:8px;border:1px dashed rgba(66,220,255,.18);border-radius:8px;margin-bottom:9px}.hangar-help b{color:#36e7ff}.hangar-credit{color:#ffcf68}.compare{margin-top:7px;font-size:8px;color:#89a7ba}.compare strong{color:#edfaff}.selected-hint{color:#ffcf68!important;font-weight:900}
.hangar-service{padding:9px;margin-top:8px;border:1px solid rgba(66,220,255,.15);border-radius:9px;background:rgba(255,255,255,.025)}.hangar-service-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.hangar-service b,.hangar-service span{display:block}.hangar-service b{font-size:9px}.hangar-service span{font-size:7px;color:#89a7ba;margin-top:3px}
@media(max-width:980px){.hangar-body{grid-template-columns:1fr;overflow:auto}.hangar-shell{height:96dvh}.hangar-card{overflow:visible}.equip-grid{grid-template-columns:1fr 1fr}.inventory-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:620px){.equip-grid,.inventory-grid{grid-template-columns:1fr}.hangar-ship-view{height:150px}}
`;
document.head.appendChild(style);

const modal=document.createElement('div');
modal.className='hangar-backdrop';
modal.hidden=true;
modal.innerHTML=`<section class="hangar-shell" role="dialog" aria-modal="true" aria-labelledby="hangarTitle">
<header class="hangar-head"><div><small>DOCA DE EQUIPAMENTOS · STARFORGE</small><h2 id="hangarTitle">Hangar · Drag & Drop</h2></div><button class="hangar-close" type="button" aria-label="Fechar">×</button></header>
<div class="hangar-body"><section class="hangar-card" id="hangarShip"></section><section class="hangar-card" id="hangarEquipment"></section><section class="hangar-card" id="hangarInventory"></section></div></section>`;
document.getElementById('gameApp').appendChild(modal);

let meta=readMeta();
let selected=null;
let dragPayload=null;

function itemHTML(it,location,slot=''){
  if(!it)return '';
  return `<article class="module-item ${selected?.id===it.id?'selected':''}" draggable="true" data-item-id="${it.id}" data-item-location="${location}" ${slot?`data-item-slot="${slot}"`:''}>
    <div class="module-icon">${it.icon}</div>
    <div><b>${it.name}</b><span class="rarity-${it.rarity}">${it.rarity} · Nv. ${it.level}</span><small>${it.stats?.[0]||it.desc||''}</small></div>
  </article>`;
}
function renderShip(){
  const s=readGame(),shield=Math.max(0,Math.min(100,Number(s.shield??100))),fuel=Number.isFinite(s.fuel)?s.fuel:1000,maxFuel=Number.isFinite(s.maxFuel)?s.maxFuel:1000;
  const cargoLv=meta.equipped.cargo?.level||1,cap=100+(cargoLv-1)*40,cargo=Math.max(0,Number(s.cargo||0));
  $('#hangarShip').innerHTML=`<div class="hangar-title"><strong>NAVE ATIVA</strong><span>Rusty Miner I</span></div>
  <div class="hangar-ship-view"><div class="hangar-ship-icon">🚀</div></div><div class="hangar-ship-name"><b>Rusty Miner I</b><span>Arraste módulos para montar a configuração da nave.</span></div>
  <div class="hangar-bars">
   <div class="hangar-barline"><span>Shield</span><div class="hangar-meter"><i style="width:${shield}%"></i></div><b>${Math.round(shield)}%</b></div>
   <div class="hangar-barline"><span>Carga</span><div class="hangar-meter"><i style="width:${Math.min(100,cargo/cap*100)}%"></i></div><b>${fmt(cargo)}/${fmt(cap)}</b></div>
   <div class="hangar-barline"><span>Fuel</span><div class="hangar-meter"><i style="width:${Math.min(100,fuel/maxFuel*100)}%"></i></div><b>${fmt(fuel)}</b></div>
  </div>
  <div class="hangar-service"><div class="hangar-service-row"><div><b>Configuração equipada</b><span>${Object.values(meta.equipped).filter(Boolean).length} / 6 slots ocupados</span></div><b class="hangar-credit">${fmt(s.credits||0)} C</b></div></div>`;
}
function renderEquipment(){
  $('#hangarEquipment').innerHTML=`<div class="hangar-title"><strong>SLOTS DA NAVE</strong><span class="${selected?'selected-hint':''}">${selected?'CLIQUE EM UM SLOT COMPATÍVEL':'ARRASTE PARA EQUIPAR'}</span></div>
  <div class="hangar-help"><b>Desktop:</b> arraste o item. <b>Mobile:</b> toque no item e depois no slot. Ao substituir, o módulo antigo volta para o inventário.</div>
  <div class="equip-grid">${Object.entries(SLOT_META).map(([slot,sm])=>`<section class="equip-slot" data-slot="${slot}" data-accept="${sm.accept}">
    <div class="slot-label"><b>${sm.icon} ${sm.label}</b><span>${sm.accept.toUpperCase()}</span></div>
    ${meta.equipped[slot]?itemHTML(meta.equipped[slot],'slot',slot):`<div class="slot-empty">SOLTE UM MÓDULO<br>AQUI</div>`}
  </section>`).join('')}</div>`;
}
function renderInventory(){
  const sel=findItem(selected);
  $('#hangarInventory').innerHTML=`<div class="hangar-title"><strong>INVENTÁRIO DE MÓDULOS</strong><span>${meta.inventory.length} itens</span></div>
  <div class="inventory-zone" id="hangarInventoryZone"><div class="inventory-grid">${meta.inventory.length?meta.inventory.map(it=>itemHTML(it,'inventory')).join(''):'<div class="inventory-empty">Nenhum módulo guardado.</div>'}</div></div>
  ${detailsHTML(sel)}`;
}
function findItem(ref){
  if(!ref)return null;
  if(ref.location==='inventory')return meta.inventory.find(x=>x.id===ref.id)||null;
  if(ref.location==='slot')return meta.equipped[ref.slot]||null;
  return null;
}
function detailsHTML(it){
  if(!it)return `<div class="item-details"><h3>Selecione um módulo</h3><p>Veja detalhes, compare e equipe itens arrastando-os para os slots da nave.</p></div>`;
  const slot=Object.keys(SLOT_META).find(k=>SLOT_META[k].accept===it.type);
  const equipped=meta.equipped[slot];
  const compare=equipped&&equipped.id!==it.id?`<div class="compare">Comparando com <strong>${equipped.name}</strong> · Nv. ${equipped.level}</div>`:'';
  const canUpgrade=selected?.location==='slot'&&CORE_SLOTS.has(selected.slot);
  return `<div class="item-details"><h3>${it.icon} ${it.name}</h3><p><span class="rarity-${it.rarity}">${it.rarity}</span> · ${it.desc||'Módulo da nave.'}</p>
  <div class="item-stats">${(it.stats||[]).map(s=>`<div class="item-stat">${s}</div>`).join('')}</div>${compare}
  <div class="item-actions">${selected?.location==='inventory'?`<button data-equip-selected="${slot}">EQUIPAR</button>`:''}
  ${selected?.location==='slot'&&!CORE_SLOTS.has(selected.slot)?'<button class="danger-btn" data-unequip-selected>DESEQUIPAR</button>':''}
  ${canUpgrade?`<button data-upgrade-selected="${selected.slot}">MELHORAR MÓDULO</button>`:''}</div></div>`;
}
function render(){meta=readMeta();renderShip();renderEquipment();renderInventory();bindDraggables()}
function bindDraggables(){
  modal.querySelectorAll('.module-item').forEach(el=>{
    el.addEventListener('dragstart',e=>{
      dragPayload={location:el.dataset.itemLocation,id:el.dataset.itemId,slot:el.dataset.itemSlot||null};
      selected={...dragPayload};el.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      try{e.dataTransfer.setData('text/plain',JSON.stringify(dragPayload))}catch{}
      highlightSlots(itemTypeFromPayload(dragPayload));
    });
    el.addEventListener('dragend',()=>{dragPayload=null;clearDropClasses();render()});
    el.addEventListener('click',e=>{e.stopPropagation();selected={location:el.dataset.itemLocation,id:el.dataset.itemId,slot:el.dataset.itemSlot||null};render()});
  });
}
function itemTypeFromPayload(p){return findPayloadItem(p)?.type||''}
function findPayloadItem(p){
  if(!p)return null;
  if(p.location==='inventory')return meta.inventory.find(x=>x.id===p.id)||null;
  if(p.location==='slot')return meta.equipped[p.slot]||null;
  return null;
}
function highlightSlots(type){
  modal.querySelectorAll('.equip-slot').forEach(s=>s.classList.toggle('drop-ok',s.dataset.accept===type));
}
function clearDropClasses(){modal.querySelectorAll('.drop-ok,.drop-bad').forEach(e=>e.classList.remove('drop-ok','drop-bad'))}
function equipPayload(p,slot){
  const it=findPayloadItem(p);
  if(!it)return;
  if(SLOT_META[slot].accept!==it.type){toast('Esse módulo não é compatível com este slot.');return}
  if(p.location==='slot'&&p.slot===slot)return;
  if(p.location==='inventory')meta.inventory=meta.inventory.filter(x=>x.id!==it.id);
  else if(p.location==='slot')meta.equipped[p.slot]=null;
  const old=meta.equipped[slot];
  if(old)meta.inventory.push(old);
  meta.equipped[slot]=it;
  selected={location:'slot',id:it.id,slot};
  saveMeta(meta);
  syncCore(meta);
  toast(`${it.name} equipado.`);
  render();
}
function unequipSlot(slot){
  if(CORE_SLOTS.has(slot)){toast('Laser, Carga e Eficiência precisam permanecer equipados. Troque por outro módulo compatível.');return}
  const it=meta.equipped[slot];if(!it)return;
  meta.equipped[slot]=null;meta.inventory.push(it);selected={location:'inventory',id:it.id,slot:null};saveMeta(meta);toast(`${it.name} desequipado.`);render();
}
function coreUpgrade(slot){
  const shipTab=document.querySelector('.tab[data-tab="ship"]');if(!shipTab)return;
  const before=readGame();
  shipTab.click();
  requestAnimationFrame(()=>{
    const btn=document.querySelector(`#panelContent [data-upgrade="${slot}"]`);
    if(!btn){toast('Upgrade indisponível agora.');render();return}
    btn.click();
    setTimeout(()=>{
      const after=readGame(),key=slot==='laser'?'laserLevel':slot==='cargo'?'cargoLevel':'efficiencyLevel';
      const lv=after[key]||before[key]||1;
      if(meta.equipped[slot]){
        meta.equipped[slot].level=lv;
        meta.equipped[slot].name=meta.equipped[slot].name.replace(/Mk\s+[IVX]+$/i,`Mk ${roman(lv)}`);
        if(slot==='laser')meta.equipped[slot].stats=[`Alcance ${52+(lv-1)*24}u`,`Dano escalado`];
        if(slot==='cargo')meta.equipped[slot].stats=[`${100+(lv-1)*40} espaços`];
        if(slot==='efficiency')meta.equipped[slot].stats=[`+${Math.max(0,(lv-1)*5)}% eficiência`];
        saveMeta(meta);
      }
      toast(`Módulo melhorado para Nv. ${lv}.`);render();
    },80);
  });
}

modal.addEventListener('dragover',e=>{
  const slot=e.target.closest('.equip-slot'),inv=e.target.closest('#hangarInventoryZone');
  if(slot||inv)e.preventDefault();
  if(slot&&dragPayload){
    const ok=slot.dataset.accept===itemTypeFromPayload(dragPayload);
    slot.classList.toggle('drop-ok',ok);slot.classList.toggle('drop-bad',!ok);
  }
  if(inv&&dragPayload?.location==='slot'&&!CORE_SLOTS.has(dragPayload.slot))inv.classList.add('drop-ok');
});
modal.addEventListener('dragleave',e=>{const slot=e.target.closest('.equip-slot');if(slot)slot.classList.remove('drop-bad')});
modal.addEventListener('drop',e=>{
  e.preventDefault();
  const slot=e.target.closest('.equip-slot'),inv=e.target.closest('#hangarInventoryZone');
  if(slot&&dragPayload)equipPayload(dragPayload,slot.dataset.slot);
  else if(inv&&dragPayload?.location==='slot')unequipSlot(dragPayload.slot);
  dragPayload=null;clearDropClasses();
});
modal.addEventListener('click',e=>{
  if(e.target===modal){modal.hidden=true;return}
  const slot=e.target.closest('.equip-slot');
  if(slot&&selected){
    const it=findItem(selected);
    if(it&&slot.dataset.accept===it.type&&!(selected.location==='slot'&&selected.slot===slot.dataset.slot)){equipPayload(selected,slot.dataset.slot);return}
  }
  const eq=e.target.closest('[data-equip-selected]');if(eq&&selected){equipPayload(selected,eq.dataset.equipSelected);return}
  if(e.target.closest('[data-unequip-selected]')&&selected?.location==='slot'){unequipSlot(selected.slot);return}
  const up=e.target.closest('[data-upgrade-selected]');if(up){coreUpgrade(up.dataset.upgradeSelected);return}
});
nav.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();meta=readMeta();selected=null;render();modal.hidden=false},true);
modal.querySelector('.hangar-close').addEventListener('click',()=>modal.hidden=true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)modal.hidden=true});

})();