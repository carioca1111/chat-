'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const target = process.argv[2];
if (!target) throw new Error('Uso: node apply-alpha6.js <diretorio-alvo>');
const targetDir = path.resolve(process.cwd(), target);
if (!fs.existsSync(targetDir)) throw new Error(`Diretorio alvo nao existe: ${targetDir}`);

const patchDir = path.join(__dirname, 'alpha6-patch');
const parts = ['part00.b64', 'part01.b64', 'part02.b64', 'part03.b64'];
const b64 = parts.map(name => fs.readFileSync(path.join(patchDir, name), 'utf8').trim()).join('');
const patch = zlib.gunzipSync(Buffer.from(b64, 'base64'));
const tmp = path.join(__dirname, '.alpha6.patch.tmp');
fs.writeFileSync(tmp, patch);
try {
  const r = spawnSync('git', ['apply', '--unsafe-paths', '--whitespace=nowarn', tmp], { cwd: targetDir, stdio: 'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`Alpha 6: git apply falhou com codigo ${r.status}`);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}

const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
if (pkg.version !== '3.0.0-alpha.6') throw new Error(`Versao inesperada apos patch: ${pkg.version}`);
console.log(`Gridium ${pkg.version} aplicado em ${targetDir}`);
