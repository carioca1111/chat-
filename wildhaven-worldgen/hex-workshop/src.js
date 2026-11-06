import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = import.meta.env.BASE_URL;
const el=(id)=>document.getElementById(id);
const canvas=el('atlas');const ctx=canvas.getContext('2d');
const mapImg=new Image();
let regions=[],progress={completed:[],in_development:[],regions:{}},hover=null,selected='H_5_7';
const frame=el('three-view');let mapScale=1,panX=0,panY=0,zoom=1,drag=null,mapReady=false;
let normalScale=1, imgX=0,imgY=0;
const W=6400000,H=8000000;
function isReady(id){return Boolean(progress.regions?.[id]?.glb)}
function isComplete(id){return progress.regions?.[id]?.status==='completed'&&progress.regions?.[id]?.approved===true}
function stateName(id){return isComplete(id)?'Concluído':isReady(id)?'Em desenvolvimento':'Pendente'}
function beginMap(){
 const rect=canvas.getBoundingClientRect();const dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);paint();
}
function worldToImg(x,y){return [mapImg.width*x/W,mapImg.height*(1-y/H)]}
function imgToScreen(x,y){return [imgX+x*mapScale,imgY+y*mapScale]}
function screenToWorld(px,py){let x=(px-imgX)/mapScale/mapImg.width*W;let y=H-(py-imgY)/mapScale/mapImg.height*H;return [x,y]}
function resetAtlas(){zoom=1;panX=panY=0;paint()}
function focusRegion(id){
 const reg=regions.find(r=>r.id===id);if(!reg)return;
 selected=id;
 zoom=5.1;panX=0;panY=0;
 const [ix,iy]=worldToImg(...reg.center_m);
 const ww=canvas.clientWidth,hh=canvas.clientHeight;
 const base=Math.min(ww/mapImg.width,hh/mapImg.height);
 panX=ww/2-(ww-mapImg.width*base)/2-ix*base*zoom;
 panY=hh/2-(hh-mapImg.height*base)/2-iy*base*zoom;
 paint();updateSelection();
}
function paint(){
 const ww=canvas.clientWidth,hh=canvas.clientHeight;if(!ww||!hh||!ctx)return;
 ctx.clearRect(0,0,ww,hh);ctx.fillStyle='#0d1c25';ctx.fillRect(0,0,ww,hh);
 if(!mapImg.complete||!mapImg.naturalWidth)return;
 normalScale=Math.min(ww/mapImg.width,hh/mapImg.height);mapScale=normalScale*zoom;
 imgX=(ww-mapImg.width*normalScale)/2+panX;imgY=(hh-mapImg.height*normalScale)/2+panY;
 ctx.drawImage(mapImg,imgX,imgY,mapImg.width*mapScale,mapImg.height*mapScale);
 // Only APPROVED exports get the warm completion glow.
 const set=new Set((progress.completed||[]).filter(id=>isComplete(id)));
 for(const r of regions){
  if(!r.polygon_m||r.polygon_m.length<3)continue;
  const pts=r.polygon_m.map(p=>imgToScreen(...worldToImg(...p)));
  if(pts.every(p=>p[0]<-40)||pts.every(p=>p[0]>ww+40)||pts.every(p=>p[1]<-40)||pts.every(p=>p[1]>hh+40))continue;
  ctx.save();ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();
  const ready=set.has(r.id);const active=selected===r.id;const developing=stateName(r.id)==='Em desenvolvimento';
  if(ready){
   ctx.fillStyle='rgba(228,248,175,.22)';ctx.fill();
   ctx.strokeStyle='#f1f7c4';ctx.lineWidth=active?2.8:2.1;ctx.shadowColor='#d8ed9d';ctx.shadowBlur=24;ctx.stroke();
   ctx.shadowBlur=0;ctx.strokeStyle='#ffffffbb';ctx.lineWidth=.9;ctx.stroke();
   const [cx,cy]=imgToScreen(...worldToImg(...r.center_m));
   const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,24);grad.addColorStop(0,'rgba(246,255,193,.42)');grad.addColorStop(1,'rgba(215,241,157,0)');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(cx,cy,24,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#edffbe';ctx.beginPath();ctx.arc(cx,cy,4.1,0,Math.PI*2);ctx.fill();
  }else{
   ctx.strokeStyle=developing?'rgba(218,175,103,.88)':active?'rgba(228,220,151,.85)':'rgba(187,211,195,.20)';
   ctx.lineWidth=developing?2:active?1.8:.6;ctx.stroke();
   if(developing){
    ctx.fillStyle='rgba(220,163,83,.09)';ctx.fill();
   }
  }
  if(hover===r.id&&!ready){ctx.fillStyle='rgba(229,239,212,.12)';ctx.fill();}
  ctx.restore();
 }
 ctx.strokeStyle='#738b813b';ctx.strokeRect(imgX,imgY,mapImg.width*mapScale,mapImg.height*mapScale);
}
function pointInPoly(point,poly){
 let inside=false;let j=poly.length-1;
 for(let i=0;i<poly.length;i++){
  const [xi,yi]=poly[i], [xj,yj]=poly[j];
  if(((yi>point[1])!=(yj>point[1]))&&(point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi))inside=!inside;j=i;
 }
 return inside;
}
function findRegion(x,y){const p=screenToWorld(x,y);return regions.find(r=>r.polygon_m?.length>=3&&pointInPoly(p,r.polygon_m))}
function localPoint(ev){const rect=canvas.getBoundingClientRect();return [ev.clientX-rect.left,ev.clientY-rect.top]}
canvas.addEventListener('pointerdown',ev=>{canvas.setPointerCapture(ev.pointerId);drag={x:ev.clientX,y:ev.clientY,px:panX,py:panY,moved:false};});
canvas.addEventListener('pointermove',ev=>{
 if(drag){const dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;drag.moved=drag.moved||Math.hypot(dx,dy)>5;panX=drag.px+dx;panY=drag.py+dy;paint();return}
 const [x,y]=localPoint(ev);const r=findRegion(x,y);const next=r?.id??null;
 if(next!==hover){hover=next;paint()}
 const tip=el('map-tooltip');if(r){
  const top=(r.biomes||[]).filter(x=>x.id!==0).sort((a,b)=>b.fraction-a.fraction)[0];
  tip.hidden=false;tip.innerHTML=`<b>${r.id}</b><br>${top?top.name:'Oceano'}<br>${stateName(r.id)}`;
  tip.style.left=Math.min(canvas.clientWidth-178,x+14)+'px';tip.style.top=Math.min(canvas.clientHeight-75,y+15)+'px';
 }else tip.hidden=true;
});
canvas.addEventListener('pointerup',ev=>{
 const d=drag;drag=null;
 if(d&&!d.moved){const [x,y]=localPoint(ev);const r=findRegion(x,y);if(r){selected=r.id;paint();updateSelection();}}
});
canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('pointerleave',()=>{hover=null;el('map-tooltip').hidden=true;paint()});
canvas.addEventListener('wheel',ev=>{
 ev.preventDefault();const [x,y]=localPoint(ev);const old=zoom;zoom=Math.min(17,Math.max(.7,zoom*Math.exp(-ev.deltaY*.001)));
 const cx=(x-imgX)/mapScale;const cy=(y-imgY)/mapScale;
 const base=Math.min(canvas.clientWidth/mapImg.width,canvas.clientHeight/mapImg.height);
 panX=x-(canvas.clientWidth-mapImg.width*base)/2-cx*base*zoom;
 panY=y-(canvas.clientHeight-mapImg.height*base)/2-cy*base*zoom;
 paint();
},{passive:false});
el('map-reset').onclick=resetAtlas;
el('focus-hex').onclick=()=>focusRegion(selected||'H_5_7');
function updateSelection(){
 const r=regions.find(z=>z.id===selected);if(!r)return;
 const ready=isReady(selected);const major=(r.biomes||[]).filter(b=>b.id!==0).sort((a,b)=>b.fraction-a.fraction)[0];
 el('atlas-title').textContent=ready?(progress.regions[selected]?.name||selected):`Região ${selected}`;
 el('atlas-info').textContent=`${selected} · ${major?.name||'Oceano'} · ${stateName(selected)}`;
 el('focus-hex').disabled=!r;
}
Promise.all([
 fetch(ROOT+'regions.json').then(r=>{if(!r.ok)throw Error('Regiões indisponíveis');return r.json()}),
 fetch(ROOT+'progress.json').then(r=>r.json()),
 new Promise((resolve,reject)=>{mapImg.onload=resolve;mapImg.onerror=()=>reject(Error('Mapa de biomas indisponível'));mapImg.src=ROOT+'biomes.png'})
]).then(([data,p])=>{regions=data.regions||[];progress=p;el('counter').textContent=`${(p.completed||[]).filter(id=>isComplete(id)).length} / ${regions.length} · ${(p.in_development||[]).length} em desenvolvimento`;mapReady=true;beginMap();updateSelection()}).catch(err=>{el('atlas-info').textContent='Não foi possível carregar o atlas: '+err.message});
new ResizeObserver(beginMap).observe(canvas);

