import assert from 'node:assert/strict';
import { ImportService } from '../src/lib/imports';
import { digestBytes } from '../src/lib/scene';
import type { StepResult } from '../src/lib/step';

const stepResult: StepResult = {
  success: true,
  root: { name: 'Assembly', meshes: [0], children: [] },
  meshes: [{ name: 'Enclosure', attributes: { position: { array: [0, 0, 0, 10, 0, 0, 0, 10, 0] } }, index: { array: [0, 1, 2] } }],
};

function file(name: string, contents: string, relativePath = name): File {
  const result = new File([contents], name, { type: 'application/octet-stream' });
  Object.defineProperty(result, 'webkitRelativePath', { value: relativePath });
  return result;
}

async function project(cad: unknown, artifacts: unknown[] = []) {
  const cadFile = file('enclosure.step', 'cad-bytes', 'models/enclosure.step');
  const hash = await digestBytes(await cadFile.arrayBuffer());
  const json = file('form-project.json', JSON.stringify({ format: 'form-project', version: 1,
    project_ir: { hardware_ir_version: '0.2', overview: { title: 'Enclosure' }, mechanical: { render_dimensions: { x_mm: 10, y_mm: 10, z_mm: 10 } }, cad_model: cad },
    artifacts }));
  return { json, cadFile, hash };
}

const converter = async () => stepResult;
const progress = () => {};

{
  const fixture = await project('models/enclosure.step');
  const service = new ImportService(converter);
  const asset = await service.files([fixture.json, fixture.cadFile], { upAxis: 'Z', scale: 1 }, progress);
  assert.equal(asset[0].parts[0].name, 'Enclosure');
  console.log('PASS nested CAD path resolution');
}

{
  const fixture = await project('models/enclosure.step', [{ path: 'models/enclosure.step', sha256: 'wrong' }]);
  await assert.rejects(() => new ImportService(converter).files([fixture.json, fixture.cadFile], { upAxis: 'Z', scale: 1 }, progress), /Integrity check failed/);
  console.log('PASS CAD hash mismatch rejection');
}

{
  const fixture = await project('https://example.invalid/enclosure.step');
  const asset = await new ImportService(converter).files([fixture.json], { upAxis: 'Z', scale: 1 }, progress);
  assert.match(asset[0].warnings.join(' '), /approximate envelope/);
  console.log('PASS remote CAD fallback');
}

{
  const fixture = await project('enclosure.step');
  const second = file('enclosure.step', 'other-cad', 'other/enclosure.step');
  await assert.rejects(() => new ImportService(converter).files([fixture.json, fixture.cadFile, second], { upAxis: 'Z', scale: 1 }, progress), /Multiple files match/);
  console.log('PASS ambiguous CAD basename rejection');
}
