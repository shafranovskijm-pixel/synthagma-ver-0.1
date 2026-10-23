import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOfflineAuthActor, observeOfflineAccess } from '@/utils/courseCache';
import { webcrypto } from 'node:crypto';
import { createSafePrintFrame, printHtmlContent } from '../printHtmlToPdf';
let printed: ReturnType<typeof vi.fn>, frame: HTMLIFrameElement | null, target: EventTarget & { print: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }, imageFailed: boolean, delayLoad: boolean, fontReady: Promise<void> | null;
const flush = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };
beforeEach(() => {
  setOfflineAuthActor('QA-print-A'); fontReady = null;
  printed = vi.fn(); frame = null; imageFailed = false; delayLoad = false; target = Object.assign(new EventTarget(), { print: printed, focus: vi.fn() }); vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  const append = document.body.appendChild.bind(document.body);
  vi.spyOn(document.body, 'appendChild').mockImplementation(((node: Node) => {
    const result = append(node); if (!(node instanceof HTMLIFrameElement)) return result; frame = node;
    expect(typeof frame.onload).toBe('function'); expect(frame.getAttribute('sandbox')).toBe('allow-same-origin allow-modals'); expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts');
    if (!delayLoad) void Promise.resolve().then(() => { const doc = new DOMParser().parseFromString(frame!.srcdoc, 'text/html'); if (fontReady) Object.defineProperty(doc, 'fonts', { value: { ready: fontReady } }); for (const image of Array.from(doc.images)) { Object.defineProperty(image, 'complete', { value: true }); Object.defineProperty(image, 'naturalWidth', { value: imageFailed ? 0 : 10 }); }
      Object.defineProperty(frame!, 'contentDocument', { value: doc, configurable: true }); Object.defineProperty(frame!, 'contentWindow', { value: target, configurable: true }); frame!.onload?.call(frame!, new Event('load'));
    }); return result;
  }) as typeof document.body.appendChild);
});
afterEach(() => { setOfflineAuthActor(null); frame?.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('bounded browser print lifecycle', () => {
  it('stops an old organization protocol while fonts wait even when the same actor remains logged in', async () => {
    let ready!: () => void, organizationEpoch = 1; fontReady = new Promise<void>(resolve => { ready = resolve; });
    const originalEpoch = organizationEpoch;
    const pending = printHtmlContent('<p>Договор первой организации</p>', 'Протокол', { assertCurrent: () => { if (organizationEpoch !== originalEpoch) throw new Error('old organization'); } });
    const outcome = expect(pending).rejects.toMatchObject({ code: 'ACCESS_CHANGED' }); await flush();
    organizationEpoch++; ready(); await outcome;
    expect(printed).not.toHaveBeenCalled(); expect(frame?.isConnected).toBe(false);
  });
  it('blocks actor round trips while fonts are loading and disposes without opening print', async () => {
    let ready!: () => void; fontReady = new Promise<void>(resolve => { ready = resolve; });
    const pending = printHtmlContent('<p>Персональный договор</p>'); const outcome = expect(pending).rejects.toMatchObject({ code: 'ACCESS_CHANGED' }); await flush();
    setOfflineAuthActor('QA-print-B'); setOfflineAuthActor('QA-print-A'); ready(); await outcome;
    expect(printed).not.toHaveBeenCalled(); expect(frame?.isConnected).toBe(false);
  });
  it('does not carry an anonymous document across a new login during readiness', async () => {
    setOfflineAuthActor(null); let ready!: () => void; fontReady = new Promise<void>(resolve => { ready = resolve; });
    const pending = printHtmlContent('<p>Общедоступный документ</p>'); const outcome = expect(pending).rejects.toMatchObject({ code: 'ACCESS_CHANGED' }); await flush();
    setOfflineAuthActor('QA-print-A'); ready(); await outcome; expect(printed).not.toHaveBeenCalled(); expect(frame?.isConnected).toBe(false);
  });
  it('rechecks observed access immediately before invoking browser print', async () => {
    target.focus.mockImplementation(() => observeOfflineAccess('QA-print-A', 'documents-revoked'));
    await expect(printHtmlContent('<p>Договор</p>')).rejects.toMatchObject({ code: 'ACCESS_CHANGED' }); expect(printed).not.toHaveBeenCalled(); expect(frame?.isConnected).toBe(false);
  });
  it('installs listeners before loading, invokes print only after readiness and cleans up afterprint without claiming a saved PDF', async () => {
    await expect(printHtmlContent('<p>Договор</p>', 'Документ')).resolves.toBeUndefined(); expect(printed).toHaveBeenCalledOnce(); expect(frame?.isConnected).toBe(true); target.dispatchEvent(new Event('afterprint')); expect(frame?.isConnected).toBe(false);
  });
  it('refuses a failed remote stamp before printing and removes the frame', async () => {
    imageFailed = true; await expect(printHtmlContent('<p>Документ</p><img src="https://files.example.org/stamp.png">')).rejects.toMatchObject({ code: 'RESOURCE_FAILED' }); expect(printed).not.toHaveBeenCalled(); expect(frame?.isConnected).toBe(false);
  });
  it('reports print failure rather than swallowing it or leaving an iframe', async () => {
    printed.mockImplementation(() => { throw new Error('blocked'); }); await expect(printHtmlContent('<p>Текст</p>')).rejects.toMatchObject({ code: 'PRINT_FAILED' }); expect(frame?.isConnected).toBe(false);
  });
  it('bounds a missing load event and performs cleanup', async () => {
    vi.useFakeTimers(); delayLoad = true; const pending = createSafePrintFrame('<p>Текст</p>'); const outcome = expect(pending).rejects.toMatchObject({ code: 'TIMED_OUT' }); await vi.advanceTimersByTimeAsync(15001); await outcome; expect(frame?.isConnected).toBe(false); expect(printed).not.toHaveBeenCalled();
  });
  it('returns sanitized document for raster rendering and lets the caller clean up after rendering errors', async () => {
    const prepared = await createSafePrintFrame('<p onclick="steal()">Текст</p><script>steal()</script>', 'Документ', { rasterImages: true }); expect(prepared.document.querySelector('script,[onclick]')).toBeNull(); expect(printed).not.toHaveBeenCalled(); prepared.dispose(); expect(frame?.isConnected).toBe(false);
  });
});
