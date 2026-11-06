import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
/** Merge static geometry per material. Keep animated limbs and equipment separate. */
export function batchStatic(group: T.Group) {
  const batches = new Map<T.Material, T.BufferGeometry[]>();
  const remove: T.Mesh[] = [];
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (
      !(o instanceof T.Mesh) ||
      o.userData.leg ||
      o.name === "weapon" ||
      Array.isArray(o.material)
    )
      return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    const list = batches.get(o.material) || [];
    list.push(geo);
    batches.set(o.material, list);
    remove.push(o);
  });
  // Only intended before the model is attached/transformed in the world.
  for (const m of remove) m.removeFromParent();
  for (const [material, geometries] of batches) {
    const geo = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (!geo) continue;
    const m = new T.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
