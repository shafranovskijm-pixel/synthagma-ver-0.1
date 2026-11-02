import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildSupportMcpEvents } from './support-mcp-events-build.mjs';

const root = process.cwd();
const out = path.join(root, 'outputs/mcp-wrapper-ci');
const shared = 'supabase/functions/_shared/support-mcp-events/';
const generated = 'supabase/functions/mcp/index.ts';
const boundary = '// lovable-mcp-supabase-entry.ts';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = [
  'vite.config.ts', 'scripts/support-mcp-events-build.mjs', 'scripts/support-mcp-events-build.test.mjs',
  ...['protocol.ts', 'protocol.test.ts', 'runtime-backend.ts', 'runtime-backend.test.ts', 'runtime-entry.ts'].map(p => shared + p),
];
const workerFiles = [...['crypto.ts', 'pinned-https.ts', 'webhooks.ts', 'delivery.ts', 'worker-http.ts'].map(p => shared + p), 'supabase/functions/support-event-delivery/index.ts'];
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
  const pinned = await fs.readFile(path.join(root, shared + 'pinned-https.ts'), 'utf8');
  assert.match(pinned, /DENO_NODE_HTTPS_PINNING_PROVEN\s*=\s*false/);
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
  const first = await buildSupportMcpEvents(root), second = await buildSupportMcpEvents(root);
  assert.equal(first.alreadyWrapped, true);
  assert.equal(second.alreadyWrapped, true);
  assert.equal(first.entrySha256, second.entrySha256);
  assert.equal(first.adapterSha256, second.adapterSha256);
  const source = await fs.readFile(path.join(root, generated), 'utf8');
  const bundle = await fs.readFile(path.join(root, shared + 'runtime.bundle.mjs'), 'utf8');
  assert.equal(source.split('// SINTAGMA_SUPPORT_MCP_EVENTS_POSTBUILD_V1').length - 1, 1);
  assert.match(bundle, /DENO_NODE_HTTPS_PINNING_PROVEN\s*=\s*false/);
  const result = { status: 'CI_SOURCE_BUILD_ONLY_NOT_DENO_ACCEPTANCE_NOT_CLOUD_SUBSCRIPTION', baseCommit: before.baseCommit, node: process.version, pinningMarker: false, databaseWrites: 0, externalCallbacks: 0, ...after, build: second };
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.copyFile(path.join(root, generated), path.join(out, 'generated-mcp-index.ts'));
  await fs.copyFile(path.join(root, shared + 'runtime.bundle.mjs'), path.join(out, 'runtime.bundle.mjs'));
  console.log(JSON.stringify({ status: result.status, toolCount: toolNames.length, adapterSha256: second.adapterSha256, entrySha256: second.entrySha256, pinningMarker: false }));
} else throw new Error('expected_capture_or_verify');
