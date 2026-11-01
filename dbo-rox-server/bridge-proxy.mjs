import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 10000);
const UPSTREAM = process.env.RELAY_ONLY_URL || '';

if (!UPSTREAM) {
  console.error('[proxy] RELAY_ONLY_URL is required');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, mode: 'relay-only', upstream: UPSTREAM }));
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('DBO Rox local-PC relay proxy');
});

const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 2 * 1024 * 1024 });

wss.on('connection', client => {
  const upstream = new WebSocket(UPSTREAM, { perMessageDeflate: false, maxPayload: 2 * 1024 * 1024 });
  let closed = false;

  const closeBoth = () => {
    if (closed) return;
    closed = true;
    try { client.close(); } catch {}
    try { upstream.close(); } catch {}
  };

  upstream.on('open', () => console.log('[proxy] browser websocket connected to local-PC relay'));
  upstream.on('message', (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });
  upstream.on('error', err => {
    console.error('[proxy] upstream error:', err.message);
    closeBoth();
  });
  upstream.on('close', closeBoth);

  client.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
  });
  client.on('error', err => {
    console.error('[proxy] client error:', err.message);
    closeBoth();
  });
  client.on('close', closeBoth);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[proxy] relay-only websocket listening on :${PORT} -> ${UPSTREAM}`);
});
