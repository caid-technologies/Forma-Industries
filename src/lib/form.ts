import { BoxGeometry, Euler, Matrix4 } from 'three';
import { finalizeAsset, type Asset, type FormProject, type Part, type Vec3 } from './scene';
import { scrubCloudData } from './cloud-storage';

type RecordValue = Record<string, unknown>;
export function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}
const text = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}
function vector(value: unknown, label: string, positive = false): Vec3 {
  const item = record(value);
  return ['x_mm', 'y_mm', 'z_mm'].map(key => {
    const n = finite(item[key], `${label}.${key}`);
    if (positive && n <= 0) throw new Error(`${label}.${key} must be greater than zero.`);
    return n;
  }) as Vec3;
}

export type FormDocument = {
  name: string; projectId?: string; version: string; mechanical: RecordValue;
  cad: unknown; definitions: RecordValue[]; components: RecordValue[]; artifacts: RecordValue[]; project: FormProject;
};

function artifactRecords(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(record).filter(item => typeof item.path === 'string') : [];
}

export function readFormDocument(input: unknown, filename: string): FormDocument {
  let root = record(scrubCloudData(structuredClone(input)));
  const sourceDocument = root;
  if (Object.keys(root).length === 0) throw new Error('Expected a Form project JSON object.');
  if (root.response) root = record(root.response);
  if (root.format && root.format !== 'form-project') throw new Error(`Unsupported project format: ${root.format}`);
  if (root.format === 'form-project' && root.version !== 1) throw new Error(`Unsupported Form manifest version: ${root.version}. Expected 1.`);
  const object = record(root.project_object ?? (root.object_type ? root : undefined));
  let ir = record(root.project_ir ?? root.hardware_ir ?? root);
  let source: FormProject['source'] = root.project_ir ? 'project_ir' : root.hardware_ir ? 'hardware_ir' : 'raw_ir';
  let revision: string | undefined;
  let projectId = text(root.project_id);
  let version: string;
  if (Object.keys(object).length && !root.project_ir && !root.hardware_ir) {
    if (object.object_type !== 'form.project') throw new Error('Unsupported project object type. Expected form.project.');
    // Form object/namespace versions are revision counters, not schema versions.
    if (!Number.isInteger(object.version) || Number(object.version) < 1) throw new Error('Invalid Form project revision.');
    if (!Array.isArray(object.namespaces)) throw new Error('Form project namespaces must be an array.');
    const namespaces = object.namespaces.map(record);
    if (new Set(namespaces.map(n=>n.name)).size !== namespaces.length) throw new Error('Duplicate Form namespace name.');
    const payload = (name: string) => record(namespaces.find(n => n.name === name)?.payload);
    const meta = payload('project.meta');
    const schema = text(meta.hardware_ir_version, '0.2');
    if (!['0.1', '0.2'].includes(schema)) throw new Error(`Unsupported Hardware IR version: ${schema}. Expected 0.1 or 0.2.`);
    ir = { ...payload('project.meta'), ...payload('project.docs'), ...payload('product.overview'), ...payload('product.architecture'), ...payload('product.electrical'), ...payload('product.mech'), ...payload('product.assembly'), ...payload('product.validation') };
    const bom = payload('product.bom');
    if (Array.isArray(bom.line_items) || Array.isArray(bom.bom)) ir.bom = bom.line_items ?? bom.bom;
    ir.hardware_ir_version = schema;
    source = 'namespace';
    projectId = text(object.object_id);
    revision = String(object.version);
    version = `${schema} / revision ${object.version}`;
  } else {
    version = text(ir.hardware_ir_version, '0.1');
    if (!['0.1', '0.2'].includes(version)) throw new Error(`Unsupported Hardware IR version: ${version}. Expected 0.1 or 0.2.`);
  }
  const metadata = record(ir.assembly_metadata);
  const overview = record(ir.overview);
  for (const field of ['overview','mechanical','validation','assembly_metadata']) {
    if (ir[field] !== undefined && ir[field] !== null && (typeof ir[field] !== 'object' || Array.isArray(ir[field]))) throw new Error(`Form ${field} must be an object.`);
  }
  for (const field of ['components','part_definitions','bom','nets']) {
    if (ir[field] !== undefined && (!Array.isArray(ir[field]) || (ir[field] as unknown[]).some(v=>!v||typeof v!=='object'||Array.isArray(v)))) throw new Error(`Form ${field} must be an array of records.`);
  }
  const refs = new Set<string>();
  for (const component of (Array.isArray(ir.components)?ir.components:[]).map(record)) {
    if (!text(component.ref_des) || refs.has(String(component.ref_des))) throw new Error(`Duplicate or missing Form component ref_des: ${component.ref_des}`);
    refs.add(String(component.ref_des));
  }
  projectId ||= text(metadata.project_id);
  const revisionValue = root.revision ?? metadata.revision;
  revision ||= typeof revisionValue === 'number' || typeof revisionValue === 'string' ? String(revisionValue) : undefined;
  const artifacts = artifactRecords(root.artifacts ?? ir.artifacts);
  const project: FormProject = { projectId: projectId || undefined, revision, agent: text(root.agent ?? ir.agent ?? metadata.source_agent ?? metadata.agent) || undefined, hardwareIrVersion: version.split(' / ')[0], ir, source, sourceDocument, artifacts };
  return {
    name: text(root.title, text(overview.title, filename.replace(/\.json$/i, ''))),
    projectId: projectId || text(metadata.project_id) || undefined,
    version,
    mechanical: record(ir.mechanical),
    cad: ir.cad_model,
    definitions: Array.isArray(ir.part_definitions) ? ir.part_definitions.map(record) : [],
    components: Array.isArray(ir.components) ? ir.components.map(record) : [], artifacts, project,
  };
}

