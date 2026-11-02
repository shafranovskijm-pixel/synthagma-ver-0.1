import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// CI-only type checker. No deno run/test/eval, application entry, callbacks,
// database, production configuration or generated MCP entry is executed here.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'outputs/ready-mcp-events-ci');
const shared = 'supabase/functions/_shared/support-mcp-events';
const baseline = 'scripts/.support-events-ci-baseline/_shared/support-mcp-events';
const entries = ['crypto.ts', 'webhooks.ts', 'worker-http.ts'];
const runtimeFiles = ['crypto.ts', 'callback-policy.ts', 'pinned-https.ts', 'native-http1.ts',
  'native-deno-https.ts', 'webhooks.ts', 'delivery.ts', 'worker-http.ts'];
const baselineCommit = '73d1baaa87de530bdf612491fb87a995beb1ab4d';
const baselineOwnedBlobs = {
  'crypto.ts': '06a5b0efbadb88021eb3b1c18836b97ad5f47612',
  'webhooks.ts': 'e5cc468eedcccdecd7fd733f35c744c74c401e8b',
  'worker-http.ts': 'aafc7cda13ca88ceb6ee38e64cc4d36bc5bae87c',
};
const expectedVersions = { '2.1.4': '5.6.2', '2.8.3': '6.0.3' };
const baselineSeven = [
  { file: 'crypto.ts', line: 34, col: 59, code: 'TS2345' },
  { file: 'crypto.ts', line: 58, col: 38, code: 'TS2769' },
  { file: 'crypto.ts', line: 66, col: 80, code: 'TS2322' },
  { file: 'crypto.ts', line: 75, col: 71, code: 'TS2322' },
  { file: 'crypto.ts', line: 75, col: 75, code: 'TS2322' },
  { file: 'webhooks.ts', line: 28, col: 40, code: 'TS2769' },
  { file: 'worker-http.ts', line: 30, col: 38, code: 'TS2769' },
];
// Exact public registry lock bytes from the reviewed isolated 2.1.4 fixture.
// Pins implicit @types/node22.5.4 and undici-types6.19.8; not a secret.
const nodeTypesLock = Buffer.from('ew0KICAidmVyc2lvbiI6ICI0IiwNCiAgInNwZWNpZmllcnMiOiB7DQogICAgIm5wbTpAdHlwZXMvbm9kZUAqIjogIjIyLjUuNCINCiAgfSwNCiAgIm5wbSI6IHsNCiAgICAiQHR5cGVzL25vZGVAMjIuNS40Ijogew0KICAgICAgImludGVncml0eSI6ICJzaGE1MTItRkR1S1VKUW0vanU5ZlQvU2VYLzYrZ0J6b1B6bFZDemZ6bUdrd0t2UkhRVnhpNEJudFZieUl3ZjZhNFhuNjJtcnZuZExpbWw2ei9VQlhJZEVWalFMWGc9PSIsDQogICAgICAiZGVwZW5kZW5jaWVzIjogWw0KICAgICAgICAidW5kaWNpLXR5cGVzIg0KICAgICAgXQ0KICAgIH0sDQogICAgInVuZGljaS10eXBlc0A2LjE5LjgiOiB7DQogICAgICAiaW50ZWdyaXR5IjogInNoYTUxMi12ZTJLUDZmL0puYlBCRnlvYkdIdWVyQzlnMUZZR24vRjhuMUxXVHdOeENFemQ2SWZxVHdVUWNOWGdFdG1tUTZEbFJyQzFoclNyQm5DWlBva1JyREhqdz09Ig0KICAgIH0NCiAgfQ0KfQ0K', 'base64');
const nodeTypesLockSha = 'dcb4e539c3e6c59f2365fb0ed0226a4cd2838f6902332b23df5feaf92fd4e37c';
// Deno2.8.3 supplies these node builtin types itself for this owned-source graph.
// Separate frozen empty v5 lock; do not claim it reused the older v4 fixture.
const emptyV5Lock = Buffer.from('{"version":"5","specifiers":{}}\n');
const configBytes = Buffer.from(JSON.stringify({
  nodeModulesDir: 'none', compilerOptions: { strict: true },
}, null, 2) + '\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1')
  .update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
const withoutAnsi = text => text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '');

