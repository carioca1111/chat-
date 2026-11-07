import * as T from "three";
import type { Action } from "../core/types";

/**
 * ROCANTRAZ — Wildhaven / Auralis
 * A heavily plated, bipedal megacarnivore with a counterbalancing segmented tail.
 * All volumes and details are THREE.Mesh geometry, not billboard textures.
 * A single anatomical rig supports forest / mountain and desert ecotypes.
 * Coordinates: ground y=0, animal faces +Z. Unique named pivots can be baked to glTF.
 */
export type RocantrazVariant = "forest" | "desert";
export const ROCANTRAZ_VARIANTS: readonly RocantrazVariant[] = ["forest", "desert"];
export const ROCANTRAZ_ANIMATIONS = [
  "idle", "walk", "stalk", "run", "charge", "bite", "swipe",
  "roar", "feed", "defend", "rest", "die",
] as const;
export type RocantrazAnimation = (typeof ROCANTRAZ_ANIMATIONS)[number];

type Bone = T.Group;
export interface RocantrazRig {
  variant: RocantrazVariant;
  body: Bone;
  head: Bone;
  jaw: Bone;
  leftLeg: Bone;
  rightLeg: Bone;
  leftArm: Bone;
  rightArm: Bone;
  tail: Bone[];
  crest: Bone[];
  eyes: T.Mesh[];
}
const basicGeometry = {
  body: new T.IcosahedronGeometry(1, 2),
  facet: new T.IcosahedronGeometry(1, 1),
  low: new T.IcosahedronGeometry(1, 0),
  cylinder: new T.CylinderGeometry(1, 1, 1, 9),
  horn: new T.ConeGeometry(1, 1, 9),
  tooth: new T.ConeGeometry(1, 1, 6),
  cube: new T.BoxGeometry(1, 1, 1),
} as const;
type Shape = keyof typeof basicGeometry;
const materialCache = new Map<number, T.MeshStandardMaterial>();
function material(color: number) {
  let mat = materialCache.get(color);
  if (!mat) {
    mat = new T.MeshStandardMaterial({
      color, roughness: 0.92, metalness: 0.02, flatShading: true,
    });
    materialCache.set(color, mat);
  }
  return mat;
}
function mesh(
  parent: T.Object3D, shape: Shape, color: number,
  pos: [number, number, number], scale: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
): T.Mesh {
  const part = new T.Mesh(basicGeometry[shape], material(color));
  part.position.set(...pos);
  part.scale.set(...scale);
  part.rotation.set(...rot);
  part.castShadow = true;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}
