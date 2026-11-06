export function random(w: { rng: number }) {
  let x = w.rng | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  w.rng = x >>> 0;
  return w.rng / 4294967296;
}
export function hash(x: number, z: number, seed: number) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
