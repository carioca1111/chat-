'use strict';
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target) throw new Error('Uso: node apply-alpha61.js <diretorio-alvo>');
const root = path.resolve(process.cwd(), target);
const p = name => path.join(root, name);
const read = name => fs.readFileSync(p(name), 'utf8');
const write = (name, text) => fs.writeFileSync(p(name), text, 'utf8');

// Versão.
const pkg = JSON.parse(read('package.json'));
pkg.version = '3.0.0-alpha.6.1';
write('package.json', JSON.stringify(pkg, null, 2) + '\n');

// UI: corrige o rótulo e garante que ARMAR LIVE exista, sem depender da ordem exata do HTML.
let html = read('index.html');
html = html.replace(/Alpha 5:[^<]*/g, 'Alpha 6.1: execução real protegida · ARMAR LIVE visível · Confirm/Semi/Auto · relógio do servidor.');
html = html.replace(/Alpha 6:[^<]*/g, 'Alpha 6.1: execução real protegida · ARMAR LIVE visível · Confirm/Semi/Auto · relógio do servidor.');
if (!html.includes('Alpha 6.1:')) {
  html = html.replace(/(<span class="eyebrow">ALPHA TERMINAL<\/span><h1>[^<]*<\/h1><p>)[^<]*(<\/p>)/, '$1Alpha 6.1: execução real protegida · ARMAR LIVE visível · Confirm/Semi/Auto · relógio do servidor.$2');
}
if (!html.includes('id="alphaLiveToggle"')) {
  const badge = /(<span id="alphaStatusBadge"[^>]*>[^<]*<\/span>)/;
  if (!badge.test(html)) throw new Error('Alpha 6.1: alphaStatusBadge não encontrado');
  html = html.replace(badge, '<button id="alphaLiveToggle" class="secondary-action live-arm-action">🔒 ARMAR LIVE</button>$1');
} else {
  html = html.replace(/<button id="alphaLiveToggle"([^>]*)>[^<]*<\/button>/, '<button id="alphaLiveToggle"$1>🔒 ARMAR LIVE</button>');
  html = html.replace(/id="alphaLiveToggle" class="([^"]*)"/, (m,c) => `id="alphaLiveToggle" class="${c.includes('live-arm-action')?c:c+' live-arm-action'}"`);
}
write('index.html', html);

// Mantém as notificações fora da barra de controles e dá destaque ao botão LIVE.
let css = read('styles.css');
css += `\n/* Gridium Alpha 6.1 LIVE UI hotfix */\n#notice{position:fixed!important;top:92px!important;right:18px!important;left:auto!important;width:auto!important;max-width:min(560px,calc(100vw - 36px))!important;z-index:1000!important;border:1px solid #8a6330!important;border-radius:10px!important;box-shadow:0 14px 36px rgba(0,0,0,.42)!important;padding:10px 14px!important}\n.live-arm-action{display:inline-flex!important;visibility:visible!important;opacity:1!important;position:relative!important;z-index:4!important;background:linear-gradient(180deg,#17493a,#12352c)!important;border:1px solid #58c49e!important;color:#c5ffe9!important;font-weight:800!important;min-width:145px!important;align-items:center!important;justify-content:center!important}\n@media(max-width:1250px){.module-header{align-items:flex-start!important;flex-direction:column!important}.module-actions{justify-content:flex-start!important;width:100%!important}.live-arm-action{order:-20!important}#alphaStatusBadge{order:-19!important}}\n`;
write('styles.css', css);

// Confere que a lógica LIVE real da Alpha 6 continua presente.
const renderer = read('renderer.js');
const preload = read('preload.js');
const main = read('main.js');
const engine = read('alpha-engine.js');
if (!html.includes('id="alphaLiveToggle"') || !html.includes('Alpha 6.1:')) throw new Error('Alpha 6.1: controle LIVE não ficou visível no HTML');
if (!renderer.includes("$('alphaLiveToggle').onclick")) throw new Error('Alpha 6.1: handler ARMAR LIVE ausente no renderer');
if (!preload.includes('alphaLiveUnlock:')) throw new Error('Alpha 6.1: bridge alphaLiveUnlock ausente');
for (const channel of ['grid:alpha-live-unlock','grid:alpha-live-buy','grid:alpha-live-reprice','grid:alpha-live-cancel']) {
  if (!main.includes(channel)) throw new Error(`Alpha 6.1: canal LIVE ausente: ${channel}`);
}
if (!engine.includes('unlockLive(')) throw new Error('Alpha 6.1: AlphaEngine sem unlockLive');

console.log('Gridium 3.0.0-alpha.6.1 aplicado: ARMAR LIVE visível e lógica LIVE verificada.');