function bone(parent: T.Object3D, name: string, x: number, y: number, z: number) {
  const pivot = new T.Group();
  pivot.name = name;
  pivot.position.set(x, y, z);
  parent.add(pivot);
  return pivot;
}
function spike(
  parent: T.Object3D, color: number, pos: [number, number, number],
  size: [number, number, number], rot: [number, number, number] = [0, 0, 0],
) {
  return mesh(parent, "horn", color, pos, size, rot);
}
function claws(
  parent: T.Object3D, count: number, x: number, y: number, z: number,
  spread: number, color: number, length: number,
) {
  for (let i = 0; i < count; i++) {
    const q = i - (count - 1) / 2;
    mesh(parent, "facet", 0x262723,
      [x + q * spread, y, z], [0.11, 0.11, 0.19]);
    spike(parent, color,
      [x + q * spread, y - 0.12, z + length * 0.37],
      [0.10, length, 0.11], [Math.PI * 0.48, 0, q * 0.04]);
  }
}
function plates(parent: T.Object3D, palette: Palette) {
  // Angular overlapping breast scales add articulation-friendly silhouette.
  for (let row = 0; row < 4; row++) {
    const y = 3.92 - row * 0.48;
    for (const side of [-1, 1]) {
      mesh(parent, "facet", row % 2 ? palette.plate : palette.plateLight,
        [side * (0.35 + row * 0.09), y, 1.10 - row * 0.035],
        [0.55, 0.30, 0.15], [0.04, side * -0.13, side * 0.07]);
    }
  }
  mesh(parent, "facet", palette.dark, [0, 3.37, 1.25],
    [0.27, 0.57, 0.11]);
  // Bony dorsal ridge (natural plating, not a copied monster emblem).
  for (let i = 0; i < 7; i++) {
    const z = 0.83 - i * 0.41;
    const height = 0.40 + Math.sin((i + 1) * Math.PI / 8) * 0.57;
    spike(parent, palette.spine,
      [0, 4.22 - i * 0.12 + height * 0.50, z],
      [0.37, height, 0.32],
      [-0.36 - i * 0.07, 0, 0]);
  }
}
interface Palette {
  skin: number; belly: number; plate: number; plateLight: number;
  dark: number; spine: number; horn: number; claws: number;
  eye: number; accent: number; shadow: number;
}
const palettes: Record<RocantrazVariant, Palette> = {
  forest: {
    skin: 0x5b6952, belly: 0x8e9170, plate: 0x69745a,
    plateLight: 0x9ca57d, dark: 0x303b35, spine: 0x7a8464,
    horn: 0xb3ad8c, claws: 0xd7c7a5, eye: 0xeac166,
    accent: 0x48674b, shadow: 0x34473d,
  },
  desert: {
    skin: 0xb47d59, belly: 0xc7aa7e, plate: 0xb76c45,
    plateLight: 0xd6a571, dark: 0x53372f, spine: 0xa5573d,
    horn: 0xe0c39a, claws: 0xe4c79e, eye: 0xffb66c,
    accent: 0x92513e, shadow: 0x7c4d3a,
  },
};
function buildLeg(root: Bone, name: string, side: -1 | 1, p: Palette) {
  const hip = bone(root, name, side * 0.88, 2.18, -0.53);
  mesh(hip, "body", p.skin, [side * 0.09, -0.52, -0.19],
    [0.57, 0.92, 0.62], [side * -0.06, 0, side * 0.06]);
  mesh(hip, "facet", p.plate, [side * 0.28, -0.13, -0.32],
    [0.46, 0.62, 0.35]);
  mesh(hip, "body", p.skin, [side * 0.15, -1.24, 0.23],
    [0.37, 0.65, 0.44], [-0.17, 0, 0]);
  mesh(hip, "facet", p.dark, [side * 0.13, -1.51, 0.25],
    [0.34, 0.38, 0.38]);
  mesh(hip, "body", p.skin, [side * 0.15, -1.89, 0.50],
    [0.42, 0.21, 0.78]);
  mesh(hip, "facet", p.plateLight, [side * 0.15, -1.73, 0.70],
    [0.37, 0.16, 0.33]);
  claws(hip, 3, side * 0.15, -1.93, 1.00, 0.26, p.claws, 0.40);
  return hip;
}
function buildArm(root: Bone, name: string, side: -1 | 1, p: Palette) {
  const arm = bone(root, name, side * 1.26, 3.75, 0.70);
  mesh(arm, "body", p.skin, [side * 0.19, -0.54, 0.20],
    [0.60, 0.89, 0.55], [0, 0, side * 0.22]);
  mesh(arm, "facet", p.plate, [side * 0.32, -0.06, 0.12],
    [0.69, 0.45, 0.53], [0.2, 0, side * -0.13]);
  mesh(arm, "body", p.skin, [side * 0.43, -1.23, 0.64],
    [0.40, 0.67, 0.42], [0.31, 0, side * -0.12]);
  mesh(arm, "facet", p.dark, [side * 0.44, -1.64, 0.78],
    [0.44, 0.30, 0.36]);
  claws(arm, 4, side * 0.44, -1.83, 1.02, 0.20, p.claws, 0.36);
  for (let i = 0; i < 3; i++)
    spike(arm, p.spine,
      [side * (0.32 + i * 0.09), -0.13 - i * 0.22, -0.40],
      [0.17, 0.31, 0.15], [-0.63, 0, side * 0.35]);
  return arm;
}
function buildHead(root: Bone, p: Palette, rig: RocantrazRig) {
  const head = bone(root, "Rocantraz_Head", 0, 4.25, 0.94);
  mesh(head, "body", p.skin, [0, 0.20, 0.36],
    [0.80, 0.63, 0.88]);
  mesh(head, "facet", p.plate, [0, 0.66, 0.38],
    [0.68, 0.24, 0.64], [-0.11, 0, 0]);
  mesh(head, "body", p.skin, [0, -0.02, 1.12],
    [0.55, 0.30, 0.75]);
  mesh(head, "facet", p.belly, [0, -0.18, 1.52],
    [0.44, 0.19, 0.35]);
  mesh(head, "facet", p.dark, [0, -0.14, 1.83],
    [0.29, 0.14, 0.19]);
  for (const side of [-1, 1] as const) {
    mesh(head, "facet", p.plateLight,
      [side * 0.60, 0.32, 0.68], [0.28, 0.29, 0.52],
      [0.03, side * 0.07, side * 0.22]);
    mesh(head, "facet", p.shadow,
      [side * 0.64, 0.18, 1.10], [0.19, 0.15, 0.28]);
    rig.eyes.push(mesh(head, "facet", p.eye,
      [side * 0.70, 0.19, 1.16], [0.089, 0.081, 0.12]));
    spike(head, p.horn,
      [side * 0.60, 0.88, 0.39], [0.21, 0.69, 0.21],
      [-0.20, 0, -side * 0.30]);
    spike(head, p.spine,
      [side * 0.68, 0.41, -0.16], [0.19, 0.55, 0.22],
      [-0.36, 0, side * 0.36]);
  }
  const jaw = bone(head, "Rocantraz_Jaw", 0, -0.18, 0.75);
  mesh(jaw, "body", p.belly, [0, -0.26, 0.68],
    [0.51, 0.19, 0.77]);
  mesh(jaw, "facet", p.dark, [0, -0.10, 0.62],
    [0.45, 0.045, 0.62]);
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 5; i++) {
      const z = 0.52 + i * 0.24;
      spike(head, p.claws, [side * 0.42, -0.30, z + 0.76],
        [0.065, 0.20 + i * 0.015, 0.065], [Math.PI, 0, 0]);
      spike(jaw, p.claws, [side * 0.38, -0.10, z],
        [0.070, 0.17, 0.07]);
    }
  }
  return { head, jaw };
}
function buildTail(root: Bone, p: Palette) {
  const joints: Bone[] = [];
  let parent = root;
  for (let i = 0; i < 6; i++) {
    const tail = bone(parent, "Rocantraz_Tail_" + i,
      0, i === 0 ? 2.80 : -0.14, i === 0 ? -1.03 : -0.69);
    const taper = 1 - i * 0.125;
    mesh(tail, "body", i % 2 ? p.skin : p.plate,
      [0, -0.08, -0.40], [0.55 * taper, 0.50 * taper, 0.67]);
    mesh(tail, "facet", p.dark,
      [0, 0.20 * taper, -0.38], [0.38 * taper, 0.12, 0.51]);
    spike(tail, p.spine, [0, 0.35 * taper, -0.37],
      [0.24 * taper, 0.63 * taper, 0.25 * taper],
      [-0.32, 0, 0]);
    if (i >= 3)
      for (const side of [-1, 1] as const)
        spike(tail, p.horn,
          [side * 0.30 * taper, 0.14, -0.51],
          [0.13 * taper, 0.35 * taper, 0.13 * taper],
          [-0.52, 0, side * 0.34]);
    joints.push(tail);
    parent = tail;
  }
  spike(parent, p.horn, [0, -0.1, -0.84],
    [0.26, 1.03, 0.25], [-Math.PI * 0.45, 0, 0]);
  return joints;
}

