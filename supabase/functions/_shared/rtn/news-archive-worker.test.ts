// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reconcileRtnNewsArchive } from './news-archive-worker';
import { LostPublisherAuthority, type ArchiveGetGrant, type ArchiveTransportScope, type createRtnPublisherTransport } from './news-publisher-http-client';
import type { NewsWorkerClient } from './news-worker';
import { sha256 } from './official-source';
import { parseRtnNewsRss } from './news-source';

const T = Date.parse('2026-11-21T10:00:00.000Z');
const root = 'https://www.gosnadzor.ru/news/';
const gapId = 'a0000000-0000-4000-8000-000000000001', token = 'b0000000-0000-4000-8000-000000000001', rssId = 'c0000000-0000-4000-8000-000000000001';
const encode = (s: string) => new TextEncoder().encode(s);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, -1) + '000Z';
const rss = '<rss version="2.0"><channel><title>RTN</title><link>https://www.gosnadzor.ru/news/</link><item><title>Older immutable headline</title><link>https://www.gosnadzor.ru/news/67/200/</link><description>Not part of the anchor DTO.</description><pubDate>Fri, 20 Nov 2026 12:00:00 +0300</pubDate></item><item><title>First headline</title><link>https://www.gosnadzor.ru/news/67/100/</link><pubDate>Fri, 20 Nov 2026 11:00:00 +0300</pubDate></item></channel></rss>';
const html = (page = 1) => `<div class="news-list"><p class="news-item"><span class="news-date-time">20.11.2026</span><a href="/news/67/${100 + page}/"><b>Заголовок ${page}</b></a><br>Full body is not promoted.</p><font class="text"><b>${page}</b><a href="/news/?PAGEN_1=${page + 1}">След.</a><a href="/news/?PAGEN_1=949">Конец</a></font></div>`;
const stream = (bytes: Uint8Array) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });
const complete = (status = 'yielded', reason: string | null = null) => ({ status, replayed: false, accepted_candidates: 1, pending_date_precision: 1, known_rss: 0, stop_reason: reason });

async function setup(options: { anchor?: boolean; rss?: string; now?: () => number } = {}) {
  let clock = T;
  const now = options.now || (() => clock), initial = now(), original = encode(options.rss ?? rss), originalHash = await sha256(original);
  const objects = new Map<string, Uint8Array>([[`news/rss/${originalHash}.xml`, original]]);
  const getGrant = (page = 1): ArchiveGetGrant => ({ request_id: `d0000000-0000-4000-8000-${String(page).padStart(12, '0')}`, page_url: page === 1 ? root : `${root}?PAGEN_1=${page}`, page_number: page, purpose: 'scan', request_deadline_at: iso(now() + 20_000), max_response_bytes: 1048576 });
  const claim = { gap_id: gapId, lease_token: token, generation: 1, publisher_epoch: 2, lease_expires_at: iso(initial + 120_000), invocation_deadline_at: iso(initial + 70_000), request: getGrant(), remaining: { get_attempts: 19, body_bytes: 19 * 1048576, pages: 10, candidates: 200 } };
  const ready = { state: 'ready', input: { rss_run_id: rssId, response_sha256: originalHash, byte_size: original.length, original_path: `news/rss/${originalHash}.xml`, resolved_feed_url: root + 'rss/', rss_completed_at: iso(initial - 1000), baseline: true } };
  const state: Record<string, unknown> = {
    anchor: options.anchor ? ready : { state: 'no_success', retry_at: null },
    record: { status: 'baseline', replayed: false, gap_created: false }, claim,
    complete: complete(), authorize: { status: 'paused', reason: 'rss_priority' },
  };
  const defaultRpc = async (name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string } | null }> => {
    const key = ({ get_rtn_news_archive_anchor_input: 'anchor', record_rtn_news_archive_anchor: 'record', claim_rtn_news_archive_gap: 'claim', complete_rtn_news_archive_request: 'complete', authorize_rtn_news_archive_request: 'authorize' } as Record<string, string>)[name];
    if (!key) throw new Error('Unexpected RPC: ' + name);
    const value = state[key];
    return { data: typeof value === 'function' ? (value as (args?: Record<string, unknown>) => unknown)(args) : value, error: null };
  };
  const rpc = vi.fn(defaultRpc);
  const upload = vi.fn(async (path: string, bytes: Uint8Array, _options: { contentType: string; upsert: boolean }): Promise<{ error: { statusCode?: string | number; message?: string } | null }> => { objects.set(path, bytes.slice()); return { error: null }; });
  const asStream = vi.fn(async (path: string): Promise<{ data: ReadableStream<Uint8Array> | null; error: unknown }> => ({ data: objects.has(path) ? stream(objects.get(path)!) : null, error: objects.has(path) ? null : new Error('not found') }));
  const download = vi.fn((path: string) => ({ asStream: () => asStream(path) }));
  const from = vi.fn((_bucket: string) => ({ upload, download }));
  const service: NewsWorkerClient = { rpc, storage: { from } };
  const privateClient = vi.fn((_deadline: number, _signal?: AbortSignal) => service);
  const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const n = Number(new URL(String(input)).searchParams.get('PAGEN_1') || 1);
    return new Response(encode(html(n)), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  const withGrant = vi.fn(async (grant: ArchiveGetGrant, action: (f: typeof fetch, observation: () => { resolved_url: string; content_type: string }) => Promise<unknown>) => action(fetcher as typeof fetch, () => ({ resolved_url: grant.page_url, content_type: 'text/html; charset=utf-8' })));
  const transport: ReturnType<typeof createRtnPublisherTransport> = {
    forRssClaim: () => { throw new Error('unused'); },
    withArchiveTransport: async <U>(action: (scope: ArchiveTransportScope) => Promise<U>) => action({ withGrant: withGrant as ArchiveTransportScope['withGrant'] }),
  };
  const deps = { service, privateClient, transport, now };
  return { deps, now, advance: (ms: number) => { clock += ms; }, overall: initial + 115_000, state, claim, ready, getGrant, objects, original, originalHash, defaultRpc, rpc, upload, asStream, download, from, fetcher, withGrant, privateClient };
}
afterEach(() => vi.useRealTimers());

