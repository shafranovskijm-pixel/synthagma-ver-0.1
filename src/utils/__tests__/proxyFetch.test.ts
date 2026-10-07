import { afterEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { getProxyStatus, proxiedAssetUrl } from '../proxyFetch';

afterEach(() => vi.restoreAllMocks());
describe('packaged Android transport', () => {
  it('uses the production proxy on native localhost', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    expect(getProxyStatus()).toMatchObject({ enabled: true, forced: true });
    const host = getProxyStatus().supabaseHost;
    expect(proxiedAssetUrl(`https://${host}/storage/v1/object/public/courses/lesson.pdf`))
      .toBe('https://api.xn--80aaiswd0ak.xn--p1ai/sb-storage/object/public/courses/lesson.pdf');
  });
  it('keeps the proxy disabled for ordinary development localhost', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    expect(getProxyStatus()).toMatchObject({ enabled: false, forced: false });
  });
});
