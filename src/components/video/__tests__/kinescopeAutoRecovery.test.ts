import { afterEach, describe, expect, it, vi } from 'vitest';
import { isKinescopeHandshakeTimeout, recoverKinescopeConnection } from '../kinescopeAutoRecovery';

const options = { url: 'https://kinescope.io/embed/fixture?drmToken=keep&_=old&v=old',
  size: { width: '100%', height: '100%' }, ui: { controls: false, mainPlayButton: true, language: 'ru' as const },
  behavior: { preload: 'metadata' as const, localStorage: false, keyboard: false, playsInline: true, muted: false, playbackRate: 1 } };
function fixture() {
  const listeners = new Set<(e: any) => void>();
  const stop = vi.fn();
  const factory = { version: '2.200.3', Events: { Created: 'created' }, create: vi.fn(),
    on: vi.fn((_name, fn) => listeners.add(fn)), off: vi.fn((_name, fn) => listeners.delete(fn)),
    monitor: vi.fn(() => stop) };
  const old = document.createElement('iframe'); old.title = 'Видео урока'; document.body.append(old);
  const start = () => recoverKinescopeConnection(factory, old, 'fresh-generation', options)!;
  const player = (frame: HTMLIFrameElement) => ({ getTargetContainer: () => frame,
    setOptions: vi.fn().mockResolvedValue(undefined), seekTo: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined) });
  return { factory, listeners, stop, old, start, player, emit: (data: any) => [...listeners].forEach(fn => fn({ data })) };
}
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('narrow initial-handshake recovery', () => {
  it('recognizes only the observed HTTP200 connection timeout', () => {
    const cause = { message: 'Timeout of 8000ms exceeded. Unable to connect to iframe.' };
    expect(isKinescopeHandshakeTimeout({ code: 'HTTP_STATUS', status: 200, cause })).toBe(true);
    for (const error of [null, 'timeout', { code: 'HTTP_STATUS', status: 403, cause },
      { code: 'HTTP_STATUS', status: 200 }, { code: 'HTTP_STATUS', status: 200, cause: { message: 'Network error' } },
      { code: 'OTHER', status: 200, cause }]) expect(isKinescopeHandshakeTimeout(error)).toBe(false);
  });
  it('leaves unsupported factories and their iframe untouched', () => {
    const f = fixture(); f.factory.version = 'future';
    expect(recoverKinescopeConnection(f.factory, f.old, 'new', options)).toBeUndefined();
    expect(f.old.isConnected).toBe(true); expect(f.factory.monitor).not.toHaveBeenCalled();
  });
  it('connects only the replacement frame, applies restrictions, then clears cached position', async () => {
    const f = fixture(), r = f.start(), p = f.player(r.frame);
    expect(f.old.isConnected).toBe(false); expect(r.frame.id).toBe('fresh-generation');
    const url = new URL(r.frame.src);
    expect(url.searchParams.get('drmToken')).toBe('keep');
    expect(url.searchParams.has('_')).toBe(false); expect(url.searchParams.has('v')).toBe(false);
    expect(url.searchParams.get('controls')).toBe('0'); expect(url.searchParams.get('keyboard')).toBe('0');
    expect(url.searchParams.get('autoplay')).toBe('0'); expect(url.searchParams.has('enableIframeApi')).toBe(true);
    const foreign = f.player(f.old); f.emit(foreign);
    expect(foreign.setOptions).not.toHaveBeenCalled(); expect(foreign.destroy).not.toHaveBeenCalled();
    f.emit(p); expect(await r.ready).toBe(p);
    expect(p.setOptions).toHaveBeenCalledWith({ ui: options.ui,
      behavior: { ...options.behavior, autoPlay: false, preload: 'metadata' } });
    expect(p.seekTo).toHaveBeenCalledWith(0); expect(f.stop).toHaveBeenCalledOnce();
    r.cancel(); expect(p.destroy).not.toHaveBeenCalled();
  });
  it('does not declare readiness before the settings and seek settle', async () => {
    const f = fixture(), r = f.start(), p = f.player(r.frame);
    let settings!: () => void, seek!: () => void, ready = false;
    p.setOptions.mockReturnValue(new Promise<void>(resolve => { settings = resolve; }));
    p.seekTo.mockReturnValue(new Promise<void>(resolve => { seek = resolve; }));
    void r.ready.then(() => { ready = true; }); f.emit(p);
    await Promise.resolve(); expect(p.seekTo).not.toHaveBeenCalled(); expect(ready).toBe(false);
    settings(); await Promise.resolve(); expect(p.seekTo).toHaveBeenCalledWith(0); expect(ready).toBe(false);
    seek(); await r.ready; expect(ready).toBe(true);
  });
  it.each([undefined, null, false, new Error('settings failed')])('fails closed on rejected settings (%s)', async error => {
    const f = fixture(), r = f.start(), p = f.player(r.frame);
    p.setOptions.mockRejectedValue(error); const rejected = expect(r.ready).rejects.toBeDefined(); f.emit(p);
    await rejected; expect(p.seekTo).not.toHaveBeenCalled(); expect(p.destroy).toHaveBeenCalledOnce();
  });
  it('cancels pending connection without destroying a foreign player', async () => {
    const f = fixture(), r = f.start(), foreign = f.player(f.old);
    const rejected = expect(r.ready).rejects.toMatchObject({ name: 'AbortError' });
    r.cancel(); await rejected; f.emit(foreign);
    expect(f.listeners.size).toBe(0); expect(f.stop).toHaveBeenCalledOnce(); expect(foreign.destroy).not.toHaveBeenCalled();
  });
  it('destroys its candidate if unmounted while settings are pending', async () => {
    const f = fixture(), r = f.start(), p = f.player(r.frame);
    let release!: () => void; p.setOptions.mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
    const rejected = expect(r.ready).rejects.toMatchObject({ name: 'AbortError' });
    f.emit(p); r.cancel(); await rejected; release(); await Promise.resolve();
    expect(p.destroy).toHaveBeenCalledOnce(); expect(p.seekTo).not.toHaveBeenCalled();
  });
  it('stops after one bounded connection timeout', async () => {
    vi.useFakeTimers(); const f = fixture(), r = f.start();
    const rejected = expect(r.ready).rejects.toThrow('connection timed out');
    await vi.advanceTimersByTimeAsync(15000); await rejected;
    expect(f.listeners.size).toBe(0); expect(f.stop).toHaveBeenCalledOnce(); expect(f.factory.create).not.toHaveBeenCalled();
  });
  it('does not stop the shared monitor while another frame is still pending', async () => {
    const f = fixture(), first = f.start();
    const next = document.createElement('iframe'); document.body.append(next);
    const second = recoverKinescopeConnection(f.factory, next, 'second', options)!;
    const p1 = f.player(first.frame), p2 = f.player(second.frame);
    expect(f.stop).toHaveBeenCalledTimes(1); // the rescan replaces only the initial monitor
    f.emit(p1); await first.ready; expect(f.stop).toHaveBeenCalledTimes(1);
    expect(p2.setOptions).not.toHaveBeenCalled(); f.emit(p2); await second.ready;
    expect(f.stop).toHaveBeenCalledTimes(2);
  });
});
