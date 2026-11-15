// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createWithOfficialFetch, verifyOfficialTlsBundle } from './official-http-client';
import { INTERMEDIATE, ROOT } from './official-tls-bundle';
import { fetchOfficial } from './official-source';

const page = 'https://www.gosnadzor.ru/service/list/Safety%20certification/lab/index.php';
const validNow = Date.parse('2026-11-15T01:00:00Z');
const init = () => ({ redirect: 'manual' as const, headers: { Accept: 'text/html' } });
function setup(now: () => number = () => validNow) {
  const close = vi.fn();
  const createHttpClient = vi.fn(() => ({ close }));
  const fetcher = vi.fn(async (_input: string, _init: RequestInit) => new Response('public official document'));
  const scope = createWithOfficialFetch({ createHttpClient, fetcher, now });
  return { close, createHttpClient, fetcher, scope };
}

describe('reviewed certificate byte and UTC boundary', () => {
  it('accepts the exact public certificates and independent reviewed windows', async () => {
    expect(INTERMEDIATE.derSha256).toBe('d2ac9dcc7a255029a5f5180d63f1a9ed60e11412a85c148d4b71f6ae1a36695c');
    expect(ROOT.derSha256).toBe('4fa3126d8d3a11d1c4855a4f807cbad6cf919d3a5a88b03bea2c6372d93c40c9');
    expect([INTERMEDIATE.notBefore, INTERMEDIATE.notAfter, ROOT.notBefore, ROOT.notAfter]).toEqual([
      '2025-09-17T02:55:30Z', '2029-06-23T00:00:00Z', '2019-03-20T00:00:00Z', '2046-03-20T00:00:00Z',
    ]);
    await expect(verifyOfficialTlsBundle(() => validNow)).resolves.toBeUndefined();
    expect(Object.isFrozen(INTERMEDIATE) && Object.isFrozen(ROOT)).toBe(true);
  });
  it.each(['intermediate', 'root'] as const)('rejects changed %s DER bytes before trusting any date metadata', async which => {
    const pems = { intermediate: INTERMEDIATE.pem, root: ROOT.pem };
    // A syntactically valid base64/DER-byte mutation, not only a broken PEM.
    pems[which] = pems[which].replace('MIIF', 'NIIF');
    const clock = vi.fn(() => validNow);
    await expect(verifyOfficialTlsBundle(clock, pems)).rejects.toThrow('RTN_TLS_CERTIFICATE_PIN_MISMATCH');
    expect(clock).not.toHaveBeenCalled();
  });
  it.each(['', 'x'.repeat(8193), '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----',
    `${INTERMEDIATE.pem}\n${ROOT.pem}`, INTERMEDIATE.pem.replace('MIIF', '$IIF')])('rejects malformed/bounded PEM %s', async pem => {
    await expect(verifyOfficialTlsBundle(() => validNow, { intermediate: pem, root: ROOT.pem })).rejects.toThrow('RTN_TLS_CERTIFICATE_INVALID');
  });
  it.each([NaN, Infinity, -Infinity, 9e20, '2026' as never, null as never])('fails closed for invalid clock %s before client/network', async now => {
    const a = setup(() => now);
    await expect(a.scope(fetcher => fetcher(page, init()))).rejects.toThrow('RTN_TLS_CLOCK_INVALID');
    expect(a.createHttpClient).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('fails closed when the clock throws', async () => {
    const a = setup(() => { throw new Error('private implementation exception'); });
    await expect(a.scope(fetcher => fetcher(page, init()))).rejects.toThrow('RTN_TLS_CLOCK_INVALID');
    expect(a.createHttpClient).not.toHaveBeenCalled();
  });
  it.each([Date.parse(ROOT.notBefore) - 1, Date.parse(ROOT.notAfter), Date.parse(INTERMEDIATE.notBefore) - 1,
    Date.parse(INTERMEDIATE.notAfter)])('rejects pin-bound validity boundary %s before client/network', async time => {
    const a = setup(() => time);
    await expect(a.scope(fetcher => fetcher(page, init()))).rejects.toThrow('RTN_TLS_CERTIFICATE_OUTSIDE_VALIDITY');
    expect(a.createHttpClient).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('permits the ICA notBefore instant and the last millisecond before exclusive expiry', async () => {
    await verifyOfficialTlsBundle(() => Date.parse(INTERMEDIATE.notBefore));
    await verifyOfficialTlsBundle(() => Date.parse(INTERMEDIATE.notAfter) - 1);
  });
  it('checks validity again on every request and closes an already allocated client at expiry', async () => {
    let time = validNow; const a = setup(() => time);
    await expect(a.scope(async fetcher => {
      await fetcher(page, init()); time = Date.parse(INTERMEDIATE.notAfter); await fetcher(page, init());
    })).rejects.toThrow('RTN_TLS_CERTIFICATE_OUTSIDE_VALIDITY');
    expect(a.fetcher).toHaveBeenCalledTimes(1); expect(a.createHttpClient).toHaveBeenCalledTimes(1); expect(a.close).toHaveBeenCalledTimes(1);
  });
});

describe('scoped public official client', () => {
  it.each(['https://foreign.test/service/list/Safety%20certification/', 'http://www.gosnadzor.ru/service/list/Safety%20certification/',
    'https://www.gosnadzor.ru:444/service/list/Safety%20certification/', 'https://user:secret@www.gosnadzor.ru/service/list/Safety%20certification/',
    `${page}?token=secret`, `${page}#secret`, 'https://www.gosnadzor.ru/other/',
    'https://www.gosnadzor.ru.foreign.test/service/list/Safety%20certification/',
    page.replace('www.gosnadzor.ru', 'gosnadzor.ru')])('rejects unsupported URL before any client/network: %s', async input => {
    const a = setup(); await expect(a.scope(fetcher => fetcher(input, init()))).rejects.toThrow();
    expect(a.createHttpClient).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
  });
  it.each([{ method: 'POST' }, { body: 'secret' }, { redirect: 'follow' }, { credentials: 'include' },
    { headers: { Authorization: 'Bearer never-forward' } }, { headers: { apikey: 'never-forward' } },
    { headers: { cookie: 'never-forward' } }, { client: {} }, { proxy: {} }])('rejects credential/transport/body override %s', async override => {
    const a = setup(); await expect(a.scope(fetcher => fetcher(page, { ...init(), ...override } as RequestInit))).rejects.toThrow('RTN_TLS_REQUEST_UNSUPPORTED');
    expect(a.createHttpClient).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('uses only the reviewed ICA in client options and preserves manual redirects/public Accept/signal', async () => {
    const a = setup(), abort = new AbortController();
    await a.scope(fetcher => fetcher(page, { ...init(), signal: abort.signal }));
    expect(a.createHttpClient.mock.calls).toEqual([[{ caCerts: [INTERMEDIATE.pem] }]]);
    const [url, options] = a.fetcher.mock.calls[0];
    expect(url).toBe(page); expect(options).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit', signal: abort.signal });
    expect(Object.keys(options).sort()).toEqual(['client', 'credentials', 'headers', 'method', 'redirect', 'signal']);
    expect([...new Headers(options.headers)]).toEqual([['accept', 'text/html']]);
    expect(JSON.stringify(a.createHttpClient.mock.calls)).not.toContain(ROOT.pem);
    expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('captures a mutable URL and headers before asynchronous hash checks', async () => {
    const a = setup(), url = new URL(page), headers = new Headers({ Accept: 'text/html' });
    await a.scope(async fetcher => {
      const result = fetcher(url, { redirect: 'manual', headers });
      url.hostname = 'foreign.test'; headers.set('Authorization', 'never-forward'); await result;
    });
    expect(a.fetcher.mock.calls[0][0]).toBe(page);
    expect(new Headers(a.fetcher.mock.calls[0][1].headers).has('authorization')).toBe(false);
  });
  it('allocates lazily, reuses one client per check and isolates simultaneous checks', async () => {
    const clients: { close: ReturnType<typeof vi.fn> }[] = [];
    const createHttpClient = vi.fn(() => { const client = { close: vi.fn() }; clients.push(client); return client; });
    const fetcher = vi.fn(async (_input: string, _options: RequestInit) => new Response('public'));
    const scope = createWithOfficialFetch({ createHttpClient, fetcher, now: () => validNow });
    await scope(async () => undefined); expect(createHttpClient).not.toHaveBeenCalled();
    await Promise.all([scope(async fetcher => { await Promise.all([fetcher(page, init()), fetcher(page, init())]); }), scope(fetcher => fetcher(page, init()))]);
    expect(clients).toHaveLength(2); expect(clients.every(client => client.close.mock.calls.length === 1)).toBe(true);
    const used = fetcher.mock.calls.map(call => (call[1] as RequestInit & { client: unknown }).client);
    expect(new Set(used).size).toBe(2);
  });
  it('keeps the client alive through full body consumption and the callback completion', async () => {
    const a = setup(), events: string[] = [];
    a.fetcher.mockImplementation(async () => new Response(new ReadableStream({ pull(controller) {
      expect(a.close).not.toHaveBeenCalled(); events.push('body'); controller.enqueue(new TextEncoder().encode('public')); controller.close();
    } })));
    await a.scope(async fetcher => {
      const response = await fetcher(page, init()); expect(await response.text()).toBe('public');
      events.push('completion'); expect(a.close).not.toHaveBeenCalled();
    });
    expect(events).toEqual(['body', 'completion']); expect(a.close).toHaveBeenCalledTimes(1);
  });
  it.each(['fetch', 'body', 'completion'])('closes exactly once on %s failure without retry/fallback', async stage => {
    const a = setup();
    a.fetcher.mockImplementation(async () => {
      if (stage === 'fetch') throw new TypeError('certificate verify failed');
      if (stage === 'body') return new Response(new ReadableStream({ pull(controller) { controller.error(new Error('body')); } }));
      return new Response('public');
    });
    await expect(a.scope(async fetcher => {
      await (await fetcher(page, init())).text(); if (stage === 'completion') throw new Error('DB completion lost');
    })).rejects.toThrow();
    expect(a.fetcher).toHaveBeenCalledTimes(1); expect(a.createHttpClient).toHaveBeenCalledTimes(1); expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('a close exception never replaces the actual result or lost-completion exception', async () => {
    const a = setup(); a.close.mockImplementation(() => { throw new Error('close'); });
    await expect(a.scope(async fetcher => { await fetcher(page, init()); return 'committed'; })).resolves.toBe('committed');
    await expect(a.scope(async fetcher => { await fetcher(page, init()); throw new Error('completion'); })).rejects.toThrow('completion');
    expect(a.close).toHaveBeenCalledTimes(2);
  });
  it('rejects unsupported client construction and never falls back to default/insecure fetch', async () => {
    const fetcher = vi.fn();
    for (const createHttpClient of [undefined, () => { throw new Error('runtime client unsupported'); }, () => null as never, () => ({}) as never]) {
      const scope = createWithOfficialFetch({ fetcher, createHttpClient, now: () => validNow });
      await expect(scope(f => f(page, init()))).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('maps an unavailable runtime client factory to a bounded error while retaining its private cause', async () => {
    const cause = new TypeError('private platform detail must not become the completion error');
    const fetcher = vi.fn(), scope = createWithOfficialFetch({ fetcher, now: () => validNow, createHttpClient: () => { throw cause; } });
    const error = await scope(f => f(page, init())).catch(error => error);
    expect(error.message).toBe('RTN_TLS_CLIENT_CREATION_FAILED'); expect(error.cause).toBe(cause);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects already aborted requests without allocation and preserves a later abort', async () => {
    const a = setup(), controller = new AbortController(); controller.abort();
    await expect(a.scope(fetcher => fetcher(page, { ...init(), signal: controller.signal }))).rejects.toThrow();
    expect(a.createHttpClient).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
    const b = setup(), later = new AbortController();
    await expect(b.scope(async fetcher => { const promise = fetcher(page, { ...init(), signal: later.signal }); later.abort(); return await promise; })).rejects.toThrow();
    expect(b.fetcher).not.toHaveBeenCalled();
  });
  it('blocks escaped requests after closing the action lifetime', async () => {
    const a = setup(); let escaped!: typeof fetch;
    await a.scope(async fetcher => { escaped = fetcher; await fetcher(page, init()); });
    await expect(escaped(page, init())).rejects.toThrow('RTN_TLS_SCOPE_CLOSED'); expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('retains the official fetcher redirect trust and body-size guards', async () => {
    const a = setup(); a.fetcher.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://foreign.test/secret' } }));
    await expect(a.scope(fetcher => fetchOfficial(page, 'page', fetcher))).rejects.toThrow('UNTRUSTED_OFFICIAL_URL');
    expect(a.fetcher).toHaveBeenCalledTimes(1); expect(a.close).toHaveBeenCalledTimes(1);
    const b = setup(); b.fetcher.mockResolvedValue(new Response('oversize', { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } }));
    await expect(b.scope(fetcher => fetchOfficial(page, 'page', fetcher))).rejects.toThrow('OFFICIAL_FILE_TOO_LARGE');
    expect(b.fetcher).toHaveBeenCalledTimes(1); expect(b.close).toHaveBeenCalledTimes(1);
  });
});
