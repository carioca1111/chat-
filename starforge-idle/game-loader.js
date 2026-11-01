(()=>{
'use strict';

const VERSION='1.6.2';
const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.body.appendChild(s);});
function replaceSafe(source,search,replacement,label){if(!source.includes(search)){console.warn(`[Starforge] Patch ignorado: ${label}`);return source;}return source.replace(search,replacement);}

(async()=>{
  try{
    let source=await fetch(`./game.js?v=${VERSION}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`game.js HTTP ${r.status}`);return r.text();});

    source=replaceSafe(source,
      "const defaults=()=>({credits:260,gems:35,inventory:{iron:0,nickel:0,cobalt:0,titanium:0,crystal:0},cargo:0,shipLevel:1,laserLevel:1,cargoLevel:1,efficiencyLevel:1,sector:'sol',subsector:'sol-a',mining:false,shield:100,sound:true,lastSeen:Date.now(),travel:null,killsInSub:0,autoRoam:true});",
      "const defaults=()=>({credits:260,gems:35,inventory:{iron:0,nickel:0,cobalt:0,titanium:0,crystal:0},cargo:0,shipLevel:1,laserLevel:1,cargoLevel:1,efficiencyLevel:1,sector:'sol',subsector:'sol-a',mining:false,shield:100,sound:true,lastSeen:Date.now(),travel:null,killsInSub:0,autoRoam:true,fuel:1000,maxFuel:1000,repairKits:0,recoveryBeacons:0});",
      'estado de suprimentos');

    source=replaceSafe(source,
      "const currentSector=()=>sectorById(state.sector),currentSub=()=>subById(state.subsector),cap=()=>100+(state.cargoLevel-1)*40,mineRate=()=>1+(state.laserLevel-1)*.35,laserDps=()=>18+state.laserLevel*5,efficiency=()=>1+(state.efficiencyLevel-1)*.05,asteroidCount=()=>Math.round(clamp(world.w*world.h/52000,innerWidth<700?11:18,innerWidth<700?16:28));",
      "const currentSector=()=>sectorById(state.sector),currentSub=()=>subById(state.subsector),cap=()=>100+(state.cargoLevel-1)*40,mineRate=()=>1+(state.laserLevel-1)*.35,laserDps=()=>18+state.laserLevel*5,laserRange=()=>52+(state.laserLevel-1)*24,laserStandOff=()=>Math.max(32,laserRange()-20),efficiency=()=>1+(state.efficiencyLevel-1)*.05,asteroidCount=()=>Math.round(clamp(world.w*world.h/52000,innerWidth<700?11:18,innerWidth<700?16:28));",
      'alcance do laser');
    source=replaceSafe(source,"desiredDist=t.r+118","desiredDist=t.r+laserStandOff()",'aproximação do laser');
    source=replaceSafe(source,
      "world.laser=dist(sh.x,sh.y,t.x,t.y)<=clamp(world.w*.31/world.camera.zoom,250,510)&&Math.abs(diff)<.82;",
      "world.laser=dist(sh.x,sh.y,t.x,t.y)<=t.r+laserRange()&&Math.abs(diff)<.82;",
      'alcance real do laser');

    source=replaceSafe(source,
      "function travelMetrics(destId,manual=true){const from=state.travel?subById(state.travel.to):currentSub(),to=subById(destId),d=Math.hypot(to.x-from.x,to.y-from.y),same=from.sector===to.sector;let seconds=same?25+d*1.8:60+d*3.4;if(!manual)seconds*=1.7;seconds=Math.round(clamp(seconds,same?24:60,same?95:420));return{seconds,cost:Math.round((same?28:95)+d*(same?2.2:6.2))};}",
      "function travelMetrics(destId,manual=true){const from=state.travel?subById(state.travel.to):currentSub(),to=subById(destId),d=Math.hypot(to.x-from.x,to.y-from.y),same=from.sector===to.sector;let seconds=same?25+d*1.8:60+d*3.4;if(!manual)seconds*=1.7;seconds=Math.round(clamp(seconds,same?24:60,same?95:420));return{seconds,cost:Math.round((same?28:95)+d*(same?2.2:6.2)),fuel:Math.round((same?8:55)+d*(same?.8:2.2))};}",
      'combustível de viagem');
    source=replaceSafe(source,
      "function startTravel(destId,manual=true){if(state.travel||destId===state.subsector)return;const m=travelMetrics(destId,manual),to=subById(destId);if(state.credits<m.cost)return toast(`Faltam ${fmt(m.cost-state.credits)} Credits para essa viagem.`);state.credits-=m.cost;state.mining=false;const now=Date.now();state.travel={from:state.subsector,fromSector:state.sector,to:destId,toSector:to.sector,startAt:now,endAt:now+m.seconds*1000,cost:m.cost,manual};world.target=null;world.laser=false;save();$('sectorModal').hidden=true;toast(`Rota iniciada · ${fmtTime(m.seconds)}.`);renderPanel();}",
      "function startTravel(destId,manual=true){if(state.travel||destId===state.subsector)return;const m=travelMetrics(destId,manual),to=subById(destId);state.fuel=Number.isFinite(state.fuel)?state.fuel:1000;state.maxFuel=Number.isFinite(state.maxFuel)?state.maxFuel:1000;if(state.credits<m.cost)return toast(`Faltam ${fmt(m.cost-state.credits)} Credits para essa viagem.`);if(state.fuel<m.fuel)return toast(`Combustível insuficiente. Faltam ${fmt(m.fuel-state.fuel)} unidades.`);state.credits-=m.cost;state.fuel-=m.fuel;state.mining=false;const now=Date.now();state.travel={from:state.subsector,fromSector:state.sector,to:destId,toSector:to.sector,startAt:now,endAt:now+m.seconds*1000,cost:m.cost,fuel:m.fuel,manual};world.target=null;world.laser=false;save();$('sectorModal').hidden=true;toast(`Rota iniciada · ${fmtTime(m.seconds)} · -${m.fuel} combustível.`);renderPanel();}",
      'consumo de combustível');
    source=replaceSafe(source,
      "function maybeAutoRoam(){if(!state.autoRoam||state.travel||!state.mining||state.killsInSub<10)return;const s=currentSector(),i=s.subs.findIndex(v=>v.id===state.subsector),d=s.subs[(i+1)%s.subs.length],m=travelMetrics(d.id,false);if(state.credits>=m.cost){state.killsInSub=0;startTravel(d.id,false);}}",
      "function maybeAutoRoam(){if(!state.autoRoam||state.travel||!state.mining||state.killsInSub<10)return;const s=currentSector(),i=s.subs.findIndex(v=>v.id===state.subsector),d=s.subs[(i+1)%s.subs.length],m=travelMetrics(d.id,false);state.fuel=Number.isFinite(state.fuel)?state.fuel:1000;if(state.credits>=m.cost&&state.fuel>=m.fuel){state.killsInSub=0;startTravel(d.id,false);}}",
      'auto-roam com combustível');

    const oldTravel="if(state.travel){const f=subById(state.travel.from),t=subById(state.travel.to),ang=Math.atan2(t.y-f.y,t.x-f.x),desired=46;sh.vx+=(Math.cos(ang)*desired-sh.vx)*Math.min(1,dt*1.2);sh.vy+=(Math.sin(ang)*desired-sh.vy)*Math.min(1,dt*1.2);sh.angle+=Math.atan2(Math.sin(ang-sh.angle),Math.cos(ang-sh.angle))*Math.min(1,dt*3);sh.x+=sh.vx*dt;sh.y+=sh.vy*dt;world.laser=false;emitExhaust(dt);return;}";
    const newTravel="if(state.travel){const f=subById(state.travel.from),t=subById(state.travel.to),ang=Math.atan2(t.y-f.y,t.x-f.x),inter=state.travel.fromSector!==state.travel.toSector,desired=inter?142:96,accel=inter?3.0:2.5;sh.vx+=(Math.cos(ang)*desired-sh.vx)*Math.min(1,dt*accel);sh.vy+=(Math.sin(ang)*desired-sh.vy)*Math.min(1,dt*accel);sh.angle+=Math.atan2(Math.sin(ang-sh.angle),Math.cos(ang-sh.angle))*Math.min(1,dt*(inter?5:4));sh.x+=sh.vx*dt;sh.y+=sh.vy*dt;world.laser=false;emitExhaust(dt);return;}";
    source=replaceSafe(source,oldTravel,newTravel,'velocidade de cruzeiro');
    source=replaceSafe(source,
      "const desiredTrail=state.travel?108:(state.mining?(world.laser?52:72):42),ta=1-Math.exp(-2.2*dt);",
      "const desiredTrail=state.travel?(state.travel.fromSector!==state.travel.toSector?175:132):(state.mining?(world.laser?52:72):42),ta=1-Math.exp(-2.2*dt);",
      'câmera de cruzeiro');

    source=replaceSafe(source,
      "function hitShip(dmg){const sh=world.ship;if(sh.hitTimer>0)return;sh.hitTimer=.55;state.shield=clamp(state.shield-dmg,0,100);world.shake=1.8;burst(sh.x,sh.y,10,'#75dfff');if(state.shield<=0){state.mining=false;sh.recoveryTimer=3.2;toast('Shield colapsou. Sistema em recuperação.');}save();}",
      "function hitShip(dmg){const sh=world.ship;if(sh.hitTimer>0)return;sh.hitTimer=.55;state.shield=clamp(state.shield-dmg,0,100);world.shake=1.8;burst(sh.x,sh.y,10,'#75dfff');if(state.shield<=0){if((state.recoveryBeacons||0)>0){state.recoveryBeacons--;state.shield=65;sh.recoveryTimer=1.15;toast('Recovery Beacon ativado · nave estabilizada em 65%.');if(activeTab==='market')renderPanel();}else{state.mining=false;sh.recoveryTimer=3.2;toast('Shield colapsou. Sem Recovery Beacon: sistema em recuperação.');}}save();}",
      'Recovery Beacon');

    const oldMarket="else panelContent.innerHTML=`<div class=\"panel-title\"><h2>Market P2P</h2><span>SIMULADO</span></div><p class=\"market-note\">Nenhum depósito ou saque real está ativo nesta Alpha.</p><div class=\"market-card\"><div><strong>20 Titanium</strong><span>Ordem de compra</span></div><b>120 Gems</b><button data-action=\"ms\">Vender</button></div>`;}";
    const newMarket="else{state.fuel=Number.isFinite(state.fuel)?state.fuel:1000;state.maxFuel=Number.isFinite(state.maxFuel)?state.maxFuel:1000;state.repairKits=state.repairKits||0;state.recoveryBeacons=state.recoveryBeacons||0;panelContent.innerHTML=`<div class=\"panel-title\"><h2>Suprimentos</h2><span>LOJA DO SISTEMA</span></div><p class=\"market-note\">Consumíveis operacionais. Credits gastos aqui saem permanentemente da economia.</p><div class=\"market-card\"><div><strong>⛽ Combustível</strong><span>${fmt(state.fuel)} / ${fmt(state.maxFuel)} · usado em viagens</span></div><b>120 C</b><button data-action=\"buy-fuel\" ${state.fuel>=state.maxFuel?'disabled':''}>COMPRAR +250</button></div><div class=\"market-card\"><div><strong>🔧 Kit de Reparo</strong><span>Estoque: ${state.repairKits} · recupera 45% do escudo</span></div><b>180 C</b><button data-action=\"buy-repair\">COMPRAR</button>${state.repairKits>0&&state.shield<100?'<button data-action=\"use-repair\">USAR KIT</button>':''}</div><div class=\"market-card\"><div><strong>📡 Recovery Beacon</strong><span>Estoque: ${state.recoveryBeacons} · ativa automaticamente ao colapsar</span></div><b>650 C</b><button data-action=\"buy-beacon\">COMPRAR</button></div>`;}";
    source=replaceSafe(source,oldMarket,newMarket,'Suprimentos');
    source=replaceSafe(source,
      "function marketSell(){if(state.inventory.titanium<20)return toast('Você precisa de 20 Titanium.');state.inventory.titanium-=20;state.cargo-=20*RES.titanium.size;state.gems+=108;save();renderPanel();}",
      "function marketSell(){toast('O Market P2P foi separado da loja de Suprimentos.');}function buySupply(type){const cfg={fuel:{cost:120},repair:{cost:180},beacon:{cost:650}}[type];if(!cfg)return;if(state.credits<cfg.cost)return toast('Credits insuficientes.');state.credits-=cfg.cost;if(type==='fuel'){state.fuel=Number.isFinite(state.fuel)?state.fuel:1000;state.maxFuel=Number.isFinite(state.maxFuel)?state.maxFuel:1000;state.fuel=Math.min(state.maxFuel,state.fuel+250);}if(type==='repair')state.repairKits=(state.repairKits||0)+1;if(type==='beacon')state.recoveryBeacons=(state.recoveryBeacons||0)+1;save();renderPanel();toast('Suprimento comprado.');}function useRepairKit(){if(!(state.repairKits>0))return toast('Você não possui Kit de Reparo.');if(state.shield>=100)return toast('A nave não precisa de reparo.');state.repairKits--;state.shield=Math.min(100,state.shield+45);world.ship.recoveryTimer=0;save();renderPanel();toast('Kit de Reparo usado · +45% de integridade.');}",
      'ações de suprimentos');
    source=replaceSafe(source,
      "panelContent.onclick=e=>{const u=e.target.closest('[data-upgrade]');if(u)return upgrade(u.dataset.upgrade);const a=e.target.closest('[data-action]')?.dataset.action;if(a==='sell')sellCargo();if(a==='ms')marketSell();};",
      "panelContent.onclick=e=>{const u=e.target.closest('[data-upgrade]');if(u)return upgrade(u.dataset.upgrade);const a=e.target.closest('[data-action]')?.dataset.action;if(a==='sell')sellCargo();if(a==='ms')marketSell();if(a==='buy-fuel')buySupply('fuel');if(a==='buy-repair')buySupply('repair');if(a==='buy-beacon')buySupply('beacon');if(a==='use-repair')useRepairKit();};",
      'cliques de suprimentos');
    source=replaceSafe(source,
      "else{button.disabled=state.credits<m.cost;button.textContent=`ENVIAR NAVE · ${fmt(m.cost)} C · ${fmtTime(m.seconds)}`;}}",
      "else{state.fuel=Number.isFinite(state.fuel)?state.fuel:1000;button.disabled=state.credits<m.cost||state.fuel<m.fuel;button.textContent=`ENVIAR NAVE · ${fmt(m.cost)} C · ${m.fuel} combustível · ${fmtTime(m.seconds)}`;}}",
      'mapa com combustível');
    source=replaceSafe(source,
      "$('credits').textContent=fmt(state.credits);$('gems').textContent=fmt(state.gems);",
      "$('credits').textContent=fmt(state.credits);$('gems').textContent=fmt(state.gems);state.fuel=Number.isFinite(state.fuel)?state.fuel:1000;state.maxFuel=Number.isFinite(state.maxFuel)?state.maxFuel:1000;if($('fuelValue'))$('fuelValue').textContent=`${fmt(state.fuel)} / ${fmt(state.maxFuel)}`;",
      'HUD combustível');
    source=source.replace("[['laser','Laser','quebra mais rápido']","[['laser','Laser','mais dano + mais alcance']");
    source=source.replace("<div class=\"stat-card\"><span>LASER</span><b>${mineRate().toFixed(2)}x</b></div>","<div class=\"stat-card\"><span>LASER</span><b>${mineRate().toFixed(2)}x · ${typeof laserRange==='function'?laserRange():52}u</b></div>");

    new Function(`${source}\n//# sourceURL=starforge-game-patched.js`)();
  }catch(err){console.error('[Starforge] Falha grave no loader; carregando motor original.',err);await loadScript(`./game.js?v=${VERSION}`);}

  for(const file of[`./dashboard.js?v=${VERSION}`,`./travel-effects.js?v=${VERSION}`,`./mobile-ui.js?v=${VERSION}`]){try{await loadScript(file);}catch(err){console.error('[Starforge] Falha ao carregar',file,err);}}
})();
})();