/** Parse every error header/location pair; silently dropping an error fails. */
export function parseDiagnostics(output) {
  const diagnostics = [];
  let pending;
  for (const line of withoutAnsi(output).split('\n')) {
    const header = /^(TS[0-9]+) \[ERROR\]:/.exec(line);
    if (header) {
      assert.equal(pending, undefined, 'diagnostic_without_location');
      pending = header[1];
    }
    const location = /^\s+at (.+):([0-9]+):([0-9]+)$/.exec(line);
    if (location && pending) {
      const sourcePath = location[1].startsWith('file:')
        ? fileURLToPath(location[1]) : location[1];
      diagnostics.push({ sourcePath: path.resolve(sourcePath),
        file: path.basename(sourcePath), line: Number(location[2]),
        col: Number(location[3]), code: pending });
      pending = undefined;
    }
  }
  assert.equal(pending, undefined, 'diagnostic_without_location');
  return diagnostics;
}
function positions(diagnostics) {
  return diagnostics.map(({ file, line, col, code }) => ({ file, line, col, code }))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col || a.code.localeCompare(b.code));
}
async function fileHashes(directory, names) {
  const result = {};
  for (const name of names) {
    const bytes = await fs.readFile(path.join(root, directory, name));
    result[name] = { bytes: bytes.length, sha256: sha(bytes), gitBlob: gitBlob(bytes) };
  }
  return result;
}
function childResult(binary, args, env) {
  const run = spawnSync(binary, args, {
    cwd: root, env, encoding: 'utf8', timeout: 180000,
    maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  return { exit: run.status, signal: run.signal,
    error: run.error ? { name: run.error.name, code: run.error.code ?? null } : null,
    output: (run.stdout ?? '') + (run.stderr ?? '') };
}
function validatePhase(item, directory, expected) {
  assert.equal(item.error, null, item.phase + '_spawn_failed');
  assert.equal(item.signal, null, item.phase + '_terminated');
  assert.equal(item.exit, expected.length ? 1 : 0, item.phase + '_unexpected_exit');
  const allowed = new Set(entries.map(name => path.resolve(root, directory, name)));
  assert.ok(item.diagnostics.every(d => allowed.has(d.sourcePath)), item.phase + '_diagnostic_outside_owned_entries');
  assert.deepEqual(positions(item.diagnostics), positions(expected), item.phase + '_diagnostics_changed');
  const log = withoutAnsi(item.output);
  assert.doesNotMatch(log, /Unsupported compiler options|options were ignored|TSGO/i, item.phase + '_nonstock_or_ignored_config');
  const otherErrors = log.split('\n').filter(line => /^error:/.test(line)
    && line !== 'error: Type checking failed.');
  assert.deepEqual(otherErrors, [], item.phase + '_non_type_error');
  if (expected.length) assert.match(log, new RegExp('^Found ' + expected.length + ' errors\\.$', 'm'));
  else assert.doesNotMatch(log, /\[ERROR\]|^error:/m, item.phase + '_unexpected_error_text');
}

async function main() {
  const [binary, version, ...extra] = process.argv.slice(2);
  assert.ok(binary && Object.hasOwn(expectedVersions, version) && extra.length === 0,
    'usage: node scripts/check-support-events-deno-types.mjs <deno-binary> <2.1.4|2.8.3>');
  await fs.mkdir(out, { recursive: true });
  const reportPath = path.join(out, 'types-' + version + '.json');
  const report = {
    status: 'FAIL', kind: 'DENO_OWNED_SOURCE_TYPECHECK_ONLY',
    requestedVersion: version, expectedTypescriptVersion: expectedVersions[version],
    baselineCommit, baselineDirectory: baseline, candidateDirectory: shared,
    entrypoints: entries, strict: true, checkAll: true,
    skipLibraryCheckingRequested: false, unsupportedCachedOnlyFlagUsed: false,
    codeExecution: false, applicationEntryChecked: false, callbacks: 0,
    databaseAccess: false, productionChanges: false, matchingPreview: 'UNKNOWN',
    offlineNotClaimed: true,
  };
  try {
    assert.equal(sha(nodeTypesLock), nodeTypesLockSha, 'embedded_node_types_lock_changed');
    const before = { baseline: await fileHashes(baseline, runtimeFiles),
      candidate: await fileHashes(shared, [...runtimeFiles, 'crypto-buffer.ts']) };
    for (const name of entries) {
      assert.equal(before.baseline[name].gitBlob, baselineOwnedBlobs[name], 'baseline_not_exact73d_' + name);
    }
    report.sources = before;
    const fixture = path.join(out, 'type-fixtures', version);
    await fs.mkdir(fixture, { recursive: true });
    const config = path.join(fixture, 'deno.json');
    const lock = path.join(fixture, 'deno.lock');
    const lockBytes = version === '2.1.4' ? nodeTypesLock : emptyV5Lock;
    await fs.writeFile(config, configBytes);
    await fs.writeFile(lock, lockBytes);
    report.configSha256 = sha(configBytes);
    report.lock = { format: version === '2.1.4' ? '4' : '5', sha256: sha(lockBytes),
      frozen: true, implicitNodeTypes: version === '2.1.4' ? '22.5.4 + undici6.19.8' : 'Deno builtin; empty npm graph' };
    const cache = path.join(root, 'node_modules/.cache/support-events-deno-types', version);
    await fs.mkdir(cache, { recursive: true });
    const env = { ...process.env, NO_COLOR: '1', DENO_NO_UPDATE_CHECK: '1', DENO_DIR: cache };
    // Pin stock CLI checker behavior; never inherit a preview/unstable tsgo mode
    // or supply authentication tokens to public type dependency resolution.
    for (const key of ['DENO_UNSTABLE_TSGO', 'DENO_FUTURE', 'DENO_AUTH_TOKENS', 'NODE_AUTH_TOKEN', 'NPM_TOKEN']) delete env[key];
    const tool = childResult(binary, ['--version'], env);
    await fs.writeFile(path.join(out, 'types-' + version + '-version.log'), tool.output);
    assert.equal(tool.error, null, 'version_spawn_failed');
    assert.equal(tool.signal, null, 'version_terminated');
    assert.equal(tool.exit, 0, 'version_failed');
    const versionText = withoutAnsi(tool.output);
    assert.match(versionText, new RegExp('^deno ' + version.replaceAll('.', '\\.') + '(?:\\s|$)', 'm'));
    assert.match(versionText, new RegExp('^typescript ' + expectedVersions[version].replaceAll('.', '\\.') + '(?:\\s|$)', 'm'));
    report.actualVersionOutput = versionText.trim();
    const results = [];
    for (const [phase, directory] of [['baseline', baseline], ['candidate', shared]]) {
      const args = ['check', '--config=' + config, '--lock=' + lock, '--frozen=true', '--all',
        ...entries.map(name => path.join(root, directory, name))];
      const result = { phase, args, ...childResult(binary, args, env) };
      await fs.writeFile(path.join(out, 'types-' + version + '-' + phase + '.log'), result.output);
      result.diagnostics = parseDiagnostics(result.output);
      results.push(result);
      const { output, ...safeResult } = result;
      report[phase] = safeResult;
    }
    validatePhase(results[0], baseline, version === '2.8.3' ? baselineSeven : []);
    validatePhase(results[1], shared, []);
    assert.deepEqual(await fs.readFile(lock), lockBytes, 'frozen_lock_modified');
    assert.deepEqual(await fs.readFile(config), configBytes, 'type_config_modified');
    assert.deepEqual(await fileHashes(baseline, runtimeFiles), before.baseline, 'baseline_source_modified');
    assert.deepEqual(await fileHashes(shared, [...runtimeFiles, 'crypto-buffer.ts']), before.candidate, 'candidate_source_modified');
    report.status = 'PASS';
    report.meaning = 'Exact selected Deno/TypeScript pair and owned-source diagnostics only; not Edge/POST/Cloud acceptance.';
  } catch (error) {
    report.failure = error instanceof Error ? error.message : 'typecheck_harness_failed';
    process.exitCode = 1;
  }
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, version, report: path.relative(root, reportPath),
    baselineDiagnostics: report.baseline?.diagnostics?.length ?? null,
    candidateDiagnostics: report.candidate?.diagnostics?.length ?? null,
    matchingPreview: 'UNKNOWN', codeExecution: false }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
