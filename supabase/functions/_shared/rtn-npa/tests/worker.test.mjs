import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { OfficialClient, ProofError, assertOfficialUrl, sha256, canonicalJson } from '../official-client.ts';
import { LAW_116, observe116, actualUrl } from '../actual-pravo-116.ts';
import { parseSearchPage, searchUrl, discoverPublications } from '../publication-discovery.ts';
import { runOfficialNpaCheck } from '../worker.ts';

// No test uses a real network, Supabase client, Auth session or production key.
// API records retain exact government transport bytes; altered cases below are
// explicitly synthetic. This suite is NOT live production acceptance.
const fixture = name => readFile(new URL(`../fixtures/official/${name}`, import.meta.url));
const decodeJson = b => JSON.parse(b.toString('utf8'));
const saved = {};
for (const name of [
  'actual-pravo-fz116-search.json', 'actual-pravo-fz116-redactions.json',
  'actual-pravo-fz116-redactions-all-observed-mode.json', 'actual-pravo-fz116-cardfull.json',
  'actual-pravo-fz116-current-redtext.json', 'actual-pravo-fz116-future-redtext.json',
  'actual-pravo-law94-original-redactions.json', 'actual-pravo-law94-original-redtext.json',
  'publication-law94-card.html', 'publication-search-federal-zero-20261114.html',
  ...[1, 2, 3].map(i => `publication-search-federal-all-after-index-p${i}.html`),
]) saved[name] = await fixture(name);
const RUN = '11111111-2222-4333-8444-555555555555';
const NOW = '2026-11-14T12:00:00.000Z';
const H = '1'.repeat(64);
const basis = { country: 'RU', kind: 'FederalLaw', date: LAW_116.date, number: LAW_116.number, docid: LAW_116.docid, dochash: null };
function claim() {
  return { protocol: 'rtn-npa-v1', worker_version: 'rtn-npa-official-v1', run_id: RUN, lease_token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', lease_expires_at: '2026-11-14T12:05:00Z',
    bank_id: '00000000-0000-4000-8000-000000000001', release_id: '00000000-0000-4000-8000-000000000002', key_set_id: '00000000-0000-4000-8000-000000000003', manifest_id: null, manifest_version: 1, context_sha256: H, finding_epoch: 0,
    basis: [structuredClone(basis)], unsupported_basis: [], all_declared_basis_count: 1,
    question_source: { source_code: 'rtn-industrial-a1-public', trusted_anchor_rule: 'a1', parser: 'industrial-pdf', source_id: '00000000-0000-4000-8000-000000000004', page_url: 'https://www.gosnadzor.ru/ignored-client-url', document_url: 'http://127.0.0.1/must-not-fetch', sha256: H, source_generation: 1, parent_normalization_sha256: H, child_normalization_sha256: H },
    discovery_window: { from: '2026-11-14', to_exclusive: '2026-11-15' },
  };
}
function searchHtml(items, total = items.length, index = 1) {
  const count = `<div class="page-navigation-count notforprint">Показаны на странице: с ${(index - 1) * 200 + 1} по ${Math.min(index * 200, total)} из ${total}</div>`;
  return `<form name="search" method="get" id="consultant-search"></form><div id="documentListDiv">${count}<div class="documents-container"><div class="documents-table">${items.map(item => `<div class="documents-table-row"><a class="documents-item-name" href="/document/${item.id}">${item.title}</a><span>Дата опубликования: </span><span>${item.date || '09.04.2026'}</span></div>`).join('')}</div></div>${count}</div>`;
}
const law94 = { id: '0001202604090035', title: 'Федеральный закон от 09.04.2026 № 94-ФЗ "О внесении изменений в Федеральный закон "О промышленной безопасности опасных производственных объектов"' };
function harness(overrides = {}) {
  const calls = [], uploads = new Map();
  const seen = new Map();
  const store = { async put(input) { if (overrides.uploadFail) throw new Error('synthetic private storage failure'); uploads.set(input.path, input); } };
  const fetcher = async (raw, options) => {
    const url = new URL(raw); calls.push({ url: raw, options });
    const count = (seen.get(url.pathname) || 0) + 1; seen.set(url.pathname, count);
    if (overrides.respond) { const result = await overrides.respond(url, count); if (result) return result; }
    let file;
    if (url.pathname.endsWith('/attrsearch/')) file = 'actual-pravo-fz116-search.json';
    else if (url.pathname.endsWith('/cardfull/')) file = 'actual-pravo-fz116-cardfull.json';
    else if (url.pathname.endsWith('/redactions/')) {
      const param = JSON.parse(url.searchParams.get('t'));
      file = param.pnum ? 'actual-pravo-law94-original-redactions.json' : param.ttl === 3 ? 'actual-pravo-fz116-redactions-all-observed-mode.json' : 'actual-pravo-fz116-redactions.json';
    } else if (url.pathname.endsWith('/redtext')) {
      file = url.searchParams.get('t') === '477797' ? 'actual-pravo-fz116-current-redtext.json' : url.searchParams.get('t') === '490401' ? 'actual-pravo-law94-original-redtext.json' : 'actual-pravo-fz116-future-redtext.json';
    } else if (url.pathname === '/search') return new Response(overrides.search ?? saved['publication-search-federal-zero-20261114.html']);
    else if (url.pathname.startsWith('/document/')) file = 'publication-law94-card.html';
    else throw new Error(`Unexpected synthetic request: ${raw}`);
    return new Response(saved[file], { status: 200 });
  };
  const client = new OfficialClient(RUN, store, fetcher, () => new Date(NOW), overrides.limits);
  const question = async expected => ({ ...expected, fetched_at: NOW, catalog_complete: true,
    artifact: { path: `npa250/${RUN}/${H}.pdf`, sha256: H, bytes: 15, request_url: 'https://www.gosnadzor.ru/upload/source.pdf', http_status: 200, transport: 'https', received_at: NOW } });
  const deps = { privateArtifactStore: store, fetch: fetcher, now: () => new Date(NOW), limits: overrides.limits, runtimeEgressProbe: async () => true, verifyQuestionSource: question, ...overrides.dependencies };
  return { client, calls, uploads, deps };
}

