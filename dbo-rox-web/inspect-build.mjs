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

for (const name of ['server', 'source', 'database']) {
  const dir = path.join(WORK, name);
  const files = await walk(dir);
  const rel = files.map(f => path.relative(dir, f).replaceAll('\\', '/'));
  console.log(`\n[inspect:${name}] ${rel.length} files`);
  for (const f of rel.slice(0, 120)) console.log(`[inspect:${name}] ${f}`);

  if (name === 'database') {
    const sql = files.find(f => /\.(sql|sqlite|s3db|db)$/i.test(f));
    if (sql && /\.sql$/i.test(sql)) {
      const text = await fsp.readFile(sql, 'utf8').catch(() => '');
      console.log('[inspect:database:head]');
      console.log(text.slice(0, 5000));
    }
  }

  if (name === 'source') {
    const interesting = files.filter(f => /(?:CMakeLists\.txt|configure\.ac|configure|Makefile|database.*\.(cpp|h)|protocolgame.*\.(cpp|h)|protocollogin.*\.(cpp|h))$/i.test(f));
    for (const file of interesting.slice(0, 15)) {
      const text = await fsp.readFile(file, 'utf8').catch(() => '');
      console.log(`\n[inspect:source:file] ${path.relative(dir, file).replaceAll('\\', '/')}`);
      console.log(text.slice(0, 4000));
    }
  }
}