export function createRocantraz(variant: RocantrazVariant): T.Group {
  const palette = palettes[variant];
  const model = new T.Group();
  model.name = "Wildhaven_Rocantraz_" + variant;
  // Real-world concept is 8–12m long; render scale is normalized to Alpha 0.1.
  const body = bone(model, "Rocantraz_Body", 0, 0, 0);
  mesh(body, "body", palette.skin, [0, 3.17, 0.05],
    [1.46, 1.47, 1.19]);
  mesh(body, "body", palette.belly, [0, 2.55, 0.54],
    [1.13, 1.17, 0.87]);
  mesh(body, "body", palette.skin, [0, 2.17, -0.54],
    [1.42, 0.86, 1.00]);
  mesh(body, "facet", palette.dark, [0, 3.31, -1.02],
    [0.97, 1.00, 0.43]);
  plates(body, palette);
  const rig: RocantrazRig = {
    variant, body, head: body, jaw: body,
    leftLeg: body, rightLeg: body,
    leftArm: body, rightArm: body,
    tail: [], crest: [], eyes: [],
  };
  rig.leftLeg = buildLeg(body, "Rocantraz_LeftLeg", -1, palette);
  rig.rightLeg = buildLeg(body, "Rocantraz_RightLeg", 1, palette);
  rig.leftArm = buildArm(body, "Rocantraz_LeftArm", -1, palette);
  rig.rightArm = buildArm(body, "Rocantraz_RightArm", 1, palette);
  ({ head: rig.head, jaw: rig.jaw } = buildHead(body, palette, rig));
  rig.tail = buildTail(body, palette);

  if (variant === "forest") {
    // Natural growth in seams: geometric lichen islands, NOT texture-only moss.
    for (let i = 0; i < 16; i++) {
      const angle = i * 2.4;
      const level = i % 4;
      mesh(body, "low", i % 3 ? palette.accent : 0x788c55,
        [Math.sin(angle) * (1.23 - level * 0.08),
          3.05 + Math.cos(i * 2.1) * 0.95,
          Math.cos(angle) * 0.76],
        [0.17 + (i % 3) * 0.04, 0.055, 0.25]);
    }
    for (const side of [-1, 1] as const)
      spike(body, palette.horn,
        [side * 1.17, 4.29, -0.27], [0.28, 0.78, 0.25],
        [-0.31, 0, side * -0.41]);
  } else {
    // Sand-burrowing / heat-reflective osteoderms and broad horns.
    for (let i = 0; i < 5; i++) {
      const z = 0.87 - i * 0.41;
      for (const side of [-1, 1] as const)
        mesh(body, "facet", i % 2 ? palette.plate : palette.plateLight,
          [side * (1.06 - i * 0.05), 4.24 - i * 0.10, z],
          [0.42, 0.18, 0.29], [0, 0, side * 0.22]);
    }
    for (const side of [-1, 1] as const)
      spike(rig.head, palette.horn,
        [side * 0.47, 0.91, -0.03], [0.26, 0.87, 0.27],
        [-0.49, 0, side * 0.46]);
  }
  model.userData.rocantraz = variant;
  model.userData.rig = rig;
  model.userData.previewAnimation = null;
  model.scale.setScalar(1.12);
  return model;
}
function animationForState(action: Action, walking: boolean): RocantrazAnimation {
  if (action === "morto") return "die";
  if (action === "atacar") return "bite";
  if (action === "perseguir") return "run";
  if (action === "pastar") return "feed";
  if (action === "descansar") return "rest";
  return walking ? "walk" : "idle";
}
/** Changes only visual bone transforms; no RNG, no world mutations. */
export function animateRocantraz(
  model: T.Group, time: number, walking: boolean, action: Action,
) {
  const rig = model.userData.rig as RocantrazRig | undefined;
  if (!rig) return;
  const explicit = model.userData.previewAnimation as RocantrazAnimation | null;
  const a = explicit || animationForState(action, walking);
  const running = a === "run" || a === "charge";
  const moving = running || a === "walk" || a === "stalk";
  const stride = running ? 8 : a === "stalk" ? 2.5 : 4.2;
  const t = time * stride;
  const amp = running ? 0.53 : a === "stalk" ? 0.16 : 0.34;
  const roar = a === "roar", bite = a === "bite";
  const swipe = a === "swipe", feed = a === "feed";
  const dead = a === "die", rest = a === "rest", defend = a === "defend";
  const attackPulse = (Math.sin(time * 9) + 1) * 0.5;
  rig.body.position.y = dead ? -0.44 : rest ? -0.19
    : moving ? Math.abs(Math.sin(t)) * 0.09 : Math.sin(time * 1.4) * 0.035;
  rig.body.rotation.x = dead ? -0.22 : a === "stalk" ? 0.18
    : a === "charge" ? 0.14 : defend ? -0.09 : 0;
  rig.body.rotation.z = dead ? 0.49 : moving ? Math.sin(t) * 0.025 : 0;
  rig.leftLeg.rotation.x = dead ? -0.35
    : moving ? Math.sin(t) * amp : rest ? -0.38 : 0;
  rig.rightLeg.rotation.x = dead ? 0.35
    : moving ? -Math.sin(t) * amp : rest ? -0.38 : 0;
  rig.leftArm.rotation.x = dead ? 0.65
    : swipe ? -1.4 * attackPulse
    : moving ? -Math.sin(t) * amp * 0.53
    : defend ? -0.43 : 0.08 * Math.sin(time * 1.2);
  rig.rightArm.rotation.x = dead ? 0.45
    : swipe ? -1.6 * (1 - attackPulse)
    : moving ? Math.sin(t) * amp * 0.53
    : defend ? -0.43 : 0.08 * Math.sin(time * 1.2 + 1.3);
  rig.leftArm.rotation.z = swipe ? -0.45 : 0;
  rig.rightArm.rotation.z = swipe ? 0.45 : 0;
  rig.head.rotation.x = roar ? -0.34 : bite ? 0.38 * attackPulse
    : feed ? 0.33 : dead ? 0.40
    : a === "stalk" ? 0.05 : 0.04 * Math.sin(time * 1.6);
  rig.head.rotation.y = dead ? 0.17 : 0.06 * Math.sin(time * 0.8);
  rig.jaw.rotation.x = roar ? 0.82 : bite ? 0.58 * attackPulse
    : feed ? 0.28 * (Math.sin(time * 6) + 1) / 2 : dead ? 0.18 : 0.02;
  rig.tail.forEach((b, i) => {
    b.rotation.y = dead ? 0.08 : Math.sin(time * (running ? 3 : 1.2) - i * 0.46)
      * (moving ? 0.16 : 0.075);
    b.rotation.x = dead ? 0.19 : (a === "charge" ? 0.06 : 0.025)
      + Math.sin(time * 1.1 - i * 0.33) * 0.04;
  });
  rig.eyes.forEach((e, i) => {
    e.scale.y = 0.081 * (a === "rest" ? 0.2
      : a === "stalk" ? 0.65 : 1);
    e.rotation.z = i === 0 ? 0.1 : -0.1;
  });
}
export function rocantrazBones(rig: RocantrazRig): Bone[] {
  return [rig.body, rig.head, rig.jaw,
    rig.leftLeg, rig.rightLeg, rig.leftArm, rig.rightArm, ...rig.tail];
}

