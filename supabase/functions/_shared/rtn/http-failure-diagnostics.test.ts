// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpFailureError, httpFailureDiagnostic } from './http-failure-diagnostics';
import { fetchOfficial, sha256 } from './official-source';
import { fetchRtnNewsRss, RTN_NEWS_RSS_URL, RTN_NEWS_TIMEOUT_MS } from './news-source';
import { executeCheck, type CheckClaim, type WorkerClient } from './check-worker';
import { executeRtnNewsCheck, type NewsWorkerClient, type RtnNewsClaim } from './news-worker';
import { reportNewsHttpFailure, reportSourceCheckFailure } from './source-diagnostics';

const encode = (text: string) => new TextEncoder().encode(text);
const page = 'https://www.gosnadzor.ru/service/list/Safety%20certification/a1/index.php';
const expectedKeys = ['schema', 'http_status', 'cause_family', 'mime_family', 'server_family', 'sample_bytes', 'sample_complete', 'sample_sha256', 'sample_state', 'markers'].sort();
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('bounded evidence from the already denied HTTP response', () => {
  it('records only the exact frozen DTO and hashes the actual complete prefix', async () => {
    const text = '<html>Access denied. Verify you are human. PRIVATE_BODY_CANARY</html>';
    const error = await createHttpFailureError(new Response(text, { status: 403, headers: {
      'content-type': 'text/html; charset=utf-8', server: 'nginx/1.24.0 PRIVATE_SERVER_CANARY',
      'set-cookie': 'PRIVATE_COOKIE_CANARY', authorization: 'Bearer PRIVATE_AUTH_CANARY',
      'x-request-id': 'PRIVATE_REQUEST_CANARY', 'content-length': '999999999999',
    } }), 'OFFICIAL_HTTP_403');
    const dto = httpFailureDiagnostic(error)!;
    expect(error.message).toBe('OFFICIAL_HTTP_403');
    expect(Object.keys(dto).sort()).toEqual(expectedKeys);
    expect(dto).toEqual({ schema: 'rtn-http-failure-v2', http_status: 403, cause_family: 'http_response',
      mime_family: 'html', server_family: 'nginx', sample_bytes: encode(text).length,
      sample_complete: true, sample_sha256: await sha256(encode(text)), sample_state: 'complete', markers: ['captcha', 'access_denied'] });
    expect(Object.isFrozen(dto)).toBe(true); expect(Object.isFrozen(dto.markers)).toBe(true);
    expect(JSON.stringify(dto)).not.toMatch(/CANARY|Bearer|cookie|request-id|https?:|nginx\/1/);
  });

  it.each([
    ['text/plain', 'Apache/2.4', 'plain', 'apache'],
    ['application/problem+json', 'cloudflare', 'json', 'cloudflare'],
    ['application/rss+xml; charset=utf-8', 'envoy', 'xml', 'envoy'],
    ['image/png', 'private-host-version', 'other', 'other'],
    [null, null, 'missing', 'missing'],
  ])('projects only MIME/server families for %s / %s', async (mime, server, mimeFamily, serverFamily) => {
    const headers = new Headers(); if (mime) headers.set('content-type', mime); if (server) headers.set('server', server);
    const error = await createHttpFailureError(new Response(null, { status: 503, headers }), 'OFFICIAL_HTTP_503');
    expect(httpFailureDiagnostic(error)).toMatchObject({ mime_family: mimeFamily, server_family: serverFamily,
      http_status: 503, sample_bytes: 0, sample_complete: false, sample_sha256: null, sample_state: 'no_body', markers: [] });
  });

  it('reports explicit Cyrillic access denial and fixed rate/auth/region phrases without claiming a cause', async () => {
    const error = await createHttpFailureError(new Response('ДОСТУП ЗАПРЕЩЁН. Your country is restricted. Too many requests. Login required.', { status: 403 }), 'OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)!.markers).toEqual(['access_denied', 'geo_denied', 'rate_limited', 'authentication_required']);
  });

  it('does not infer geographic or WAF denial from a country name or a generic error', async () => {
    const error = await createHttpFailureError(new Response('Russia region service error. PRIVATE_TEXT', { status: 403 }), 'OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)!.markers).toEqual([]);
  });

  it('copies only the remaining2048byte prefix of a huge chunk and ignores later markers', async () => {
    const value = new Uint8Array(1024 * 1024).fill(120); value.set(encode('ACCESS DENIED'), 2050);
    const slice = vi.spyOn(value, 'slice'), cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(value); }, cancel });
    const response = new Response(body, { status: 403 });
    const error = await createHttpFailureError(response, 'OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)).toMatchObject({ sample_bytes: 2048, sample_complete: false,
      sample_sha256: await sha256(value.subarray(0, 2048)), sample_state: 'capped', markers: [] });
    expect(slice).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledTimes(1); expect(body.locked).toBe(false);
  });

  it('does not call exact2048bytes complete without observing EOF', async () => {
    const error = await createHttpFailureError(new Response(new Uint8Array(2048), { status: 403 }), 'OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)).toMatchObject({ sample_bytes: 2048, sample_complete: false, sample_state: 'capped' });
  });

  it('reads across chunks while retaining only the remaining prefix', async () => {
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(2040)); c.enqueue(encode('forbidden'.repeat(400))); } });
    const error = await createHttpFailureError(new Response(body, { status: 403 }), 'OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)).toMatchObject({ sample_bytes: 2048, sample_complete: false, sample_state: 'capped', markers: [] });
  });

  it('returns within the250ms budget for a stalled read and a nonsettling cancel', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ cancel });
    const pending = createHttpFailureError(new Response(body, { status: 403 }), 'OFFICIAL_HTTP_403');
    await vi.advanceTimersByTimeAsync(250);
    const error = await pending;
    expect(error.message).toBe('OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)).toMatchObject({ sample_bytes: 0, sample_complete: false, sample_sha256: null, sample_state: 'timeout' });
    expect(cancel).toHaveBeenCalledTimes(1); expect(body.locked).toBe(false);
  });

  it('retains a partial prefix without hashing after its shared budget expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(encode('Access denied')); } });
    const pending = createHttpFailureError(new Response(body, { status: 403 }), 'OFFICIAL_HTTP_403');
    await vi.advanceTimersByTimeAsync(250);
    expect(httpFailureDiagnostic(await pending)).toMatchObject({ sample_bytes: 13, sample_complete: false,
      sample_sha256: null, sample_state: 'timeout', markers: ['access_denied'] });
  });

  it('does not await a nonsettling cancellation hook when the byte cap is reached', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4096)); }, cancel });
    const error = await createHttpFailureError(new Response(body, { status: 429 }), 'RTN_NEWS_HTTP_429');
    expect(httpFailureDiagnostic(error)).toMatchObject({ http_status: 429, sample_bytes: 2048, sample_state: 'capped' });
    expect(cancel).toHaveBeenCalledTimes(1); expect(body.locked).toBe(false);
  });

  it('handles a rejecting cancellation hook without replacing the HTTP error', async () => {
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4096)); }, cancel() { return Promise.reject(new Error('PRIVATE_CANCEL_CANARY')); } });
    const error = await createHttpFailureError(new Response(body, { status: 403 }), 'OFFICIAL_HTTP_403');
    expect(error.message).toBe('OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)).toMatchObject({ sample_state: 'capped', sample_bytes: 2048 });
  });

  it('binds the known status even when the existing signal is already aborted', async () => {
    const controller = new AbortController(); controller.abort(); const cancel = vi.fn();
    const error = await createHttpFailureError(new Response(new ReadableStream({ cancel }), { status: 403 }), 'OFFICIAL_HTTP_403', controller.signal);
    expect(httpFailureDiagnostic(error)).toMatchObject({ http_status: 403, sample_state: 'aborted', sample_bytes: 0, sample_sha256: null });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('stops a pending read on the existing signal without waiting for its own timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const controller = new AbortController(), cancel = vi.fn();
    const pending = createHttpFailureError(new Response(new ReadableStream({ cancel }), { status: 403 }), 'OFFICIAL_HTTP_403', controller.signal);
    controller.abort();
    const error = await pending;
    expect(httpFailureDiagnostic(error)).toMatchObject({ sample_state: 'aborted', sample_bytes: 0 });
    expect(cancel).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps read-error evidence bounded and does not expose its rejection', async () => {
    const body = new ReadableStream<Uint8Array>({ start(c) { c.error(new Error('PRIVATE_READ_CANARY')); } });
    const error = await createHttpFailureError(new Response(body, { status: 403 }), 'OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)).toMatchObject({ sample_state: 'read_error', sample_bytes: 0, sample_complete: false });
    expect(JSON.stringify(httpFailureDiagnostic(error))).not.toContain('CANARY');
  });

  it('does not fail the known HTTP response when its sampled text has malformed UTF8', async () => {
    const error = await createHttpFailureError(new Response(new Uint8Array([255, 254, 253]), { status: 403 }), 'OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)).toMatchObject({ sample_state: 'complete', sample_bytes: 3, sample_complete: true, markers: [] });
  });

  it('keeps a safe base if the body reader is already locked elsewhere', async () => {
    const response = new Response('locked', { status: 403 }), reader = response.body!.getReader();
    const error = await createHttpFailureError(response, 'OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)).toMatchObject({ sample_state: 'read_error', sample_bytes: 0 });
    await reader.cancel(); reader.releaseLock();
  });

  it('keeps its known status if the diagnostic clock fails before a reader is acquired', async () => {
    const cancel = vi.fn(), body = new ReadableStream<Uint8Array>({ cancel });
    vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('PRIVATE_CLOCK_CANARY'); });
    const error = await createHttpFailureError(new Response(body, { status: 403 }), 'OFFICIAL_HTTP_403');
    expect(error.message).toBe('OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)).toMatchObject({ http_status: 403, sample_state: 'read_error', sample_bytes: 0 });
    expect(cancel).toHaveBeenCalledTimes(1); expect(body.locked).toBe(false);
  });

  it('binds its safe status before reading a failing diagnostic body getter', async () => {
    const response = new Response('forbidden', { status: 403 }), body = response.body;
    Object.defineProperty(response, 'body', { get() { throw new Error('PRIVATE_BODY_GETTER_CANARY'); } });
    const error = await createHttpFailureError(response, 'OFFICIAL_HTTP_403');
    expect(error.message).toBe('OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)).toMatchObject({ http_status: 403, sample_state: 'read_error', sample_bytes: 0 });
    await body!.cancel();
  });

  it('keeps the old error when digest rejects and exposes no hashing exception', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('PRIVATE_HASH_CANARY'));
    const error = await createHttpFailureError(new Response('forbidden', { status: 403 }), 'OFFICIAL_HTTP_403');
    expect(error.message).toBe('OFFICIAL_HTTP_403');
    expect(httpFailureDiagnostic(error)).toMatchObject({ sample_state: 'complete', sample_bytes: 9, sample_complete: true, sample_sha256: null, markers: ['access_denied'] });
    expect(JSON.stringify(httpFailureDiagnostic(error))).not.toContain('CANARY');
  });

  it('includes nonsettling crypto in the SAME250ms budget and still preserves observed EOF', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const digest = vi.spyOn(crypto.subtle, 'digest').mockReturnValue(new Promise<ArrayBuffer>(() => {}));
    const pending = createHttpFailureError(new Response('forbidden', { status: 403 }), 'OFFICIAL_HTTP_403');
    await vi.advanceTimersByTimeAsync(0); expect(digest).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(httpFailureDiagnostic(await pending)).toMatchObject({ http_status: 403, sample_state: 'timeout', sample_bytes: 9, sample_complete: true, sample_sha256: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores forged, cyclic or hostile evidence properties on arbitrary errors', () => {
    const forged = new Error('OFFICIAL_HTTP_403'); forged.cause = forged;
    Object.defineProperty(forged, 'http_failure', { get() { throw new Error('PRIVATE_GETTER_CANARY'); } });
    expect(httpFailureDiagnostic(forged)).toBeUndefined();
    expect(httpFailureDiagnostic({ schema: 'rtn-http-failure-v2', http_status: 403 })).toBeUndefined();
    expect(httpFailureDiagnostic(null)).toBeUndefined(); expect(httpFailureDiagnostic('OFFICIAL_HTTP_403')).toBeUndefined();
  });
});

describe('HTTP evidence never changes the existing bank/news completion', () => {
  const bank: CheckClaim = { run_id: '17000000-0000-4000-8000-000000000001', lease_token: 'PRIVATE_LEASE_CANARY', kind: 'manual',
    source: { id: '27000000-0000-4000-8000-000000000001', page_url: page, document_url: page.replace('index.php', 'old.pdf'), trusted_anchor_rule: 'a1', parser: 'industrial-pdf', last_sha256: null } };
  const news: RtnNewsClaim = { run_id: '90000000-0000-4000-8000-000000000001', lease_token: '91000000-0000-4000-8000-000000000001', generation: 1,
    kind: 'manual', source_url: RTN_NEWS_RSS_URL, lease_expires_at: '2026-11-23T00:00:00Z' };
  function adapters() {
    const upload = vi.fn().mockResolvedValue({ error: null }), from = vi.fn(() => ({ upload, download: vi.fn() }));
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({ data: { run_id: args.p_run_id, status: 'error' }, error: null }));
    return { client: { rpc, storage: { from } }, rpc, upload, from };
  }
  const scope = (fetcher: typeof fetch) => async <T>(action: (fetcher: typeof fetch) => Promise<T>) => action(fetcher);

  it('adds one V2 bank event with actual run/source/stage while keeping V1 and exact completion', async () => {
    const a = adapters(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = vi.fn(async () => new Response('Access denied PRIVATE_BODY_CANARY', { status: 403, headers: { 'content-type': 'text/html', 'set-cookie': 'PRIVATE_COOKIE_CANARY' } }));
    await executeCheck(a.client as unknown as WorkerClient, bank, async () => [], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(a.upload).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toEqual({ tag: 'RTN_SOURCE_CHECK_DIAGNOSTIC_V1', run_id: bank.run_id, source_id: bank.source.id,
      stage: 'question_page_fetch', exception: { name: 'Error', transport: 'unclassified' }, causes: [] });
    expect(log.mock.calls[1][0]).toMatchObject({ tag: 'RTN_HTTP_DENIAL_DIAGNOSTIC_V2', run_id: bank.run_id, source_id: bank.source.id,
      stage: 'question_page_fetch', http_failure: { http_status: 403, markers: ['access_denied'] } });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/CANARY|https?:|Bearer|cookie/);
    expect(a.rpc).toHaveBeenCalledTimes(1); expect(a.rpc.mock.calls[0]).toEqual(['complete_rtn_check', {
      p_run_id: bank.run_id, p_lease_token: bank.lease_token, p_result: { status: 'error', error: 'OFFICIAL_HTTP_403' },
    }]);
  });

  it('records only one news V2 event and the unchanged error code with no private upload', async () => {
    const a = adapters(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = vi.fn(async () => new Response('forbidden PRIVATE_CANARY', { status: 403 }));
    await executeRtnNewsCheck(a.client as unknown as NewsWorkerClient, news, scope(fetcher));
    expect(fetcher).toHaveBeenCalledTimes(1); expect(a.from).not.toHaveBeenCalled(); expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({ tag: 'RTN_HTTP_DENIAL_DIAGNOSTIC_V2', run_id: news.run_id, stage: 'rss_fetch', http_failure: { http_status: 403 } });
    expect(JSON.stringify(log.mock.calls)).not.toContain('CANARY');
    expect(a.rpc).toHaveBeenCalledTimes(1); expect(a.rpc.mock.calls[0]).toEqual(['complete_rtn_news_check', {
      p_run_id: news.run_id, p_lease_token: news.lease_token, p_result: { status: 'error', error_code: 'RTN_NEWS_HTTP_403' },
    }]);
  });

  it('preserves the bank and news errors if operator logging itself throws', async () => {
    const a = adapters(); vi.spyOn(console, 'error').mockImplementation(() => { throw new Error('PRIVATE_LOG_CANARY'); });
    const fetcher = vi.fn(async () => new Response('forbidden', { status: 403 }));
    await executeCheck(a.client as unknown as WorkerClient, bank, async () => [], fetcher);
    await executeRtnNewsCheck(a.client as unknown as NewsWorkerClient, news, scope(fetcher));
    expect(a.rpc).toHaveBeenCalledTimes(2);
    expect(a.rpc.mock.calls[0][1].p_result).toEqual({ status: 'error', error: 'OFFICIAL_HTTP_403' });
    expect(a.rpc.mock.calls[1][1].p_result).toEqual({ status: 'error', error_code: 'RTN_NEWS_HTTP_403' });
  });

  it('never emits V2 for a forged cyclic thrown HTTP-looking error', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {}), forged = Object.assign(new Error('OFFICIAL_HTTP_403'), { http_status: 403, sample_sha256: 'f'.repeat(64) });
    forged.cause = forged;
    reportSourceCheckFailure(bank, 'question_page_fetch', forged); reportNewsHttpFailure(news, forged);
    expect(log).toHaveBeenCalledTimes(1); expect(log.mock.calls[0][0].tag).toBe('RTN_SOURCE_CHECK_DIAGNOSTIC_V1');
  });

  it('does not produce HTTP evidence for the existing200-with-no-body error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = await fetchOfficial(page, 'page', vi.fn(async () => new Response(null))).catch(e => e);
    expect(error.message).toBe('OFFICIAL_HTTP_200'); expect(httpFailureDiagnostic(error)).toBeUndefined(); expect(log).not.toHaveBeenCalled();
  });

  it('returns success bytes and the original request options without sampling or extra GETs', async () => {
    const bytes = encode('%PDF-1.7 synthetic-original'), digest = vi.spyOn(crypto.subtle, 'digest');
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(bytes, { headers: { 'content-type': 'application/pdf' } }));
    const result = await fetchOfficial(page.replace('index.php', 'test.pdf'), 'document', fetcher);
    expect(result.bytes).toEqual(bytes); expect(digest).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'manual', headers: { Accept: 'application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
  });

  it('retains a bound news403 when the existing20s source deadline expires during sampling', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const cancel = vi.fn();
    const fetcher = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, RTN_NEWS_TIMEOUT_MS - 10)); return new Response(new ReadableStream({ cancel }), { status: 403 }); });
    const pending = fetchRtnNewsRss(fetcher).catch(e => e);
    await vi.advanceTimersByTimeAsync(RTN_NEWS_TIMEOUT_MS);
    const error = await pending;
    expect(error.message).toBe('RTN_NEWS_HTTP_403'); expect(httpFailureDiagnostic(error)).toMatchObject({ http_status: 403, sample_state: 'aborted' });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let an unbound HTTP-looking news exception bypass the old aborted mapping', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(Object.assign(new Error('RTN_NEWS_HTTP_403'), { http_failure: { http_status: 403 } })), { once: true });
    }));
    const pending = fetchRtnNewsRss(fetcher).catch(e => e);
    await vi.advanceTimersByTimeAsync(RTN_NEWS_TIMEOUT_MS);
    const error = await pending;
    expect(error.message).toBe('RTN_NEWS_FETCH_TIMEOUT'); expect(httpFailureDiagnostic(error)).toBeUndefined(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
