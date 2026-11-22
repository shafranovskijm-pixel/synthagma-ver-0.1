// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSourceUploadPrivateFetch } from './source-upload-private-fetch';

describe('manual intake private SDK transport', () => {
  it('preserves the supported SDK body/auth/options on its exact configured origin', async () => {
    const response = new Response('private fixture'), fetcher = vi.fn(async () => response);
    const outer = new AbortController(), native = new AbortController();
    const fetch = createSourceUploadPrivateFetch(fetcher as typeof globalThis.fetch, 'https://private.fixture.invalid', 50_000, outer.signal, () => 10_000);
    const body = new Uint8Array([1,2,3]), headers = new Headers({ authorization: 'Bearer PRIVATE_SDK_TOKEN', apikey: 'PRIVATE_KEY' });
    expect(await fetch('https://private.fixture.invalid/storage/v1/object/rtn-sources/exact', { method: 'POST', body, headers, signal: native.signal })).toBe(response);
    expect(fetcher).toHaveBeenCalledWith('https://private.fixture.invalid/storage/v1/object/rtn-sources/exact', expect.objectContaining({ method: 'POST', body, headers }));
    const signal = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
    outer.abort(); expect(signal.aborted).toBe(true);
  });
  it('refuses caller official or foreign destinations before any private fetch', async () => {
    const fetcher = vi.fn(), outer = new AbortController();
    const fetch = createSourceUploadPrivateFetch(fetcher, 'https://private.fixture.invalid', 50_000, outer.signal, () => 10_000);
    await expect(fetch('https://www.gosnadzor.ru/service/list/Safety%20certification/')).rejects.toThrow('RTN_UPLOAD_PRIVATE_ORIGIN');
    await expect(fetch('https://evil.invalid/storage/v1/object')).rejects.toThrow('RTN_UPLOAD_PRIVATE_ORIGIN');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('refuses an expired request before dispatch and captures mutable URL values once', async () => {
    const fetcher = vi.fn(async () => new Response('ok')), outer = new AbortController();
    const closed = createSourceUploadPrivateFetch(fetcher as typeof globalThis.fetch, 'https://private.fixture.invalid', 10_000, outer.signal, () => 10_000);
    await expect(closed('https://private.fixture.invalid/rest/v1/rpc/finalize')).rejects.toThrow('RTN_UPLOAD_DEADLINE'); expect(fetcher).not.toHaveBeenCalled();
    const open = createSourceUploadPrivateFetch(fetcher as typeof globalThis.fetch, 'https://private.fixture.invalid', 50_000, outer.signal, () => 10_000);
    const url = new URL('https://private.fixture.invalid/auth/v1/user'); const pending = open(url); url.hostname = 'evil.invalid'; await pending;
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe('https://private.fixture.invalid/auth/v1/user');
  });
});
