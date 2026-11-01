(() => {
  'use strict';

  const SAVE_KEY = 'starforge-alpha-0.7';
  const OLD_SAVE_KEYS = ['starforge-alpha-0.6', 'starforge-alpha-0.1'];
  const el = id => document.getElementById(id);
  const canvas = el('spaceCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const panelContent = el('panelContent');
  const mineButton = el('mineButton');

  // [nome, valor em Credits, espaço por unidade]
  const RESOURCES = {
    iron: ['Iron Ore', 3, 1],
    nickel: ['Nickel', 7, 2],
    cobalt: ['Cobalt', 13, 3],
    titanium: ['Titanium', 28, 4],
    crystal: ['Crystal', 65, 6],
  };

  const SECTORS = [
    ['sol', 'Sol Belt', 0, 1, 'Órbita segura · minérios básicos'],
    ['red', 'Red Veil', 1400, 1.7, 'Nebulosa hostil · mais Titanium'],
    ['void', 'Void Reach', 5200, 2.8, 'Fronteira profunda · Crystal abundante'],
  ];

  const SPRITES = {
    ship: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 92"><g stroke="#07101a" stroke-width="5" stroke-linejoin="round"><path fill="#273241" d="M50 7 66 35 86 45 73 68 60 61 57 82 43 82 40 61 27 68 14 45 34 35Z"/><path fill="#364455" d="M50 14 59 39 50 55 41 39Z"/><path fill="#5ee9ff" d="M50 21 55 39 50 47 45 39Z"/><path fill="#45ddff" d="M18 45h16v6H18zm48 0h16v6H66z"/></g></svg>`,
    thrust: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#fff"/><stop offset=".3" stop-color="#4de7ff"/><stop offset="1" stop-color="#4de7ff" stop-opacity="0"/></linearGradient></defs><path fill="url(#g)" d="M40 76 50 125 60 76Z"/><g stroke="#07101a" stroke-width="5" stroke-linejoin="round"><path fill="#273241" d="M50 7 66 35 86 45 73 68 60 61 57 82 43 82 40 61 27 68 14 45 34 35Z"/><path fill="#364455" d="M50 14 59 39 50 55 41 39Z"/><path fill="#5ee9ff" d="M50 21 55 39 50 47 45 39Z"/><path fill="#45ddff" d="M18 45h16v6H18zm48 0h16v6H66z"/></g></svg>`,
    rock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112"><path fill="#303846" stroke="#121820" stroke-width="6" d="M21 14 48 5 79 9 105 28 114 56 103 85 78 105 44 107 14 91 5 61 9 35Z"/><path fill="#424b59" d="m21 14 30 9 20-14 22 22-18 20-28-6-18 18-20-28Z"/><g fill="#171d25"><ellipse cx="81" cy="35" rx="12" ry="9"/><ellipse cx="37" cy="74" rx="11" ry="9"/><ellipse cx="84" cy="78" rx="8" ry="6"/></g></svg>`,
    crystal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 104"><path fill="#303946" stroke="#111820" stroke-width="6" d="M18 12 48 5 78 11 103 31 107 61 91 88 61 99 28 92 7 69 6 39Z"/><path fill="#404b59" d="m18 12 30 9 17-10 24 21-14 19-24-2-18 18-24-17 5-19Z"/><path d="M24 75 38 57 51 61 62 43 78 48 93 27" fill="none" stroke="#3ee9ff" stroke-width="5"/><g fill="#4de7ff"><path d="m76 25 10-14 7 18-9 9Z"/><path d="m31 73 8-12 7 14-8 9Z"/><path d="m66 70 9-14 8 18-10 8Z"/></g></svg>`,
    frag: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 46"><path fill="#3a4452" stroke="#141b24" stroke-width="4" d="m7 11 19-7 16 12-4 20-18 6L5 30Z"/><path fill="#505b69" d="m10 13 16-5 7 10-12 10-12-4Z"/></svg>`,
    hit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path fill="#4de7ff" stroke="#dffcff" stroke-width="3" d="m40 5 7 22 20-9-12 19 20 8-22 5 7 21-16-15-12 19 1-23-23 3 19-13-17-15 22 6Z"/><circle cx="40" cy="41" r="8" fill="#fff"/></svg>`,
  };

  let assetsMap = {};
  let activeTab = 'cargo';
  let toastTimer = 0;
  let audioContext = null;
  let lastFrame = performance.now();
  let nextEntityId = 1;

  const defaultState = () => ({
    credits: 260,
    gems: 35,
    inventory: { iron: 0, nickel: 0, cobalt: 0, titanium: 0, crystal: 0 },
    cargo: 0,
    shipLevel: 1,
    laserLevel: 1,
    cargoLevel: 1,
    efficiencyLevel: 1,
    sector: 'sol',
    mining: false,
    shield: 100,
    sound: true,
    lastSeen: Date.now(),
  });

  function loadState() {
    try {
      let raw = localStorage.getItem(SAVE_KEY);
      if (!raw) for (const key of OLD_SAVE_KEYS) { raw = localStorage.getItem(key); if (raw) break; }
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const d = defaultState();
      const merged = { ...d, ...parsed, inventory: { ...d.inventory, ...(parsed.inventory || {}) } };
      merged.cargo = Object.entries(merged.inventory).reduce((sum, [k, n]) => sum + (RESOURCES[k]?.[2] || 1) * Math.max(0, n || 0), 0);
      merged.shield = Number.isFinite(parsed.shield) ? parsed.shield : 100;
      return merged;
    } catch {
      return defaultState();
    }
  }

  let state = loadState();

  const world = {
    w: innerWidth,
    h: innerHeight,
    dpr: 1,
    time: 0,
    shake: 0,
    stars: [],
    particles: [],
    fragments: [],
    asteroids: [],
    target: null,
    dangerText: 'ROTA SEGURA',
    laser: false,
    particleTimer: 0,
    spawnTimer: 0,
    camera: { x: 0, y: 0, vx: 0, vy: 0 },
    ship: {
      x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2,
      avoidX: 0, avoidY: 0, dodgeStrength: 0, dodgeHold: 0,
      threatId: 0, dodgeSide: 0, hitTimer: 0, recoveryTimer: 0,
    },
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const random = (a, b) => a + Math.random() * (b - a);
  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const format = n => Math.floor(n).toLocaleString('pt-BR');
  const cargoCapacity = () => 100 + (state.cargoLevel - 1) * 40;
  const miningRate = () => 1 + (state.laserLevel - 1) * 0.35;
  const efficiency = () => 1 + (state.efficiencyLevel - 1) * 0.05;
  const sector = () => SECTORS.find(s => s[0] === state.sector) || SECTORS[0];
  const targetAsteroidCount = () => Math.round(clamp((world.w * world.h) / 52000, innerWidth < 700 ? 11 : 18, innerWidth < 700 ? 16 : 28) * (0.9 + sector()[3] * 0.08));
  const cameraLeft = () => world.camera.x - world.w / 2;
  const cameraTop = () => world.camera.y - world.h / 2;
  const toScreenX = wx => wx - cameraLeft();
  const toScreenY = wy => wy - cameraTop();
  const onScreen = (o, margin = 80) => {
    const sx = toScreenX(o.x), sy = toScreenY(o.y);
    return sx > -margin - o.r && sx < world.w + margin + o.r && sy > -margin - o.r && sy < world.h + margin + o.r;
  };

  function upgradeCost(type) {
    const level = type === 'laser' ? state.laserLevel : type === 'cargo' ? state.cargoLevel : state.efficiencyLevel;
    const base = type === 'laser' ? 150 : type === 'cargo' ? 200 : 300;
    return Math.round(base * 1.62 ** (level - 1));
  }

  function saveState() {
    state.lastSeen = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function weightedResource() {
    const id = sector()[0];
    const weights = id === 'red'
      ? { iron: 43, nickel: 25, cobalt: 15, titanium: 14, crystal: 3 }
      : id === 'void'
        ? { iron: 24, nickel: 22, cobalt: 20, titanium: 24, crystal: 10 }
        : { iron: 62, nickel: 23, cobalt: 10, titanium: 4, crystal: 1 };
    const roll = Math.random() * 100;
    let sum = 0;
    for (const key in weights) { sum += weights[key]; if (roll <= sum) return key; }
    return 'iron';
  }

  function addLootBundle(bundle, announce = true) {
    let added = 0;
    let rejected = 0;
    const gained = {};
    for (const [key, qty] of Object.entries(bundle)) {
      const size = RESOURCES[key][2];
      let take = 0;
      for (let i = 0; i < qty; i++) {
        if (state.cargo + size > cargoCapacity()) { rejected += qty - i; break; }
        state.inventory[key] += 1;
        state.cargo += size;
        take++;
        added++;
      }
      if (take) gained[key] = take;
    }
    if (announce && added) {
      const text = Object.entries(gained).map(([k, n]) => `${n} ${RESOURCES[k][0]}`).join(' · ');
      toast(`Asteroide coletado: ${text}${rejected ? ' · carga sem espaço para o resto' : ''}`);
    } else if (announce && rejected) toast('Asteroide quebrado, mas o cargueiro está sem espaço.');
    if (state.cargo >= cargoCapacity()) state.mining = false;
    return added;
  }

  function generateAsteroidLoot(r, crystal = false) {
    const units = Math.max(2, Math.round((r * r) / 620 * random(0.7, 1.25)));
    const bundle = { iron: 0, nickel: 0, cobalt: 0, titanium: 0, crystal: 0 };
    for (let i = 0; i < units; i++) {
      let key = weightedResource();
      if (crystal && Math.random() < 0.38) key = 'crystal';
      bundle[key]++;
    }
    return bundle;
  }

  function applyOfflineProgress() {
    const elapsed = Math.max(0, Date.now() - (state.lastSeen || Date.now())) / 1000;
    if (!state.mining || elapsed < 20) return;
    const completed = Math.min(24, Math.floor(elapsed / Math.max(22, 42 / (miningRate() * Math.sqrt(sector()[3])))));
    if (!completed) return;
    let collected = 0;
    for (let i = 0; i < completed; i++) {
      const r = random(24, 46);
      collected += addLootBundle(generateAsteroidLoot(r, Math.random() < 0.08 * sector()[3]), false);
      if (state.cargo >= cargoCapacity()) break;
    }
    if (collected) setTimeout(() => toast(`Expedição offline: ${completed} asteroides processados · +${collected} itens`), 450);
  }

  function loadAssets() {
    return Promise.all(Object.entries(SPRITES).map(([key, svg]) => new Promise(resolve => {
      const img = new Image();
      img.onload = () => { assetsMap[key] = img; resolve(); };
      img.onerror = resolve;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    })));
  }

  function resize() {
    world.dpr = Math.min(2, devicePixelRatio || 1);
    world.w = Math.max(320, innerWidth);
    world.h = Math.max(320, innerHeight);
    canvas.width = world.w * world.dpr;
    canvas.height = world.h * world.dpr;
    canvas.style.width = world.w + 'px';
    canvas.style.height = world.h + 'px';
    ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);

    if (!world.ship.x && !world.ship.y) {
      world.ship.x = 0; world.ship.y = 0;
      world.camera.x = 0; world.camera.y = 0;
    }
    if (!world.stars.length) {
      world.stars = Array.from({ length: Math.round(clamp(world.w * world.h / 7000, 70, 180)) }, () => ({
        x: Math.random() * world.w,
        y: Math.random() * world.h,
        z: random(0.15, 1),
        phase: random(0, 7),
      }));
    }
    while (world.asteroids.length < targetAsteroidCount()) spawnAsteroid(world.asteroids.length < 3);
  }

  function spawnAsteroid(initial = false) {
    const r = Math.random() < 0.18 ? random(48, 76) : Math.random() < 0.5 ? random(28, 47) : random(14, 27);
    const density = random(0.75, 1.4);
    const mass = Math.max(8, r * r * density);
    const margin = Math.max(world.w, world.h) * random(0.62, 1.15) + r + 100;
    const a = random(0, Math.PI * 2);
    const px = world.camera.x + Math.cos(a) * margin;
    const py = world.camera.y + Math.sin(a) * margin;
    const driftAngle = a + Math.PI + random(-1.15, 1.15);
    const speed = random(8, 34) * (0.92 + sector()[3] * 0.1);
    const crystalChance = sector()[0] === 'void' ? 0.28 : sector()[0] === 'red' ? 0.14 : 0.055;
    const crystal = Math.random() < crystalChance;
    const asteroid = {
      id: nextEntityId++, x: px, y: py,
      vx: Math.cos(driftAngle) * speed,
      vy: Math.sin(driftAngle) * speed,
      r, mass, density,
      rot: random(0, Math.PI * 2), spin: random(-0.42, 0.42),
      hp: Math.round(55 + r * 1.75), maxHp: 0,
      crystal, loot: null, born: world.time,
    };
    asteroid.maxHp = asteroid.hp;
    asteroid.loot = generateAsteroidLoot(r, crystal);
    world.asteroids.push(asteroid);
    return asteroid;
  }

  function chooseTarget() {
    if (!state.mining || state.cargo >= cargoCapacity()) { world.target = null; return; }
    const sh = world.ship;
    let best = null, score = Infinity;
    for (const a of world.asteroids) {
      const d = distance(sh.x, sh.y, a.x, a.y);
      if (d < 90) continue;
      const relative = Math.hypot(a.vx - sh.vx, a.vy - sh.vy);
      const value = Object.entries(a.loot).reduce((s, [k, n]) => s + RESOURCES[k][1] * n, 0);
      const candidate = d + relative * 5 - Math.min(700, value * 0.35) - a.r * 3;
      if (candidate < score) { score = candidate; best = a; }
    }
    world.target = best;
  }

  function burst(wx, wy, count, color) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = random(30, 180);
      world.particles.push({ x: wx, y: wy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: random(0.25, 0.85), size: random(1, 4), color });
    }
  }

  function destroyAsteroid(a) {
    const idx = world.asteroids.indexOf(a);
    if (idx >= 0) world.asteroids.splice(idx, 1);
    const count = Math.floor(random(4, 8));
    for (let i = 0; i < count; i++) {
      const ang = random(0, Math.PI * 2);
      const speed = random(42, 128);
      const r = random(6, Math.min(16, a.r * 0.32));
      world.fragments.push({
        id: nextEntityId++, x: a.x, y: a.y,
        vx: a.vx + Math.cos(ang) * speed, vy: a.vy + Math.sin(ang) * speed,
        r, mass: Math.max(1, r * r * 0.55), rot: random(0, Math.PI * 2), spin: random(-2.5, 2.5), life: random(7, 12), dangerous: true,
      });
    }
    burst(a.x, a.y, 32, a.crystal ? '#4de7ff' : '#c8d0dd');
    world.shake = 7;
    sound('break');
    addLootBundle(a.loot, true);
    if (world.target === a) world.target = null;
    if (state.mining && state.cargo < cargoCapacity()) chooseTarget();
  }

  function resolveBodyCollision(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    let d = Math.hypot(dx, dy);
    const minD = a.r + b.r;
    if (d <= 0 || d >= minD) return;
    const nx = dx / d, ny = dy / d;
    const overlap = minD - d;
    const invA = 1 / Math.max(1, a.mass), invB = 1 / Math.max(1, b.mass);
    const invSum = invA + invB;
    a.x -= nx * overlap * (invA / invSum);
    a.y -= ny * overlap * (invA / invSum);
    b.x += nx * overlap * (invB / invSum);
    b.y += ny * overlap * (invB / invSum);

    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    const velAlongNormal = rvx * nx + rvy * ny;
    if (velAlongNormal > 0) return;
    const restitution = 0.82;
    const j = -(1 + restitution) * velAlongNormal / invSum;
    const ix = j * nx, iy = j * ny;
    a.vx -= ix * invA; a.vy -= iy * invA;
    b.vx += ix * invB; b.vy += iy * invB;
    const tangentImpact = rvx * -ny + rvy * nx;
    a.spin -= tangentImpact * invA * 0.018;
    b.spin += tangentImpact * invB * 0.018;
    if (Math.abs(velAlongNormal) > 24) burst((a.x + b.x) / 2, (a.y + b.y) / 2, 4, '#aeb8c8');
  }

  function solveAsteroidPhysics() {
    const list = world.asteroids;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) resolveBodyCollision(list[i], list[j]);
    }
  }

  function predictThreat(h) {
    const sh = world.ship;
    const dx = h.x - sh.x, dy = h.y - sh.y;
    const rvx = h.vx - sh.vx, rvy = h.vy - sh.vy;
    const speedSq = rvx * rvx + rvy * rvy;
    if (speedSq < 9) return null;
    const t = -(dx * rvx + dy * rvy) / speedSq;
    if (t <= 0.02 || t > 2.2) return null;
    const cx = dx + rvx * t, cy = dy + rvy * t;
    const miss = Math.hypot(cx, cy);
    const massFactor = clamp(Math.log10(Math.max(10, h.mass || h.r * h.r)) / 4, 0.65, 1.35);
    const safeRadius = (38 + h.r * 1.12) * massFactor;
    if (miss >= safeRadius || Math.hypot(dx, dy) > 430 + h.r) return null;
    return { hazard: h, rvx, rvy, cx, cy, miss, urgency: (1 - t / 2.2) * (0.35 + 0.65 * (1 - miss / safeRadius)) * massFactor };
  }

  function updateAvoidance(dt) {
    const sh = world.ship;
    const hazards = [...world.fragments.filter(f => f.dangerous), ...world.asteroids.filter(a => a !== world.target || distance(a.x, a.y, sh.x, sh.y) > a.r + 70)];
    let best = null;
    for (const h of hazards) { const t = predictThreat(h); if (t && (!best || t.urgency > best.urgency)) best = t; }
    let targetX = 0, targetY = 0;
    if (best) {
      const h = best.hazard;
      const relSpeed = Math.max(1, Math.hypot(best.rvx, best.rvy));
      const px = -best.rvy / relSpeed, py = best.rvx / relSpeed;
      if (sh.threatId !== h.id || !sh.dodgeSide) {
        const sideDot = px * best.cx + py * best.cy;
        sh.dodgeSide = sideDot > 0 ? -1 : 1;
        sh.threatId = h.id;
      }
      const miss = Math.max(1, best.miss);
      const ax = -best.cx / miss, ay = -best.cy / miss;
      const lateral = 115 + best.urgency * 115;
      const away = 24 + best.urgency * 65;
      targetX = px * sh.dodgeSide * lateral + ax * away;
      targetY = py * sh.dodgeSide * lateral + ay * away;
      const mag = Math.hypot(targetX, targetY);
      if (mag > 220) { targetX = targetX / mag * 220; targetY = targetY / mag * 220; }
      sh.dodgeHold = 0.3; sh.dodgeStrength = best.urgency; world.dangerText = 'DESVIO PREDITIVO';
    } else {
      sh.dodgeHold = Math.max(0, sh.dodgeHold - dt);
      if (sh.dodgeHold <= 0) { sh.threatId = 0; sh.dodgeSide = 0; sh.dodgeStrength = Math.max(0, sh.dodgeStrength - dt * 4); world.dangerText = 'ROTA SEGURA'; }
      else { targetX = sh.avoidX * 0.76; targetY = sh.avoidY * 0.76; world.dangerText = 'DESVIO PREDITIVO'; }
    }
    const response = 1 - Math.exp(-dt * (best ? 8.5 : 4));
    sh.avoidX += (targetX - sh.avoidX) * response;
    sh.avoidY += (targetY - sh.avoidY) * response;
  }

  function handleShipCollisions() {
    const sh = world.ship;
    if (sh.hitTimer > 0) return;
    const hazards = [...world.fragments, ...world.asteroids];
    for (const h of hazards) {
      const minD = 22 + h.r * 0.82;
      if (distance(sh.x, sh.y, h.x, h.y) >= minD) continue;
      const rel = Math.hypot(h.vx - sh.vx, h.vy - sh.vy);
      state.shield = clamp(state.shield - clamp(5 + rel * 0.19 + h.r * 0.12, 7, 31), 0, 100);
      sh.hitTimer = 0.65;
      const dx = sh.x - h.x, dy = sh.y - h.y, d = Math.max(1, Math.hypot(dx, dy));
      sh.vx += dx / d * 95; sh.vy += dy / d * 95;
      h.vx -= dx / d * 18; h.vy -= dy / d * 18;
      burst(sh.x, sh.y, 15, '#ff89a2'); world.shake = 10; world.dangerText = 'IMPACTO NO ESCUDO'; sound('hit');
      if (state.shield <= 0) { state.mining = false; world.laser = false; sh.recoveryTimer = 3.2; world.target = null; toast('Escudo colapsou. Recuo automático.'); }
      break;
    }
  }

  function updateShip(dt) {
    const sh = world.ship;
    sh.hitTimer = Math.max(0, sh.hitTimer - dt);
    if (sh.recoveryTimer > 0) {
      sh.recoveryTimer -= dt;
      if (sh.recoveryTimer <= 0) { state.shield = 38; toast('Escudo reiniciado em 38%.'); }
    } else if (state.shield < 100 && sh.hitTimer <= 0) state.shield = clamp(state.shield + dt * 4.2, 0, 100);

    if (state.mining && (!world.target || !world.asteroids.includes(world.target))) chooseTarget();
    updateAvoidance(dt);

    let tx = sh.x, ty = sh.y;
    if (sh.recoveryTimer > 0) {
      tx = sh.x - Math.cos(sh.angle - Math.PI / 2) * 220;
      ty = sh.y - Math.sin(sh.angle - Math.PI / 2) * 220;
    } else if (state.mining && world.target) {
      const t = world.target;
      const dx = sh.x - t.x, dy = sh.y - t.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / d, uy = dy / d;
      const standOff = t.r + clamp(world.w * 0.09, 95, 150);
      tx = t.x + ux * standOff;
      ty = t.y + uy * standOff;
    }
    tx += sh.avoidX; ty += sh.avoidY;

    const dx = tx - sh.x, dy = ty - sh.y, d = Math.hypot(dx, dy);
    const dodging = Math.hypot(sh.avoidX, sh.avoidY) > 12;
    const travel = state.mining && world.target && d > 85;
    const maxSpeed = dodging ? 260 : travel ? 195 : 135;
    const speed = Math.min(maxSpeed, d * (travel ? 1.8 : 2.5));
    const dvx = d > 1 ? dx / d * speed : 0, dvy = d > 1 ? dy / d * speed : 0;
    const response = 1 - Math.exp(-dt * (dodging ? 6.3 : 4.4));
    sh.vx += (dvx - sh.vx) * response; sh.vy += (dvy - sh.vy) * response;
    sh.x += sh.vx * dt; sh.y += sh.vy * dt;

    const faceX = world.target ? world.target.x : sh.x + (Math.abs(sh.vx) > 2 ? sh.vx : 1);
    const faceY = world.target ? world.target.y : sh.y + sh.vy;
    const desired = Math.atan2(faceY - sh.y, faceX - sh.x) + Math.PI / 2;
    const diff = ((desired - sh.angle + Math.PI) % (Math.PI * 2)) - Math.PI;
    sh.angle += diff * Math.min(1, dt * 7.2);

    const targetDistance = world.target ? distance(sh.x, sh.y, world.target.x, world.target.y) : Infinity;
    const laserRange = clamp(world.w * 0.31, 250, 510);
    world.laser = !!(state.mining && world.target && sh.recoveryTimer <= 0 && state.cargo < cargoCapacity() && targetDistance <= laserRange && Math.abs(diff) < 0.7);
  }

  function updateCamera(dt) {
    const sh = world.ship, c = world.camera;
    const look = 0.55;
    const targetX = sh.x + sh.vx * look;
    const targetY = sh.y + sh.vy * look;
    const stiffness = 2.15;
    const damping = 4.2;
    c.vx += (targetX - c.x) * stiffness * dt;
    c.vy += (targetY - c.y) * stiffness * dt;
    c.vx *= Math.exp(-damping * dt);
    c.vy *= Math.exp(-damping * dt);
    c.x += c.vx * dt * 7.5;
    c.y += c.vy * dt * 7.5;
  }

  function updateWorld(dt) {
    world.time += dt;
    world.shake = Math.max(0, world.shake - dt * 22);

    for (const a of world.asteroids) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.spin * dt;
      a.vx *= Math.pow(0.9996, dt * 60); a.vy *= Math.pow(0.9996, dt * 60);
    }
    solveAsteroidPhysics();

    if (world.laser && world.target) {
      const t = world.target;
      t.hp -= (9 + miningRate() * 8) * sector()[3] * dt;
      world.particleTimer -= dt;
      if (world.particleTimer <= 0) { world.particleTimer = 0.035; burst(t.x, t.y, 2, Math.random() > 0.5 ? '#4de7ff' : '#ffd36f'); }
      if (t.hp <= 0) destroyAsteroid(t);
    }

    for (const f of world.fragments) { f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.spin * dt; f.life -= dt; }
    world.fragments = world.fragments.filter(f => f.life > 0 && distance(f.x, f.y, world.camera.x, world.camera.y) < Math.max(world.w, world.h) * 2.2);

    for (const p of world.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; p.life -= dt; }
    world.particles = world.particles.filter(p => p.life > 0);

    updateShip(dt);
    handleShipCollisions();
    updateCamera(dt);

    const maxDist = Math.max(world.w, world.h) * 2.7;
    world.asteroids = world.asteroids.filter(a => a === world.target || distance(a.x, a.y, world.camera.x, world.camera.y) < maxDist);
    if (world.target && !world.asteroids.includes(world.target)) world.target = null;
    world.spawnTimer -= dt;
    if (world.spawnTimer <= 0) {
      world.spawnTimer = random(0.22, 0.7);
      while (world.asteroids.length < targetAsteroidCount()) spawnAsteroid(false);
    }
  }

  function drawImageRotated(img, sx, sy, w, h, angle, alpha = 1) {
    if (!img) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(sx, sy); ctx.rotate(angle); ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore();
  }

  function drawBackground() {
    const tint = sector()[0] === 'red' ? 'rgba(120,30,70,.18)' : sector()[0] === 'void' ? 'rgba(63,40,140,.22)' : 'rgba(18,74,120,.20)';
    const g = ctx.createRadialGradient(world.w * 0.27, world.h * 0.34, 0, world.w * 0.27, world.h * 0.34, world.w * 0.76);
    g.addColorStop(0, tint); g.addColorStop(0.5, '#050b16'); g.addColorStop(1, '#02040a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, world.w, world.h);

    for (const s of world.stars) {
      const px = ((s.x - world.camera.x * s.z * 0.018) % world.w + world.w) % world.w;
      const py = ((s.y - world.camera.y * s.z * 0.018) % world.h + world.h) % world.h;
      s.phase += 0.01 * (1 + s.z);
      ctx.globalAlpha = clamp(0.18 + s.z * 0.72 + Math.sin(s.phase) * 0.08, 0.1, 0.95);
      ctx.fillStyle = s.z > 0.72 ? '#bdeeff' : '#fff';
      const sz = 0.55 + s.z * 1.25;
      ctx.fillRect(px, py, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  function drawAsteroid(a) {
    const sx = toScreenX(a.x), sy = toScreenY(a.y);
    if (!onScreen(a, 140)) return;
    const target = a === world.target;
    drawImageRotated(a.crystal ? assetsMap.crystal : assetsMap.rock, sx, sy, a.r * 2.15, a.r * 2.15, a.rot, target ? 1 : 0.83);
    if (target) {
      const hp = clamp(a.hp / a.maxHp, 0, 1);
      ctx.save(); ctx.strokeStyle = 'rgba(77,231,255,.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, a.r * 0.96, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = a.crystal ? '#4de7ff' : '#90a8c7'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, a.r * 0.96, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hp); ctx.stroke(); ctx.restore();
    }
  }

  function drawLaser() {
    if (!world.laser || !world.target) return;
    const sh = world.ship, t = world.target;
    const sx0 = toScreenX(sh.x), sy0 = toScreenY(sh.y), tx = toScreenX(t.x), ty = toScreenY(t.y);
    const dx = tx - sx0, dy = ty - sy0, d = Math.max(1, Math.hypot(dx, dy)), ux = dx / d, uy = dy / d;
    const startX = sx0 + ux * 28, startY = sy0 + uy * 28, endX = tx - ux * t.r * 0.68, endY = ty - uy * t.r * 0.68;
    const pulse = 0.55 + Math.sin(world.time * 28) * 0.3;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(77,231,255,${0.22 + pulse * 0.2})`; ctx.lineWidth = 9; ctx.shadowBlur = 18; ctx.shadowColor = '#4de7ff';
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke(); ctx.strokeStyle = '#dfffff'; ctx.lineWidth = 2.1 + pulse * 1.2; ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke(); ctx.restore();
    drawImageRotated(assetsMap.hit, endX, endY, 34 + pulse * 5, 34 + pulse * 5, world.time * 2.4, 0.82);
  }

  function draw() {
    ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);
    drawBackground();
    ctx.save();
    if (world.shake) ctx.translate(random(-world.shake, world.shake), random(-world.shake, world.shake));
    for (const a of world.asteroids) drawAsteroid(a);
    for (const f of world.fragments) {
      const sx = toScreenX(f.x), sy = toScreenY(f.y);
      if (sx < -60 || sx > world.w + 60 || sy < -60 || sy > world.h + 60) continue;
      drawImageRotated(assetsMap.frag, sx, sy, f.r * 2.3, f.r * 2.3, f.rot, 0.95);
    }
    drawLaser();
    for (const p of world.particles) {
      const sx = toScreenX(p.x), sy = toScreenY(p.y);
      if (sx < -20 || sx > world.w + 20 || sy < -20 || sy > world.h + 20) continue;
      ctx.save(); ctx.globalAlpha = clamp(p.life / 0.55, 0, 1); ctx.fillStyle = p.color; ctx.shadowBlur = 10; ctx.shadowColor = p.color; ctx.beginPath(); ctx.arc(sx, sy, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    const sh = world.ship, sx = toScreenX(sh.x), sy = toScreenY(sh.y), moving = Math.hypot(sh.vx, sh.vy) > 28;
    const img = moving ? assetsMap.thrust : assetsMap.ship;
    const base = clamp(world.w * 0.055, 54, 76), ratio = img ? img.height / img.width : 1;
    if (state.shield < 100) { ctx.save(); ctx.strokeStyle = 'rgba(77,231,255,.2)'; ctx.shadowBlur = 16; ctx.shadowColor = '#4de7ff'; ctx.beginPath(); ctx.arc(sx, sy, 34, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    drawImageRotated(img, sx, sy, base, base * ratio, sh.angle);
    ctx.restore();
  }

  function hud() {
    const cap = cargoCapacity(), pct = clamp(state.cargo / cap * 100, 0, 100);
    el('credits').textContent = format(state.credits); el('gems').textContent = format(state.gems); el('sectorName').textContent = sector()[1];
    el('rateValue').textContent = miningRate().toFixed(2);
    el('operationText').textContent = world.laser ? (Math.hypot(world.ship.avoidX, world.ship.avoidY) > 12 ? 'MINERANDO · DESVIO' : 'LASER EM OPERAÇÃO') : state.mining ? (world.target ? 'CAÇANDO ASTEROIDE' : 'PROCURANDO ALVO') : 'AGUARDANDO ORDEM';
    el('shieldBar').style.width = clamp(state.shield, 0, 100) + '%'; el('shieldText').textContent = Math.round(state.shield) + '%';
    el('cargoBar').style.width = pct + '%'; el('cargoText').textContent = `${Math.floor(state.cargo)} / ${cap}`;
    const d = el('dangerText'); d.textContent = world.dangerText; d.className = 'danger-text' + (world.dangerText.includes('IMPACTO') ? ' hit' : world.dangerText.includes('DESVIO') ? ' warn' : '');
    mineButton.textContent = state.mining ? 'PAUSAR MINERAÇÃO' : 'INICIAR MINERAÇÃO'; mineButton.classList.toggle('active', state.mining); el('soundButton').textContent = state.sound ? '🔊' : '🔇';
  }

  function panel() {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
    if (activeTab === 'cargo') {
      panelContent.innerHTML = `<div class="panel-title"><h2>Carga</h2><span>${Math.floor(state.cargo)} / ${cargoCapacity()} espaço</span></div><div class="resource-list">${Object.entries(RESOURCES).map(([k, r]) => `<div class="resource-row"><span>${r[0]}</span><strong>${Math.floor(state.inventory[k] || 0)}</strong><em>${r[2]} espaço · ${r[1]} C</em></div>`).join('')}</div><button class="panel-action" data-action="sell">Vender carga por Credits</button>`;
    } else if (activeTab === 'ship') {
      panelContent.innerHTML = `<div class="panel-title"><h2>Rusty Miner I</h2><span>Nível ${state.shipLevel}</span></div><div class="stats-grid"><div class="stat-card"><span>LASER</span><b>${miningRate().toFixed(2)}x</b></div><div class="stat-card"><span>CARGO</span><b>${cargoCapacity()}</b></div><div class="stat-card"><span>REFINO</span><b>${Math.round(efficiency() * 100)}%</b></div></div><div class="upgrade-list">${[['laser','Laser','quebra mais rápido'],['cargo','Cargueiro','+40 espaço'],['efficiency','Refino','+5% valor']].map(a => `<button class="upgrade" data-upgrade="${a[0]}"><span>${a[1]}</span><small>${a[2]}</small><b>${format(upgradeCost(a[0]))} C</b></button>`).join('')}</div>`;
    } else {
      panelContent.innerHTML = `<div class="panel-title"><h2>Market P2P</h2><span>SIMULADO</span></div><p class="market-note">Nenhum depósito ou saque real está ativo nesta Alpha.</p><div class="market-card"><div><strong>20 Titanium</strong><span>Ordem de compra</span></div><b>120 Gems</b><button data-action="ms">Vender</button></div><div class="market-card"><div><strong>Mining Core Mk-I</strong><span>Ordem de venda</span></div><b>85 Gems</b><button data-action="mb">Comprar</button></div><div class="fee-note">Taxa simulada do Market: <b>10%</b>.</div>`;
    }
  }

  function sectors() {
    el('sectorList').innerHTML = SECTORS.map(v => {
      const unlocked = state.credits >= v[2] || v[0] === 'sol' || state.sector === v[0];
      return `<button class="sector-option" data-sector="${v[0]}" ${unlocked ? '' : 'disabled'}><span><strong>${v[1]}</strong><small>${v[4]}</small></span><b>${unlocked ? 'x' + v[3].toFixed(1) : format(v[2]) + ' C'}</b></button>`;
    }).join('');
  }

  function sellCargo() {
    if (state.cargo <= 0) return toast('Sua carga está vazia.');
    let total = 0;
    for (const k in state.inventory) total += RESOURCES[k][1] * state.inventory[k];
    total = Math.round(total * efficiency() * sector()[3]);
    state.credits += total;
    for (const k in state.inventory) state.inventory[k] = 0;
    state.cargo = 0; sound('cash'); toast(`Carga vendida por ${format(total)} Credits.`); saveState(); panel();
  }

  function upgrade(type) {
    const c = upgradeCost(type); if (state.credits < c) return toast('Credits insuficientes.');
    state.credits -= c; if (type === 'laser') state.laserLevel++; if (type === 'cargo') state.cargoLevel++; if (type === 'efficiency') state.efficiencyLevel++;
    state.shipLevel = Math.max(1, Math.floor((state.laserLevel + state.cargoLevel + state.efficiencyLevel) / 3)); sound('up'); toast('Upgrade instalado.'); saveState(); panel();
  }

  function marketSell() {
    if (state.inventory.titanium < 20) return toast('Você precisa de 20 Titanium.');
    state.inventory.titanium -= 20; state.cargo = Math.max(0, state.cargo - 20 * RESOURCES.titanium[2]); state.gems += 108; sound('cash'); toast('Ordem concluída: +108 Gems após 10% de taxa.'); saveState(); panel();
  }
  function marketBuy() {
    if (state.gems < 85) return toast('Gems insuficientes. Este saldo é simulado.');
    state.gems -= 85; state.laserLevel += 2; sound('up'); toast('Mining Core Mk-I instalado: Laser +2 níveis.'); saveState(); panel();
  }

  function toast(message) {
    const q = el('toast'); q.textContent = message; q.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => q.classList.remove('show'), 2600);
  }

  function getAudio() {
    if (!state.sound) return null;
    if (!audioContext) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; audioContext = new C(); }
    if (audioContext.state === 'suspended') audioContext.resume(); return audioContext;
  }
  function tone(f, d, g = 0.03, type = 'sine', slide = 0) {
    const ac = getAudio(); if (!ac) return; const o = ac.createOscillator(), n = ac.createGain(), z = ac.currentTime; o.type = type; o.frequency.setValueAtTime(f, z); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), z + d); n.gain.setValueAtTime(g, z); n.gain.exponentialRampToValueAtTime(0.0001, z + d); o.connect(n); n.connect(ac.destination); o.start(z); o.stop(z + d);
  }
  function sound(k) {
    if (!state.sound) return;
    if (k === 'start') { tone(180, 0.08, 0.03, 'sawtooth', 120); setTimeout(() => tone(330, 0.09, 0.02, 'sine', 90), 55); }
    if (k === 'break') { tone(90, 0.18, 0.05, 'sawtooth', -35); tone(460, 0.12, 0.02, 'triangle', -180); }
    if (k === 'hit') tone(72, 0.16, 0.05, 'square', -25);
    if (k === 'cash') tone(520, 0.08, 0.02, 'sine', 140);
    if (k === 'up') tone(260, 0.1, 0.025, 'triangle', 180);
  }

  function loop(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000)); lastFrame = now;
    updateWorld(dt); draw(); hud(); requestAnimationFrame(loop);
  }

  mineButton.onclick = () => {
    getAudio();
    if (!state.mining && state.cargo >= cargoCapacity()) return toast('Carga cheia. Venda ou aumente a capacidade.');
    if (!state.mining && world.ship.recoveryTimer > 0) return toast('A nave ainda está recuperando o escudo.');
    state.mining = !state.mining;
    if (state.mining) chooseTarget(); else { world.target = null; world.laser = false; }
    sound('start'); saveState();
  };
  el('soundButton').onclick = () => { state.sound = !state.sound; if (state.sound) { getAudio(); tone(420, 0.06, 0.02, 'sine', 80); } saveState(); hud(); };
  document.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { activeTab = b.dataset.tab; panel(); } };
  panelContent.onclick = e => {
    const u = e.target.closest('[data-upgrade]'); if (u) return upgrade(u.dataset.upgrade);
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'sell') sellCargo(); if (action === 'ms') marketSell(); if (action === 'mb') marketBuy();
  };
  el('sectorButton').onclick = () => { sectors(); el('sectorModal').hidden = false; };
  el('closeSector').onclick = () => el('sectorModal').hidden = true;
  el('sectorModal').onclick = e => {
    const b = e.target.closest('[data-sector]');
    if (b && !b.disabled) {
      state.sector = b.dataset.sector; el('sectorModal').hidden = true;
      world.asteroids = []; world.fragments = []; world.target = null; while (world.asteroids.length < targetAsteroidCount()) spawnAsteroid(false);
      if (state.mining) chooseTarget(); saveState(); toast('Rota definida: ' + sector()[1]); panel();
    } else if (e.target === el('sectorModal')) el('sectorModal').hidden = true;
  };

  addEventListener('resize', resize, { passive: true });
  addEventListener('beforeunload', saveState);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(); });

  applyOfflineProgress(); resize(); panel(); sectors(); hud(); loadAssets().then(() => requestAnimationFrame(loop));
})();
