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
  '  const tintedOutfitCache: TintedTextureCache = new Map();\n',
  `  const tintedOutfitCache: TintedTextureCache = new Map();\n\n  // --- Ascension Alpha 0.2: OT-native offline combat sandbox ---\n  // Creatures are rendered through the same DAT/SPR creature renderer used by\n  // the OpenTibia client. The authoritative TFS server replaces this local\n  // simulation in the networked milestone; this sandbox validates the loop.\n  type DemoMonster = {\n    id: number; name: string; state: PlayerState; spawnX: number; spawnY: number;\n    hp: number; maxHp: number; damage: number; xp: number; gold: number;\n    respawnAt: number; loot: string;\n  };\n\n  const mkMonster = (id: number, name: string, lookType: number, dx: number, dy: number, hp: number, damage: number, xpReward: number, goldReward: number, loot: string): DemoMonster => {\n    const x = spawn.x + dx, y = spawn.y + dy;\n    return {\n      id, name, spawnX: x, spawnY: y, hp, maxHp: hp, damage, xp: xpReward, gold: goldReward, respawnAt: 0, loot,\n      state: createPlayer(x, y, spawn.z, { lookType, headColor: 0, bodyColor: 0, legsColor: 0, feetColor: 0 }),\n    };\n  };\n\n  const monsters: DemoMonster[] = [\n    mkMonster(1, 'Rat', 2, 5, -4, 28, 4, 15, 4, 'Rat Tail'),\n    mkMonster(2, 'Slime', 4, 12, -2, 46, 6, 24, 7, 'Slime Gel'),\n    mkMonster(3, 'Wolf', 3, 18, -8, 66, 9, 38, 11, 'Wolf Pelt'),\n    mkMonster(4, 'Cave Brute', 5, 28, -10, 120, 14, 78, 25, 'Brute Core'),\n  ];\n\n  let idleHuntEnabled = true;\n  let nextIdleDecisionAt = 0;\n  let nextPlayerAttackAt = 0;\n  let nextMonsterThinkAt = 0;\n  let playerHp = 120;\n  let playerMaxHp = 120;\n  let playerLevel = 1;\n  let playerXp = 0;\n  let playerXpNeed = 80;\n  let playerGold = 0;\n  let playerKills = 0;\n  let currentTargetId = 0;\n  const inventory = new Map<string, number>();\n  let hud: HTMLDivElement | null = null;\n  let hudStats: HTMLDivElement | null = null;\n  let hudInventory: HTMLDivElement | null = null;\n  let hudLog: HTMLDivElement | null = null;\n  let hudIdleButton: HTMLButtonElement | null = null;\n\n  const manhattan = (ax: number, ay: number, bx: number, by: number) => Math.abs(ax - bx) + Math.abs(ay - by);\n  const isAlive = (m: DemoMonster) => m.hp > 0;\n  function nearestMonster(): DemoMonster | null {\n    let best: DemoMonster | null = null;\n    let bestD = Number.POSITIVE_INFINITY;\n    for (const m of monsters) {\n      if (!isAlive(m)) continue;\n      const d = manhattan(player.x, player.y, m.state.x, m.state.y);\n      if (d < bestD) { bestD = d; best = m; }\n    }\n    return best;\n  }\n  function targetMonster(): DemoMonster | null {\n    return monsters.find(m => m.id === currentTargetId && isAlive(m)) ?? nearestMonster();\n  }\n  function addInventory(name: string, qty = 1): void {\n    inventory.set(name, (inventory.get(name) ?? 0) + qty);\n  }\n  function addGameLog(message: string): void {\n    if (!hudLog) return;\n    const line = document.createElement('div');\n    line.textContent = message;\n    hudLog.prepend(line);\n    while (hudLog.children.length > 7) hudLog.lastElementChild?.remove();\n  }\n  function updateHud(): void {\n    if (!hudStats || !hudInventory) return;\n    const target = targetMonster();\n    hudStats.innerHTML = \`<b>Lv \${playerLevel}</b> &nbsp; HP \${playerHp}/\${playerMaxHp}<br>XP \${playerXp}/\${playerXpNeed} &nbsp; Gold \${playerGold}<br>Kills \${playerKills}\${target ? \`<br>Target: <b>\${target.name}</b> \${target.hp}/\${target.maxHp}\` : ''}\`;\n    const entries = [...inventory.entries()];\n    hudInventory.innerHTML = entries.length ? entries.map(([name, qty]) => \`<div>\${name} x\${qty}</div>\`).join('') : '<span style="opacity:.65">Inventário vazio</span>';\n    if (hudIdleButton) hudIdleButton.textContent = idleHuntEnabled ? 'AUTO-HUNT: ON' : 'AUTO-HUNT: OFF';\n  }\n  function createAscensionHud(): void {\n    hud = document.createElement('div');\n    hud.style.cssText = 'position:fixed;z-index:50;top:12px;right:12px;width:250px;background:rgba(12,15,18,.90);border:1px solid #59636e;border-radius:8px;padding:10px;color:#eef4fa;font:13px/1.35 monospace;box-shadow:0 4px 20px #0008;pointer-events:auto';\n    const title = document.createElement('div');\n    title.innerHTML = '<b>ASCENSION OT · ALPHA 0.2</b><div style="font-size:10px;opacity:.65">OpenTibia browser sandbox</div>';\n    title.style.marginBottom = '8px';\n    hudStats = document.createElement('div');\n    hudStats.style.cssText = 'padding:7px;background:#182028;border-radius:5px;margin-bottom:7px';\n    hudIdleButton = document.createElement('button');\n    hudIdleButton.style.cssText = 'width:100%;padding:7px;margin-bottom:7px;background:#294d35;color:white;border:1px solid #477a55;border-radius:5px;cursor:pointer';\n    hudIdleButton.onclick = () => { idleHuntEnabled = !idleHuntEnabled; addGameLog(idleHuntEnabled ? 'Auto-hunt ativado.' : 'Auto-hunt pausado.'); updateHud(); };\n    const attack = document.createElement('button');\n    attack.textContent = 'ATACAR (SPACE)';\n    attack.style.cssText = 'width:100%;padding:7px;margin-bottom:7px;background:#542d2d;color:white;border:1px solid #875050;border-radius:5px;cursor:pointer';\n    attack.onclick = () => { const m = targetMonster(); if (m) attackMonster(m, performance.now()); };\n    const invTitle = document.createElement('div');\n    invTitle.textContent = 'LOOT';\n    invTitle.style.cssText = 'font-size:10px;opacity:.7;margin-top:4px';\n    hudInventory = document.createElement('div');\n    hudInventory.style.cssText = 'max-height:100px;overflow:auto;padding:6px;background:#151a1f;border-radius:5px;margin:3px 0 7px';\n    hudLog = document.createElement('div');\n    hudLog.style.cssText = 'font-size:10px;color:#b8c6d3;max-height:90px;overflow:hidden;border-top:1px solid #39424a;padding-top:5px';\n    hud.append(title, hudStats, hudIdleButton, attack, invTitle, hudInventory, hudLog);\n    document.body.appendChild(hud);\n    updateHud();\n    addGameLog('Mapa carregado. Caçada iniciada.');\n  }\n\n  function levelCheck(): void {\n    while (playerXp >= playerXpNeed) {\n      playerXp -= playerXpNeed;\n      playerLevel++;\n      playerXpNeed = Math.floor(playerXpNeed * 1.35);\n      playerMaxHp += 14;\n      playerHp = playerMaxHp;\n      addGameLog(\`LEVEL UP → \${playerLevel}\`);\n    }\n  }\n  function attackMonster(monster: DemoMonster, now: number): void {\n    if (!isAlive(monster) || now < nextPlayerAttackAt) return;\n    if (manhattan(player.x, player.y, monster.state.x, monster.state.y) > 1) return;\n    currentTargetId = monster.id;\n    nextPlayerAttackAt = now + 520;\n    const damage = 13 + playerLevel * 3 + Math.floor(Math.random() * 8);\n    monster.hp = Math.max(0, monster.hp - damage);\n    addGameLog(\`Você acertou \${monster.name}: -\${damage}\`);\n    if (monster.hp === 0) {\n      playerKills++;\n      playerXp += monster.xp;\n      playerGold += monster.gold;\n      addInventory(monster.loot, 1);\n      if (Math.random() < 0.22) addInventory('Health Potion', 1);\n      monster.respawnAt = now + 4500 + Math.random() * 2500;\n      currentTargetId = 0;\n      addGameLog(\`\${monster.name} derrotado! +\${monster.xp} XP +\${monster.gold} gold\`);\n      levelCheck();\n    }\n    render(true);\n    updateHud();\n  }\n  function respawnMonsters(now: number): void {\n    let changed = false;\n    for (const m of monsters) {\n      if (m.hp > 0 || m.respawnAt === 0 || now < m.respawnAt) continue;\n      m.hp = m.maxHp;\n      m.respawnAt = 0;\n      m.state.x = m.spawnX; m.state.y = m.spawnY; m.state.z = spawn.z;\n      m.state.animationPhase = 0;\n      changed = true;\n      addGameLog(\`\${m.name} reapareceu.\`);\n    }\n    if (changed) { render(true); updateHud(); }\n  }\n  function approachPath(monster: DemoMonster) {\n    const candidates = [Direction.North, Direction.East, Direction.South, Direction.West]\n      .map(dir => stepInDirection(monster.state.x, monster.state.y, dir))\n      .filter(pos => isTileWalkable(pos.x, pos.y, renderZ, tileMap, datIndex));\n    let best = null as ReturnType<typeof findPath>;\n    for (const pos of candidates) {\n      const path = findPath(player.x, player.y, pos.x, pos.y, renderZ, tileMap, datIndex);\n      if (path && (best === null || path.length < best.length)) best = path;\n    }\n    return best;\n  }\n  function damagePlayer(amount: number, source: string): void {\n    playerHp = Math.max(0, playerHp - amount);\n    if (playerHp === 0) {\n      playerGold = Math.max(0, playerGold - 10);\n      playerHp = playerMaxHp;\n      player.x = spawn.x; player.y = spawn.y; player.z = spawn.z;\n      walkState = null;\n      viewport.centerX = player.x; viewport.centerY = player.y;\n      addGameLog(\`Você morreu para \${source}. Reviveu no camp (-10 gold).\`);\n      render(true);\n    }\n    updateHud();\n  }\n`,
  'alpha 0.2 game state',
);

