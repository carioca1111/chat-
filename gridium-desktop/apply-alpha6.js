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

// O overlay Alpha 5 do CI pode regravar package.json depois da base compacta.
// Garanta o número de versão final usado pelo electron-builder.
const pkgPath = path.join(targetDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = '3.0.0-alpha.6';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`Gridium ${pkg.version} aplicado em ${targetDir}`);
// Alpha 6.1 corrected UI build trigger.
