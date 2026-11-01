const { app, BrowserWindow, ipcMain, dialog, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const WebSocket = require('ws');

let win;
let agentWs = null;
let serverProc = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let probeTimer = null;
const tcpPeers = new Map();
const logs = [];
let lastState = {};

function log(line) {
  const msg = `[${new Date().toLocaleTimeString('pt-BR')}] ${String(line)}`;
  logs.push(msg);
  if (logs.length > 500) logs.shift();
  if (win && !win.isDestroyed()) win.webContents.send('log-line', msg);
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function defaults() {
  return {
    relayUrl: 'wss://dbo-dev-relay-alpha01.onrender.com',
    clientUrl: 'https://dbo-rox-web-alpha01.onrender.com',
    gameHost: '127.0.0.1',
    gamePort: 7172,
    serverExe: '',
    serverCwd: '',
    serverArgs: '',
    autoConnect: true,
    deviceId: crypto.randomUUID(),
    deviceSecret: crypto.randomBytes(32).toString('hex')
  };
}

function loadSettings() {
  let s = defaults();
  try {
    if (fs.existsSync(settingsPath())) s = { ...s, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch (e) { log(`Falha ao ler configurações: ${e.message}`); }
  saveSettings(s);
  return s;
}

function saveSettings(s) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
}

function wsBaseToHttp(url) {
  return url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

function getUrls(s) {
  const q = `device=${encodeURIComponent(s.deviceId)}&secret=${encodeURIComponent(s.deviceSecret)}`;
  return {
    gameWs: `${s.relayUrl.replace(/\/$/, '')}/game?${q}`,
    statusUrl: `${wsBaseToHttp(s.relayUrl).replace(/\/$/, '')}/status?${q}`,
    clientUrl: s.clientUrl
  };
}

function probePort(host, port, timeout = 800) {
  return new Promise(resolve => {
    const sock = net.createConnection({ host, port: Number(port) });
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
  });
}

async function buildState() {
  const s = loadSettings();
  const gameReady = await probePort(s.gameHost, s.gamePort);
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  lastState = {
    settings: s,
    relayConnected: agentWs && agentWs.readyState === WebSocket.OPEN,
    gameReady,
    serverRunning: !!serverProc && !serverProc.killed,
    memory: { total: memTotal, used: memTotal - memFree, free: memFree },
    urls: getUrls(s),
    logs: logs.slice(-120)
  };
  if (win && !win.isDestroyed()) win.webContents.send('state', lastState);
  return lastState;
}

function sendAgent(obj) {
  if (agentWs && agentWs.readyState === WebSocket.OPEN) agentWs.send(JSON.stringify(obj));
}

function closePeer(id) {
  const p = tcpPeers.get(id);
  if (p) {
    try { p.destroy(); } catch {}
    tcpPeers.delete(id);
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectRelay, 3500);
}

function connectRelay() {
  const s = loadSettings();
  if (agentWs && (agentWs.readyState === WebSocket.OPEN || agentWs.readyState === WebSocket.CONNECTING)) return;
  const u = `${s.relayUrl.replace(/\/$/, '')}/agent?device=${encodeURIComponent(s.deviceId)}&secret=${encodeURIComponent(s.deviceSecret)}`;
  log(`Conectando ao relay ${s.relayUrl}...`);
  agentWs = new WebSocket(u, { handshakeTimeout: 10000, maxPayload: 2 * 1024 * 1024 });

  agentWs.on('open', () => {
    log('Relay conectado. Nenhuma porta do modem precisa estar aberta.');
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(async () => {
      const st = await buildState();
      sendAgent({ op: 'heartbeat', status: { gameReady: st.gameReady, serverRunning: st.serverRunning, memory: st.memory, hostname: os.hostname() } });
    }, 10000);
    buildState();
  });

  agentWs.on('message', raw => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || !msg.op || !msg.id) return;
    if (msg.op === 'open') {
      closePeer(msg.id);
      const sock = net.createConnection({ host: s.gameHost, port: Number(s.gamePort) });
      tcpPeers.set(msg.id, sock);
      sock.on('connect', () => sendAgent({ op: 'opened', id: msg.id }));
      sock.on('data', buf => sendAgent({ op: 'data', id: msg.id, data: buf.toString('base64') }));
      sock.on('error', e => sendAgent({ op: 'error', id: msg.id, message: e.message }));
      sock.on('close', () => { sendAgent({ op: 'close', id: msg.id }); tcpPeers.delete(msg.id); });
    } else if (msg.op === 'data') {
      const sock = tcpPeers.get(msg.id);
      if (sock && msg.data) sock.write(Buffer.from(msg.data, 'base64'));
    } else if (msg.op === 'close') {
      closePeer(msg.id);
    }
  });

  agentWs.on('close', () => {
    log('Relay desconectado; tentando reconectar automaticamente.');
    for (const id of tcpPeers.keys()) closePeer(id);
    clearInterval(heartbeatTimer);
    scheduleReconnect();
    buildState();
  });
  agentWs.on('error', e => log(`Relay: ${e.message}`));
}

function disconnectRelay() {
  clearTimeout(reconnectTimer);
  clearInterval(heartbeatTimer);
  if (agentWs) {
    try { agentWs.close(); } catch {}
    agentWs = null;
  }
  for (const id of tcpPeers.keys()) closePeer(id);
  buildState();
}

function startServer() {
  const s = loadSettings();
  if (!s.serverExe || !fs.existsSync(s.serverExe)) {
    log('Selecione primeiro o executável do servidor DBO/TFS.');
    return { ok: false, error: 'Executável do servidor não configurado.' };
  }
  if (serverProc && !serverProc.killed) return { ok: true };
  const cwd = s.serverCwd || path.dirname(s.serverExe);
  const args = String(s.serverArgs || '').match(/(?:[^\s"]+|"[^"]*")+/g)?.map(x => x.replace(/^"|"$/g, '')) || [];
  log(`Iniciando servidor: ${path.basename(s.serverExe)}`);
  serverProc = spawn(s.serverExe, args, { cwd, windowsHide: false });
  serverProc.stdout?.on('data', b => log(`[TFS] ${String(b).trimEnd()}`));
  serverProc.stderr?.on('data', b => log(`[TFS] ${String(b).trimEnd()}`));
  serverProc.on('exit', (code, signal) => { log(`Servidor finalizado (code=${code}, signal=${signal || '-'})`); serverProc = null; buildState(); });
  serverProc.on('error', e => log(`Erro ao iniciar TFS: ${e.message}`));
  buildState();
  return { ok: true };
}

function stopServer() {
  if (!serverProc) return { ok: true };
  try { serverProc.kill(); } catch {}
  setTimeout(() => { if (serverProc && !serverProc.killed) { try { spawn('taskkill', ['/PID', String(serverProc.pid), '/T', '/F']); } catch {} } }, 1500);
  return { ok: true };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1050, height: 720, minWidth: 900, minHeight: 620,
    title: 'DBO Dev Bridge Alpha 0.1.1',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile('index.html');
  win.webContents.once('did-finish-load', async () => {
    const s = loadSettings();
    if (s.autoConnect) connectRelay();
    clearInterval(probeTimer);
    probeTimer = setInterval(buildState, 2000);
    await buildState();
  });
}

app.whenReady().then(() => {
  createWindow();
  ipcMain.handle('state', buildState);
  ipcMain.handle('save-settings', (_e, patch) => {
    const s = { ...loadSettings(), ...patch };
    saveSettings(s);
    disconnectRelay();
    if (s.autoConnect) setTimeout(connectRelay, 250);
    return buildState();
  });
  ipcMain.handle('pick-server', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Executável', extensions: ['exe'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const s = loadSettings();
    s.serverExe = r.filePaths[0];
    if (!s.serverCwd) s.serverCwd = path.dirname(r.filePaths[0]);
    saveSettings(s);
    return buildState();
  });
  ipcMain.handle('start-server', () => startServer());
  ipcMain.handle('stop-server', () => stopServer());
  ipcMain.handle('connect-relay', () => { connectRelay(); return { ok: true }; });
  ipcMain.handle('disconnect-relay', () => { disconnectRelay(); return { ok: true }; });
  ipcMain.handle('copy', (_e, text) => { clipboard.writeText(String(text || '')); return true; });
  ipcMain.handle('open-external', async (_e, url) => {
    const target = String(url || '');
    if (!/^https:\/\//i.test(target)) return false;
    await shell.openExternal(target);
    return true;
  });
});

app.on('window-all-closed', () => {
  clearInterval(probeTimer); clearInterval(heartbeatTimer); clearTimeout(reconnectTimer);
  disconnectRelay();
  if (process.platform !== 'darwin') app.quit();
});
