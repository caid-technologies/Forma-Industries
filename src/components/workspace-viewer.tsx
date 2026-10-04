import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { floorPose, validLayoutPose } from '../lib/layout';
import type { Pose } from '../lib/workspace';
import type { Vec3 } from '../lib/scene';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { applyWorldPoses, createWorld } from '../lib/world';
import { evaluateWorkspace, type Workspace } from '../lib/workspace';
import { regionBounds, type FloorRegion } from '../lib/gif';
import { updateCameraDepth } from '../lib/camera-depth';

type Props = { workspace: Workspace; selected: number; selectedPart: number; time: number | null; focus: number;
  region: FloorRegion | null; mode: 'orbit' | 'translate' | 'rotate'; grid: number; floor: boolean; disabled: boolean;
  onPreview: (pose: Pose | null) => void; onCommit: (id: string, pose: Pose, base: Workspace) => void;
  onSelect: (instance: number, part: number) => void };
export function WorkspaceViewer(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const key = props.workspace.items.map(item => `${item.id}:${item.asset.id}:${item.cloudVersionId??'local'}:${item.missing}`).join('|');
  const roomKey = props.workspace.room.join(',');
  useEffect(() => {
    const el = host.current!; const p = latest.current;
    const world = createWorld(p.workspace.items.map(item => item.asset), p.workspace.room);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(45, 1, .01, 100);
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSpace('world'); transform.setSize(.85);
    const helper = transform.getHelper(); world.scene.add(helper);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
    let drag: { id: string; index: number; base: Workspace } | null = null;
    let consumed = false;
    const readPose = (): Pose => ({ position: transform.object!.position.toArray() as Vec3,
      rotation: [transform.object!.rotation.x, transform.object!.rotation.y, transform.object!.rotation.z].map(THREE.MathUtils.radToDeg) as Vec3 });
    const cancel = () => {
      if (!drag) return;
      drag = null; transform.reset(); transform.dragging = false; controls.enabled = true;
      latest.current.onPreview(null);
    };
    transform.addEventListener('mouseDown', () => {
      const current = latest.current; const item = current.workspace.items[current.selected];
      if (!item || current.disabled || current.time !== null) return;
      consumed = true; controls.enabled = false;
      drag = { id: item.id, index: current.selected, base: current.workspace };
    });
    transform.addEventListener('objectChange', () => {
      if (!drag) return;
      const current = latest.current;
      if (current.workspace !== drag.base || current.selected !== drag.index || current.disabled || current.time !== null) { cancel(); return; }
      let pose = readPose();
      if (current.floor) pose = floorPose(drag.base.items[drag.index].asset, pose);
      if (!validLayoutPose(pose)) { cancel(); return; }
      transform.object!.position.fromArray(pose.position);
      latest.current.onPreview(pose);
    });
    transform.addEventListener('mouseUp', () => {
      controls.enabled = true;
      if (!drag) return;
      const operation = drag; drag = null;
      if (latest.current.workspace === operation.base && latest.current.selected === operation.index && !latest.current.disabled && latest.current.time === null) {
        const pose = readPose();
        if (validLayoutPose(pose)) latest.current.onCommit(operation.id, pose, operation.base);
      }
      latest.current.onPreview(null);
    });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && drag) { event.preventDefault(); cancel(); } };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', cancel);
    renderer.domElement.addEventListener('pointercancel', cancel);
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let down = [0,0];
    const onDown = (event: PointerEvent) => { down = [event.clientX, event.clientY]; consumed = false; };
    const onUp = (event: PointerEvent) => {
      if (consumed || transform.axis || event.button !== 0 || Math.hypot(event.clientX-down[0], event.clientY-down[1]) > 4) return;
      const rect = el.getBoundingClientRect();
      pointer.set((event.clientX-rect.left)/rect.width*2-1, -(event.clientY-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(pointer,camera);
      const hit = raycaster.intersectObjects(world.groups.filter(g => g.visible).flatMap(g => g.children))[0];
      if (hit?.object.parent) latest.current.onSelect(world.groups.indexOf(hit.object.parent as THREE.Group), hit.object.parent.children.indexOf(hit.object));
    };
    renderer.domElement.addEventListener('pointerdown',onDown,true); renderer.domElement.addEventListener('pointerup',onUp);
    const resize = () => { camera.aspect = el.clientWidth / Math.max(1,el.clientHeight); camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth,el.clientHeight); };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    let lastFocus = ''; let lastRegion = ''; let outline: THREE.Box3Helper | null = null;
    renderer.setAnimationLoop(() => {
      const { workspace, selected, selectedPart, time, focus, region } = latest.current;
      if (drag && (workspace !== drag.base || selected !== drag.index || latest.current.disabled || time !== null)) cancel();
      if (!drag) applyWorldPoses(world.groups, evaluateWorkspace(workspace.items,workspace.animation,time));
      const item = workspace.items[selected];
      const editable = !latest.current.disabled && time === null && item?.visible && !item.missing && latest.current.mode !== 'orbit';
      if (editable) {
        if (transform.object !== world.groups[selected]) transform.attach(world.groups[selected]);
        transform.setMode(latest.current.mode === 'rotate' ? 'rotate' : 'translate');
        transform.setTranslationSnap(latest.current.grid || null);
        transform.showY = !(latest.current.floor && latest.current.mode === 'translate');
        transform.enabled = true;
      } else { cancel(); transform.detach(); transform.enabled = false; }
      world.groups.forEach((group,i) => group.children.forEach((object,j) => {
        ((object as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.setHex(i === selected ? (j === selectedPart ? 0x516525 : 0x203012) : 0);
      }));
      const focusKey = `${selected}:${selectedPart}:${focus}`;
      if (focusKey !== lastFocus) {
        lastFocus = focusKey;
        const group = world.groups[selected];
        if (group) {
          const box = new THREE.Box3().setFromObject(selectedPart >= 0 ? group.children[selectedPart] ?? group : group);
          const center = box.getCenter(new THREE.Vector3()); const size = Math.max(box.getSize(new THREE.Vector3()).length(),.01);
          controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(size*1.3,size*.9,size*1.3));
        } else {
          controls.target.set(0,0,0);
          const generatedArchitecture = p.workspace.items.some(item => item.asset.source.kind === 'generated');
          camera.position.set(workspace.room[0] * (generatedArchitecture ? .35 : .9), Math.max(...workspace.room) * (generatedArchitecture ? 1.35 : .75), workspace.room[1] * (generatedArchitecture ? .35 : .9));
        }
      }
      const regionKey = JSON.stringify(region);
      if (regionKey !== lastRegion) {
        lastRegion = regionKey;
        if (outline) { world.scene.remove(outline); outline.geometry.dispose(); (outline.material as THREE.Material).dispose(); outline=null; }
        if (region) try { outline = new THREE.Box3Helper(regionBounds(region,workspace.room),0xc8ef82); world.scene.add(outline); } catch { /* Invalid region is explained in the export panel. */ }
      }
      controls.update();
      // The gizmo includes an invisible 100 km picking plane; exclude helpers
      // when fitting depth so CAD surfaces retain their depth precision.
      const helperVisible = helper.visible; helper.visible = false;
      updateCameraDepth(camera, world.scene, controls.target);
      helper.visible = helperVisible;
      renderer.render(world.scene,camera);
    });
    return () => { cancel(); window.removeEventListener('keydown',onKey); window.removeEventListener('blur',cancel); renderer.domElement.removeEventListener('pointercancel',cancel); world.scene.remove(helper); transform.dispose(); observer.disconnect(); renderer.setAnimationLoop(null); renderer.domElement.removeEventListener('pointerdown',onDown,true); renderer.domElement.removeEventListener('pointerup',onUp); controls.dispose(); world.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, [key,roomKey]);
  return <div className="viewport" ref={host} aria-label="Interactive 3D room" />;
}
