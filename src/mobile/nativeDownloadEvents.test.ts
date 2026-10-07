import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: { enabled: false },
  save: vi.fn(async () => ({ saved: true })),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native.enabled },
  registerPlugin: () => ({ save: mocks.save }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { installNativeDownloads } from './nativeDownloads';

it('leaves browser clicks intact and reads detached native downloads before revocation without duplicating attached downloads', async () => {
  const originalClick = HTMLAnchorElement.prototype.click;
  const order: string[] = [];
  vi.stubGlobal('fetch', vi.fn(() => {
    order.push('fetch');
    return Promise.resolve({ ok: true, blob: async () => new Blob(['document']) });
  }));
  try {
    installNativeDownloads();
    expect(HTMLAnchorElement.prototype.click).toBe(originalClick);
    mocks.native.enabled = true;
    installNativeDownloads();
    const anchor = document.createElement('a');
    anchor.href = 'blob:https://localhost/lesson';
    anchor.download = 'Урок.pdf';
    anchor.click();
    order.push('revoke');
    expect(order).toEqual(['fetch', 'revoke']);
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    document.body.appendChild(anchor);
    anchor.click();
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    anchor.remove();
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    HTMLAnchorElement.prototype.click = originalClick;
    vi.unstubAllGlobals();
  }
});