describe('trusted committed RSS anchor observation', () => {
  it('reads and hashes the private original, records complete sorted immutable RSS item projection, and leaves RSS completion untouched', async () => {
    const a = await setup({ anchor: true }); a.state.claim = null;
    expect(await reconcileRtnNewsArchive(a.deps, a.overall)).toEqual({ status: 'idle', stop_reason: null });
    expect(a.download).toHaveBeenCalledWith(a.ready.input.original_path);
    const call = a.rpc.mock.calls.find(([name]) => name === 'record_rtn_news_archive_anchor')!;
    const feed = await parseRtnNewsRss(a.original, 'application/rss+xml', root + 'rss/');
    expect(call[1]).toEqual({ p_rss_run_id: rssId, p_result: { status: 'success', parser_format: 'rtn-rss-anchor-v1', response_sha256: a.originalHash, byte_size: a.original.length,
      items: [...feed.items].sort((x, y) => x.canonical_url.localeCompare(y.canonical_url)).map(({ canonical_url, published_at, content_sha256 }) => ({ canonical_url, published_at, raw_item_sha256: content_sha256 })) } });
    expect(JSON.stringify(call[1])).not.toMatch(/title|description|source_excerpt/);
    expect(a.rpc.mock.calls.some(([name]) => name === 'complete_rtn_news_check')).toBe(false);
    expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('accepts unchanged/replayed anchor classification without reclassifying the RSS result or creating an event', async () => {
    const a = await setup({ anchor: true }); a.state.record = { status: 'overlap', replayed: true, gap_created: false }; a.state.claim = null;
    expect((await reconcileRtnNewsArchive(a.deps, a.overall)).status).toBe('idle');
    expect(a.rpc.mock.calls.filter(([name]) => name === 'record_rtn_news_archive_anchor')).toHaveLength(1);
    expect(a.rpc.mock.calls.map(([name]) => name)).toEqual(['get_rtn_news_archive_anchor_input','record_rtn_news_archive_anchor','claim_rtn_news_archive_gap']);
  });
  it('records an oversized or mismatching private original as hash failure once, preserving cursor/RSS and avoiding archive work', async () => {
    const a = await setup({ anchor: true }); a.asStream.mockResolvedValue({ data: stream(new Uint8Array(a.original.length + 1)), error: null }); a.state.record = { status: 'probe_error', replayed: false, gap_created: false };
    expect((await reconcileRtnNewsArchive(a.deps, a.overall)).status).toBe('error');
    expect(a.rpc.mock.calls.at(-1)).toEqual(['record_rtn_news_archive_anchor', { p_rss_run_id: rssId, p_result: { status: 'error', error_code: 'RTN_ARCHIVE_ORIGINAL_HASH_CONFLICT' } }]);
    expect(a.fetcher).not.toHaveBeenCalled(); expect(a.upload).not.toHaveBeenCalled();
  });
  it('reports verified-but-invalid RSS as private parse failure rather than a failed live RSS check', async () => {
    const a = await setup({ anchor: true, rss: '<rss>not a feed</rss>' }); a.state.record = { status: 'probe_error', replayed: false, gap_created: false };
    await reconcileRtnNewsArchive(a.deps, a.overall);
    expect(a.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_result: { status: 'error', error_code: 'RTN_ARCHIVE_ORIGINAL_PARSE_FAILED' } });
    expect(a.rpc.mock.calls.some(([n]) => n === 'complete_rtn_news_check')).toBe(false);
  });
  it('bounds stalled private stream reads and does not wait for a hung cancellation hook', async () => {
    vi.useFakeTimers(); vi.setSystemTime(T);
    const a = await setup({ anchor: true, now: Date.now }), cancel = vi.fn(() => new Promise<void>(() => undefined));
    a.asStream.mockResolvedValue({ data: new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => undefined), cancel }), error: null });
    a.state.record = { status: 'probe_error', replayed: false, gap_created: false };
    const pending = reconcileRtnNewsArchive(a.deps, a.overall);
    await vi.advanceTimersByTimeAsync(20_001);
    expect((await pending).status).toBe('error'); expect(cancel).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_result: { error_code: 'RTN_ARCHIVE_ORIGINAL_READ_FAILED' } });
  });
  it.each(['40001','08006'])('does not contradict an anchor record rejected/lost with%s by sending another error record or GET', async code => {
    const a = await setup({ anchor: true });
    a.rpc.mockImplementation(async (name, args) => name === 'record_rtn_news_archive_anchor' ? { data: null, error: { code } } : a.defaultRpc(name, args));
    expect(await reconcileRtnNewsArchive(a.deps, a.overall)).toEqual({ status: 'error', stop_reason: 'archive_unavailable' });
    expect(a.rpc.mock.calls.filter(([name]) => name === 'record_rtn_news_archive_anchor')).toHaveLength(1);
    expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('rejects untrusted anchor path metadata before storage access or record mutation', async () => {
    const a = await setup({ anchor: true }); a.ready.input.original_path = 'other/private.xml';
    await reconcileRtnNewsArchive(a.deps, a.overall);
    expect(a.download).not.toHaveBeenCalled(); expect(a.rpc).toHaveBeenCalledTimes(1);
  });
  it('uses only the exact NULL history-limit error record path, with no invented failed run', async () => {
    const a = await setup(); a.state.anchor = { state: 'anchor_history_limited', retry_at: null }; a.state.record = { status: 'needs_review', replayed: false, gap_created: false };
    expect((await reconcileRtnNewsArchive(a.deps, a.overall)).status).toBe('needs_review');
    expect(a.rpc.mock.calls.at(-1)?.[1]).toEqual({ p_rss_run_id: null, p_result: { status: 'error', error_code: 'RTN_ARCHIVE_ANCHOR_HISTORY_LIMIT' } });
    expect(a.download).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
  });
});

