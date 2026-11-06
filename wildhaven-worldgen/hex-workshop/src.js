import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { BIOME_STYLE, buildHexScene, defaultSettings } from './procedural.js';

const ROOT=import.meta.env.BASE_URL;
const el=id=>document.getElementById(id);
const canvas=el('atlas'),ctx=canvas.getContext('2d');
const mapImg=new Image();
const W=6400000,H=8000000,STORE='wildhaven.hex-factory.v1';
const PREVIEW_ID='H_5_7',CONTROLS=['trees','rocks','relief','detail','water'];
let regions=[],worldProgress={},hover=null,selected=PREVIEW_ID;
let local={version:1,selected:PREVIEW_ID,regions:{}};
let imgX=0,imgY=0,mapScale=1,zoom=1,panX=0,panY=0,drag=null;
let activeGroup=null,activeKind=null,activeRegion=null,loadingGeneration=0;
let currentSettings=null,dirty=false,modelStats=null;
let spinner=false;

function loadLocal(){
 try{const data=JSON.parse(localStorage.getItem(STORE)||'null');if(data?.version===1&&typeof data.regions==='object')local=data;}catch(e){console.warn('Local storage unavailable',e);}
}
function saveLocal(){
 try{local.selected=selected;localStorage.setItem(STORE,JSON.stringify(local));el('save-hint').textContent='Salvo neste navegador. Para guardar em outro PC ou navegador, use “Projeto JSON”.';}
 catch(e){el('save-hint').textContent='Seu navegador bloqueou o armazenamento local. Exporte o Projeto JSON para não perder os dados.';}
}
const getRegion=id=>regions.find(r=>r.id===id);
const draftInfo=id=>local.regions[id];
const sourceInfo=id=>worldProgress.regions?.[id];
const isApproved=id=>draftInfo(id)?.status==='approved';
const isDraft=id=>!!draftInfo(id)||id===PREVIEW_ID&&!!sourceInfo(id)?.glb;
const getStatus=id=>isApproved(id)?'Aprovado localmente':isDraft(id)?'Rascunho salvo':'Pendente';
const dominantBiome=r=>{
 const dominant=(r?.biomes||[]).reduce((a,b)=>b.fraction>a.fraction?b:a,{id:0,fraction:-1});return dominant;
};
function countStatus(){
 const approved=regions.filter(r=>isApproved(r.id)).length;
 const drafts=regions.filter(r=>isDraft(r.id)&&!isApproved(r.id)).length;
 el('approved-count').textContent=approved;
 el('counter').textContent=`${approved} / ${regions.length} aprovados`;
 el('draft-count').textContent=`${drafts} rascunho(s) · 1 modelo original disponível`;
 el('progress-fill').style.width=`${regions.length?approved/regions.length*100:0}%`;
}
function restoreControls(){
 const item=draftInfo(selected),data=item?.settings||defaultSettings(getRegion(selected));
 currentSettings={...data};dirty=false;
 for(const key of CONTROLS){const v=Number(data[key]??50);el(key).value=v;el(key+'-value').textContent=`${v}%`;}
 el('seed').value=data.seed;
}
function readControls(){
 const params={seed:Math.min(4294967295,Math.max(1,Math.floor(Number(el('seed').value)||1)))};
 for(const key of CONTROLS)params[key]=Number(el(key).value);
 return params;
}
function markDirty(){
 dirty=true;for(const key of CONTROLS)el(key+'-value').textContent=`${el(key).value}%`;
 el('approve').disabled=true;el('export-glb').disabled=true;
 el('save-hint').textContent='Parâmetros alterados. Clique em “Gerar paisagem 3D” para atualizar a malha antes de exportar ou aprovar.';
}
for(const key of CONTROLS)el(key).addEventListener('input',markDirty);
el('seed').addEventListener('input',markDirty);
el('reset-settings').onclick=()=>{
 const d=defaultSettings(getRegion(selected));el('seed').value=d.seed;
 for(const key of CONTROLS)el(key).value=d[key];markDirty();
};
el('new-seed').onclick=()=>{
 const num=Number(el('seed').value)||1;
 el('seed').value=(num*1664525+1013904223)>>>0||1;
 markDirty();
};

