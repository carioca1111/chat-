'use strict';
const fs = require('fs');
const path = require('path');
const target = process.argv[2];
if (!target) throw new Error('Uso: node apply-alpha61.js <diretorio-alvo>');
const root = path.resolve(process.cwd(), target);
const p = n => path.join(root,n);
const read = n => fs.readFileSync(p(n),'utf8');
const write = (n,t) => fs.writeFileSync(p(n),t,'utf8');

const pkg = JSON.parse(read('package.json'));
pkg.version = '3.0.0-alpha.6.1';
write('package.json', JSON.stringify(pkg,null,2)+'\n');

let html = read('index.html');
html = html.replace(/Alpha 5:[^<]*/g,'Alpha 6.1: execução real protegida · ARMAR LIVE · Confirm/Semi/Auto.');
html = html.replace(/Alpha 6:[^<]*/g,'Alpha 6.1: execução real protegida · ARMAR LIVE · Confirm/Semi/Auto.');
if (!html.includes('id="alphaLiveToggle"')) {
  const badge = /(<span id="alphaStatusBadge"[^>]*>[^<]*<\/span>)/;
  if (!badge.test(html)) throw new Error('alphaStatusBadge não encontrado');
  html = html.replace(badge,'<button id="alphaLiveToggle" class="secondary-action live-arm-action">🔒 ARMAR LIVE</button>$1');
}
write('index.html',html);

let css = read('styles.css');
if (!css.includes('Alpha 6.1 LIVE UI')) {
  css += '\n/* Alpha 6.1 LIVE UI */\n.live-arm-action{display:inline-flex!important;visibility:visible!important;opacity:1!important;background:#17493a!important;border:1px solid #58c49e!important;color:#c5ffe9!important;font-weight:800!important;min-width:145px!important;align-items:center!important;justify-content:center!important}\n';
  write('styles.css',css);
}

const preload = read('preload.js');
const main = read('main.js');
if (!preload.includes('alphaLiveUnlock:')) throw new Error('alphaLiveUnlock bridge ausente');
if (!main.includes('grid:alpha-live-unlock')) throw new Error('LIVE unlock IPC ausente');
const m = preload.match(/contextBridge\.exposeInMainWorld\(\s*['"]([^'"]+)['"]/);
const bridge = m ? m[1] : 'gridium';
let renderer = read('renderer.js');
if (!renderer.includes('GRID_ALPHA61_ARM_HANDLER')) {
  renderer += `\n// GRID_ALPHA61_ARM_HANDLER\n(() => {\n const wire=()=>{const b=document.getElementById('alphaLiveToggle');if(!b||b.dataset.wired)return;b.dataset.wired='1';b.onclick=async()=>{const phrase=prompt('Digite exatamente: ATIVAR LIVE');if(phrase!=='ATIVAR LIVE')return;const api=window[${JSON.stringify(bridge)}];if(!api||typeof api.alphaLiveUnlock!=='function'){alert('Bridge LIVE indisponível');return;}b.disabled=true;let r;try{r=await api.alphaLiveUnlock(phrase);}catch(e){try{r=await api.alphaLiveUnlock({phrase,confirmation:phrase,confirm:phrase});}catch(e2){b.disabled=false;alert(e2.message||'Falha ao armar LIVE');return;}}b.disabled=false;if(r&&r.ok===false){alert(r.message||r.error||'LIVE não liberado');return;}b.textContent='🔓 LIVE ARMADO';const s=document.getElementById('alphaStatusBadge');if(s)s.textContent='PROTOCOLO OK · LIVE ARMADO';};};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();\n})();\n`;
  write('renderer.js',renderer);
}
if (!read('index.html').includes('id="alphaLiveToggle"')) throw new Error('ARMAR LIVE ausente');
if (!read('renderer.js').includes('GRID_ALPHA61_ARM_HANDLER')) throw new Error('handler ARMAR LIVE ausente');
console.log('Gridium 3.0.0-alpha.6.1 hotfix aplicado.');
