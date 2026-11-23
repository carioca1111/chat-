'use strict';
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d', {alpha:false});
ctx.imageSmoothingEnabled = false;
const stage = document.querySelector('#stage'), percent = document.querySelector('#percent');
const meter = document.querySelector('#meter'), fill = meter.firstElementChild;
const pause = document.querySelector('#pause'), restart = document.querySelector('#restart');
const speeds = [...document.querySelectorAll('[data-speed]')];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const art = {};
const particles = Array.from({length:32}, () => ({age:1}));
const cycle = .73, groundY = 124, travel = 409;
const scenes={
    hunter:{land:'range',ground:'ground',title:'Hunter em fuga do Varrisco pelas montanhas de Auralis'},
    dunas:{land:'dunas',ground:'dunas-ground',title:'Barco de dunas em fuga do Arenoceto'},
    savana:{land:'savana',ground:'savana-ground',title:'Velsari perseguido por um Gravarto na savana'}
};
const fixedScene=new URLSearchParams(location.search).get('cena');
function chooseScene(){
    const keys=Object.keys(scenes);
    const key=keys.includes(fixedScene)?fixedScene:keys[Math.floor(Math.random()*keys.length)];
    canvas.setAttribute('aria-label',scenes[key].title);
    return key;
}
let sceneKey=chooseScene();
const stages = [[0,'Lendo o manifesto'],[.13,'Preparando o terreno'],[.38,'Carregando criaturas'],[.67,'Montando a vila'],[.89,'Preparando os controles'],[1,'Carregamento concluído']];
let time=0, simTime=0, progress=0, display=0, speed=1, paused=false, external=false, label='';
let ready=false, last=null, raf=0, nextParticle=0, lastFrame=-1, previousText='';
let cycles=0, impacts=0, frameCount=0;
function reset(){
    sceneKey=chooseScene();
    simTime=0; progress=0; display=0; time=0; cycles=0; impacts=0; lastFrame=-1;
    external=false; paused=false; label=''; pause.textContent='Pausar carga';
    for(const p of particles)p.age=1;
    pause.disabled=false; speeds.forEach(b=>b.disabled=false);
}
pause.onclick=()=>{paused=!paused;pause.textContent=paused?'Retomar carga':'Pausar carga';};
restart.onclick=reset;
speeds.forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);speeds.forEach(i=>i.setAttribute('aria-pressed',String(i===b)));});
function realProgress(fraction, name=''){
    external=true; pause.disabled=true; speeds.forEach(b=>b.disabled=true);
    if(fraction!==null){
        if(!Number.isFinite(fraction)||fraction<0||fraction>1)throw RangeError('Progresso esperado entre 0 e 1');
        progress=fraction;
    }
    label=name||(fraction===null?'Preparando recursos':fraction===1?'Carregamento concluído':'Carregando recursos');
}
window.WildhavenLoading={setProgress:realProgress,restart:reset,get state(){return {scene:sceneKey,ready,progress,display,cycles,impacts,frameCount,activeParticles:particles.filter(p=>p.age<1).length};}};
function updateLoad(dt){
    if(!external && !paused){
        simTime+=dt*speed;
        // Holds represent tasks of unknown duration in the simulator.
        const clock=simTime%8;
        if(clock<6.4)progress=Math.min(1,progress+dt*speed/28);
    }
    display+= (progress-display)*(1-Math.exp(-10*dt));
    if(Math.abs(display-progress)<.0002)display=progress;
    const n=progress===1?100:Math.floor(progress*100);
    const name=external?label:stages.filter(([v])=>progress>=v).at(-1)[1];
    if(previousText!==name+n){
        stage.textContent=name;percent.textContent=n+'%';meter.setAttribute('aria-valuenow',n);
        fill.style.width=(progress*100)+'%';previousText=name+n;
    }
    if(progress===1)pause.disabled=true;
}
function repeat(img,y,offset){
    const start=-(Math.floor(offset)%img.width+img.width)%img.width;
    for(let x=start;x<640;x+=img.width)ctx.drawImage(img,x,y);
}
function dust(x,y,heavy){
    const p=particles[nextParticle++%particles.length];
    Object.assign(p,{x,y,age:0,heavy});impacts++;
}
function drawDust(dt,velocity){
    for(const p of particles){
        if(p.age>=1)continue;
        p.x-=(velocity+(p.heavy?15:10))*dt;p.age+=dt/(p.heavy?.47:.33);
        if(p.age>=1)continue;
        const size=p.heavy?20:12;ctx.globalAlpha=1-p.age;
        ctx.drawImage(art.dust,16*Math.floor(6*p.age),0,16,16,Math.round(p.x-size/2),Math.round(p.y-size+1-p.age*3),size,size);
    }
    ctx.globalAlpha=1;
}
function makeSky(colors,sunColor,sunY){
const sky=document.createElement('canvas');sky.width=640;sky.height=144;
const skyCtx=sky.getContext('2d');
colors.forEach((c,i)=>{
    skyCtx.fillStyle=c;skyCtx.fillRect(0,i*14,640,15);
});
skyCtx.fillStyle=sunColor;skyCtx.beginPath();skyCtx.arc(470,sunY,19,0,2*Math.PI);skyCtx.fill();
return sky;
}
const skies={
    hunter:makeSky(['#819d9e','#95aeaa','#aabbb1','#c3c8af','#d7cdb0','#e3cfad','#ecd2ac','#efcfaa'],'#f8ddb0',41),
    dunas:makeSky(['#a6bdc4','#b8c9c4','#c9cfc3','#dfd5bc','#ead4b2','#f1d2a6','#f2cb97','#edbd8f'],'#ffdf9e',35),
    savana:makeSky(['#a68e97','#b89996','#caa491','#dab08c','#e5b987','#edbf84','#f0bb7d','#edab71'],'#ffe1a0',47)
};
function sprite(name,width,f,x,floor){
    ctx.drawImage(art[name],f*width,0,width,64,x,groundY-floor,width,64);
}
function scene(dt){
    const oldDisplay=display;updateLoad(dt);
    const still=reduced.matches;
    if(!still)time+=dt;
    const phase=time/cycle, index=Math.floor(phase*12), f=index%12;
    cycles=Math.floor(phase);
    const distanceTravel=sceneKey==='hunter'?travel:380;
    const shift=distanceTravel*display, hx=Math.round(149+shift), vx=Math.round(5+shift);
    const scroll=phase*48-shift;
    ctx.drawImage(skies[sceneKey],0,0);
    for(let i=0;i<6;i++){
        const distance=i%2===0?.055:.105;
        const x=((i*127- scroll*distance+7300)%730+730)%730-64;
        ctx.drawImage(art.clouds,(i%3)*64,0,64,26,Math.floor(x),6+(i*7)%30,64,26);
    }
    [.12,.27,.52].forEach((factor,i)=>repeat(art[scenes[sceneKey].land+'-'+i],0,scroll*factor));
    repeat(art[scenes[sceneKey].ground],groundY,scroll);
    if(sceneKey==='dunas'){
        sprite('arenoceto',128,f,vx,55);sprite('barco',96,f,hx,57);
    }else if(sceneKey==='savana'){
        sprite('gravarto',138,f,vx,58);sprite('velsari',80,f,hx,58);
    }else{
    ctx.fillStyle='#555244';ctx.fillRect(vx+54,groundY,42,2);ctx.fillRect(hx+16,groundY,22,2);
    ctx.drawImage(art.varrisco,f*128,0,128,64,vx,groundY-61,128,64);
    ctx.drawImage(art.hunter,f*52,0,52,50,hx,groundY-46,52,50);
    }
    if(!still && index!==lastFrame){
        // Dispatch crossed contact frames even on a slow display.
        for(let k=Math.max(lastFrame+1,index-11);k<=index;k++){
            const n=k%12;
            if(sceneKey==='dunas'){
                if(n%3===0)dust(vx+36,groundY,true);
                if(n%4===0)dust(hx+24,groundY,false);
                continue;
            }
            if(sceneKey==='savana'){
                if(n===0||n===6){dust(vx+75,groundY,true);dust(vx+108,groundY,true);}
                for(const [contact,hoof] of [[0,44],[6,67],[7,64],[11,41]]){
                    if(n===contact){dust(hx+hoof,groundY,false);}
                }
                continue;
            }
            if(n===0||n===6){
                const [x,y]=motion.hunter[n][n===0?'nearFoot':'farFoot'];
                dust(hx+x,groundY-46+y,false);
            }
            for(const foot of ['footL','footR'])if(n===motion.contacts[foot]){
                const [x,y]=motion.varrisco[n][foot];dust(vx+x,groundY-61+y,true);
            }
        }
    }
    lastFrame=index;
    drawDust(dt,48/cycle-(dt?distanceTravel*(display-oldDisplay)/dt:0));
}
function tick(now){
    raf=0;if(document.hidden)return;
    scene(last===null?0:Math.min(.09,(now-last)/1000));
    last=now;frameCount++;raf=requestAnimationFrame(tick);
}
function schedule(){if(ready && !document.hidden && !raf)raf=requestAnimationFrame(tick);}
document.addEventListener('visibilitychange',()=>{if(raf)cancelAnimationFrame(raf);raf=0;last=null;schedule();});
const assets=['hunter','varrisco','clouds','dust','arenoceto','barco','gravarto','velsari'];
for(const scene of Object.values(scenes))assets.push(scene.ground,...[0,1,2].map(i=>scene.land+'-'+i));
Promise.all(assets.map(async key=>{
    const image=new Image();image.src='assets/'+key+'.png';await image.decode();art[key]=image;
})).then(()=>{ready=true;schedule();}).catch(()=>{document.querySelector('#error').textContent='Falha ao carregar os sprites. Reabra a página para tentar novamente.';});
