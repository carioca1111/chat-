const fs = require('fs');
const p = 'autoprep.js';
let s = fs.readFileSync(p, 'utf8');

const oldRun = "    if (result.error) throw result.error;\n    if (result.status !== 0) throw new Error(`${path.basename(exe)} terminou com código ${result.status}`);\n    return result;";
const newRun = "    if (result.error) throw result.error;\n    if (result.status !== 0) {\n      const detail = [result.stderr, result.stdout].filter(Boolean).map(x => String(x).trim()).filter(Boolean).join(' | ').slice(-3500);\n      throw new Error(`${path.basename(exe)} terminou com código ${result.status}${detail ? `: ${detail}` : ''}`);\n    }\n    return result;";
if (!s.includes(oldRun)) throw new Error('runCapture target not found');
s = s.replace(oldRun, newRun);

const oldInit = "        runCapture(installDb, [`--datadir=${mariaData}`, `--password=${s.dbPassword}`, `--port=${DB_PORT}`], { cwd: mariaRoot });";
const newInit = "        runCapture(installDb, [`--datadir=${mariaData}`, `--password=${s.dbPassword}`, `--port=${DB_PORT}`, '--allow-remote-root-access', '--verbose-bootstrap'], { cwd: mariaRoot });";
if (!s.includes(oldInit)) throw new Error('install-db target not found');
s = s.replace(oldInit, newInit);

const anchor = "      if (!fs.existsSync(path.join(mariaData, 'mysql'))) {\n        emit('Inicializando banco local...', 72);";
const repair = "      const importedMarker = path.join(r, 'database-imported.txt');\n      const partialDb = fs.existsSync(path.join(mariaData, 'mysql')) && !fs.existsSync(manifestPath()) && !fs.existsSync(importedMarker);\n      if (partialDb) {\n        emit('Reparando instalação parcial do banco...', 70);\n        await stopDatabase();\n        await new Promise(resolve => setTimeout(resolve, 1200));\n        if (await probePort('127.0.0.1', DB_PORT, 300)) {\n          throw new Error('A porta 3307 ainda está ocupada. Feche qualquer versão antiga do DBO Dev Bridge e tente novamente.');\n        }\n        await fsp.rm(mariaData, { recursive: true, force: true });\n        log('[PREPARAR] Banco parcial antigo removido; será recriado com acesso TCP local habilitado.');\n      }\n\n      if (!fs.existsSync(path.join(mariaData, 'mysql'))) {\n        emit('Inicializando banco local...', 72);";
if (!s.includes(anchor)) throw new Error('partial-db anchor not found');
s = s.replace(anchor, repair);

const oldImported = "      const imported = path.join(r, 'database-imported.txt');\n      if (!fs.existsSync(imported)) {\n        runCapture(mariadbCli, [...auth, 'dborox'], { cwd: mariaRoot, input: fs.readFileSync(databaseSql), maxBuffer: 256 * 1024 * 1024 });\n        fs.writeFileSync(imported, new Date().toISOString());\n      }";
const newImported = "      const imported = importedMarker;\n      if (!fs.existsSync(imported)) {\n        runCapture(mariadbCli, [...auth, 'dborox'], { cwd: mariaRoot, input: fs.readFileSync(databaseSql), maxBuffer: 256 * 1024 * 1024 });\n        fs.writeFileSync(imported, new Date().toISOString());\n      }";
if (!s.includes(oldImported)) throw new Error('import marker target not found');
s = s.replace(oldImported, newImported);

fs.writeFileSync(p, s);
console.log('autoprep.js patched for Alpha 0.2.2');