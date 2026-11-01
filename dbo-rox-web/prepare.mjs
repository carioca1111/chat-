import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import archiver from 'archiver';
import { createExtractorFromData } from 'node-unrar-js';

const ROOT = path.resolve(process.cwd());
const WORK = path.join(ROOT, '.vendor-work');
const DIST = path.join(ROOT, 'dist');

const PACKAGES = {
  client: 'https://www.mediafire.com/file/ykfc9vo7fiq2flt/Dbo_Rox_Client.rar/file',
  server: 'https://www.mediafire.com/file/46j6dywwv8mtv4j/DboRox.rar/file',
  source: 'https://www.mediafire.com/file/1nvpp57qrdi6jeq/Source_DboRox.rar/file',
  database: 'https://www.mediafire.com/file/641diq6mvgq87xz/Database_Dborox.rar/file',
};

await fsp.rm(WORK, { recursive: true, force: true });
await fsp.rm(DIST, { recursive: true, force: true });
await fsp.mkdir(WORK, { recursive: true });
await fsp.mkdir(DIST, { recursive: true });

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
  if (!matches.length) {
    await fsp.writeFile(path.join(WORK, 'mediafire-debug.html'), html);
    throw new Error(`Could not resolve direct MediaFire URL for ${pageUrl}`);
  }
  const direct = decodeHtml(matches[0][1]);
  const response = await fetch(direct, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/156 Safari/537.36' },
  });
  if (!response.ok || !response.body) throw new Error(`MediaFire download failed ${response.status}: ${direct}`);
  await fsp.mkdir(path.dirname(outputFile), { recursive: true });
  await pipeline(response.body, fs.createWriteStream(outputFile));
  return { pageUrl, direct, bytes: (await fsp.stat(outputFile)).size };
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
  let files = 0;
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
    files++;
  }
  return files;
}

async function walk(dir) {
  const out = [];
  async function visit(current) {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(full);
      else out.push(full);
    }
  }
  await visit(dir);
  return out;
}

async function findClientRoot(extracted) {
  const files = await walk(extracted);
  const initFiles = files.filter(f => path.basename(f).toLowerCase() === 'init.lua');
  for (const init of initFiles) {
    const dir = path.dirname(init);
    const data = path.join(dir, 'data');
    const modules = path.join(dir, 'modules');
    if (fs.existsSync(data) && fs.existsSync(modules)) return dir;
  }
  throw new Error(`No OTClient root (init.lua + data + modules) found in ${extracted}`);
}

async function copyDir(src, dest) {
  await fsp.cp(src, dest, { recursive: true, force: true });
}

async function ensure860Assets(clientRoot, staging) {
  const all = await walk(clientRoot);
  const dat = all.find(f => path.basename(f).toLowerCase() === 'tibia.dat');
  const spr = all.find(f => path.basename(f).toLowerCase() === 'tibia.spr');
  if (!dat || !spr) throw new Error('DBO Rox client archive does not contain Tibia.dat/Tibia.spr');
  const things = path.join(staging, 'data', 'things', '860');
  await fsp.mkdir(things, { recursive: true });
  if (!fs.existsSync(path.join(things, 'Tibia.dat'))) await fsp.copyFile(dat, path.join(things, 'Tibia.dat'));
  if (!fs.existsSync(path.join(things, 'Tibia.spr'))) await fsp.copyFile(spr, path.join(things, 'Tibia.spr'));
}

async function zipDirectory(srcDir, outFile) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

const manifest = {
  builtAt: new Date().toISOString(),
  base: 'DBO Rox V2 8.60',
  protocol: 860,
  provenance: 'TibiaKing / original community MediaFire links',
  packages: {},
};

for (const [name, url] of Object.entries(PACKAGES)) {
  const archive = path.join(WORK, `${name}.rar`);
  console.log(`[vendor] downloading ${name}`);
  const download = await fetchMediaFire(url, archive);
  const extracted = path.join(WORK, name);
  console.log(`[vendor] extracting ${name}`);
  const count = await extractRar(archive, extracted);
  manifest.packages[name] = { source: url, bytes: download.bytes, extractedFiles: count };
}

const clientRoot = await findClientRoot(path.join(WORK, 'client'));
const staging = path.join(WORK, 'game-data');
await fsp.mkdir(staging, { recursive: true });

for (const name of ['init.lua', 'data', 'modules', 'mods']) {
  const src = path.join(clientRoot, name);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(staging, name);
  const stat = await fsp.stat(src);
  if (stat.isDirectory()) await copyDir(src, dest);
  else await fsp.copyFile(src, dest);
}
await ensure860Assets(clientRoot, staging);

// Marker used by our deployment page; the original client files remain otherwise untouched.
await fsp.writeFile(path.join(staging, 'DBO_ROX_BASE.txt'), [
  'DBO Rox V2 8.60',
  'Imported at build time from the community download links.',
  'Target: OTClient Redemption Web / protocol 8.60.',
  '',
].join('\n'));

const zipPath = path.join(DIST, 'dbo-rox-game-data.zip');
await zipDirectory(staging, zipPath);
manifest.gameDataZipBytes = (await fsp.stat(zipPath)).size;

for (const name of ['server', 'source', 'database']) {
  const dir = path.join(WORK, name);
  const files = await walk(dir);
  manifest.packages[name].sampleFiles = files.slice(0, 40).map(f => path.relative(dir, f).replaceAll('\\', '/'));
}

await fsp.writeFile(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('[build] DBO Rox original client bundle prepared:', manifest.gameDataZipBytes, 'bytes');
