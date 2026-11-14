import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNpaRuntime, createActualRuntimeEgressProbe, SUPABASE_JS_PIN } from '../runtime.ts';
import { createNpaUserHandler, createNpaScheduledHandler } from '../http-handler.ts';
import { NOW, RUN, BANK, ORG, claim, completion, unknownResult, sourceFixture } from './runtime-fixtures.mjs';

const config = { url: 'https://project.synthetic.invalid', anonKey: 'SYNTHETIC_ANON_KEY', serviceRoleKey: 'SYNTHETIC_SERVER_KEY' };
const bearer = 'Bearer SYNTHETIC_CALLER_TOKEN';
const request = body => new Request('https://synthetic.invalid/rtn-npa-check', { method: 'POST', headers: { Authorization: bearer }, body: JSON.stringify(body) });
const identityFixture = await readFile(new URL('../fixtures/official/actual-pravo-fz116-search.json', import.meta.url));
const redFixture = await readFile(new URL('../fixtures/official/actual-pravo-fz116-redactions.json', import.meta.url));
function fixture(overrides = {}) {
  const clients = [], events = [], signals = [], uploads = [];
  let activeDeps;
  const createClient = (url, key, options) => {
    const role = key === config.anonKey ? 'anon' : 'service'; clients.push({ url, key, options, role });
    return {
      auth: { async getUser() { events.push({ kind: 'auth', role }); if (overrides.getUser) return overrides.getUser(options); return { data: { user: { id: 'SYNTHETIC_USER' } }, error: null }; } },
      rpc(name, args) {
        let signal;
        const operation = Promise.resolve().then(async () => {
          events.push({ kind: 'rpc', name, role, args, authorization: options.global.headers?.Authorization, aborted: signal?.aborted });
          if (overrides.rpc) { const response = await overrides.rpc(name, args, signal, role); if (response !== undefined) return response; }
          if (name.startsWith('request_')) return { data: { run_id: RUN, status: 'queued', queued_at: NOW }, error: null };
          if (name === 'claim_rtn_npa_check') return { data: claim(), error: null };
          if (name === 'complete_rtn_npa_check') {
            assert.equal(activeDeps?.signal.aborted, true, 'worker scope is disposed before a separate completion RPC');
            assert.equal(signal.aborted, false, 'completion has its own live deadline');
            return { data: completion(), error: null };
          }
          if (name === 'enqueue_due_rtn_npa_checks') return { data: 0, error: null };
          throw new Error('UNEXPECTED_SYNTHETIC_RPC');
        });
        operation.abortSignal = value => { signal = value; signals.push(value); return operation; };
        return operation;
      },
      storage: { from(bucket) { assert.equal(bucket, 'rtn-sources'); return {
        async upload(path, bytes, options) { uploads.push({ path, bytes, options }); return { error: null }; },
        async download() { throw new Error('UNEXPECTED_SYNTHETIC_DOWNLOAD'); },
      }; } },
    };
  };
  const dependencies = {
    createClient, now: () => new Date(NOW), projectFetch: async () => { throw new Error('NO_REAL_PROJECT_REQUESTS_IN_FIXTURE'); },
    ...(overrides.officialFetch ? { officialFetch: overrides.officialFetch } : {}),
    observe: async (c, deps) => {
      events.push({ kind: 'observe' }); activeDeps = deps;
      assert.equal(c.run_id, RUN); assert.equal(deps.limits.requestTimeoutMs, 15_000); assert.equal(deps.limits.sourceVerificationTimeoutMs, 35_000);
      if (overrides.observe) return overrides.observe(c, deps);
      return unknownResult();
    },
    ...(overrides.rpcTimeoutMs ? { rpcTimeoutMs: overrides.rpcTimeoutMs } : {}),
    ...(overrides.workerTimeoutMs ? { workerTimeoutMs: overrides.workerTimeoutMs } : {}),
  };
  return { runtime: createNpaRuntime(config, dependencies), clients, events, signals, uploads, dependencies };
}
test('user factory validates genuine identity and queues with original token before any service RPC', async () => {
  const f = fixture(), handler = createNpaUserHandler(f.runtime);
  const reply = await handler(request({ organizationId: ORG, bankId: BANK }));
  assert.equal(reply.status, 202);
  assert.deepEqual(f.events.map(e => e.kind === 'rpc' ? e.name : e.kind), ['auth', 'request_rtn_npa_check', 'claim_rtn_npa_check', 'observe', 'complete_rtn_npa_check']);
  const queued = f.events.find(e => e.name === 'request_rtn_npa_check');
  assert.equal(queued.role, 'anon'); assert.equal(queued.authorization, bearer); assert.deepEqual(queued.args, { p_organization_id: ORG, p_bank_id: BANK });
  for (const e of f.events.filter(e => e.name?.match(/claim_|complete_/))) { assert.equal(e.role, 'service'); assert.equal(e.authorization, undefined); }
  for (const c of f.clients) assert.deepEqual(c.options.auth, { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
  assert.deepEqual(Object.keys(f.runtime).sort(), ['enqueueDue', 'execute', 'user']);
  assert.equal(JSON.stringify(f.runtime), '{}');
});
test('failed getUser or denied editorial queue cannot initialize/execute service work', async () => {
  for (const options of [
    { getUser: async () => ({ data: { user: null }, error: { code: 'invalid' } }) },
    { rpc: async name => name.startsWith('request_') ? { data: null, error: { code: '42501' } } : undefined },
  ]) {
    const f = fixture(options), reply = await createNpaUserHandler(f.runtime)(request({ operation: 'editorial', bankId: BANK }));
    assert.ok([401, 403].includes(reply.status)); assert.ok(f.clients.every(c => c.role === 'anon')); assert.ok(!f.events.some(e => e.kind === 'observe'));
  }
});
test('separate cron only reaches server RPC after opaque authentication and exact task', async () => {
  const f = fixture(); let allowed = false;
  const handler = createNpaScheduledHandler({ ...f.runtime, authenticate: () => allowed ? null : new Response('denied', { status: 401 }) });
  assert.equal((await handler(request({ task: 'rtn-npa-reconciliation' }))).status, 401); assert.equal(f.clients.length, 0);
  allowed = true;
  const reply = await handler(request({ task: 'rtn-npa-reconciliation' })); assert.equal(reply.status, 200);
  assert.equal((await reply.json()).outcome, 'unknown'); assert.ok(f.clients.every(c => c.role === 'service'));
  assert.deepEqual(f.events.filter(e => e.kind === 'rpc').map(e => e.name), ['enqueue_due_rtn_npa_checks', 'claim_rtn_npa_check', 'complete_rtn_npa_check']);
});
test('whole worker abort still permits exactly one separate bounded completion with unknown facts', async () => {
  const f = fixture({ workerTimeoutMs: 5, observe: async (_c, deps) => { await new Promise(resolve => deps.signal.addEventListener('abort', resolve, { once: true })); return unknownResult(); } });
  const outcome = await f.runtime.execute(RUN); assert.equal(outcome.outcome, 'unknown');
  assert.equal(f.events.filter(e => e.name === 'complete_rtn_npa_check').length, 1);
});
test('completion timeout is uncertain and never triggers a second complete(error)', async () => {
  let completionSignal;
  const f = fixture({ rpcTimeoutMs: 5, rpc: async (name, _args, signal) => {
    if (name !== 'complete_rtn_npa_check') return undefined;
    completionSignal = signal;
    return new Promise(() => {});
  } });
  await assert.rejects(() => f.runtime.execute(RUN), /DATABASE_TIMEOUT/);
  assert.equal(completionSignal.aborted, true);
  assert.equal(f.events.filter(e => e.name === 'complete_rtn_npa_check').length, 1);
});
test('a claim with bad/expired lease is rejected before worker/storage/network dependencies', async () => {
  const f = fixture({ rpc: async name => name === 'claim_rtn_npa_check' ? { data: { ...claim(), lease_expires_at: '2026-11-14T15:59:59Z' }, error: null } : undefined });
  await assert.rejects(() => f.runtime.execute(RUN), /LEASE/);
  assert.equal(f.clients.length, 1); assert.ok(!f.events.some(e => e.kind === 'observe')); assert.equal(f.uploads.length, 0);
});
test('SDK exceptions and invalid configuration never return/log injected key text', async () => {
  const f = fixture({ rpc: async () => { throw new Error('SYNTHETIC_SERVER_KEY'); } });
  await assert.rejects(() => f.runtime.execute(RUN), error => !error.message.includes(config.serviceRoleKey) && error.message === 'RTN_NPA_DATABASE_UNAVAILABLE');
  for (const c of [{ ...config, anonKey: config.serviceRoleKey }, { ...config, url: 'https://user:password@project.synthetic.invalid' }, { ...config, serviceRoleKey: '' }]) assert.throws(() => createNpaRuntime(c, f.dependencies), /CONFIGURATION_REQUIRED/);
});
test('runtime question verifier keeps source-family constraints and actual claimed private run prefix', async () => {
  const source = sourceFixture(); let observed;
  const f = fixture({ officialFetch: source.fetcher, observe: async (c, deps) => { observed = await deps.verifyQuestionSource(c.question_source); return unknownResult(); } });
  await f.runtime.execute(RUN);
  assert.ok(observed.artifact.path.startsWith(`npa250/${RUN}/`)); assert.equal(f.uploads.length, 1);
  assert.equal(f.uploads[0].options.upsert, false); assert.equal(f.uploads[0].options.contentType, 'application/pdf');
  assert.equal(observed.source_generation, claim().question_source.source_generation);
});
test('no official transport is a false egress probe, never an implicit network success', async () => {
  let answer;
  const f = fixture({ observe: async (_c, deps) => { answer = await deps.runtimeEgressProbe(); await assert.rejects(() => deps.fetch('https://www.gosnadzor.ru/'), /NOT_CONNECTED/); return unknownResult(); } });
  await f.runtime.execute(RUN); assert.equal(answer, false);
});
test('actual runtime probe uses only fixed116 identity and current metadata, requiring today Moscow', async () => {
  for (const mode of ['good', 'stale-server', 'wrong-identity', 'not-ready-current']) {
    const seen = [];
    const fetcher = async input => {
      const url = new URL(input); seen.push(url);
      if (url.pathname.endsWith('/attrsearch/')) {
        const raw = JSON.parse(identityFixture); if (mode === 'wrong-identity') raw.docs[0].docid = 1; return new Response(JSON.stringify(raw));
      }
      const raw = JSON.parse(redFixture);
      if (mode === 'stale-server') raw.serverdate = '2026-11-13T00:00:00';
      if (mode === 'not-ready-current') raw.redactions.find(row => row.actual).redchecked = false;
      return new Response(JSON.stringify(raw));
    };
    const controller = new AbortController();
    const probe = createActualRuntimeEgressProbe(fetcher, { signal: controller.signal, deadlineAtMs: Date.parse(NOW) + 90_000, now: () => new Date(NOW) });
    assert.equal(await probe(), mode === 'good');
    assert.ok(seen.every(url => url.origin === 'http://actual.pravo.gov.ru:8000'));
    assert.ok(seen.length <= 2);
  }
});
test('production templates pin SDK, explicitly connect fetch and reuse generated cron auth', async () => {
  for (const endpoint of ['rtn-npa-check', 'rtn-npa-cron']) {
    const source = await readFile(new URL(`../../../${endpoint}/index.ts`, import.meta.url), 'utf8');
    assert.ok(source.includes(SUPABASE_JS_PIN)); assert.ok(source.includes('officialFetch: fetch, projectFetch: fetch'));
    if (endpoint === 'rtn-npa-cron') { assert.ok(source.includes('authenticateCronRequest')); assert.ok(source.includes('30 * * * *')); assert.ok(!source.includes('timingSafeEqual')); }
    else assert.ok(source.includes('EdgeRuntime.waitUntil(task)'));
  }
});
test('project SDK transport keeps original user token and anon key on the fixed project only', async () => {
  const seen = [];
  const runtime = createNpaRuntime(config, {
    now: () => new Date(NOW),
    createClient: (url, key, options) => ({
      auth: { getUser: async () => {
        const response = await options.global.fetch(url + '/auth/v1/user', { headers: { apikey: key, ...options.global.headers } });
        return response.json();
      } }, rpc() { throw new Error('not used'); }, storage: {},
    }),
    projectFetch: async (input, init) => { seen.push({ input, init }); return new Response(JSON.stringify({ data: { user: { id: 'SYNTHETIC_USER' } }, error: null })); },
  });
  const user = await runtime.user(bearer).auth.getUser(); assert.ok(user.data.user);
  assert.equal(seen.length, 1); assert.equal(seen[0].init.headers.get('Authorization'), bearer);
  assert.equal(seen[0].init.headers.get('apikey'), config.anonKey); assert.equal(seen[0].init.redirect, 'manual');
});
test('SDK cross-origin requests and project redirects fail before any credential forwarding', async () => {
  for (const mode of ['foreign-request', 'project-redirect']) {
    let calls = 0;
    const runtime = createNpaRuntime(config, {
      createClient: (url, key, options) => ({ auth: { getUser: async () => {
        const response = await options.global.fetch(mode === 'foreign-request' ? 'https://other.synthetic.invalid/auth/v1/user' : url + '/auth/v1/user', { headers: { apikey: key, ...options.global.headers } });
        return response.json();
      } }, rpc() { throw new Error('not used'); }, storage: {} }),
      projectFetch: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://other.synthetic.invalid/secret' } }); },
    });
    await assert.rejects(() => runtime.user(bearer).auth.getUser(), /UNTRUSTED_TRANSPORT_URL|API_REDIRECT_REJECTED/);
    assert.equal(calls, mode === 'foreign-request' ? 0 : 1);
  }
});
test('completion RPC deadline aborts an actual stalled project response body', async () => {
  let completionSignal, completes = 0, bodyCanceled = false;
  const runtime = createNpaRuntime(config, {
    now: () => new Date(NOW), rpcTimeoutMs: 8,
    createClient: (url, key, options) => ({ auth: { getUser() { throw new Error('not used'); } }, storage: {},
      rpc(name, args) {
        const promise = Promise.resolve().then(async () => {
          const reply = await options.global.fetch(url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: key }, body: JSON.stringify(args) });
          return { data: await reply.json(), error: null };
        });
        promise.abortSignal = () => promise; return promise;
      },
    }),
    projectFetch: async (input, init) => {
      if (String(input).endsWith('/claim_rtn_npa_check')) return new Response(JSON.stringify(claim()));
      completes++; completionSignal = init.signal;
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { bodyCanceled = true; } }));
    },
    observe: async () => unknownResult(),
  });
  await assert.rejects(() => runtime.execute(RUN), /DATABASE_TIMEOUT|REQUEST_ABORTED|RESPONSE_UNAVAILABLE|DATABASE_UNAVAILABLE/);
  assert.equal(completes, 1); assert.equal(completionSignal.aborted, true); assert.equal(bodyCanceled, true);
});
