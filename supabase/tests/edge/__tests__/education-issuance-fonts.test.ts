import {afterEach, describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const nativeAtob = globalThis.atob;
const fresh = async () => {
  vi.resetModules();
  return import('../../../functions/_shared/education-issuance-fonts');
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetModules();
});

describe('bounded, exact owned-font ESM initialization', () => {
  it('exports the same two font metadata/data URLs from actual native gzip and exact repository bytes', async () => {
    const {educationFonts} = await fresh();
    expect(educationFonts.map(font => ({path: font.path, bytes: font.bytes, weight: font.weight, sha256: font.sha256}))).toEqual([
      {path: 'public/fonts/PTSans-Regular.ttf', bytes: 442960, weight: 400, sha256: '9cc831490532009bae2b3ce0d39c62adfc889060beb421593bfd9d2396d0f10a'},
      {path: 'public/fonts/PTSans-Bold.ttf', bytes: 470240, weight: 700, sha256: '3128bd5ecf01816e59a23d54c57a7a6b14615b07db53ff277c77376010265b05'},
    ]);
    for (const font of educationFonts) {
      const owned = readFileSync(font.path);
      expect(font.dataUrl).toBe('data:font/ttf;base64,' + owned.toString('base64'));
      expect(createHash('sha256').update(owned).digest('hex')).toBe(font.sha256);
      expect(Buffer.from(font.dataUrl.split(',')[1], 'base64')).toEqual(owned);
    }
  });

  it('refuses unavailable native gzip with no substitute font', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    await expect(fresh()).rejects.toThrow('gzip_unavailable');
  });

  it.each(['corrupt', 'truncated'] as const)('refuses %s packed bytes before any font is exported', async mode => {
    vi.stubGlobal('atob', (input: string) => {
      const binary = nativeAtob(input);
      return mode === 'truncated' ? binary.slice(0, -1) : String.fromCharCode(binary.charCodeAt(0) ^ 1) + binary.slice(1);
    });
    await expect(fresh()).rejects.toThrow(mode === 'truncated' ? 'packed_length' : 'packed_sha256');
  });

  it('propagates a native decoder failure instead of exporting partial bytes', async () => {
    vi.stubGlobal('DecompressionStream', class {
      constructor() {
        return new TransformStream({transform(_chunk, controller) {controller.error(new Error('synthetic native gzip decoder failure'));}});
      }
    });
    await expect(fresh()).rejects.toThrow('synthetic native gzip decoder failure');
  });

  it('rejects a decoder chunk beyond the exact output limit before retaining it', async () => {
    vi.stubGlobal('DecompressionStream', class {
      constructor() {
        return new TransformStream({transform(_chunk, controller) {controller.enqueue(new Uint8Array(470241));}});
      }
    });
    await expect(fresh()).rejects.toThrow('expanded_limit');
  });

  it('refuses prematurely ended decoded bytes', async () => {
    vi.stubGlobal('DecompressionStream', class {
      constructor() {return new TransformStream({transform() {/* consume without emitting font bytes */}});}
    });
    await expect(fresh()).rejects.toThrow('expanded_length');
  });

  it('refuses exact-length but different decoded bytes using the original owned SHA', async () => {
    let index = 0;
    vi.stubGlobal('DecompressionStream', class {
      constructor() {
        const length = index++ === 0 ? 442960 : 470240;
        let emitted = false;
        return new TransformStream({transform(_chunk, controller) {
          if (!emitted) {emitted = true; controller.enqueue(new Uint8Array(length));}
        }});
      }
    });
    await expect(fresh()).rejects.toThrow('expanded_sha256');
  });

  it('rejects stalled native initialization within its finite deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('DecompressionStream', class {
      constructor() {return new TransformStream({transform() {return new Promise<void>(() => undefined);}});}
    });
    const pending = fresh();
    const assertion = expect(pending).rejects.toThrow('deadline');
    await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThanOrEqual(2), {interval: 1});
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a late digest using elapsed monotonic time even while timeout callbacks have not run', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    let clock = 0, completed = 0;
    let hashesDone!: () => void;
    const bothHashesDone = new Promise<void>(resolve => {hashesDone = resolve;});
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, bytes) => {
      const result = await nativeDigest(algorithm, bytes);
      clock = 10_001; // Simulate delayed completion; do not advance/run the fake timer queue.
      if (++completed === 2) hashesDone();
      return result;
    });
    await expect(fresh()).rejects.toThrow('deadline');
    await bothHashesDone;
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(clock).toBe(10_001);
    expect(vi.getTimerCount()).toBe(0);
  });
});