export function cadFileReference(cad: unknown): string | undefined {
  if (typeof cad === 'string') return cad;
  const source = record(cad);
  for (const key of ['path', 'file_path', 'model_path', 'url', 'file_url', 'download_url', 'filename']) {
    if (typeof source[key] === 'string') return source[key] as string;
  }
  for (const key of ['adapter', 'model', 'payload']) {
    if (source[key]) { const nested = cadFileReference(source[key]); if (nested) return nested; }
  }
}

function meshRecords(cad: unknown): unknown[] | undefined {
  if (Array.isArray(cad)) return cad;
  const source = record(cad);
  if (source.vertices || source.faces) return [source];
  for (const key of ['meshes', 'mesh_payloads', 'render_meshes', 'mesh', 'adapter', 'model', 'payload']) {
    if (source[key]) { const nested = meshRecords(source[key]); if (nested) return nested; }
  }
}

export function importForm(input: unknown, filename: string, digest: string): Asset {
  const doc = readFormDocument(input, filename);
  const id = `form-${digest}`;
  const parts: Part[] = [];
  const warnings: string[] = [];
  const placements = doc.mechanical.component_placements;
  if (placements !== undefined && !Array.isArray(placements)) throw new Error('Mechanical component_placements must be an array.');
  const placementRefs = new Set<string>();
  for (const value of Array.isArray(placements) ? placements : []) {
    const ref = text(record(value).ref_des);
    if (!ref || placementRefs.has(ref)) throw new Error(`Duplicate or missing mechanical ref_des: ${ref}`);
    if (doc.components.length && !doc.components.some(c=>c.ref_des===ref)) throw new Error(`Unknown component ref_des in mechanical placement: ${ref}`);
    placementRefs.add(ref);
  }
  const represented = new Set<string>();
  const meshes = meshRecords(doc.cad);
  if (meshes?.length) {
    for (const [index, value] of meshes.entries()) {
      const mesh = record(value);
      const ref = text(mesh.ref_des, doc.components.some(c=>c.ref_des===mesh.name) ? String(mesh.name) : '');
      if (ref) represented.add(ref);
      if (!Array.isArray(mesh.vertices) || !Array.isArray(mesh.faces)) throw new Error('CAD meshes require vertices and faces arrays.');
      const source = mesh.vertices.map(v => finite(v, 'CAD vertex'));
      const vertices: number[] = [];
      for (let i = 0; i < source.length; i += 3) vertices.push(source[i] / 1000, source[i + 2] / 1000, -source[i + 1] / 1000);
      parts.push({ id: `${id}/mesh/${index}`, name: text(mesh.name, `CAD part ${index + 1}`), vertices,
        indices: mesh.faces.map(v => finite(v, 'CAD face')), metadata: { representation: 'CAD mesh', ref, sourceId: text(mesh.shapeId ?? mesh.shape_id ?? mesh.id) } });
    }
  }
  if (!meshes?.length || (represented.size > 0 && Array.isArray(placements) && placements.some(p=>!represented.has(String(record(p).ref_des))))) {
    if (placements !== undefined && !Array.isArray(placements)) throw new Error('Mechanical component_placements must be an array.');
    if (Array.isArray(placements) && placements.length) {
      for (const value of placements) {
        const item = record(value);
        const ref = text(item.ref_des);
        if (represented.has(ref)) continue;
        if (!ref) throw new Error('Each mechanical placement needs a ref_des.');
        const component = doc.components.find(c => c.ref_des === ref) ?? {};
        const definition = doc.definitions.find(d => d.part_definition_id === component.part_definition_id) ?? component;
        const size = vector(item.size, `${ref} size`, true);
        const position = vector(item.position, `${ref} position`);
        const rotation = record(item.orientation_deg);
        const angles = ['x_deg', 'y_deg', 'z_deg'].map(key => finite(rotation[key] ?? 0, `${ref} ${key}`) * Math.PI / 180);
        const geometry = new BoxGeometry(...size);
        geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(angles[0], angles[1], angles[2], 'XYZ')));
        geometry.translate(...position);
        geometry.rotateX(-Math.PI / 2);
        geometry.scale(0.001, 0.001, 0.001);
        parts.push({ id: `${id}/placement/${ref}`, name: text(item.label, text(definition.name, ref)),
          vertices: Array.from(geometry.attributes.position.array), indices: Array.from(geometry.index!.array),
          metadata: { ref, category: text(item.category, text(definition.category)), layer: text(item.layer),
            partNumber: text(definition.part_number), representation: 'Approximate component envelope' } });
        geometry.dispose();
      }
      warnings.push('Showing approximate component envelopes from Form mechanical placements, not fabrication-ready CAD surfaces.');
    } else if (doc.mechanical.render_dimensions) {
      const geometry = new BoxGeometry(...vector(doc.mechanical.render_dimensions, 'render_dimensions', true));
      geometry.rotateX(-Math.PI / 2); geometry.scale(0.001, 0.001, 0.001);
      parts.push({ id: `${id}/envelope`, name: doc.name, vertices: Array.from(geometry.attributes.position.array),
        indices: Array.from(geometry.index!.array), metadata: { representation: 'Approximate overall envelope' } });
      geometry.dispose();
      warnings.push('Only overall dimensions are available. Showing an approximate envelope.');
    }
    if (doc.cad) warnings.push('Referenced CAD is unavailable or unsupported. Select its STEP file together with the JSON to resolve local geometry.');
  }
  if (!parts.length) throw new Error('This Form project has no usable geometry. Include its referenced STEP file, inline CAD meshes, or mechanical placements.');
  const hierarchy = { id: `${id}/root`, name: doc.name, partIds: [], children: parts.map(part => ({ id: part.id, name: part.name, partIds: [part.id], children: [] })) };
  return finalizeAsset({ id, name: doc.name, source: { kind: 'form', filename, digest, projectId: doc.projectId, version: doc.version }, parts,
    formProject: doc.project,
    hierarchy, warnings });
}
