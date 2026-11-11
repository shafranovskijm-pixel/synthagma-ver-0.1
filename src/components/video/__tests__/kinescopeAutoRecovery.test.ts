import { afterEach, describe, expect, it, vi } from 'vitest';
import { isKinescopeHandshakeTimeout, recoverKinescopeConnection } from '../kinescopeAutoRecovery';
const options = { url: 'https://kinescope.io/embed/fixture?drmauthtoken=qa',
  size: { width: '100%', height: '100%' }, ui: { controls: false, mainPlayButton: true, language: 'ru' as const },
  behavior: { preload: 'metadata' as const, localStorage: false, keyboard: false, playsInline: true, muted: false, playbackRate: 1 } };
function fixture() {
  const player = { destroy: vi.fn().mockResolvedValue(undefined) } as any;
  const factory = { create: vi.fn().mockResolvedValue(player) };
  const old = document.createElement('iframe'); old.src = 'https://kinescope.io/embed/old?_=old';
  old.title = 'Видео урока'; old.setAttribute('allow', 'autoplay; encrypted-media'); document.body.append(old);
  const start = () => recoverKinescopeConnection(factory, old, 'fresh-generation', options);
  return { factory, player, old, start };
}
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
describe('fresh Kinescope connection retry', () => {
  it('recognizes only the observed HTTP200 connection timeout', () => {
    const cause = { message: 'Timeout of 8000ms exceeded. Unable to connect to iframe.' };
    expect(isKinescopeHandshakeTimeout({ code: 'HTTP_STATUS', status: 200, cause })).toBe(true);
    for (const error of [null, 'timeout', { code: 'HTTP_STATUS', status: 403, cause },
      { code: 'HTTP_STATUS', status: 200 }, { code: 'HTTP_STATUS', status: 200, cause: { message: 'Network error' } },
      { code: 'OTHER', status: 200, cause }]) expect(isKinescopeHandshakeTimeout(error)).toBe(false);
  });
  it('navigates a fresh node only through SDK.create, with unchanged options and authorization', async () => {
    const f = fixture(), r = f.start();
    expect(f.old.isConnected).toBe(false); expect(r.frame.isConnected).toBe(true);
    expect(r.frame.id).toBe('fresh-generation'); expect(r.frame.getAttribute('src')).toBeNull();
    expect(r.frame.title).toBe('Видео урока'); expect(r.frame.getAttribute('allow')).toBe('autoplay; encrypted-media');
    expect(await r.ready).toBe(f.player);
    expect(f.factory.create).toHaveBeenCalledExactlyOnceWith('fresh-generation', options);
    r.cancel(); expect(f.player.destroy).not.toHaveBeenCalled();
  });
  it.each([undefined, null, false, new Error('retry failed')])('returns a second rejection without retrying (%s)', async error => {
    const f = fixture(); f.factory.create.mockRejectedValue(error); const r = f.start();
    await expect(r.ready).rejects.toBe(error); expect(f.factory.create).toHaveBeenCalledOnce();
  });
  it('does not invoke the SDK if cancelled before the retry starts', async () => {
    const f = fixture(), r = f.start(); const rejected = expect(r.ready).rejects.toMatchObject({ name: 'AbortError' });
    r.cancel(); await rejected; expect(f.factory.create).not.toHaveBeenCalled();
  });
  it('destroys only its late player when cancelled during create', async () => {
    const f = fixture(); let resolve!: (player: any) => void;
    f.factory.create.mockReturnValue(new Promise(r => { resolve = r; })); const r = f.start();
    const rejected = expect(r.ready).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); r.cancel(); await rejected; resolve(f.player);
    await Promise.resolve(); await Promise.resolve();
    expect(f.player.destroy).toHaveBeenCalledOnce();
  });
  it('keeps concurrent retries on distinct native ids and DOM nodes', async () => {
    const f = fixture(), first = f.start(); const next = document.createElement('iframe'); document.body.append(next);
    const second = recoverKinescopeConnection(f.factory, next, 'second-generation', options);
    await Promise.all([first.ready, second.ready]);
    expect(f.factory.create.mock.calls.map(([id]) => id)).toEqual(['fresh-generation', 'second-generation']);
    expect(first.frame).not.toBe(second.frame);
  });
});
