(() => {
'use strict';

const $=id=>document.getElementById(id);
const canvas=$('spaceCanvas'), ctx=canvas.getContext('2d',{alpha:false});
const panelContent=$('panelContent'), mineButton=$('mineButton');

const SAVE_KEY='starforge-alpha-0.8';
const OLD_KEYS=['starforge-alpha-0.7','starforge-alpha-0.6','starforge-alpha-0.1'];
const RES={
  iron:['Iron Ore',3,1],
  nickel:['Nickel',7,2],
  cobalt:['Cobalt',13,3],
  titanium:['Titanium',28,4],
  crystal:['Crystal',65,6]
};
const SECTORS=[
  ['sol','Sol Belt',0,1,'Órbita segura · minérios básicos'],
  ['red','Red Veil',1400,1.7,'Nebulosa hostil · mais Titanium'],
  ['void','Void Reach',5200,2.8,'Fronteira profunda · Crystal abundante']
];
const SVG={
  ship:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 92"><g stroke="#07101a" stroke-width="5" stroke-linejoin="round"><path fill="#273241" d="M50 7 66 35 86 45 73 68 60 61 57 82 43 82 40 61 27 68 14 45 34 35Z"/><path fill="#364455" d="M50 14 59 39 50 55 41 39Z"/><path fill="#5ee9ff" d="M50 21 55 39 50 47 45 39Z"/><path fill="#45ddff" d="M18 45h16v6H18zm48 0h16v6H66z"/></g></svg>`,
  rock:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112"><path fill="#303846" stroke="#121820" stroke-width="6" d="M21 14 48 5 79 9 105 28 114 56 103 85 78 105 44 107 14 91 5 61 9 35Z"/><path fill="#424b59" d="m21 14 30 9 20-14 22 22-18 20-28-6-18 18-20-28Z"/><g fill="#171d25"><ellipse cx="81" cy="35" rx="12" ry="9"/><ellipse cx="37" cy="74" rx="11" ry="9"/><ellipse cx="84" cy="78" rx="8" ry="6"/></g></svg>`,
  crystal:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 104"><path fill="#303946" stroke="#111820" stroke-width="6" d="M18 12 48 5 78 11 103 31 107 61 91 88 61 99 28 92 7 69 6 39Z"/><path fill="#404b59" d="m18 12 30 9 17-10 24 21-14 19-24-2-18 18-24-17 5-19Z"/><path d="M24 75 38 57 51 61 62 43 78 48 93 27" fill="none" stroke="#3ee9ff" stroke-width="5"/><g fill="#4de7ff"><path d="m76 25 10-14 7 18-9 9Z"/><path d="m31 73 8-12 7 14-8 9Z"/><path d="m66 70 9-14 8 18-10 8Z"/></g></svg>`,
  frag:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 46"><path fill="#3a4452" stroke="#141b24" stroke-width="4" d="m7 11 19-7 16 12-4 20-18 6L5 30Z"/><path fill="#505b69" d="m10 13 16-5 7 10-12 10-12-4Z"/></svg>`,
  hit:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path fill="#4de7ff" stroke="#dffcff" stroke-width="3" d="m40 5 7 22 20-9-12 19 20 8-22 5 7 21-16-15-12 19 1-23-23 3 19-13-17-15 22 6Z"/><circle cx="40" cy="41" r="8" fill="#fff"/></svg>`
};

let assets={}, activeTab='cargo', toastTimer=0, audio=null, last=performance.now(), nextId=1;
const defaults=()=>({
  credits:260,gems:35,inventory:{iron:0,nickel:0,cobalt:0,titanium:0,crystal:0},
  cargo:0,shipLevel:1,laserLevel:1,cargoLevel:1,efficiencyLevel:1,
  sector:'sol',mining:false,shield:100,sound:true,lastSeen:Date.now()
});
function load(){
  try{
    let raw=localStorage.getItem(SAVE_KEY);
    if(!raw) for(const k of OLD_KEYS){ raw=localStorage.getItem(k); if(raw) break; }
    if(!raw) return defaults();
    const p=JSON.parse(raw), d=defaults(), s={...d,...p,inventory:{...d.inventory,...(p.inventory||{})}};
    s.cargo=Object.entries(s.inventory).reduce((n,[k,q])=>n+(RES[k]?.[2]||1)*Math.max(0,q||0),0);
    s.shield=Number.isFinite(p.shield)?p.shield:100;
    return s;
  }catch{return defaults();}
}
let state=load();

const world={
  w:innerWidth,h:innerHeight,dpr:1,time:0,shake:0,zoom:1,targetZoom:1,
  asteroids:[],fragments:[],particles:[],exhaust:[],target:null,
  spawnTimer:0,laser:false,particleTimer:0,exhaustTimer:0,dangerText:'ROTA SEGURA',
  camera:{x:0,y:0,vx:0,vy:0},
  ship:{x:0,y:0,vx:0,vy:0,angle:-Math.PI/2,avoidX:0,avoidY:0,dodgeHold:0,threatId:0,dodgeSide:0,hitTimer:0,recoveryTimer:0}
};

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const dist=(ax,ay,bx,by)=>Math.hypot(ax-bx,ay-by);
const fmt=n=>Math.floor(n).toLocaleString('pt-BR');
const sec=()=>SECTORS.find(x=>x[0]===state.sector)||SECTORS[0];
const cap=()=>100+(state.cargoLevel-1)*40;
const mineRate=()=>1+(state.laserLevel-1)*.35;
const efficiency=()=>1+(state.efficiencyLevel-1)*.05;
const asteroidCount=()=>Math.round(clamp(world.w*world.h/52000,innerWidth<700?11:18,innerWidth<700?16:28)*(0.9+sec()[3]*.08));

const cameraLeft=()=>world.camera.x-world.w/(2*world.zoom);
const cameraTop=()=>world.camera.y-world.h/(2*world.zoom);
const sx=wx=>(wx-cameraLeft())*world.zoom;
const sy=wy=>(wy-cameraTop())*world.zoom;
function visible(o,margin=120){
  const x=sx(o.x),y=sy(o.y),r=o.r*world.zoom;
  return x>-margin-r&&x<world.w+margin+r&&y>-margin-r&&y<world.h+margin+r;
}
function save(){ state.lastSeen=Date.now(); localStorage.setItem(SAVE_KEY,JSON.stringify(state)); }
function upgradeCost(t){
  const lv=t==='laser'?state.laserLevel:t==='cargo'?state.cargoLevel:state.efficiencyLevel;
  return Math.round((t==='laser'?150:t==='cargo'?200:300)*1.62**(lv-1));
}
function weightedResource(){
  const id=sec()[0];
  const w=id==='red'?{iron:43,nickel:25,cobalt:15,titanium:14,crystal:3}:id==='void'?{iron:24,nickel:22,cobalt:20,titanium:24,crystal:10}:{iron:62,nickel:23,cobalt:10,titanium:4,crystal:1};
  let r=Math.random()*100,c=0;
  for(const k in w){ c+=w[k]; if(r<=c) return k; }
  return 'iron';
}
function asteroidLoot(r,crystal=false){
  const units=Math.max(2,Math.round((r*r)/620*rand(.7,1.25)));
  const out={iron:0,nickel:0,cobalt:0,titanium:0,crystal:0};
  for(let i=0;i<units;i++){ let k=weightedResource(); if(crystal&&Math.random()<.38) k='crystal'; out[k]++; }
  return out;
}
function addLoot(bundle,announce=true){
  let added=0,rejected=0; const gained={};
  for(const [k,q] of Object.entries(bundle)){
    const size=RES[k][2]; let take=0;
    for(let i=0;i<q;i++){
      if(state.cargo+size>cap()){ rejected+=q-i; break; }
      state.inventory[k]++; state.cargo+=size; take++; added++;
    }
    if(take) gained[k]=take;
  }
  if(announce&&added){
    const text=Object.entries(gained).map(([k,n])=>`${n} ${RES[k][0]}`).join(' · ');
    toast(`Asteroide coletado: ${text}${rejected?' · carga sem espaço para o resto':''}`);
  }else if(announce&&rejected) toast('Asteroide quebrado, mas o cargueiro está sem espaço.');
  if(state.cargo>=cap()) state.mining=false;
  return added;
}
function offline(){
  const e=Math.max(0,Date.now()-(state.lastSeen||Date.now()))/1000;
  if(!state.mining||e<20)return;
  const completed=Math.min(24,Math.floor(e/Math.max(22,42/(mineRate()*Math.sqrt(sec()[3])))));
  let collected=0;
  for(let i=0;i<completed;i++){
    collected+=addLoot(asteroidLoot(rand(24,46),Math.random()<.08*sec()[3]),false);
    if(state.cargo>=cap())break;
  }
  if(collected)setTimeout(()=>toast(`Expedição offline: ${completed} asteroides processados · +${collected} itens`),450);
}
function loadAssets(){
  return Promise.all(Object.entries(SVG).map(([k,v])=>new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{ assets[k]=img; resolve(); };
    img.onerror=resolve;
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(v);
  })));
}
function resize(){
  world.dpr=Math.min(2,devicePixelRatio||1);
  world.w=Math.max(320,innerWidth); world.h=Math.max(320,innerHeight);
  canvas.width=world.w*world.dpr; canvas.height=world.h*world.dpr;
  canvas.style.width=world.w+'px'; canvas.style.height=world.h+'px';
  ctx.setTransform(world.dpr,0,0,world.dpr,0,0);
  while(world.asteroids.length<asteroidCount()) spawnAsteroid();
}
function spawnAsteroid(){
  const r=Math.random()<.18?rand(48,76):Math.random()<.5?rand(28,47):rand(14,27);
  const density=rand(.75,1.4), mass=Math.max(8,r*r*density);
  const visibleHalf=Math.hypot(world.w/(2*world.zoom),world.h/(2*world.zoom));
  const radius=visibleHalf+rand(280,Math.max(520,visibleHalf*.8));
  const a=rand(0,Math.PI*2);
  const x=world.camera.x+Math.cos(a)*radius, y=world.camera.y+Math.sin(a)*radius;
  const drift=a+Math.PI+rand(-1.15,1.15), speed=rand(7,26)*(.92+sec()[3]*.08);
  const chance=sec()[0]==='void'?.28:sec()[0]==='red'?.14:.055, crystal=Math.random()<chance;
  const body={id:nextId++,x,y,vx:Math.cos(drift)*speed,vy:Math.sin(drift)*speed,r,mass,density,rot:rand(0,Math.PI*2),spin:rand(-.42,.42),crystal};
  body.maxHp=body.hp=Math.round(55+r*1.75);
  body.loot=asteroidLoot(r,crystal);
  world.asteroids.push(body);
  return body;
}
function chooseTarget(){
  if(!state.mining||state.cargo>=cap()){ world.target=null; return; }
  const sh=world.ship; let best=null,score=Infinity;
  for(const a of world.asteroids){
    const d=dist(sh.x,sh.y,a.x,a.y); if(d<90) continue;
    const rel=Math.hypot(a.vx-sh.vx,a.vy-sh.vy);
    const value=Object.entries(a.loot).reduce((s,[k,n])=>s+RES[k][1]*n,0);
    const sc=d+rel*5-Math.min(700,value*.35)-a.r*3;
    if(sc<score){ score=sc; best=a; }
  }
  world.target=best;
}
function burst(x,y,n,color){
  for(let i=0;i<n;i++){
    const a=rand(0,Math.PI*2),v=rand(30,180);
    world.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.25,.85),maxLife:.85,size:rand(1,4),color});
  }
}
function destroyAsteroid(a){
  const i=world.asteroids.indexOf(a); if(i>=0) world.asteroids.splice(i,1);
  for(let j=0,n=Math.floor(rand(4,8));j<n;j++){
    const ang=rand(0,Math.PI*2),v=rand(42,128),r=rand(6,Math.min(16,a.r*.32));
    world.fragments.push({id:nextId++,x:a.x,y:a.y,vx:a.vx+Math.cos(ang)*v,vy:a.vy+Math.sin(ang)*v,r,mass:Math.max(1,r*r*.55),rot:rand(0,Math.PI*2),spin:rand(-2.5,2.5),life:rand(7,12),dangerous:true});
  }
  burst(a.x,a.y,32,a.crystal?'#4de7ff':'#c8d0dd');
  world.shake=7; sound('break'); addLoot(a.loot,true);
  if(world.target===a) world.target=null;
  if(state.mining&&state.cargo<cap()) chooseTarget();
}
function resolveBodyCollision(a,b){
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),minD=a.r+b.r;
  if(d<=0||d>=minD)return;
  const nx=dx/d,ny=dy/d,overlap=minD-d,invA=1/Math.max(1,a.mass),invB=1/Math.max(1,b.mass),invSum=invA+invB;
  a.x-=nx*overlap*(invA/invSum); a.y-=ny*overlap*(invA/invSum);
  b.x+=nx*overlap*(invB/invSum); b.y+=ny*overlap*(invB/invSum);
  const rvx=b.vx-a.vx,rvy=b.vy-a.vy,vel=rvx*nx+rvy*ny;
  if(vel>0)return;
  const j=-(1+.82)*vel/invSum,ix=j*nx,iy=j*ny;
  a.vx-=ix*invA; a.vy-=iy*invA; b.vx+=ix*invB; b.vy+=iy*invB;
  const tangent=rvx*-ny+rvy*nx;
  a.spin-=tangent*invA*.018; b.spin+=tangent*invB*.018;
  if(Math.abs(vel)>24) burst((a.x+b.x)/2,(a.y+b.y)/2,4,'#aeb8c8');
}
function solveAsteroidPhysics(){
  const list=world.asteroids;
  for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++) resolveBodyCollision(list[i],list[j]);
}
function predictThreat(h){
  const sh=world.ship,dx=h.x-sh.x,dy=h.y-sh.y,rvx=h.vx-sh.vx,rvy=h.vy-sh.vy,sq=rvx*rvx+rvy*rvy;
  if(sq<9)return null;
  const t=-(dx*rvx+dy*rvy)/sq;
  if(t<=.02||t>2.2)return null;
  const cx=dx+rvx*t,cy=dy+rvy*t,miss=Math.hypot(cx,cy);
  const mf=clamp(Math.log10(Math.max(10,h.mass||h.r*h.r))/4,.65,1.35);
  const safe=(38+h.r*1.12)*mf;
  if(miss>=safe||Math.hypot(dx,dy)>430+h.r)return null;
  return{hazard:h,rvx,rvy,cx,cy,miss,urgency:(1-t/2.2)*(.35+.65*(1-miss/safe))*mf};
}
function updateAvoidance(dt){
  const sh=world.ship;
  const hazards=[...world.fragments.filter(f=>f.dangerous),...world.asteroids.filter(a=>a!==world.target||dist(a.x,a.y,sh.x,sh.y)>a.r+70)];
  let best=null;
  for(const h of hazards){ const t=predictThreat(h); if(t&&(!best||t.urgency>best.urgency)) best=t; }
  let tx=0,ty=0;
  if(best){
    const h=best.hazard,rel=Math.max(1,Math.hypot(best.rvx,best.rvy)),px=-best.rvy/rel,py=best.rvx/rel;
    if(sh.threatId!==h.id||!sh.dodgeSide){ sh.dodgeSide=(px*best.cx+py*best.cy)>0?-1:1; sh.threatId=h.id; }
    const miss=Math.max(1,best.miss),ax=-best.cx/miss,ay=-best.cy/miss;
    const lateral=90+best.urgency*90,away=20+best.urgency*50;
    tx=px*sh.dodgeSide*lateral+ax*away; ty=py*sh.dodgeSide*lateral+ay*away;
    const mag=Math.hypot(tx,ty); if(mag>165){ tx=tx/mag*165; ty=ty/mag*165; }
    sh.dodgeHold=.32; world.dangerText='DESVIO PREDITIVO';
  }else{
    sh.dodgeHold=Math.max(0,sh.dodgeHold-dt);
    if(sh.dodgeHold<=0){ sh.threatId=0; sh.dodgeSide=0; world.dangerText='ROTA SEGURA'; }
    else{ tx=sh.avoidX*.76; ty=sh.avoidY*.76; world.dangerText='DESVIO PREDITIVO'; }
  }
  const response=1-Math.exp(-dt*(best?7.5:3.6));
  sh.avoidX+=(tx-sh.avoidX)*response; sh.avoidY+=(ty-sh.avoidY)*response;
}
function handleShipCollisions(){
  const sh=world.ship; if(sh.hitTimer>0)return;
  for(const h of [...world.fragments,...world.asteroids]){
    const minD=22+h.r*.82;
    if(dist(sh.x,sh.y,h.x,h.y)>=minD)continue;
    const rel=Math.hypot(h.vx-sh.vx,h.vy-sh.vy);
    state.shield=clamp(state.shield-clamp(5+rel*.19+h.r*.12,7,31),0,100);
    sh.hitTimer=.65;
    const dx=sh.x-h.x,dy=sh.y-h.y,d=Math.max(1,Math.hypot(dx,dy));
    sh.vx+=dx/d*70; sh.vy+=dy/d*70; h.vx-=dx/d*14; h.vy-=dy/d*14;
    burst(sh.x,sh.y,15,'#ff89a2'); world.shake=10; world.dangerText='IMPACTO NO ESCUDO'; sound('hit');
    if(state.shield<=0){ state.mining=false; world.laser=false; sh.recoveryTimer=3.2; world.target=null; toast('Escudo colapsou. Recuo automático.'); }
    break;
  }
}
function updateShip(dt){
  const sh=world.ship; sh.hitTimer=Math.max(0,sh.hitTimer-dt);
  if(sh.recoveryTimer>0){
    sh.recoveryTimer-=dt;
    if(sh.recoveryTimer<=0){ state.shield=38; toast('Escudo reiniciado em 38%.'); }
  }else if(state.shield<100&&sh.hitTimer<=0) state.shield=clamp(state.shield+dt*4.2,0,100);

  if(state.mining&&(!world.target||!world.asteroids.includes(world.target))) chooseTarget();
  updateAvoidance(dt);

  let tx=sh.x,ty=sh.y;
  if(sh.recoveryTimer>0){
    const fx=Math.sin(sh.angle),fy=-Math.cos(sh.angle);
    tx=sh.x-fx*180; ty=sh.y-fy*180;
  }else if(state.mining&&world.target){
    const t=world.target,dx=sh.x-t.x,dy=sh.y-t.y,d=Math.max(1,Math.hypot(dx,dy));
    const ux=dx/d,uy=dy/d,stand=t.r+clamp(world.w*.085,90,135);
    tx=t.x+ux*stand; ty=t.y+uy*stand;
  }
  tx+=sh.avoidX; ty+=sh.avoidY;

  const dx=tx-sh.x,dy=ty-sh.y,d=Math.hypot(dx,dy);
  const dodging=Math.hypot(sh.avoidX,sh.avoidY)>12,travelling=state.mining&&world.target&&d>75;
  const maxSpeed=dodging?160:travelling?118:82;
  const speed=Math.min(maxSpeed,d*(travelling?1.35:2));
  const dvx=d>1?dx/d*speed:0,dvy=d>1?dy/d*speed:0;
  const response=1-Math.exp(-dt*(dodging?4.8:3.2));
  sh.vx+=(dvx-sh.vx)*response; sh.vy+=(dvy-sh.vy)*response;
  sh.x+=sh.vx*dt; sh.y+=sh.vy*dt;

  const faceX=world.target?world.target.x:sh.x+(Math.abs(sh.vx)>2?sh.vx:1);
  const faceY=world.target?world.target.y:sh.y+sh.vy;
  const desired=Math.atan2(faceY-sh.y,faceX-sh.x)+Math.PI/2;
  const diff=((desired-sh.angle+Math.PI)%(Math.PI*2))-Math.PI;
  sh.angle+=diff*Math.min(1,dt*6.2);

  const td=world.target?dist(sh.x,sh.y,world.target.x,world.target.y):Infinity,range=clamp(world.w*.31,250,510);
  world.laser=!!(state.mining&&world.target&&sh.recoveryTimer<=0&&state.cargo<cap()&&td<=range&&Math.abs(diff)<.78);
}
function emitExhaust(dt){
  const sh=world.ship,speed=Math.hypot(sh.vx,sh.vy);
  if(speed<8||sh.recoveryTimer>0)return;
  world.exhaustTimer-=dt;
  const interval=clamp(.05-speed/5500,.018,.05);
  if(world.exhaustTimer>0)return;
  world.exhaustTimer=interval;

  const fx=Math.sin(sh.angle),fy=-Math.cos(sh.angle),px=-fy,py=fx;
  const rearX=sh.x-fx*28,rearY=sh.y-fy*28,power=clamp(speed/120,.2,1);
  for(const side of [-1,1]){
    const nx=rearX+px*side*7,ny=rearY+py*side*7;
    const backX=-fx,backY=-fy,v=rand(14,28)+speed*.07;
    world.exhaust.push({
      x:nx,y:ny,
      vx:sh.vx*.16+backX*v+px*rand(-3,3),
      vy:sh.vy*.16+backY*v+py*rand(-3,3),
      life:rand(.42,.78),maxLife:.78,size:rand(1.4,3.1)*(.65+power*.45)
    });
  }
}
function updateCamera(dt){
  const sh=world.ship,c=world.camera,speed=Math.hypot(sh.vx,sh.vy);
  let dirX=Math.sin(sh.angle),dirY=-Math.cos(sh.angle);
  if(speed>5){ dirX=sh.vx/speed; dirY=sh.vy/speed; }

  const trail=42+clamp(speed*.82,0,105);
  const tx=sh.x-dirX*trail,ty=sh.y-dirY*trail;
  const spring=1.25,damp=3.15;
  c.vx+=(tx-c.x)*spring*dt; c.vy+=(ty-c.y)*spring*dt;
  c.vx*=Math.exp(-damp*dt); c.vy*=Math.exp(-damp*dt);
  c.x+=c.vx*dt*6.2; c.y+=c.vy*dt*6.2;

  world.targetZoom=clamp(1-speed/4800,.97,1);
  world.zoom+=(world.targetZoom-world.zoom)*(1-Math.exp(-dt*2.1));
}
function updateWorld(dt){
  world.time+=dt; world.shake=Math.max(0,world.shake-dt*22);

  for(const a of world.asteroids){
    a.x+=a.vx*dt; a.y+=a.vy*dt; a.rot+=a.spin*dt;
    a.vx*=Math.pow(.9996,dt*60); a.vy*=Math.pow(.9996,dt*60);
  }
  solveAsteroidPhysics();

  if(world.laser&&world.target){
    const t=world.target;
    t.hp-=(9+mineRate()*8)*sec()[3]*dt;
    world.particleTimer-=dt;
    if(world.particleTimer<=0){ world.particleTimer=.04; burst(t.x,t.y,2,Math.random()>.5?'#4de7ff':'#ffd36f'); }
    if(t.hp<=0) destroyAsteroid(t);
  }

  for(const f of world.fragments){ f.x+=f.vx*dt; f.y+=f.vy*dt; f.rot+=f.spin*dt; f.life-=dt; }
  for(const p of world.particles){
    p.x+=p.vx*dt; p.y+=p.vy*dt;
    p.vx*=Math.pow(.98,dt*60); p.vy*=Math.pow(.98,dt*60); p.life-=dt;
  }
  for(const p of world.exhaust){
    p.x+=p.vx*dt; p.y+=p.vy*dt;
    p.vx*=Math.pow(.965,dt*60); p.vy*=Math.pow(.965,dt*60);
    p.life-=dt; p.size+=dt*2.1;
  }

  updateShip(dt); emitExhaust(dt); handleShipCollisions(); updateCamera(dt);

  const maxDist=Math.max(world.w,world.h)*2.7/world.zoom;
  world.fragments=world.fragments.filter(f=>f.life>0&&dist(f.x,f.y,world.camera.x,world.camera.y)<maxDist);
  world.particles=world.particles.filter(p=>p.life>0);
  world.exhaust=world.exhaust.filter(p=>p.life>0);
  world.asteroids=world.asteroids.filter(a=>a===world.target||dist(a.x,a.y,world.camera.x,world.camera.y)<maxDist);
  if(world.target&&!world.asteroids.includes(world.target)) world.target=null;

  world.spawnTimer-=dt;
  if(world.spawnTimer<=0){
    world.spawnTimer=rand(.22,.7);
    while(world.asteroids.length<asteroidCount()) spawnAsteroid();
  }
}

function drawImageRotated(img,x,y,w,h,angle,alpha=1){
  if(!img)return;
  ctx.save(); ctx.globalAlpha=alpha; ctx.translate(x,y); ctx.rotate(angle); ctx.drawImage(img,-w/2,-h/2,w,h); ctx.restore();
}
function hash2(x,y,seed=0){
  const n=Math.sin(x*127.1+y*311.7+seed*74.7)*43758.5453;
  return n-Math.floor(n);
}
function drawStarLayer(parallax,cell,alpha,minS,maxS,seed){
  const camX=world.camera.x*parallax,camY=world.camera.y*parallax;
  const minX=Math.floor((camX-world.w/2-cell)/cell),maxX=Math.ceil((camX+world.w/2+cell)/cell);
  const minY=Math.floor((camY-world.h/2-cell)/cell),maxY=Math.ceil((camY+world.h/2+cell)/cell);
  for(let gx=minX;gx<=maxX;gx++)for(let gy=minY;gy<=maxY;gy++){
    const h1=hash2(gx,gy,seed); if(h1<.34)continue;
    const wx=gx*cell+hash2(gx,gy,seed+11)*cell,wy=gy*cell+hash2(gx,gy,seed+29)*cell;
    const x=wx-camX+world.w/2,y=wy-camY+world.h/2,size=minS+(maxS-minS)*hash2(gx,gy,seed+41);
    ctx.globalAlpha=alpha*(.72+.28*Math.sin(world.time*1.1+h1*8));
    ctx.fillStyle=h1>.9?'#c6efff':'#fff'; ctx.fillRect(x,y,size,size);
  }
  ctx.globalAlpha=1;
}
function drawNebula(){
  const tint=sec()[0]==='red'?['rgba(120,30,70,.14)','rgba(70,18,55,.08)']:sec()[0]==='void'?['rgba(63,40,140,.16)','rgba(34,22,92,.09)']:['rgba(18,74,120,.14)','rgba(20,55,92,.08)'];
  const p=.055,cx=world.w*.42-(world.camera.x*p)%(world.w*1.7),cy=world.h*.36-(world.camera.y*p)%(world.h*1.5);
  const g=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(world.w,world.h)*.72);
  g.addColorStop(0,tint[0]); g.addColorStop(.55,tint[1]); g.addColorStop(1,'rgba(2,4,10,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,world.w,world.h);
}
function drawBackground(){
  ctx.fillStyle='#02040a'; ctx.fillRect(0,0,world.w,world.h); drawNebula();
  drawStarLayer(.08,92,.34,.5,1,1);
  drawStarLayer(.22,72,.55,.7,1.35,2);
  drawStarLayer(.46,58,.8,.9,1.75,3);
}
function drawAsteroid(a){
  if(!visible(a,150))return;
  const x=sx(a.x),y=sy(a.y),r=a.r*world.zoom,target=a===world.target;
  drawImageRotated(a.crystal?assets.crystal:assets.rock,x,y,r*2.15,r*2.15,a.rot,target?1:.83);
  if(target){
    const hp=clamp(a.hp/a.maxHp,0,1);
    ctx.save(); ctx.strokeStyle='rgba(77,231,255,.22)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,r*.96,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle=a.crystal?'#4de7ff':'#90a8c7'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(x,y,r*.96,-Math.PI/2,-Math.PI/2+Math.PI*2*hp); ctx.stroke(); ctx.restore();
  }
}
function drawLaser(){
  if(!world.laser||!world.target)return;
  const sh=world.ship,t=world.target,x0=sx(sh.x),y0=sy(sh.y),tx=sx(t.x),ty=sy(t.y);
  const dx=tx-x0,dy=ty-y0,d=Math.max(1,Math.hypot(dx,dy)),ux=dx/d,uy=dy/d;
  const startX=x0+ux*28*world.zoom,startY=y0+uy*28*world.zoom,endX=tx-ux*t.r*.68*world.zoom,endY=ty-uy*t.r*.68*world.zoom;
  const pulse=.55+Math.sin(world.time*28)*.3;
  ctx.save(); ctx.lineCap='round'; ctx.strokeStyle=`rgba(77,231,255,${.22+pulse*.2})`; ctx.lineWidth=9*world.zoom; ctx.shadowBlur=18; ctx.shadowColor='#4de7ff';
  ctx.beginPath(); ctx.moveTo(startX,startY); ctx.lineTo(endX,endY); ctx.stroke();
  ctx.strokeStyle='#dfffff'; ctx.lineWidth=(2.1+pulse*1.2)*world.zoom; ctx.beginPath(); ctx.moveTo(startX,startY); ctx.lineTo(endX,endY); ctx.stroke(); ctx.restore();
  drawImageRotated(assets.hit,endX,endY,(34+pulse*5)*world.zoom,(34+pulse*5)*world.zoom,world.time*2.4,.82);
}
function drawParticles(){
  for(const p of world.particles){
    const x=sx(p.x),y=sy(p.y); if(x<-20||x>world.w+20||y<-20||y>world.h+20)continue;
    ctx.save(); ctx.globalAlpha=clamp(p.life/(p.maxLife||.55),0,1); ctx.fillStyle=p.color; ctx.shadowBlur=10; ctx.shadowColor=p.color;
    ctx.beginPath(); ctx.arc(x,y,p.size*world.zoom,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
}
function drawExhaust(){
  for(const p of world.exhaust){
    const x=sx(p.x),y=sy(p.y); if(x<-30||x>world.w+30||y<-30||y>world.h+30)continue;
    const life=clamp(p.life/p.maxLife,0,1);
    ctx.save(); ctx.globalAlpha=life*.46; ctx.fillStyle=life>.55?'#b9f4ff':'#84919b';
    ctx.beginPath(); ctx.arc(x,y,p.size*world.zoom,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
}
function draw(){
  ctx.setTransform(world.dpr,0,0,world.dpr,0,0);
  drawBackground();
  ctx.save();
  if(world.shake)ctx.translate(rand(-world.shake,world.shake),rand(-world.shake,world.shake));
  for(const a of world.asteroids)drawAsteroid(a);
  for(const f of world.fragments){
    const x=sx(f.x),y=sy(f.y); if(x<-60||x>world.w+60||y<-60||y>world.h+60)continue;
    drawImageRotated(assets.frag,x,y,f.r*2.3*world.zoom,f.r*2.3*world.zoom,f.rot,.95);
  }
  drawLaser(); drawParticles(); drawExhaust();

  const sh=world.ship,x=sx(sh.x),y=sy(sh.y),speed=Math.hypot(sh.vx,sh.vy);
  const base=clamp(world.w*.055,54,76)*world.zoom,ratio=assets.ship?assets.ship.height/assets.ship.width:1;
  if(state.shield<100){
    ctx.save(); ctx.strokeStyle='rgba(77,231,255,.2)'; ctx.shadowBlur=16; ctx.shadowColor='#4de7ff';
    ctx.beginPath(); ctx.arc(x,y,34*world.zoom,0,Math.PI*2); ctx.stroke(); ctx.restore();
  }
  drawImageRotated(assets.ship,x,y,base,base*ratio,sh.angle);
  if(speed>8){
    const fx=Math.sin(sh.angle),fy=-Math.cos(sh.angle),px=-fy,py=fx,rearX=x-fx*27*world.zoom,rearY=y-fy*27*world.zoom;
    ctx.save(); ctx.fillStyle='rgba(170,241,255,.68)';
    for(const side of [-1,1]){
      ctx.beginPath(); ctx.arc(rearX+px*side*7*world.zoom,rearY+py*side*7*world.zoom,2.2*world.zoom,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

function hud(){
  const capacity=cap(),pct=clamp(state.cargo/capacity*100,0,100);
  $('credits').textContent=fmt(state.credits); $('gems').textContent=fmt(state.gems); $('sectorName').textContent=sec()[1]; $('rateValue').textContent=mineRate().toFixed(2);
  $('operationText').textContent=world.laser?(Math.hypot(world.ship.avoidX,world.ship.avoidY)>12?'MINERANDO · DESVIO':'LASER EM OPERAÇÃO'):state.mining?(world.target?'CAÇANDO ASTEROIDE':'PROCURANDO ALVO'):'AGUARDANDO ORDEM';
  $('shieldBar').style.width=clamp(state.shield,0,100)+'%'; $('shieldText').textContent=Math.round(state.shield)+'%';
  $('cargoBar').style.width=pct+'%'; $('cargoText').textContent=`${Math.floor(state.cargo)} / ${capacity}`;
  const d=$('dangerText'); d.textContent=world.dangerText; d.className='danger-text'+(world.dangerText.includes('IMPACTO')?' hit':world.dangerText.includes('DESVIO')?' warn':'');
  mineButton.textContent=state.mining?'PAUSAR MINERAÇÃO':'INICIAR MINERAÇÃO'; mineButton.classList.toggle('active',state.mining); $('soundButton').textContent=state.sound?'🔊':'🔇';
}
function panel(){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===activeTab));
  if(activeTab==='cargo'){
    panelContent.innerHTML=`<div class="panel-title"><h2>Carga</h2><span>${Math.floor(state.cargo)} / ${cap()} espaço</span></div><div class="resource-list">${Object.entries(RES).map(([k,r])=>`<div class="resource-row"><span>${r[0]}</span><strong>${Math.floor(state.inventory[k]||0)}</strong><em>${r[2]} espaço · ${r[1]} C</em></div>`).join('')}</div><button class="panel-action" data-action="sell">Vender carga por Credits</button>`;
  }else if(activeTab==='ship'){
    panelContent.innerHTML=`<div class="panel-title"><h2>Rusty Miner I</h2><span>Nível ${state.shipLevel}</span></div><div class="stats-grid"><div class="stat-card"><span>LASER</span><b>${mineRate().toFixed(2)}x</b></div><div class="stat-card"><span>CARGO</span><b>${cap()}</b></div><div class="stat-card"><span>REFINO</span><b>${Math.round(efficiency()*100)}%</b></div></div><div class="upgrade-list">${[['laser','Laser','quebra mais rápido'],['cargo','Cargueiro','+40 espaço'],['efficiency','Refino','+5% valor']].map(a=>`<button class="upgrade" data-upgrade="${a[0]}"><span>${a[1]}</span><small>${a[2]}</small><b>${fmt(upgradeCost(a[0]))} C</b></button>`).join('')}</div>`;
  }else{
    panelContent.innerHTML=`<div class="panel-title"><h2>Market P2P</h2><span>SIMULADO</span></div><p class="market-note">Nenhum depósito ou saque real está ativo nesta Alpha.</p><div class="market-card"><div><strong>20 Titanium</strong><span>Ordem de compra</span></div><b>120 Gems</b><button data-action="ms">Vender</button></div><div class="market-card"><div><strong>Mining Core Mk-I</strong><span>Ordem de venda</span></div><b>85 Gems</b><button data-action="mb">Comprar</button></div><div class="fee-note">Taxa simulada do Market: <b>10%</b>.</div>`;
  }
}
function sectors(){
  $('sectorList').innerHTML=SECTORS.map(v=>{
    const unlocked=state.credits>=v[2]||v[0]==='sol'||state.sector===v[0];
    return `<button class="sector-option" data-sector="${v[0]}" ${unlocked?'':'disabled'}><span><strong>${v[1]}</strong><small>${v[4]}</small></span><b>${unlocked?'x'+v[3].toFixed(1):fmt(v[2])+' C'}</b></button>`;
  }).join('');
}
function sellCargo(){
  if(state.cargo<=0)return toast('Sua carga está vazia.');
  let total=0; for(const k in state.inventory) total+=RES[k][1]*state.inventory[k];
  total=Math.round(total*efficiency()*sec()[3]); state.credits+=total;
  for(const k in state.inventory)state.inventory[k]=0;
  state.cargo=0; sound('cash'); toast(`Carga vendida por ${fmt(total)} Credits.`); save(); panel();
}
function upgrade(type){
  const cost=upgradeCost(type); if(state.credits<cost)return toast('Credits insuficientes.');
  state.credits-=cost; if(type==='laser')state.laserLevel++; if(type==='cargo')state.cargoLevel++; if(type==='efficiency')state.efficiencyLevel++;
  state.shipLevel=Math.max(1,Math.floor((state.laserLevel+state.cargoLevel+state.efficiencyLevel)/3));
  sound('up'); toast('Upgrade instalado.'); save(); panel();
}
function marketSell(){
  if(state.inventory.titanium<20)return toast('Você precisa de 20 Titanium.');
  state.inventory.titanium-=20; state.cargo=Math.max(0,state.cargo-20*RES.titanium[2]); state.gems+=108;
  sound('cash'); toast('Ordem concluída: +108 Gems após 10% de taxa.'); save(); panel();
}
function marketBuy(){
  if(state.gems<85)return toast('Gems insuficientes. Este saldo é simulado.');
  state.gems-=85; state.laserLevel+=2; sound('up'); toast('Mining Core Mk-I instalado: Laser +2 níveis.'); save(); panel();
}
function toast(message){
  const q=$('toast'); q.textContent=message; q.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>q.classList.remove('show'),2600);
}
function getAudio(){
  if(!state.sound)return null;
  if(!audio){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;audio=new C();}
  if(audio.state==='suspended')audio.resume();
  return audio;
}
function tone(f,d,g=.03,type='sine',slide=0){
  const ac=getAudio(); if(!ac)return;
  const o=ac.createOscillator(),n=ac.createGain(),z=ac.currentTime;
  o.type=type;o.frequency.setValueAtTime(f,z);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),z+d);
  n.gain.setValueAtTime(g,z);n.gain.exponentialRampToValueAtTime(.0001,z+d);o.connect(n);n.connect(ac.destination);o.start(z);o.stop(z+d);
}
function sound(k){
  if(!state.sound)return;
  if(k==='start'){tone(180,.08,.03,'sawtooth',120);setTimeout(()=>tone(330,.09,.02,'sine',90),55);}
  if(k==='break'){tone(90,.18,.05,'sawtooth',-35);tone(460,.12,.02,'triangle',-180);}
  if(k==='hit')tone(72,.16,.05,'square',-25);
  if(k==='cash')tone(520,.08,.02,'sine',140);
  if(k==='up')tone(260,.1,.025,'triangle',180);
}
function loop(now){
  const dt=Math.min(.05,Math.max(.001,(now-last)/1000)); last=now;
  updateWorld(dt); draw(); hud(); requestAnimationFrame(loop);
}

mineButton.onclick=()=>{
  getAudio();
  if(!state.mining&&state.cargo>=cap())return toast('Carga cheia. Venda ou aumente a capacidade.');
  if(!state.mining&&world.ship.recoveryTimer>0)return toast('A nave ainda está recuperando o escudo.');
  state.mining=!state.mining;
  if(state.mining)chooseTarget(); else{world.target=null;world.laser=false;}
  sound('start');save();
};
$('soundButton').onclick=()=>{state.sound=!state.sound;if(state.sound){getAudio();tone(420,.06,.02,'sine',80);}save();hud();};
document.querySelector('.tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b){activeTab=b.dataset.tab;panel();}};
panelContent.onclick=e=>{
  const u=e.target.closest('[data-upgrade]');if(u)return upgrade(u.dataset.upgrade);
  const action=e.target.closest('[data-action]')?.dataset.action;
  if(action==='sell')sellCargo();if(action==='ms')marketSell();if(action==='mb')marketBuy();
};
$('sectorButton').onclick=()=>{sectors();$('sectorModal').hidden=false;};
$('closeSector').onclick=()=>{$('sectorModal').hidden=true;};
$('sectorModal').onclick=e=>{
  const b=e.target.closest('[data-sector]');
  if(b&&!b.disabled){
    state.sector=b.dataset.sector;$('sectorModal').hidden=true;
    world.asteroids=[];world.fragments=[];world.target=null;
    while(world.asteroids.length<asteroidCount())spawnAsteroid();
    if(state.mining)chooseTarget();
    save();toast('Rota definida: '+sec()[1]);panel();
  }else if(e.target===$('sectorModal'))$('sectorModal').hidden=true;
};

addEventListener('resize',resize,{passive:true});
addEventListener('beforeunload',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});

offline();resize();panel();sectors();hud();loadAssets().then(()=>requestAnimationFrame(loop));
})();