// REAL MESH VIEWER — GLB geometry, not a photograph, with individual named scene groups.
const scene=new THREE.Scene();scene.background=new THREE.Color('#111d24');
const camera=new THREE.PerspectiveCamera(38,1,.1,950);camera.position.set(170,175,215);camera.lookAt(0,6,0);
const cameraPresets={
 overview:{pos:[170,175,215],target:[0,6,0]},
 river:{pos:[84,94,118],target:[7,6,5]},
 cliffs:{pos:[55,108,-91],target:[5,19,-42]},
 camp:{pos:[-125,85,98],target:[-56,8,24]}
};
function placeCamera(name){
 const view=cameraPresets[name]||cameraPresets.overview;
 camera.position.set(...view.pos);
 controls.target.set(...view.target);
 controls.update();
}
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.40;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.setSize(frame.clientWidth,frame.clientHeight,false);frame.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,6,0);controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=35;controls.maxDistance=440;controls.maxPolarAngle=Math.PI*.48;controls.enablePan=true;
scene.add(new THREE.HemisphereLight(0xdfeeff,0x4a5446,2.15));
const sun=new THREE.DirectionalLight(0xffeac2,3.55);sun.position.set(-75,130,100);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-130;sun.shadow.camera.right=130;sun.shadow.camera.top=130;sun.shadow.camera.bottom=-130;sun.shadow.camera.near=1;sun.shadow.camera.far=400;sun.shadow.bias=-.0003;scene.add(sun);
const rim=new THREE.DirectionalLight(0xaed2ff,.95);rim.position.set(75,90,-95);scene.add(rim);
const fireLight=new THREE.PointLight(0xff9d45,24,25,2);fireLight.position.set(-55,11,47);scene.add(fireLight);
let spin=false;let water=[];let model=null;const loader=new GLTFLoader();
function makeAnimatedWater(obj){
 obj.material=obj.material.clone(); // do not change shared rock/foam materials
 obj.material.roughness=.22;
 obj.material.metalness=.04;
 obj.material.onBeforeCompile=(shader)=>{
  shader.uniforms.uFlowTime={value:0};
  shader.vertexShader=shader.vertexShader.replace('#include <common>',
   '#include <common>\\nvarying vec3 vFlowPosition;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
   '#include <begin_vertex>\\nvFlowPosition=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
   '#include <common>\\nuniform float uFlowTime;\\nvarying vec3 vFlowPosition;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
   '#include <color_fragment>\\nfloat ripples=sin(vFlowPosition.z*.52-uFlowTime*2.3+sin(vFlowPosition.x*.37)*1.6);\\ndiffuseColor.rgb*=.944+.056*ripples;');
  obj.userData.flowShader=shader;
 };
 water.push(obj);
}
loader.load(ROOT+'forest-temperate.glb',({scene:gltf})=>{
 model=gltf;scene.add(gltf);let tris=0,meshes=0;
 gltf.traverse(obj=>{
  if(!obj.isMesh)return;meshes++;
  if(obj.geometry?.index)tris+=obj.geometry.index.count/3;else tris+=obj.geometry.attributes.position.count/3;
  // Color of the mesh is baked into vertex colors; preserve its appearance.
  obj.castShadow=['trees-trunks','broadleaf-canopies','pine-needles','rocks','ruins'].some(s=>obj.name.includes(s));
  obj.receiveShadow=true;
  if(obj.name.includes('river')||obj.name.includes('pond')||obj.name.includes('waterfalls')){
   if(obj.material)makeAnimatedWater(obj);
  }
  if(obj.name.includes('fire')&&obj.material){obj.material.emissive=new THREE.Color('#a74c08');obj.material.emissiveIntensity=.62;}
 });
 el('tris').textContent=Math.round(tris).toLocaleString('pt-BR');el('meshes').textContent=meshes.toLocaleString('pt-BR');el('scene-loading').style.display='none';
},undefined,err=>{el('scene-loading').innerHTML='<strong>Não foi possível abrir a cena 3D.</strong><span>'+String(err.message||err)+'</span>'});
el('reset-camera').onclick=()=>placeCamera('overview');
const startView=new URLSearchParams(window.location.search).get('view');
placeCamera(startView);
window.addEventListener('keydown',(event)=>{
 const target=event.target?.tagName?.toLowerCase();
 if(target==='input'||target==='textarea')return;
 const names={Digit1:'overview',Digit2:'river',Digit3:'cliffs',Digit4:'camp'};
 if(names[event.code])placeCamera(names[event.code]);
});

el('toggle-spin').onclick=()=>{spin=!spin;el('toggle-spin').classList.toggle('active',spin);el('toggle-spin').textContent=spin?'◼ Parar rotação':'↻ Girar automaticamente'};
const resize=()=>{const w=frame.clientWidth,h=frame.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)};new ResizeObserver(resize).observe(frame);
const clock=new THREE.Clock();
function tick(){requestAnimationFrame(tick);const t=clock.getElapsedTime();if(spin)controls.autoRotate=true;else controls.autoRotate=false;controls.autoRotateSpeed=.6;
 fireLight.intensity=18+6*Math.sin(t*9)+3*Math.sin(t*12);
 water.forEach(obj=>{if(obj.userData.flowShader)obj.userData.flowShader.uniforms.uFlowTime.value=t;});
 controls.update();renderer.render(scene,camera);
}
tick();