test('recorded official fixture bytes exactly match the declared capture manifest', async () => {
  const manifest = decodeJson(await fixture('MANIFEST.json'));
  for (const entry of manifest.files) {
    const bytes = await fixture(entry.file);
    assert.equal(bytes.byteLength, entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  }
});
test('all41 editions, current exactUTF8 body, future94 and all legal annotations are preserved', async () => {
  const h = harness(), row = await observe116(h.client, basis);
  assert.equal(row.stable.current.redid, 477797);
  assert.equal(row.stable.current.text_sha256, '18ca9b7ff10b43f10cc02bc90d3fa92ec4ff6826db2fc307392623820819ae9b');
  assert.equal(row.stable.current.effective_from, '2026-09-01');
  assert.equal(row.stable.graph.canonical.editions.length, 41);
  assert.equal(row.stable.graph.canonical.card.reverserefs.length, 38);
  const future = row.stable.graph.future_editions[0];
  assert.equal(future.effective_from, '2027-03-01');
  assert.equal(future.redid, 490464);
  assert.equal(future.text_sha256, await sha256(decodeJson(saved['actual-pravo-fz116-future-redtext.json']).redtext));
  assert.equal(row.stable_read_set, true);
  assert.equal(row.error_code, null);
  assert.equal(h.calls.length, 12);
  assert.ok(h.client.additionalArtifacts.some(a => a.request_url.includes('490464')));
  assert.ok(h.calls.every(call => call.options.redirect === 'manual' && call.options.credentials === 'omit'));
  for (const [path, input] of h.uploads) assert.equal(await sha256(input.bytes), path.match(/\/([a-f\d]{64})\./)[1]);
});
test('complete proof contains no worker-supplied unchanged verdict or expiry', async () => {
  const h = harness(), result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'complete'); assert.equal(result.error_code, null);
  assert.equal(result.discovery.reported_total, 0); assert.equal(result.discovery.relevance_complete, true);
  assert.equal(result.runtime_egress_verified, true);
  assert.ok(!('outcome' in result) && !('valid_until' in result));
  assert.ok(h.calls.every(call => !call.url.includes('127.0.0.1')));
});
test('body text whitespace is hashed exactly, not normalized into a false equality', async () => {
  const raw = decodeJson(saved['actual-pravo-fz116-current-redtext.json']); raw.redtext += ' ';
  const h = harness({ respond: url => url.pathname.endsWith('/redtext') && url.searchParams.get('t') === '477797' ? new Response(JSON.stringify(raw)) : null });
  const row = await observe116(h.client, basis);
  assert.notEqual(row.stable.current.text_sha256, '18ca9b7ff10b43f10cc02bc90d3fa92ec4ff6826db2fc307392623820819ae9b');
});
for (const mutation of ['card', 'editions']) test(`changed ${mutation} during body retrieval cannot renew`, async () => {
  const h = harness({ respond: (url, count) => {
    if (mutation === 'card' && url.pathname.endsWith('/cardfull/') && count === 2) {
      const data = decodeJson(saved['actual-pravo-fz116-cardfull.json']); data.reverserefs[0].comment += ' synthetic new legal annotation'; return new Response(JSON.stringify(data));
    }
    if (mutation === 'editions' && url.pathname.endsWith('/redactions/') && count >= 3) {
      const data = decodeJson(saved[JSON.parse(url.searchParams.get('t')).ttl === 3 ? 'actual-pravo-fz116-redactions-all-observed-mode.json' : 'actual-pravo-fz116-redactions.json']);
      data.redactions[0].redreason = 'synthetic new annotation'; return new Response(JSON.stringify(data));
    }
    return null;
  } });
  const result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.error_code, 'SOURCE_CHANGED_DURING_READ');
});
test('latest-ten response cannot masquerade as the complete edition graph', async () => {
  const h = harness({ respond: url => url.pathname.endsWith('/redactions/') && JSON.parse(url.searchParams.get('t')).ttl === 3 ? new Response(saved['actual-pravo-fz116-redactions.json']) : null });
  const result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.error_code, 'ALL_EDITIONS_COMPLETENESS_UNPROVEN');
});
test('unready current edition remains unknown even when API marks it actual', async () => {
  const h = harness({ respond: url => {
    if (!url.pathname.endsWith('/redactions/')) return null;
    const data = decodeJson(saved[JSON.parse(url.searchParams.get('t')).ttl === 3 ? 'actual-pravo-fz116-redactions-all-observed-mode.json' : 'actual-pravo-fz116-redactions.json']);
    data.redactions.find(row => row.actual).redchecked = false;
    return new Response(JSON.stringify(data));
  } });
  const result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.error_code, 'CURRENT_NPA_TEXT_NOT_READY');
});
test('identity ambiguity, identity mismatch and API errors are fail closed', async t => {
  for (const mode of ['ambiguous', 'mismatch', 'apierror']) await t.test(mode, async () => {
    const h = harness({ respond: url => {
      if (!url.pathname.endsWith('/attrsearch/')) return null;
      const data = decodeJson(saved['actual-pravo-fz116-search.json']);
      if (mode === 'ambiguous') { data.docscount = 2; data.docs.push(data.docs[0]); }
      if (mode === 'mismatch') data.docs[0].docpass0number = '116-ФКЗ';
      if (mode === 'apierror') data.error = 'synthetic official API failure';
      return new Response(JSON.stringify(data));
    } });
    const result = await runOfficialNpaCheck(claim(), h.deps);
    assert.equal(result.status, 'unknown'); assert.equal(result.basis.length, 0);
  });
});
test('full577 SSR pagination parser follows actual links and exact reported total', () => {
  const window = { from: '2025-08-01', to_exclusive: '2026-11-15' };
  let url = searchUrl(window); const ids = [];
  for (let i = 1; i <= 3; i++) {
    const page = parseSearchPage(saved[`publication-search-federal-all-after-index-p${i}.html`].toString('utf8'), url, i, window);
    assert.equal(page.total, 577); assert.equal(page.items.length, i === 3 ? 177 : 200);
    ids.push(...page.items.map(item => item.id)); url = page.next;
  }
  assert.equal(url, null); assert.equal(new Set(ids).size, 577);
});
test('reported577 exceeds bounded work budget and cannot become a partial false unchanged', async () => {
  const h = harness({ search: saved['publication-search-federal-all-after-index-p1.html'] });
  const c = claim(); c.discovery_window = { from: '2025-08-01', to_exclusive: '2026-11-15' };
  const result = await runOfficialNpaCheck(c, h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.error_code, 'DISCOVERY_PUBLICATION_BUDGET');
  assert.equal(result.discovery.complete, false); assert.equal(result.discovery.reported_total, 577);
  assert.equal(result.discovery.pages.length, 1);
});
test('known94 original is fully retrieved and reconciled to its actual changing graph ID', async () => {
  const h = harness({ search: searchHtml([law94]) });
  const c = claim(); c.discovery_window = { from: '2026-04-09', to_exclusive: '2026-04-10' };
  const result = await runOfficialNpaCheck(c, h.deps);
  assert.equal(result.status, 'complete'); assert.equal(result.discovery.relevance_complete, true);
  assert.deepEqual(result.discovery.resolved_publications[0].basis_docids, [38355]);
  assert.deepEqual(result.discovery.resolved_publications[0].graph_reference_ids, ['329063']);
  assert.equal(result.discovery.resolved_publications[0].relation, 'known_changing_act');
  assert.ok(h.calls.some(call => call.url.includes('t=490401')));
});
test('unknown full publication mention cannot be dismissed by an unrelated title', async () => {
  const item = { id: '0001202604090999', title: 'Федеральный закон от 09.04.2026 № 999-ФЗ "О другом предмете"' };
  const h = harness({ search: searchHtml([item]), respond: url => {
    if (url.pathname.startsWith('/document/')) return new Response(`<div class="document-name">${item.title}</div><span>${item.id}</span><a id="doc_text" href="http://actual.pravo.gov.ru/content/content.html#pnum=${item.id}">Текст</a>`);
    return null;
  } });
  const c = claim(); c.discovery_window = { from: '2026-04-09', to_exclusive: '2026-04-10' };
  const result = await runOfficialNpaCheck(c, h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.discovery.complete, true);
  assert.equal(result.discovery.relevance_complete, false);
  assert.deepEqual(result.discovery.unresolved_candidates, [item.id]);
});
test('truncated/changed pagination and forged filter links are rejected', () => {
  const w = { from: '2025-08-01', to_exclusive: '2026-11-15' }, url = searchUrl(w), html = saved['publication-search-federal-all-after-index-p1.html'].toString('utf8');
  assert.throws(() => parseSearchPage(html.replace('из 577', 'из 576'), url, 1, w), ProofError);
  assert.throws(() => parseSearchPage(html.replace(/PublishDateFrom=01.08.2025/g, 'PublishDateFrom=01.08.2024'), url, 1, w), /DISCOVERY_FILTER_DRIFT/);
  assert.throws(() => parseSearchPage(html.replace('class="documents-item-name"', 'class="lost-name"'), url, 1, w), /DISCOVERY_PAGE_COVERAGE/);
});
test('discovery mutated between its two full passes remains unknown', async () => {
  let reads = 0;
  const h = harness({ respond: url => {
    if (url.pathname !== '/search') return null;
    reads++;
    return new Response(reads === 1 ? saved['publication-search-federal-zero-20261114.html'] : searchHtml([{ ...law94, id: '0001202611140999', date: '14.11.2026' }]));
  } });
  const result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.discovery.error_code, 'DISCOVERY_CHANGED_DURING_READ');
});
test('unsupported PP cannot renew a module even with a fully proven116 basis', async () => {
  const h = harness(), c = claim(); c.unsupported_basis = [{ kind: 'GovernmentDecree', date: '2021-06-30', number: '1082', title: 'Положение' }]; c.all_declared_basis_count = 2;
  const result = await runOfficialNpaCheck(c, h.deps);
  assert.equal(result.basis.length, 1); assert.equal(result.status, 'partial_coverage'); assert.equal(result.error_code, 'UNSUPPORTED_BASIS_ADAPTER');
});
for (const [label, dependencies, code] of [
  ['unverified actual runtime', { runtimeEgressProbe: undefined }, 'RUNTIME_EGRESS_UNVERIFIED'],
  ['disconnected question-source verifier', { verifyQuestionSource: undefined }, 'QUESTION_SOURCE_VERIFIER_NOT_CONNECTED'],
]) test(label, async () => {
  const h = harness({ dependencies }); const result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.error_code, code);
});
test('immutable evidence must actually upload; a storage exception cannot report success', async () => {
  const h = harness({ uploadFail: true }); const result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.error_code, 'PRIVATE_ARTIFACT_UPLOAD_FAILED');
  assert.equal(result.basis.length, 0); assert.equal(result.additional_artifacts.length, 0);
});
test('strict endpoint/redirect allowlist rejects arbitrary hosts, credentials and ports', async () => {
  for (const url of ['http://127.0.0.1/', 'http://actual.pravo.gov.ru:8001/api/ebpi/redtext?bpa=ebpi&t=1', 'https://evil.example/api/ebpi/redtext?bpa=ebpi&t=1', 'http://user:pass@actual.pravo.gov.ru:8000/api/ebpi/redtext?bpa=ebpi&t=1', 'http://actual.pravo.gov.ru:8000/api/ebpi/unknown?bpa=ebpi', 'http://actual.pravo.gov.ru:8000/api/ebpi/redtext?bpa=ebpi&t=1&t=2']) assert.throws(() => assertOfficialUrl(url), ProofError);
  const h = harness({ respond: () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }) });
  await assert.rejects(() => h.client.capture(actualUrl('redtext', { t: '477797', ttl: '0' })), /UNSAFE_OFFICIAL_URL/);
  assert.equal(h.calls.length, 1);
});
test('HTTP failures, request/byte budgets and invalid UTF8 remain explicit errors', async t => {
  await t.test('HTTP503', async () => {
    const h = harness({ respond: () => new Response('unavailable', { status: 503 }) });
    await assert.rejects(() => h.client.capture(actualUrl('redtext', { t: '1', ttl: '0' })), /OFFICIAL_HTTP_503/);
  });
  await t.test('response byte cap', async () => {
    const h = harness({ limits: { maxResponseBytes: 10 } });
    await assert.rejects(() => h.client.capture(actualUrl('redtext', { t: '1', ttl: '0' })), /RESPONSE_SIZE_LIMIT/);
  });
  await t.test('request cap', async () => {
    const h = harness({ limits: { maxRequests: 1 } });
    const result = await runOfficialNpaCheck(claim(), h.deps);
    assert.equal(result.error_code, 'REQUEST_BUDGET'); assert.equal(result.status, 'unknown');
  });
  await t.test('invalid UTF8', async () => {
    const h = harness({ respond: () => new Response(Uint8Array.of(0xff)) });
    await assert.rejects(() => h.client.capture(actualUrl('redtext', { t: '1', ttl: '0' })), /INVALID_OFFICIAL_UTF8/);
  });
});
test('invalid or expired claims make no HTTP request', async () => {
  const h = harness(), c = claim(); c.all_declared_basis_count = 2;
  assert.equal((await runOfficialNpaCheck(c, h.deps)).error_code, 'INVALID_CHECK_CLAIM');
  c.all_declared_basis_count = 1; c.lease_expires_at = NOW;
  assert.equal((await runOfficialNpaCheck(c, h.deps)).error_code, 'CHECK_LEASE_EXPIRED');
  assert.equal(h.calls.length, 0);
});
test('same edition ID with a changed second body cannot pass stable_read_set', async () => {
  let reads = 0;
  const h = harness({ respond: url => {
    if (url.pathname.endsWith('/redtext') && url.searchParams.get('t') === '477797' && ++reads === 2) {
      const data = decodeJson(saved['actual-pravo-fz116-current-redtext.json']); data.redtext += ' '; return new Response(JSON.stringify(data));
    }
    return null;
  } });
  const result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.error_code, 'SOURCE_CHANGED_DURING_READ');
});
test('source server calendar must be today in Moscow, not merely any valid date', async () => {
  const h = harness({ respond: url => {
    if (!url.pathname.endsWith('/redactions/')) return null;
    const data = decodeJson(saved[JSON.parse(url.searchParams.get('t')).ttl === 3 ? 'actual-pravo-fz116-redactions-all-observed-mode.json' : 'actual-pravo-fz116-redactions.json']);
    data.serverdate = '2026-11-13T00:00:00'; return new Response(JSON.stringify(data));
  } });
  const result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.error_code, 'OFFICIAL_SERVER_DATE_STALE');
});
test('changed question PDF keeps its actual SHA for SQL to create a review finding', async () => {
  const h = harness(), changed = '2'.repeat(64), prior = h.deps.verifyQuestionSource;
  h.deps.verifyQuestionSource = async source => {
    const observed = await prior(source); observed.sha256 = changed; observed.artifact.sha256 = changed; observed.artifact.path = `npa250/${RUN}/${changed}.pdf`; return observed;
  };
  const result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'complete'); assert.equal(result.question_source.sha256, changed);
  assert.equal(result.question_source.source_generation, 1);
  assert.ok(!('page_url' in result.question_source) && !('document_url' in result.question_source));
});
test('unknown fields in the legal graph are preserved, transport error/status alone are excluded', async () => {
  const h = harness({ respond: url => {
    if (!url.pathname.endsWith('/cardfull/')) return null;
    const data = decodeJson(saved['actual-pravo-fz116-cardfull.json']); data.new_legal_annotation = { date: '2026-11-01', text: 'Do not erase this field' }; return new Response(JSON.stringify(data));
  } });
  const row = await observe116(h.client, basis);
  assert.deepEqual(row.stable.graph.canonical.card.new_legal_annotation, { date: '2026-11-01', text: 'Do not erase this field' });
  assert.ok(!('error' in row.stable.graph.canonical.card));
  assert.ok(!('status' in row.stable.graph.canonical.card));
});
test('a complete unrelated publication is classified only AFTER reading its full original', async () => {
  const item = { id: '0001202604090999', title: 'Федеральный закон от 09.04.2026 № 999-ФЗ "О самостоятельном вопросе"' };
  const h = harness({ search: searchHtml([item]), respond: url => {
    if (url.pathname.startsWith('/document/')) return new Response(`<div class="document-name">${item.title}</div><span>${item.id}</span><a id="doc_text" href="http://actual.pravo.gov.ru/content/content.html#pnum=${item.id}">Текст</a>`);
    if (url.pathname.endsWith('/redtext') && url.searchParams.get('t') === '490401') return new Response(JSON.stringify({ redtext: `<p>ФЕДЕРАЛЬНЫЙ ЗАКОН</p><p>${'Самостоятельное правовое регулирование без ссылок на проверяемые нормативные основания. '.repeat(10)}</p><p>Президент Российской Федерации</p>`, error: null }));
    return null;
  } });
  const c = claim(); c.discovery_window = { from: '2026-04-09', to_exclusive: '2026-04-10' };
  const result = await runOfficialNpaCheck(c, h.deps);
  assert.equal(result.status, 'complete'); assert.equal(result.discovery.resolved_publications[0].relation, 'not_related');
  assert.deepEqual(result.discovery.resolved_publications[0].basis_docids, []);
  assert.ok(h.calls.some(call => call.url.includes('t=490401')));
});
test('unready published original cannot be excluded on title alone', async () => {
  const h = harness({ search: searchHtml([law94]), respond: url => {
    if (!url.pathname.endsWith('/redactions/') || !JSON.parse(url.searchParams.get('t')).pnum) return null;
    const data = decodeJson(saved['actual-pravo-law94-original-redactions.json']); data.redactions[0].contentcomplete = false; return new Response(JSON.stringify(data));
  } });
  const c = claim(); c.discovery_window = { from: '2026-04-09', to_exclusive: '2026-04-10' };
  const result = await runOfficialNpaCheck(c, h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.discovery.error_code, 'PUBLICATION_ORIGINAL_NOT_COMPLETE');
  assert.deepEqual(result.discovery.unresolved_candidates, [law94.id]);
});
test('fetch timeout and private-store timeout are bounded and explicit', async t => {
  await t.test('fetch abort', async () => {
    const client = new OfficialClient(RUN, { put: async () => {} }, (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))), () => new Date(NOW), { requestTimeoutMs: 5 });
    await assert.rejects(() => client.capture(actualUrl('redtext', { t: '1', ttl: '0' })), /OFFICIAL_TIMEOUT/);
  });
  await t.test('private store never resolves', async () => {
    const client = new OfficialClient(RUN, { put: () => new Promise(() => {}) }, async () => new Response('{}'), () => new Date(NOW), { requestTimeoutMs: 5 });
    await assert.rejects(() => client.capture(actualUrl('redtext', { t: '1', ttl: '0' })), /PRIVATE_ARTIFACT_UPLOAD_TIMEOUT/);
    assert.equal(client.additionalArtifacts.length, 0);
  });
});
test('named artifacts are the final pass, so a legitimate read longer than30s stays temporally coherent', async () => {
  const h = harness(); let time = Date.parse(NOW);
  const client = new OfficialClient(RUN, h.deps.privateArtifactStore, async (...args) => { time += 3500; return h.deps.fetch(...args); }, () => new Date(time));
  const row = await observe116(client, basis);
  assert.ok(time - Date.parse(NOW) > 30_000);
  const latestNamed = Math.max(...Object.values(row.artifacts).map(a => Date.parse(a.received_at)));
  assert.equal(Date.parse(row.fetched_at), latestNamed);
  assert.ok(Date.parse(row.artifacts.redtext.received_at) > Date.parse(client.additionalArtifacts[0].received_at) + 30_000);
  assert.equal(row.stable_read_set, true);
});
test('unready future retains the positive graph fact while preventing a complete renewal proof', async () => {
  const h = harness({ respond: url => {
    if (!url.pathname.endsWith('/redactions/')) return null;
    const data = decodeJson(saved[JSON.parse(url.searchParams.get('t')).ttl === 3 ? 'actual-pravo-fz116-redactions-all-observed-mode.json' : 'actual-pravo-fz116-redactions.json']);
    data.redactions[0].contentcomplete = false; data.redactions[0].hascontent = false; return new Response(JSON.stringify(data));
  } });
  const result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'unknown'); assert.equal(result.error_code, 'FUTURE_NPA_TEXT_NOT_READY');
  assert.equal(result.basis.length, 1); assert.equal(result.basis[0].error_code, null);
  assert.equal(result.basis[0].stable.graph.future_editions[0].text_sha256, null);
  assert.equal(result.basis[0].stable.current.redid, 477797);
  assert.equal(result.basis[0].stable_read_set, true);
});
test('multi-request source verification has its own trusted budget, while perHTTP remains short', async () => {
  const h = harness({ limits: { requestTimeoutMs: 15, sourceVerificationTimeoutMs: 80 } });
  const normal = h.deps.verifyQuestionSource;
  h.deps.verifyQuestionSource = async input => { await new Promise(resolve => setTimeout(resolve, 35)); return normal(input); };
  const result = await runOfficialNpaCheck(claim(), h.deps);
  assert.equal(result.status, 'complete'); assert.equal(result.question_source.catalog_complete, true);
});
test('a long trusted source budget is clamped to the remaining whole-run budget', async () => {
  const h = harness(); let clock = Date.parse(NOW);
  const client = new OfficialClient(RUN, h.deps.privateArtifactStore, h.deps.fetch, () => new Date(clock), { requestTimeoutMs: 5, sourceVerificationTimeoutMs: 80, runTimeoutMs: 100 });
  clock += 90;
  await assert.rejects(() => client.boundedDependency(new Promise(resolve => setTimeout(resolve, 40)), 'QUESTION_SOURCE_VERIFIER_TIMEOUT', client.limits.sourceVerificationTimeoutMs), /QUESTION_SOURCE_VERIFIER_TIMEOUT/);
  assert.equal(client.limits.requestTimeoutMs, 5);
});
