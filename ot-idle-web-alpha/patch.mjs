import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: node patch.mjs <otclient-web-root>');
const mainPath = path.join(root, 'src/main.ts');
const mapPath = path.join(root, 'map.html');
const indexPath = path.join(root, 'index.html');
let src = fs.readFileSync(mainPath, 'utf8');

function replaceOnce(from, to, label) {
  if (!src.includes(from)) throw new Error(`patch anchor not found: ${label}`);
  src = src.replace(from, to);
}

replaceOnce(
  "{ lookType: 128, headColor: 78, bodyColor: 69, legsColor: 58, feetColor: 95 },",
  "{ lookType: 1, headColor: 0, bodyColor: 0, legsColor: 0, feetColor: 0 },",
  'custom player lookType',
);

replaceOnce(
  'let ambient: LightingOptions = NIGHT_AMBIENT;',
  'let ambient: LightingOptions = DAY_AMBIENT;',
  'daylight default',
);

replaceOnce(
  "  // --- Walk animation ticker ---\n",
  "  // --- Ascension idle mode (server-side behavior will replace this local prototype later) ---\n  let idleHuntEnabled = true;\n  let idleHuntNextAt = 0;\n\n  // --- Walk animation ticker ---\n",
  'idle state',
);

replaceOnce(
  '    const heldDir = joystickDir ?? keyboard.heldDirection;\n',
  `    const heldDir = joystickDir ?? keyboard.heldDirection;\n\n    // Alpha 0.1 browser demo: when there is no manual input, roam using the\n    // same tile collision/pathing primitives as normal OT movement. The final\n    // TFS build will move this decision to the server and replace roaming with\n    // monster targeting, combat and loot.\n    if (idleHuntEnabled && heldDir === null && !floorChangeInProgress\n        && (!walkState || !walkState.active) && performance.now() >= idleHuntNextAt) {\n      const directions: Direction[] = [Direction.North, Direction.East, Direction.South, Direction.West];\n      for (let i = directions.length - 1; i > 0; i--) {\n        const j = Math.floor(Math.random() * (i + 1));\n        [directions[i], directions[j]] = [directions[j], directions[i]];\n      }\n      for (const dir of directions) {\n        const step = stepInDirection(player.x, player.y, dir);\n        if (isTileWalkable(step.x, step.y, renderZ, tileMap, datIndex)) {\n          walkState = startWalk(player, [step], performance.now(), onStepLand);\n          break;\n        }\n      }\n      idleHuntNextAt = performance.now() + 180;\n    }\n`,
  'idle ticker',
);

replaceOnce(
  "  const devControls = createDevControls([\n    {\n      label: 'Night',\n      defaultOn: true,",
  "  const devControls = createDevControls([\n    {\n      label: 'Idle Hunt',\n      defaultOn: true,\n      onChange: (on) => { idleHuntEnabled = on; },\n    },\n    {\n      label: 'Night',\n      defaultOn: false,",
  'idle toggle',
);

fs.writeFileSync(mainPath, src);

let html = fs.readFileSync(mapPath, 'utf8');
html = html
  .replace('<title>OTClient Web</title>', '<title>Ascension OT Idle — Alpha 0.1</title>')
  .replace('<h1>OTClient Web</h1>', '<h1>Ascension OT Idle — Alpha 0.1</h1>')
  .replace('Load your Tibia 7.6 client files to view the map', 'OpenTibia browser core · original test assets · idle movement')
  .replace('Tibia.dat, Tibia.spr, items.otb, map.otbm', 'Assets próprios carregados automaticamente');
fs.writeFileSync(mapPath, html);
fs.writeFileSync(indexPath, html);
console.log('[patch] OpenTibia Web patched for Ascension Alpha 0.1');
