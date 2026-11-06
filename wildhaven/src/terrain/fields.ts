import { hash, clamp } from "../core/random";
export const CHUNK = 48,
  MIN = -144,
  MAX = 192;
const smooth = (t: number) => t * t * (3 - 2 * t);
export function noise(x: number, z: number, seed: number) {
  const a = Math.floor(x),
    b = Math.floor(z),
    u = smooth(x - a),
    v = smooth(z - b);
  return (
    (hash(a, b, seed) * (1 - u) + hash(a + 1, b, seed) * u) * (1 - v) +
    (hash(a, b + 1, seed) * (1 - u) + hash(a + 1, b + 1, seed) * u) * v
  );
}
export function riverX(z: number) {
  return 64 + 12 * Math.sin(z * 0.022);
}
export function field(x: number, z: number, seed: number) {
  return {
    moisture: noise(x / 100, z / 100, seed + 30),
    temperature: noise(x / 180, z / 180, seed + 80),
    vegetation: noise(x / 45, z / 45, seed + 1),
  };
}
export function height(x: number, z: number, seed: number) {
  const n =
    noise(x / 55, z / 55, seed) * 6 + noise(x / 19, z / 19, seed + 2) * 1.6;
  const ridge =
    Math.pow(clamp((z - 45) / 100, 0, 1), 2) *
    (12 + noise(x / 35, z / 35, seed + 8) * 18);
  const raw = n + ridge;
  const village = clamp((Math.hypot(x, z) - 16) / 17, 0, 1);
  const land = 2.8 * (1 - village) + raw * village;
  const river = Math.abs(x - riverX(z));
  const lake = Math.hypot((x - 91) * 0.8, z + 83);
  const shore = Math.min(river - 3.5, lake - 13);
  return (
    land * smooth(clamp(shore / 7, 0, 1)) -
    0.95 * (1 - smooth(clamp(shore / 7, 0, 1)))
  );
}
export function road(x: number, z: number) {
  return (
    Math.abs(z - (10 + Math.sin(x * 0.025) * 2)) < 2.2 ||
    (Math.abs(x + 3) < 1.7 && Math.abs(z) < 19)
  );
}
export function walkable(x: number, z: number, seed: number) {
  return (
    x > MIN + 2 &&
    x < MAX - 2 &&
    z > MIN + 2 &&
    z < MAX - 2 &&
    (height(x, z, seed) > 0.15 ||
      Math.abs(z - (10 + Math.sin(x * 0.025) * 2)) < 2.4)
  );
}
export const chunkKey = (x: number, z: number) =>
  `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
export function trees(cx: number, cz: number, seed: number) {
  const result: {
    id: string;
    x: number;
    z: number;
    scale: number;
    kind: number;
  }[] = [];
  for (let i = 0; i < 38; i++) {
    const x = cx * CHUNK + hash(i, cx * 811 + cz, seed) * CHUNK,
      z = cz * CHUNK + hash(i + 140, cz * 907 + cx, seed) * CHUNK;
    const f = field(x, z, seed);
    if (
      height(x, z, seed) < 1 ||
      road(x, z) ||
      Math.hypot(x, z) < 20 ||
      f.vegetation < 0.22
    )
      continue;
    result.push({
      id: `tree:${cx}:${cz}:${i}`,
      x,
      z,
      scale: 0.7 + hash(i + 400, cx + cz, seed) * 0.9,
      kind: f.moisture > 0.47 ? 0 : 1,
    });
  }
  return result;
}
