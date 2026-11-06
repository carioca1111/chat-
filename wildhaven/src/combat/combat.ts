import type { World, Hunter, Creature } from "../core/types";
import { SPECIES } from "../creatures/species";
export const distance = (
  a: { x: number; z: number },
  b: { x: number; z: number },
) => Math.hypot(a.x - b.x, a.z - b.z);
export function hunterDamage(w: World, h: Hunter) {
  return (
    3 +
    h.natural.força * 0.65 +
    (w.items.find((i) => i.id === h.equipment && i.equippedBy === h.id)
      ?.attack || 0)
  );
}
export function strike(w: World, h: Hunter, c: Creature) {
  if (h.cooldown > 0 || distance(h, c) > 2.6) return;
  h.cooldown = 1.2;
  c.hp = Math.max(0, c.hp - hunterDamage(w, h));
  c.state = c.hp ? "atacar" : "morto";
  c.target = h.id;
  if (c.hp === 0) {
    h.kills++;
    h.haul += SPECIES[c.species].food;
    h.history.push(
      `${c.id} · ${SPECIES[c.species].name} · t=${Math.round(w.time)}`,
    );
    h.status = "retornando";
    h.phase = "Caçada concluída • retornando";
    h.target = undefined;
  }
}
