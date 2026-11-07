import { batchStatic } from "./batch";
import * as T from "three";
import type { Species } from "../core/types";
import { SPECIES } from "../creatures/species";
import { createDetritivore, isDetritivore } from "./detritivores";
const materials = new Map<number, T.MeshStandardMaterial>();
export const mat = (color: number) => {
  if (!materials.has(color))
    materials.set(
      color,
      new T.MeshStandardMaterial({ color, roughness: 0.87 }),
    );
  return materials.get(color)!;
};
const sphere = new T.SphereGeometry(1, 12, 9),
  box = new T.BoxGeometry(1, 1, 1),
  cone = new T.ConeGeometry(1, 1, 9),
  cyl = new T.CylinderGeometry(1, 1, 1, 8);
export function part(
  g: T.Group,
  shape: "sphere" | "box" | "cone" | "cyl",
  color: number,
  p: number[],
  s: number[],
  rotation = 0,
) {
  const m = new T.Mesh({ sphere, box, cone, cyl }[shape], mat(color));
  m.position.set(p[0], p[1], p[2]);
  m.scale.set(s[0], s[1], s[2]);
  m.rotation.z = rotation;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
export function animal(species: Species) {
  if (isDetritivore(species)) return createDetritivore(species);
  const g = new T.Group(),
    s = SPECIES[species];
  part(g, "sphere", s.color, [0, 1, 0], [0.52, 0.62, 1]);
  part(g, "sphere", s.color, [0, 1.45, 0.9], [0.38, 0.44, 0.57]);
  part(g, "sphere", 0xd9c8a5, [0, 1.28, 1.25], [0.28, 0.24, 0.3]);
  for (const x of [-0.32, 0.32])
    for (const z of [-0.6, 0.6]) {
      const leg = part(g, "cyl", s.color, [x, 0.43, z], [0.13, 0.8, 0.13]);
      leg.userData.leg = true;
      leg.userData.phase = x * z > 0 ? 0 : Math.PI;
    }
  for (const x of [-0.22, 0.22]) {
    part(g, "sphere", 0x101d19, [x, 1.59, 1.22], [0.055, 0.065, 0.055]);
    part(g, "cone", s.color, [x, 1.95, 0.78], [0.17, 0.38, 0.12], -x);
  }
  if (species === "cervalho") {
    for (const x of [-0.3, 0.3]) {
      part(g, "cyl", 0x5c4936, [x, 2.05, 0.9], [0.055, 0.72, 0.055], -x);
      part(
        g,
        "cyl",
        0x5c4936,
        [x * 1.5, 2.2, 0.9],
        [0.045, 0.36, 0.045],
        x * 2.5,
      );
    }
  } else {
    part(g, "cone", s.color, [0, 1, -1.15], [0.24, 1.1, 0.24], Math.PI / 2);
    if (species === "coroador")
      for (let z = -0.7; z < 1; z += 0.3)
        part(g, "cone", 0xe2d6ad, [0, 1.7, z], [0.2, 0.65, 0.25]);
  }
  batchStatic(g);
  g.scale.setScalar(s.scale);
  return g;
}
export function human(color = 0x467d86) {
  const g = new T.Group();
  part(g, "sphere", color, [0, 1.15, 0], [0.35, 0.5, 0.23]);
  part(g, "sphere", 0xd9b18a, [0, 1.88, 0], [0.24, 0.28, 0.24]);
  part(g, "sphere", 0x473b30, [0, 2.03, -0.04], [0.26, 0.19, 0.25]);
  for (const x of [-0.19, 0.19]) {
    const l = part(g, "cyl", 0x333e36, [x, 0.42, 0], [0.12, 0.8, 0.13]);
    l.userData.leg = true;
    l.userData.phase = x > 0 ? 0 : Math.PI;
    part(g, "cyl", color, [x * 2, 1.1, 0], [0.09, 0.7, 0.09], x);
  }
  part(g, "box", 0x6e583b, [0, 1.2, -0.3], [0.45, 0.55, 0.25]);
  const spear = part(
    g,
    "cyl",
    0x9e8254,
    [0.55, 1.2, 0.1],
    [0.035, 2.3, 0.035],
    -0.15,
  );
  spear.name = "weapon";
  const tip = part(g, "cone", 0xbfc9c1, [0.72, 2.38, 0.1], [0.1, 0.35, 0.1]);
  tip.name = "weapon";
  batchStatic(g);
  return g;
}
export function house(width: number, depth: number, color: number) {
  const g = new T.Group();
  part(g, "box", 0x777b68, [0, 0.3, 0], [width + 0.5, 0.6, depth + 0.5]);
  part(g, "box", 0xd0bd91, [0, 1.9, 0], [width, 3.2, depth]);
  for (const x of [-width / 2, width / 2])
    for (const z of [-depth / 2, depth / 2])
      part(g, "box", 0x574b38, [x, 2, z], [0.23, 3.5, 0.23]);
  const shape = new T.Shape();
  shape.moveTo(-width / 2 - 0.7, 0);
  shape.lineTo(0, 2.3);
  shape.lineTo(width / 2 + 0.7, 0);
  shape.closePath();
  const roof = new T.Mesh(
    new T.ExtrudeGeometry(shape, { depth: depth + 1.2, bevelEnabled: false }),
    mat(color),
  );
  roof.position.set(0, 3.45, -depth / 2 - 0.6);
  roof.castShadow = true;
  g.add(roof);
  part(g, "box", 0x443b2e, [0, 1.5, depth / 2 + 0.02], [1.2, 2.3, 0.12]);
  for (const x of [-width * 0.31, width * 0.31]) {
    part(g, "box", 0x534d3b, [x, 2.2, depth / 2 + 0.07], [0.95, 1, 0.15]);
    part(g, "box", 0xe0be6d, [x, 2.2, depth / 2 + 0.16], [0.65, 0.7, 0.05]);
  }
  part(g, "box", 0x8c8a75, [width * 0.28, 4.7, -depth * 0.2], [0.75, 2.4, 0.8]);
  return g;
}
