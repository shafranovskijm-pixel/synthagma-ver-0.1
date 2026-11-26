import {describe, expect, it, vi} from 'vitest';
import {adjacentIoFence} from '../adjacent-io-fence';

const deferred = <T>() => {let resolve!: (value: T) => void; const promise = new Promise<T>(done => {resolve = done;}); return {promise, resolve};};

describe('request-local adjacent complete authority fence', () => {
  it('reuses only a completed Auth/context/Auth atom without intervening I/O', async () => {
    const calls: string[] = [];
    const f = adjacentIoFence(async () => {calls.push('auth-before', 'context', 'auth-after'); return {revision: 1};}, () => {});
    const one = await f.current(); expect(await f.current()).toBe(one);
    expect(calls).toEqual(['auth-before', 'context', 'auth-after']); expect(f.counts()).toEqual({fresh: 1, reused: 1});
    await f.io(async () => {}); await f.current();
    expect(calls).toEqual(['auth-before', 'context', 'auth-after', 'auth-before', 'context', 'auth-after']);
  });
  it('invalidates before the operation is invoked, including synchronous failures', async () => {
    const fresh = vi.fn(async () => 1); const f = adjacentIoFence(fresh, () => {});
    await f.current();
    await expect(f.io(() => {void f.current(); throw new Error('lost response');})).rejects.toThrow('lost response');
    await f.current(); expect(fresh).toHaveBeenCalledTimes(3);
  });
  it('invalidates in finally after failed I/O; no authority cache survives failure', async () => {
    const fresh = vi.fn(async () => 1); const f = adjacentIoFence(fresh, () => {});
    await f.current(); await expect(f.io(async () => {throw Error('offline');})).rejects.toThrow();
    await f.current(); expect(fresh).toHaveBeenCalledTimes(2);
  });
  it('does not cache authority while another I/O is still in flight', async () => {
    const fresh = vi.fn(async () => 1); const f = adjacentIoFence(fresh, () => {}); const pending = deferred<void>();
    await f.current(); const operation = f.io(() => pending.promise);
    await f.current(); await f.current(); expect(fresh).toHaveBeenCalledTimes(3);
    pending.resolve(); await operation; await f.current(); expect(fresh).toHaveBeenCalledTimes(4);
  });
  it('never shares or caches overlapping fresh guards', async () => {
    const a = deferred<number>(), b = deferred<number>();
    const fresh = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockResolvedValue(3);
    const f = adjacentIoFence(fresh, () => {}); const one = f.current(), two = f.current();
    expect(one).not.toBe(two); a.resolve(1); expect(await one).toBe(1);
    b.resolve(2); expect(await two).toBe(2); expect(await f.current()).toBe(3);
    expect(fresh).toHaveBeenCalledTimes(3); expect(f.counts().reused).toBe(0);
  });
  it('never caches a failed fresh guard', async () => {
    const fresh = vi.fn().mockRejectedValueOnce(Error('revoked')).mockResolvedValueOnce(2);
    const f = adjacentIoFence(fresh, () => {}); await expect(f.current()).rejects.toThrow('revoked');
    expect(await f.current()).toBe(2); expect(fresh).toHaveBeenCalledTimes(2);
  });
  it('checks abort even for an otherwise reusable result and before private I/O', async () => {
    let aborted = false; const operation = vi.fn(); const check = () => {if (aborted) throw Error('aborted');};
    const f = adjacentIoFence(async () => 1, check); await f.current(); aborted = true;
    await expect(f.current()).rejects.toThrow('aborted'); await expect(f.io(operation)).rejects.toThrow('aborted');
    expect(operation).not.toHaveBeenCalled();
  });
  it('isolates requests and treats conservative local async bytes/hash as barriers', async () => {
    let authority = 1; const fresh = vi.fn(async () => authority);
    const a = adjacentIoFence(fresh, () => {}), b = adjacentIoFence(fresh, () => {});
    expect(await a.current()).toBe(1); authority = 2; expect(await b.current()).toBe(2);
    await a.io(async () => new ArrayBuffer(1)); expect(await a.current()).toBe(2);
    expect(fresh).toHaveBeenCalledTimes(3);
  });
});