describe('bounded DB-granted archive work, never RSS/event completion', () => {
  it('resumes an existing gap when there is no new anchor input, consumes first claim grant once and stores HTML privately', async () => {
    const a = await setup();
    expect(await reconcileRtnNewsArchive(a.deps, a.overall)).toEqual({ status: 'yielded', stop_reason: null });
    expect(a.rpc.mock.calls.map(([n]) => n)).toEqual(['get_rtn_news_archive_anchor_input','claim_rtn_news_archive_gap','complete_rtn_news_archive_request']);
    expect(a.withGrant).toHaveBeenCalledTimes(1); expect(a.fetcher).toHaveBeenCalledTimes(1);
    const payload = a.rpc.mock.calls.at(-1)![1]!.p_result as Record<string, unknown>;
    expect(payload).toMatchObject({ status: 'success', resolved_url: root, content_type: 'text/html; charset=utf-8', decoded_encoding: 'utf-8', body_bytes_seen: encode(html()).length });
    expect(Object.keys(payload).sort()).toEqual(['body_bytes_seen','content_type','decoded_encoding','original_path','page','resolved_url','status','yield_after'].sort());
    expect(a.upload).toHaveBeenCalledWith(expect.stringMatching(/^news\/archive\/[0-9a-f]{64}\.html$/), encode(html()), { contentType: 'text/html', upsert: false });
    expect(JSON.stringify(payload)).not.toMatch(/published_at|content_sha256|effective_from|notification|event_id/);
    expect(a.from).toHaveBeenCalledWith('rtn-sources');
  });
  it('requests a later reservation only after committed completion, and yields to queued RSS', async () => {
    const a = await setup(); a.state.complete = complete('continue');
    expect(await reconcileRtnNewsArchive(a.deps, a.overall)).toEqual({ status: 'paused', stop_reason: 'rss_priority' });
    expect(a.rpc.mock.calls.map(([n]) => n)).toEqual(['get_rtn_news_archive_anchor_input','claim_rtn_news_archive_gap','complete_rtn_news_archive_request','authorize_rtn_news_archive_request']);
    expect(a.rpc.mock.calls.at(-1)![1]).toEqual({ p_gap_id: gapId, p_lease_token: token, p_generation: 1 });
    expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps one local invocation budget and stops after at most three distinct grants without resetting it', async () => {
    const a = await setup(); let next = 2;
    a.state.complete = (args?: Record<string, unknown>) => complete((args!.p_result as Record<string, unknown>).yield_after ? 'yielded' : 'continue');
    a.state.authorize = () => ({ status: 'granted', request: a.getGrant(next++) });
    expect((await reconcileRtnNewsArchive(a.deps, a.overall)).status).toBe('yielded');
    expect(a.fetcher).toHaveBeenCalledTimes(3); expect(a.upload).toHaveBeenCalledTimes(3);
    expect(a.rpc.mock.calls.filter(([n]) => n === 'authorize_rtn_news_archive_request')).toHaveLength(2);
    expect(a.rpc.mock.calls.filter(([n]) => n === 'complete_rtn_news_archive_request').at(-1)![1]).toMatchObject({ p_result: { yield_after: true } });
  });
  it('rejects malformed new timestamps, foreign request URLs or impossible campaign remaining counts before GET', async () => {
    for (const patch of [(a: Awaited<ReturnType<typeof setup>>) => { a.claim.lease_expires_at = '2026-11-21T10:02:00Z'; }, (a: Awaited<ReturnType<typeof setup>>) => { a.claim.request.page_url = 'https://outside.test/news/'; }, (a: Awaited<ReturnType<typeof setup>>) => { a.claim.remaining.get_attempts = 20; }]) {
      const a = await setup(); patch(a); await reconcileRtnNewsArchive(a.deps, a.overall);
      expect(a.fetcher).not.toHaveBeenCalled(); expect(a.upload).not.toHaveBeenCalled();
      expect(a.rpc.mock.calls.filter(([n]) => n === 'complete_rtn_news_archive_request')).toHaveLength(0);
    }
  });
  it('preserves official403 with a single finite error completion and no immediate retry or archive original', async () => {
    const a = await setup(); a.fetcher.mockResolvedValue(new Response('blocked', { status: 403 })); a.state.complete = complete('error');
    expect((await reconcileRtnNewsArchive(a.deps, a.overall)).status).toBe('error');
    expect(a.rpc.mock.calls.at(-1)![1]!.p_result).toEqual({ status: 'error', error_code: 'RTN_ARCHIVE_HTTP_403', body_bytes_seen: 0, byte_limit_exceeded: false });
    expect(a.fetcher).toHaveBeenCalledTimes(1); expect(a.upload).not.toHaveBeenCalled();
  });
  it('distinguishes declared oversized header with zero consumed bytes from actual streamed overflow lower bound', async () => {
    const header = await setup(); header.fetcher.mockResolvedValue(new Response(encode(html()), { headers: { 'content-type': 'text/html', 'content-length': '1048577' } })); header.state.complete = complete('error');
    await reconcileRtnNewsArchive(header.deps, header.overall);
    expect(header.rpc.mock.calls.at(-1)![1]!.p_result).toMatchObject({ error_code: 'RTN_ARCHIVE_BODY_SIZE_INVALID', body_bytes_seen: 0, byte_limit_exceeded: false });
    const actual = await setup(); actual.fetcher.mockResolvedValue(new Response(new Uint8Array(2097152), { headers: { 'content-type': 'text/html' } })); actual.state.complete = complete('error');
    await reconcileRtnNewsArchive(actual.deps, actual.overall);
    expect(actual.rpc.mock.calls.at(-1)![1]!.p_result).toMatchObject({ error_code: 'RTN_ARCHIVE_BODY_SIZE_INVALID', body_bytes_seen: 1048577, byte_limit_exceeded: true });
  });
  it('normalizes parser-specific errors to PARSE_FAILED, never storing raw private exceptions or changing RSS', async () => {
    const a = await setup(); a.fetcher.mockResolvedValue(new Response('malformed <div>', { headers: { 'content-type': 'text/html' } })); a.state.complete = complete('error');
    await reconcileRtnNewsArchive(a.deps, a.overall);
    expect(a.rpc.mock.calls.at(-1)![1]!.p_result).toMatchObject({ error_code: 'RTN_ARCHIVE_PARSE_FAILED' });
    expect(a.rpc.mock.calls.some(([n]) => n === 'complete_rtn_news_check')).toBe(false);
  });
  it('accepts storage conflict only after matching bounded private original readback, with no overwrite or extra public GET', async () => {
    const a = await setup(), bytes = encode(html()), path = `news/archive/${await sha256(bytes)}.html`;
    a.objects.set(path, bytes); a.upload.mockResolvedValue({ error: { statusCode: '409', message: 'already exists' } });
    expect((await reconcileRtnNewsArchive(a.deps, a.overall)).status).toBe('yielded');
    expect(a.download).toHaveBeenCalledWith(path); expect(a.upload).toHaveBeenCalledTimes(1); expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('records hash conflict without overwriting a different existing private body', async () => {
    const a = await setup(), bytes = encode(html()), path = `news/archive/${await sha256(bytes)}.html`;
    a.objects.set(path, new Uint8Array(bytes.length)); a.upload.mockResolvedValue({ error: { statusCode: '409' } }); a.state.complete = complete('error');
    await reconcileRtnNewsArchive(a.deps, a.overall);
    expect(a.rpc.mock.calls.at(-1)![1]!.p_result).toMatchObject({ error_code: 'RTN_ARCHIVE_STORAGE_HASH_CONFLICT' });
    expect(a.upload).toHaveBeenCalledTimes(1); expect(a.objects.get(path)).toEqual(new Uint8Array(bytes.length));
  });
  it('allows an immutable orphan after lost upload acknowledgement without reupload or false success', async () => {
    const a = await setup(); a.upload.mockImplementation(async (path, bytes) => { a.objects.set(path, bytes); throw new Error('private transport detail'); }); a.state.complete = complete('error');
    await reconcileRtnNewsArchive(a.deps, a.overall);
    expect(a.objects.size).toBe(2); expect(a.upload).toHaveBeenCalledTimes(1); expect(a.fetcher).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls.at(-1)![1]!.p_result).toMatchObject({ status: 'error', error_code: 'RTN_ARCHIVE_STORAGE_FAILED' });
  });
  it.each(['40001','08006','malformed'])('stops after unconfirmed completion%s with no second result or subsequent grant', async mode => {
    const a = await setup(); a.rpc.mockImplementation(async (name, args) => name === 'complete_rtn_news_archive_request' ? { data: mode === 'malformed' ? { status: 'continue' } : null, error: mode === 'malformed' ? null : { code: mode } } : a.defaultRpc(name, args));
    expect(await reconcileRtnNewsArchive(a.deps, a.overall)).toEqual({ status: 'error', stop_reason: 'archive_unavailable' });
    expect(a.rpc.mock.calls.filter(([n]) => n === 'complete_rtn_news_archive_request')).toHaveLength(1);
    expect(a.rpc.mock.calls.some(([n]) => n === 'authorize_rtn_news_archive_request')).toBe(false); expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not repeat a GET or contradict a committed page after later authorization acknowledgement is lost', async () => {
    const a = await setup(); a.state.complete = complete('continue'); a.rpc.mockImplementation(async (name, args) => name === 'authorize_rtn_news_archive_request' ? { data: null, error: { code: '08006' } } : a.defaultRpc(name, args));
    await reconcileRtnNewsArchive(a.deps, a.overall);
    expect(a.fetcher).toHaveBeenCalledTimes(1); expect(a.rpc.mock.calls.filter(([n]) => n === 'complete_rtn_news_archive_request')).toHaveLength(1);
  });
  it('lets LostPublisherAuthority escape adapter normalization without sending a competing page error', async () => {
    const a = await setup(); a.fetcher.mockRejectedValue(new LostPublisherAuthority());
    expect(await reconcileRtnNewsArchive(a.deps, a.overall)).toEqual({ status: 'error', stop_reason: 'archive_unavailable' });
    expect(a.upload).not.toHaveBeenCalled(); expect(a.rpc.mock.calls.some(([n]) => n === 'complete_rtn_news_archive_request')).toBe(false);
  });
  it.each([['RTN_NEWS_TLS_TIMEOUT','RTN_ARCHIVE_TIMEOUT'],['RTN_NEWS_TLS_ABORTED','RTN_ARCHIVE_ABORTED']])('retains the controlled transport failure%s across adapter normalization', async (source, expected) => {
    const a = await setup(); a.fetcher.mockRejectedValue(new Error(source)); a.state.complete = complete('error');
    await reconcileRtnNewsArchive(a.deps, a.overall);
    expect(a.rpc.mock.calls.at(-1)![1]!.p_result).toEqual({ status: 'error', error_code: expected, body_bytes_seen: 0, byte_limit_exceeded: false });
    expect(a.fetcher).toHaveBeenCalledTimes(1); expect(a.upload).not.toHaveBeenCalled();
  });
  it('rejects native observation mismatch rather than inventing a resolved URL or response header', async () => {
    const a = await setup(); a.withGrant.mockImplementation(async (_grant, action) => action(a.fetcher as typeof fetch, () => ({ resolved_url: 'https://outside.test/news/', content_type: 'text/html; charset=utf-8' })));
    await reconcileRtnNewsArchive(a.deps, a.overall);
    expect(a.upload).not.toHaveBeenCalled(); expect(a.rpc.mock.calls.some(([n]) => n === 'complete_rtn_news_archive_request')).toBe(false);
  });
  it('may finish private upload after public20s while still before absolute70s, without a new public GET', async () => {
    const a = await setup(); a.fetcher.mockImplementation(async () => { a.advance(19_000); return new Response(encode(html()), { headers: { 'content-type': 'text/html; charset=utf-8' } }); });
    a.upload.mockImplementation(async (path, bytes) => { a.advance(6000); a.objects.set(path, bytes); return { error: null }; });
    expect((await reconcileRtnNewsArchive(a.deps, a.overall)).status).toBe('yielded');
    expect(a.now()).toBe(T + 25_000); expect(a.fetcher).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls.at(-1)![1]!.p_result).toMatchObject({ status: 'success', yield_after: true });
  });
  it('does not submit a late completion after absolute70s or begin work with too little overall time', async () => {
    const early = await setup(); expect(await reconcileRtnNewsArchive(early.deps, T + 9000)).toEqual({ status: 'paused', stop_reason: 'local_deadline' }); expect(early.rpc).not.toHaveBeenCalled();
    const late = await setup(); late.upload.mockImplementation(async (path, bytes) => { late.advance(71_000); late.objects.set(path, bytes); return { error: null }; });
    await reconcileRtnNewsArchive(late.deps, late.overall);
    expect(late.rpc.mock.calls.some(([n]) => n === 'complete_rtn_news_archive_request')).toBe(false); expect(late.fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not forward an unknown database stop reason or issue another action after invalid acknowledgement', async () => {
    const a = await setup(); a.state.complete = complete('needs_review', 'private arbitrary message');
    expect(await reconcileRtnNewsArchive(a.deps, a.overall)).toEqual({ status: 'error', stop_reason: 'archive_unavailable' });
    expect(a.rpc.mock.calls.filter(([n]) => n === 'complete_rtn_news_archive_request')).toHaveLength(1);
    expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
});
