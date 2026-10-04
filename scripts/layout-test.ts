import assert from 'node:assert/strict';
import { BoxGeometry, Vector3 } from 'three';
import { floorPose, layoutBounds, validLayoutPose } from '../src/lib/layout.ts';
import type { Asset } from '../src/lib/scene.ts';
const geometry = new BoxGeometry(2, 4, 6); geometry.translate(5, -7, 9);
const asset = { parts: [{ vertices: Array.from(geometry.attributes.position.array) }] } as Asset;
const source = JSON.stringify(asset);
for (const rotation of [[0, 0, 0], [90, 0, 0], [23, 41, -17]] as [number, number, number][]) {
  const pose = { position: [2, 11, -3] as [number, number, number], rotation };
  const landed = floorPose(asset, pose);
  assert(Math.abs(layoutBounds(asset, landed).min.y) < 1e-10);
  assert.equal(landed.position[0], 2); assert.equal(landed.position[2], -3);
  assert.deepEqual(landed.rotation, rotation);
  assert.deepEqual(floorPose(asset, landed), landed);
}
assert.deepEqual(layoutBounds(asset, { position: [0, 0, 0], rotation: [90, 0, 0] }).getSize(new Vector3()).toArray().map(Math.round), [2, 6, 4]);
assert.equal(JSON.stringify(asset), source, 'Snapping must not mutate shared source geometry');
assert(!validLayoutPose({ position: [NaN, 0, 0], rotation: [0, 0, 0] }));
geometry.dispose();
console.log('Layout geometry tests passed: arbitrary origins, rotations, exact floor contact, shared geometry.');