/**
 * Bake sampled joint poses to Three.js AnimationClips.
 * These tracks can be exported by GLTFExporter as real glTF animations,
 * including jaw, limbs, head, breathing and the segmented tail.
 */
export function rocantrazClips(model: T.Group): T.AnimationClip[] {
  const rig = model.userData.rig as RocantrazRig;
  const bones = rocantrazBones(rig);
  const previous = model.userData.previewAnimation;
  const clips: T.AnimationClip[] = [];
  for (const animation of ROCANTRAZ_ANIMATIONS) {
    const duration = animation === "walk" ? 1.5
      : animation === "run" || animation === "charge" ? 0.8
      : animation === "roar" ? 2.0 : animation === "die" ? 1.0 : 2.4;
    const frames = 25;
    const times: number[] = [];
    const rotations = new Map<string, number[]>();
    const positions = new Map<string, number[]>();
    bones.forEach((b) => {
      rotations.set(b.name, []);
      positions.set(b.name, []);
    });
    for (let i = 0; i < frames; i++) {
      const t = i * duration / (frames - 1);
      times.push(t);
      model.userData.previewAnimation = animation;
      animateRocantraz(model, t, true, "explorar");
      bones.forEach((b) => {
        const q = b.quaternion;
        rotations.get(b.name)!.push(q.x, q.y, q.z, q.w);
        const p = b.position;
        positions.get(b.name)!.push(p.x, p.y, p.z);
      });
    }
    const tracks: T.KeyframeTrack[] = [];
    bones.forEach((b) => {
      tracks.push(new T.QuaternionKeyframeTrack(
        b.name + ".quaternion", times, rotations.get(b.name)!,
      ));
      tracks.push(new T.VectorKeyframeTrack(
        b.name + ".position", times, positions.get(b.name)!,
      ));
    });
    clips.push(new T.AnimationClip("Rocantraz_" + animation, duration, tracks));
  }
  model.userData.previewAnimation = previous;
  animateRocantraz(model, 0, false, "explorar");
  return clips;
}
