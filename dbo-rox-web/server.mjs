import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 10000);

const zipName = 'dbo-rox-game-data-webcompat.zip';
const zipPath = path.join(DIST, zipName);
const manifestPath = path.join(DIST, 'manifest.json');

function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'content-type': type, ...headers });
  res.end(body);
}

function page(origin, manifest) {
  const cacheKey = encodeURIComponent(manifest.builtAt || 'dbo-rox-webcompat');
  const gameData = `${origin}/${zipName}?v=${cacheKey}`;
  const play = `https://webclient.otarchive.com/?gameData=${encodeURIComponent(gameData)}`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DBO Rox Web Base</title>
<style>
body{margin:0;background:#0b0f14;color:#edf4fb;font:15px system-ui,Segoe UI,Arial;min-height:100vh;display:grid;place-items:center}
main{width:min(780px,92vw);background:#151c25;border:1px solid #293645;border-radius:16px;padding:24px;box-shadow:0 18px 60px #0008}
h1{margin:0 0 6px;font-size:26px}.muted{color:#9aabba}code{background:#0c1218;padding:3px 6px;border-radius:5px;word-break:break-all}
a.btn{display:inline-block;margin-top:18px;padding:12px 18px;background:#d47b24;color:white;text-decoration:none;border-radius:9px;font-weight:800}
a.secondary{background:#263544;margin-left:8px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px}.card{padding:12px;background:#0f151c;border-radius:9px}.ok{color:#78e6a6}.tag{display:inline-block;margin-top:8px;padding:4px 8px;border-radius:999px;background:#183b2a;color:#83efad;font-size:12px;font-weight:700}
@media(max-width:620px){.grid{grid-template-columns:1fr}a.secondary{margin-left:0}}
</style></head>
<body><main>
<h1>Dragon Ball OT — DBO Rox V2 8.60</h1>
<div class="muted">DBO Rox original + runtime OTClient Redemption compatível com navegador.</div>
<div class="tag">WEB COMPAT BUILD</div>
<div class="grid">
<div class="card"><b>Protocolo</b><br><span class="ok">8.60</span></div>
<div class="card"><b>Sprites/itens</b><br><span class="ok">DBO Rox original DAT/SPR</span></div>
<div class="card"><b>Runtime</b><br>${manifest.clientRuntime || 'OTClient Redemption Web'}</div>
<div class="card"><b>Servidor/source/DB</b><br><span class="ok">DBO Rox original validado</span></div>
</div>
<a class="btn" href="${play}">INSTALAR BUILD WEB COMPATÍVEL</a>
<a class="btn secondary" href="${gameData}">BAIXAR ZIP</a>
<p class="muted"><b>Importante:</b> esta URL do pacote é nova justamente para o OTArchive não reutilizar o cliente antigo que travava em “Starting game”. Feche a aba antiga e abra por este botão.</p>
<p class="muted">Game data: <code>${gameData}</code></p>
</main></body></html>`;
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;
  const url = new URL(req.url || '/', origin);

  if (url.pathname === '/health') return send(res, 200, 'ok');

  if (url.pathname === '/manifest.json') {
    const body = await fsp.readFile(manifestPath);
    return send(res, 200, body, 'application/json; charset=utf-8', { 'cache-control': 'no-store' });
  }

  if (url.pathname === `/${zipName}`) {
    const stat = await fsp.stat(zipPath);
    const headers = {
      'content-type': 'application/zip',
      'content-length': stat.size,
      'access-control-allow-origin': 'https://webclient.otarchive.com',
      'access-control-allow-methods': 'GET,HEAD,OPTIONS',
      'access-control-allow-headers': 'content-type, range',
      'access-control-expose-headers': 'content-length, content-type',
      'cross-origin-resource-policy': 'cross-origin',
      'vary': 'Origin',
      'cache-control': 'public, max-age=300',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end(); }
    if (req.method === 'HEAD') { res.writeHead(200, headers); return res.end(); }
    res.writeHead(200, headers);
    return fs.createReadStream(zipPath).pipe(res);
  }

  // Old package URL is intentionally retired so browsers do not reinstall the
  // legacy DBO Rox client modules that froze on "Starting game".
  if (url.pathname === '/dbo-rox-game-data.zip') {
    return send(res, 410, 'legacy package retired; open / to install the web-compatible build');
  }

  if (url.pathname === '/') {
    const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
    return send(res, 200, page(origin, manifest), 'text/html; charset=utf-8', { 'cache-control': 'no-store' });
  }

  return send(res, 404, 'not found');
});

server.listen(PORT, '0.0.0.0', () => console.log(`DBO Rox web bootstrap listening on :${PORT}`));
