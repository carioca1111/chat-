import type { World } from "../core/types";
export function equip(w: World, hunterId: string, itemId: string) {
  const h = w.hunters.find((h) => h.id === hunterId),
    i = w.items.find((i) => i.id === itemId);
  if (
    !h ||
    !i ||
    h.ownerId !== "local-village" ||
    i.ownerId !== h.ownerId ||
    (i.equippedBy && i.equippedBy !== h.id)
  )
    return false;
  if (h.equipment) w.items.find((i) => i.id === h.equipment)!.equippedBy = null;
  h.equipment = i.id;
  i.equippedBy = h.id;
  return true;
}
