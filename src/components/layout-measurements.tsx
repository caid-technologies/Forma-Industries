import { useMemo } from 'react';
import { Vector3 } from 'three';
import { layoutBounds } from '../lib/layout';
import type { SceneItem } from '../lib/workspace';
import type { Vec3 } from '../lib/scene';

export function LayoutMeasurements({ item, room }: { item: SceneItem; room: Vec3 }) {
  const box = useMemo(() => layoutBounds(item.asset, item), [item.asset, item.position, item.rotation]);
  if (box.isEmpty()) return <p>No geometry available for measurements.</p>;
  const size = box.getSize(new Vector3()).toArray();
  const outside = box.min.x < -room[0]/2-1e-6 || box.max.x > room[0]/2+1e-6 || box.min.z < -room[1]/2-1e-6 || box.max.z > room[1]/2+1e-6 || box.min.y < -1e-6 || box.max.y > room[2]+1e-6;
  return <p className="layout-measurements" aria-label={`${item.name} layout measurements`}>
    Base bounds X / Y / Z: {size.map(n => n.toFixed(3)).join(' / ')} m<br />
    Floor clearance: {box.min.y.toFixed(3)} m<br />
    Origin X / Y / Z: {item.position.map(n => n.toFixed(3)).join(' / ')} m<br />
    Room center is X/Z = 0; floor is Y = 0.
    {item.missing && <><br />Placeholder dimensions; reimport geometry to measure accurately.</>}
    {outside && <><br /><strong>Extends outside the room bounds.</strong></>}
  </p>;
}
