import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  animateDetritivore, createDetritivore,
  type Detritivore, type DetritivoreAnimation,
} from "./rendering/detritivores";

const canvas = document.querySelector<HTMLCanvasElement>("#preview")!;
const renderer = new T.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new T.Scene();
scene.background = new T.Color(0x293b39);
scene.fog = new T.Fog(0x293b39, 17, 40);
const camera = new T.PerspectiveCamera(43, 1, 0.1, 80);
camera.position.set(5.6, 4, 11.8);
const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0.7, 0);
orbit.enableDamping = true;
orbit.minDistance = 4;
orbit.maxDistance = 24;
orbit.maxPolarAngle = Math.PI * 0.48;
orbit.update();

scene.add(new T.HemisphereLight(0xe9f5f1, 0x425145, 2.0));
const sun = new T.DirectionalLight(0xffdfb5, 3.3);
sun.position.set(-5, 9, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -9;
sun.shadow.camera.right = 9;
sun.shadow.camera.top = 9;
sun.shadow.camera.bottom = -9;
scene.add(sun);

const dark = new T.MeshStandardMaterial({ color: 0x1a2927, roughness: 1 });
const slab = new T.Mesh(new T.CylinderGeometry(5.7, 6, 0.35, 10), dark);
slab.position.y = -0.28;
slab.receiveShadow = true;
scene.add(slab);

const entities: { kind: Detritivore; group: T.Group }[] = [];
const kinds: Detritivore[] = ["cascarrumo", "dunebrio", "nivelio"];
const groundColors = [0x536d4b, 0xa67b50, 0xb7dce1];
const positions = [-3.35, 0, 3.35];
for (let i = 0; i < kinds.length; i++) {
  const pad = new T.Mesh(
    new T.CylinderGeometry(1.48, 1.55, 0.17, 12),
    new T.MeshStandardMaterial({ color: groundColors[i], roughness: 1 }),
  );
  pad.position.set(positions[i], -0.10, 0);
  pad.receiveShadow = true;
  scene.add(pad);
  const group = createDetritivore(kinds[i]);
  group.position.set(positions[i], 0.005, 0);
  group.rotation.y = -0.35;
  scene.add(group);
  entities.push({ kind: kinds[i], group });
}

let active: DetritivoreAnimation = "idle";
document.querySelectorAll<HTMLButtonElement>("button[data-animation]").forEach((button) => {
  button.addEventListener("click", () => {
    active = button.dataset.animation as DetritivoreAnimation;
    document.querySelectorAll<HTMLButtonElement>("button[data-animation]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === button));
    });
    entities.forEach((e) => { e.group.userData.previewAnimation = active; });
  });
});

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) ||
      canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
const clock = new T.Clock();
function frame() {
  requestAnimationFrame(frame);
  resize();
  const time = clock.getElapsedTime();
  for (const { group } of entities) {
    animateDetritivore(group, time, active === "walk", "explorar");
  }
  orbit.update();
  renderer.render(scene, camera);
}
frame();
