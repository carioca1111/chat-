import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: node fix-runtime.mjs <otclient-web-root>');
const mainPath = path.join(root, 'src/main.ts');
let src = fs.readFileSync(mainPath, 'utf8');

const earlyHud = '  document.body.appendChild(app.canvas);\n  createAscensionHud();\n';
if (!src.includes(earlyHud)) throw new Error('early HUD call anchor not found');
src = src.replace(earlyHud, '  document.body.appendChild(app.canvas);\n');

const safeAnchor = '  // Row to render the player against. During a south walk we render the\n';
if (!src.includes(safeAnchor)) throw new Error('safe HUD init anchor not found');
src = src.replace(
  safeAnchor,
  "  // Alpha 0.2 UI must boot only after monsters, inventory and HUD refs exist.\n  createAscensionHud();\n\n" + safeAnchor,
);

// Never leave the tester staring at a black canvas again: surface runtime
// exceptions as an in-page diagnostic card while also keeping console output.
const loaderAnchor = "const loaderEl = document.getElementById('loader')!;\n";
if (!src.includes(loaderAnchor)) throw new Error('diagnostic anchor not found');
src = src.replace(loaderAnchor, loaderAnchor + `\nfunction showRuntimeCrash(message: string): void {\n  const old = document.getElementById('ascension-runtime-error');\n  if (old) old.remove();\n  const box = document.createElement('div');\n  box.id = 'ascension-runtime-error';\n  box.style.cssText = 'position:fixed;z-index:99999;left:16px;right:16px;bottom:16px;max-height:45vh;overflow:auto;background:#220b0b;color:#ffd7d7;border:1px solid #c84e4e;border-radius:8px;padding:12px;font:12px/1.4 monospace;white-space:pre-wrap;box-shadow:0 6px 28px #000b';\n  box.textContent = 'ASCENSION ALPHA 0.2 — RUNTIME ERROR\\n' + message;\n  document.body.appendChild(box);\n}\nwindow.addEventListener('error', (event) => {\n  showRuntimeCrash(event.error?.stack || event.message || 'Unknown runtime error');\n});\nwindow.addEventListener('unhandledrejection', (event) => {\n  const reason = event.reason;\n  showRuntimeCrash(reason?.stack || String(reason));\n});\n`);

fs.writeFileSync(mainPath, src);
console.log('[fix-runtime] moved HUD initialization after game state and enabled crash overlay');
