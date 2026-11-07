import * as T from "three";
import type { Action, Species } from "../core/types";
import { batchStatic } from "./batch";

/**
 * Wildhaven / Auralis: three real, jointed mid-poly detritivore meshes.
 * All anatomy is geometry (not billboards/textures).
 * Reuses geometries and materials; static shells are merged per material.
 * Forward direction: +Z; ground plane: Y=0.
 */
export type Detritivore = "cascarrumo" | "dunebrio" | "nivelio";
export const DETRITIVORE_SPECIES: readonly Detritivore[] = [
  "cascarrumo", "dunebrio", "nivelio",
];
export const DETRITIVORE_ANIMATIONS = [
  "idle", "walk", "feed", "flee", "defend", "rest", "die",
] as const;
export type DetritivoreAnimation = (typeof DETRITIVORE_ANIMATIONS)[number];

export function isDetritivore(id: Species): id is Detritivore {
  return id === "cascarrumo" || id === "dunebrio" || id === "nivelio";
}

const round = new T.SphereGeometry(1, 12, 9);
const faceted = new T.IcosahedronGeometry(1, 1);
const cylinder = new T.CylinderGeometry(1, 1, 1, 8);
const pointed = new T.ConeGeometry(1, 1, 8);
const geometry = { round, faceted, cylinder, pointed };
const palette = new Map<number, T.MeshStandardMaterial>();
function material(color: number) {
  let result = palette.get(color);
  if (!result) {
    result = new T.MeshStandardMaterial({
      color, roughness: 0.88, metalness: 0.02, flatShading: true,
    });
    palette.set(color, result);
  }
  return result;
}
type Shape = keyof typeof geometry;
function shape(
  parent: T.Group,
  primitive: Shape,
  color: number,
  pos: [number, number, number],
  scale: [number, number, number],
  rotation?: [number, number, number],
  mobile = false,
) {
  const mesh = new T.Mesh(geometry[primitive], material(color));
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // The existing batchStatic merger excludes meshes bearing userData.leg.
  if (mobile) mesh.userData.leg = true;
  parent.add(mesh);
  return mesh;
}
type Joint = { node: T.Group; phase: number; restZ: number };
type Rig = {
  kind: Detritivore;
  body: T.Group;
  legs: Joint[];
  feelers: Joint[];
  jaws: Joint[];
  tail?: T.Group;
  armor: Joint[];
};
function pivot(parent: T.Group, x: number, y: number, z: number) {
  const joint = new T.Group();
  joint.position.set(x, y, z);
  parent.add(joint);
  return joint;
}
function leg(
  parent: T.Group, side: -1 | 1, z: number, y: number,
  length: number, upperColor: number, footColor: number,
  phase: number,
): Joint {
  const joint = pivot(parent, side * 0.35, y, z);
  shape(joint, "cylinder", upperColor,
    [side * length * 0.32, -0.075, 0],
    [0.045, length * 0.62, 0.045],
    [0, 0, -side * 0.9], true);
  shape(joint, "faceted", footColor,
    [side * length * 0.7, -length * 0.38, 0.02],
    [0.078, 0.075, 0.092], undefined, true);
  shape(joint, "cylinder", upperColor,
    [side * length * 0.61, -length * 0.30, 0],
    [0.037, length * 0.5, 0.037],
    [0, 0, side * 0.37], true);
  return { node: joint, phase, restZ: 0 };
}
function feeler(
  parent: T.Group, side: -1 | 1,
  x: number, y: number, z: number, reach: number, color: number,
): Joint {
  const joint = pivot(parent, side * x, y, z);
  shape(joint, "cylinder", color,
    [side * reach * 0.29, 0.08, reach * 0.22],
    [0.026, reach * 0.72, 0.026],
    [0.46, 0, -side * 0.58], true);
  shape(joint, "faceted", color,
    [side * reach * 0.60, 0.14, reach * 0.55],
    [0.045, 0.04, 0.052], undefined, true);
  return { node: joint, phase: side, restZ: -side * 0.08 };
}
function cascarrumo(body: T.Group, rig: Rig) {
  const dark = 0x3a332b, shell = 0x66523a,
    ridge = 0x887251, moss = 0x627353;
  shape(body, "round", dark, [0, 0.44, -0.06], [0.42, 0.31, 0.79]);
  // Individual raised articulated dorsal plates: a low, armored woodlouse.
  for (let i = 0; i < 8; i++) {
    const z = -0.70 + i * 0.205;
    const taper = Math.pow(Math.max(0.36, 1 - Math.abs(z) * 0.54), 0.65);
    const plate = pivot(body, 0, 0.50 + taper * 0.13, z);
    shape(plate, "round", i % 3 === 0 ? ridge : shell,
      [0, 0, 0], [0.48 * taper, 0.19 * taper, 0.16], undefined, true);
    shape(plate, "round", moss,
      [0, 0.168 * taper, -0.025], [0.07 * taper, 0.02, 0.13],
      undefined, true);
    rig.armor.push({ node: plate, phase: i, restZ: 0 });
  }
  shape(body, "faceted", dark, [0, 0.34, 0.83], [0.29, 0.23, 0.31]);
  for (const side of [-1, 1] as const) {
    shape(body, "round", 0x191d19,
      [side * 0.22, 0.44, 1.02], [0.065, 0.061, 0.059]);
    rig.feelers.push(feeler(body, side, 0.20, 0.43, 1.04, 0.35, ridge));
    const jaw = pivot(body, side * 0.11, 0.21, 1.08);
    shape(jaw, "pointed", 0xb49764,
      [side * 0.05, -0.035, 0.10], [0.065, 0.20, 0.07],
      [Math.PI / 2.5, 0, -side * 0.24], true);
    rig.jaws.push({ node: jaw, phase: side, restZ: 0 });
    // Twelve pairs of mobile appendages (small but individually modeled).
    for (let i = 0; i < 12; i++)
      rig.legs.push(leg(body, side, -0.68 + i * 0.125,
        0.31, 0.31, dark, 0x9b815c, i * Math.PI * 0.76 + (side < 0 ? Math.PI : 0)));
  }
}
function dunebrio(body: T.Group, rig: Rig) {
  const chitin = 0x493327, bronze = 0x986443,
    seam = 0xc09667, underside = 0x261e1b;
  shape(body, "round", underside, [0, 0.52, -0.13], [0.43, 0.30, 0.76]);
  // Two raised hard elytra with visible central seam and longitudinal ribs.
  for (const side of [-1, 1] as const) {
    shape(body, "round", chitin, [side * 0.21, 0.70, -0.22],
      [0.29, 0.30, 0.64], [0, side * 0.08, 0]);
    shape(body, "round", bronze, [side * 0.24, 0.94, -0.20],
      [0.10, 0.035, 0.49]);
    shape(body, "round", seam, [side * 0.055, 0.92, -0.20],
      [0.022, 0.024, 0.56]);
    for (let i = 0; i < 4; i++) {
      shape(body, "faceted", bronze,
        [side * (0.30 + i * 0.035), 0.79 - i * 0.05, -0.19],
        [0.033, 0.035, 0.51 - i * 0.055]);
    }
  }
  shape(body, "faceted", bronze, [0, 0.53, 0.53], [0.35, 0.30, 0.42]);
  shape(body, "faceted", chitin, [0, 0.44, 0.92], [0.24, 0.20, 0.32]);
  for (const side of [-1, 1] as const) {
    shape(body, "round", 0x1c1613,
      [side * 0.215, 0.53, 1.07], [0.055, 0.065, 0.06]);
    rig.feelers.push(feeler(body, side, 0.15, 0.57, 1.12, 0.42, seam));
    const jaw = pivot(body, side * 0.13, 0.29, 1.09);
    shape(jaw, "pointed", underside, [side * 0.045, -0.02, 0.13],
      [0.085, 0.24, 0.07], [1.17, 0, -side * 0.28], true);
    rig.jaws.push({ node: jaw, phase: side, restZ: 0 });
    // Alternating-tripod insect gait.
    for (let i = 0; i < 3; i++) {
      const joint = leg(body, side, 0.56 - i * 0.47, 0.45,
        0.64, bronze, chitin,
        (i % 2 === 0 ? 0 : Math.PI) + (side < 0 ? Math.PI : 0));
      joint.node.position.x = side * 0.37;
      rig.legs.push(joint);
    }
  }
}
function nivelio(body: T.Group, rig: Rig) {
  const blue = 0x577c8c, dark = 0x29424e,
    white = 0xc9dfde, frost = 0x8fbcc5;
  shape(body, "round", blue, [0, 0.39, -0.16], [0.35, 0.35, 0.54]);
  shape(body, "faceted", dark, [0, 0.40, 0.45], [0.27, 0.25, 0.31]);
  shape(body, "round", frost, [0, 0.63, -0.10], [0.21, 0.09, 0.30]);
  // Frost-like cuticular tufts, geometric rather than painted-on.
  for (let i = 0; i < 13; i++) {
    const a = i * 2.4;
    const z = -0.42 + (i % 5) * 0.17;
    shape(body, "pointed", i % 3 === 0 ? frost : white,
      [Math.cos(a) * 0.24, 0.66 + (i % 3) * 0.03, z],
      [0.041, 0.13 + (i % 4) * 0.025, 0.041], [0, 0, Math.sin(a) * 0.5]);
  }
  for (const side of [-1, 1] as const) {
    shape(body, "round", 0x0b2531,
      [side * 0.215, 0.46, 0.65], [0.069, 0.070, 0.052]);
    shape(body, "round", white,
      [side * 0.225, 0.49, 0.692], [0.023, 0.024, 0.02]);
    rig.feelers.push(feeler(body, side, 0.14, 0.51, 0.66, 0.26, frost));
    for (let i = 0; i < 3; i++)
      rig.legs.push(leg(body, side, 0.37 - i * 0.32, 0.29,
        0.29 + i * 0.055, dark, frost,
        i * Math.PI + (side < 0 ? Math.PI : 0)));
    const jaw = pivot(body, side * 0.1, 0.28, 0.68);
    shape(jaw, "faceted", frost, [side * 0.055, -0.025, 0.085],
      [0.052, 0.06, 0.1], undefined, true);
    rig.jaws.push({ node: jaw, phase: side, restZ: 0 });
  }
  const tail = pivot(body, 0, 0.26, -0.58);
  for (const side of [-1, 1] as const)
    shape(tail, "cylinder", white,
      [side * 0.11, -0.11, -0.20],
      [0.043, 0.37, 0.043], [0.8, 0, side * 0.28], true);
  rig.tail = tail; // furcula: spring-loaded jumping fork
}

