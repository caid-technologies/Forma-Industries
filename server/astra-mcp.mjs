#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { callRoomTool, roomTools } from './mcp-rooms.mjs';

const root = resolve(process.env.ASTRA_ROOT || process.cwd());
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const localPath = value => {
  const candidate = resolve(root, value || '.astra/feedback/latest.json');
  const rel = relative(root, candidate);
  if (rel.startsWith('..') || rel.includes(':')) throw new Error('Astra MCP paths must stay inside the checkout.');
  return candidate;
};
const scrub = value => Array.isArray(value) ? value.map(scrub) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([key]) => !/(api.?key|secret|password|credential|authorization|token)/i.test(key)).map(([key, item]) => [key, scrub(item)]))
  : value;
const textResult = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value });

const tools = [
  ...roomTools,
  { name: 'astra.read_animation_feedback', description: 'Read the latest scrubbed Astra authored-animation review for Forma iteration.', inputSchema: { type: 'object', properties: {} } },
  { name: 'astra.read_forma_project', description: 'Read a local compiled Forma project manifest from the Astra checkout.', inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Checkout-relative path, usually demo/forma-project.json.' } } } },
  { name: 'astra.save_forma_project', description: 'Save a Forma MCP project_ir back into an existing compiled project manifest.', inputSchema: { type: 'object', properties: { path: { type: 'string' }, project_ir: { type: 'object' } }, required: ['path', 'project_ir'] } },
  { name: 'astra.list_feedback', description: 'List available Astra animation feedback packages.', inputSchema: { type: 'object', properties: {} } },
  { name: 'astra.write_space_brief', description: 'Record a space requirement for the Astra local demo planner.', inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['biofab', 'manufacturing', 'maker'] }, requirements: { type: 'string' } }, required: ['kind', 'requirements'] } },
];

function callTool(name, args = {}) {
  if (roomTools.some(tool => tool.name === name)) return callRoomTool(root, name, args);
  if (name === 'astra.read_animation_feedback') {
    const path = localPath('.astra/feedback/latest.json');
    if (!existsSync(path)) throw new Error('No Astra animation feedback exists yet. Render an authored timeline animation and send feedback from GIF studio.');
    return scrub(json(path));
  }
  if (name === 'astra.read_forma_project') {
    const path = localPath(args.path || 'demo/forma-project.json');
    if (!existsSync(path)) throw new Error(`Forma project was not found: ${args.path || 'demo/forma-project.json'}`);
    return scrub(json(path));
  }
  if (name === 'astra.save_forma_project') {
    if (!args.project_ir || typeof args.project_ir !== 'object' || Array.isArray(args.project_ir)) throw new Error('project_ir must be an object.');
    const path = localPath(args.path); if (!existsSync(path)) throw new Error(`Forma project was not found: ${args.path}`);
    const current = json(path); const next = { ...current, project_ir: scrub(args.project_ir), agent: current.agent || 'opencode' };
    const serialized = JSON.stringify(next, null, 2); if (Buffer.byteLength(serialized, 'utf8') > 10 * 1024 * 1024) throw new Error('Forma project exceeds the 10 MiB local MCP limit.');
    writeFileSync(path, serialized + '\n', 'utf8');
    return { saved: true, path: relative(root, path).replaceAll('\\', '/'), project_id: next.project_id || next.project_ir?.assembly_metadata?.project_id };
  }
  if (name === 'astra.list_feedback') {
    const directory = localPath('.astra/feedback');
    if (!existsSync(directory)) return { files: [] };
    return { files: readdirSync(directory).filter(file => file.endsWith('.json')).sort().reverse() };
  }
  if (name === 'astra.write_space_brief') {
    if (!['biofab', 'manufacturing', 'maker'].includes(args.kind) || typeof args.requirements !== 'string' || !args.requirements.trim() || args.requirements.length > 2000) throw new Error('Provide a supported space kind and requirements up to 2,000 characters.');
    const path = localPath('.astra/space-brief.json'); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ format: 'astra.space-brief', version: 1, kind: args.kind, requirements: args.requirements.trim(), createdAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');
    return { saved: true, path: '.astra/space-brief.json', message: 'Open Astra and choose Build space layout to materialize the brief.' };
  }
  throw new Error(`Unknown Astra MCP tool: ${name}`);
}

function response(id, result) { return { jsonrpc: '2.0', id, result }; }
function errorResponse(id, message) { return { jsonrpc: '2.0', id, error: { code: -32000, message } }; }
async function handle(request) {
  if (!Object.hasOwn(request, 'id')) return null;
  if (request.method === 'initialize') return response(request.id, { protocolVersion: '2025-06-18', serverInfo: { name: 'astra-industries', version: '0.1.0' }, capabilities: { tools: {} } });
  if (request.method === 'ping') return response(request.id, {});
  if (request.method === 'tools/list') return response(request.id, { tools });
  if (request.method === 'tools/call') {
    try { return response(request.id, textResult(callTool(request.params?.name, request.params?.arguments))); }
    catch (error) { return response(request.id, { content: [{ type: 'text', text: error.message }], isError: true }); }
  }
  return errorResponse(request.id, `Unsupported MCP method: ${request.method}`);
}

createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
  try { const request = JSON.parse(line); void handle(request).then(result => { if (result) process.stdout.write(JSON.stringify(result) + '\n'); }); }
  catch (error) { process.stdout.write(JSON.stringify(errorResponse(null, error.message)) + '\n'); }
});
