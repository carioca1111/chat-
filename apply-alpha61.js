'use strict';
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target) throw new Error('Uso: node apply-alpha61.js <diretorio-alvo>');
const root = path.resolve(process.cwd(), target);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(root, f), s);

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = '3.0.0-alpha.6.1';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

let html = read('index.html');
html = html.replace(
  'Alpha 6: execução real protegida, Confirm/Semi/Auto, relógio do servidor e Repricing Guard.',
  'Alpha 6.1: execução real protegida · ARMAR LIVE visível · Confirm/Semi/Auto · relógio do servidor.'
);
const oldActions = '<div class="module-actions"><span id="alphaStatusBadge" class="safe-chip warning">LIVE BLOQUEADO</span><button id="alphaLiveToggle" class="secondary-action">ARMAR LIVE</button><select id="alphaMode">';
const newActions = '<div class="module-actions alpha-live-actions"><button id="alphaLiveToggle" class="live-arm-action">🔒 ARMAR LIVE</button><span id="alphaStatusBadge" class="safe-chip warning">LIVE BLOQUEADO</span><select id="alphaMode">';
if (!html.includes(oldActions)) throw new Error('Alpha 6.1: barra Alpha esperada não encontrada');
html = html.replace(oldActions, newActions);
write('index.html', html);

let css = read('styles.css');
css += `\n/* Alpha 6.1 UI hotfix */\n#notice{position:fixed!important;top:92px!important;right:18px!important;left:auto!important;width:auto!important;max-width:min(560px,calc(100vw - 36px))!important;z-index:1000!important;border:1px solid #8a6330!important;border-radius:10px!important;box-shadow:0 14px 36px rgba(0,0,0,.42)!important;padding:10px 14px!important}\n.alpha-live-actions{position:relative;z-index:2}.live-arm-action{background:linear-gradient(180deg,#17493a,#12352c)!important;border:1px solid #3d9a79!important;color:#c5ffe9!important;font-weight:800!important;letter-spacing:.25px!important;min-width:138px!important;box-shadow:0 0 0 1px rgba(95,222,183,.10),0 6px 18px rgba(0,0,0,.24)!important}.live-arm-action:hover{background:linear-gradient(180deg,#1e5b48,#174235)!important;border-color:#65cba8!important}\n@media(max-width:1250px){.module-header{flex-direction:column}.module-actions{justify-content:flex-start;width:100%}.live-arm-action{order:-20}.alpha-live-actions #alphaStatusBadge{order:-19}}\n`;
write('styles.css', css);

let renderer = read('renderer.js');
const oldNotify = "function notify(text){$('notice').textContent=text;$('notice').hidden=!text;}";
const newNotify = "let noticeTimer=null;function notify(text){const n=$('notice');n.textContent=text;n.hidden=!text;if(noticeTimer){clearTimeout(noticeTimer);noticeTimer=null;}if(text){noticeTimer=setTimeout(()=>{n.hidden=true;n.textContent='';noticeTimer=null;},4500);}}";
if (!renderer.includes(oldNotify)) throw new Error('Alpha 6.1: função notify esperada não encontrada');
renderer = renderer.replace(oldNotify, newNotify);
renderer = renderer.replace("liveBtn.textContent=live?'BLOQUEAR LIVE':'ARMAR LIVE';", "liveBtn.textContent=live?'🔓 BLOQUEAR LIVE':'🔒 ARMAR LIVE';");
write('renderer.js', renderer);

const readmePath = path.join(root, 'README.md');
if (fs.existsSync(readmePath)) {
  let md = fs.readFileSync(readmePath, 'utf8');
  md = md.replace(/Gridium 3\.0 Alpha 6(?!\.1)/g, 'Gridium 3.0 Alpha 6.1');
  fs.writeFileSync(readmePath, md);
}

const finalHtml = read('index.html');
const finalRenderer = read('renderer.js');
if (!finalHtml.includes('id="alphaLiveToggle"') || !finalHtml.includes('Alpha 6.1')) throw new Error('Alpha 6.1: ARMAR LIVE não foi inserido');
if (!finalRenderer.includes("$('alphaLiveToggle').onclick")) throw new Error('Alpha 6.1: handler do ARMAR LIVE ausente');
console.log('Gridium 3.0.0-alpha.6.1 aplicado: ARMAR LIVE visível e notice fora da barra.');
