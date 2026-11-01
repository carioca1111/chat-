import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createExtractorFromData } from 'node-unrar-js';

const ROOT = process.cwd();
const WORK = path.join(ROOT, '.vendor-work');
const SOURCE_OUT = path.join(ROOT, 'source');
const RUNTIME = path.join(ROOT, 'runtime');

const PACKAGES = {
  server: 'https://www.mediafire.com/file/46j6dywwv8mtv4j/DboRox.rar/file',
  source: 'https://www.mediafire.com/file/1nvpp57qrdi6jeq/Source_DboRox.rar/file',
  database: 'https://www.mediafire.com/file/641diq6mvgq87xz/Database_Dborox.rar/file',
};

await fsp.rm(WORK, { recursive: true, force: true });
await fsp.rm(SOURCE_OUT, { recursive: true, force: true });
await fsp.rm(RUNTIME, { recursive: true, force: true });
await fsp.mkdir(WORK, { recursive: true });
await fsp.mkdir(RUNTIME, { recursive: true });

function decodeHtml(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&#x2F;', '/').replaceAll('&#47;', '/');
}

async function fetchMediaFire(pageUrl, outputFile) {
  const page = await fetch(pageUrl, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/156 Safari/537.36',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });
  if (!page.ok) throw new Error(`MediaFire page failed ${page.status}: ${pageUrl}`);
  const html = await page.text();
  const matches = [
    html.match(/href=["'](https:\/\/download[^"']+)["'][^>]*>\s*Download/i),
    html.match(/aria-label=["']Download file["'][^>]*href=["']([^"']+)/i),
    html.match(/href=["'](https:\/\/download[^"']+mediafire\.com[^"']+)["']/i),
  ].filter(Boolean);
  if (!matches.length) throw new Error(`Could not resolve direct MediaFire URL for ${pageUrl}`);
  const direct = decodeHtml(matches[0][1]);
  const response = await fetch(direct, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/156 Safari/537.36' },
  });
  if (!response.ok || !response.body) throw new Error(`MediaFire download failed ${response.status}: ${direct}`);
  await pipeline(response.body, fs.createWriteStream(outputFile));
  console.log(`[vendor] downloaded ${path.basename(outputFile)} ${(await fsp.stat(outputFile)).size} bytes`);
}

function safeRelative(name) {
  const normalized = name.replaceAll('\\', '/').replace(/^\/+/, '');
  const clean = path.posix.normalize(normalized);
  if (clean === '..' || clean.startsWith('../')) throw new Error(`Unsafe RAR path: ${name}`);
  return clean;
}

async function extractRar(archivePath, outDir) {
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
      continue;
    }
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, Buffer.from(entry.extraction));
    count++;
  }
  console.log(`[vendor] extracted ${path.basename(archivePath)}: ${count} files`);
}

async function walk(dir) {
  const out = [];
  async function visit(current) {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(full);
      else out.push(full);
    }
  }
  await visit(dir);
  return out;
}

async function patchLegacySource(sourceDir) {
  const connectionPath = path.join(sourceDir, 'connection.cpp');
  if (!fs.existsSync(connectionPath)) throw new Error('connection.cpp not found in DBO Rox source');
  let connection = await fsp.readFile(connectionPath, 'utf8');
  const replacements = [
    ['boost::posix_time::seconds(Connection::readTimeout)', 'boost::posix_time::seconds(static_cast<long>(Connection::readTimeout))'],
    ['boost::posix_time::seconds(Connection::writeTimeout)', 'boost::posix_time::seconds(static_cast<long>(Connection::writeTimeout))'],
  ];
  let changed = 0;
  for (const [from, to] of replacements) {
    if (connection.includes(from)) {
      connection = connection.replaceAll(from, to);
      changed++;
    }
  }
  await fsp.writeFile(connectionPath, connection);
  console.log(`[compat] patched ${changed} modern-Boost timeout expressions in connection.cpp`);
}

for (const [name, url] of Object.entries(PACKAGES)) {
  const archive = path.join(WORK, `${name}.rar`);
  await fetchMediaFire(url, archive);
  await extractRar(archive, path.join(WORK, name));
}

const sourceFiles = await walk(path.join(WORK, 'source'));
const configure = sourceFiles.find(f => path.basename(f) === 'configure');
if (!configure) throw new Error('Could not find configure in DBO Rox source package');
const sourceRoot = path.dirname(configure);
await fsp.cp(sourceRoot, SOURCE_OUT, { recursive: true, force: true });
await patchLegacySource(SOURCE_OUT);

const serverFiles = await walk(path.join(WORK, 'server'));
const configFile = serverFiles.find(f => path.basename(f).toLowerCase() === 'config.lua');
if (!configFile) throw new Error('Could not find config.lua in DBO Rox server package');
const serverRoot = path.dirname(configFile);
const serverOut = path.join(RUNTIME, 'server');
await fsp.cp(serverRoot, serverOut, { recursive: true, force: true });

const databaseFiles = await walk(path.join(WORK, 'database'));
const databaseSql = databaseFiles.find(f => /\.sql$/i.test(f));
if (!databaseSql) throw new Error('Could not find database.sql in DBO Rox database package');
await fsp.copyFile(databaseSql, path.join(RUNTIME, 'database.sql'));

const runtimeConfigPath = path.join(serverOut, 'config.lua');
let config = await fsp.readFile(runtimeConfigPath, 'utf8');
const replaceSetting = (name, value) => {
  const rx = new RegExp(`^\\s*${name}\\s*=.*$`, 'm');
  if (rx.test(config)) config = config.replace(rx, `${name} = ${value}`);
  else config += `\n${name} = ${value}\n`;
};
replaceSetting('ip', '"127.0.0.1"');
replaceSetting('sqlType', '"mysql"');
replaceSetting('sqlHost', '"127.0.0.1"');
replaceSetting('sqlPort', '3306');
replaceSetting('sqlUser', '"root"');
replaceSetting('sqlPass', '""');
replaceSetting('sqlDatabase', '"dborox"');
replaceSetting('loginOnlyWithLoginServer', 'false');
replaceSetting('allowClones', 'true');
replaceSetting('onePlayerOnlinePerAccount', 'false');
replaceSetting('serverName', '"Dragon Ball Guest"');
await fsp.writeFile(runtimeConfigPath, config);

console.log('[prepare] source root:', sourceRoot);
console.log('[prepare] server root:', serverRoot);
console.log('[prepare] map:', serverFiles.find(f => /DBZO\.otbm$/i.test(f)) || 'not-found');
console.log('[prepare] Linux build staging ready');
