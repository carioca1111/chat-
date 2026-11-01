(()=>{
'use strict';
const play=document.querySelector('.play-area'),base=document.getElementById('spaceCanvas'),op=document.getElementById('operationText'),sector=document.getElementById('sectorName'),travelButton=document.getElementById('travelButton');
if(!play||!base||!op||!sector)return;
const layer=document.createElement('canvas');
layer.className='travel-effects-canvas';
layer.setAttribute('aria-hidden','true');
play.appendChild(layer);
const c=layer.getContext('2d'),TAU=Math.PI*2;
const style=document.createElement('style');
style.textContent='.travel-effects-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}.sector-overlay,.danger-pill,.action-dock,.viewport-frame{z-index:5}.play-area.travel-fast .sector-overlay{border-color:rgba(255,207,104,.5)}';
document.head.appendChild(style);
let w=1,h=1,dpr=1,last=performance.now(),active=false,inter=false,routeDir={x:1,y:0},capturedAt=0,rockAcc=0;
const rocks=[];
const rand=(a,b)=>a+Math.random()*(b-a);
function norm(x,y){const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};}
function pos(el){if(!el)return null;const x=parseFloat(el.style.left),y=parseFloat(el.style.top);return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;}
function captureRoute(){const selectedSub=document.querySelector('.sub-node.selected'),currentSub=document.querySelector('.sub-node.current'),selectedSector=document.querySelector('.sector-node.selected'),currentSector=document.querySelector('.sector-node.current');let a=null,b=null;if(selectedSub&&currentSub){a=pos(currentSub);b=pos(selectedSub);}else if(selectedSector&&currentSector){a=pos(currentSector);b=pos(selectedSector);}if(a&&b&&Math.hypot(b.x-a.x,b.y-a.y)>.1){routeDir=norm(b.x-a.x,b.y-a.y);capturedAt=performance.now();}}
travelButton?.addEventListener('click',captureRoute,true);
function resize(){const r=play.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);w=Math.max(1,r.width);h=Math.max(1,r.height);layer.width=Math.round(w*dpr);layer.height=Math.round(h*dpr);c.setTransform(dpr,0,0,dpr,0,0);}
new ResizeObserver(resize).observe(play);resize();
function detect(){const nowActive=/^VIAJANDO/.test(op.textContent||'');if(nowActive&&!active&&performance.now()-capturedAt>2200){const a=rand(-.55,.55);routeDir=norm(Math.cos(a),Math.sin(a));}active=nowActive;const parts=(sector.textContent||'').split('→').map(s=>s.trim()).filter(Boolean);inter=active&&parts.length===2&&parts[0]!==parts[1];play.classList.toggle('travel-fast',active);}
function spawnRock(){const p={x:-routeDir.y,y:routeDir.x},far=Math.hypot(w,h)*.72+80,offset=rand(-Math.max(w,h)*.6,Math.max(w,h)*.6),startX=w/2+routeDir.x*far+p.x*offset,startY=h/2+routeDir.y*far+p.y*offset,speed=inter?rand(900,1500):rand(700,1200),r=Math.random()<.16?rand(15,30):rand(4,14);rocks.push({x:startX,y:startY,vx:-routeDir.x*speed+p.x*rand(-70,70),vy:-routeDir.y*speed+p.y*rand(-70,70),r,rot:rand(0,TAU),spin:rand(-4,4),life:2.2});}
function emitRocks(dt){if(!active)return;rockAcc+=dt*(inter?2.7:2.1);while(rockAcc>=1){rockAcc-=1;spawnRock();}if(rocks.length>18)rocks.splice(0,rocks.length-18);}
function update(dt){for(const r of rocks){r.x+=r.vx*dt;r.y+=r.vy*dt;r.rot+=r.spin*dt;r.life-=dt;}for(let i=rocks.length-1;i>=0;i--)if(rocks[i].life<=0||rOff(rocks[i]))rocks.splice(i,1);}
function rOff(r){return r.x<-120||r.x>w+120||r.y<-120||r.y>h+120;}
function drawRock(r){c.save();c.translate(r.x,r.y);c.rotate(r.rot);const trail=Math.min(65,Math.hypot(r.vx,r.vy)*.045),sp=Math.hypot(r.vx,r.vy)||1,tx=-r.vx/sp*trail,ty=-r.vy/sp*trail;c.strokeStyle='rgba(166,205,224,.16)';c.lineWidth=Math.max(1,r.r*.32);c.beginPath();c.moveTo(0,0);c.lineTo(tx,ty);c.stroke();c.fillStyle='rgba(85,96,108,.92)';c.strokeStyle='rgba(22,28,36,.9)';c.lineWidth=Math.max(1,r.r*.14);c.beginPath();for(let i=0;i<8;i++){const a=i/8*TAU,rr=r.r*(i%2?rand(.76,.93):rand(.9,1.08)),x=Math.cos(a)*rr,y=Math.sin(a)*rr;i?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();c.fill();c.stroke();c.restore();}
function draw(){c.clearRect(0,0,w,h);if(!active)return;for(const r of rocks)drawRock(r);}
function shake(){if(inter&&active){const amp=1.5+Math.sin(performance.now()*.05)*.45,dx=rand(-amp,amp),dy=rand(-amp,amp);base.style.translate=`${dx.toFixed(2)}px ${dy.toFixed(2)}px`;layer.style.translate=`${dx.toFixed(2)}px ${dy.toFixed(2)}px`;}else{base.style.translate='';layer.style.translate='';}}
function frame(t){const dt=Math.min(.05,Math.max(.001,(t-last)/1000));last=t;detect();emitRocks(dt);update(dt);shake();draw();requestAnimationFrame(frame);}
requestAnimationFrame(frame);
})();