import assert from "node:assert/strict";
import { test } from "node:test";
import * as T from "three";
import { ROCANTRAZ, rocantrazSees } from "../src/creatures/rocantraz";
import {
  createRocantraz, animateRocantraz, rocantrazClips,
  ROCANTRAZ_ANIMATIONS, ROCANTRAZ_VARIANTS,
} from "../src/rendering/rocantraz";

for (const variant of ROCANTRAZ_VARIANTS) {
  test(variant + " has geometry and twelve standalone animated actions", () => {
    const model = createRocantraz(variant);
    let meshes = 0, vertices = 0;
    model.traverse((o) => {
      if (o instanceof T.Mesh) {
        meshes++;
        vertices += o.geometry.getAttribute("position").count;
        assert.ok(o.geometry.getAttribute("normal"));
      }
    });
    assert.ok(meshes >= 80, "real anatomical meshes expected");
    assert.ok(vertices > 5000);
    const rig = model.userData.rig;
    assert.equal(rig.variant, variant);
    assert.equal(rig.tail.length, 6);
    assert.equal(rig.eyes.length, 2);
    assert.notEqual(rig.leftLeg, rig.rightLeg);
    assert.notEqual(rig.leftArm, rig.rightArm);
    model.userData.previewAnimation = "roar";
    animateRocantraz(model, 0.9, false, "explorar");
    assert.ok(rig.jaw.rotation.x > 0.7);
    model.userData.previewAnimation = "run";
    animateRocantraz(model, 0.2, true, "explorar");
    const firstAngle = rig.leftLeg.rotation.x;
    animateRocantraz(model, 0.36, true, "explorar");
    assert.notEqual(firstAngle, rig.leftLeg.rotation.x);
    const clips = rocantrazClips(model);
    assert.equal(clips.length, ROCANTRAZ_ANIMATIONS.length);
    assert.ok(clips.every((clip) => clip.tracks.length >= 20));
    assert.ok(clips.some((clip) =>
      clip.name === "Rocantraz_roar" &&
      clip.tracks.some((t) => t.name.includes("Jaw"))));
    for (const animation of ROCANTRAZ_ANIMATIONS) {
      model.userData.previewAnimation = animation;
      animateRocantraz(model, 0.9, true, "explorar");
      model.updateMatrixWorld(true);
      model.traverse((o) =>
        assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
    }
  });
}
test("field of view is directional and smell covers close blind spots", () => {
  const predator = { x: 0, z: 0, goal: { x: 0, z: 10 } };
  assert.ok(rocantrazSees(predator, { x: 0, z: 31 }));
  assert.ok(rocantrazSees(predator, { x: 25, z: -4 }));
  assert.ok(!rocantrazSees(predator, { x: 0, z: -31 }));
  assert.ok(rocantrazSees(predator, { x: 0, z: -10 }));
  assert.equal(ROCANTRAZ.senses.horizontalFovDeg, 270);
  assert.deepEqual(ROCANTRAZ.variants.forest.habitats,
    ["tropical-forest", "temperate-forest", "mountain-forest", "mountains"]);
  assert.ok(ROCANTRAZ.variants.desert.habitats.includes("desert"));
});