// -----------------------------------------------------
// Atlas: source polygons and biome raster are unchanged.
// -----------------------------------------------------
function canvasSize(){
 const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
 if(!rect.width||!rect.height)return;
 canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);drawAtlas();
}
const worldToImg=(x,y)=>[mapImg.width*x/W,mapImg.height*(1-y/H)];
const imgToScreen=(x,y)=>[imgX+x*mapScale,imgY+y*mapScale];
function screenToWorld(x,y){return [(x-imgX)/mapScale/mapImg.width*W,H-(y-imgY)/mapScale/mapImg.height*H];}
function drawAtlas(){
 const w=canvas.clientWidth,h=canvas.clientHeight;
 if(!w||!h)return;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#0e2025';ctx.fillRect(0,0,w,h);
 if(!mapImg.naturalWidth)return;
 const base=Math.min(w/mapImg.width,h/mapImg.height);mapScale=base*zoom;
 imgX=(w-mapImg.width*base)/2+panX;imgY=(h-mapImg.height*base)/2+panY;
 ctx.drawImage(mapImg,imgX,imgY,mapImg.width*mapScale,mapImg.height*mapScale);
 for(const r of regions){
  if(!Array.isArray(r.polygon_m)||r.polygon_m.length<3)continue;
  const pts=r.polygon_m.map(p=>imgToScreen(...worldToImg(...p)));
  if(pts.every(p=>p[0]<-40)||pts.every(p=>p[0]>w+40)||pts.every(p=>p[1]<-40)||pts.every(p=>p[1]>h+40))continue;
  ctx.save();ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();
  const approved=isApproved(r.id),draft=isDraft(r.id),active=selected===r.id;
  if(approved){
   ctx.fillStyle='rgba(223,249,183,.28)';ctx.fill();ctx.strokeStyle='#e9fbbb';ctx.lineWidth=active?3.1:2.2;
   ctx.shadowBlur=23;ctx.shadowColor='#e5ffc0';ctx.stroke();ctx.shadowBlur=0;
   const [cx,cy]=imgToScreen(...worldToImg(...r.center_m));ctx.fillStyle='#f2ffca';ctx.beginPath();ctx.arc(cx,cy,4.3,0,Math.PI*2);ctx.fill();
  }else{
   if(draft){ctx.fillStyle='rgba(215,160,91,.16)';ctx.fill();}
   ctx.strokeStyle=active?'#f5e0a8':draft?'#d2a46b':'#b5cfb72e';
   ctx.lineWidth=active?2.4:draft?1.7:.65;ctx.stroke();
  }
  if(hover===r.id){ctx.fillStyle='rgba(232,246,208,.13)';ctx.fill();}
  ctx.restore();
 }
}
function resetAtlas(){zoom=1;panX=panY=0;drawAtlas();}
function focusRegion(id){
 const r=getRegion(id);if(!r||!mapImg.naturalWidth)return;
 selected=id;zoom=5.0;
 const [ix,iy]=worldToImg(...r.center_m),w=canvas.clientWidth,h=canvas.clientHeight;
 const base=Math.min(w/mapImg.width,h/mapImg.height);
 panX=w/2-(w-mapImg.width*base)/2-ix*base*zoom;
 panY=h/2-(h-mapImg.height*base)/2-iy*base*zoom;
 drawAtlas();updateSelection(false);
}
function pointInPoly(point,poly){
 let inside=false;let j=poly.length-1;
 for(let i=0;i<poly.length;i++){
  const [xi,yi]=poly[i],[xj,yj]=poly[j];
  if(((yi>point[1])!==(yj>point[1]))&&(point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi))inside=!inside;
  j=i;
 }
 return inside;
}
function findRegion(x,y){const p=screenToWorld(x,y);return regions.find(r=>r.polygon_m?.length>=3&&pointInPoly(p,r.polygon_m));}
function localPoint(event){const rec=canvas.getBoundingClientRect();return [event.clientX-rec.left,event.clientY-rec.top];}
canvas.addEventListener('pointerdown',ev=>{canvas.setPointerCapture(ev.pointerId);drag={x:ev.clientX,y:ev.clientY,px:panX,py:panY,moved:false};});
canvas.addEventListener('pointermove',ev=>{
 if(drag){const dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;drag.moved ||= Math.hypot(dx,dy)>6;panX=drag.px+dx;panY=drag.py+dy;drawAtlas();return;}
 const [x,y]=localPoint(ev),region=findRegion(x,y),next=region?.id??null;
 if(hover!==next){hover=next;drawAtlas();}
 const tooltip=el('map-tooltip');
 if(region){tooltip.hidden=false;tooltip.textContent=`${region.id} · ${dominantBiome(region).name||'Oceano'} · ${getStatus(region.id)}`;
 tooltip.style.left=Math.min(canvas.clientWidth-195,x+12)+'px';tooltip.style.top=Math.min(canvas.clientHeight-47,y+12)+'px';}
 else tooltip.hidden=true;
});
canvas.addEventListener('pointerup',ev=>{
 const d=drag;drag=null;
 if(d&&!d.moved){const [x,y]=localPoint(ev),r=findRegion(x,y);if(r){selected=r.id;updateSelection(true);drawAtlas();}}
});
canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('pointerleave',()=>{hover=null;el('map-tooltip').hidden=true;drawAtlas();});
canvas.addEventListener('wheel',ev=>{
 ev.preventDefault();const [x,y]=localPoint(ev);
 const old=mapScale,newZoom=THREE.MathUtils.clamp(zoom*Math.exp(-ev.deltaY*.001),.7,18);
 zoom=newZoom;
 const base=Math.min(canvas.clientWidth/mapImg.width,canvas.clientHeight/mapImg.height);
 const cx=(x-imgX)/old,cy=(y-imgY)/old;
 panX=x-(canvas.clientWidth-mapImg.width*base)/2-cx*base*zoom;
 panY=y-(canvas.clientHeight-mapImg.height*base)/2-cy*base*zoom;
 drawAtlas();
},{passive:false});
el('map-reset').onclick=resetAtlas;
el('focus-hex').onclick=()=>focusRegion(selected);

