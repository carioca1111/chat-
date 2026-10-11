'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const target = process.argv[2];
if (!target) throw new Error('Uso: node apply-alpha5.js <diretorio-alvo>');
const targetDir = path.resolve(process.cwd(), target);
if (!fs.existsSync(targetDir)) throw new Error(`Diretorio alvo nao existe: ${targetDir}`);

function applyPackedPatch(folder, expectedParts, label) {
  const dir = path.join(__dirname, folder);
  const parts = fs.readdirSync(dir).filter(x => /^part\d+\.b64$/.test(x)).sort();
  if (parts.length !== expectedParts) throw new Error(`${label}: esperado ${expectedParts} chunks, achou ${parts.length}`);
  const b64 = parts.map(x => fs.readFileSync(path.join(dir, x), 'utf8').trim()).join('');
  const patch = zlib.gunzipSync(Buffer.from(b64, 'base64'));
  const patchPath = path.join(__dirname, `.${folder.replace(/[^a-z0-9_-]/gi, '_')}.patch.tmp`);
  fs.writeFileSync(patchPath, patch);
  try {
    const r = spawnSync('git', ['apply', '--unsafe-paths', '--whitespace=nowarn', patchPath], { cwd: targetDir, stdio: 'inherit' });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`${label}: git apply falhou com codigo ${r.status}`);
  } finally {
    try { fs.unlinkSync(patchPath); } catch {}
  }
}

// O Alpha 4 publicado pelo CI usa uma base compacta. Estes dois patches
// alinham somente os arquivos que o overlay Alpha 5 precisa modificar.
applyPackedPatch('alpha4-normalize', 3, 'Normalizacao Alpha 4');
applyPackedPatch('alpha4-normalize-extra', 1, 'Normalizacao extra Alpha 4');
applyPackedPatch('alpha5-patch', 9, 'Overlay Alpha 5');

const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
if (pkg.version !== '3.0.0-alpha.5') throw new Error(`Versao inesperada apos patch: ${pkg.version}`);
console.log(`Gridium ${pkg.version} aplicado em ${targetDir}`);