replaceOnce(
  '  document.body.appendChild(app.canvas);\n',
  '  document.body.appendChild(app.canvas);\n  createAscensionHud();\n',
  'hud boot',
);

replaceOnce(
  '    tileContainer.addChild(above.container);\n    const playerSprite = renderPlayer(player, creatureIndex, atlasTextures, atlasPages, layout, tintedOutfitCache);',
  `    tileContainer.addChild(above.container);\n    // Demo monsters use the actual creature renderer and DAT lookTypes.\n    for (const monster of monsters) {\n      if (!isAlive(monster)) continue;\n      const monsterSprite = renderPlayer(monster.state, creatureIndex, atlasTextures, atlasPages, layout, tintedOutfitCache);\n      if (monsterSprite) tileContainer.addChild(monsterSprite);\n    }\n    const playerSprite = renderPlayer(player, creatureIndex, atlasTextures, atlasPages, layout, tintedOutfitCache);`,
  'monster rendering',
);

replaceOnce(
  '  // --- Walk animation ticker ---\n',
  `  // --- Alpha 0.2 combat/monster ticker ---\n  app.ticker.add(() => {\n    const now = performance.now();\n    respawnMonsters(now);\n    if (now < nextMonsterThinkAt) return;\n    nextMonsterThinkAt = now + 680;\n    let moved = false;\n    for (const m of monsters) {\n      if (!isAlive(m)) continue;\n      const dist = manhattan(player.x, player.y, m.state.x, m.state.y);\n      if (dist <= 1) {\n        damagePlayer(m.damage, m.name);\n        continue;\n      }\n      if (dist > 7) continue;\n      const dirs: Direction[] = [];\n      if (Math.abs(player.x - m.state.x) >= Math.abs(player.y - m.state.y)) {\n        dirs.push(player.x > m.state.x ? Direction.East : Direction.West);\n        if (player.y !== m.state.y) dirs.push(player.y > m.state.y ? Direction.South : Direction.North);\n      } else {\n        dirs.push(player.y > m.state.y ? Direction.South : Direction.North);\n        if (player.x !== m.state.x) dirs.push(player.x > m.state.x ? Direction.East : Direction.West);\n      }\n      for (const dir of dirs) {\n        const step = stepInDirection(m.state.x, m.state.y, dir);\n        if (step.x === player.x && step.y === player.y) continue;\n        if (isTileWalkable(step.x, step.y, renderZ, tileMap, datIndex)) {\n          m.state.x = step.x; m.state.y = step.y; m.state.direction = dir;\n          m.state.animationPhase = m.state.animationPhase ? 0 : 1;\n          moved = true;\n          break;\n        }\n      }\n    }\n    if (moved) render(true);\n    updateHud();\n  });\n\n  // --- Walk animation ticker ---\n`,
  'monster ticker',
);

