import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
class SyntheticMessageChannel {
  port1: any = { onmessage: null, onmessageerror: null, close: vi.fn() };
  port2: any = { close: vi.fn(), postMessage: (data: unknown) => queueMicrotask(() => this.port1.onmessage?.({ data })) };
}
const worker = (reply: any = { ok: true, policyVersion: 2 }, delay = 0) => ({ postMessage: vi.fn((_message, ports) => {
  if (reply === null) return;
  if (delay) setTimeout(() => ports[0].postMessage(reply), delay); else ports[0].postMessage(reply);
}) });
const workersFor = (controller: any) => Object.assign(new EventTarget(), { controller, register: vi.fn(async () => ({})), getRegistrations: vi.fn(async () => []) });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let api: typeof import('../privateRuntimeCacheCleanup');
beforeEach(async () => { Reflect.deleteProperty(window, Symbol.for('sintagma.private-runtime-fetch-fence.v2')); vi.useFakeTimers(); vi.resetModules(); vi.stubGlobal('MessageChannel', SyntheticMessageChannel); vi.stubGlobal('caches', { keys: vi.fn(async () => []) }); api = await import('../privateRuntimeCacheCleanup'); });
afterEach(() => { Reflect.deleteProperty(window, Symbol.for('sintagma.private-runtime-fetch-fence.v2')); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('verified private startup barrier', () => {
  it('finishes targeted browser cleanup before importing App in an uncontrolled page', async () => {
    let done!: (names: string[]) => void; (caches.keys as any).mockReturnValue(new Promise(resolve => { done = resolve; }));
    const workers = workersFor(null); vi.stubGlobal('navigator', { serviceWorker: workers }); const prepare = vi.fn(async () => 'app'), start = vi.fn();
    const pending = api.startAfterPrivateRuntimePolicy(prepare, start); expect(prepare).not.toHaveBeenCalled(); done([]); await pending;
    expect(prepare).toHaveBeenCalledOnce(); expect(start).toHaveBeenCalledWith('app'); expect(workers.register).not.toHaveBeenCalled();
  });
  it('accepts a legitimate slow completed cleanup beyond the old1200ms timeout without updating or importing early', async () => {
    const current = worker({ ok: true, policyVersion: 2 }, 2800), workers = workersFor(current); vi.stubGlobal('navigator', { serviceWorker: workers });
    const prepare = vi.fn(async () => 'app'), start = vi.fn(), pending = api.startAfterPrivateRuntimePolicy(prepare, start);
    await vi.advanceTimersByTimeAsync(1500); expect(prepare).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1301); await pending; expect(start).toHaveBeenCalledOnce(); expect(current.postMessage).toHaveBeenCalledOnce(); expect(workers.register).not.toHaveBeenCalled();
  });
  it('shares the in-flight startup acknowledgement and reuses only the same current reviewed controller', async () => {
    const current = worker({ ok: true, policyVersion: 2 }, 2500), workers = workersFor(current); vi.stubGlobal('navigator', { serviceWorker: workers });
    const first = api.ensurePrivateRuntimePolicy(), second = api.ensurePrivateRuntimePolicy(); expect(current.postMessage).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2501); await Promise.all([first, second]); await api.ensurePrivateRuntimePolicy(); expect(current.postMessage).toHaveBeenCalledOnce();
  });
  it('retries a lost acknowledgement on the same current controller without treating registration as proof', async () => {
    const current = worker(null), workers = workersFor(current); current.postMessage.mockImplementationOnce(() => {}).mockImplementation((_message, ports) => ports[0].postMessage({ ok: true, policyVersion: 2 }));
    vi.stubGlobal('navigator', { serviceWorker: workers }); const prepare = vi.fn(async () => 'app'), start = vi.fn();
    const pending = api.startAfterPrivateRuntimePolicy(prepare, start); await vi.advanceTimersByTimeAsync(5999); expect(prepare).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(2); await pending;
    expect(current.postMessage).toHaveBeenCalledTimes(2); expect(workers.register).toHaveBeenCalledOnce(); expect(start).toHaveBeenCalledOnce();
  });
  it('migrates an old no-ACK controller and waits for the new current controller cleanup proof', async () => {
    const old = worker(null), current = worker(), workers = workersFor(old); workers.register.mockImplementation(async () => { setTimeout(() => { workers.controller = current; workers.dispatchEvent(new Event('controllerchange')); }, 1800); return {}; });
    vi.stubGlobal('navigator', { serviceWorker: workers }); const start = vi.fn(), pending = api.startAfterPrivateRuntimePolicy(async () => 'app', start);
    await vi.advanceTimersByTimeAsync(6500); expect(start).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1400); await pending; expect(workers.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' }); expect(current.postMessage).toHaveBeenCalledOnce(); expect(start).toHaveBeenCalledOnce();
  });
  it('does not trust an old-controller ACK after controller identity changed', async () => {
    const current = worker(), old = worker(null), workers = workersFor(old); old.postMessage.mockImplementation((_message, ports) => { ports[0].postMessage({ ok: true, policyVersion: 2 }); workers.controller = current; });
    vi.stubGlobal('navigator', { serviceWorker: workers }); const start = vi.fn(); await api.startAfterPrivateRuntimePolicy(async () => 'app', start);
    expect(current.postMessage).toHaveBeenCalledOnce(); expect(start).toHaveBeenCalledOnce();
  });
  it('rechecks a controller changed during application chunk loading before rendering App/Auth', async () => {
    const old = worker(), current = worker({ ok: true, policyVersion: 2 }, 2000), workers = workersFor(old); vi.stubGlobal('navigator', { serviceWorker: workers });
    let loaded!: (ready: string) => void; const prepare = vi.fn(() => new Promise<string>(resolve => { loaded = resolve; })), start = vi.fn();
    const pending = api.startAfterPrivateRuntimePolicy(prepare, start); await flush(); expect(prepare).toHaveBeenCalledOnce();
    workers.controller = current; workers.dispatchEvent(new Event('controllerchange')); loaded('app'); await flush(); expect(start).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2001); await pending; expect(current.postMessage).toHaveBeenCalledOnce(); expect(start).toHaveBeenCalledOnce();
  });
  it('fails closed immediately when the reviewed worker reports cleanup failure, without importing private App', async () => {
    const workers = workersFor(worker({ ok: false, policyVersion: 2, error: 'CLEANUP_FAILED' })); vi.stubGlobal('navigator', { serviceWorker: workers }); const prepare = vi.fn();
    await expect(api.startAfterPrivateRuntimePolicy(prepare, vi.fn())).rejects.toMatchObject({ code: 'CLEANUP_FAILED' }); expect(prepare).not.toHaveBeenCalled(); expect(workers.register).not.toHaveBeenCalled();
  });
  it('bounds no-ACK and wrong-policy controllers, never unregisters them to open a private cached app', async () => {
    const workers = workersFor(worker(null)); workers.register.mockReturnValue(new Promise(() => {})); vi.stubGlobal('navigator', { serviceWorker: workers }); const prepare = vi.fn();
    const pending = api.startAfterPrivateRuntimePolicy(prepare, vi.fn()); const outcome = expect(pending).rejects.toMatchObject({ code: 'ACK_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20001); await outcome; expect(prepare).not.toHaveBeenCalled(); expect(workers.getRegistrations).not.toHaveBeenCalled();
  });
  it('classifies failed worker update honestly while old policy never opens App', async () => {
    const workers = workersFor(worker({ ok: true, policyVersion: 1 })); workers.register.mockRejectedValue(new Error('network failed')); vi.stubGlobal('navigator', { serviceWorker: workers }); const prepare = vi.fn();
    const pending = api.startAfterPrivateRuntimePolicy(prepare, vi.fn()); const outcome = expect(pending).rejects.toMatchObject({ code: 'POLICY_UPDATE_FAILED' }); await vi.advanceTimersByTimeAsync(20001); await outcome; expect(prepare).not.toHaveBeenCalled();
  });
  it('does not substitute failed browser cache cleanup with an uncontrolled success', async () => {
    (caches.keys as any).mockRejectedValue(new Error('storage unavailable')); vi.stubGlobal('navigator', { serviceWorker: workersFor(null) }); const prepare = vi.fn();
    await expect(api.startAfterPrivateRuntimePolicy(prepare, vi.fn())).rejects.toMatchObject({ code: 'CLEANUP_FAILED' }); expect(prepare).not.toHaveBeenCalled();
  });
});

describe('native fetch fence before proxy captures/import-time Auth', () => {
  it('blocks an import-time Auth request after controller change until current cleanup is confirmed', async () => {
    const transport = vi.fn(async () => new Response('fresh auth')); vi.stubGlobal('fetch', transport);
    const old = worker(), current = worker({ ok: true, policyVersion: 2 }, 2200), workers = workersFor(old); vi.stubGlobal('navigator', { serviceWorker: workers });
    api.installPrivateRuntimeFetchFence(); const capturedNativeGate = window.fetch;
    let loaded!: () => void; const start = vi.fn(), prepare = vi.fn(async () => { await new Promise<void>(resolve => { loaded = resolve; }); await capturedNativeGate('/auth/v1/token', { method: 'POST', body: 'synthetic' }); return 'app'; });
    const pending = api.startAfterPrivateRuntimePolicy(prepare, start); await flush(); expect(prepare).toHaveBeenCalledOnce();
    workers.controller = current; workers.dispatchEvent(new Event('controllerchange')); loaded(); await flush(); expect(transport).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2201); await pending; expect(transport).toHaveBeenCalledOnce(); expect(start).toHaveBeenCalledOnce();
  });
  it('synchronously rechecks controller identity after the policy await and before native dispatch', async () => {
    const transport = vi.fn(async () => new Response('fresh')); vi.stubGlobal('fetch', transport); const old = worker(), current = worker({ ok: true, policyVersion: 2 }, 2000), workers = workersFor(old); vi.stubGlobal('navigator', { serviceWorker: workers });
    api.installPrivateRuntimeFetchFence(); await api.ensurePrivateRuntimePolicy(); const pending = window.fetch('/sb-api/rest/v1/profiles');
    workers.controller = current; workers.dispatchEvent(new Event('controllerchange')); await flush(); expect(transport).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2001); await pending; expect(current.postMessage).toHaveBeenCalledOnce(); expect(transport).toHaveBeenCalledOnce();
  });
  it('never dispatches a native private request when the new controller cannot confirm policy', async () => {
    const transport = vi.fn(async () => new Response('must not run')); vi.stubGlobal('fetch', transport); const workers = workersFor(worker(null)); workers.register.mockRejectedValue(new Error('offline')); vi.stubGlobal('navigator', { serviceWorker: workers });
    api.installPrivateRuntimeFetchFence(); const pending = window.fetch('/auth/v1/token'); const outcome = expect(pending).rejects.toMatchObject({ code: 'POLICY_UPDATE_FAILED' }); await vi.advanceTimersByTimeAsync(20001); await outcome; expect(transport).not.toHaveBeenCalled();
  });
  it('respects AbortSignal while waiting without consuming a body or cancelling shared cleanup', async () => {
    const transport = vi.fn(async () => new Response('must not run')); vi.stubGlobal('fetch', transport); const current = worker({ ok: true, policyVersion: 2 }, 4000), workers = workersFor(current); vi.stubGlobal('navigator', { serviceWorker: workers });
    api.installPrivateRuntimeFetchFence(); const abort = new AbortController(), request = new Request('https://example.org/auth/v1/token', { method: 'POST', body: 'synthetic' });
    const pending = window.fetch(request, { signal: abort.signal }); const outcome = expect(pending).rejects.toMatchObject({ name: 'AbortError' }); await vi.advanceTimersByTimeAsync(100); abort.abort(); await outcome;
    expect(request.bodyUsed).toBe(false); expect(transport).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(4000); await api.ensurePrivateRuntimePolicy(); expect(current.postMessage).toHaveBeenCalledOnce(); expect(transport).not.toHaveBeenCalled();
  });
  it('preserves exact Request/args/native this and remains idempotent after a proxy captures the transport', async () => {
    let nativeThis: unknown; const transport = vi.fn(function(this: unknown, ..._args: unknown[]) { nativeThis = this; return Promise.resolve(new Response('fresh')); }); vi.stubGlobal('fetch', transport); const workers = workersFor(worker()); vi.stubGlobal('navigator', { serviceWorker: workers });
    api.installPrivateRuntimeFetchFence(); const gate = window.fetch; api.installPrivateRuntimeFetchFence(); expect(window.fetch).toBe(gate);
    const proxy = (...args: Parameters<typeof fetch>) => gate(...args); window.fetch = proxy; api.installPrivateRuntimeFetchFence(); expect(window.fetch).toBe(proxy);
    const request = new Request('https://example.org/sb-api/rest/v1/profile', { method: 'POST', body: 'synthetic' }), init: RequestInit = { headers: { 'x-synthetic': 'unchanged' } };
    await window.fetch(request, init); expect(transport).toHaveBeenCalledWith(request, init); expect(nativeThis).toBe(window); expect(request.bodyUsed).toBe(false); expect(workers.controller.postMessage).toHaveBeenCalledOnce();
  });
});
