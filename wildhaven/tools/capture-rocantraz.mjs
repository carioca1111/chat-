import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const host = "127.0.0.1";
const port = 5406;
const url = `http://${host}:${port}/rocantraz.html`;
const output = path.resolve("assets/fauna/rocantraz");
fs.mkdirSync(output, { recursive: true });

const server = spawn(process.execPath, [
  "./node_modules/vite/bin/vite.js", "--host", host, "--port", String(port), "--strictPort",
], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "true" } });
let outputText = "";
server.stdout.on("data", (chunk) => { outputText += chunk.toString(); });
server.stderr.on("data", (chunk) => { outputText += chunk.toString(); });
async function ready() {
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("Vite failed: " + outputText);
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* server still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Vite did not start: " + outputText);
}
let browser;
try {
  await ready();
  browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl",
      "--disable-dev-shm-usage", "--no-sandbox"
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 930 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    document.querySelector("header")?.remove();
    document.querySelector("#variants")?.remove();
    document.querySelector("#actions")?.remove();
  });
  await page.waitForTimeout(650);
  const canvas = page.locator("#preview");
  const png = path.join(output, "rocantraz-forest-desert-real-3d.png");
  await canvas.screenshot({ path: png, animations: "disabled" });
  const detail = path.join(output, "rocantraz-forest-desert-real-3d-detail.png");
  await page.screenshot({
    path: detail,
    clip: { x: 372, y: 280, width: 930, height: 465 },
    animations: "disabled",
  });
  const report = await page.evaluate(() => ({
    width: document.querySelector("canvas")?.width,
    height: document.querySelector("canvas")?.height,
    webgl2: !!document.createElement("canvas").getContext("webgl2"),
  }));
  const bytes = fs.statSync(png).size;
  if (errors.length) throw new Error("preview errors: " + errors.join("; "));
  if (bytes < 45000) throw new Error("screenshot unexpectedly tiny: " + bytes);
  console.log(JSON.stringify({ screenshot: png, bytes, ...report }, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
