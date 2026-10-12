'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const target = process.argv[2];
if (!target) throw new Error('Uso: node apply-alpha61.js <diretorio-alvo>');
const root = path.resolve(process.cwd(), target);
if (!fs.existsSync(root)) throw new Error(`Diretorio alvo nao existe: ${root}`);

const chunksDir = path.join(__dirname, 'alpha61-full');
const parts = ['part00.b64','part01.b64','part02.b64','part03.b64','part04.b64','part05.b64'];
const b64 = parts.map(n => fs.readFileSync(path.join(chunksDir,n),'utf8').trim()).join('');
const patch = zlib.gunzipSync(Buffer.from(b64,'base64'));
const tmp = path.join(__dirname, '.alpha61-full.patch.tmp');
fs.writeFileSync(tmp, patch);
try {
  const relTarget = path.relative(process.cwd(), root).replace(/\\/g,'/');
  if (!relTarget || relTarget.startsWith('..')) throw new Error(`Diretorio alvo invalido: ${relTarget}`);
  const r = spawnSync('git',['apply','--unsafe-paths','--whitespace=nowarn',`--directory=${relTarget}`,tmp],{cwd:process.cwd(),stdio:'inherit'});
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`Alpha 6.1: git apply falhou com codigo ${r.status}`);
} finally { try { fs.unlinkSync(tmp); } catch {} }

const p = name => path.join(root,name);
const read = name => fs.readFileSync(p(name),'utf8');
const write = (name,text) => fs.writeFileSync(p(name),text,'utf8');

const pkg = JSON.parse(read('package.json'));
pkg.version = '3.0.0-alpha.6.1';
write('package.json', JSON.stringify(pkg,null,2)+'\n');

let html = read('index.html');
html = html.replace(/Alpha 5:[^<]*/g,'Alpha 6.1: execução real protegida · ARMAR LIVE visível · Confirm/Semi/Auto · relógio do servidor.');
html = html.replace(/Alpha 6:[^<]*/g,'Alpha 6.1: execução real protegida · ARMAR LIVE visível · Confirm/Semi/Auto · relógio do servidor.');
if (!html.includes('id="alphaLiveToggle"')) {
  const badge = /(<span id="alphaStatusBadge"[^>]*>[^<]*<\/span>)/;
  if (!badge.test(html)) throw new Error('Alpha 6.1: alphaStatusBadge não encontrado');
  html = html.replace(badge,'<button id="alphaLiveToggle" class="secondary-action live-arm-action">🔒 ARMAR LIVE</button>$1');
}
html = html.replace(/<button id="alphaLiveToggle"([^>]*)>[^<]*<\/button>/,'<button id="alphaLiveToggle"$1>🔒 ARMAR LIVE</button>');
html = html.replace(/id="alphaLiveToggle" class="([^"]*)"/, (m,c) => `id="alphaLiveToggle" class="${c.includes('live-arm-action')?c:c+' live-arm-action'}"`);
write('index.html',html);

let css = read('styles.css');
css += `\n/* Gridium Alpha 6.1 LIVE UI hotfix */\n#notice{position:fixed!important;top:92px!important;right:18px!important;left:auto!important;width:auto!important;max-width:min(560px,calc(100vw - 36px))!important;z-index:1000!important;border:1px solid #8a6330!important;border-radius:10px!important;box-shadow:0 14px 36px rgba(0,0,0,.42)!important;padding:10px 14px!important}\n.live-arm-action{display:inline-flex!important;visibility:visible!important;opacity:1!important;position:relative!important;z-index:4!important;background:linear-gradient(180deg,#17493a,#12352c)!important;border:1px solid #58c49e!important;color:#c5ffe9!important;font-weight:800!important;min-width:145px!important;align-items:center!important;justify-content:center!important}\n@media(max-width:1250px){.module-header{align-items:flex-start!important;flex-direction:column!important}.module-actions{justify-content:flex-start!important;width:100%!important}.live-arm-action{order:-20!important}#alphaStatusBadge{order:-19!important}}\n`;
write('styles.css',css);

const renderer = read('renderer.js');
const preload = read('preload.js');
const main = read('main.js');
const engine = read('alpha-engine.js');
const marketLive = read('market-live.js');
if (!renderer.includes("$('alphaLiveToggle').onclick")) throw new Error('Alpha 6.1: handler ARMAR LIVE ausente');
if (!preload.includes('alphaLiveUnlock:')) throw new Error('Alpha 6.1: bridge alphaLiveUnlock ausente');
for (const channel of ['grid:alpha-live-unlock','grid:alpha-live-buy','grid:alpha-live-reprice','grid:alpha-live-cancel']) {
  if (!main.includes(channel)) throw new Error(`Alpha 6.1: canal LIVE ausente: ${channel}`);
}
if (!engine.includes('unlockLive(')) throw new Error('Alpha 6.1: AlphaEngine sem unlockLive');
if (!marketLive.includes('MARKET_BRIDGE_SOURCE') || !marketLive.includes('validateMarketCommand')) throw new Error('Alpha 6.1: bridge WebSocket LIVE ausente');
console.log('Gridium 3.0.0-alpha.6.1 aplicado: Alpha 6 completo + ARMAR LIVE visível.');
