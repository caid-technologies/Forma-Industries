import { Box3, Euler, MathUtils, Vector3 } from 'three';
import type { Asset, Vec3 } from './scene';
import type { Pose } from './workspace';

// Only the last rotation per asset is cached: repeated translation is cheap,
// while arbitrary CAD origins and rotated/non-box geometry stay exact.
const rotatedBounds = new WeakMap<Asset, { key: string; box: Box3 }>();
export function layoutBounds(asset: Asset, pose: Pose): Box3 {
  const key = pose.rotation.join(',');
  let cached = rotatedBounds.get(asset);
  if (cached?.key !== key) {
    const box = new Box3();
    const rotation = new Euler(...pose.rotation.map(MathUtils.degToRad) as Vec3);
    const point = new Vector3();
    for (const part of asset.parts) for (let i = 0; i < part.vertices.length; i += 3) {
      point.fromArray(part.vertices, i).applyEuler(rotation); box.expandByPoint(point);
    }
    cached = { key, box }; rotatedBounds.set(asset, cached);
  }
  return cached.box.clone().translate(new Vector3(...pose.position));
}
export function floorPose(asset: Asset, pose: Pose): Pose {
  const box = layoutBounds(asset, pose);
  return { position: [pose.position[0], box.isEmpty() ? pose.position[1] : pose.position[1] - box.min.y, pose.position[2]], rotation: [...pose.rotation] };
}
export function validLayoutPose(pose: Pose): boolean {
  return [...pose.position, ...pose.rotation].every(n => Number.isFinite(n) && Math.abs(n) <= 1e6);
}
