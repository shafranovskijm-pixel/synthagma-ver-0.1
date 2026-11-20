// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeadlinePrivateFetch, createRtnPublisherTransport, LostPublisherAuthority, utc6Milliseconds, type ArchiveGetGrant } from './news-publisher-http-client';
import { executeRtnNewsCheck, type NewsWorkerClient, type RtnNewsClaim } from './news-worker';
import { RTN_NEWS_RSS_URL } from './news-source';
import { reconcileRtnNewsArchive } from './news-archive-worker';

const now = Date.parse('2026-11-20T15:40:00Z');
const iso6 = (offset = 20_000) => new Date(now + offset).toISOString().replace('Z','000Z');
const claim: RtnNewsClaim = { run_id: '90000000-0000-4000-8000-000000000001', lease_token: '91000000-0000-4000-8000-000000000001', generation: 1, kind: 'manual', source_url: RTN_NEWS_RSS_URL, lease_expires_at: new Date(now + 120_000).toISOString() };
const archive: ArchiveGetGrant = { request_id: '92000000-0000-4000-8000-000000000001', page_url: 'https://www.gosnadzor.ru/news/', page_number: 1, purpose: 'scan', request_deadline_at: iso6(), max_response_bytes: 1048576 };
const init = { method: 'GET', redirect: 'manual', credentials: 'omit', headers: { Accept: 'text/html' } } satisfies RequestInit;
function native(url = RTN_NEWS_RSS_URL, body: BodyInit | null = 'body', options: ResponseInit = {}) {
  const value = new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' }, ...options });
  // A synthetic native response, not a browser URL/property bypass.
  Object.defineProperty(value, 'url', { value: url }); return value;
}
function setup() {
  const rpc = vi.fn(async (_name: string, args?: Record<string, unknown>) => ({ data: { publisher_epoch: 2, permitted: true, expires_at: iso6(), get_count: Number(args?.p_expected_get_count) + 1 } as unknown, error: null as null | { code: string } }));
  const fetcher = vi.fn(async (url: string, _init: RequestInit) => native(url));
  const close = vi.fn(), createHttpClient = vi.fn(() => ({ close }));
  const transport = createRtnPublisherTransport({ rpc: { rpc }, fetcher, createHttpClient, now: () => now });
  return { rpc, fetcher, close, createHttpClient, transport };
}
afterEach(() => vi.useRealTimers());

