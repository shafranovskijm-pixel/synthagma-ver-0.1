import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lazyWithRetry } from '../lazyWithRetry';
const notify = vi.hoisted(() => vi.fn());
vi.mock('../applicationUpdatePrompt', () => ({ applicationUpdates: { available: notify } }));

function load(component: any): Promise<unknown> {
  // React.lazy starts the supplied import through its public render contract;
  // inspect its thrown promise to await the same original lazy payload.
  try { return Promise.resolve(component._init(component._payload)); }
  catch (value) { return value as Promise<unknown>; }
}
describe('chunk failures offer manual recovery without scheduling a reload', () => {
  beforeEach(() => { vi.useFakeTimers(); notify.mockClear(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  it('one transient failure retries and returns the actual loaded component', async () => {
    const module = { default: () => null };
    const importFn = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce(module);
    const pending = load(lazyWithRetry(importFn));
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBe(module);
    expect(importFn).toHaveBeenCalledTimes(2); expect(notify).not.toHaveBeenCalled();
  });
  it('a second failure is propagated, with no permanent promise or reload timer', async () => {
    const second = new Error('old chunk absent');
    const importFn = vi.fn().mockRejectedValueOnce(new Error('first')).mockRejectedValueOnce(second);
    const pending = load(lazyWithRetry(importFn));
    const observed = pending.catch(error => error);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await observed).toBe(second);
    expect(notify).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
});
