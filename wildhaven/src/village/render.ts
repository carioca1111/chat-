import { batchStatic } from "../rendering/batch";
import * as T from "three";
import { house, part, human } from "../rendering/models";
import { height, riverX } from "../terrain/fields";
export function village(seed: number) {
  const g = new T.Group();
  for (const b of [
    {
      x: -8,
      z: -5,
      w: 7,
      d: 6,
      c: 0x506d65,
      id: "guild",
      label: "Guilda dos Hunters",
    },
    {
      x: 9,
      z: -3,
      w: 5,
      d: 4,
      c: 0x8f654b,
      id: "warehouse",
      label: "Depósito",
    },
    {
      x: -10,
      z: 15,
      w: 5,
      d: 5,
      c: 0x7d6555,
      id: "lodge",
      label: "Alojamento",
    },
  ]) {
    const h = batchStatic(house(b.w, b.d, b.c));
    h.position.set(b.x, height(b.x, b.z, seed), b.z);
    h.userData = { id: b.id, label: b.label };
    h.traverse((m) => (m.userData.id = b.id));
    g.add(h);
  }
  const fire = new T.Group();
  fire.position.set(3, height(3, 5, seed), 5);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    part(
      fire,
      "sphere",
      0x8c8b74,
      [Math.cos(a) * 1.1, 0.2, Math.sin(a) * 1.1],
      [0.32, 0.24, 0.3],
    );
  }
  part(fire, "cyl", 0x60472c, [0, 0.25, 0], [0.22, 1.6, 0.22], 1.2);
  part(fire, "cone", 0xf3ad48, [0, 0.8, 0], [0.46, 1.2, 0.46]);
  const light = new T.PointLight(0xffb44f, 6, 14);
  light.position.y = 2;
  fire.add(light);
  g.add(fire);
  for (let i = 0; i < 6; i++)
    part(
      g,
      "box",
      0x8c714e,
      [10 + (i % 3), height(10, 4, seed) + 0.5, 4 + Math.floor(i / 3)],
      [0.85, 0.85, 0.85],
    );
  const bx = riverX(11);
  for (let i = -13; i < 14; i++) {
    const x = bx + i;
    part(
      g,
      "box",
      0x826a4d,
      [x, 1.3, 10 + Math.sin(x * 0.025) * 2],
      [0.92, 0.3, 4.8],
    );
    if (i % 4 === 0)
      for (const z of [-2.6, 2.6])
        part(
          g,
          "cyl",
          0x6f5b42,
          [x, 1.9, 10 + Math.sin(x * 0.025) * 2 + z],
          [0.13, 1.8, 0.13],
        );
  }
  for (const z of [-2.6, 2.6])
    part(g, "box", 0x8b7555, [bx, 2.5, 12 + z], [27, 0.13, 0.13]);
  return g;
}
export function workers() {
  return [human(0xa48b62), human(0x68856d)];
}