describe('local preflight before any publisher GET grant', () => {
  it('composes a failing native client constructor with zero authorization, GET and completion attempts', async () => {
    const a = setup();a.createHttpClient.mockImplementation(() => { throw new Error('local native client unavailable'); });
    const from = vi.fn();const client = { rpc: a.rpc, storage: { from } } as unknown as NewsWorkerClient;
    await expect(executeRtnNewsCheck(client, claim, a.transport.forRssClaim(claim))).rejects.toBeInstanceOf(LostPublisherAuthority);
    expect(a.createHttpClient).toHaveBeenCalledTimes(1);expect(a.rpc).not.toHaveBeenCalled();expect(a.fetcher).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();expect(a.close).not.toHaveBeenCalled();
  });
  it('stops an initially aborted scope before certificate verification, client construction or action', async () => {
    const a = setup(), controller = new AbortController();controller.abort(new Error('local work stopped'));
    const clock = vi.fn(() => now);
    const transport = createRtnPublisherTransport({ rpc: { rpc: a.rpc }, fetcher: a.fetcher, createHttpClient: a.createHttpClient, now: clock });
    const from = vi.fn();const client = { rpc: a.rpc, storage: { from } } as unknown as NewsWorkerClient;
    await expect(executeRtnNewsCheck(client, claim, transport.forRssClaim(claim, controller.signal))).rejects.toBeInstanceOf(LostPublisherAuthority);
    expect(clock).not.toHaveBeenCalled();expect(a.createHttpClient).not.toHaveBeenCalled();expect(a.rpc).not.toHaveBeenCalled();
    expect(a.fetcher).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();expect(a.close).not.toHaveBeenCalled();
  });
  it('keeps a local certificate verification failure outside source-error completion', async () => {
    const a = setup();
    const transport = createRtnPublisherTransport({ rpc: { rpc: a.rpc }, fetcher: a.fetcher, createHttpClient: a.createHttpClient, now: () => NaN });
    const from = vi.fn();const client = { rpc: a.rpc, storage: { from } } as unknown as NewsWorkerClient;
    await expect(executeRtnNewsCheck(client, claim, transport.forRssClaim(claim))).rejects.toBeInstanceOf(LostPublisherAuthority);
    expect(a.createHttpClient).not.toHaveBeenCalled();expect(a.rpc).not.toHaveBeenCalled();expect(a.fetcher).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();expect(a.close).not.toHaveBeenCalled();
  });
  it.each(['missing','invalid'] as const)('keeps a%s local native client outside action or completion', async mode => {
    const a = setup();const invalidClient = vi.fn(() => ({} as ReturnType<typeof a.createHttpClient>));
    const transport = createRtnPublisherTransport({ rpc: { rpc: a.rpc }, fetcher: a.fetcher, createHttpClient: mode === 'missing' ? undefined : invalidClient, now: () => now });
    const from = vi.fn();const client = { rpc: a.rpc, storage: { from } } as unknown as NewsWorkerClient;
    await expect(executeRtnNewsCheck(client, claim, transport.forRssClaim(claim))).rejects.toBeInstanceOf(LostPublisherAuthority);
    expect(invalidClient).toHaveBeenCalledTimes(mode === 'missing' ? 0 : 1);expect(a.rpc).not.toHaveBeenCalled();expect(a.fetcher).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();expect(a.close).not.toHaveBeenCalled();
  });
  it('closes a locally constructed client when abort arrives before action and first grant', async () => {
    const a = setup(), controller = new AbortController();
    a.createHttpClient.mockImplementation(() => { controller.abort(new Error('local construction cancelled'));return { close: a.close }; });
    const from = vi.fn();const client = { rpc: a.rpc, storage: { from } } as unknown as NewsWorkerClient;
    await expect(executeRtnNewsCheck(client, claim, a.transport.forRssClaim(claim, controller.signal))).rejects.toBeInstanceOf(LostPublisherAuthority);
    expect(a.createHttpClient).toHaveBeenCalledTimes(1);expect(a.close).toHaveBeenCalledTimes(1);expect(a.rpc).not.toHaveBeenCalled();
    expect(a.fetcher).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();
  });
  it.each([
    ['native TLS handshake failure', 'RTN_NEWS_FETCH_FAILED'],
    ['RTN_NEWS_TLS_TIMEOUT', 'RTN_NEWS_TLS_TIMEOUT'],
  ])('preserves a post-grant%s as exactly one existing source-error completion', async (message, errorCode) => {
    const a = setup();a.fetcher.mockRejectedValue(new Error(message));
    const terminal = { run_id: claim.run_id, status: 'error', new_event_count: 0, correction_count: 0, unchanged_count: 0, error_code: errorCode, replayed: false };
    a.rpc.mockImplementation(async (name, args) => ({ data: name === 'authorize_rtn_news_rss_get' ? { publisher_epoch: 2, permitted: true, expires_at: iso6(), get_count: Number(args?.p_expected_get_count) + 1 } : terminal, error: null }));
    const from = vi.fn();const client = { rpc: a.rpc, storage: { from } } as unknown as NewsWorkerClient;
    expect(await executeRtnNewsCheck(client, claim, a.transport.forRssClaim(claim))).toEqual(terminal);
    expect(a.rpc.mock.calls.map(x => x[0])).toEqual(['authorize_rtn_news_rss_get','complete_rtn_news_check']);
    expect(a.rpc.mock.calls[1][1]?.p_result).toEqual({ status: 'error', error_code: errorCode });
    expect(a.fetcher).toHaveBeenCalledTimes(1);expect(a.close).toHaveBeenCalledTimes(1);expect(from).not.toHaveBeenCalled();
  });
});

