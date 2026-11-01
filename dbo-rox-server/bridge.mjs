import http from 'node:http';
import net from 'node:net';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 10000);
const GAME_HOST = process.env.GAME_HOST || '127.0.0.1';
const GAME_PORT = Number(process.env.GAME_PORT || 7172);

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, gameHost: GAME_HOST, gamePort: GAME_PORT }));
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('DBO Rox Guest game bridge');
});

const wss = new WebSocketServer({ server, perMessageDeflate: false });

wss.on('connection', ws => {
  const tcp = net.createConnection({ host: GAME_HOST, port: GAME_PORT });
  let closed = false;

  const closeBoth = () => {
    if (closed) return;
    closed = true;
    try { tcp.destroy(); } catch {}
    try { if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close(); } catch {}
  };

  tcp.setNoDelay(true);
  tcp.on('connect', () => console.log('[bridge] websocket -> game TCP connected'));
  tcp.on('data', chunk => {
    if (ws.readyState === ws.OPEN) ws.send(chunk, { binary: true });
  });
  tcp.on('error', err => {
    console.error('[bridge] TCP error:', err.message);
    closeBoth();
  });
  tcp.on('close', closeBoth);

  ws.on('message', (data, isBinary) => {
    if (!isBinary || tcp.destroyed) return;
    tcp.write(Buffer.from(data));
  });
  ws.on('error', err => {
    console.error('[bridge] WS error:', err.message);
    closeBoth();
  });
  ws.on('close', closeBoth);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[bridge] public websocket listening on :${PORT} -> ${GAME_HOST}:${GAME_PORT}`);
});
