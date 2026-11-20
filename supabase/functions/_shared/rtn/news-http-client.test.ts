// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWithRtnNewsFetch, fetchRtnNewsRssWithTls } from './news-http-client';
import { INTERMEDIATE, ROOT } from './official-tls-bundle';
import { createWithOfficialFetch } from './official-http-client';
import { RTN_NEWS_BYTE_LIMIT, RTN_NEWS_RSS_URL, RTN_NEWS_TIMEOUT_MS } from './news-source';

const validNow = Date.parse('2026-11-20T10:00:00Z');
const init = () => ({ redirect: 'manual' as const, credentials: 'omit' as const, headers: { Accept: 'application/rss+xml' } });
const rss = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>RTN</title><link>https://www.gosnadzor.ru/news/</link><item><title>News</title><link>http://www.gosnadzor.ru/news/67/12345/</link><description>Short source text</description><pubDate>Fri, 20 Nov 2026 12:00:00 +0300</pubDate></item></channel></rss>';
const xml = (body: BodyInit | null = rss) => new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
function setup() {
  const close = vi.fn();
  const createHttpClient = vi.fn(() => ({ close }));
  const fetcher = vi.fn(async (_input: string, _init: RequestInit) => xml());
  const deps = { close, createHttpClient, fetcher, now: () => validNow };
  return { ...deps, scope: createWithRtnNewsFetch(deps) };
}
afterEach(() => vi.useRealTimers());

