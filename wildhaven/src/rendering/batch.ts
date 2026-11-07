import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Merge static geometry per material, preserving all animated joints.
 * Both indexed and non-indexed primitives exist in our mid-poly models.
 * Normalizing indices avoids silently losing shells when the merge fails.
 */
export function batchStatic(group: T.Group) {
  const batches = new Map<
    T.Material, { geometries: T.BufferGeometry[]; originals: T.Mesh[] }
  >();
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (
      !(o instanceof T.Mesh) ||
      o.userData.leg ||
      o.name === "weapon" ||
      Array.isArray(o.material)
    ) return;
    const geo = o.geometry.index
      ? o.geometry.toNonIndexed()
      : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    let record = batches.get(o.material);
    if (!record) {
      record = { geometries: [], originals: [] };
      batches.set(o.material, record);
    }
    record.geometries.push(geo);
    record.originals.push(o);
  });
  for (const [material, batch] of batches) {
    const merged = mergeGeometries(batch.geometries);
    batch.geometries.forEach((g) => g.dispose());
    // Keep originals as a safe fallback if geometry attributes conflict.
    if (!merged) continue;
    batch.originals.forEach((mesh) => mesh.removeFromParent());
    const mesh = new T.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
