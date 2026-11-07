import * as T from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createRocantraz, rocantrazClips, type RocantrazVariant } from "./rocantraz";

/** Export a complete 3D model + its twelve baked keyframed actions in one GLB. */
export async function exportRocantrazGLB(variant: RocantrazVariant): Promise<ArrayBuffer> {
  const root = createRocantraz(variant);
  const clips = rocantrazClips(root);
  // A rig references live Object3D nodes (circular). Keep it out of glTF extras.
  delete root.userData.rig;
  delete root.userData.previewAnimation;
  root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      root,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error("GLTFExporter returned JSON instead of GLB"));
      },
      (error) => reject(error),
      { binary: true, animations: clips, trs: true, onlyVisible: true },
    );
  });
}

/** In-browser download, directly from the geometry source in this repository. */
export async function downloadRocantrazGLB(variant: RocantrazVariant) {
  const glb = await exportRocantrazGLB(variant);
  const url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = "rocantraz-" + variant + "-animated.glb";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}
