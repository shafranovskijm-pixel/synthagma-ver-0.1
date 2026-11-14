import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpaUserHandler, createNpaScheduledHandler } from '../http-handler.ts';

// All identities/services below are explicit synthetic adapters. These tests
// cannot establish real OAuth, Edge egress, managed cron or production success.
const BANK = '91000000-0000-4000-8000-000000000001';
const ORG = '91000000-0000-4000-8000-000000000002';
const RUN = '91000000-0000-4000-8000-000000000003';
const queued = { run_id: RUN, status: 'queued', queued_at: '2026-11-14T16:00:00Z' };
const complete = { run_id: RUN, receipt_id: null, outcome: 'unknown', confirmed_findings: 0, finding_epoch: 0, valid_until_exclusive: null, stale_manifest: false };
const request = (body, { method = 'POST', auth = true, headers = {} } = {}) => new Request('https://synthetic.invalid/rtn-npa-check', {
  method, headers: { ...(auth ? { authorization: 'Bearer SYNTHETIC_SESSION' } : {}), 'content-type': 'application/json', ...headers },
  ...(method === 'GET' || method === 'OPTIONS' ? {} : { body: JSON.stringify(body) }),
});
function userFixture(overrides = {}) {
  const calls = { auth: 0, user: [], rpc: [], execute: [], background: [], errors: 0 };
  const deps = {
    user(header) { calls.user.push(header); return {
      auth: { async getUser() { calls.auth++; return overrides.identity ?? { data: { user: { id: 'SYNTHETIC_ACTOR' } }, error: null }; } },
      async rpc(name, args) { calls.rpc.push({ name, args }); return overrides.reply ?? { data: queued, error: null }; },
    }; },
    async execute(id) { calls.execute.push(id); if (overrides.execute) return overrides.execute(id); return complete; },
    waitUntil(task) { calls.background.push(task); if (overrides.registrationThrows) throw new Error('synthetic registration unavailable'); },
    onBackgroundError() { calls.errors++; },
    bodyTimeoutMs: overrides.bodyTimeoutMs,
  };
  if (overrides.noBackground) delete deps.waitUntil;
  return { calls, handler: createNpaUserHandler(deps) };
}
test('missing bearer cannot construct a user client or service execution', async () => {
  const f = userFixture(); const r = await f.handler(request({ organizationId: ORG, bankId: BANK }, { auth: false }));
  assert.equal(r.status, 401); assert.equal(f.calls.user.length, 0); assert.equal(f.calls.execute.length, 0);
});
for (const identity of [{ data: { user: null }, error: null }, { data: { user: { id: 'synthetic' } }, error: { code: 'invalid' } }]) {
  test('failed genuine getUser adapter never queues a check: ' + JSON.stringify(identity), async () => {
    const f = userFixture({ identity }); assert.equal((await f.handler(request({ organizationId: ORG, bankId: BANK }))).status, 401);
    assert.equal(f.calls.auth, 1); assert.equal(f.calls.rpc.length, 0); assert.equal(f.calls.execute.length, 0);
  });
}
test('GET is rejected and preflight performs no authentication or queue work', async () => {
  const f = userFixture(); assert.equal((await f.handler(request({}, { method: 'GET' }))).status, 405);
  assert.equal((await f.handler(request({}, { method: 'OPTIONS', auth: false }))).status, 200); assert.equal(f.calls.auth, 0);
});
for (const body of [null, [], { operation: 'publish', bankId: BANK }, { operation: 'editorial', bankId: BANK, organizationId: ORG }, { bankId: BANK, organizationId: ORG, actorId: BANK }, { bankId: BANK, organizationId: ORG, runId: RUN }, { bankId: 'bad', organizationId: ORG }]) {
  test('rejects untrusted request fields before any RPC: ' + JSON.stringify(body), async () => {
    const f = userFixture(); assert.equal((await f.handler(request(body))).status, 400); assert.equal(f.calls.rpc.length, 0); assert.equal(f.calls.execute.length, 0);
  });
}
test('byte limit applies with and without content length', async () => {
  for (const headers of [{ 'content-length': '5000' }, {}, { 'content-length': 'not-a-number' }]) {
    const f = userFixture(); assert.equal((await f.handler(request({ bankId: BANK, organizationId: ORG, padding: 'x'.repeat(5000) }, { headers }))).status, 400);
    assert.equal(f.calls.rpc.length, 0);
  }
});
test('real user token is passed unchanged to the staff RPC; background202 is not a completed result', async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; }); const f = userFixture({ execute: () => pending });
  const r = await f.handler(request({ organizationId: ORG, bankId: BANK }));
  assert.equal(r.status, 202); assert.deepEqual(await r.json(), queued); assert.equal(f.calls.user[0], 'Bearer SYNTHETIC_SESSION');
  assert.deepEqual(f.calls.rpc, [{ name: 'request_rtn_npa_check', args: { p_organization_id: ORG, p_bank_id: BANK } }]);
  assert.deepEqual(f.calls.execute, [RUN]); assert.equal(f.calls.background.length, 1); finish(complete); await f.calls.background[0];
});
test('editorial flag must go through the real caller admin RPC, never service/admin claims', async () => {
  const f = userFixture(); const r = await f.handler(request({ operation: 'editorial', bankId: BANK }));
  assert.equal(r.status, 202); assert.deepEqual(f.calls.rpc, [{ name: 'request_rtn_npa_editorial_check', args: { p_bank_id: BANK } }]); await Promise.all(f.calls.background);
});
test('editorial permission denial does not claim a service run', async () => {
  const f = userFixture({ reply: { data: null, error: { code: '42501' } } });
  assert.equal((await f.handler(request({ operation: 'editorial', bankId: BANK }))).status, 403); assert.equal(f.calls.execute.length, 0);
});
test('forward-compatible completed durable receipt does not execute or invent unchanged', async () => {
  const done = { ...queued, status: 'completed' }; const f = userFixture({ reply: { data: done, error: null } });
  const r = await f.handler(request({ operation: 'editorial', bankId: BANK }));
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), done); assert.equal(f.calls.execute.length, 0); assert.equal(f.calls.background.length, 0);
});
test('slow authenticated body has a short deadline and cancels before queue/service work', async () => {
  let canceled = false; const f = userFixture({ bodyTimeoutMs: 5 });
  const r = await f.handler(new Request('https://synthetic.invalid', { method: 'POST', headers: { authorization: 'Bearer SYNTHETIC_SESSION' }, body: new ReadableStream({ cancel() { canceled = true; } }), duplex: 'half' }));
  assert.equal(r.status, 400); assert.equal(canceled, true); assert.equal(f.calls.rpc.length, 0); assert.equal(f.calls.execute.length, 0);
});
test('request abortion cancels a slow body before queue or worker execution', async () => {
  let canceled = false; const controller = new AbortController(); const f = userFixture();
  const pending = f.handler(new Request('https://synthetic.invalid', { method: 'POST', headers: { authorization: 'Bearer SYNTHETIC_SESSION' }, body: new ReadableStream({ cancel() { canceled = true; } }), duplex: 'half', signal: controller.signal }));
  setTimeout(() => controller.abort(), 1); assert.equal((await pending).status, 400); assert.equal(canceled, true); assert.equal(f.calls.rpc.length, 0);
});
test('invalid UTF8 cannot queue a run', async () => {
  const f = userFixture(); const r = await f.handler(new Request('https://synthetic.invalid', { method: 'POST', headers: { authorization: 'Bearer SYNTHETIC_SESSION' }, body: new Uint8Array([0xff]) }));
  assert.equal(r.status, 400); assert.equal(f.calls.rpc.length, 0);
});
test('queue failure remains503 and does not leak or execute a run', async () => {
  const f = userFixture({ reply: { data: null, error: { code: '57014', message: 'SYNTHETIC_PRIVATE_DETAIL' } } }); const r = await f.handler(request({ bankId: BANK, organizationId: ORG }));
  assert.equal(r.status, 503); assert.ok(!(await r.text()).includes('SYNTHETIC_PRIVATE_DETAIL')); assert.equal(f.calls.execute.length, 0);
});
for (const data of [{ ...queued, run_id: 'bad' }, { ...queued, status: 'unchanged' }, { ...queued, queued_at: 'bad' }, null]) {
  test('invalid queue receipt cannot launch a worker: ' + JSON.stringify(data), async () => {
    const f = userFixture({ reply: { data, error: null } }); assert.equal((await f.handler(request({ bankId: BANK, organizationId: ORG }))).status, 503); assert.equal(f.calls.execute.length, 0);
  });
}
test('background rejection is observed once and never retries/completes a second run', async () => {
  const f = userFixture({ execute: async () => { throw new Error('synthetic DB completion lost'); } });
  assert.equal((await f.handler(request({ bankId: BANK, organizationId: ORG }))).status, 202); await Promise.all(f.calls.background);
  assert.equal(f.calls.errors, 1); assert.deepEqual(f.calls.execute, [RUN]);
});
for (const override of [{ noBackground: true }, { registrationThrows: true }]) {
  test('unavailable background registration awaits the same single task: ' + JSON.stringify(override), async () => {
    const f = userFixture(override); assert.equal((await f.handler(request({ bankId: BANK, organizationId: ORG }))).status, 202);
    assert.deepEqual(f.calls.execute, [RUN]);
  });
}
function cronFixture(overrides = {}) {
  const calls = { auth: 0, enqueue: 0, execute: [] };
  return { calls, handler: createNpaScheduledHandler({
    async authenticate() { calls.auth++; if (overrides.authThrows) throw new Error('synthetic auth unavailable'); return overrides.denied ?? null; },
    async enqueueDue() { calls.enqueue++; if (overrides.enqueueThrows) throw new Error('synthetic queue unavailable'); return 1; },
    async execute(id) { calls.execute.push(id); if (overrides.executeThrows) throw new Error('synthetic completion lost'); return 'result' in overrides ? overrides.result : complete; },
    bodyTimeoutMs: overrides.bodyTimeoutMs,
  }) };
}
test('cron authentication precedes method and body; forbidden has no service effects', async () => {
  const f = cronFixture({ denied: new Response('denied', { status: 401 }) });
  assert.equal((await f.handler(request({ operation: 'editorial' }, { method: 'OPTIONS' }))).status, 401); assert.equal(f.calls.enqueue, 0); assert.equal(f.calls.execute.length, 0);
});
test('cron auth failure cannot fall back to user/admin authentication', async () => {
  const f = cronFixture({ authThrows: true }); assert.equal((await f.handler(request({ task: 'rtn-npa-reconciliation' }))).status, 503); assert.equal(f.calls.enqueue, 0);
});
for (const body of [{}, { task: 'rtn-source-reconciliation' }, { task: 'rtn-npa-reconciliation', runId: RUN }, { task: 'rtn-npa-reconciliation', operation: 'publish' }]) {
  test('cron only accepts its one static task: ' + JSON.stringify(body), async () => {
    const f = cronFixture(); assert.equal((await f.handler(request(body))).status, 400); assert.equal(f.calls.enqueue, 0); assert.equal(f.calls.execute.length, 0);
  });
}
test('cron idle is not an unchanged/renewed receipt', async () => {
  const f = cronFixture({ result: null }); const r = await f.handler(request({ task: 'rtn-npa-reconciliation' }));
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { status: 'idle' }); assert.equal(f.calls.enqueue, 1); assert.deepEqual(f.calls.execute, [null]);
});
test('cron preserves an explicit unknown outcome without inventing admission expiry', async () => {
  const f = cronFixture(); const r = await f.handler(request({ task: 'rtn-npa-reconciliation' })); assert.equal(r.status, 200); assert.deepEqual(await r.json(), complete);
});
test('cron only projects the declared completion fields and does not rewrite past committed expiry', async () => {
  const valid = { ...complete, receipt_id: BANK, outcome: 'unchanged', valid_until_exclusive: '2026-11-14T00:00:00Z' };
  const f = cronFixture({ result: { ...valid, injected_private_detail: 'SYNTHETIC_MUST_NOT_ESCAPE' } });
  const r = await f.handler(request({ task: 'rtn-npa-reconciliation' })); assert.equal(r.status, 200); assert.deepEqual(await r.json(), valid);
});
for (const invalid of [
  { run_id: RUN, outcome: 'unchanged', valid_until_exclusive: null },
  { ...complete, outcome: 'unchanged', valid_until_exclusive: '2026-11-21T00:00:00Z' },
  { ...complete, receipt_id: BANK, outcome: 'unchanged', stale_manifest: true, valid_until_exclusive: '2026-11-21T00:00:00Z' },
  { ...complete, valid_until_exclusive: '2026-11-21T00:00:00Z' },
  { ...complete, confirmed_findings: -1 }, { ...complete, finding_epoch: 1.5 }, { ...complete, stale_manifest: null },
]) {
  test('inconsistent completion cannot become a successful check: ' + JSON.stringify(invalid), async () => {
    const f = cronFixture({ result: invalid }); assert.equal((await f.handler(request({ task: 'rtn-npa-reconciliation' }))).status, 503);
  });
}
for (const failure of [{ executeThrows: true }, { enqueueThrows: true }, { result: { ...complete, outcome: 'invented' } }]) {
  test('cron queue/completion failures remain failures: ' + JSON.stringify(failure), async () => {
    const f = cronFixture(failure); assert.equal((await f.handler(request({ task: 'rtn-npa-reconciliation' }))).status, 503); assert.ok(f.calls.execute.length <= 1);
  });
}
