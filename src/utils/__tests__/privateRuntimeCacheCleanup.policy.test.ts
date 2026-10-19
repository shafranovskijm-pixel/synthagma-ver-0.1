import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensurePrivateRuntimePolicy } from '../privateRuntimeCacheCleanup';

class SyntheticMessageChannel {
  port1: any = { onmessage: null, close() {} };
  port2: any = { close() {}, postMessage: (data: unknown) => queueMicrotask(() => this.port1.onmessage?.({ data })) };
}
const controller = (version: number | null) => ({ postMessage: vi.fn((_message, ports) => { if (version !== null) ports[0].postMessage({ ok: true, policyVersion: version }); }) });
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('MessageChannel', SyntheticMessageChannel); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('private worker activation boundary before Auth/App', () => {
  it('uncontrolled browser cannot read a legacy worker runtime cache', async () => {
    const register = vi.fn(); vi.stubGlobal('navigator', { serviceWorker: { controller: null, register } });
    await ensurePrivateRuntimePolicy(); expect(register).not.toHaveBeenCalled();
  });
  it('requires the exact policy version acknowledgement, including cleanup completion', async () => {
    const worker = controller(2); const register = vi.fn(); vi.stubGlobal('navigator', { serviceWorker: { controller: worker, register } });
    await ensurePrivateRuntimePolicy(); expect(worker.postMessage).toHaveBeenCalledOnce(); expect(register).not.toHaveBeenCalled();
  });
  it('old controller cannot dispatch private application reads until a new controller acknowledges policy2', async () => {
    const events = new Map<string, () => void>(); const old = controller(null); const current = controller(2); const privateRead = vi.fn();
    const workers = { controller: old, addEventListener: (name: string, fn: () => void) => events.set(name, fn), removeEventListener: (name: string) => events.delete(name),
      register: vi.fn(async () => { workers.controller = current; events.get('controllerchange')?.(); return {}; }) };
    vi.stubGlobal('navigator', { serviceWorker: workers });
    const ready = ensurePrivateRuntimePolicy().then(privateRead);
    expect(privateRead).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1201); await ready;
    expect(workers.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    expect(current.postMessage).toHaveBeenCalled(); expect(privateRead).toHaveBeenCalledOnce();
  });
  it('old/offline or wrong-version controller fails closed without private read or pretending old in-flight work was cancelled', async () => {
    const workers = { controller: controller(1), addEventListener: vi.fn(), removeEventListener: vi.fn(), register: vi.fn().mockRejectedValue(new Error('offline')) };
    vi.stubGlobal('navigator', { serviceWorker: workers }); const privateRead = vi.fn();
    const pending = ensurePrivateRuntimePolicy().then(privateRead);
    await expect(pending).rejects.toThrow('offline'); expect(privateRead).not.toHaveBeenCalled();
  });
});
