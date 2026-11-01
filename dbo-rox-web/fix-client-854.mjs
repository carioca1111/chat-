import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';

const root = path.resolve(process.cwd());
const dist = path.join(root, 'dist');
const zipPath = path.join(dist, 'dbo-rox-game-data-webcompat.zip');
const temp = path.join(root, '.web854-fix');

if (!fs.existsSync(zipPath)) throw new Error(`Game data ZIP not found: ${zipPath}`);

await fsp.rm(temp, { recursive: true, force: true });
await fsp.mkdir(temp, { recursive: true });

const zip = new AdmZip(zipPath);
zip.extractAllTo(temp, true);

const thingsRoot = path.join(temp, 'data', 'things');
const source860 = path.join(thingsRoot, '860');
const target854 = path.join(thingsRoot, '854');
if (!fs.existsSync(source860)) throw new Error('Expected staged data/things/860 folder was not found');

await fsp.rm(target854, { recursive: true, force: true });
await fsp.cp(source860, target854, { recursive: true, force: true });

const dat = path.join(target854, 'Tibia.dat');
const spr = path.join(target854, 'Tibia.spr');
if (!fs.existsSync(dat) || !fs.existsSync(spr)) throw new Error('8.54 DAT/SPR post-process failed');

// The original DBO Rox client identifies itself as 8.54 and ships its DAT/SPR
// under data/things/854. Remove the misleading 8.60 copy so the web runtime
// cannot accidentally select it again.
await fsp.rm(source860, { recursive: true, force: true });

const out = new AdmZip();
async function addDir(dir, rel = '') {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await addDir(full, childRel);
    else out.addFile(childRel.replaceAll('\\', '/'), await fsp.readFile(full));
  }
}
await addDir(temp);
out.writeZip(zipPath);

const manifestPath = path.join(dist, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  manifest.clientVersion = 854;
  manifest.assetVersion = 854;
  manifest.protocolNote = 'Original DBO Rox client connects as 8.54; server package is distributed as DBO Rox V2 8.60.';
  manifest.gameDataZipBytes = (await fsp.stat(zipPath)).size;
  manifest.builtAt = new Date().toISOString();
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

console.log('[compat] original DBO Rox DAT/SPR staged at data/things/854');
console.log('[compat] Tibia.dat bytes:', (await fsp.stat(dat)).size);
console.log('[compat] Tibia.spr bytes:', (await fsp.stat(spr)).size);
console.log('[compat] web bundle bytes:', (await fsp.stat(zipPath)).size);

await fsp.rm(temp, { recursive: true, force: true });
