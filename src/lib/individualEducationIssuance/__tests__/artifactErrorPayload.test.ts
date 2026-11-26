import {afterEach, describe, expect, it, vi} from 'vitest';
import {artifactErrorPayload} from '../artifactErrorPayload';
afterEach(() => vi.useRealTimers());
const json = (body: string, headers: Record<string, string> = {}) => new Response(body, {status: 503, headers: {'Content-Type': 'application/json', ...headers}});

describe('bounded artifact error response clone', () => {
  it('reads JSON from a clone without consuming the original response', async () => {
    const response = json('{"code":"DEPENDENCY_UNAVAILABLE"}'); const check = vi.fn();
    expect(await artifactErrorPayload(response, 1000, check)).toEqual({code: 'DEPENDENCY_UNAVAILABLE'});
    expect(response.bodyUsed).toBe(false); expect(await response.json()).toEqual({code: 'DEPENDENCY_UNAVAILABLE'});
    expect(check.mock.calls.length).toBeGreaterThan(1);
  });
  it.each([new Response('<html>provider</html>', {headers: {'Content-Type': 'text/html'}}), json('x'.repeat(8193)), json('{}', {'Content-Length': '8193'}), json('{invalid'), json('{}', {'Content-Length': 'untrusted'})])
    ('refuses non-JSON, oversized or malformed bodies instead of trusting provider text', async response => {
      await expect(artifactErrorPayload(response, 1000, () => {})).rejects.toThrow();
      expect(response.bodyUsed).toBe(false);
    });
  it('uses only the remaining original 65-second allowance and cancels a stalled clone', async () => {
    vi.useFakeTimers();
    const response = new Response(new ReadableStream({pull: () => new Promise(() => {})}), {headers: {'Content-Type': 'application/json'}});
    const failed = artifactErrorPayload(response, 20, () => {}).catch(error => error);
    await vi.advanceTimersByTimeAsync(20); expect(await failed).toBeInstanceOf(Error);
    expect(response.bodyUsed).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects a result whose scope was revoked during the asynchronous body read', async () => {
    let allowed = true, finish!: () => void;
    const response = new Response(new ReadableStream<Uint8Array>({pull(c) {return new Promise<void>(resolve => {
      finish = () => {allowed = false; c.enqueue(new TextEncoder().encode('{}')); c.close(); resolve();};
    });}}), {headers: {'Content-Type': 'application/json'}});
    const failed = artifactErrorPayload(response, 1000, () => {if (!allowed) throw Error('scope revoked');}).catch(error => error);
    for (let i = 0; i < 8 && !finish; i++) await Promise.resolve();
    finish(); expect(await failed).toMatchObject({message: 'scope revoked'});
  });
  it('never starts a clone after the original allowance has expired', async () => {
    const response = json('{}'); const clone = vi.spyOn(response, 'clone');
    await expect(artifactErrorPayload(response, 0, () => {})).rejects.toThrow(); expect(clone).not.toHaveBeenCalled();
  });
});
