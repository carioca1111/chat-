import type { World, Hunter } from "../core/types";
import { random, hash } from "../core/random";
import { SPECIES } from "../creatures/species";
import { height } from "../terrain/fields";
export function visitor(w: World): Hunter {
  const i = w.hunters.length;
  const stats = Object.freeze({
    força: 9 + Math.floor(random(w) * 8),
    agilidade: 8 + Math.floor(random(w) * 9),
    resistência: 10 + Math.floor(random(w) * 7),
    percepção: 8 + Math.floor(random(w) * 8),
    inteligência: 7 + Math.floor(random(w) * 9),
    coragem: 9 + Math.floor(random(w) * 8),
  });
  return {
    id: `hunter-${i + 1}`,
    name: [
      "Lia Valeverde",
      "Raul da Bruma",
      "Mara Ventofrio",
      "Ícaro do Cedro",
    ][i % 4],
    origin: "Terras do Poente",
    personality: "Cautelosa e persistente",
    talent: "Rastreadora",
    limitation: "Evita predadores maiores",
    affinity: "Bosques temperados",
    natural: stats,
    hp: 80 + stats.resistência * 3,
    maxHp: 80 + stats.resistência * 3,
    status: "chegando",
    phase: "A caminho da guilda",
    ownerId: null,
    equipment: null,
    x: -22,
    z: 10,
    destination: { x: -5, z: 2 },
    cooldown: 0,
    kills: 0,
    haul: 0,
    history: [],
  };
}
export function createWorld(seed = 46219): World {
  const w: World = {
    version: 1,
    seed,
    rng: seed || 1,
    tick: 0,
    time: 0,
    lastSaved: Date.now(),
    creatures: [],
    hunters: [],
    items: [
      {
        id: "item-spear-1",
        type: "spear",
        name: "Lança de freixo",
        ownerId: "local-village",
        equippedBy: null,
        attack: 8,
      },
    ],
    resources: { wood: 24, food: 18, materials: 0, coins: 60 },
    environment: {},
    events: [],
    audit: [],
    nextHunter: 180,
  };
  for (let i = 0; i < 39; i++) {
    const species = i < 22 ? "cervalho" : i < 29 ? "rasteiro" : i < 31 ? "coroador" : "cascarrumo";
    let x = 20 + random(w) * 140,
      z = -85 + random(w) * 155;
    while (height(x, z, seed) < 0.3) {
      x = -100 + random(w) * 260;
      z = -100 + random(w) * 200;
    }
    w.creatures.push({
      id: `fauna-${String(i + 1).padStart(3, "0")}`,
      species,
      x,
      z,
      hp: SPECIES[species].hp,
      hunger: random(w) * 40,
      thirst: random(w) * 20,
      energy: 80,
      state: "explorar",
      goal: { x: x + 8, z: z + 8 },
      cooldown: 0,
      crossed: 0,
    });
  }
  Object.assign(w.creatures[0], {
    x: 46,
    z: 21,
    state: "migrar",
    goal: { x: 55, z: 21 },
  });
  Object.assign(w.creatures[1], { x: 34, z: 8, goal: { x: 40, z: 8 } });
  ensureForestRocantraz(w);
  w.hunters.push(visitor(w));
  w.events.push({ time: 0, text: "Uma viajante se aproxima de Valeverde." });
  return w;
}

/** Adds the forest species to older Alpha 0.1 saves without resetting RNG or hunters. */
export function ensureForestDetritivores(w: World) {
  if (w.creatures.some((c) => c.species === "cascarrumo")) return 0;
  for (let i = 0; i < 8; i++) {
    let x = 20, z = 20;
    for (let attempt = 0; attempt < 48; attempt++) {
      x = 20 + hash(i * 19 + attempt, 77, w.seed) * 140;
      z = -85 + hash(i * 23 + attempt, 99, w.seed) * 155;
      if (height(x, z, w.seed) >= 0.3) break;
    }
    w.creatures.push({
      id: "detritivore-forest-" + String(i + 1).padStart(3, "0"),
      species: "cascarrumo", x, z, hp: SPECIES.cascarrumo.hp,
      hunger: hash(i, 17, w.seed) * 40, thirst: 8, energy: 80,
      state: "explorar", goal: { x: x + 3, z: z + 2 },
      cooldown: 0, crossed: 0,
    });
  }
  return 8;
}

/**
 * Only ONE adult forest / mountain ecotype can inhabit the Alpha 0.1 map.
 * Deterministic placement leaves RNG, existing hunter identities and saves intact.
 * Desert ecotype is reserved for the future arid biomes.
 */
export function ensureForestRocantraz(w: World): number {
  if (w.creatures.some((c) => c.species === "rocantraz")) return 0;
  let x = 115, z = -68;
  for (let attempt = 0; attempt < 128; attempt++) {
    const cx = 72 + hash(attempt + 187, 929, w.seed) * 97;
    const cz = -99 + hash(attempt + 311, 667, w.seed) * 132;
    if (height(cx, cz, w.seed) > 0.5 &&
        Math.hypot(cx + 5, cz - 2) > 75) {
      x = cx; z = cz;
      break;
    }
  }
  w.creatures.push({
    id: "apex-rocantraz-forest-001",
    species: "rocantraz",
    variant: "forest",
    den: { x, z },
    x, z,
    hp: SPECIES.rocantraz.hp,
    hunger: 58, thirst: 20, energy: 95,
    state: "explorar",
    goal: { x: x - 7, z: z + 8 },
    cooldown: 0, crossed: 0,
  });
  return 1;
}
