// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureRtnNewsOriginal, executeRtnNewsCheck, readRtnNewsClaim, safeRtnNewsError, type NewsWorkerClient, type RtnNewsClaim } from './news-worker';
import { createWithRtnNewsFetch } from './news-http-client';
import { RTN_NEWS_BYTE_LIMIT, RTN_NEWS_RSS_URL } from './news-source';
import { sha256 } from './official-source';

const claim: RtnNewsClaim = { run_id: '90000000-0000-4000-8000-000000000001', lease_token: '91000000-0000-4000-8000-000000000001',
  generation: 1, kind: 'manual', source_url: RTN_NEWS_RSS_URL, lease_expires_at: '2026-11-20T12:00:00Z' };
const rss = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>RTN</title><link>https://www.gosnadzor.ru/news/</link><item><title>Official headline</title><link>http://www.gosnadzor.ru/news/67/12345/</link><description>Source editorial description must not become a generated summary.</description><pubDate>Fri, 20 Nov 2026 12:00:00 +0300</pubDate></item></channel></rss>';
const xml = (body: BodyInit | null = rss) => new Response(body, { headers: { 'content-type': 'text/xml; charset=utf-8' } });
const bytes = new TextEncoder().encode(rss);
const receipt = { run_id: claim.run_id, status: 'changed', new_event_count: 1, correction_count: 0, unchanged_count: 0, error_code: null, replayed: false };
function setup(response: () => Response = () => xml()) {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
  const upload = vi.fn(async (_path: string, _bytes: Uint8Array, _options: unknown) => ({ error: null as null | { statusCode: string; message: string } }));
  const asStream = vi.fn(async () => ({ data: new Blob([bytes]).stream() as ReadableStream<Uint8Array> | null, error: null as unknown }));
  const download = vi.fn((_path: string) => ({ asStream }));
  const from = vi.fn(() => ({ upload, download }));
  const rpc = vi.fn(async (_name: string, _args?: Record<string, unknown>) => ({ data: receipt as unknown, error: null as { code?: string } | null }));
  const client: NewsWorkerClient = { rpc, storage: { from } };
  return { fetcher, upload, download, asStream, from, rpc, client, scope: async <T>(action: (fetcher: typeof fetch) => Promise<T>) => action(fetcher as typeof fetch) };
}
afterEach(() => vi.useRealTimers());

