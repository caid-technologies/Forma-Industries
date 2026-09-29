import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const { GifReader } = require('omggif');
const baseUrl = process.env.ASTRA_BASE_URL || 'http://127.0.0.1:5174';
const output = 'public/examples/cleanroom/cleanroom-room-a-sample.gif';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/?scene=cleanroom`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('footer [role="status"]')?.textContent?.includes('Playing cleanroom sampling route'), null, { timeout: 15000 });
  await page.getByRole('button', { name: 'GIF studio', exact: true }).click();
  const studio = page.getByRole('region', { name: 'GIF studio', exact: true });
  await studio.getByLabel('GIF resolution').selectOption('480');
  await studio.getByLabel('Duration').selectOption('4');
  await studio.getByLabel('Frame rate').selectOption('10');
  await studio.getByLabel('Export scope').selectOption('section');
  await studio.getByLabel('Section center X').fill('-3.048');
  await studio.getByLabel('Section center Z').fill('-4.8');
  await studio.getByLabel('Section width').fill('6');
  await studio.getByLabel('Section depth').fill('6');
  await studio.getByLabel('Preview motion').selectOption('animation');
  await studio.getByLabel('Animation export start').fill('5');
  await studio.getByLabel('Animation export end').fill('9');
  await studio.getByRole('button', { name: 'Render GIF', exact: true }).click();
  await studio.getByRole('status', { name: 'GIF export status' }).getByText('GIF ready', { exact: false }).waitFor({ timeout: 120000 });
  const download = page.waitForEvent('download');
  await studio.getByRole('link', { name: 'Download GIF', exact: true }).click();
  await (await download).saveAs(output);
  const bytes = readFileSync(output);
  const gif = new GifReader(bytes);
  assert.equal(gif.width, 480);
  assert.equal(gif.height, 480);
  assert.equal(gif.numFrames(), 40);
  const first = Buffer.alloc(480 * 480 * 4), last = Buffer.alloc(480 * 480 * 4);
  gif.decodeAndBlitFrameRGBA(0, first);
  gif.decodeAndBlitFrameRGBA(gif.numFrames() - 1, last);
  assert(!first.equals(last), 'The authored animation GIF should contain visible motion.');
  console.log(`${output} (${gif.numFrames()} frames, ${(bytes.length / 1024).toFixed(0)} KB)`);
} finally {
  await browser.close();
}
