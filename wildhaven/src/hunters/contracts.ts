import type { World } from "../core/types";
export function recruit(w: World, id: string, accept: boolean) {
  const h = w.hunters.find((h) => h.id === id);
  if (!h || h.status !== "visitante" || (accept && w.resources.coins < 20))
    return false;
  h.status = accept ? "contratado" : "recusado";
  h.ownerId = accept ? "local-village" : null;
  h.phase = accept ? "Disponível na guilda" : "Partindo";
  if (accept) w.resources.coins -= 20;
  w.audit.push({
    id: `audit-${w.audit.length + 1}`,
    tick: w.tick,
    kind: accept ? "recruit" : "decline",
    entityId: id,
    from: null,
    to: h.ownerId,
  });
  return true;
}
export function expedition(w: World, id: string, x: number, z: number) {
  const h = w.hunters.find((h) => h.id === id);
  if (!h || h.status !== "contratado") return false;
  h.status = "expedição";
  h.phase = "Saindo para a caçada";
  h.destination = { x, z };
  h.target = undefined;
  return true;
}