describe('claim-bound RSS per-GET expected-count authority', () => {
  it('composes a confirmed v2 GET with the unchanged RSS capture/store/single-success-completion payload', async () => {
    const a = setup();
    const xml = '<rss version="2.0"><channel><title>RTN</title><link>https://www.gosnadzor.ru/news/</link><item><title>Headline</title><link>http://www.gosnadzor.ru/news/67/1/</link><pubDate>Fri, 20 Nov 2026 12:00:00 +0300</pubDate></item></channel></rss>';
    a.fetcher.mockResolvedValue(native(RTN_NEWS_RSS_URL, xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } }));
    const terminal = { run_id: claim.run_id, status: 'changed', new_event_count: 1, correction_count: 0, unchanged_count: 0, error_code: null, replayed: false };
    a.rpc.mockImplementation(async (name, args) => ({ data: name === 'authorize_rtn_news_rss_get' ? { publisher_epoch: 2, permitted: true, expires_at: iso6(), get_count: Number(args?.p_expected_get_count) + 1 } : terminal, error: null }));
    const upload = vi.fn(async () => ({ error: null }));
    const client: NewsWorkerClient = { rpc: a.rpc, storage: { from: () => ({ upload, download: () => ({ asStream: async () => ({ data: null, error: null }) }) }) } };
    expect(await executeRtnNewsCheck(client, claim, a.transport.forRssClaim(claim))).toEqual(terminal);
    expect(a.rpc.mock.calls.map(x => x[0])).toEqual(['authorize_rtn_news_rss_get','complete_rtn_news_check']);
    expect(a.rpc.mock.calls[1][1]?.p_result).toMatchObject({ status: 'success', original_path: expect.stringMatching(/^news\/rss\/[0-9a-f]{64}\.xml$/), items: [{ canonical_url: 'https://www.gosnadzor.ru/news/67/1/', title: 'Headline', published_at: '2026-11-20T09:00:00.000Z', content_sha256: expect.any(String) }] });
    expect(upload).toHaveBeenCalledTimes(1);expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('distinguishes actual source403 AFTER a confirmed grant from an RPC403 authority denial', async () => {
    const a = setup();a.fetcher.mockResolvedValue(native(RTN_NEWS_RSS_URL, 'blocked', { status: 403 }));
    a.rpc.mockImplementation(async (name, args) => ({ data: name === 'authorize_rtn_news_rss_get' ? { publisher_epoch: 2, permitted: true, expires_at: iso6(), get_count: Number(args?.p_expected_get_count) + 1 } : { run_id: claim.run_id, status: 'error' }, error: null }));
    const upload = vi.fn();const client = { rpc: a.rpc, storage: { from: () => ({ upload }) } } as unknown as NewsWorkerClient;
    await executeRtnNewsCheck(client, claim, a.transport.forRssClaim(claim));
    expect(a.rpc.mock.calls.map(x => x[0])).toEqual(['authorize_rtn_news_rss_get','complete_rtn_news_check']);
    expect(a.rpc.mock.calls[1][1]?.p_result).toEqual({ status: 'error', error_code: 'RTN_NEWS_HTTP_403' });
    expect(upload).not.toHaveBeenCalled();expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('obtains exact acknowledged counts0→1→2 before two allowed redirect-hop destinations', async () => {
    const a = setup();
    await a.transport.forRssClaim(claim)(async f => {
      await (await f(RTN_NEWS_RSS_URL, init)).text();
      await (await f('https://gosnadzor.ru/news/rss/', init)).text();
    });
    expect(a.rpc.mock.calls.map(call => call[1]?.p_expected_get_count)).toEqual([0,1]);
    expect(a.rpc.mock.calls[0]).toEqual(['authorize_rtn_news_rss_get', { p_run_id: claim.run_id, p_lease_token: claim.lease_token, p_generation: 1, p_expected_get_count: 0 }]);
    expect(a.fetcher).toHaveBeenCalledTimes(2); expect(a.close).toHaveBeenCalledTimes(1);
    expect(a.fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit' });
    expect([...new Headers(a.fetcher.mock.calls[0][1].headers).keys()]).toEqual(['accept']);
  });
  it.each(['42501','40001','08006'])('does not fetch or complete RSS on guard error%s', async code => {
    const a = setup();a.rpc.mockResolvedValue({ data: null, error: { code } });
    const storage = { from: vi.fn() };
    const client = { rpc: a.rpc, storage } as unknown as NewsWorkerClient;
    await expect(executeRtnNewsCheck(client, claim, a.transport.forRssClaim(claim))).rejects.toBeInstanceOf(LostPublisherAuthority);
    expect(a.fetcher).not.toHaveBeenCalled();expect(storage.from).not.toHaveBeenCalled();
    expect(a.rpc.mock.calls.map(x => x[0])).toEqual(['authorize_rtn_news_rss_get']);
  });
  it('rejects malformed, expired, wrong-count and changed-epoch acknowledgements without guessing authority', async () => {
    for (const data of [{ publisher_epoch: 2, permitted: true, expires_at: iso6(), get_count: 2 }, { publisher_epoch: 2, permitted: false, expires_at: iso6(), get_count: 1 }, { publisher_epoch: 2, permitted: true, expires_at: iso6(-1), get_count: 1 }, { publisher_epoch: 2, permitted: true, expires_at: '2026-11-20T15:40:20.000Z', get_count: 1 }]) {
      const a = setup();a.rpc.mockResolvedValue({ data, error: null });
      await expect(a.transport.forRssClaim(claim)(f => f(RTN_NEWS_RSS_URL, init))).rejects.toBeInstanceOf(LostPublisherAuthority);expect(a.fetcher).not.toHaveBeenCalled();
    }
    const a = setup();
    a.rpc.mockResolvedValueOnce({ data: { publisher_epoch: 2, permitted: true, expires_at: iso6(), get_count: 1 }, error: null });
    a.rpc.mockResolvedValueOnce({ data: { publisher_epoch: 3, permitted: true, expires_at: iso6(), get_count: 2 }, error: null });
    await expect(a.transport.forRssClaim(claim)(async f => { await (await f(RTN_NEWS_RSS_URL, init)).text();return f(RTN_NEWS_RSS_URL, init); })).rejects.toBeInstanceOf(LostPublisherAuthority);
    expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('stops at max5 native GETs and rejects arbitrary hosts/articles/auth headers before consuming a grant', async () => {
    const a = setup();
    await a.transport.forRssClaim(claim)(async f => {
      await expect(f('https://www.gosnadzor.ru/news/67/1/', init)).rejects.toThrow('URL_UNSUPPORTED');
      await expect(f(RTN_NEWS_RSS_URL, { ...init, headers: { Authorization: 'never-forward' } })).rejects.toThrow('REQUEST_UNSUPPORTED');
      for (let i = 0; i < 5; i++) await (await f(RTN_NEWS_RSS_URL, init)).text();
      await expect(f(RTN_NEWS_RSS_URL, init)).rejects.toBeInstanceOf(LostPublisherAuthority);
    });
    expect(a.rpc).toHaveBeenCalledTimes(5);expect(a.fetcher).toHaveBeenCalledTimes(5);
  });
  it('bounds a lost guard acknowledgement and performs no second completion or retry', async () => {
    vi.useFakeTimers();const a = setup();let started!: () => void;
    const start = new Promise<void>(resolve => { started = resolve; });
    a.rpc.mockImplementation(() => { started();return new Promise(() => undefined); });
    const pending = expect(a.transport.forRssClaim(claim)(f => f(RTN_NEWS_RSS_URL, init))).rejects.toBeInstanceOf(LostPublisherAuthority);
    await start; await vi.advanceTimersByTimeAsync(20_001);await pending;
    expect(a.rpc).toHaveBeenCalledTimes(1);expect(a.fetcher).not.toHaveBeenCalled();expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('does not authorize use of an escaped fetcher after scope close or overlap unread bodies', async () => {
    const a = setup();let escaped!: typeof fetch;
    await a.transport.forRssClaim(claim)(async f => { escaped = f;const first = await f(RTN_NEWS_RSS_URL, init);await expect(f(RTN_NEWS_RSS_URL, init)).rejects.toBeInstanceOf(LostPublisherAuthority);await first.text(); });
    await expect(escaped(RTN_NEWS_RSS_URL, init)).rejects.toBeInstanceOf(LostPublisherAuthority);
    expect(a.rpc).toHaveBeenCalledTimes(1);
  });
});

describe('one already-reserved archive grant and native response provenance', () => {
  it('preserves native403 with an oversized header as one publisher HTTP403 completion, not a transport retry', async () => {
    const a = setup();a.fetcher.mockResolvedValue(native(archive.page_url, 'blocked', { status: 403, headers: { 'content-type': `text/html; x=${'a'.repeat(129)}` } }));
    a.rpc.mockImplementation(async name => ({ data: name === 'get_rtn_news_archive_anchor_input' ? { state: 'no_success', retry_at: null }
      : name === 'claim_rtn_news_archive_gap' ? { gap_id: '93000000-0000-4000-8000-000000000001', lease_token: '94000000-0000-4000-8000-000000000001', generation: 1, publisher_epoch: 2, lease_expires_at: iso6(120_000), invocation_deadline_at: iso6(70_000), request: archive, remaining: { get_attempts: 19, body_bytes: 19 * 1048576, pages: 10, candidates: 200 } }
      : { status: 'error', replayed: false, accepted_candidates: 0, pending_date_precision: 0, known_rss: 0, stop_reason: 'source_error' }, error: null }));
    const from = vi.fn();const client = { rpc: a.rpc, storage: { from } } as unknown as NewsWorkerClient;
    expect(await reconcileRtnNewsArchive({ service: client, privateClient: () => client, transport: a.transport, now: () => now }, now + 115_000)).toEqual({ status: 'error', stop_reason: 'source_error' });
    expect(a.rpc.mock.calls.map(x => x[0])).toEqual(['get_rtn_news_archive_anchor_input','claim_rtn_news_archive_gap','complete_rtn_news_archive_request']);
    expect(a.rpc.mock.calls[2][1]?.p_result).toEqual({ status: 'error', error_code: 'RTN_ARCHIVE_HTTP_403', body_bytes_seen: 0, byte_limit_exceeded: false });
    expect(a.fetcher).toHaveBeenCalledTimes(1);expect(from).not.toHaveBeenCalled();
  });
  it('keeps the128-character success-header limit fail-closed for HTTP200', async () => {
    const a = setup();const r = native(archive.page_url, 'body', { headers: { 'content-type': `text/html; x=${'a'.repeat(129)}` } });
    const cancel = vi.spyOn(r.body!, 'cancel');a.fetcher.mockResolvedValue(r);
    await expect(a.transport.withArchiveTransport(scope => scope.withGrant(archive, f => f(archive.page_url, init)))).rejects.toThrow('RESPONSE_HEADER_INVALID');
    expect(cancel).toHaveBeenCalledTimes(1);expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('cancels a raw native body when abort lands after bounded headers resolve but before ownership wraps', async () => {
    const a = setup(), controller = new AbortController();const r = native(archive.page_url);
    const cancel = vi.spyOn(r.body!, 'cancel');
    a.fetcher.mockImplementation(() => { const pending = Promise.resolve(r);void pending.then(() => queueMicrotask(() => controller.abort()));return pending; });
    await expect(a.transport.withArchiveTransport(scope => scope.withGrant(archive, f => f(archive.page_url, init)), controller.signal)).rejects.toThrow('ABORTED');
    expect(cancel).toHaveBeenCalledTimes(1);expect(a.close).toHaveBeenCalledTimes(1);expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses the exact DB grant once without RSS RPC and retains real URL/header before body rewrap', async () => {
    const a = setup();
    await a.transport.withArchiveTransport(async scope => scope.withGrant(archive, async (f, observe) => {
      const r = await f(archive.page_url, init);expect(r.url).toBe('');await r.text();
      expect(observe()).toEqual({ resolved_url: archive.page_url, content_type: 'text/html; charset=utf-8' });
      await expect(f(archive.page_url, init)).rejects.toBeInstanceOf(LostPublisherAuthority);
    }));
    expect(a.rpc).not.toHaveBeenCalled();expect(a.fetcher).toHaveBeenCalledTimes(1);expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('rejects replayed grant IDs, URL mismatch, no response observation and expired or nonadjacent-cap targets', async () => {
    const a = setup();
    await a.transport.withArchiveTransport(async scope => {
      await scope.withGrant(archive, async (f, observe) => { expect(() => observe()).toThrow(LostPublisherAuthority);await expect(f(archive.page_url + '?PAGEN_1=2', init)).rejects.toBeInstanceOf(LostPublisherAuthority); });
      await expect(scope.withGrant(archive, async () => null)).rejects.toBeInstanceOf(LostPublisherAuthority);
      await expect(scope.withGrant({ ...archive, page_number: 11, page_url: archive.page_url + '?PAGEN_1=11' }, async () => null)).rejects.toBeInstanceOf(LostPublisherAuthority);
      await expect(scope.withGrant({ ...archive, request_deadline_at: iso6(-1) }, async () => null)).rejects.toBeInstanceOf(LostPublisherAuthority);
    });
    expect(a.fetcher).not.toHaveBeenCalled();expect(a.rpc).not.toHaveBeenCalled();
  });
  it('fails closed on missing/foreign native URL rather than deriving one from the requested filename', async () => {
    for (const make of [() => new Response('x'), () => native('https://outside.test/news/')]) {
      const a = setup();const r = make();const cancel = vi.spyOn(r.body!, 'cancel');a.fetcher.mockResolvedValue(r);
      await expect(a.transport.withArchiveTransport(scope => scope.withGrant(archive, (f) => f(archive.page_url, init)))).rejects.toThrow('RESPONSE_URL_INVALID');expect(cancel).toHaveBeenCalledTimes(1);
    }
  });
  it('cancels an archive body stalled past its inherited20s grant deadline without waiting on cancel', async () => {
    vi.useFakeTimers();const a = setup();const cancel = vi.fn(() => new Promise<void>(() => undefined));
    a.fetcher.mockResolvedValue(native(archive.page_url, new ReadableStream({ pull: () => new Promise(() => undefined), cancel })));
    let bodyStarted!: () => void;const start = new Promise<void>(resolve => { bodyStarted = resolve; });
    const pending = expect(a.transport.withArchiveTransport(scope => scope.withGrant(archive, async f => { const r = await f(archive.page_url, init);bodyStarted();await r.text(); }))).rejects.toThrow('TIMEOUT');
    await start;await vi.advanceTimersByTimeAsync(20_001);await pending;
    expect(cancel).toHaveBeenCalledTimes(1);expect(a.fetcher).toHaveBeenCalledTimes(1);expect(a.close).toHaveBeenCalledTimes(1);
  });
});

describe('supported deadline-scoped SDK global.fetch', () => {
  it('preserves SDK request body/auth/options and combines caller/native absolute deadline signals', async () => {
    const controller = new AbortController();
    const f = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'));
    const sdk = createDeadlinePrivateFetch(f as typeof fetch, 'https://private.fixture.test', now + 70_000, controller.signal, () => now);
    const body = new Uint8Array([1,2]);const headers = { Authorization: 'synthetic-private-key' };
    await sdk('https://private.fixture.test/storage/v1/object/rtn-sources/a.html', { method: 'POST', headers, body });
    const forwarded = f.mock.calls[0][1]!;expect(forwarded).toMatchObject({ method: 'POST', headers, body });
    expect(forwarded.signal).toBeInstanceOf(AbortSignal);controller.abort();expect(forwarded.signal!.aborted).toBe(true);
  });
  it('rejects private cross-origin requests and already exhausted deadlines before native fetch', async () => {
    const f = vi.fn();const sdk = createDeadlinePrivateFetch(f as typeof fetch, 'https://private.fixture.test', now + 70_000, undefined, () => now);
    await expect(sdk('https://www.gosnadzor.ru/news/', {})).rejects.toThrow('PRIVATE_ORIGIN_INVALID');
    const expired = createDeadlinePrivateFetch(f as typeof fetch, 'https://private.fixture.test', now, undefined, () => now);
    await expect(expired('https://private.fixture.test/rest/v1/rpc/x')).rejects.toThrow('ABORTED');expect(f).not.toHaveBeenCalled();
  });
  it('accepts only new exact UTC6 grants, without changing old claim timestamp parsing', () => {
    expect(utc6Milliseconds(iso6())).toBe(now + 20_000);
    for (const value of ['2026-02-30T12:00:00.000000Z', '2026-11-20T15:40:20.000Z', '2026-11-20T18:40:20.000000+03:00']) expect(utc6Milliseconds(value)).toBeNaN();
  });
});
