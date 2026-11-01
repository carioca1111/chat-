const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const devices = new Map();
const MAX_CLIENTS = 4;
const MAX_PAYLOAD = 2 * 1024 * 1024;

function safeEq(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function getDevice(device, secret, create = false) {
  if (!device || !secret || device.length > 128 || secret.length < 32 || secret.length > 256) return null;
  let d = devices.get(device);
  if (!d && create) {
    d = { id: device, secret, agent: null, clients: new Map(), heartbeat: null, lastSeen: Date.now() };
    devices.set(device, d);
  }
  if (!d || !safeEq(d.secret, secret)) return null;
  return d;
}

function activeDevices() {
  return [...devices.values()].filter(d => d.agent && d.agent.readyState === WebSocket.OPEN);
}

function json(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function attachGameClient(ws, d) {
  if (!d || !d.agent || d.agent.readyState !== WebSocket.OPEN) return ws.close(1013, 'agent offline');
  if (d.clients.size >= MAX_CLIENTS) return ws.close(1013, 'too many clients');

  const id = crypto.randomUUID();
  d.clients.set(id, ws);
  d.lastSeen = Date.now();
  json(d.agent, { op: 'open', id });

  ws.on('message', data => {
    if (!d.agent || d.agent.readyState !== WebSocket.OPEN) return ws.close(1012, 'agent offline');
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    json(d.agent, { op: 'data', id, data: buf.toString('base64') });
  });
  ws.on('close', () => {
    d.clients.delete(id);
    json(d.agent, { op: 'close', id });
  });
  ws.on('error', () => {
    d.clients.delete(id);
    json(d.agent, { op: 'close', id });
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (u.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, activeAgents: activeDevices().length }));
  }
  if (u.pathname === '/status') {
    const d = getDevice(u.searchParams.get('device'), u.searchParams.get('secret'));
    if (!d) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'device_not_found' }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      agentConnected: !!d.agent && d.agent.readyState === WebSocket.OPEN,
      gameClients: d.clients.size,
      lastSeen: d.lastSeen,
      heartbeat: d.heartbeat
    }));
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>DBO Dev Relay</title><body style="font-family:Segoe UI;background:#10131a;color:#eee;padding:30px"><h1>DBO Dev Relay</h1><p>Relay ativo. Agentes conectados: ${activeDevices().length}</p><p>O OTClient Web usa o WebSocket na raiz deste domínio durante a Alpha 0.1.</p></body>`);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });

server.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (u.pathname !== '/agent' && u.pathname !== '/game' && u.pathname !== '/') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, u));
});

wss.on('connection', (ws, req, u) => {
  const deviceId = u.searchParams.get('device');
  const secret = u.searchParams.get('secret');

  if (u.pathname === '/agent') {
    const d = getDevice(deviceId, secret, true);
    if (!d) return ws.close(1008, 'invalid device credentials');
    if (d.agent && d.agent.readyState === WebSocket.OPEN) {
      try { d.agent.close(1012, 'replaced by new agent'); } catch {}
    }
    d.agent = ws;
    d.lastSeen = Date.now();

    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      d.lastSeen = Date.now();
      if (msg.op === 'heartbeat') {
        d.heartbeat = msg.status || null;
        return;
      }
      if (!msg.id) return;
      const client = d.clients.get(msg.id);
      if (!client) return;
      if (msg.op === 'data' && msg.data) {
        try { client.send(Buffer.from(msg.data, 'base64'), { binary: true }); } catch {}
      } else if (msg.op === 'close') {
        try { client.close(1000, 'tcp closed'); } catch {}
        d.clients.delete(msg.id);
      } else if (msg.op === 'error') {
        try { client.close(1011, String(msg.message || 'tcp error').slice(0, 120)); } catch {}
        d.clients.delete(msg.id);
      }
    });

    ws.on('close', () => {
      if (d.agent === ws) d.agent = null;
      for (const [id, c] of d.clients) {
        try { c.close(1012, 'agent disconnected'); } catch {}
        d.clients.delete(id);
      }
    });
    return;
  }

  if (u.pathname === '/') {
    const active = activeDevices();
    if (active.length !== 1) return ws.close(1013, active.length ? 'multiple agents online' : 'agent offline');
    return attachGameClient(ws, active[0]);
  }

  const d = getDevice(deviceId, secret);
  return attachGameClient(ws, d);
});

setInterval(() => {
  const now = Date.now();
  for (const [id, d] of devices) {
    if ((!d.agent || d.agent.readyState !== WebSocket.OPEN) && d.clients.size === 0 && now - d.lastSeen > 6 * 60 * 60 * 1000) devices.delete(id);
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`[relay] listening on :${PORT}`));