describe('separate fixed-news TLS authority', () => {
  it('composes the full RSS parser with only the reviewed ICA and ordinary native validation options', async () => {
    const a = setup();
    const feed = await fetchRtnNewsRssWithTls(a);
    expect(feed.items[0].canonical_url).toBe('https://www.gosnadzor.ru/news/67/12345/');
    expect(feed.coverage.complete_archive).toBe(false);
    expect(a.createHttpClient.mock.calls).toEqual([[{ caCerts: [INTERMEDIATE.pem] }]]);
    expect(JSON.stringify(a.createHttpClient.mock.calls)).not.toContain(ROOT.pem);
    const [url, options] = a.fetcher.mock.calls[0];
    expect(url).toBe(RTN_NEWS_RSS_URL);
    expect(Object.keys(options).sort()).toEqual(['client', 'credentials', 'headers', 'method', 'redirect', 'signal']);
    expect(options).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit', signal: expect.any(AbortSignal) });
    expect([...new Headers(options.headers).keys()]).toEqual(['accept']);
    expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('accepts only exact HTTPS feed aliases and canonical restricted article identities', async () => {
    const a = setup();
    await a.scope(async fetcher => {
      for (const url of [RTN_NEWS_RSS_URL, 'https://gosnadzor.ru/news/rss/', 'https://gosnadzor.ru/news/67/12345/']) {
        await (await fetcher(url, init())).text();
      }
    });
    expect(a.fetcher.mock.calls.map(call => call[0])).toEqual([RTN_NEWS_RSS_URL, 'https://gosnadzor.ru/news/rss/', 'https://www.gosnadzor.ru/news/67/12345/']);
    expect(a.createHttpClient).toHaveBeenCalledTimes(1); expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('rejects HTTP identities, private/foreign hosts, bank paths, encoded/dot paths and credential/port/query/hash tricks before native access', async () => {
    for (const input of [
      'http://www.gosnadzor.ru/news/67/12345/', 'http://www.gosnadzor.ru/news/rss/',
      'https://169.254.169.254/news/rss/', 'https://127.0.0.1/news/rss/',
      'https://www.gosnadzor.ru.foreign.test/news/rss/', 'https://foreign.test/news/67/12345/',
      'https://www.gosnadzor.ru/energy/energy/', 'https://www.gosnadzor.ru/service/list/Safety%20certification/',
      'https://www.gosnadzor.ru/admin/../news/rss/', 'https://www.gosnadzor.ru/news/%36%37/12345/',
      'https://www.gosnadzor.ru:443/news/rss/', 'https://u:p@www.gosnadzor.ru/news/rss/',
      `${RTN_NEWS_RSS_URL}?token=secret`, `${RTN_NEWS_RSS_URL}#part`, `${RTN_NEWS_RSS_URL}\n`,
      'https://www.gosnadzor.ru\\news\\rss\\',
    ]) {
      const a = setup(); await expect(a.scope(fetcher => fetcher(input, init()))).rejects.toThrow();
      expect(a.createHttpClient).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
    }
    const a = setup(); await expect(a.scope(fetcher => fetcher(new Request(RTN_NEWS_RSS_URL), init()))).rejects.toThrow('URL_UNSUPPORTED');
    expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('does not widen the old bank transport to admit RSS', async () => {
    const a = setup(), oldScope = createWithOfficialFetch(a);
    await expect(oldScope(fetcher => fetcher(RTN_NEWS_RSS_URL, init()))).rejects.toThrow('UNTRUSTED_OFFICIAL_PATH');
    expect(a.createHttpClient).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('refuses authentication, custom clients, alternate transports and unsafe request options before allocation', async () => {
    for (const override of [
      { method: 'POST' }, { body: 'private' }, { redirect: 'follow' }, { credentials: 'include' },
      { headers: { authorization: 'Bearer private' } }, { headers: { cookie: 'private' } },
      { headers: { apikey: 'private' } }, { client: {} }, { proxy: {} },
    ]) {
      const a = setup();
      await expect(a.scope(fetcher => fetcher(RTN_NEWS_RSS_URL, { ...init(), ...override } as RequestInit))).rejects.toThrow('REQUEST_UNSUPPORTED');
      expect(a.createHttpClient).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
    }
  });
  it('captures URL and Accept headers before asynchronous certificate validation', async () => {
    const a = setup(), url = new URL(RTN_NEWS_RSS_URL), headers = new Headers({ Accept: 'application/rss+xml' });
    await a.scope(async fetcher => {
      const pending = fetcher(url, { ...init(), headers });
      url.hostname = 'foreign.test'; headers.set('Authorization', 'private');
      await (await pending).text();
    });
    expect(a.fetcher.mock.calls[0][0]).toBe(RTN_NEWS_RSS_URL);
    expect([...new Headers(a.fetcher.mock.calls[0][1].headers)]).toEqual([['accept', 'application/rss+xml']]);
  });
  it('reuses exported pin and clock validation and never falls back when native client creation fails', async () => {
    const a = setup();
    await expect(fetchRtnNewsRssWithTls({ ...a, now: () => Date.parse(INTERMEDIATE.notAfter) })).rejects.toThrow('RTN_NEWS_FETCH_FAILED');
    expect(a.createHttpClient).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
    for (const createHttpClient of [undefined, () => { throw new Error('private'); }, () => null as never, () => ({}) as never]) {
      await expect(fetchRtnNewsRssWithTls({ ...a, createHttpClient })).rejects.toThrow('RTN_NEWS_TLS_CLIENT_');
    }
    expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('keeps lazy clients isolated by check, alive through parsing/callback, and closes only once', async () => {
    const a = setup(); await a.scope(async () => undefined);
    expect(a.createHttpClient).not.toHaveBeenCalled();
    await a.scope(async fetcher => {
      const response = await fetcher(RTN_NEWS_RSS_URL, init());
      expect(a.close).not.toHaveBeenCalled(); expect(await response.text()).toBe(rss);
      expect(a.close).not.toHaveBeenCalled();
    });
    await fetchRtnNewsRssWithTls(a);
    expect(a.createHttpClient).toHaveBeenCalledTimes(2); expect(a.close).toHaveBeenCalledTimes(2);
  });
  it('invalidates escaped fetchers and cancels bodies left unread at scope completion', async () => {
    const a = setup(), cancel = vi.fn(); let escaped!: typeof fetch;
    a.fetcher.mockImplementation(async () => xml(new ReadableStream({ cancel })));
    await a.scope(async fetcher => { escaped = fetcher; await fetcher(RTN_NEWS_RSS_URL, init()); });
    await expect(escaped(RTN_NEWS_RSS_URL, init())).rejects.toThrow('SCOPE_CLOSED');
    expect(cancel).toHaveBeenCalledTimes(1); expect(a.fetcher).toHaveBeenCalledTimes(1); expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('preserves callback outcomes even when native close throws', async () => {
    const a = setup(); a.close.mockImplementation(() => { throw new Error('private close'); });
    await expect(fetchRtnNewsRssWithTls(a)).resolves.toMatchObject({ raw_item_count: 1 });
    await expect(a.scope(async fetcher => { await (await fetcher(RTN_NEWS_RSS_URL, init())).text(); throw new Error('completion lost'); })).rejects.toThrow('completion lost');
    expect(a.close).toHaveBeenCalledTimes(2);
  });
});

describe('RSS composed transport bounds and total deadline', () => {
  it('follows an accepted feed alias using the same client and refuses an article redirect without fetching it', async () => {
    const a = setup();
    a.fetcher.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://gosnadzor.ru/news/rss/' } }));
    await expect(fetchRtnNewsRssWithTls(a)).resolves.toMatchObject({ resolved_feed_url: 'https://gosnadzor.ru/news/rss/' });
    expect(a.fetcher).toHaveBeenCalledTimes(2); expect(a.createHttpClient).toHaveBeenCalledTimes(1); expect(a.close).toHaveBeenCalledTimes(1);
    const b = setup();
    b.fetcher.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://www.gosnadzor.ru/news/67/12345/' } }));
    await expect(fetchRtnNewsRssWithTls(b)).rejects.toThrow('UNTRUSTED_PATH');
    expect(b.fetcher).toHaveBeenCalledTimes(1); expect(b.close).toHaveBeenCalledTimes(1);
  });
  it('keeps RSS byte limits after wrapping the native response and cancels oversized streams', async () => {
    const a = setup(), cancel = vi.fn();
    a.fetcher.mockImplementation(async () => xml(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(RTN_NEWS_BYTE_LIMIT + 1)); }, cancel })));
    await expect(fetchRtnNewsRssWithTls(a)).rejects.toThrow('BODY_SIZE_INVALID');
    expect(cancel).toHaveBeenCalledTimes(1); expect(a.fetcher).toHaveBeenCalledTimes(1); expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('maps a body read error to a bounded source failure and closes without retry', async () => {
    const a = setup();
    a.fetcher.mockImplementation(async () => xml(new ReadableStream({ pull(controller) { controller.error(new Error('private token=secret')); } })));
    await expect(fetchRtnNewsRssWithTls(a)).rejects.toThrow(/^RTN_NEWS_FETCH_FAILED$/);
    expect(a.fetcher).toHaveBeenCalledTimes(1); expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('terminates a stalled body even if its synthetic source ignores the abort signal and cancel never settles', async () => {
    vi.useFakeTimers(); const a = setup(), cancel = vi.fn(() => new Promise<void>(() => undefined));
    a.fetcher.mockImplementation(async () => xml(new ReadableStream({ pull() { return new Promise<void>(() => undefined); }, cancel })));
    const pending = expect(fetchRtnNewsRssWithTls(a)).rejects.toThrow('RTN_NEWS_FETCH_TIMEOUT');
    await vi.waitFor(() => expect(a.fetcher).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(RTN_NEWS_TIMEOUT_MS);
    await pending;
    expect(cancel).toHaveBeenCalledTimes(1); expect(a.close).toHaveBeenCalledTimes(1); expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds headers too when the native fetch ignores cancellation and discards a late response', async () => {
    vi.useFakeTimers(); const a = setup(), cancel = vi.fn(); let deliver!: (value: Response) => void;
    a.fetcher.mockImplementation(() => new Promise<Response>(resolve => { deliver = resolve; }));
    const pending = expect(fetchRtnNewsRssWithTls(a)).rejects.toThrow('RTN_NEWS_FETCH_TIMEOUT');
    await vi.waitFor(() => expect(a.fetcher).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(RTN_NEWS_TIMEOUT_MS); await pending;
    deliver(xml(new ReadableStream({ cancel }))); await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1); expect(a.close).toHaveBeenCalledTimes(1); expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('applies one RSS deadline across a delayed redirect and the second response body rather than resetting20seconds', async () => {
    vi.useFakeTimers(); const a = setup(), cancel = vi.fn();
    a.fetcher.mockImplementationOnce(() => new Promise(resolve => { setTimeout(() => resolve(new Response(null, { status: 302, headers: { location: '/news/rss/' } })), 12_000); }));
    a.fetcher.mockImplementationOnce(async () => xml(new ReadableStream({ pull() { return new Promise<void>(() => undefined); }, cancel })));
    const pending = expect(fetchRtnNewsRssWithTls(a)).rejects.toThrow('RTN_NEWS_FETCH_TIMEOUT');
    await vi.waitFor(() => expect(a.fetcher).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(12_000);
    await vi.waitFor(() => expect(a.fetcher).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(8_000); await pending;
    expect(a.fetcher).toHaveBeenCalledTimes(2); expect(cancel).toHaveBeenCalledTimes(1); expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('does not hang on redirect-body cancellation even when the source cancellation promise never settles', async () => {
    const a = setup(), cancel = vi.fn(() => new Promise<void>(() => undefined));
    a.fetcher.mockImplementationOnce(async () => new Response(new ReadableStream({ cancel }), { status: 302, headers: { location: '/news/rss/' } }));
    await expect(fetchRtnNewsRssWithTls(a)).resolves.toMatchObject({ raw_item_count: 1 });
    expect(cancel).toHaveBeenCalledTimes(1); expect(a.fetcher).toHaveBeenCalledTimes(2); expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('honors a caller abort before allocation and after body arrival', async () => {
    const a = setup(), before = new AbortController(); before.abort();
    await expect(a.scope(fetcher => fetcher(RTN_NEWS_RSS_URL, { ...init(), signal: before.signal }))).rejects.toThrow();
    expect(a.createHttpClient).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
    const b = setup(), later = new AbortController(), cancel = vi.fn();
    b.fetcher.mockImplementation(async () => xml(new ReadableStream({ cancel })));
    await b.scope(async fetcher => {
      const response = await fetcher(RTN_NEWS_RSS_URL, { ...init(), signal: later.signal });
      const pending = expect(response.text()).rejects.toThrow(); later.abort(); await pending;
    });
    expect(cancel).toHaveBeenCalledTimes(1); expect(b.close).toHaveBeenCalledTimes(1);
  });
});