describe('one central RSS capture and immutable original', () => {
  it('stores precisely one bounded fetched XML and sends only public headline/link metadata', async () => {
    const a = setup();const result = await executeRtnNewsCheck(a.client, claim, a.scope);
    const hash = await sha256(bytes);
    expect(result.status).toBe('changed');expect(a.fetcher).toHaveBeenCalledTimes(1);
    expect(a.fetcher.mock.calls[0][0]).toBe(RTN_NEWS_RSS_URL);
    expect(a.from).toHaveBeenCalledWith('rtn-sources');
    expect(a.upload).toHaveBeenCalledWith(`news/rss/${hash}.xml`, bytes, { contentType: 'application/xml', upsert: false });
    expect(a.rpc).toHaveBeenCalledTimes(1);
    const payload = a.rpc.mock.calls[0][1]!.p_result as Record<string, unknown>;
    expect(payload).toMatchObject({ status: 'success', response_sha256: hash, byte_size: bytes.byteLength });
    expect(payload.items).toEqual([{ canonical_url: 'https://www.gosnadzor.ru/news/67/12345/', title: 'Official headline', published_at: '2026-11-20T09:00:00.000Z', content_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }]);
    expect(JSON.stringify(payload)).not.toContain('editorial');expect(JSON.stringify(payload)).not.toContain('own_summary');
  });
  it('observes multiple original chunks without another request or Response.clone', async () => {
    let offset = 0;const a = setup(() => xml(new ReadableStream<Uint8Array>({ pull(c) { if (offset >= bytes.length) return c.close();c.enqueue(bytes.slice(offset, offset += 17)); } })));
    const result = await captureRtnNewsOriginal(a.fetcher as typeof fetch);
    expect(result.bytes).toEqual(bytes);expect(result.feed.response_sha256).toBe(await sha256(bytes));expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects streamed over-limit bytes and never stores a partial original', async () => {
    const a = setup(() => xml(new Uint8Array(RTN_NEWS_BYTE_LIMIT + 1)));
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(a.upload).not.toHaveBeenCalled();expect(a.rpc.mock.calls[0][1]!.p_result).toEqual({ status: 'error', error_code: 'RTN_NEWS_BODY_SIZE_INVALID' });
  });
  it('preserves403 as a failure with one request and no alternate endpoint', async () => {
    const a = setup(() => new Response('blocked', { status: 403 }));
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(a.fetcher).toHaveBeenCalledTimes(1);expect(a.upload).not.toHaveBeenCalled();
    expect(a.rpc.mock.calls[0][1]!.p_result).toEqual({ status: 'error', error_code: 'RTN_NEWS_HTTP_403' });
  });
  it('does not archive malformed XML or include private parser exceptions', async () => {
    const a = setup(() => xml('<rss version="2.0"><channel>'));
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(a.upload).not.toHaveBeenCalled();expect(a.rpc.mock.calls[0][1]!.p_result).toMatchObject({ status: 'error', error_code: expect.stringMatching(/^RTN_NEWS_XML_/) });
  });
  it('records a storage failure without declaring news ingestion successful', async () => {
    const a = setup();a.upload.mockResolvedValue({ error: { statusCode: '500', message: 'private storage detail' } });
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(a.download).not.toHaveBeenCalled();expect(a.rpc.mock.calls[0][1]!.p_result).toEqual({ status: 'error', error_code: 'RTN_NEWS_ORIGINAL_STORAGE_FAILED' });
  });
  it('accepts a409 conflict only after exact private-object size/hash readback', async () => {
    const a = setup();a.upload.mockResolvedValue({ error: { statusCode: '409', message: 'conflict' } });
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(a.download).toHaveBeenCalledTimes(1);expect(a.asStream).toHaveBeenCalledTimes(1);expect(a.rpc.mock.calls[0][1]!.p_result).toMatchObject({ status: 'success' });
    expect(a.upload).toHaveBeenCalledTimes(1);
  });
  it('rejects an existing object with different bytes instead of overwriting it', async () => {
    const a = setup();a.upload.mockResolvedValue({ error: { statusCode: '409', message: 'conflict' } });
    a.asStream.mockResolvedValue({ data: new Blob([new Uint8Array(bytes.length)]).stream(), error: null });
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(a.upload).toHaveBeenCalledTimes(1);expect(a.rpc.mock.calls[0][1]!.p_result).toEqual({ status: 'error', error_code: 'RTN_NEWS_ORIGINAL_HASH_CONFLICT' });
  });
  it('cancels an oversized private-object chunk before buffering or another official GET', async () => {
    const a = setup();const cancel = vi.fn();a.upload.mockResolvedValue({ error: { statusCode: '409', message: 'conflict' } });
    a.asStream.mockResolvedValue({ data: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(RTN_NEWS_BYTE_LIMIT + 1)); }, cancel }), error: null });
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(cancel).toHaveBeenCalledTimes(1);expect(a.fetcher).toHaveBeenCalledTimes(1);expect(a.upload).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls[0][1]!.p_result).toEqual({ status: 'error', error_code: 'RTN_NEWS_ORIGINAL_HASH_CONFLICT' });
  });
  it('bounds cumulative chunked private readback and cancels at the first excess byte', async () => {
    const a = setup();const cancel = vi.fn();let sent = 0;a.upload.mockResolvedValue({ error: { statusCode: '409', message: 'conflict' } });
    a.asStream.mockResolvedValue({ data: new ReadableStream<Uint8Array>({ pull(c) {
      if (sent++ === 0) c.enqueue(bytes);else c.enqueue(new Uint8Array(1));
    }, cancel }), error: null });
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(cancel).toHaveBeenCalledTimes(1);expect(a.rpc.mock.calls[0][1]!.p_result).toMatchObject({ error_code: 'RTN_NEWS_ORIGINAL_HASH_CONFLICT' });
  });
  it('records private readback stream failure without leaking its exception or retrying download', async () => {
    const a = setup();a.upload.mockResolvedValue({ error: { statusCode: '409', message: 'conflict' } });
    a.asStream.mockResolvedValue({ data: new ReadableStream({ start(c) { c.error(new Error('private transport detail')); } }), error: null });
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(a.download).toHaveBeenCalledTimes(1);expect(a.rpc.mock.calls[0][1]!.p_result).toEqual({ status: 'error', error_code: 'RTN_NEWS_ORIGINAL_STORAGE_READ_FAILED' });
  });
  it('cancels a stalled private readback at its bounded deadline', async () => {
    vi.useFakeTimers();const a = setup();const cancel = vi.fn();let opened!: () => void;
    const streamOpened = new Promise<void>(resolve => { opened = resolve; });
    a.upload.mockResolvedValue({ error: { statusCode: '409', message: 'conflict' } });
    a.asStream.mockImplementation(async () => { opened();return { data: new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}), cancel }), error: null }; });
    const pending = executeRtnNewsCheck(a.client, claim, a.scope);
    await streamOpened;await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(20_001);await pending;
    expect(cancel).toHaveBeenCalledTimes(1);expect(a.fetcher).toHaveBeenCalledTimes(1);expect(a.download).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls[0][1]!.p_result).toEqual({ status: 'error', error_code: 'RTN_NEWS_ORIGINAL_READBACK_TIMEOUT' });
  });
  it('rejects an absent private readback instead of treating the upload conflict as success', async () => {
    const a = setup();a.upload.mockResolvedValue({ error: { statusCode: '409', message: 'conflict' } });
    a.asStream.mockResolvedValue({ data: null, error: { message: 'not available' } });
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(a.rpc.mock.calls[0][1]!.p_result).toEqual({ status: 'error', error_code: 'RTN_NEWS_ORIGINAL_STORAGE_READ_FAILED' });
  });
  it('accepts the provider400 already-exists shape with the same exact readback', async () => {
    const a = setup();a.upload.mockResolvedValue({ error: { statusCode: '400', message: 'The resource already exists' } });
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(a.download).toHaveBeenCalledTimes(1);expect(a.asStream).toHaveBeenCalledTimes(1);expect(a.rpc.mock.calls[0][1]!.p_result).toMatchObject({ status: 'success' });
  });
  it('does not reinterpret a generic400 upload error as a duplicate', async () => {
    const a = setup();a.upload.mockResolvedValue({ error: { statusCode: '400', message: 'Invalid request' } });
    await executeRtnNewsCheck(a.client, claim, a.scope);expect(a.download).not.toHaveBeenCalled();
    expect(a.rpc.mock.calls[0][1]!.p_result).toMatchObject({ status: 'error' });
  });
  it('propagates an unknown completion commit without a second error-completion call', async () => {
    const a = setup();a.rpc.mockResolvedValue({ data: null, error: { code: '08006' } });
    await expect(executeRtnNewsCheck(a.client, claim, a.scope)).rejects.toThrow('RTN_NEWS_DATABASE_OPERATION_FAILED');
    expect(a.rpc).toHaveBeenCalledTimes(1);expect(a.rpc.mock.calls[0][1]!.p_result).toMatchObject({ status: 'success' });
  });
  it('rejects a foreign completion identity without retry or fabricated success', async () => {
    const a = setup();a.rpc.mockResolvedValue({ data: { ...receipt, run_id: '90000000-0000-4000-8000-000000000002' }, error: null });
    await expect(executeRtnNewsCheck(a.client, claim, a.scope)).rejects.toThrow('RTN_NEWS_COMPLETION_INVALID');expect(a.rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects a claim that selects another URL before any fetch or mutation', async () => {
    const a = setup();await expect(executeRtnNewsCheck(a.client, { ...claim, source_url: 'https://attacker.test' } as unknown as RtnNewsClaim, a.scope)).rejects.toThrow('RTN_NEWS_CLAIM_INVALID');
    expect(a.fetcher).not.toHaveBeenCalled();expect(a.rpc).not.toHaveBeenCalled();
    expect(readRtnNewsClaim(null)).toBeNull();
  });
  it('does not forward secret-bearing native exceptions into the completion', async () => {
    const a = setup();a.fetcher.mockRejectedValue(new Error('Authorization: Bearer synthetic-private-do-not-copy'));
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(a.rpc.mock.calls[0][1]!.p_result).toEqual({ status: 'error', error_code: 'RTN_NEWS_FETCH_FAILED' });
    expect(safeRtnNewsError(new Error('private message'))).toBe('RTN_NEWS_CHECK_FAILED');
  });
  it('retains an empty but valid RSS capture without inventing an event', async () => {
    const a = setup(() => xml(rss.replace(/<item>[\s\S]*?<\/item>/, '')));
    await executeRtnNewsCheck(a.client, claim, a.scope);
    expect(a.upload).toHaveBeenCalledTimes(1);expect(a.rpc.mock.calls[0][1]!.p_result).toMatchObject({ status: 'success', items: [] });
  });
  it('cancels a stalled raw stream through the approved TLS scope deadline', async () => {
    vi.useFakeTimers();const a = setup();const close = vi.fn(), cancel = vi.fn();
    let started!: () => void;const fetchStarted = new Promise<void>(resolve => { started = resolve; });
    const scope = createWithRtnNewsFetch({ now: () => Date.parse('2026-11-20T10:00:00Z'), createHttpClient: () => ({ close }),
      fetcher: async () => { started();return xml(new ReadableStream({ pull: () => new Promise(() => {}), cancel })); } });
    const pending = executeRtnNewsCheck(a.client, claim, scope);
    await fetchStarted;await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(20_001);await pending;
    expect(a.upload).not.toHaveBeenCalled();expect(close).toHaveBeenCalledTimes(1);expect(cancel).toHaveBeenCalled();
    expect(a.rpc.mock.calls[0][1]!.p_result).toMatchObject({ status: 'error', error_code: expect.stringMatching(/^RTN_NEWS_/) });
  });
});
