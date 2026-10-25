import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { describeNovofonError, hasCallApiCredentials, hasClassicApiCredentials, novofonClassicRequest, novofonDataRpc, novofonRpc } from '../../../functions/_shared/novofon.ts';

const PRIVATE = 'RAW_PROVIDER_PRIVATE_SENTINEL';
const KEY = 'CLASSIC_SYNTHETIC_KEY';
const SECRET = 'CLASSIC_SYNTHETIC_SECRET';
const FIXED_ERROR = 'Novofon Classic API request failed';
const PATH = '/v1/request/callback/';
let settings: Map<string, string>;
let network: ReturnType<typeof vi.fn>;
let log: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
let errorLog: ReturnType<typeof vi.spyOn>;
function signed(path: string, params: string, secret = SECRET): string {
  const md5 = createHash('md5').update(params).digest('hex');
  return Buffer.from(createHmac('sha1', secret).update(path + params + md5).digest('hex')).toString('base64');
}
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function primaryOnly(expectedCalls: number): void {
  expect(network).toHaveBeenCalledTimes(expectedCalls);
  for (const [url, init] of network.mock.calls) {
    expect(new URL(String(url)).origin).toBe('https://api.novofon.com');
    expect(init.redirect).toBe('error');
    expect(String(url)).not.toContain('zadarma');
  }
}
async function closed(call: () => Promise<unknown>): Promise<void> {
  let thrown: unknown;
  try { await call(); } catch (error) { thrown = error; }
  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toBe(FIXED_ERROR);
  expect(describeNovofonError(thrown)).toBe(FIXED_ERROR);
  const own = Object.fromEntries(Object.getOwnPropertyNames(thrown).map(name => [name, (thrown as Record<string, unknown>)[name]]));
  const exposed = JSON.stringify(own);
  for (const sentinel of [PRIVATE, KEY, SECRET, 'CLASSIC_SECOND_KEY', 'CLASSIC_SECOND_SECRET']) expect(exposed).not.toContain(sentinel);
  expect(log).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  expect(errorLog).not.toHaveBeenCalled();
}
beforeEach(() => {
  settings = new Map([['NOVOFON_CLASSIC_API_KEY', KEY], ['NOVOFON_CLASSIC_API_SECRET', SECRET]]);
  vi.stubGlobal('Deno', { env: { get: (key: string) => settings.get(key) } });
  network = vi.fn();
  vi.stubGlobal('fetch', network);
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('Novofon Classic explicit recipient boundary', () => {
  it('NC01 primary GET preserves canonical parameters signature and success data', async () => {
    const payload = { status: 'success', time: 12345, from: '70000000001', custom: { retained: true } };
    network.mockResolvedValue(response(payload));
    expect(await novofonClassicRequest('GET', PATH, { to: '70000000002', from: '70000000001', ignored: undefined })).toEqual(payload);
    primaryOnly(1);
    const [url, init] = network.mock.calls[0];
    const params = 'format=json&from=70000000001&to=70000000002';
    expect(url).toBe('https://api.novofon.com' + PATH + '?' + params);
    expect(init).toEqual({ method: 'GET', redirect: 'error', headers: { Authorization: KEY + ':' + signed(PATH, params), Accept: 'application/json' }, body: undefined });
  });
  it('NC02 primary POST preserves form body signing and exact content type', async () => {
    network.mockResolvedValue(response({ status: 'success', preserved: 0 }));
    expect(await novofonClassicRequest('POST', '/v1/example/', { label: 'two words', count: 0, empty: '', absent: null })).toEqual({ status: 'success', preserved: 0 });
    primaryOnly(1);
    const [url, init] = network.mock.calls[0];
    const params = 'count=0&format=json&label=two+words';
    expect(url).toBe('https://api.novofon.com/v1/example/');
    expect(init.body).toBe(params);
    expect(init.headers).toEqual({ Authorization: KEY + ':' + signed('/v1/example/', params), Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' });
  });
  it('NC03 HTTP401 cannot replay credentials or parameters to a second vendor', async () => {
    network.mockResolvedValue(response({ status: 'error', message: PRIVATE }, 401));
    await closed(() => novofonClassicRequest('GET', PATH, { from: '70000000001', to: '70000000002' }));
    primaryOnly(1);
  });
  it('NC04 HTTP404 cannot replay credentials or parameters to a second vendor', async () => {
    network.mockResolvedValue(response({ status: 'error', message: PRIVATE }, 404));
    await closed(() => novofonClassicRequest('GET', PATH, { to: '70000000002' }));
    primaryOnly(1);
  });
  it('NC05 HTTP501 cannot replay credentials or parameters to a second vendor', async () => {
    network.mockResolvedValue(response({ status: 'error', message: PRIVATE }, 501));
    await closed(() => novofonClassicRequest('POST', PATH, { to: '70000000002' }));
    primaryOnly(1);
  });
  it('NC06 provider auth and unsupported-method messages never select a second vendor', async () => {
    for (const message of ['not_authorized', 'unauthorized', 'method not implemented']) {
      network.mockReset();
      network.mockResolvedValue(response({ status: 'error', message: message + PRIVATE }));
      await closed(() => novofonClassicRequest('GET', PATH, { to: '70000000002' }));
      primaryOnly(1);
    }
  });
  it('NC07 same-host credential retry order still permits the second configured key', async () => {
    settings.set('NOVOFON_API_KEY', 'CLASSIC_SECOND_KEY'); settings.set('NOVOFON_API_SECRET', 'CLASSIC_SECOND_SECRET');
    network.mockResolvedValueOnce(response({ status: 'error', message: 'unauthorized' }, 401)).mockResolvedValueOnce(response({ status: 'success', time: 5678 }));
    expect(await novofonClassicRequest('GET', PATH, { to: '70000000002' })).toEqual({ status: 'success', time: 5678 });
    primaryOnly(2);
    const params = 'format=json&to=70000000002';
    expect(network.mock.calls[0][1].headers.Authorization).toBe(KEY + ':' + signed(PATH, params));
    expect(network.mock.calls[1][1].headers.Authorization).toBe('CLASSIC_SECOND_KEY:' + signed(PATH, params, 'CLASSIC_SECOND_SECRET'));
    expect(network.mock.calls[0][0]).toBe(network.mock.calls[1][0]);
  });
  it('NC08 nonrecoverable provider body never escapes as an error or console output', async () => {
    settings.set('NOVOFON_API_KEY', 'CLASSIC_SECOND_KEY'); settings.set('NOVOFON_API_SECRET', 'CLASSIC_SECOND_SECRET');
    network.mockResolvedValue(new Response(PRIVATE + KEY + SECRET, { status: 500 }));
    await closed(() => novofonClassicRequest('POST', PATH, { to: '70000000002' }));
    primaryOnly(1);
  });
  it('NC09 rejected transport closes its raw exception without another request', async () => {
    network.mockRejectedValue(new Error(PRIVATE + KEY + SECRET));
    await closed(() => novofonClassicRequest('GET', PATH, { to: '70000000002' }));
    primaryOnly(1);
  });
  it('NC10 rejected response-body read closes its raw exception without another request', async () => {
    const upstream = response({ status: 'success' });
    vi.spyOn(upstream, 'text').mockRejectedValue(new Error(PRIVATE + KEY + SECRET));
    network.mockResolvedValue(upstream);
    await closed(() => novofonClassicRequest('GET', PATH, { to: '70000000002' }));
    primaryOnly(1);
  });
  it('NC11 redirects are refused before a second-origin request can be attempted', async () => {
    network.mockImplementation(async (_url, init) => { expect(new Request('https://api.novofon.com' + PATH, init).redirect).toBe('error'); throw new TypeError('redirect refused ' + PRIVATE); });
    await closed(() => novofonClassicRequest('GET', PATH, { to: '70000000002' }));
    primaryOnly(1);
    network.mockReset(); network.mockResolvedValue(new Response(PRIVATE, { status: 302, headers: { Location: 'https://api.zadarma.com' + PATH } }));
    await closed(() => novofonClassicRequest('GET', PATH, { to: '70000000002' }));
    primaryOnly(1);
  });
  it('NC12 absent configuration cannot send a request or expose environment data', async () => {
    settings.clear();
    expect(hasClassicApiCredentials()).toBe(false);
    await closed(() => novofonClassicRequest('GET', PATH, { to: '70000000002' }));
    expect(network).not.toHaveBeenCalled();
  });
  it('NC13 CallAPI and DataAPI selections and request payloads remain unchanged', async () => {
    settings.clear(); settings.set('NOVOFON_CALL_ACCESS_TOKEN', 'SYNTHETIC_CALL_TOKEN'); settings.set('NOVOFON_DATA_ACCESS_TOKEN', 'SYNTHETIC_DATA_TOKEN');
    expect(hasClassicApiCredentials()).toBe(false); expect(hasCallApiCredentials()).toBe(true);
    network.mockResolvedValueOnce(response({ jsonrpc: '2.0', result: { data: { call_session_id: 6789 } } })).mockResolvedValueOnce(response({ jsonrpc: '2.0', result: { data: [{ id: 12 }] } }));
    expect(await novofonRpc('start.simple_call', { contact: '70000000002' })).toEqual({ call_session_id: 6789 });
    expect(await novofonDataRpc('get.employees', { limit: 1 })).toEqual([{ id: 12 }]);
    expect(network).toHaveBeenCalledTimes(2);
    expect(network.mock.calls[0][0]).toBe('https://callapi-jsonrpc.novofon.ru/v4.0');
    expect(network.mock.calls[1][0]).toBe('https://dataapi-jsonrpc.novofon.ru/v2.0');
    expect(JSON.parse(network.mock.calls[0][1].body)).toEqual({ jsonrpc: '2.0', id: expect.any(String), method: 'start.simple_call', params: { access_token: 'SYNTHETIC_CALL_TOKEN', contact: '70000000002' } });
    expect(JSON.parse(network.mock.calls[1][1].body)).toEqual({ jsonrpc: '2.0', id: expect.any(String), method: 'get.employees', params: { access_token: 'SYNTHETIC_DATA_TOKEN', limit: 1 } });
    expect(network.mock.calls[0][1].redirect).toBeUndefined(); expect(network.mock.calls[1][1].redirect).toBeUndefined();
  });
  it('NC14 constructed path cannot replace the fixed recipient origin before signing or fetch', async () => {
    for (const path of ['@api.zadarma.com/v1/request/callback/', ':443@api.zadarma.com/v1/request/callback/', '@example.invalid/v1/']) {
      await closed(() => novofonClassicRequest('GET', path, { to: '70000000002' }));
      expect(network).not.toHaveBeenCalled();
    }
  });
});