export function createDetritivore(kind: Detritivore): T.Group {
  const root = new T.Group();
  const body = new T.Group();
  root.add(body);
  root.name = "Wildhaven_" + kind;
  const rig: Rig = { kind, body, legs: [], feelers: [], jaws: [], armor: [] };
  if (kind === "cascarrumo") cascarrumo(body, rig);
  else if (kind === "dunebrio") dunebrio(body, rig);
  else nivelio(body, rig);
  batchStatic(body);
  root.userData.detritivore = kind;
  root.userData.rig = rig;
  root.userData.previewAnimation = null;
  root.scale.setScalar(kind === "cascarrumo" ? 0.83 : kind === "dunebrio" ? 0.84 : 0.67);
  return root;
}

/** Call once per rendered frame. Does not alter simulation state. */
export function animateDetritivore(
  root: T.Group, time: number, walking: boolean, state: Action,
) {
  const rig = root.userData.rig as Rig | undefined;
  if (!rig) return;
  const override = root.userData.previewAnimation as DetritivoreAnimation | null;
  const animation: DetritivoreAnimation = override ||
    (state === "morto" ? "die"
      : state === "fugir" ? "flee"
      : state === "pastar" ? "feed"
      : state === "descansar" ? "rest"
      : walking ? "walk" : "idle");
  const active = animation === "walk" || animation === "flee";
  const speed = animation === "flee" ? 15 : 9;
  const strength = animation === "flee" ? 0.65 : 0.37;
  const feeding = animation === "feed";
  const defending = animation === "defend";
  const dead = animation === "die";
  const resting = animation === "rest";
  const cycle = time * speed;

  rig.body.position.y = dead ? -0.12
    : defending && rig.kind === "cascarrumo" ? -0.13
    : resting && rig.kind === "dunebrio" ? -0.14
    : rig.kind === "nivelio" && animation === "flee"
      ? Math.pow(Math.max(0, Math.sin(time * 11)), 2) * 0.48
    : active ? 0.024 * Math.sin(cycle * 2) : 0.008 * Math.sin(time * 2.3);
  rig.body.rotation.z = dead ? 0.23
    : defending && rig.kind === "cascarrumo" ? 0.08
    : active ? 0.02 * Math.sin(cycle) : 0;
  rig.body.rotation.x = feeding ? 0.10 + Math.sin(time * 13) * 0.04
    : defending ? -0.10 : 0;
  for (const l of rig.legs) {
    l.node.rotation.x = dead ? 0.65
      : defending ? 0.8
      : active ? Math.sin(cycle + l.phase) * strength
      : feeding ? 0.07 * Math.sin(time * 7 + l.phase) : 0;
    l.node.rotation.z = dead ? 0.55 * Math.sign(l.node.position.x) : l.restZ;
  }
  for (const a of rig.feelers) {
    a.node.rotation.x = dead || defending ? -0.85
      : 0.20 * Math.sin(time * 3.5 + a.phase);
    a.node.rotation.z = a.restZ +
      (dead || defending ? -a.phase * 0.4
        : 0.09 * Math.sin(time * 2.6 + a.phase));
  }
  for (const jaw of rig.jaws) {
    jaw.node.rotation.y = feeding
      ? 0.26 * Math.sin(time * 16 + jaw.phase)
      : active ? 0.06 * Math.sin(cycle + jaw.phase) : 0;
  }
  for (const plate of rig.armor) {
    plate.node.rotation.x = defending
      ? Math.sin((plate.phase / 7) * Math.PI) * -0.42
      : dead ? 0.10 : 0.018 * Math.sin(time * 1.7 + plate.phase * 0.5);
  }
  if (rig.tail)
    rig.tail.rotation.x = dead ? 0.1 : animation === "flee" ? -0.95
      : active ? -0.3 : 0.25 * Math.sin(time * 2.5);
}
