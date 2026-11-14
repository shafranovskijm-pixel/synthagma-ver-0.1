import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionSourceVerifier, createBoundedFetch } from '../question-source-verifier.ts';
import { sha256 } from '../official-client.ts';
import { NOW, RUN, H, ROOT, CATALOG, SECTION, PDF, PDF_BYTES, claim, sourceFixture } from './runtime-fixtures.mjs';

const dependencies = h => ({ fetch: h.fetcher, storeForSignal: h.storeForSignal, now: () => new Date(NOW), deadlineAtMs: Date.parse(NOW) + 90_000 });

test('fresh fixed service→latest catalog→uniqueA1→PDF; old claim URLs never fetched', async () => {
  const h = sourceFixture(), c = claim();
  const observed = await createQuestionSourceVerifier(c, dependencies(h))(c.question_source);
  assert.deepEqual(h.calls.map(x => x.url), [ROOT, CATALOG, SECTION, PDF]);
  assert.ok(h.calls.every(x => x.init.redirect === 'manual' && x.init.credentials === 'omit' && !x.init.headers.has('authorization') && !x.init.headers.has('apikey') && !x.init.headers.has('cookie')));
  assert.notEqual(observed.sha256, c.question_source.sha256); // new official PDF is a positive fact, not rejected.
  assert.equal(observed.sha256, await sha256(PDF_BYTES));
  assert.equal(observed.artifact.path, `npa250/${RUN}/${observed.sha256}.pdf`);
  assert.equal(observed.artifact.request_url, PDF);
  assert.equal(observed.source_generation, 3); assert.equal(observed.parent_normalization_sha256, H);
  assert.equal(observed.child_normalization_sha256, '2'.repeat(64)); assert.equal(observed.catalog_complete, true);
  assert.equal(h.writes.length, 1); assert.deepEqual(h.writes[0].bytes, PDF_BYTES);
  assert.equal(h.sourceSignals[0].aborted, true); // operation resources disposed, immutable bytes already stored.
  assert.ok(!('catalog_html' in observed) && !('source_code' in observed));
});
for (const mutation of [{ source_code: 'another-code' }, { trusted_anchor_rule: 'energy-xlsx' }, { parser: 'energy-xlsx' }]) test('unsupported private source family is unknown before fetch/storage: ' + Object.keys(mutation)[0], async () => {
  const h = sourceFixture(), c = claim(); Object.assign(c.question_source, mutation);
  await assert.rejects(() => createQuestionSourceVerifier(c, dependencies(h))(c.question_source), /UNSUPPORTED_QUESTION_SOURCE_FAMILY/);
  assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.sourceSignals.length, 0);
});
test('verifier binds immutable claimed source context and run, not a replacement object', async () => {
  const h = sourceFixture(), c = claim(), original = { ...c.question_source };
  const verify = createQuestionSourceVerifier(c, dependencies(h));
  c.question_source.source_generation = 99; c.run_id = '91000000-0000-4000-8000-000000000099';
  await assert.rejects(() => verify(c.question_source), /QUESTION_SOURCE_CONTEXT_CHANGED/);
  const result = await verify(original); assert.ok(result.artifact.path.startsWith(`npa250/${RUN}/`)); assert.equal(result.source_generation, 3);
});
for (const [where, html, code] of [
  [ROOT, '<a href="left/">Вопросы тестирования с 1 сентября 2026 г.</a><a href="right/">Вопросы тестирования с 1 сентября 2026 г.</a>', 'OFFICIAL_CATALOG_AMBIGUOUS'],
  [CATALOG, '<a href="a/">Общие требования промышленной безопасности</a><a href="b/">Общие требования промышленной безопасности</a>', 'OFFICIAL_A1_SECTION_AMBIGUOUS'],
  [SECTION, '<a href="a.pdf">А.1. Основы промышленной безопасности</a><a href="b.pdf">А.1. Основы промышленной безопасности</a>', 'OFFICIAL_AMBIGUOUS_DOCUMENT'],
]) test('ambiguous live markup fails closed at ' + where, async () => {
  const h = sourceFixture({ respond: url => url === where ? new Response(html) : null }), c = claim();
  await assert.rejects(() => createQuestionSourceVerifier(c, dependencies(h))(c.question_source), new RegExp(code));
  assert.equal(h.writes.length, 0);
});
test('off-origin redirects and a text masquerading as PDF cannot be stored', async t => {
  await t.test('redirect', async () => {
    const h = sourceFixture({ respond: url => url === ROOT ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }) : null }), c = claim();
    await assert.rejects(() => createQuestionSourceVerifier(c, dependencies(h))(c.question_source));
    assert.equal(h.calls.length, 1); assert.equal(h.writes.length, 0);
  });
  await t.test('HTML response with HTTP200', async () => {
    const h = sourceFixture({ respond: url => url === PDF ? new Response('<html>not a PDF</html>') : null }), c = claim();
    await assert.rejects(() => createQuestionSourceVerifier(c, dependencies(h))(c.question_source), /OFFICIAL_NOT_PDF/);
    assert.equal(h.writes.length, 0);
  });
  await t.test('16MiB cap before upload', async () => {
    const h = sourceFixture({ respond: url => url === PDF ? new Response(PDF_BYTES, { headers: { 'content-length': String(16 * 1024 * 1024 + 1) } }) : null }), c = claim();
    await assert.rejects(() => createQuestionSourceVerifier(c, dependencies(h))(c.question_source), /RESPONSE_TOO_LARGE|OFFICIAL_FILE_TOO_LARGE/);
    assert.equal(h.writes.length, 0);
  });
});
test('source operation deadline really aborts a stalled upload', async () => {
  let aborted = false;
  const h = sourceFixture({ put: (_input, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('synthetic upload aborted')); }, { once: true })) }), c = claim();
  await assert.rejects(() => createQuestionSourceVerifier(c, { ...dependencies(h), operationTimeoutMs: 15 })(c.question_source), /QUESTION_SOURCE_VERIFICATION_TIMEOUT|QUESTION_SOURCE_ABORTED/);
  assert.equal(aborted, true);
});
test('private upload keeps its own shorter cap inside a longer source operation', async () => {
  let aborted = false;
  const h = sourceFixture({ put: (_input, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('synthetic upload aborted')); }, { once: true })) }), c = claim();
  await assert.rejects(() => createQuestionSourceVerifier(c, { ...dependencies(h), operationTimeoutMs: 200, uploadTimeoutMs: 5 })(c.question_source), /QUESTION_SOURCE_PRIVATE_UPLOAD_TIMEOUT/);
  assert.equal(aborted, true);
});
test('whole-run abort and expired deadline stop source verification before network', async () => {
  const h = sourceFixture(), c = claim(), controller = new AbortController(); controller.abort();
  await assert.rejects(() => createQuestionSourceVerifier(c, { ...dependencies(h), signal: controller.signal })(c.question_source), /ABORTED/);
  await assert.rejects(() => createQuestionSourceVerifier(c, { ...dependencies(h), deadlineAtMs: Date.parse(NOW) })(c.question_source), /RUN_DEADLINE/);
  assert.equal(h.calls.length, 0);
});
test('private upload failure preserves no successful source observation or raw error detail', async () => {
  const h = sourceFixture({ put: () => { throw new Error('SYNTHETIC_KEY_SHOULD_NOT_LEAK'); } }), c = claim();
  await assert.rejects(() => createQuestionSourceVerifier(c, dependencies(h))(c.question_source), error => error.message === 'QUESTION_SOURCE_VERIFICATION_FAILED');
});
test('bounded transport times out the RESPONSE BODY, not only the returned headers', async () => {
  let canceled = false;
  const fetcher = createBoundedFetch(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(Uint8Array.of(1)); }, cancel() { canceled = true; } })), { timeoutMs: 8, allowUrl: url => url.origin === 'https://fixture.invalid' });
  const response = await fetcher('https://fixture.invalid/body');
  await assert.rejects(() => response.arrayBuffer(), /REQUEST_TIMEOUT|RESPONSE_UNAVAILABLE/);
  assert.equal(canceled, true);
});
test('validated URL is captured before scheduling; a later mutable URL change cannot forward credentials', async () => {
  const seen = [];
  const fetcher = createBoundedFetch(async (input, init) => { seen.push({ url: String(input), key: init.headers.get('apikey') }); return new Response('{}'); }, { timeoutMs: 1000, allowUrl: url => url.origin === 'https://project.synthetic.invalid' });
  const target = new URL('https://project.synthetic.invalid/rest/v1/rpc/check');
  const response = fetcher(target, { headers: { apikey: 'SYNTHETIC_ONLY' } });
  target.hostname = 'foreign.synthetic.invalid';
  await (await response).text();
  assert.deepEqual(seen, [{ url: 'https://project.synthetic.invalid/rest/v1/rpc/check', key: 'SYNTHETIC_ONLY' }]);
});
test('native Request snapshot preserves POST method/body/header when caller headers change later', async () => {
  let observed;
  const fetcher = createBoundedFetch(async (input, init) => {
    assert.ok(input instanceof Request);
    observed = { url: input.url, method: input.method, body: await input.text(), header: init.headers.get('X-Original') };
    return new Response('{}');
  }, { timeoutMs: 1000, allowUrl: url => url.origin === 'https://project.synthetic.invalid' });
  const original = new Request('https://project.synthetic.invalid/rest/v1/rpc/check', { method: 'POST', headers: { 'X-Original': 'before' }, body: 'exact body' });
  const response = fetcher(original);
  original.headers.set('X-Original', 'after');
  await (await response).text();
  assert.deepEqual(observed, { url: 'https://project.synthetic.invalid/rest/v1/rpc/check', method: 'POST', body: 'exact body', header: 'before' });
});
