import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createNpaExecutor } from '../executor.ts';
import { createPrivateArtifactStore } from '../artifact-store.ts';

// Explicit synthetic RPC/Storage adapters: no real service credential, HTTP,
// OAuth, object upload, DML or claim impersonation is exercised by this suite.
const RUN = '92000000-0000-4000-8000-000000000001';
const LEASE = '92000000-0000-4000-8000-000000000002';
const OTHER = '92000000-0000-4000-8000-000000000003';
const claim = { protocol: 'rtn-npa-v1', worker_version: 'rtn-npa-official-v1', run_id: RUN, lease_token: LEASE, lease_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() };
const observation = { protocol: 'rtn-npa-v1', status: 'unknown', runtime_egress_verified: false };
const receipt = { run_id: RUN, receipt_id: null, outcome: 'unknown', confirmed_findings: 0, finding_epoch: 0, valid_until_exclusive: null, stale_manifest: false };
function executorFixture(options = {}) {
  const calls = { rpc: [], dependencies: [], observe: [] };
  const service = { async rpc(name, args) {
    calls.rpc.push({ name, args });
    if (options.fail === name) return { data: null, error: { code: 'SYNTHETIC_PRIVATE_ERROR' } };
    return { data: name === 'claim_rtn_npa_check' ? ('claim' in options ? options.claim : claim) : name === 'complete_rtn_npa_check' ? (options.receipt ?? receipt) : 1, error: null };
  } };
  const executor = createNpaExecutor(service, value => { calls.dependencies.push(value); return { privateArtifactStore: { async put() { throw new Error('not a live store'); } } }; }, async (value, deps) => {
    calls.observe.push({ value, deps }); if (options.observerThrows) throw new Error('synthetic worker crash');
    if (options.mutateClaim) { value.run_id = OTHER; value.lease_token = OTHER; }
    return observation;
  });
  return { executor, calls };
}
test('executor claims only the server-authorized durable run and completes once with observed facts', async () => {
  const f = executorFixture(); assert.deepEqual(await f.executor.execute(RUN), receipt);
  assert.deepEqual(f.calls.rpc, [
    { name: 'claim_rtn_npa_check', args: { p_run_id: RUN } },
    { name: 'complete_rtn_npa_check', args: { p_run_id: RUN, p_lease_token: LEASE, p_result: observation } },
  ]); assert.equal(f.calls.observe.length, 1); assert.equal(f.calls.dependencies.length, 1);
});
test('unclaimed work is idle without an invented completion', async () => {
  const f = executorFixture({ claim: null }); assert.equal(await f.executor.execute(null), null); assert.equal(f.calls.rpc.length, 1); assert.equal(f.calls.observe.length, 0);
});
test('service-only enqueue uses no caller scope or browser proof', async () => {
  const f = executorFixture(); await f.executor.enqueueDue(); assert.deepEqual(f.calls.rpc, [{ name: 'enqueue_due_rtn_npa_checks', args: undefined }]);
});
for (const invalid of [{ ...claim, run_id: OTHER }, { ...claim, lease_token: 'bad' }, { ...claim, protocol: 'untrusted' }, { ...claim, lease_expires_at: undefined }, { ...claim, lease_expires_at: 'bad' }, { ...claim, lease_expires_at: new Date(Date.now() - 1000).toISOString() }]) {
  test('mismatched service lease never reaches network observation: ' + JSON.stringify(invalid), async () => {
    const f = executorFixture({ claim: invalid }); await assert.rejects(f.executor.execute(RUN), /INVALID_SERVER_LEASE/); assert.equal(f.calls.observe.length, 0); assert.equal(f.calls.rpc.length, 1);
  });
}
test('a lost completion is not hidden by complete(error) or a second claim', async () => {
  const f = executorFixture({ fail: 'complete_rtn_npa_check' }); await assert.rejects(f.executor.execute(RUN), /DATABASE_UNAVAILABLE/);
  assert.equal(f.calls.rpc.filter(x => x.name === 'complete_rtn_npa_check').length, 1); assert.equal(f.calls.observe.length, 1);
});
test('an observer cannot replace the already validated completion target or lease', async () => {
  const f = executorFixture({ claim: { ...claim }, mutateClaim: true }); assert.deepEqual(await f.executor.execute(RUN), receipt);
  assert.deepEqual(f.calls.rpc[1].args, { p_run_id: RUN, p_lease_token: LEASE, p_result: observation });
});
test('observer crash keeps the durable lease uncertain rather than inventing a result', async () => {
  const f = executorFixture({ observerThrows: true }); await assert.rejects(f.executor.execute(RUN), /synthetic worker crash/); assert.equal(f.calls.rpc.length, 1);
});
test('a completion for another run cannot be returned as this result', async () => {
  const f = executorFixture({ receipt: { ...receipt, run_id: OTHER } }); await assert.rejects(f.executor.execute(RUN), /INVALID_COMPLETION_RECEIPT/); assert.equal(f.calls.rpc.length, 2);
});
const bytes = new TextEncoder().encode('{"synthetic":"official public artifact"}\n');
const hash = createHash('sha256').update(bytes).digest('hex');
const input = { bucket: 'rtn-sources', path: `npa250/${RUN}/${hash}.json`, bytes, contentType: 'application/json; charset=utf-8' };
function storeFixture(options = {}) {
  const calls = { bucket: [], uploads: [], downloads: [] };
  const storage = { from(bucket) { calls.bucket.push(bucket); return {
    async upload(path, body, config) { calls.uploads.push({ path, body, config }); return { error: options.error ?? null }; },
    async download(path) { calls.downloads.push(path); return { data: 'existing' in options ? options.existing : new Blob([bytes]), error: options.downloadError ?? null }; },
  }; } };
  return { store: createPrivateArtifactStore(storage, RUN), calls };
}
test('private artifact writes are run-bound, content-addressed and never upsert', async () => {
  const f = storeFixture(); await f.store.put(input); assert.deepEqual(f.calls.bucket, ['rtn-sources']);
  assert.deepEqual(f.calls.uploads[0].config, { contentType: 'application/json', upsert: false }); assert.equal(f.calls.downloads.length, 0);
});
test('mutable caller input cannot change the validated run path or uploaded bytes after hashing starts', async () => {
  const f = storeFixture(); const mutable = { ...input, bytes: Uint8Array.from(bytes) };
  const pending = f.store.put(mutable);
  mutable.path = mutable.path.replace(RUN, OTHER); mutable.bytes[1] ^= 1; mutable.contentType = 'text/javascript';
  await pending; assert.equal(f.calls.uploads[0].path, input.path); assert.deepEqual(f.calls.uploads[0].body, bytes);
  assert.deepEqual(f.calls.uploads[0].config, { contentType: 'application/json', upsert: false });
});
for (const wrong of [{ ...input, bucket: 'public' }, { ...input, path: input.path.replace(RUN, OTHER) }, { ...input, path: input.path.replace(hash, 'a'.repeat(64)) }, { ...input, path: `npa250/${RUN}/../${hash}.json` }, { ...input, contentType: 'text/javascript' }, { ...input, bytes: new Uint8Array() }]) {
  test('invalid artifact cannot reach a storage bucket: ' + wrong.path + '/' + wrong.contentType, async () => {
    const f = storeFixture(); await assert.rejects(f.store.put(wrong)); assert.equal(f.calls.bucket.length, 0); assert.equal(f.calls.uploads.length, 0);
  });
}
test('replayed identical original is read and verified without overwriting', async () => {
  const f = storeFixture({ error: { statusCode: 409, message: 'The resource already exists' } }); await f.store.put(input);
  assert.equal(f.calls.uploads.length, 1); assert.equal(f.calls.downloads.length, 1); assert.equal(f.calls.uploads[0].config.upsert, false);
});
test('same-size conflicting original fails its byte hash and is never repaired/overwritten', async () => {
  const different = Uint8Array.from(bytes); different[1] ^= 1;
  const f = storeFixture({ error: { statusCode: 409, message: 'Duplicate' }, existing: new Blob([different]) });
  await assert.rejects(f.store.put(input), /EXISTING_BYTES_CONFLICT/); assert.equal(f.calls.uploads.length, 1);
});
test('storage outage is not mistaken for an idempotent original', async () => {
  const f = storeFixture({ error: { statusCode: 503, message: 'SYNTHETIC_PRIVATE_ERROR' } }); await assert.rejects(f.store.put(input), /STORAGE_UNAVAILABLE/); assert.equal(f.calls.downloads.length, 0);
});