// -----------------------------------------------------
// Scene viewer; original H_5_7 GLB + procedural scenes.
// -----------------------------------------------------
const frame=el('three-view');const scene=new THREE.Scene();scene.background=new THREE.Color('#19282b');
const camera=new THREE.PerspectiveCamera(39,1,.1,950);camera.position.set(175,168,220);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.setSize(Math.max(1,frame.clientWidth),Math.max(1,frame.clientHeight),false);
frame.appendChild(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);
orbit.target.set(0,8,0);orbit.enableDamping=true;orbit.dampingFactor=.085;
orbit.enablePan=true;orbit.maxPolarAngle=Math.PI*.49;orbit.minDistance=33;orbit.maxDistance=480;
scene.add(new THREE.HemisphereLight(0xeef6e9,0x596d57,2.05));
const light=new THREE.DirectionalLight(0xffeccb,2.4);light.position.set(-94,142,105);light.castShadow=true;
light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-137;light.shadow.camera.right=137;light.shadow.camera.top=137;light.shadow.camera.bottom=-137;light.shadow.camera.far=390;light.shadow.bias=-.0004;scene.add(light);
const rim=new THREE.DirectionalLight(0xc1e1ef,.4);rim.position.set(80,64,-90);scene.add(rim);
function resetCamera(){camera.position.set(171,158,216);orbit.target.set(0,6,0);orbit.update();}
resetCamera();
function setSceneMessage(text){el('scene-message').textContent=text;}
function showLoading(title,detail){
 const widget=el('scene-loading');widget.style.display='flex';widget.querySelector('strong').textContent=title;widget.querySelector('small').textContent=detail;
}
function hideLoading(){el('scene-loading').style.display='none';}
function clearGroup(){
 if(!activeGroup)return;
 scene.remove(activeGroup);
 activeGroup.traverse(obj=>{if(!obj.isMesh)return;obj.geometry?.dispose();const mats=Array.isArray(obj.material)?obj.material:[obj.material];mats.forEach(m=>m?.dispose());});
 activeGroup=null;activeKind=null;activeRegion=null;modelStats=null;
}
function countGroup(group){
 let triangles=0,meshes=0;
 group.traverse(o=>{if(!o.isMesh)return;meshes++;
  const n=o.geometry?.index?.count?o.geometry.index.count/3:(o.geometry?.attributes?.position?.count||0)/3;
  triangles+=Math.round(n)*(o.isInstancedMesh?o.count:1);
 });return {triangles,meshes};
}
function setModel(group,kind,stats){
 clearGroup();activeGroup=group;activeKind=kind;activeRegion=selected;modelStats=stats;
 scene.add(group);resetCamera();
 const counts=countGroup(group);el('tris').textContent=counts.triangles.toLocaleString('pt-BR');el('meshes').textContent=counts.meshes;
 el('trees').textContent=stats?.trees?.toLocaleString('pt-BR')||'—';
 el('rocks').textContent=stats?.rocks?.toLocaleString('pt-BR')||'—';
 el('scene-badge').textContent=kind==='original'?'MODELO ORIGINAL':'PRÉVIA PROCEDURAL';
 el('view-kind').textContent=kind==='original'?'GLB ORIGINAL':'MALHAS GERADAS';
 el('export-glb').disabled=false;el('approve').disabled=false;dirty=false;
 hideLoading();
}
const modelLoader=new GLTFLoader();
function loadOriginal(){
 if(selected!==PREVIEW_ID)return;
 const token=++loadingGeneration;
 showLoading('Carregando Bosque das Cascatas','Abrindo o modelo GLB original');
 modelLoader.load(ROOT+'forest-temperate.glb',result=>{
  if(token!==loadingGeneration)return;
  const group=result.scene;
  group.traverse(o=>{if(!o.isMesh)return;
   // Support GLBs authored with vertex colors. All natural materials are dielectric.
   const material=o.material?.clone();if(material){material.metalness=0;material.roughness=.86;material.side=THREE.DoubleSide;o.material=material;}
   o.receiveShadow=true;o.castShadow=['rocks','trees-trunks','broadleaf-canopies','pine-needles','ruins'].some(name=>o.name.includes(name));
  });
  setModel(group,'original',{trees:276,rocks:null});
  setSceneMessage('Bosque das Cascatas: modelo mid-poly original em GLB. Use “Gerar paisagem” para experimentar uma nova composição. O original permanece preservado no repositório.');
 },undefined,err=>{
  if(token!==loadingGeneration)return;
  showLoading('Falha ao carregar a malha','Verifique a conexão e atualize a página');
  console.error(err);
 });
}
function previewMessage(){
 clearGroup();el('tris').textContent='—';el('meshes').textContent='—';el('trees').textContent='—';el('rocks').textContent='—';
 el('export-glb').disabled=true;el('approve').disabled=true;
 showLoading('Hexágono pronto para gerar','Ajuste os parâmetros e clique em “Gerar paisagem 3D”');
 el('scene-badge').textContent='NÃO MODELADO';el('view-kind').textContent='AGUARDANDO GERAÇÃO';
 setSceneMessage('Região ainda não modelada. A prévia será gerada com malhas reais usando o bioma predominante e a informação de rios do mapa do Codex.');
}
function generateScene(params=readControls(), options={restore:false}){
 const region=getRegion(selected);if(!region)return;
 const id=selected,token=++loadingGeneration;
 showLoading('Gerando malhas 3D...','Terreno, escarpas, rios e vegetação');
 el('generate').disabled=true;
 // Yield to the browser so the loading state actually paints before the CPU job.
 setTimeout(()=>{
  if(token!==loadingGeneration){el('generate').disabled=false;return;}
  try{
   const result=buildHexScene(region,params);
   if(token!==loadingGeneration)return;
   setModel(result.group,'generated',result.stats);
   local.regions[id]={status:options.restore&&local.regions[id]?.status==='approved'?'approved':'draft',settings:result.settings,kind:'generated',updated:new Date().toISOString()};
   saveLocal();currentSettings=result.settings;updateSelection(false);drawAtlas();countStatus();
   const waterNote=result.hasRiver?'rio procedural ilustrativo baseado na presença de rios':'sem rio novo: os dados geográficos não indicam um curso principal nesta região';
   setSceneMessage(`Prévia 3D gerada localmente com seed ${result.settings.seed}: ${result.stats.trees} árvores e ${result.stats.rocks} rochas. ${waterNote}. Antes de aprovar para o jogo, conferir junções com vizinhos, fauna, colisões e fidelidade geográfica.`);
  }catch(err){console.error(err);showLoading('Falha ao gerar paisagem',String(err.message||err));}
  finally{el('generate').disabled=false;}
 },40);
}
el('generate').onclick=()=>generateScene();
el('load-original').onclick=loadOriginal;
el('reset-camera').onclick=resetCamera;
el('toggle-spin').onclick=()=>{spinner=!spinner;el('toggle-spin').classList.toggle('active',spinner);el('toggle-spin').textContent=spinner?'◼ Parar rotação':'↻ Girar';};
function resizeViewer(){const w=Math.max(1,frame.clientWidth),h=Math.max(1,frame.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
new ResizeObserver(resizeViewer).observe(frame);
const ticker=new THREE.Clock();
function tick(){requestAnimationFrame(tick);orbit.autoRotate=spinner;orbit.autoRotateSpeed=.55;
 orbit.update();renderer.render(scene,camera);
}
tick();

// -----------------------------------------------------
// Export/review — storage is LOCAL, never a global approval.
// -----------------------------------------------------
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
el('export-glb').onclick=()=>{
 if(!activeGroup||activeRegion!==selected||dirty)return;
 el('export-glb').disabled=true;const btn=el('export-glb');btn.textContent='Exportando...';
 try{
  const exporter=new GLTFExporter();exporter.parse(activeGroup,result=>{
   downloadBlob(new Blob([result],{type:'model/gltf-binary'}),`${selected}_${activeKind}_wildhaven.glb`);
   btn.textContent='↓ Baixar GLB';btn.disabled=false;
  },err=>{console.error(err);btn.textContent='↓ Baixar GLB';btn.disabled=false;alert('Falha na exportação do GLB: '+String(err.message||err));},{binary:true,onlyVisible:true,includeCustomExtensions:true});
 }catch(err){btn.textContent='↓ Baixar GLB';btn.disabled=false;alert('Falha na exportação do GLB: '+String(err.message||err));}
};
function projectSnapshot(){
 return {schema:'wildhaven-hex-factory-project/v1',generated_at:new Date().toISOString(),world:'Auralis',world_seed:20051028,
  total_hexes:regions.length,storage:'browser-local',regions:local.regions,selected};
}
el('export-json').onclick=()=>downloadBlob(new Blob([JSON.stringify(projectSnapshot(),null,2)],{type:'application/json'}),'Wildhaven_Hex_Factory_Projeto.json');
el('import-json').onclick=()=>el('project-file').click();
el('project-file').addEventListener('change',async ev=>{
 const file=ev.target.files?.[0];if(!file)return;
 try{
  const data=JSON.parse(await file.text());
  if(data.schema!=='wildhaven-hex-factory-project/v1'||!data.regions||typeof data.regions!=='object')throw Error('Arquivo de projeto inválido');
  if(!confirm('Importar projeto e substituir as aprovações e parâmetros salvos neste navegador?'))return;
  const filtered={};for(const [id,v] of Object.entries(data.regions)){
   if(!getRegion(id)||!v||typeof v!=='object'||!v.settings)continue;
   const settings={...defaultSettings(getRegion(id))};
   const seed=Number(v.settings.seed);settings.seed=Number.isSafeInteger(seed)&&seed>0?seed>>>0:settings.seed;
   for(const key of CONTROLS){const num=Number(v.settings[key]);if(Number.isFinite(num))settings[key]=Math.max(0,Math.min(100,num));}
   filtered[id]={status:v.status==='approved'?'approved':'draft',kind:v.kind==='original'&&id===PREVIEW_ID?'original':'generated',settings};
  }
  local={version:1,selected:getRegion(data.selected)?data.selected:PREVIEW_ID,regions:filtered};
  selected=local.selected;saveLocal();updateSelection(true);drawAtlas();countStatus();
 }catch(err){alert('Não foi possível importar: '+String(err.message||err));}
 finally{ev.target.value='';}
});
el('approve').onclick=()=>{
 if(!activeGroup||activeRegion!==selected||dirty)return;
 if(isApproved(selected)){
  if(!confirm(`Remover a aprovação local de ${selected}? O arquivo GLB continuará disponível para exportação.`))return;
  local.regions[selected]={...local.regions[selected],status:'draft'};
 }else{
  const text='Aprovar '+selected+' SOMENTE neste navegador? Isso ilumina a região no atlas pessoal, mas não significa que colisões, junções entre hexágonos ou integração ao jogo foram validadas.';
  if(!confirm(text))return;
  local.regions[selected]={status:'approved',kind:activeKind,settings:currentSettings||readControls(),updated:new Date().toISOString()};
 }
 saveLocal();updateSelection(false);countStatus();drawAtlas();
};
function updateSelection(load){
 const region=getRegion(selected);if(!region)return;
 const biome=dominantBiome(region);const style=BIOME_STYLE[biome.id]||BIOME_STYLE[1];
 const title=sourceInfo(selected)?.name||`Região ${selected}`;
 el('atlas-title').textContent=title;el('atlas-info').textContent=`${selected} · ${biome.name||style.name} · ${getStatus(selected)}`;
 el('selected-details').textContent=`${(region.rivers||[]).length} rios catalogados · Elevação média ${Math.round(region.elevation_m?.mean||0)} m · Cena condensada 2 km`;
 el('selected-hex').textContent=selected;el('biome-name').textContent=biome.name||style.name;
 el('scene-title').textContent=title;
 el('status-tag').textContent=getStatus(selected);el('status-tag').classList.toggle('approved',isApproved(selected));
 el('approve').textContent=isApproved(selected)?'↶ Retirar aprovação local':'✓ Aprovar este hexágono';el('approve').classList.toggle('approved',isApproved(selected));
 el('load-original').hidden=selected!==PREVIEW_ID;
 if(load){
  ++loadingGeneration;restoreControls();saveLocal();
  if(draftInfo(selected)?.kind==='generated'){generateScene(draftInfo(selected).settings,{restore:true});}
  else if(selected===PREVIEW_ID){loadOriginal();}
  else previewMessage();
 }
 const matches=activeRegion===selected&&!dirty;
 el('approve').disabled=!matches;el('export-glb').disabled=!matches;
}
// Startup: load exact Codex atlas/progress and the original forest asset.
loadLocal();
Promise.all([
 fetch(ROOT+'regions.json').then(r=>{if(!r.ok)throw Error('Falha ao carregar regiões');return r.json();}),
 fetch(ROOT+'progress.json').then(r=>{if(!r.ok)throw Error('Falha ao carregar progresso');return r.json();}),
 new Promise((resolve,reject)=>{mapImg.onload=resolve;mapImg.onerror=()=>reject(Error('Imagem geográfica indisponível'));mapImg.src=ROOT+'biomes.png';})
]).then(([data,progress])=>{
 regions=data.regions||[];worldProgress=progress;
 if(!getRegion(local.selected))selected=PREVIEW_ID;else selected=local.selected;
 restoreControls();canvasSize();countStatus();updateSelection(true);
}).catch(err=>{console.error(err);showLoading('Falha ao preparar ateliê',String(err.message||err));el('atlas-info').textContent='O atlas não pôde ser carregado.';});
new ResizeObserver(canvasSize).observe(canvas);
window.__wildhavenInspect=()=>({regions:regions.length,selected,modelLoaded:Boolean(activeGroup),modelKind:activeKind,
 renderCalls:renderer.info.render.calls,renderTriangles:renderer.info.render.triangles,approved:regions.filter(r=>isApproved(r.id)).length,
 generatedSeed:currentSettings?.seed,dirty});