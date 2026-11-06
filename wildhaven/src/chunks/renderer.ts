import * as T from "three";
import { CHUNK, height, road, field, trees, MIN, MAX } from "../terrain/fields";
import { hash } from "../core/random";
import type { World } from "../core/types";
import { mat } from "../rendering/models";
const stoneGeo = new T.IcosahedronGeometry(1, 1),
  trunkGeo = new T.CylinderGeometry(0.16, 0.29, 3.6, 7),
  leafGeo = new T.IcosahedronGeometry(1, 2),
  pineGeo = new T.ConeGeometry(1, 1, 10);
const scratch = new T.Object3D();
export class ChunkRenderer {
  chunks = new Map<string, T.Group>();
  queue: { x: number; z: number; lod: number; key: string }[] = [];
  private signature = "";
  private environmentCount = -1;
  constructor(
    private scene: T.Scene,
    private world: World,
  ) {}
  update(x: number, z: number) {
    const cx = Math.floor(x / CHUNK),
      cz = Math.floor(z / CHUNK),
      sig = `${cx},${cz}`;
    const count = Object.keys(this.world.environment).length;
    if (sig !== this.signature || count !== this.environmentCount) {
      this.signature = sig;
      this.environmentCount = count;
      const wanted = new Map<
        string,
        { x: number; z: number; lod: number; key: string }
      >();
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++) {
          const x = cx + dx,
            z = cz + dz;
          if (
            x * CHUNK < MIN ||
            x * CHUNK >= MAX ||
            z * CHUNK < MIN ||
            z * CHUNK >= MAX
          )
            continue;
          const lod = Math.max(Math.abs(dx), Math.abs(dz));
          const key = `${x},${z}`;
          wanted.set(key, { x, z, lod, key });
        }
      for (const [key, g] of this.chunks)
        if (!wanted.has(key)) {
          this.scene.remove(g);
          g.traverse((o) => {
            if (o instanceof T.Mesh && o.userData.owned) o.geometry.dispose();
            if (o instanceof T.InstancedMesh) o.dispose();
          });
          this.chunks.delete(key);
        }
      this.queue = [...wanted.values()]
        .filter((v) => {
          const old = this.chunks.get(v.key);
          return (
            !old ||
            old.userData.lod !== v.lod ||
            old.userData.environmentCount !== count
          );
        })
        .sort((a, b) => a.lod - b.lod);
    }
    // At most two chunks generated per frame; logical state never unloaded.
    for (let i = 0; i < 2 && this.queue.length; i++) {
      const q = this.queue.shift()!,
        g = this.build(q.x, q.z, q.lod);
      g.userData.lod = q.lod;
      g.userData.environmentCount = this.environmentCount;
      const old = this.chunks.get(q.key);
      this.scene.add(g);
      this.chunks.set(q.key, g);
      if (old) {
        this.scene.remove(old);
        old.traverse((o) => {
          if (o instanceof T.Mesh && o.userData.owned) o.geometry.dispose();
          if (o instanceof T.InstancedMesh) o.dispose();
        });
      }
    }
  }
  build(cx: number, cz: number, lod: number) {
    const g = new T.Group(),
      segments = 24;
    const geom = new T.PlaneGeometry(CHUNK, CHUNK, segments, segments);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position;
    const colors = [];
    const color = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (cx + 0.5) * CHUNK,
        z = pos.getZ(i) + (cz + 0.5) * CHUNK,
        h = height(x, z, this.world.seed),
        f = field(x, z, this.world.seed);
      pos.setXYZ(i, x, h, z);
      color.set(
        h < 0.4
          ? 0xb6ad7f
          : road(x, z)
            ? 0xb39b70
            : h > 14
              ? 0x7c8676
              : f.moisture > 0.5
                ? 0x658367
                : 0x869567,
      );
      const tint =
        0.91 + hash(Math.floor(x), Math.floor(z), this.world.seed) * 0.17;
      color.multiplyScalar(tint);
      colors.push(color.r, color.g, color.b);
    }
    geom.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    const terrain = new T.Mesh(geom, terrainMat);
    terrain.receiveShadow = true;
    terrain.userData.owned = true;
    g.add(terrain);
    const all = trees(cx, cz, this.world.seed),
      living = all.filter(
        (t) =>
          !this.world.environment[t.id] &&
          (lod < 2 || hash(Math.round(t.x), Math.round(t.z), 7) > 0.55),
      );
    const trunks = new T.InstancedMesh(trunkGeo, mat(0x695540), living.length),
      crowns = new T.InstancedMesh(leafGeo, mat(0x52765c), living.length * 3),
      pines = new T.InstancedMesh(pineGeo, mat(0x3f6958), living.length * 3);
    let leafN = 0,
      pineN = 0;
    living.forEach((t, i) => {
      const y = height(t.x, t.z, this.world.seed);
      scratch.position.set(t.x, y + 1.8 * t.scale, t.z);
      scratch.scale.setScalar(t.scale);
      scratch.rotation.set(0, 0, 0);
      scratch.updateMatrix();
      trunks.setMatrixAt(i, scratch.matrix);
      for (let j = 0; j < 3; j++) {
        scratch.position.set(
          t.x + (j === 1 ? 0.9 : j === 2 ? -0.8 : 0) * t.scale,
          y + (3.4 + j * 0.7) * t.scale,
          t.z + (j === 2 ? 0.7 : 0),
        );
        scratch.scale.set(
          (2 - j * 0.27) * t.scale,
          (t.kind ? 2.5 : 1.45) * t.scale,
          (1.8 - j * 0.15) * t.scale,
        );
        scratch.rotation.y = hash(i, j, 4) * 6;
        scratch.updateMatrix();
        const mesh = t.kind ? pines : crowns;
        const n = t.kind ? pineN++ : leafN++;
        mesh.setMatrixAt(n, scratch.matrix);
        mesh.setColorAt(
          n,
          new T.Color().setHSL(
            0.29 + hash(i, j, 6) * 0.09,
            0.22 + hash(j, i, 9) * 0.15,
            0.25 + hash(i, j, 8) * 0.11,
          ),
        );
      }
    });
    crowns.count = leafN;
    pines.count = pineN;
    for (const mesh of [trunks, crowns, pines]) {
      mesh.castShadow = lod < 2;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.userData.treeIds =
        mesh === trunks
          ? living.map((t) => t.id)
          : living
              .flatMap((t) => [t.id, t.id, t.id])
              .filter(
                (_, i) =>
                  living[Math.floor(i / 3)].kind === (mesh === pines ? 1 : 0),
              );
      g.add(mesh);
    }
    const stumps = all.filter((t) => this.world.environment[t.id]);
    if (stumps.length) {
      const m = new T.InstancedMesh(trunkGeo, mat(0x9e8154), stumps.length);
      stumps.forEach((t, i) => {
        scratch.position.set(t.x, height(t.x, t.z, this.world.seed) + 0.2, t.z);
        scratch.scale.set(t.scale, 0.12, t.scale);
        scratch.updateMatrix();
        m.setMatrixAt(i, scratch.matrix);
      });
      g.add(m);
    }
    const rocks = new T.InstancedMesh(
      stoneGeo,
      mat(0x858b7c),
      lod === 2 ? 4 : 12,
    );
    for (let i = 0; i < rocks.count; i++) {
      const x = cx * CHUNK + hash(i + 600, cz, this.world.seed) * CHUNK,
        z = cz * CHUNK + hash(i + 700, cx, this.world.seed) * CHUNK;
      const s =
        Math.hypot(x, z) < 20 || road(x, z) ? 0 : 0.4 + hash(i, cz, 122) * 1.9;
      scratch.position.set(x, height(x, z, this.world.seed) + s * 0.28, z);
      scratch.rotation.set(0.2, hash(i, cx, 42) * 6, 0.3);
      scratch.scale.set(s, s * 0.7, s * 0.8);
      scratch.updateMatrix();
      rocks.setMatrixAt(i, scratch.matrix);
    }
    rocks.castShadow = lod < 2;
    g.add(rocks);
    return g;
  }
}
const terrainMat = new T.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
});
