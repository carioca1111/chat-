import type { World, Vec, Creature } from "../core/types";
import { random, clamp } from "../core/random";
import { walkable, riverX, chunkKey, trees } from "../terrain/fields";
import { distance, strike } from "../combat/combat";
import { SPECIES } from "../creatures/species";
import { visitor } from "../world/create";
export const STEP = 0.2;
export function event(w: World, text: string) {
  w.events.unshift({ time: w.time, text });
  w.events.length = Math.min(w.events.length, 40);
}
export function move(w: World, e: Vec, g: Vec, speed: number, dt: number) {
  const d = distance(e, g);
  if (d < 0.1) return;
  const s = Math.min(d, speed * dt),
    dx = ((g.x - e.x) / d) * s,
    dz = ((g.z - e.z) / d) * s;
  if (walkable(e.x + dx, e.z + dz, w.seed)) {
    e.x += dx;
    e.z += dz;
  } else if (walkable(e.x + dx, e.z, w.seed)) e.x += dx;
  else if (walkable(e.x, e.z + dz, w.seed)) e.z += dz;
  else {
    // route along bank toward the bridge
    const bridgeZ = 10 + Math.sin(e.x * 0.025) * 2;
    const bz = Math.sign(bridgeZ - e.z) * s;
    if (walkable(e.x, e.z + bz, w.seed)) e.z += bz;
  }
}
function decide(w: World, c: Creature) {
  const spec = SPECIES[c.species];
  const threat = w.creatures.find(
    (o) =>
      o.hp > 0 &&
      o.species !== c.species &&
      SPECIES[o.species].damage > spec.damage &&
      distance(o, c) < 11,
  );
  if (c.state === "migrar" && distance(c, c.goal) > 1 && !threat) return;
  if (threat) {
    c.state = "fugir";
    c.target = undefined;
    c.goal = {
      x: clamp(c.x + (c.x - threat.x) * 2, -138, 186),
      z: clamp(c.z + (c.z - threat.z) * 2, -138, 186),
    };
    return;
  }
  const hunter = w.hunters.find(
    (h) => h.target === c.id && h.status === "expedição" && distance(h, c) < 7,
  );
  if (hunter) {
    c.state = c.species === "cervalho" && c.hp > 20 ? "fugir" : "atacar";
    c.target = hunter.id;
    c.goal = { x: c.x + (c.x - hunter.x) * 2, z: c.z + (c.z - hunter.z) * 2 };
    return;
  }
  if (c.energy < 18) {
    c.state = "descansar";
    return;
  }
  if (c.thirst > 65) {
    c.state = "beber";
    const rx = riverX(c.z);
    c.goal = { x: rx + (c.x < rx ? -10 : 10), z: c.z };
    return;
  }
  if (c.species !== "cervalho" && c.hunger > 28) {
    const prey = w.creatures
      .filter(
        (o) =>
          o.hp > 0 &&
          SPECIES[o.species].damage < spec.damage &&
          distance(o, c) < 36,
      )
      .sort((a, b) => distance(a, c) - distance(b, c))[0];
    if (prey) {
      c.state = "perseguir";
      c.target = prey.id;
      return;
    }
  }
  if (c.species === "cervalho" && c.hunger > 28) {
    c.state = "pastar";
    return;
  }
  if (
    distance(c, c.goal) < 2 ||
    c.state === "descansar" ||
    c.state === "pastar" ||
    c.state === "beber"
  ) {
    c.goal = {
      x: clamp(c.x + (random(w) - 0.5) * 32, -136, 184),
      z: clamp(c.z + (random(w) - 0.5) * 32, -136, 184),
    };
  }
  c.state = "explorar";
  c.target = undefined;
}
export function step(w: World) {
  w.tick++;
  w.time = w.tick * STEP;
  for (const c of w.creatures) {
    if (c.hp <= 0) continue;
    const old = chunkKey(c.x, c.z);
    c.cooldown = Math.max(0, c.cooldown - STEP);
    c.hunger = clamp(c.hunger + STEP * 0.11, 0, 100);
    c.thirst = clamp(c.thirst + STEP * 0.16, 0, 100);
    c.energy = Math.max(0, c.energy - STEP * 0.025);
    // Logical LOD is based on actors, never camera. This keeps replay deterministic.
    const near =
      Math.hypot(c.x, c.z) < 60 || w.hunters.some((h) => distance(h, c) < 45);
    if (w.tick % (near ? 2 : 10) === 0) decide(w, c);
    if (c.state === "descansar") {
      c.energy = Math.min(100, c.energy + STEP * 3);
      continue;
    }
    if (c.state === "pastar") {
      c.hunger = Math.max(0, c.hunger - STEP * 4);
      continue;
    }
    if (c.state === "beber" && distance(c, c.goal) < 2) {
      c.thirst = Math.max(0, c.thirst - STEP * 7);
      continue;
    }
    if (c.state === "perseguir" || c.state === "atacar") {
      const prey =
        w.creatures.find((o) => o.id === c.target && o.hp > 0) ||
        w.hunters.find((h) => h.id === c.target && h.status === "expedição");
      if (prey) {
        if (distance(c, prey) > SPECIES[c.species].range)
          move(w, c, prey, SPECIES[c.species].speed, STEP);
        else if (c.cooldown === 0) {
          prey.hp = Math.max(0, prey.hp - SPECIES[c.species].damage);
          c.cooldown = 1.6;
          c.state = "atacar";
          if (prey.hp === 0) {
            c.hunger = Math.max(0, c.hunger - 45);
            c.target = undefined;
            if ("species" in prey) {
              prey.state = "morto";
              event(w, `${SPECIES[c.species].name} caçou ${prey.id}.`);
            }
          }
        }
      } else c.state = "explorar";
    } else
      move(
        w,
        c,
        c.goal,
        SPECIES[c.species].speed *
          (c.state === "fugir" ? 1.2 : c.state === "migrar" ? 1 : 0.45),
        STEP,
      );
    if (old !== chunkKey(c.x, c.z)) {
      c.crossed++;
      if (c.id === "fauna-001")
        event(
          w,
          `${c.id} atravessou para ${chunkKey(c.x, c.z)} mantendo sua identidade.`,
        );
    }
  }
  for (const h of w.hunters) {
    h.cooldown = Math.max(0, h.cooldown - STEP);
    if (h.status === "chegando") {
      move(w, h, { x: -5, z: 2 }, 3, STEP);
      if (distance(h, { x: -5, z: 2 }) < 1) {
        h.status = "visitante";
        h.phase = "Aguardando contrato";
        event(w, `${h.name} chegou à guilda. Abra sua carta.`);
      }
    }
    if (h.status === "recusado") move(w, h, { x: -130, z: 10 }, 3, STEP);
    if (h.status === "expedição") {
      if (h.hp < h.maxHp * 0.25) {
        h.status = "retornando";
        h.phase = "Ferido • recuando";
        h.target = undefined;
        event(w, `${h.name} recuou para se recuperar.`);
        continue;
      }
      let target = w.creatures.find((c) => c.id === h.target && c.hp > 0);
      if (!target) {
        target = w.creatures
          .filter(
            (c) =>
              c.hp > 0 &&
              c.species !== "coroador" &&
              distance(c, h.destination) < 42,
          )
          .sort((a, b) => distance(a, h) - distance(b, h))[0];
        h.target = target?.id;
      }
      if (target) {
        h.phase =
          distance(h, target) < 2.6
            ? "Em combate"
            : `Rastreando ${SPECIES[target.species].name}`;
        if (distance(h, target) > 2.2)
          move(w, h, target, 4.4 + h.natural.agilidade * 0.035, STEP);
        strike(w, h, target);
      } else {
        h.status = "retornando";
        h.phase = "Nenhuma presa • retornando";
      }
    }
    if (h.status === "retornando") {
      move(w, h, { x: -5, z: 2 }, 4, STEP);
      if (distance(h, { x: -5, z: 2 }) < 1) {
        if (h.haul) {
          w.resources.materials += h.haul;
          w.resources.food += Math.ceil(h.haul / 2);
          event(w, `${h.name} voltou com ${h.haul} materiais.`);
          h.haul = 0;
        }
        h.status = h.hp < h.maxHp ? "recuperando" : "contratado";
        h.phase =
          h.status === "recuperando"
            ? "Recuperando na vila"
            : "Disponível na guilda";
      }
    }
    if (h.status === "recuperando") {
      h.hp = Math.min(h.maxHp, h.hp + STEP * 2);
      if (h.hp === h.maxHp) {
        h.status = "contratado";
        h.phase = "Disponível na guilda";
      }
    }
  }
  if (w.time >= w.nextHunter && w.hunters.length < 4) {
    w.hunters.push(visitor(w));
    w.nextHunter += 240;
    event(w, "Uma nova viajante foi avistada na estrada.");
  }
}
export function advance(w: World, seconds: number) {
  for (let i = 0; i < Math.floor(seconds / STEP); i++) step(w);
}
export function cutTree(w: World, id: string) {
  if (w.environment[id]) return false;
  const p = id.split(":");
  const tree = trees(Number(p[1]), Number(p[2]), w.seed).find(
    (t) => t.id === id,
  );
  if (!tree) return false;
  w.environment[id] = { cutAt: w.time };
  w.resources.wood += 5;
  event(w, "Árvore cortada: +5 madeira. A clareira será preservada no save.");
  return true;
}
