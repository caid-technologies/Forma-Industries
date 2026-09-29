import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Exercise the client boundary using an isolated root; never create diagnostic rooms
// in the user's checkout or alter their OpenCode configuration.
const root = mkdtempSync(join(tmpdir(), 'astra-mcp-doctor-'));
const server = fileURLToPath(new URL('../server/astra-mcp.mjs', import.meta.url));
const client = new Client({ name: 'astra-mcp-doctor', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath, args: [server], stderr: 'pipe',
  env: { ...process.env, ASTRA_ROOT: root, ASTRA_MCP_DEBUG: '1' },
});
let trace = '';
transport.stderr?.on('data', chunk => { trace += chunk.toString(); });
const timeout = setTimeout(() => { console.error('FAIL: MCP diagnostic timed out.'); void client.close(); }, 20000);
timeout.unref();
let stage = 'initialize';
try {
  console.log(`Astra MCP diagnostic: ${process.platform}, Node ${process.version}`);
  await client.connect(transport, { timeout: 5000 });
  stage = 'tools/list';
  const { tools } = await client.listTools();
  for (const name of ['astra.list_rooms', 'astra.create_room', 'astra.read_room']) assert.ok(tools.some(tool => tool.name === name), `Missing ${name}. Update the checkout and restart OpenCode.`);
  console.log(`PASS: initialize and tools/list (${tools.length} tools)`);
  async function call(name, args = {}) {
    stage = name;
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 5000 });
    assert.notEqual(result.isError, true, `${name} returned an MCP tool error.`);
    const content = result.content.find(item => item.type === 'text');
    assert.equal(typeof content?.text, 'string', `${name} did not return text content.`);
    assert.deepEqual(JSON.parse(content.text), result.structuredContent);
    console.log(`PASS: ${name}`);
    return result.structuredContent;
  }
  assert.deepEqual((await call('astra.list_rooms')).rooms, []);
  const created = await call('astra.create_room', { name: 'Cleanroom diagnostic', width: 12.192, depth: 12.192, height: 3.048 });
  assert.deepEqual(created.document.room, [12.192, 12.192, 3.048]);
  assert.deepEqual(JSON.parse(readFileSync(join(root, created.path), 'utf8')), created.document);
  assert.deepEqual((await call('astra.read_room', { id: created.id })).document, created.document);
  assert.equal((await call('astra.list_rooms')).rooms.length, 1);
  stage = 'invalid arguments';
  assert.equal((await client.callTool({ name: 'astra.create_room', arguments: { name: 'Invalid' } }, undefined, { timeout: 5000 })).isError, true);
  await client.close();
  stage = 'diagnostic trace';
  const events = trace.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  assert.equal(readFileSync(join(root, '.astra', 'mcp-debug.jsonl'), 'utf8'), trace);
  assert.equal(events.filter(item => item.event === 'tool-call-received').length, 5);
  assert.equal(events.filter(item => item.event === 'tool-call-succeeded').length, 4);
  assert.equal(events.filter(item => item.event === 'tool-call-failed').length, 1);
  assert.ok(events.every(item => Object.keys(item).every(key => ['source', 'event', 'tool'].includes(key))));
  console.log('PASS: saved JSON, error responses, and payload-free stderr tracing');
  console.log('The MCP server and SDK calls work. If OpenCode still fails, collect its version and error stack as described in README. This does not test model execution or OpenCode plugins.');
} catch (error) {
  console.error(`FAIL at ${stage}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  await client.close();
  rmSync(root, { recursive: true, force: true });
}
