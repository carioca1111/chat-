import http from 'node:http';
import net from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 10000);
const GAME_HOST = process.env.GAME_HOST || '127.0.0.1';
const GAME_PORT = Number(process.env.GAME_PORT || 7172);
const RELAY_ONLY_URL = process.env.RELAY_ONLY_URL || '';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({
      ok: true,
      mode: RELAY_ONLY_URL ? 'relay-only' : 'local-game',
      gameHost: GAME_HOST,
      gamePort: GAME_PORT,
      upstream: RELAY_ONLY_URL || null,
    }));
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(RELAY_ONLY_URL ? 'DBO Rox local-PC relay proxy' : 'DBO Rox Guest game bridge');
});

const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 2 * 1024 * 1024 });

if (RELAY_ONLY_URL) {
  wss.on('connection', client => {
    const upstream = new WebSocket(RELAY_ONLY_URL, { perMessageDeflate: false, maxPayload: 2 * 1024 * 1024 });
    let closed = false;
    const closeBoth = () => {
      if (closed) return;
      closed = true;
      try { client.close(); } catch {}
      try { upstream.close(); } catch {}
    };

    upstream.on('open', () => console.log('[bridge] browser -> local-PC relay connected'));
    upstream.on('message', (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    upstream.on('error', err => {
      console.error('[bridge] upstream relay error:', err.message);
      closeBoth();
    });
    upstream.on('close', closeBoth);

    client.on('message', (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
    });
    client.on('error', err => {
      console.error('[bridge] browser WS error:', err.message);
      closeBoth();
    });
    client.on('close', closeBoth);
  });
} else {
  wss.on('connection', ws => {
    const tcp = net.createConnection({ host: GAME_HOST, port: GAME_PORT });
    let closed = false;

    const closeBoth = () => {
      if (closed) return;
      closed = true;
      try { tcp.destroy(); } catch {}
      try { if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(); } catch {}
    };

    tcp.setNoDelay(true);
    tcp.on('connect', () => console.log('[bridge] websocket -> game TCP connected'));
    tcp.on('data', chunk => {
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk, { binary: true });
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
}

server.listen(PORT, '0.0.0.0', () => {
  if (RELAY_ONLY_URL) console.log(`[bridge] relay-only websocket listening on :${PORT} -> ${RELAY_ONLY_URL}`);
  else console.log(`[bridge] public websocket listening on :${PORT} -> ${GAME_HOST}:${GAME_PORT}`);
});
