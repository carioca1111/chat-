import assert from "node:assert/strict";
import { test } from "node:test";
import * as T from "three";
import { SPECIES } from "../src/creatures/species";
import { createWorld, ensureForestDetritivores } from "../src/world/create";
import {
  animateDetritivore, createDetritivore, DETRITIVORE_ANIMATIONS,
  DETRITIVORE_SPECIES,
} from "../src/rendering/detritivores";

for (const id of DETRITIVORE_SPECIES) {
  test(id + " builds true 3D geometry, with articulated appendages", () => {
    const model = createDetritivore(id);
    let meshCount = 0;
    let vertexCount = 0;
    model.traverse((o) => {
      if (o instanceof T.Mesh) {
        meshCount++;
        vertexCount += o.geometry.getAttribute("position").count;
        assert.ok(o.geometry.getAttribute("normal"));
        assert.ok(o.geometry.getAttribute("position").count > 0);
      }
    });
    assert.ok(meshCount > 10, id + ": missing anatomical geometry");
    assert.ok(vertexCount > 300, id + ": model has no usable surface");
    const rig = model.userData.rig;
    assert.equal(rig.kind, id);
    assert.ok(rig.legs.length >= 6);
    assert.equal(rig.feelers.length, 2);
    assert.equal(SPECIES[id].diet, "detritivore");
    model.userData.previewAnimation = "walk";
    animateDetritivore(model, 0.15, true, "explorar");
    const walkPose = rig.legs[0].node.rotation.x;
    animateDetritivore(model, 0.4, true, "explorar");
    assert.notEqual(walkPose, rig.legs[0].node.rotation.x);
    for (const animation of DETRITIVORE_ANIMATIONS) {
      model.userData.previewAnimation = animation;
      animateDetritivore(model, 1.5, true, "explorar");
      model.updateMatrixWorld(true);
      model.traverse((o) => {
        assert.ok(o.matrixWorld.elements.every(Number.isFinite));
      });
    }
  });
}

test("the temperate alpha world spawns forest detritivores only", () => {
  const world = createWorld(46219);
  const species = new Set(world.creatures.map((c) => c.species));
  assert.ok(species.has("cascarrumo"));
  assert.ok(!species.has("dunebrio"));
  assert.ok(!species.has("nivelio"));
  assert.equal(world.creatures.length, 39);
});

test("migration preserves existing save identity and RNG", () => {
  const w = createWorld(46219);
  const original = w.creatures.filter((c) => c.species !== "cascarrumo");
  const originalCount = original.length;
  w.creatures = original;
  const originalRng = w.rng;
  const hunterId = w.hunters[0].id;
  assert.equal(ensureForestDetritivores(w), 8);
  assert.equal(ensureForestDetritivores(w), 0);
  assert.equal(w.rng, originalRng);
  assert.equal(w.hunters[0].id, hunterId);
  assert.equal(w.creatures.length, originalCount + 8);
});
