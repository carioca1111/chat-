import fsp from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const WORK = path.join(ROOT, '.vendor-work');

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

function section(text, needle, length = 12000) {
  const i = text.indexOf(needle);
  if (i < 0) return '';
  return text.slice(i, i + length);
}

for (const name of ['server', 'source', 'database']) {
  const dir = path.join(WORK, name);
  const files = await walk(dir);
  const rel = files.map(f => path.relative(dir, f).replaceAll('\\', '/'));
  console.log(`\n[inspect:${name}] ${rel.length} files`);
  for (const f of rel.slice(0, 120)) console.log(`[inspect:${name}] ${f}`);

  if (name === 'server') {
    const cfg = files.find(f => path.basename(f).toLowerCase() === 'config.lua');
    if (cfg) {
      console.log('\n[inspect:server:config.lua]');
      console.log((await fsp.readFile(cfg, 'utf8').catch(() => '')).slice(0, 16000));
    }
    const maps = rel.filter(f => /\.(otbm|xml)$/i.test(f) && /map/i.test(f));
    console.log('[inspect:server:map-candidates]', maps.slice(0, 30).join(' | '));
  }

  if (name === 'database') {
    const sql = files.find(f => /\.sql$/i.test(f));
    if (sql) {
      const text = await fsp.readFile(sql, 'utf8').catch(() => '');
      console.log('[inspect:database:accounts]');
      console.log(section(text, 'CREATE TABLE `accounts`', 9000));
      console.log('[inspect:database:players]');
      console.log(section(text, 'CREATE TABLE `players`', 18000));
      console.log('[inspect:database:accounts-data]');
      console.log(section(text, 'INSERT INTO `accounts`', 6000));
      console.log('[inspect:database:players-data]');
      console.log(section(text, 'INSERT INTO `players`', 12000));
    }
  }

  if (name === 'source') {
    const interesting = files.filter(f => /(?:configure\.ac|protocolgame\.cpp|protocollogin\.cpp|iologindata\.cpp)$/i.test(f));
    for (const file of interesting) {
      const text = await fsp.readFile(file, 'utf8').catch(() => '');
      console.log(`\n[inspect:source:file] ${path.relative(dir, file).replaceAll('\\', '/')}`);
      if (/configure\.ac$/i.test(file)) console.log(text.slice(0, 16000));
      else console.log(text.slice(0, 10000));
    }
  }
}
