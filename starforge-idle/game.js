(() => {
  'use strict';

  const SAVE_KEY = 'starforge-alpha-0.6';
  const OLD_SAVE_KEY = 'starforge-alpha-0.1';
  const el = id => document.getElementById(id);
  const canvas = el('spaceCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const panelContent = el('panelContent');
  const mineButton = el('mineButton');

  const RESOURCES = {
    iron: ['Iron Ore', 3],
    nickel: ['Nickel', 7],
    cobalt: ['Cobalt', 13],
    titanium: ['Titanium', 28],
    crystal: ['Crystal', 65],
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

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const random = (a, b) => a + Math.random() * (b - a);
  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const format = n => Math.floor(n).toLocaleString('pt-BR');
  const TAU = Math.PI * 2;

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
    cycleProgress: 0,
    shield: 100,
    sound: true,
    lastSeen: Date.now(),
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem(OLD_SAVE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const d = defaultState();
      return {
        ...d,
        ...parsed,
        inventory: { ...d.inventory, ...(parsed.inventory || {}) },
        shield: Number.isFinite(parsed.shield) ? parsed.shield : 100,
      };
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
    asteroids: [],
    fragments: [],
    targetId: 0,
    dangerText: 'ROTA SEGURA',
    laser: false,
    particleTimer: 0,
    spawnTimer: 0,
    ship: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      avoidX: 0,
      avoidY: 0,
      dodgeStrength: 0,
      dodgeHold: 0,
      threatId: 0,
      dodgeSide: 0,
      hitTimer: 0,
      recoveryTimer: 0,
    },
  };

  const cargoCapacity = () => 100 + (state.cargoLevel - 1) * 40;
  const miningRate = () => 1 + (state.laserLevel - 1) * 0.35;
  const efficiency = () => 1 + (state.efficiencyLevel - 1) * 0.05;
  const sector = () => SECTORS.find(s => s[0] === state.sector) || SECTORS[0];
  const target = () => world.asteroids.find(a => a.id === world.targetId) || null;

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
    for (const key in weights) {
      sum += weights[key];
      if (roll <= sum) return key;
    }
    return 'iron';
  }

  function addOre(amount) {
    const room = cargoCapacity() - state.cargo;
    if (room <= 0) return;
    state.cycleProgress += Math.min(room, Math.max(0, amount));
    while (state.cycleProgress >= 1 && state.cargo < cargoCapacity()) {
      const key = weightedResource();
      state.inventory[key] += 1;
      state.cargo += 1;
      state.cycleProgress -= 1;
    }
    if (state.cargo >= cargoCapacity()) {
      state.mining = false;
      world.laser = false;
      toast('Carga cheia. Venda ou aumente a capacidade.');
    }
  }

  function applyOfflineProgress() {
    const elapsed = Math.max(0, Date.now() - (state.lastSeen || Date.now())) / 1000;
    if (!state.mining || elapsed < 5) return;
    const before = state.cargo;
    addOre(Math.min(elapsed, 14400) * miningRate() * sector()[3] * 0.28);
    const gained = Math.max(0, Math.floor(state.cargo - before));
    if (gained) setTimeout(() => toast(`Mineração offline: +${gained} unidades`), 400);
  }

  function loadAssets() {
    return Promise.all(Object.entries(SPRITES).map(([key, svg]) => new Promise(resolve => {
      const img = new Image();
      img.onload = () => { assetsMap[key] = img; resolve(); };
      img.onerror = resolve;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    })));
  }

  function asteroidMass(r, density = 1) {
    return Math.max(18, density * r * r * 0.055);
  }

  function asteroidCount() {
    const base = world.w < 700 ? 8 : world.w < 1100 ? 11 : 14;
    return base + (sector()[0] === 'void' ? 3 : sector()[0] === 'red' ? 1 : 0);
  }

  function spawnPoint(initial = false) {
    if (initial) {
      return {
        x: random(35, world.w - 35),
        y: random(78, world.h - 45),
        angle: random(0, TAU),
      };
    }

    const edge = Math.floor(Math.random() * 4);
    const pad = 60;
    let x, y, inward;
    if (edge === 0) { x = random(0, world.w); y = -pad; inward = Math.PI / 2; }
    else if (edge === 1) { x = world.w + pad; y = random(65, world.h); inward = Math.PI; }
    else if (edge === 2) { x = random(0, world.w); y = world.h + pad; inward = -Math.PI / 2; }
    else { x = -pad; y = random(65, world.h); inward = 0; }

    return { x, y, angle: inward + random(-0.72, 0.72) };
  }

  function makeAsteroid(initial = false, preferredLarge = false) {
    const p = spawnPoint(initial);
    const largeRoll = preferredLarge || Math.random() > 0.72;
    const r = largeRoll ? random(34, 66) : random(14, 34);
    const speed = random(16, 56) * (1 + (sector()[3] - 1) * 0.12);
    const density = random(0.78, 1.38);
    const crystalChance = sector()[0] === 'void' ? 0.24 : sector()[0] === 'red' ? 0.12 : 0.05;
    return {
      id: nextEntityId++,
      x: p.x,
      y: p.y,
      vx: Math.cos(p.angle) * speed,
      vy: Math.sin(p.angle) * speed,
      r,
      mass: asteroidMass(r, density),
      density,
      rot: random(0, TAU),
      spin: random(-0.45, 0.45),
      hp: 100,
      crystal: Math.random() < crystalChance,
      collisionCooldown: 0,
      age: 0,
    };
  }

  function chooseTarget(force = false) {
    const current = target();
    if (!force && current && current.hp > 0) return current;
    if (!world.asteroids.length) return null;

    const candidates = [...world.asteroids]
      .filter(a => a.r >= 24 && a.x > 50 && a.x < world.w - 50 && a.y > 80 && a.y < world.h - 50)
      .sort((a, b) => {
        const da = distance(a.x, a.y, world.ship.x, world.ship.y);
        const db = distance(b.x, b.y, world.ship.x, world.ship.y);
        const sizeBiasA = a.r * 1.8;
        const sizeBiasB = b.r * 1.8;
        return (da - sizeBiasA) - (db - sizeBiasB);
      });

    const selected = candidates[0] || world.asteroids[0];
    world.targetId = selected?.id || 0;
    return selected || null;
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

    if (!world.stars.length) {
      world.stars = Array.from({ length: Math.round(clamp(world.w * world.h / 9000, 55, 150)) }, () => ({
        x: Math.random() * world.w,
        y: Math.random() * world.h,
        z: random(0.25, 1),
        phase: random(0, 7),
      }));
    }

    if (!world.ship.x) {
      world.ship.x = world.w * 0.72;
      world.ship.y = world.h * 0.52;
    }

    if (!world.asteroids.length) {
      for (let i = 0; i < asteroidCount(); i++) world.asteroids.push(makeAsteroid(true, i < 2));
      chooseTarget(true);
    }
  }

  function burst(px, py, count, color) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = random(30, 180);
      world.particles.push({
        x: px,
        y: py,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: random(0.25, 0.85),
        size: random(1, 4),
        color,
      });
    }
  }

  function spawnFragments(a) {
    const count = Math.floor(clamp(a.r / 8, 4, 10));
    for (let i = 0; i < count; i++) {
      const angle = random(0, TAU);
      const speed = random(35, 120) + Math.hypot(a.vx, a.vy) * 0.25;
      const r = random(6, Math.max(8, a.r * 0.24));
      world.fragments.push({
        id: nextEntityId++,
        x: a.x,
        y: a.y,
        vx: a.vx + Math.cos(angle) * speed,
        vy: a.vy + Math.sin(angle) * speed,
        r,
        mass: asteroidMass(r, a.density * 0.78),
        rot: random(0, TAU),
        spin: random(-2.5, 2.5),
        life: random(6, 11),
        dangerous: Math.random() > 0.15,
        collisionCooldown: 0,
      });
    }
  }

  function destroyAsteroid(a) {
    spawnFragments(a);
    burst(a.x, a.y, 28 + Math.floor(a.r / 2), a.crystal ? '#4de7ff' : '#c8d0dd');
    world.shake = Math.max(world.shake, clamp(a.r / 7, 5, 11));
    sound('break');
    world.asteroids = world.asteroids.filter(v => v.id !== a.id);
    if (world.targetId === a.id) world.targetId = 0;
    chooseTarget(true);
  }

  function resolveBodyCollision(a, b, restitution = 0.82) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(0.001, Math.hypot(dx, dy));
    const minDist = a.r + b.r;
    if (dist >= minDist) return false;

    const nx = dx / dist;
    const ny = dy / dist;
    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const velAlongNormal = rvx * nx + rvy * ny;

    const overlap = minDist - dist;
    const totalMass = a.mass + b.mass;
    const moveA = overlap * (b.mass / totalMass);
    const moveB = overlap * (a.mass / totalMass);
    a.x -= nx * moveA;
    a.y -= ny * moveA;
    b.x += nx * moveB;
    b.y += ny * moveB;

    if (velAlongNormal > 0) return true;

    const impulse = -(1 + restitution) * velAlongNormal / (1 / a.mass + 1 / b.mass);
    const ix = impulse * nx;
    const iy = impulse * ny;
    a.vx -= ix / a.mass;
    a.vy -= iy / a.mass;
    b.vx += ix / b.mass;
    b.vy += iy / b.mass;

    const tangentX = -ny;
    const tangentY = nx;
    const relTangent = rvx * tangentX + rvy * tangentY;
    const spinKick = relTangent * 0.0025;
    a.spin -= spinKick * (b.mass / totalMass);
    b.spin += spinKick * (a.mass / totalMass);

    const energy = Math.abs(velAlongNormal) * Math.min(a.mass, b.mass);
    if (energy > 900) {
      burst((a.x + b.x) / 2, (a.y + b.y) / 2, 5, '#9fd9ff');
      world.shake = Math.max(world.shake, clamp(energy / 3000, 1.5, 4));
    }
    return true;
  }

  function handleAsteroidPhysics(dt) {
    const bodies = [...world.asteroids, ...world.fragments];
    for (const body of bodies) body.collisionCooldown = Math.max(0, (body.collisionCooldown || 0) - dt);

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        if (a.collisionCooldown > 0 && b.collisionCooldown > 0) continue;
        if (distance(a.x, a.y, b.x, b.y) >= a.r + b.r) continue;
        if (resolveBodyCollision(a, b)) {
          a.collisionCooldown = 0.045;
          b.collisionCooldown = 0.045;
        }
      }
    }
  }

  function predictThreat(hazard) {
    const sh = world.ship;
    const dx = hazard.x - sh.x;
    const dy = hazard.y - sh.y;
    const rvx = hazard.vx - sh.vx;
    const rvy = hazard.vy - sh.vy;
    const speedSq = rvx * rvx + rvy * rvy;
    if (speedSq < 9) return null;

    const timeToClosest = -(dx * rvx + dy * rvy) / speedSq;
    if (timeToClosest <= 0.02 || timeToClosest > 2.0) return null;

    const closestX = dx + rvx * timeToClosest;
    const closestY = dy + rvy * timeToClosest;
    const missDistance = Math.hypot(closestX, closestY);
    const safeRadius = 38 + hazard.r * 1.22;
    const currentDistance = Math.hypot(dx, dy);
    if (missDistance >= safeRadius || currentDistance > 400 + hazard.r) return null;

    const massFactor = clamp((hazard.mass || asteroidMass(hazard.r)) / 90, 0.7, 2.5);
    const urgency = (1 - timeToClosest / 2) * (0.35 + 0.65 * (1 - missDistance / safeRadius)) * Math.sqrt(massFactor);
    return { hazard, rvx, rvy, closestX, closestY, missDistance, urgency };
  }

  function updateAvoidance(dt) {
    const sh = world.ship;
    const t = target();
    const hazards = [
      ...world.fragments.filter(f => f.dangerous),
      ...world.asteroids.filter(a => !t || a.id !== t.id),
    ];
    let best = null;
    for (const hazard of hazards) {
      const threat = predictThreat(hazard);
      if (!threat) continue;
      if (!best || threat.urgency > best.urgency) best = threat;
    }

    let targetX = 0;
    let targetY = 0;
    if (best) {
      const h = best.hazard;
      const relSpeed = Math.max(1, Math.hypot(best.rvx, best.rvy));
      const perpX = -best.rvy / relSpeed;
      const perpY = best.rvx / relSpeed;

      if (sh.threatId !== h.id || sh.dodgeSide === 0) {
        const optionA = { x: sh.x + perpX * 120, y: sh.y + perpY * 120 };
        const optionB = { x: sh.x - perpX * 120, y: sh.y - perpY * 120 };
        const scoreA = distance(optionA.x, optionA.y, h.x, h.y);
        const scoreB = distance(optionB.x, optionB.y, h.x, h.y);
        sh.dodgeSide = scoreA >= scoreB ? 1 : -1;
        sh.threatId = h.id;
      }

      const miss = Math.max(1, best.missDistance);
      const awayX = -best.closestX / miss;
      const awayY = -best.closestY / miss;
      const lateralPower = 112 + best.urgency * 92;
      const awayPower = 24 + best.urgency * 58;
      targetX = perpX * sh.dodgeSide * lateralPower + awayX * awayPower;
      targetY = perpY * sh.dodgeSide * lateralPower + awayY * awayPower;

      const mag = Math.hypot(targetX, targetY);
      if (mag > 195) {
        targetX = targetX / mag * 195;
        targetY = targetY / mag * 195;
      }
      sh.dodgeStrength = best.urgency;
      sh.dodgeHold = 0.34;
      world.dangerText = 'DESVIO PREDITIVO';
    } else {
      sh.dodgeHold = Math.max(0, sh.dodgeHold - dt);
      if (sh.dodgeHold <= 0) {
        sh.dodgeStrength = Math.max(0, sh.dodgeStrength - dt * 4);
        sh.threatId = 0;
        sh.dodgeSide = 0;
        world.dangerText = 'ROTA SEGURA';
      } else {
        targetX = sh.avoidX * 0.76;
        targetY = sh.avoidY * 0.76;
        world.dangerText = 'DESVIO PREDITIVO';
      }
    }

    const response = 1 - Math.exp(-dt * (best ? 8.8 : 4));
    sh.avoidX += (targetX - sh.avoidX) * response;
    sh.avoidY += (targetY - sh.avoidY) * response;
  }

  function handleShipCollisions() {
    const sh = world.ship;
    if (sh.hitTimer > 0) return;
    const t = target();
    const hazards = [...world.fragments, ...world.asteroids.filter(a => !t || a.id !== t.id)];

    for (const h of hazards) {
      if (distance(sh.x, sh.y, h.x, h.y) >= 23 + h.r * 0.8) continue;
      const speed = Math.hypot(h.vx - sh.vx, h.vy - sh.vy);
      const mass = h.mass || asteroidMass(h.r);
      const impact = clamp((speed * Math.sqrt(mass)) / 28, 7, 32);
      state.shield = clamp(state.shield - impact, 0, 100);
      sh.hitTimer = 0.65;

      const dx = h.x - sh.x;
      const dy = h.y - sh.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const nx = dx / d, ny = dy / d;
      h.vx += nx * 28;
      h.vy += ny * 28;
      sh.vx -= nx * 24;
      sh.vy -= ny * 24;

      burst(sh.x, sh.y, 15, '#ff89a2');
      world.shake = 10;
      world.dangerText = 'IMPACTO NO ESCUDO';
      sound('hit');
      if (state.shield <= 0) {
        state.mining = false;
        world.laser = false;
        sh.recoveryTimer = 3.2;
        toast('Escudo colapsou. Recuo automático.');
      }
      break;
    }
  }

  function updateShip(dt) {
    const sh = world.ship;
    sh.hitTimer = Math.max(0, sh.hitTimer - dt);

    if (sh.recoveryTimer > 0) {
      sh.recoveryTimer -= dt;
      if (sh.recoveryTimer <= 0) {
        state.shield = 38;
        toast('Escudo reiniciado em 38%.');
      }
    } else if (state.shield < 100 && sh.hitTimer <= 0) {
      state.shield = clamp(state.shield + dt * 4.5, 0, 100);
    }

    if (state.mining && !target()) chooseTarget(true);
    updateAvoidance(dt);

    const t = target();
    let baseX = world.w * 0.72;
    let baseY = world.h * 0.53;
    if (state.mining && t && sh.recoveryTimer <= 0) {
      const approach = clamp(world.w * 0.105, 92, 150);
      const dx = sh.x - t.x;
      const dy = sh.y - t.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / len;
      const uy = dy / len;
      baseX = clamp(t.x + ux * (t.r + approach), 70, world.w - 70);
      baseY = clamp(t.y + uy * (t.r + approach), 75, world.h - 50);
    }

    const targetX = baseX + sh.avoidX;
    const targetY = baseY + sh.avoidY;
    const dx = targetX - sh.x;
    const dy = targetY - sh.y;
    const d = Math.hypot(dx, dy);
    const dodging = Math.hypot(sh.avoidX, sh.avoidY) > 12;
    const maxSpeed = dodging ? 220 : 135;
    const speed = Math.min(maxSpeed, d * 2.5);
    const desiredVx = d > 1 ? dx / d * speed : 0;
    const desiredVy = d > 1 ? dy / d * speed : 0;
    const response = 1 - Math.exp(-dt * (dodging ? 6.4 : 4.8));
    sh.vx += (desiredVx - sh.vx) * response;
    sh.vy += (desiredVy - sh.vy) * response;
    sh.x = clamp(sh.x + sh.vx * dt, 35, world.w - 35);
    sh.y = clamp(sh.y + sh.vy * dt, 72, world.h - 45);

    const faceX = t ? t.x : sh.x - 1;
    const faceY = t ? t.y : sh.y;
    const desiredAngle = Math.atan2(faceY - sh.y, faceX - sh.x) + Math.PI / 2;
    const angleDiff = ((desiredAngle - sh.angle + Math.PI) % TAU) - Math.PI;
    sh.angle += angleDiff * Math.min(1, dt * 7.5);

    const targetDistance = t ? distance(sh.x, sh.y, t.x, t.y) : Infinity;
    const laserRange = clamp(world.w * 0.36, 280, 560);
    const aimedEnough = Math.abs(angleDiff) < 0.68;
    world.laser = !!(
      state.mining && t && sh.recoveryTimer <= 0 && state.cargo < cargoCapacity() &&
      targetDistance <= laserRange && aimedEnough
    );
  }

  function moveBodies(dt) {
    for (const a of world.asteroids) {
      a.age += dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rot += a.spin * dt;
    }
    for (const f of world.fragments) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.spin * dt;
      f.life -= dt;
    }
  }

  function cullAndSpawn(dt) {
    const margin = 170;
    const currentTarget = target();
    world.asteroids = world.asteroids.filter(a => {
      const inBounds = a.x > -margin && a.x < world.w + margin && a.y > -margin && a.y < world.h + margin;
      if (!inBounds && currentTarget && a.id === currentTarget.id) world.targetId = 0;
      return inBounds || a.age < 2.2;
    });
    world.fragments = world.fragments.filter(f => f.life > 0 && f.x > -margin && f.x < world.w + margin && f.y > -margin && f.y < world.h + margin);

    world.spawnTimer -= dt;
    const desired = asteroidCount();
    if (world.asteroids.length < desired && world.spawnTimer <= 0) {
      const missing = desired - world.asteroids.length;
      const burstCount = Math.min(missing, Math.random() < 0.32 ? 2 : 1);
      for (let i = 0; i < burstCount; i++) world.asteroids.push(makeAsteroid(false, Math.random() < 0.18));
      world.spawnTimer = random(0.18, 0.7);
    }

    if (!target()) chooseTarget(true);
  }

  function updateWorld(dt) {
    world.time += dt;
    world.shake = Math.max(0, world.shake - dt * 22);

    for (const star of world.stars) {
      star.x -= dt * (3 + star.z * 9);
      star.phase += dt * (1 + star.z);
      if (star.x < -2) {
        star.x = world.w + 2;
        star.y = Math.random() * world.h;
      }
    }

    moveBodies(dt);
    handleAsteroidPhysics(dt);
    cullAndSpawn(dt);

    const t = target();
    if (t && world.laser) {
      t.hp -= (8 + miningRate() * 5) * sector()[3] * dt;
      addOre(miningRate() * sector()[3] * dt);
      world.particleTimer -= dt;
      if (world.particleTimer <= 0) {
        world.particleTimer = 0.035;
        burst(t.x, t.y, 2, Math.random() > 0.5 ? '#4de7ff' : '#ffd36f');
      }
      if (t.hp <= 0) destroyAsteroid(t);
    }

    for (const p of world.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= dt;
    }
    world.particles = world.particles.filter(p => p.life > 0);

    updateShip(dt);
    handleShipCollisions();
  }

  function drawImageRotated(img, px, py, w, h, angle, alpha = 1) {
    if (!img) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawBackground() {
    const gradient = ctx.createRadialGradient(world.w * 0.27, world.h * 0.34, 0, world.w * 0.27, world.h * 0.34, world.w * 0.7);
    const tint = sector()[0] === 'red' ? 'rgba(120,30,70,.18)' : sector()[0] === 'void' ? 'rgba(63,40,140,.22)' : 'rgba(18,74,120,.20)';
    gradient.addColorStop(0, tint);
    gradient.addColorStop(0.48, '#050b16');
    gradient.addColorStop(1, '#02040a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, world.w, world.h);

    for (const star of world.stars) {
      ctx.globalAlpha = clamp(0.2 + star.z * 0.65 + Math.sin(star.phase) * 0.08, 0.12, 0.9);
      ctx.fillStyle = star.z > 0.72 ? '#bdeeff' : '#fff';
      const size = 0.55 + star.z * 1.25;
      ctx.fillRect(star.x, star.y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawRock(a, isTarget = false) {
    drawImageRotated(
      a.crystal ? assetsMap.crystal : assetsMap.rock,
      a.x, a.y, a.r * 2.15, a.r * 2.15, a.rot,
      isTarget ? 1 : 0.78,
    );
    if (!isTarget) return;

    const hp = clamp(a.hp / 100, 0, 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(77,231,255,.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r * 0.96, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = a.crystal ? '#4de7ff' : '#90a8c7';
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r * 0.96, -Math.PI / 2, -Math.PI / 2 + TAU * hp);
    ctx.stroke();
    ctx.restore();
  }

  function drawLaser() {
    const t = target();
    if (!world.laser || !t) return;
    const sh = world.ship;
    const dx = t.x - sh.x;
    const dy = t.y - sh.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / d;
    const uy = dy / d;
    const startX = sh.x + ux * 28;
    const startY = sh.y + uy * 28;
    const endX = t.x - ux * t.r * 0.68;
    const endY = t.y - uy * t.r * 0.68;
    const pulse = 0.55 + Math.sin(world.time * 28) * 0.3;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(77,231,255,${0.22 + pulse * 0.2})`;
    ctx.lineWidth = 9;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#4de7ff';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.strokeStyle = '#dfffff';
    ctx.lineWidth = 2.1 + pulse * 1.2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
    drawImageRotated(assetsMap.hit, endX, endY, 34 + pulse * 5, 34 + pulse * 5, world.time * 2.4, 0.82);
  }

  function draw() {
    ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);
    drawBackground();
    ctx.save();
    if (world.shake) ctx.translate(random(-world.shake, world.shake), random(-world.shake, world.shake));

    const t = target();
    for (const a of world.asteroids) drawRock(a, !!t && a.id === t.id);
    for (const f of world.fragments) drawImageRotated(assetsMap.frag, f.x, f.y, f.r * 2.3, f.r * 2.3, f.rot, 0.95);
    drawLaser();

    for (const p of world.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life / 0.55, 0, 1);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    const sh = world.ship;
    const shipImg = Math.hypot(sh.vx, sh.vy) > 28 ? assetsMap.thrust : assetsMap.ship;
    const shipW = clamp(world.w * 0.055, 54, 76);
    const ratio = shipImg ? shipImg.height / shipImg.width : 1;
    if (state.shield < 100) {
      ctx.save();
      ctx.strokeStyle = 'rgba(77,231,255,.2)';
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#4de7ff';
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 34, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    drawImageRotated(shipImg, sh.x, sh.y, shipW, shipW * ratio, sh.angle);
    ctx.restore();
  }

  function renderHud() {
    const cap = cargoCapacity();
    const cargoPct = clamp(state.cargo / cap * 100, 0, 100);
    el('credits').textContent = format(state.credits);
    el('gems').textContent = format(state.gems);
    el('sectorName').textContent = sector()[1];
    el('rateValue').textContent = (miningRate() * sector()[3]).toFixed(2);
    const dodging = world.dangerText.includes('DESVIO');
    el('operationText').textContent = world.laser ? (dodging ? 'MINERANDO · DESVIO' : 'LASER EM OPERAÇÃO') : state.mining ? 'MANOBRANDO ATÉ O ALVO' : 'AGUARDANDO ORDEM';
    el('shieldBar').style.width = clamp(state.shield, 0, 100) + '%';
    el('shieldText').textContent = Math.round(state.shield) + '%';
    el('cargoBar').style.width = cargoPct + '%';
    el('cargoText').textContent = `${Math.floor(state.cargo)} / ${cap}`;
    const danger = el('dangerText');
    danger.textContent = world.dangerText;
    danger.className = 'danger-text' + (world.dangerText.includes('IMPACTO') ? ' hit' : dodging ? ' warn' : '');
    mineButton.textContent = state.mining ? 'PAUSAR MINERAÇÃO' : 'INICIAR MINERAÇÃO';
    mineButton.classList.toggle('active', state.mining);
    el('soundButton').textContent = state.sound ? '🔊' : '🔇';
  }

  function renderPanel() {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));

    if (activeTab === 'cargo') {
      panelContent.innerHTML = `<div class="panel-title"><h2>Carga</h2><span>${Math.floor(state.cargo)} / ${cargoCapacity()}</span></div><div class="resource-list">${Object.entries(RESOURCES).map(([k, r]) => `<div class="resource-row"><span>${r[0]}</span><strong>${Math.floor(state.inventory[k] || 0)}</strong><em>${r[1]} C</em></div>`).join('')}</div><button class="panel-action" data-action="sell">Vender carga por Credits</button>`;
    } else if (activeTab === 'ship') {
      panelContent.innerHTML = `<div class="panel-title"><h2>Rusty Miner I</h2><span>Nível ${state.shipLevel}</span></div><div class="stats-grid"><div class="stat-card"><span>LASER</span><b>${miningRate().toFixed(2)}/s</b></div><div class="stat-card"><span>CARGO</span><b>${cargoCapacity()}</b></div><div class="stat-card"><span>REFINO</span><b>${Math.round(efficiency() * 100)}%</b></div></div><div class="upgrade-list">${[['laser', 'Laser', '+0,35 minério/s'], ['cargo', 'Cargueiro', '+40 capacidade'], ['efficiency', 'Refino', '+5% valor']].map(v => `<button class="upgrade" data-upgrade="${v[0]}"><span>${v[1]}</span><small>${v[2]}</small><b>${format(upgradeCost(v[0]))} C</b></button>`).join('')}</div>`;
    } else {
      panelContent.innerHTML = `<div class="panel-title"><h2>Market P2P</h2><span>SIMULADO</span></div><p class="market-note">Nenhum depósito ou saque real está ativo nesta Alpha.</p><div class="market-card"><div><strong>50 Titanium</strong><span>Ordem de compra</span></div><b>120 Gems</b><button data-action="ms">Vender</button></div><div class="market-card"><div><strong>Mining Core Mk-I</strong><span>Ordem de venda</span></div><b>85 Gems</b><button data-action="mb">Comprar</button></div><div class="fee-note">Taxa simulada do Market: <b>10%</b>.</div>`;
    }
  }

  function renderSectors() {
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
    state.cargo = 0;
    sound('cash');
    toast(`Carga vendida por ${format(total)} Credits.`);
    saveState();
    renderPanel();
  }

  function buyUpgrade(type) {
    const cost = upgradeCost(type);
    if (state.credits < cost) return toast('Credits insuficientes.');
    state.credits -= cost;
    if (type === 'laser') state.laserLevel++;
    if (type === 'cargo') state.cargoLevel++;
    if (type === 'efficiency') state.efficiencyLevel++;
    state.shipLevel = Math.max(1, Math.floor((state.laserLevel + state.cargoLevel + state.efficiencyLevel) / 3));
    sound('up');
    toast('Upgrade instalado.');
    saveState();
    renderPanel();
  }

  function marketSell() {
    if (state.inventory.titanium < 50) return toast('Você precisa de 50 Titanium.');
    state.inventory.titanium -= 50;
    state.cargo = Math.max(0, state.cargo - 50);
    state.gems += 108;
    sound('cash');
    toast('Ordem concluída: +108 Gems após 10% de taxa.');
    saveState();
    renderPanel();
  }

  function marketBuy() {
    if (state.gems < 85) return toast('Gems insuficientes. Este saldo é simulado.');
    state.gems -= 85;
    state.laserLevel += 2;
    sound('up');
    toast('Mining Core Mk-I instalado: Laser +2 níveis.');
    saveState();
    renderPanel();
  }

  function toast(message) {
    const box = el('toast');
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 2400);
  }

  function getAudio() {
    if (!state.sound) return null;
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      audioContext = new AudioCtor();
    }
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }

  function tone(freq, duration, gain = 0.03, type = 'sine', slide = 0) {
    const ac = getAudio();
    if (!ac) return;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    const now = ac.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + duration);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  function sound(kind) {
    if (!state.sound) return;
    if (kind === 'start') {
      tone(180, 0.08, 0.03, 'sawtooth', 120);
      setTimeout(() => tone(330, 0.09, 0.02, 'sine', 90), 55);
    }
    if (kind === 'break') {
      tone(90, 0.18, 0.05, 'sawtooth', -35);
      tone(460, 0.12, 0.02, 'triangle', -180);
    }
    if (kind === 'hit') tone(72, 0.16, 0.05, 'square', -25);
    if (kind === 'cash') tone(520, 0.08, 0.02, 'sine', 140);
    if (kind === 'up') tone(260, 0.1, 0.025, 'triangle', 180);
  }

  function loop(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    updateWorld(dt);
    draw();
    renderHud();
    requestAnimationFrame(loop);
  }

  mineButton.onclick = () => {
    getAudio();
    if (!state.mining && state.cargo >= cargoCapacity()) return toast('Carga cheia.');
    if (!state.mining && world.ship.recoveryTimer > 0) return toast('A nave ainda está recuperando o escudo.');
    state.mining = !state.mining;
    if (state.mining) chooseTarget(true);
    sound('start');
    saveState();
  };

  el('soundButton').onclick = () => {
    state.sound = !state.sound;
    if (state.sound) {
      getAudio();
      tone(420, 0.06, 0.02, 'sine', 80);
    }
    saveState();
    renderHud();
  };

  document.querySelector('.tabs').onclick = e => {
    const button = e.target.closest('[data-tab]');
    if (!button) return;
    activeTab = button.dataset.tab;
    renderPanel();
  };

  panelContent.onclick = e => {
    const upgrade = e.target.closest('[data-upgrade]');
    if (upgrade) return buyUpgrade(upgrade.dataset.upgrade);
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'sell') sellCargo();
    if (action === 'ms') marketSell();
    if (action === 'mb') marketBuy();
  };

  el('sectorButton').onclick = () => {
    renderSectors();
    el('sectorModal').hidden = false;
  };

  el('closeSector').onclick = () => { el('sectorModal').hidden = true; };

  el('sectorModal').onclick = e => {
    const button = e.target.closest('[data-sector]');
    if (button && !button.disabled) {
      state.sector = button.dataset.sector;
      el('sectorModal').hidden = true;
      world.asteroids = [];
      world.fragments = [];
      world.targetId = 0;
      for (let i = 0; i < asteroidCount(); i++) world.asteroids.push(makeAsteroid(true, i < 2));
      chooseTarget(true);
      saveState();
      toast('Rota definida: ' + sector()[1]);
      renderPanel();
    } else if (e.target === el('sectorModal')) {
      el('sectorModal').hidden = true;
    }
  };

  addEventListener('resize', resize, { passive: true });
  addEventListener('beforeunload', saveState);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(); });

  applyOfflineProgress();
  resize();
  renderPanel();
  renderSectors();
  renderHud();
  loadAssets().then(() => requestAnimationFrame(loop));
})();
