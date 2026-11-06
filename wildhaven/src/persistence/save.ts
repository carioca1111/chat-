import type { World } from "../core/types";
import { createWorld } from "../world/create";
import { advance, event } from "../simulation/engine";
const KEY = "wildhaven.alpha01.save";
export function serialize(w: World) {
  return JSON.stringify(w);
}
export function deserialize(raw: string): World {
  const w = JSON.parse(raw) as World;
  if (
    w.version !== 1 ||
    !Number.isInteger(w.seed) ||
    !Number.isFinite(w.rng) ||
    !Number.isInteger(w.tick) ||
    w.tick < 0 ||
    !Array.isArray(w.creatures) ||
    !Array.isArray(w.hunters) ||
    !w.resources ||
    !w.environment ||
    !Array.isArray(w.items) ||
    !Array.isArray(w.events) ||
    !Array.isArray(w.audit)
  )
    throw Error("Save incompatível ou inválido");
  for (const c of [...w.creatures, ...w.hunters])
    if (
      !Number.isFinite(c.x) ||
      !Number.isFinite(c.z) ||
      !Number.isFinite(c.hp)
    )
      throw Error("Entidade inválida");
  for (const h of w.hunters) Object.freeze(h.natural);
  return w;
}
export function save(w: World) {
  w.lastSaved = Date.now();
  localStorage.setItem(KEY, serialize(w));
}
export function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return createWorld();
  const w = deserialize(raw);
  const elapsed = Math.min(
    1800,
    Math.max(0, (Date.now() - w.lastSaved) / 1000),
  );
  advance(w, elapsed);
  if (elapsed > 10)
    event(w, `Simulados ${Math.round(elapsed)}s de ausência (limite: 30 min).`);
  return w;
}
