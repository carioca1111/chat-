import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createRocantraz, animateRocantraz,
  type RocantrazAnimation, type RocantrazVariant } from "./rendering/rocantraz";
import { downloadRocantrazGLB } from "./rendering/export-rocantraz";

const canvas = document.querySelector<HTMLCanvasElement>("#preview")!;
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.26;
const scene = new T.Scene();
scene.background = new T.Color(0x343b36);
scene.fog = new T.Fog(0x343b36, 29, 70);
scene.add(new T.HemisphereLight(0xdce8dd, 0x364139, 2.1));
const sun = new T.DirectionalLight(0xffe8bf, 3.3);
sun.position.set(-7, 15, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
scene.add(sun, sun.target);

const camera = new T.PerspectiveCamera(46, 1, 0.1, 100);
camera.position.set(8, 7.6, 19.5);
const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 2.4, -0.6);
orbit.enableDamping = true;
orbit.minDistance = 12;
orbit.maxDistance = 50;
orbit.maxPolarAngle = Math.PI * 0.54;
orbit.update();

const variants: RocantrazVariant[] = ["forest", "desert"];
const positions = [-5.6, 5.6];
const models = variants.map((variant, i) => {
  const ring = new T.Mesh(
    new T.CylinderGeometry(4.5, 4.6, 0.35, 16),
    new T.MeshStandardMaterial({ color: i === 0 ? 0x4c6552 : 0xa78260, roughness: 1 }),
  );
  ring.position.set(positions[i], -0.29, -0.6);
  ring.receiveShadow = true;
  scene.add(ring);
  const model = createRocantraz(variant);
  model.position.set(positions[i], 0, -0.6);
  model.rotation.y = -0.28;
  scene.add(model);
  return model;
});
let active: RocantrazAnimation = "idle";
let actionStartTime = 0;
document.querySelectorAll<HTMLButtonElement>("button[data-animation]").forEach((button) => {
  button.addEventListener("click", () => {
    active = button.dataset.animation as RocantrazAnimation;
    actionStartTime = clock.getElapsedTime();
    document.querySelectorAll<HTMLButtonElement>("button[data-animation]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === button));
    });
  });
});
const status = document.querySelector<HTMLElement>("#status")!;
document.querySelectorAll<HTMLButtonElement>("button[data-export]").forEach((button) => {
  button.addEventListener("click", async () => {
    const variant = button.dataset.export as RocantrazVariant;
    button.disabled = true;
    status.textContent = "Gerando modelo GLB com 12 animações...";
    try {
      await downloadRocantrazGLB(variant);
      status.textContent = "Arquivo GLB animado gerado.";
    } catch (error) {
      status.textContent = "Falha ao exportar GLB: " + String(error);
    } finally {
      button.disabled = false;
    }
  });
});
const clock = new T.Clock();
function frame() {
  requestAnimationFrame(frame);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const pix = renderer.getPixelRatio();
  if (canvas.width !== Math.round(w * pix) || canvas.height !== Math.round(h * pix)) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const t = clock.getElapsedTime();
  for (const model of models) {
    model.userData.previewAnimation = active;
    const animationTime = t - actionStartTime;
    animateRocantraz(model, animationTime, active === "walk", "explorar");
  }
  orbit.update();
  renderer.render(scene, camera);
}
frame();
