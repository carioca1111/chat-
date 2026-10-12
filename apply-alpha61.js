'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const target = process.argv[2];
if (!target) throw new Error('Uso: node apply-alpha61.js <diretorio-alvo>');
const root = path.resolve(process.cwd(), target);
if (!fs.existsSync(root)) throw new Error(`Diretorio alvo nao existe: ${root}`);

const payloadPath = path.join(__dirname, 'alpha61-ui.b64');
if (!fs.existsSync(payloadPath)) throw new Error('Payload Alpha 6.1 ausente');
const b64 = fs.readFileSync(payloadPath, 'utf8').replace(/\s+/g, '');
const payload = JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));
if (payload.version !== '3.0.0-alpha.6.1') throw new Error(`Payload inesperado: ${payload.version}`);

for (const [name, content] of Object.entries(payload.files || {})) {
  const out = path.join(root, name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, content, 'utf8');
}

const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
if (pkg.version !== '3.0.0-alpha.6.1') throw new Error(`Versao inesperada: ${pkg.version}`);

const html = read('index.html');
const renderer = read('renderer.js');
const preload = read('preload.js');
const main = read('main.js');
const engine = read('alpha-engine.js');

if (!html.includes('id="alphaLiveToggle"') || !html.includes('Alpha 6.1')) throw new Error('ARMAR LIVE nao foi restaurado na interface');
if (!renderer.includes("$('alphaLiveToggle').onclick")) throw new Error('Handler ARMAR LIVE ausente');
if (!preload.includes('alphaLiveUnlock:')) throw new Error('Bridge alphaLiveUnlock ausente');
for (const channel of ['grid:alpha-live-unlock','grid:alpha-live-buy','grid:alpha-live-reprice','grid:alpha-live-cancel']) {
  if (!main.includes(channel)) throw new Error(`Canal LIVE ausente no main: ${channel}`);
}
if (!engine.includes('unlockLive(')) throw new Error('AlphaEngine sem unlockLive');

console.log('Gridium 3.0.0-alpha.6.1 aplicado: UI LIVE restaurada e canais reais verificados.');
