import assert from "node:assert/strict";
import { test } from "node:test";
import * as T from "three";
import { ROCANTRAZ, rocantrazSees } from "../src/creatures/rocantraz";
import { SPECIES } from "../src/creatures/species";
import { ensureForestRocantraz, createWorld } from "../src/world/create";
import { step } from "../src/simulation/engine";
import { createRocantraz, animateRocantraz, rocantrazClips,
  ROCANTRAZ_ANIMATIONS, ROCANTRAZ_VARIANTS } from "../src/rendering/rocantraz";

for (const variant of ROCANTRAZ_VARIANTS) {
  test(variant + " has anatomical 3D geometry and twelve animatable actions", () => {
    const model = createRocantraz(variant);
    const vertices: number[] = [];
    model.traverse((o) => {
      if (o instanceof T.Mesh) {
        vertices.push(o.geometry.attributes.position.count);
        assert.ok(o.material instanceof T.Material);
      }
    });
    assert.ok(vertices.length >= 85, "the mesh must contain real anatomical sub-meshes");
    assert.ok(vertices.reduce((a, b) => a + b, 0) > 5000);
    const rig = model.userData.rig;
    assert.equal(rig.tail.length, 6);
    assert.equal(rig.eyes.length, 2);
    assert.notEqual(rig.leftArm, rig.rightArm);
    const head = rig.head;
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
    assert.ok(head instanceof T.Group);
    for (const animation of ROCANTRAZ_ANIMATIONS) {
      model.userData.previewAnimation = animation;
      animateRocantraz(model, 0.9, true, "explorar");
      model.updateMatrixWorld(true);
      model.traverse((o) => assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
    }
  });
}

test("field of view includes sides and nose but excludes distant targets behind", () => {
  const predator = { x: 0, z: 0, goal: { x: 0, z: 10 } };
  assert.ok(rocantrazSees(predator, { x: 0, z: 31 }));
  assert.ok(rocantrazSees(predator, { x: 25, z: -4 }));
  assert.ok(!rocantrazSees(predator, { x: 0, z: -31 }));
  assert.ok(rocantrazSees(predator, { x: 0, z: -10 }), "scent covers the rear blind spot");
  assert.equal(ROCANTRAZ.senses.horizontalFovDeg, 270);
});

test("forest alpha has one apex, respects old fauna and stable migrations", () => {
  const w = createWorld();
  const apex = w.creatures.filter((c) => c.species === "rocantraz");
  assert.equal(apex.length, 1);
  assert.equal(apex[0].variant, "forest");
  assert.equal(w.creatures.length, 40);
  assert.equal(SPECIES.rocantraz.diet, "carnivore");
  const before = w.rng;
  assert.equal(ensureForestRocantraz(w), 0);
  assert.equal(w.rng, before);
  w.creatures = w.creatures.filter((c) => c.species !== "rocantraz");
  assert.equal(ensureForestRocantraz(w), 1);
  assert.equal(w.rng, before);
  for (let i = 0; i < 30; i++) step(w);
  assert.equal(w.creatures.filter((c) => c.species === "rocantraz").length, 1);
  assert.ok(w.creatures.every((c) =>
    Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.hp)));
});