replaceOnce(
  '    const heldDir = joystickDir ?? keyboard.heldDirection;\n',
  `    const heldDir = joystickDir ?? keyboard.heldDirection;\n\n    if (idleHuntEnabled && heldDir === null && !floorChangeInProgress\n        && (!walkState || !walkState.active) && performance.now() >= nextIdleDecisionAt) {\n      const now = performance.now();\n      const target = targetMonster();\n      if (target) {\n        currentTargetId = target.id;\n        const dist = manhattan(player.x, player.y, target.state.x, target.state.y);\n        if (dist <= 1) {\n          attackMonster(target, now);\n          nextIdleDecisionAt = now + 150;\n        } else {\n          const path = approachPath(target);\n          if (path && path.length > 0) {\n            walkState = startWalk(player, path, now, onStepLand);\n            render(true);\n          }\n          nextIdleDecisionAt = now + 220;\n        }\n      }\n      updateHud();\n    }\n`,
  'idle hunter',
);

replaceOnce(
  "  const keyboard = createKeyboard({\n    onToggle: (id) => {",
  `  const keyboard = createKeyboard({\n    onToggle: (id) => {`,
  'keyboard preserve',
);

replaceOnce(
  "  });\n\n  // --- Walk animation ticker ---",
  `  });\n\n  window.addEventListener('keydown', (event) => {\n    if (event.code === 'Space') {\n      event.preventDefault();\n      const target = targetMonster();\n      if (target) attackMonster(target, performance.now());\n    }\n    if (event.code === 'KeyI' && !event.repeat) {\n      idleHuntEnabled = !idleHuntEnabled;\n      addGameLog(idleHuntEnabled ? 'Auto-hunt ativado.' : 'Auto-hunt pausado.');\n      updateHud();\n    }\n  });\n\n  // --- Walk animation ticker ---`,
  'manual combat keys',
);

replaceOnce(
  "  const devControls = createDevControls([\n    {\n      label: 'Night',\n      defaultOn: true,",
  "  const devControls = createDevControls([\n    {\n      label: 'Idle Hunt',\n      defaultOn: true,\n      onChange: (on) => { idleHuntEnabled = on; updateHud(); },\n    },\n    {\n      label: 'Night',\n      defaultOn: false,",
  'idle toggle',
);

fs.writeFileSync(mainPath, src);

let html = fs.readFileSync(mapPath, 'utf8');
html = html
  .replace('<title>OTClient Web</title>', '<title>Ascension OT Idle — Alpha 0.2</title>')
  .replace('<h1>OTClient Web</h1>', '<h1>Ascension OT Idle — Alpha 0.2</h1>')
  .replace('Load your Tibia 7.6 client files to view the map', 'OpenTibia browser core · combate · loot · auto-hunt')
  .replace('Tibia.dat, Tibia.spr, items.otb, map.otbm', 'Assets originais do protótipo carregados automaticamente');
fs.writeFileSync(mapPath, html);
fs.writeFileSync(indexPath, html);
console.log('[patch] OpenTibia Web patched for Ascension Alpha 0.2');
