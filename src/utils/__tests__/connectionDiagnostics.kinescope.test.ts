import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runConnectionDiagnostics, summarizeDiagnostics } from '../connectionDiagnostics';
let images: Array<{ onload: (() => void) | null; onerror: (() => void) | null; src: string; removeAttribute: ReturnType<typeof vi.fn> }>;
beforeEach(() => {
  images = [];
  vi.stubGlobal('Image', class {
    onload = null; onerror = null; src = ''; removeAttribute = vi.fn();
    constructor() { images.push(this); }
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Kinescope connectivity evidence', () => {
  it('uses an image rather than a CORS fetch and does not claim to have tested playback', async () => {
    const pending = runConnectionDiagnostics();
    expect(images).toHaveLength(1); expect(images[0].src).toBe('https://kinescope.io/favicon.ico');
    images[0].onload!(); const results = await pending;
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('kinescope'))).toBe(false);
    expect(results.find(r => r.id === 'kinescope')).toMatchObject({ status: 'ok', detail: expect.stringContaining('Запуск видео проверяется отдельно') });
    expect(summarizeDiagnostics(results)).toMatchObject({ headline: 'Проверяемые серверы доступны', severity: 'ok' });
    expect(images[0].onload).toBeNull(); expect(images[0].onerror).toBeNull();
  });
  it('reports an unconfirmed resource, without diagnosing a firewall or silently returning success', async () => {
    const pending = runConnectionDiagnostics(); images[0].onerror!(); const results = await pending;
    expect(results.find(r => r.id === 'kinescope')).toMatchObject({ status: 'error' });
    expect(summarizeDiagnostics(results)).toMatchObject({ headline: 'Проверка соединения неполная', severity: 'warn' });
  });
  it('settles once on timeout and releases image handlers', async () => {
    vi.useFakeTimers(); const pending = runConnectionDiagnostics();
    await vi.advanceTimersByTimeAsync(7000); const results = await pending;
    expect(results.find(r => r.id === 'kinescope')).toMatchObject({ status: 'error', durationMs: 7000 });
    expect(images[0].onload).toBeNull(); expect(images[0].removeAttribute).toHaveBeenCalledWith('src');
  });
  it('keeps a confirmed backend outage above an incomplete media probe', () => {
    const summary = summarizeDiagnostics([
      { id: 'api', label: 'API', status: 'blocked', durationMs: 0 },
      { id: 'kinescope', label: 'Video', status: 'error', durationMs: 0 },
    ]);
    expect(summary.severity).toBe('error');
    expect(summary.headline).toBe('Сервер платформы недоступен');
    expect(summary.advice).toContain('Причина этой проверкой не установлена');
  });
});
