import fs from "node:fs";
import path from "node:path";
import { exportRocantrazGLB } from "../src/rendering/export-rocantraz";
import { ROCANTRAZ_VARIANTS } from "../src/rendering/rocantraz";

// Three.js GLTFExporter needs a FileReader even in Node for binary Blob buffers.
class ServerFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    }).catch((err) => this.onerror?.(err));
  }
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = "data:" + (blob.type || "application/octet-stream") +
        ";base64," + Buffer.from(buffer).toString("base64");
      this.onloadend?.();
    }).catch((err) => this.onerror?.(err));
  }
}
(globalThis as unknown as { FileReader: typeof FileReader }).FileReader =
  ServerFileReader as unknown as typeof FileReader;

function inspectGlb(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67) throw Error("not a GLB");
  if (view.getUint32(4, true) !== 2) throw Error("not glTF 2");
  if (view.getUint32(8, true) !== bytes.byteLength) throw Error("wrong GLB length");
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== 0x4e4f534a) throw Error("missing GLB JSON chunk");
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
  if ((json.animations?.length ?? 0) !== 12)
    throw Error("expected 12 animation clips, received " + (json.animations?.length ?? 0));
  // glTF deduplicates repeated geometry/material combinations into few meshes.
  // Real individual geometry instances are the many nodes referencing those meshes.
  const modelNodes = (json.nodes ?? []).filter((n: { mesh?: number }) =>
    Number.isInteger(n.mesh)).length;
  if ((json.meshes?.length ?? 0) < 1 || modelNodes < 80)
    throw Error("missing 3D mesh instances: " + modelNodes);
  if (!json.nodes?.some((n: { name?: string }) => n.name === "Rocantraz_Jaw"))
    throw Error("jaw bone missing");
  return { meshes: json.meshes.length, animations: json.animations.length,
    nodes: json.nodes.length, bytes: bytes.byteLength };
}
async function main() {
  const out = path.resolve("dist-creatures");
  fs.mkdirSync(out, { recursive: true });
  for (const variant of ROCANTRAZ_VARIANTS) {
    const bytes = await exportRocantrazGLB(variant);
    const report = inspectGlb(bytes);
    const target = path.join(out, "rocantraz-" + variant + "-animated.glb");
    fs.writeFileSync(target, Buffer.from(bytes));
    console.log(variant + ": " + JSON.stringify(report));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
