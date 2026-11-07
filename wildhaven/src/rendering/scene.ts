import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { World } from "../core/types";
import { ChunkRenderer } from "../chunks/renderer";
import { animal, human } from "./models";
import { animateDetritivore, isDetritivore } from "./detritivores";
import { village, workers } from "../village/render";
import { height, MIN, MAX } from "../terrain/fields";
export class View {
  scene = new T.Scene();
  camera = new T.OrthographicCamera(-60, 60, 40, -40, 0.1, 700);
  renderer: T.WebGLRenderer;
  controls: OrbitControls;
  chunks: ChunkRenderer;
  actors = new Map<string, T.Group>();
  workers = workers();
  followId: string | null = null;
  selected: string | null = null;
  fps = 0;
  private frames = 0;
  private fpsTime = 0;
  private previous = new Map<string, { x: number; z: number }>();
  private ring: T.Mesh;
  private water: T.Mesh;
  private light: T.DirectionalLight;
  constructor(
    public w: World,
    canvas: HTMLCanvasElement,
    select: (id: string) => void,
  ) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.scene.background = new T.Color(0xaebfb2);
    this.scene.fog = new T.Fog(0xaebfb2, 170, 340);
    this.camera.position.set(70, 75, 90);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(5, 2.8, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = false;
    this.controls.minZoom = 0.65;
    this.controls.maxZoom = 3.5;
    this.controls.mouseButtons = {
      LEFT: T.MOUSE.PAN,
      MIDDLE: T.MOUSE.DOLLY,
      RIGHT: T.MOUSE.PAN,
    };
    this.scene.add(new T.HemisphereLight(0xe3eddf, 0x536446, 2.1));
    this.light = new T.DirectionalLight(0xffe4b1, 3.2);
    this.light.position.set(-30, 70, 30);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    Object.assign(this.light.shadow.camera, {
      left: -85,
      right: 85,
      top: 85,
      bottom: -85,
      near: 1,
      far: 200,
    });
    this.light.shadow.bias = -0.0005;
    this.light.shadow.normalBias = 0.5;
    this.scene.add(this.light, this.light.target);
    this.water = new T.Mesh(
      new T.PlaneGeometry(MAX - MIN, MAX - MIN),
      new T.MeshStandardMaterial({
        color: 0x5b9e9c,
        roughness: 0.25,
        metalness: 0.18,
        transparent: true,
        opacity: 0.88,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set((MAX + MIN) / 2, 0, (MAX + MIN) / 2);
    this.scene.add(this.water);
    this.scene.add(village(w.seed));
    this.workers.forEach((x) => this.scene.add(x));
    this.chunks = new ChunkRenderer(this.scene, w);
    this.ring = new T.Mesh(
      new T.RingGeometry(1.5, 1.65, 48),
      new T.MeshBasicMaterial({ color: 0xf1cd7e, side: T.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);
    let down = { x: 0, y: 0 };
    canvas.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const ray = new T.Raycaster();
      ray.setFromCamera(
        new T.Vector2(
          (e.clientX / innerWidth) * 2 - 1,
          (-e.clientY / innerHeight) * 2 + 1,
        ),
        this.camera,
      );
      for (const hit of ray.intersectObjects(this.scene.children, true)) {
        const id =
          hit.object.userData.id ||
          hit.object.userData.treeIds?.[hit.instanceId ?? -1];
        if (id) {
          select(id);
          return;
        }
      }
    });
    this.controls.addEventListener("start", () => (this.followId = null));
    addEventListener("resize", () => this.resize());
    this.resize();
  }
  resize() {
    const a = innerWidth / innerHeight;
    this.camera.left = -43 * a;
    this.camera.right = 43 * a;
    this.camera.top = 43;
    this.camera.bottom = -43;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
  focus(x: number, z: number) {
    const delta = new T.Vector3(x, this.controls.target.y, z).sub(
      this.controls.target,
    );
    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.followId = null;
  }
  quality(low: boolean) {
    this.renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = !low;
  }
  render(dt: number) {
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime > 1) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
    }
    const entities = [...this.w.creatures, ...this.w.hunters];
    const follow = entities.find((e) => e.id === this.followId);
    if (follow) {
      const delta = new T.Vector3(follow.x, this.controls.target.y, follow.z)
        .sub(this.controls.target)
        .multiplyScalar(0.08);
      this.camera.position.add(delta);
      this.controls.target.add(delta);
    }
    this.controls.update();
    const tx = Math.max(MIN + 20, Math.min(MAX - 20, this.controls.target.x)),
      tz = Math.max(MIN + 20, Math.min(MAX - 20, this.controls.target.z));
    if (tx !== this.controls.target.x || tz !== this.controls.target.z)
      this.focus(tx, tz);
    this.chunks.update(tx, tz);
    this.light.position.set(tx - 30, 70, tz + 30);
    this.light.target.position.set(tx, 0, tz);
    for (const e of entities) {
      const visible = Math.abs(e.x - tx) < 105 && Math.abs(e.z - tz) < 105;
      let mesh = this.actors.get(e.id);
      if (!visible) {
        if (mesh) mesh.visible = false;
        continue;
      }
      if (!mesh) {
        mesh = "species" in e ? animal(e.species) : human();
        mesh.traverse((m) => (m.userData.id = e.id));
        this.actors.set(e.id, mesh);
        this.scene.add(mesh);
      }
      mesh.visible = true;
      const old = this.previous.get(e.id);
      const moving = old && Math.hypot(e.x - old.x, e.z - old.z) > 0.0001;
      if (moving) mesh.userData.lastMove = this.w.time;
      const walking = this.w.time - (mesh.userData.lastMove ?? -1) < 0.3;
      if (moving) mesh.rotation.y = Math.atan2(e.x - old!.x, e.z - old!.z);
      this.previous.set(e.id, { x: e.x, z: e.z });
      const ground = height(e.x, e.z, this.w.seed);
      mesh.position.lerp(
        new T.Vector3(e.x, Math.max(ground, 0.3), e.z),
        Math.min(1, dt * 16),
      );
      if (mesh.position.distanceTo(new T.Vector3(e.x, ground, e.z)) > 20)
        mesh.position.set(e.x, ground, e.z);
      mesh.rotation.z = e.hp <= 0 ? Math.PI / 2 : 0;
      mesh.children.forEach((m) => {
        if (m.userData.leg)
          m.rotation.x = walking
            ? Math.sin(this.w.time * 10 + m.userData.phase) * 0.45
            : 0;
        if (m.name === "weapon" && "equipment" in e) m.visible = !!e.equipment;
      });
      if ("species" in e && isDetritivore(e.species))
        animateDetritivore(mesh, this.w.time, !!walking, e.state);
      if (e.cooldown > 0.9 && e.hp > 0)
        mesh.rotation.x = Math.sin(e.cooldown * 9) * 0.12;
      else mesh.rotation.x = 0;
    }
    this.workers.forEach((m, i) => {
      const t = this.w.time * 0.12 + i * Math.PI,
        x = 3 + Math.sin(t) * 7,
        z = 2 + Math.cos(t) * 5;
      m.position.set(x, height(x, z, this.w.seed), z);
      m.rotation.y = -t;
    });
    const selected = entities.find((e) => e.id === this.selected);
    this.ring.visible = !!selected;
    if (selected)
      this.ring.position.set(
        selected.x,
        height(selected.x, selected.z, this.w.seed) + 0.12,
        selected.z,
      );
    this.water.position.y = 0.025 + Math.sin(this.w.time * 0.7) * 0.025;
    this.renderer.render(this.scene, this.camera);
  }
}
