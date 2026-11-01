const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const net = require('net');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const extractZip = require('extract-zip');
const { createExtractorFromData } = require('node-unrar-js');

const DBO_SERVER_PAGE = 'https://www.mediafire.com/file/46j6dywwv8mtv4j/DboRox.rar/file';
const DBO_DATABASE_PAGE = 'https://www.mediafire.com/file/641diq6mvgq87xz/Database_Dborox.rar/file';
const MARIADB_URLS = [
  'https://archive.mariadb.org/mariadb-11.4.13/winx64-packages/mariadb-11.4.13-winx64.zip',
  'https://mirror5.krfoss.org/mariadb/mariadb-11.4.13/winx64-packages/mariadb-11.4.13-winx64.zip'
];
const DB_PORT = 3307;

function createDboManager({ app, log, onProgress, getSettings, saveSettings }) {
  let dbProc = null;
  let prepRunning = false;

  const emit = (text, percent = null) => {
    log(`[PREPARAR] ${text}`);
    onProgress?.({ text, percent });
  };
  const root = () => path.join(app.getPath('userData'), 'dbo-runtime');
  const manifestPath = () => path.join(root(), 'prepared.json');

  function probePort(host, port, timeout = 700) {
    return new Promise(resolve => {
      const sock = net.createConnection({ host, port: Number(port) });
      let done = false;
      const finish = ok => { if (done) return; done = true; sock.destroy(); resolve(ok); };
      sock.setTimeout(timeout);
      sock.once('connect', () => finish(true));
      sock.once('timeout', () => finish(false));
      sock.once('error', () => finish(false));
    });
  }

  async function walk(dir) {
    const out = [];
    async function visit(current) {
      let entries = [];
      try { entries = await fsp.readdir(current, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) await visit(full); else out.push(full);
      }
    }
    await visit(dir);
    return out;
  }

  function safeRelative(name) {
    const normalized = String(name).replaceAll('\\', '/').replace(/^\/+/, '');
    const clean = path.posix.normalize(normalized);
    if (clean === '..' || clean.startsWith('../')) throw new Error(`Caminho inseguro no RAR: ${name}`);
    return clean;
  }

  async function extractRar(archivePath, outDir) {
    emit(`Extraindo ${path.basename(archivePath)}...`);
    await fsp.rm(outDir, { recursive: true, force: true });
    await fsp.mkdir(outDir, { recursive: true });
    const raw = await fsp.readFile(archivePath);
    const extractor = await createExtractorFromData({ data: new Uint8Array(raw) });
    const result = extractor.extract();
    let count = 0;
    for (const entry of result.files) {
      const rel = safeRelative(entry.fileHeader.name);
      if (!rel) continue;
      const target = path.join(outDir, rel);
      if (entry.fileHeader.flags?.directory || entry.extraction == null) {
        await fsp.mkdir(target, { recursive: true });
      } else {
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(target, Buffer.from(entry.extraction));
        count++;
      }
    }
    emit(`${count} arquivos extraídos de ${path.basename(archivePath)}.`);
  }

  const decodeHtml = value => value.replaceAll('&amp;', '&').replaceAll('&#x2F;', '/').replaceAll('&#47;', '/');

  async function resolveMediaFire(pageUrl) {
    const page = await fetch(pageUrl, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156 Safari/537.36',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }
    });
    if (!page.ok) throw new Error(`MediaFire respondeu ${page.status}`);
    const html = await page.text();
    const matches = [
      html.match(/href=["'](https:\/\/download[^"']+)["'][^>]*>\s*Download/i),
      html.match(/aria-label=["']Download file["'][^>]*href=["']([^"']+)/i),
      html.match(/href=["'](https:\/\/download[^"']+mediafire\.com[^"']+)["']/i)
    ].filter(Boolean);
    if (!matches.length) throw new Error('Não consegui resolver o link direto do MediaFire.');
    return decodeHtml(matches[0][1]);
  }

  async function downloadFile(url, dest, label, basePercent, spanPercent) {
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 Chrome/156' } });
    if (!res.ok || !res.body) throw new Error(`${label}: download falhou (${res.status})`);
    const total = Number(res.headers.get('content-length') || 0);
    const stream = fs.createWriteStream(dest);
    let got = 0;
    let lastShown = -1;
    stream.on('error', e => log(`[DOWNLOAD] ${e.message}`));
    for await (const chunk of res.body) {
      if (!stream.write(Buffer.from(chunk))) await new Promise(resolve => stream.once('drain', resolve));
      got += chunk.length;
      if (total > 0) {
        const inner = Math.floor((got / total) * 100);
        const percent = Math.min(99, Math.floor(basePercent + (inner / 100) * spanPercent));
        if (percent !== lastShown && (percent % 2 === 0 || inner === 100)) {
          lastShown = percent;
          onProgress?.({ text: `${label}: ${inner}%`, percent });
        }
      }
    }
    await new Promise(resolve => stream.end(resolve));
    emit(`${label} baixado (${Math.round(got / 1048576)} MB).`, Math.floor(basePercent + spanPercent));
  }

  async function downloadFirst(urls, dest, label, basePercent, spanPercent) {
    let lastErr;
    for (const url of urls) {
      try { await downloadFile(url, dest, label, basePercent, spanPercent); return url; }
      catch (e) { lastErr = e; log(`[PREPARAR] Falha em ${url}: ${e.message}`); }
    }
    throw lastErr || new Error(`Falha ao baixar ${label}`);
  }

  function runCapture(exe, args, options = {}) {
    const result = spawnSync(exe, args, {
      cwd: options.cwd || path.dirname(exe), encoding: 'utf8', input: options.input,
      windowsHide: true, maxBuffer: options.maxBuffer || 128 * 1024 * 1024
    });
    if (result.stdout?.trim()) log(`[CMD] ${result.stdout.trim().slice(-5000)}`);
    if (result.stderr?.trim()) log(`[CMD] ${result.stderr.trim().slice(-5000)}`);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${path.basename(exe)} terminou com código ${result.status}`);
    return result;
  }

  async function waitForPort(host, port, attempts = 100, delay = 250) {
    for (let i = 0; i < attempts; i++) {
      if (await probePort(host, port, 500)) return true;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return false;
  }

  async function ensureDbRunning() {
    const s = getSettings();
    const port = s.dbPort || DB_PORT;
    if (await probePort('127.0.0.1', port, 500)) return true;
    if (!s.mariadbRoot || !s.mariadbData) throw new Error('MariaDB ainda não foi preparado.');
    const files = await walk(s.mariadbRoot);
    const mariadbd = files.find(f => /\\bin\\mariadbd\.exe$/i.test(f)) || files.find(f => /\\bin\\mysqld\.exe$/i.test(f));
    if (!mariadbd) throw new Error('mariadbd.exe não encontrado.');
    const ini = path.join(s.mariadbData, 'my.ini');
    const args = [`--defaults-file=${ini}`, '--console', `--port=${port}`, '--bind-address=127.0.0.1', '--skip-name-resolve', '--max-connections=20', '--innodb-buffer-pool-size=64M'];
    log('Iniciando MariaDB portátil...');
    dbProc = spawn(mariadbd, args, { cwd: s.mariadbRoot, windowsHide: true });
    dbProc.stdout?.on('data', b => log(`[DB] ${String(b).trimEnd()}`));
    dbProc.stderr?.on('data', b => log(`[DB] ${String(b).trimEnd()}`));
    dbProc.on('exit', (code, signal) => { log(`MariaDB finalizado (code=${code}, signal=${signal || '-'})`); dbProc = null; });
    dbProc.on('error', e => log(`Erro ao iniciar MariaDB: ${e.message}`));
    if (!await waitForPort('127.0.0.1', port)) throw new Error('MariaDB não abriu a porta local a tempo.');
    log(`MariaDB pronto em 127.0.0.1:${port}.`);
    return true;
  }

  async function stopDatabase() {
    const s = getSettings();
    if (!s.mariadbRoot) return;
    try {
      const files = await walk(s.mariadbRoot);
      const admin = files.find(f => /\\bin\\mariadb-admin\.exe$/i.test(f)) || files.find(f => /\\bin\\mysqladmin\.exe$/i.test(f));
      if (admin && await probePort('127.0.0.1', s.dbPort || DB_PORT, 300)) {
        spawnSync(admin, ['-h127.0.0.1', `-P${s.dbPort || DB_PORT}`, '-uroot', `-p${s.dbPassword}`, 'shutdown'], { windowsHide: true, encoding: 'utf8' });
      }
    } catch {}
    try { dbProc?.kill(); } catch {}
    dbProc = null;
  }

  function patchConfig(configPath, s) {
    let config = fs.readFileSync(configPath).toString('latin1');
    const set = (name, value) => {
      const rx = new RegExp(`^\\s*${name}\\s*=.*$`, 'm');
      if (rx.test(config)) config = config.replace(rx, `${name} = ${value}`);
      else config += `\r\n${name} = ${value}\r\n`;
    };
    set('ip', '"127.0.0.1"');
    set('sqlType', '"mysql"'); set('sqlHost', '"127.0.0.1"'); set('sqlPort', String(s.dbPort || DB_PORT));
    set('sqlUser', '"root"'); set('sqlPass', JSON.stringify(s.dbPassword)); set('sqlDatabase', '"dborox"');
    set('loginOnlyWithLoginServer', 'false'); set('allowClones', 'true'); set('onePlayerOnlinePerAccount', 'false'); set('serverName', '"Dragon Ball Guest"');
    fs.writeFileSync(configPath, Buffer.from(config, 'latin1'));
  }

  function scoreServerExe(file, serverRoot) {
    const name = path.basename(file).toLowerCase();
    let score = 0;
    if (name.includes('theforgottenserver')) score += 500;
    if (name.includes('forgotten')) score += 350;
    if (name.includes('server')) score += 250;
    if (name.includes('dbo')) score += 180;
    if (name.includes('rox')) score += 120;
    if (path.dirname(file).toLowerCase() === serverRoot.toLowerCase()) score += 150;
    if (/client|unins|setup|editor|remere|map|mysql|maria|sqlite|updat|patch|crash/.test(name)) score -= 700;
    try { score += Math.min(100, Math.floor(fs.statSync(file).size / 1048576)); } catch {}
    return score;
  }

  async function prepare() {
    if (prepRunning) return { ok: false, error: 'Preparação já está em andamento.' };
    prepRunning = true;
    try {
      const r = root();
      const cache = path.join(r, 'downloads');
      const serverExtract = path.join(r, 'server-package');
      const dbExtract = path.join(r, 'database-package');
      const mariaExtract = path.join(r, 'mariadb');
      const mariaData = path.join(r, 'mariadb-data');
      await fsp.mkdir(cache, { recursive: true });

      emit('Baixando a base original DBO Rox...', 2);
      const serverRar = path.join(cache, 'DboRox.rar');
      if (!fs.existsSync(serverRar) || fs.statSync(serverRar).size < 1024 * 1024) {
        await downloadFile(await resolveMediaFire(DBO_SERVER_PAGE), serverRar, 'DBO Rox servidor', 2, 20);
      } else emit('DBO Rox servidor já está no cache.', 22);
      if (!fs.existsSync(serverExtract) || (await walk(serverExtract)).length < 20) await extractRar(serverRar, serverExtract);

      emit('Baixando database original...', 26);
      const dbRar = path.join(cache, 'Database_Dborox.rar');
      if (!fs.existsSync(dbRar) || fs.statSync(dbRar).size < 1024) {
        await downloadFile(await resolveMediaFire(DBO_DATABASE_PAGE), dbRar, 'Database DBO Rox', 26, 10);
      } else emit('Database original já está no cache.', 36);
      if (!fs.existsSync(dbExtract) || (await walk(dbExtract)).length < 1) await extractRar(dbRar, dbExtract);

      emit('Baixando MariaDB portátil 11.4 LTS...', 40);
      const mariaZip = path.join(cache, 'mariadb-11.4.13-winx64.zip');
      let mariaSource = MARIADB_URLS[0];
      if (!fs.existsSync(mariaZip) || fs.statSync(mariaZip).size < 50 * 1024 * 1024) mariaSource = await downloadFirst(MARIADB_URLS, mariaZip, 'MariaDB portátil', 40, 22);
      else emit('MariaDB já está no cache.', 62);
      const mariaExisting = fs.existsSync(mariaExtract) ? await walk(mariaExtract) : [];
      if (!mariaExisting.some(f => /mariadb-install-db\.exe$/i.test(f))) {
        emit('Extraindo MariaDB...', 64);
        await fsp.rm(mariaExtract, { recursive: true, force: true }); await fsp.mkdir(mariaExtract, { recursive: true });
        await extractZip(mariaZip, { dir: mariaExtract });
      }

      const serverFiles = await walk(serverExtract);
      const configPath = serverFiles.find(f => path.basename(f).toLowerCase() === 'config.lua');
      if (!configPath) throw new Error('config.lua não encontrado no pacote DBO Rox.');
      const serverRoot = path.dirname(configPath);
      const exes = serverFiles.filter(f => f.toLowerCase().endsWith('.exe') && fs.statSync(f).size > 200 * 1024);
      exes.sort((a, b) => scoreServerExe(b, serverRoot) - scoreServerExe(a, serverRoot));
      const serverExe = exes[0];
      if (!serverExe || scoreServerExe(serverExe, serverRoot) < 0) throw new Error(`Não consegui identificar com segurança o servidor. EXEs: ${exes.map(x => path.basename(x)).slice(0, 8).join(', ') || 'nenhum'}`);
      emit(`Servidor detectado: ${path.basename(serverExe)}`, 68);

      const databaseSql = (await walk(dbExtract)).find(f => f.toLowerCase().endsWith('.sql'));
      if (!databaseSql) throw new Error('Arquivo .sql da database não encontrado.');
      const mariaFiles = await walk(mariaExtract);
      const installDb = mariaFiles.find(f => /\\bin\\mariadb-install-db\.exe$/i.test(f)) || mariaFiles.find(f => /\\bin\\mysql_install_db\.exe$/i.test(f));
      const mariadbCli = mariaFiles.find(f => /\\bin\\mariadb\.exe$/i.test(f)) || mariaFiles.find(f => /\\bin\\mysql\.exe$/i.test(f));
      if (!installDb || !mariadbCli) throw new Error('Ferramentas do MariaDB portátil não encontradas.');
      const mariaRoot = path.dirname(path.dirname(installDb));

      const s = getSettings();
      Object.assign(s, { serverExe, serverCwd: serverRoot, serverArgs: '', dbPort: DB_PORT, mariadbRoot: mariaRoot, mariadbData: mariaData, databaseSql });
      if (!s.dbPassword) s.dbPassword = crypto.randomBytes(18).toString('hex');
      saveSettings(s);

      if (!fs.existsSync(path.join(mariaData, 'mysql'))) {
        emit('Inicializando banco local...', 72);
        await fsp.rm(mariaData, { recursive: true, force: true }); await fsp.mkdir(mariaData, { recursive: true });
        runCapture(installDb, [`--datadir=${mariaData}`, `--password=${s.dbPassword}`, `--port=${DB_PORT}`], { cwd: mariaRoot });
      } else emit('Banco local já inicializado.', 76);

      await ensureDbRunning();
      emit('Importando database original DBO Rox...', 80);
      const auth = ['-h127.0.0.1', `-P${DB_PORT}`, '-uroot', `-p${s.dbPassword}`];
      runCapture(mariadbCli, [...auth, '-e', 'CREATE DATABASE IF NOT EXISTS dborox CHARACTER SET latin1 COLLATE latin1_swedish_ci;'], { cwd: mariaRoot });
      const imported = path.join(r, 'database-imported.txt');
      if (!fs.existsSync(imported)) {
        runCapture(mariadbCli, [...auth, 'dborox'], { cwd: mariaRoot, input: fs.readFileSync(databaseSql), maxBuffer: 256 * 1024 * 1024 });
        fs.writeFileSync(imported, new Date().toISOString());
      }
      emit('Configurando personagem Guest...', 90);
      const guestSql = "UPDATE accounts SET name='guest', password=SHA1('guest'), premdays=65535 WHERE id=1; UPDATE players SET name='Guest', account_id=1, online=0, lastlogin=0, posx=655, posy=399, posz=7, town_id=1 WHERE id=3;";
      runCapture(mariadbCli, [...auth, 'dborox', '-e', guestSql], { cwd: mariaRoot });
      patchConfig(configPath, s);
      await fsp.writeFile(manifestPath(), JSON.stringify({ preparedAt: new Date().toISOString(), base: 'DBO Rox V2 8.60', serverExe, serverRoot, configPath, databaseSql, mariadbVersion: '11.4.13', mariadbSource: mariaSource, dbPort: DB_PORT }, null, 2));
      emit('PRONTO. Agora clique em INICIAR DBO.', 100);
      return { ok: true, serverExe };
    } catch (e) {
      log(`[PREPARAR] ERRO: ${e.stack || e.message}`);
      emit(`Falhou: ${e.message}`, null);
      return { ok: false, error: e.message };
    } finally { prepRunning = false; }
  }

  return {
    prepare,
    ensureDbRunning,
    stopDatabase,
    isPreparing: () => prepRunning,
    isPrepared: () => {
      const s = getSettings(); return fs.existsSync(manifestPath()) && !!s.serverExe && fs.existsSync(s.serverExe);
    },
    isDbReady: async () => {
      const s = getSettings(); return probePort('127.0.0.1', s.dbPort || DB_PORT, 500);
    }
  };
}

module.exports = { createDboManager };
