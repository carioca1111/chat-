const fs = require('fs');
const p = 'autoprep.js';
let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const replaceOnce = (from, to, label) => {
  if (!s.includes(from)) throw new Error(`${label} target not found`);
  s = s.replace(from, to);
};

replaceOnce(
"    if (result.error) throw result.error;\n    if (result.status !== 0) throw new Error(`${path.basename(exe)} terminou com código ${result.status}`);\n    return result;",
"    if (result.error) throw result.error;\n    if (result.status !== 0) {\n      const detail = [result.stderr, result.stdout].filter(Boolean).map(x => String(x).trim()).filter(Boolean).join(' | ').slice(-3500);\n      throw new Error(`${path.basename(exe)} terminou com código ${result.status}${detail ? `: ${detail}` : ''}`);\n    }\n    return result;",
'runCapture'
);

replaceOnce(
"    const args = [`--defaults-file=${ini}`, '--console', `--port=${port}`, '--bind-address=127.0.0.1', '--skip-name-resolve', '--max-connections=20', '--innodb-buffer-pool-size=64M'];",
"    const args = [`--defaults-file=${ini}`, '--console', `--port=${port}`, '--bind-address=127.0.0.1', '--max-connections=20', '--innodb-buffer-pool-size=64M'];",
'ensureDbRunning args'
);

replaceOnce(
"    set('sqlUser', '\"root\"'); set('sqlPass', JSON.stringify(s.dbPassword)); set('sqlDatabase', '\"dborox\"');",
"    set('sqlUser', '\"dborox\"'); set('sqlPass', JSON.stringify(s.dbPassword)); set('sqlDatabase', '\"dborox\"');",
'config db user'
);

replaceOnce(
"        runCapture(installDb, [`--datadir=${mariaData}`, `--password=${s.dbPassword}`, `--port=${DB_PORT}`], { cwd: mariaRoot });",
"        runCapture(installDb, [`--datadir=${mariaData}`, `--password=${s.dbPassword}`, `--port=${DB_PORT}`, '--verbose-bootstrap'], { cwd: mariaRoot });",
'install-db'
);

const anchor = "      if (!fs.existsSync(path.join(mariaData, 'mysql'))) {\n        emit('Inicializando banco local...', 72);";
const repair = "      const importedMarker = path.join(r, 'database-imported.txt');\n      const partialDb = fs.existsSync(path.join(mariaData, 'mysql')) && !fs.existsSync(manifestPath()) && !fs.existsSync(importedMarker);\n      if (partialDb) {\n        emit('Reparando instalação parcial do banco...', 70);\n        await stopDatabase();\n        await new Promise(resolve => setTimeout(resolve, 1200));\n        if (await probePort('127.0.0.1', DB_PORT, 300)) {\n          throw new Error('A porta 3307 ainda está ocupada. Feche qualquer versão antiga do DBO Dev Bridge e tente novamente.');\n        }\n        await fsp.rm(mariaData, { recursive: true, force: true });\n        log('[PREPARAR] Banco parcial antigo removido; será recriado com autenticação TCP correta.');\n      }\n\n      if (!fs.existsSync(path.join(mariaData, 'mysql'))) {\n        emit('Inicializando banco local...', 72);";
replaceOnce(anchor, repair, 'partial-db anchor');

replaceOnce(
"      const auth = ['-h127.0.0.1', `-P${DB_PORT}`, '-uroot', `-p${s.dbPassword}`];\n      runCapture(mariadbCli, [...auth, '-e', 'CREATE DATABASE IF NOT EXISTS dborox CHARACTER SET latin1 COLLATE latin1_swedish_ci;'], { cwd: mariaRoot });",
"      let rootAuth = ['--protocol=TCP', '-h127.0.0.1', `-P${DB_PORT}`, '-uroot', `-p${s.dbPassword}`];\n      try {\n        runCapture(mariadbCli, [...rootAuth, '-e', 'SELECT 1;'], { cwd: mariaRoot });\n      } catch (authError) {\n        emit('Credenciais antigas detectadas; reconstruindo apenas o banco local...', 78);\n        log(`[PREPARAR] Banco antigo rejeitou a senha atual: ${authError.message}`);\n        await stopDatabase();\n        await new Promise(resolve => setTimeout(resolve, 1200));\n        if (await probePort('127.0.0.1', DB_PORT, 300)) throw new Error('A porta 3307 continua ocupada. Feche versões antigas da Bridge e tente novamente.');\n        await fsp.rm(mariaData, { recursive: true, force: true });\n        await fsp.rm(importedMarker, { force: true });\n        await fsp.rm(manifestPath(), { force: true });\n        await fsp.mkdir(mariaData, { recursive: true });\n        runCapture(installDb, [`--datadir=${mariaData}`, `--password=${s.dbPassword}`, `--port=${DB_PORT}`, '--verbose-bootstrap'], { cwd: mariaRoot });\n        await ensureDbRunning();\n        runCapture(mariadbCli, [...rootAuth, '-e', 'SELECT 1;'], { cwd: mariaRoot });\n        log('[PREPARAR] Banco local reconstruído com a senha atual.');\n      }\n      const provisionSql = `CREATE DATABASE IF NOT EXISTS dborox CHARACTER SET latin1 COLLATE latin1_swedish_ci; CREATE USER IF NOT EXISTS 'dborox'@'127.0.0.1' IDENTIFIED BY '${s.dbPassword}'; ALTER USER 'dborox'@'127.0.0.1' IDENTIFIED BY '${s.dbPassword}'; GRANT ALL PRIVILEGES ON dborox.* TO 'dborox'@'127.0.0.1'; FLUSH PRIVILEGES;`;\n      runCapture(mariadbCli, [...rootAuth, '-e', provisionSql], { cwd: mariaRoot });\n      const auth = ['--protocol=TCP', '-h127.0.0.1', `-P${DB_PORT}`, '-udborox', `-p${s.dbPassword}`];",
'provision dedicated db user with rebuild fallback'
);

replaceOnce(
"      const imported = path.join(r, 'database-imported.txt');\n      if (!fs.existsSync(imported)) {\n        runCapture(mariadbCli, [...auth, 'dborox'], { cwd: mariaRoot, input: fs.readFileSync(databaseSql), maxBuffer: 256 * 1024 * 1024 });\n        fs.writeFileSync(imported, new Date().toISOString());\n      }",
"      const imported = importedMarker;\n      if (!fs.existsSync(imported)) {\n        runCapture(mariadbCli, [...auth, 'dborox'], { cwd: mariaRoot, input: fs.readFileSync(databaseSql), maxBuffer: 256 * 1024 * 1024 });\n        fs.writeFileSync(imported, new Date().toISOString());\n      }",
'import marker'
);

fs.writeFileSync(p, s);
console.log('autoprep.js patched for Alpha 0.2.4');