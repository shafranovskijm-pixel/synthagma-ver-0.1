import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as esbuild from 'esbuild';
import { buildSupportMcpEvents } from './support-mcp-events-build.mjs';

const root = process.cwd();
const out = path.join(root, 'outputs/mcp-wrapper-native-ci');
const shared = 'supabase/functions/_shared/support-mcp-events/';
const generated = 'supabase/functions/mcp/index.ts';
const boundary = '// lovable-mcp-supabase-entry.ts';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const previous = { baseCommit: 'bddf4080cf85d6646113986cbc261bd35174fbc6', workflowRun: 41492996380, adapterSha256: '2e04e091778d8a51de0c30bc3856338560f76fc18628c5ed522cf3d3609bff4f' };
const sourceFiles = [
  'vite.config.ts', 'scripts/support-mcp-events-build.mjs', 'scripts/support-mcp-events-build.test.mjs',
  ...['protocol.ts', 'protocol.test.ts', 'runtime-backend.ts', 'runtime-backend.test.ts', 'runtime-entry.ts'].map(p => shared + p),
];
const workerFiles = [...['crypto.ts', 'callback-policy.ts', 'native-http1.ts', 'native-deno-https.ts', 'pinned-https.ts', 'webhooks.ts', 'delivery.ts', 'worker-http.ts'].map(p => shared + p), 'supabase/functions/support-event-delivery/index.ts'];
async function allFiles(dir) {
  const result = [];
  for (const e of await fs.readdir(path.join(root, dir), { withFileTypes: true })) {
    const item = `${dir}/${e.name}`;
    result.push(...(e.isDirectory() ? await allFiles(item) : [item]));
  }
  return result.sort();
}
async function hashes(files) {
  const result = {};
  for (const file of files) result[file] = sha(await fs.readFile(path.join(root, file)));
  return result;
}
function prefix(source) {
  assert.equal(source.split(boundary).length, 2, 'one SDK entry boundary');
  return source.split(boundary)[0];
}
const toolNames = ['whoami', 'get_my_profile', 'search_sintagma_invoices', 'get_sintagma_invoice_export', 'search_sintagma_billing_organizations', 'preview_sintagma_invoice_act', 'create_sintagma_invoice_act', 'get_sintagma_postpaid_billing_overview', 'prepare_sintagma_postpaid_statement', 'preview_sintagma_postpaid_statement', 'approve_sintagma_postpaid_statement', 'issue_sintagma_postpaid_invoice', 'search_sintagma_support_requests', 'get_sintagma_support_request'];
async function invariants() {
  const source = await fs.readFile(path.join(root, generated), 'utf8');
  const body = prefix(source);
  for (const name of toolNames) assert.equal(body.split(`name: "${name}"`).length - 1, 1, name);
  assert.ok(body.includes('acceptedAudiences: "authenticated"'));
  assert.ok(body.includes('auth: auth.oauth.issuer({'));
  assert.match(await fs.readFile(path.join(root, shared + 'pinned-https.ts'), 'utf8'), /DENO_NODE_HTTPS_PINNING_PROVEN\s*=\s*false/);
  assert.match(await fs.readFile(path.join(root, shared + 'native-deno-https.ts'), 'utf8'), /DENO_NATIVE_HTTPS_PINNING_PROVEN\s*=\s*false/);
  return { prefixSha256: sha(body), mcpSources: await hashes(await allFiles('src/lib/mcp')), workerSources: await hashes(workerFiles), candidateSources: await hashes(sourceFiles), toolNames };
}
await fs.mkdir(out, { recursive: true });
const mode = process.argv[2];
if (mode === 'capture') {
  await fs.writeFile(path.join(out, 'baseline.json'), JSON.stringify({ baseCommit: process.env.WRAPPER_CI_BASE, ...(await invariants()) }, null, 2) + '\n');
} else if (mode === 'verify') {
  const before = JSON.parse(await fs.readFile(path.join(out, 'baseline.json'), 'utf8'));
  const after = await invariants();
  for (const field of ['prefixSha256', 'mcpSources', 'workerSources', 'candidateSources', 'toolNames']) assert.deepEqual(after[field], before[field], field);
  let graph;
  const first = await buildSupportMcpEvents(root, { esbuild: { async build(options) {
    const result = await esbuild.build({ ...options, metafile: true });
    graph = result.metafile;
    return result;
  } } });
  const second = await buildSupportMcpEvents(root);
  assert.equal(first.alreadyWrapped, true);
  assert.equal(second.alreadyWrapped, true);
  assert.equal(first.entrySha256, second.entrySha256);
  assert.equal(first.adapterSha256, second.adapterSha256);
  assert.notEqual(second.adapterSha256, previous.adapterSha256, 'old Node-only wrapper bundle cannot describe native dependency closure');
  assert.ok(graph && graph.inputs && graph.outputs, 'actual esbuild graph');
  const inputs = Object.keys(graph.inputs).sort();
  for (const name of ['runtime-entry.ts', 'runtime-backend.ts', 'protocol.ts', 'crypto.ts', 'callback-policy.ts', 'native-http1.ts', 'native-deno-https.ts', 'pinned-https.ts', 'webhooks.ts', 'delivery.ts', 'worker-http.ts']) assert.ok(inputs.includes(shared + name), name);
  assert.ok(inputs.every(p => !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p)), 'no test module in runtime graph');
  const externals = Object.values(graph.outputs).flatMap(o => o.imports).filter(i => i.external).map(i => i.path).sort();
  assert.ok(externals.includes('npm:@supabase/supabase-js@2.90.1'));
  const source = await fs.readFile(path.join(root, generated), 'utf8');
  const bundle = await fs.readFile(path.join(root, shared + 'runtime.bundle.mjs'), 'utf8');
  assert.equal(source.split('// SINTAGMA_SUPPORT_MCP_EVENTS_POSTBUILD_V1').length - 1, 1);
  assert.match(bundle, /DENO_NODE_HTTPS_PINNING_PROVEN\s*=\s*false/);
  assert.match(bundle, /DENO_NATIVE_HTTPS_PINNING_PROVEN\s*=\s*false/);
  const result = { status: 'NATIVE_BASE_CI_SOURCE_BUILD_ONLY_NOT_EDGE_ACCEPTANCE_NOT_CLOUD_SUBSCRIPTION', baseCommit: before.baseCommit, node: process.version, nodePinningMarker: false, nativePinningMarker: false, databaseWrites: 0, databaseRuntimeNotAccessed: true, externalCallbacks: 0, previousBundle: { ...previous, applicableToThisBase: false }, ...after, build: second, graphInputs: inputs, graphExternals: externals };
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(out, 'adapter-metafile.json'), JSON.stringify(graph, null, 2) + '\n');
  await fs.copyFile(path.join(root, generated), path.join(out, 'generated-mcp-index.ts'));
  await fs.copyFile(path.join(root, shared + 'runtime.bundle.mjs'), path.join(out, 'runtime.bundle.mjs'));
  console.log(JSON.stringify({ status: result.status, toolCount: toolNames.length, adapterSha256: second.adapterSha256, entrySha256: second.entrySha256, nodePinningMarker: false, nativePinningMarker: false, previousBundleApplicable: false }));
} else throw new Error('expected_capture_or_verify');
