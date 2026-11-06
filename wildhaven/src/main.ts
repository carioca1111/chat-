import "./ui/style.css";
import type { World } from "./core/types";
import { load, save } from "./persistence/save";
import { createWorld } from "./world/create";
import { step, STEP } from "./simulation/engine";
import { View } from "./rendering/scene";
import { HUD } from "./ui/hud";
let error = "";
let world: World;
try {
  world = load();
} catch (e) {
  world = createWorld();
  error =
    "Save não carregado. Um mundo temporário foi aberto; o save anterior não será sobrescrito automaticamente.";
}
try {
  let hud: HUD;
  const view = new View(world, document.querySelector("#world")!, (id) =>
    hud.select(id),
  );
  hud = new HUD(world, view);
  hud.update();
  if (error) hud.notify(error);
  let previous = performance.now(),
    accumulator = 0,
    uiTime = 0,
    saveTime = 0;
  function frame(now: number) {
    const dt = Math.min((now - previous) / 1000, 0.25);
    previous = now;
    accumulator += dt * hud.speed;
    let count = 0;
    while (accumulator >= STEP && count++ < 15) {
      step(world);
      accumulator -= STEP;
    }
    view.render(dt);
    uiTime += dt;
    saveTime += dt;
    if (uiTime > 0.25) {
      hud.update();
      uiTime = 0;
    }
    if (saveTime > 15 && !error) {
      try {
        save(world);
      } catch {
        hud.notify("Salvamento indisponível. Exporte o mundo.");
      }
      saveTime = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener("pagehide", () => {
    if (!error)
      try {
        save(world);
      } catch {}
  });
  // Dev-only test bridge is removed from production bundle by Vite.
  if (import.meta.env.DEV)
    Object.assign(window, {
      __wildhaven: { world, view, hud, step: () => step(world) },
    });
} catch (e) {
  document.body.innerHTML =
    '<div style="padding:40px;color:#eee;font-family:sans-serif"><h1>Wildhaven precisa de WebGL 2</h1><p>Ative a aceleração gráfica e abra em um navegador atualizado.</p><pre></pre></div>';
  document.querySelector("pre")!.textContent = String(e);
  console.error(e);
}
