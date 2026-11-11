import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseVideoPlayer } from '../CourseVideoPlayer';
import { HlsVideoPlayer } from '../HlsVideoPlayer';
import type { KinescopeEvent } from '../kinescopeApi';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const mocks = vi.hoisted(() => ({ create: vi.fn(), loadApi: vi.fn(), hlsInstances: [] as Array<any> }));
vi.mock('../kinescopeApi', async importOriginal => ({ ...await importOriginal<typeof import('../kinescopeApi')>(), loadKinescopeApi: mocks.loadApi }));
vi.mock('hls.js', () => ({ default: class FakeHls {
  static isSupported() { return true; }
  static Events = { ERROR: 'error' };
  loadSource = vi.fn();
  attachMedia = vi.fn();
  destroy = vi.fn();
  errorListener: ((event: string, data: { fatal: boolean }) => void) | undefined;
  on(_event: string, listener: (event: string, data: { fatal: boolean }) => void) { this.errorListener = listener; }
  constructor() { mocks.hlsInstances.push(this); }
} }));

function metadata(video: HTMLVideoElement, duration = 100) {
  Object.defineProperty(video, 'duration', { configurable: true, value: duration });
  fireEvent.loadedMetadata(video);
  fireEvent.canPlay(video);
}
function fullscreen(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element });
  fireEvent(document, new Event('fullscreenchange'));
}

let listeners: Map<string, (event: KinescopeEvent) => void>;
let provider: ReturnType<typeof makeProvider>;
function makeProvider() {
  return {
    Events: Object.fromEntries(['Loaded', 'DurationChange', 'TimeUpdate', 'Play', 'Playing', 'Pause', 'Ended', 'Waiting', 'Error', 'VolumeChange', 'PlaybackRateChange'].map(value => [value, value])),
    on: vi.fn((event: string, listener: (event: KinescopeEvent) => void) => listeners.set(event, listener)),
    off: vi.fn((event: string) => listeners.delete(event)),
    play: vi.fn().mockResolvedValue(undefined), pause: vi.fn().mockResolvedValue(undefined),
    seekTo: vi.fn().mockResolvedValue(undefined), setVolume: vi.fn().mockResolvedValue(undefined),
    mute: vi.fn().mockResolvedValue(undefined), unmute: vi.fn().mockResolvedValue(undefined),
    setPlaybackRate: vi.fn().mockResolvedValue(undefined),
    getCurrentTime: vi.fn().mockResolvedValue(0), getDuration: vi.fn().mockResolvedValue(100),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}
async function emit(event: string, data?: KinescopeEvent['data']) {
  await act(async () => { listeners.get(event)?.({ data }); });
}

beforeEach(() => {
  mocks.hlsInstances.length = 0;
  listeners = new Map();
  provider = makeProvider();
  mocks.create.mockReset().mockResolvedValue(provider);
  mocks.loadApi.mockReset().mockResolvedValue({ create: mocks.create });
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    fireEvent.play(this); fireEvent.playing(this); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: true }); fireEvent.pause(this);
  });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); fullscreen(null); });

describe('initial Kinescope connection recovery', () => {
  const cause = { message: 'Timeout of 8000ms exceeded. Unable to connect to iframe.' };
  it('recovers one HTTP200 handshake failure on a fresh SDK node without changing saved progress', async () => {
    const ids: string[] = [];
    mocks.create.mockImplementation(async (id, options) => {
      ids.push(id);
      const frame = document.getElementById(id)!;
      expect(frame.getAttribute('src')).toBeNull();
      expect(options.behavior.localStorage).toBe(false);
      frame.setAttribute('src', options.url);
      if (ids.length === 1) throw { code: 'HTTP_STATUS', status: 200, cause };
      return provider;
    });
    const onError = vi.fn(), onProgressChange = vi.fn();
    const view = render(<CourseVideoPlayer src="https://kinescope.io/embed/fixture" kinescope allowSeek={false}
      savedPosition={35} onError={onError} onProgressChange={onProgressChange} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Воспроизвести' })).toBeEnabled());
    expect(ids).toHaveLength(2); expect(ids[0]).not.toBe(ids[1]);
    expect(view.container.querySelectorAll('iframe')).toHaveLength(1);
    expect(view.container.querySelector('iframe')!.id).toBe(ids[1]);
    expect(provider.seekTo.mock.calls.map(([time]) => time)).toEqual([35]);
    expect(onProgressChange).toHaveBeenCalledExactlyOnceWith(35);
    expect(onError).not.toHaveBeenCalled(); expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('slider', { name: 'Позиция видео' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Воспроизвести' }));
    expect(provider.play).toHaveBeenCalledOnce();
    view.unmount(); expect(provider.destroy).toHaveBeenCalledOnce();
  });
  it('reports a second failure once without an automatic retry loop', async () => {
    mocks.create.mockRejectedValue({ code: 'HTTP_STATUS', status: 200, cause });
    const onError = vi.fn(); render(<CourseVideoPlayer src="https://kinescope.io/embed/fixture" kinescope onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it.each([
    { code: 'HTTP_STATUS', status: 403, cause },
    { code: 'HTTP_STATUS', status: 200, cause: { message: 'unrecognized failure' } },
  ])('does not recover permission or unknown failures (%j)', async error => {
    const monitor = vi.fn(); mocks.loadApi.mockResolvedValue({ create: mocks.create, monitor });
    mocks.create.mockRejectedValue(error); const onError = vi.fn();
    render(<CourseVideoPlayer src="https://kinescope.io/embed/fixture" kinescope onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledOnce()); expect(monitor).not.toHaveBeenCalled();
  });
  it('does not reconnect while the browser reports offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const monitor = vi.fn(); mocks.loadApi.mockResolvedValue({ create: mocks.create, monitor });
    mocks.create.mockRejectedValue({ code: 'HTTP_STATUS', status: 200, cause }); const onError = vi.fn();
    render(<CourseVideoPlayer src="https://kinescope.io/embed/fixture" kinescope onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledOnce()); expect(monitor).not.toHaveBeenCalled();
  });
});

describe('common native/HLS controls and progress', () => {
  it('uses custom controls, restores position and reports completion once', () => {
    const onSavePosition = vi.fn(); const onProgressChange = vi.fn(); const onVideoComplete = vi.fn();
    const view = render(<CourseVideoPlayer src="https://example.invalid/video.mp4" savedPosition={20}
      onSavePosition={onSavePosition} onProgressChange={onProgressChange} onVideoComplete={onVideoComplete} />);
    const video = view.container.querySelector('video')!;
    expect(video.controls).toBe(false);
    metadata(video);
    expect(video.currentTime).toBe(20);
    video.currentTime = 91; fireEvent.timeUpdate(video);
    video.currentTime = 95; fireEvent.timeUpdate(video);
    expect(onSavePosition).toHaveBeenLastCalledWith(95, 100);
    expect(onProgressChange).toHaveBeenLastCalledWith(95);
    expect(onVideoComplete).toHaveBeenCalledTimes(1);
  });

  it('wires play/pause, mute, volume, speed and seek to the same media element', () => {
    const view = render(<CourseVideoPlayer src="https://example.invalid/video.mp4" />);
    const video = view.container.querySelector('video')!; metadata(video);
    fireEvent.click(screen.getByRole('button', { name: 'Воспроизвести' }));
    expect(video.play).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Пауза' }));
    expect(video.pause).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Выключить звук' })); expect(video.muted).toBe(true);
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость' }), { target: { value: 0.4 } });
    expect(video.volume).toBe(0.4); expect(video.muted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Скорость воспроизведения' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скорость 1.5x' })); expect(video.playbackRate).toBe(1.5);
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: 50 } }); expect(video.currentTime).toBe(50);
    expect(view.container.querySelector('video')).toBe(video);
  });

  it('keeps the watched-position and normal-speed restrictions when seeking is disabled', () => {
    const onSavePosition = vi.fn(); const onVideoComplete = vi.fn();
    const view = render(<CourseVideoPlayer src="https://example.invalid/video.mp4" allowSeek={false} savedPosition={20}
      onSavePosition={onSavePosition} onVideoComplete={onVideoComplete} />);
    const video = view.container.querySelector('video')!; metadata(video);
    expect(screen.queryByRole('slider', { name: 'Позиция видео' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Скорость воспроизведения' })).not.toBeInTheDocument();
    video.currentTime = 90; fireEvent.seeking(video); expect(video.currentTime).toBe(20);
    video.currentTime = 90; fireEvent.timeUpdate(video); expect(video.currentTime).toBe(20);
    expect(onVideoComplete).not.toHaveBeenCalled(); expect(onSavePosition).not.toHaveBeenCalled();
    video.playbackRate = 2; fireEvent.rateChange(video); expect(video.playbackRate).toBe(1);
    video.currentTime = 21; fireEvent.timeUpdate(video); expect(onSavePosition).toHaveBeenCalledWith(21, 100);
  });

  it('changes fullscreen and allowSeek without reloading or replacing a playing video', async () => {
    const view = render(<CourseVideoPlayer src="https://example.invalid/video.mp4" />);
    const video = view.container.querySelector('video')!; metadata(video);
    fireEvent.play(video); video.currentTime = 30;
    const container = view.container.firstElementChild as HTMLElement;
    const request = vi.fn(async () => fullscreen(container));
    Object.defineProperty(container, 'requestFullscreen', { configurable: true, value: request });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: vi.fn(async () => fullscreen(null)) });
    fireEvent.click(screen.getByRole('button', { name: 'Полноэкранный режим' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Выйти из полноэкранного режима' }));
    view.rerender(<CourseVideoPlayer src="https://example.invalid/video.mp4" allowSeek={false} />);
    expect(view.container.querySelector('video')).toBe(video); expect(video.currentTime).toBe(30);
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeInTheDocument(); expect(video.load).not.toHaveBeenCalled();
  });

  it('retries the same native resource and restores the saved playback position', () => {
    const view = render(<CourseVideoPlayer src="https://example.invalid/video.mp4" />);
    const video = view.container.querySelector('video')!; metadata(video);
    video.currentTime = 40; fireEvent.timeUpdate(video); fireEvent.error(video);
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
    expect(video.load).toHaveBeenCalledTimes(1);
    video.currentTime = 0; metadata(video); expect(video.currentTime).toBe(40);
    expect(view.container.querySelector('video')).toBe(video);
  });

  it('initializes HLS once, reinitializes on retry and destroys/revokes on teardown', async () => {
    const objectUrl = vi.fn().mockReturnValue('blob:manifest'); const revoke = vi.fn();
    vi.stubGlobal('URL', class extends URL { static createObjectURL = objectUrl; static revokeObjectURL = revoke; });
    const view = render(<HlsVideoPlayer src="https://example.invalid/file.ts" />);
    await waitFor(() => expect(mocks.hlsInstances).toHaveLength(1));
    const first = mocks.hlsInstances[0]; const video = view.container.querySelector('video')!;
    expect(first.loadSource).toHaveBeenCalledWith('blob:manifest'); expect(first.attachMedia).toHaveBeenCalledWith(video);
    fullscreen(video.parentElement); expect(mocks.hlsInstances).toHaveLength(1);
    act(() => first.errorListener('error', { fatal: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
    await waitFor(() => expect(mocks.hlsInstances).toHaveLength(2));
    expect(first.destroy).toHaveBeenCalledTimes(1); expect(revoke).toHaveBeenCalledWith('blob:manifest');
    view.unmount(); expect(mocks.hlsInstances[1].destroy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('uses native HLS when the browser supports the manifest type', async () => {
    vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue('probably');
    const view = render(<HlsVideoPlayer src="https://example.invalid/master.m3u8" />);
    expect(view.container.querySelector('video')!.src).toBe('https://example.invalid/master.m3u8');
    expect(mocks.hlsInstances).toHaveLength(0);
  });
});

describe('Kinescope uses the same controls through the official API', () => {
  it('leaves navigation to the SDK even when its script resolves after the frame is mounted', async () => {
    let sdkReady!: (factory: any) => void;
    mocks.loadApi.mockReturnValue(new Promise(resolve => { sdkReady = resolve; }));
    const save = vi.fn(); const complete = vi.fn();
    const source = 'https://kinescope.io/embed/qa?drmauthtoken=qa-only';
    const view = render(<CourseVideoPlayer src={source} kinescope allowSeek={false}
      onSavePosition={save} onVideoComplete={complete} />);
    const frame = view.container.querySelector('iframe')!;
    // A preliminary document can answer the SDK handshake just before the
    // configured navigation replaces it, leaving a ready-looking dead channel.
    expect(frame.getAttribute('src')).toBeNull();
    mocks.create.mockImplementation(async (id, options) => {
      expect(document.getElementById(id)).toBe(frame);
      expect(frame.getAttribute('src')).toBeNull();
      expect(options.url).toBe(source);
      frame.src = options.url;
      return provider;
    });
    await act(async () => sdkReady({create:mocks.create}));
    await waitFor(() => expect(screen.getByRole('button', {name:'Воспроизвести'})).toBeEnabled());
    expect(view.container.querySelector('iframe')).toBe(frame);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
  });

  it('does not allow untracked iframe playback before the API is connected', () => {
    mocks.loadApi.mockReturnValue(new Promise(() => {}));
    const view = render(<CourseVideoPlayer src="https://kinescope.io/embed/qa" kinescope />);
    expect(view.container.querySelector('iframe')!.parentElement).toHaveClass('pointer-events-none');
    expect(screen.getByRole('button', {name:'Воспроизвести'})).toBeDisabled();
  });
  it('disables provider controls and wires shared buttons to the API', async () => {
    const view = render(<CourseVideoPlayer src="https://kinescope.io/embed/qa-video?drmauthtoken=qa" kinescope />);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Воспроизвести' })).toBeEnabled());
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ ui: { controls: false, mainPlayButton: true }, behavior: { keyboard: false, localStorage: false } });
    fireEvent.click(screen.getByRole('button', { name: 'Воспроизвести' })); expect(provider.play).toHaveBeenCalledTimes(1);
    await emit('Playing'); fireEvent.click(screen.getByRole('button', { name: 'Пауза' })); expect(provider.pause).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Выключить звук' })); expect(provider.mute).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость' }), { target: { value: 0.5 } }); expect(provider.setVolume).toHaveBeenCalledWith(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'Скорость воспроизведения' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скорость 2x' })); expect(provider.setPlaybackRate).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: 45 } }); expect(provider.seekTo).toHaveBeenCalledWith(45);
    expect(view.container.querySelector('[data-video-controls]')).toBeInTheDocument();
  });

  it('keeps a playing iframe/API instance on progress callbacks and fullscreen updates', async () => {
    const src = 'https://kinescope.io/embed/qa-video?drmauthtoken=qa';
    const view = render(<CourseVideoPlayer src={src} kinescope />);
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    const frame = view.container.querySelector('iframe')!;
    const originalSrc = frame.src;
    await emit('Playing'); await emit('TimeUpdate', { currentTime: 40 });
    fullscreen(frame.parentElement); fullscreen(null);
    view.rerender(<CourseVideoPlayer src={src} kinescope savedPosition={40} onSavePosition={() => {}} />);
    expect(view.container.querySelector('iframe')).toBe(frame); expect(frame.src).toBe(originalSrc);
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(provider.destroy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeInTheDocument();
    view.unmount(); expect(provider.destroy).toHaveBeenCalledTimes(1); expect(provider.off).toHaveBeenCalled();
  });

  it('does not require a programmatic volume change to initialize or play', async () => {
    const onError = vi.fn();
    provider.setVolume.mockRejectedValue(new DOMException('Hardware volume only', 'NotSupportedError'));
    render(<CourseVideoPlayer src="https://kinescope.io/embed/qa" kinescope onError={onError} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Воспроизвести' })).toBeEnabled());
    expect(provider.setVolume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Воспроизвести' }));
    await emit('Playing');
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(['reject', 'throw'])('keeps the same playing instance when optional volume %s fails', async mode => {
    const onError = vi.fn(); const save = vi.fn(); const complete = vi.fn();
    const failure = new DOMException('Hardware volume only', 'NotSupportedError');
    if (mode === 'throw') provider.setVolume.mockImplementation(() => { throw failure; });
    else provider.setVolume.mockRejectedValue(failure);
    const view = render(<CourseVideoPlayer src="https://kinescope.io/embed/qa" kinescope onError={onError} onSavePosition={save} onVideoComplete={complete} />);
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    const frame = view.container.querySelector('iframe');
    await emit('Playing');
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость' }), { target: { value: 0.5 } });
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Громкость' })).toBeDisabled());
    expect(view.container.querySelector('iframe')).toBe(frame);
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
  });

  it('keeps a direct iframe play target after browser gesture denial without relaxing seeking', async () => {
    const onError = vi.fn(); const complete = vi.fn(); const save = vi.fn();
    provider.play.mockRejectedValue(new DOMException('A user gesture is required', 'NotAllowedError'));
    const view = render(<CourseVideoPlayer src="https://kinescope.io/embed/qa" kinescope allowSeek={false}
      onError={onError} onSavePosition={save} onVideoComplete={complete} />);
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Воспроизвести' }));
    expect(await screen.findByText('Нажмите на видео, чтобы начать просмотр')).toBeInTheDocument();
    expect(view.container.querySelector('[data-video-direct-play]')).toHaveClass('pointer-events-none');
    expect(view.container.querySelector('iframe')!.parentElement).not.toHaveClass('pointer-events-none');
    expect(screen.queryByRole('button', { name: 'Область видео' })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Позиция видео' })).not.toBeInTheDocument();
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ ui: { controls: false, mainPlayButton: true }, behavior: { keyboard: false, localStorage: false, playbackRate: 1 } });
    expect(onError).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
    await emit('Playing');
    expect(screen.queryByText('Нажмите на видео, чтобы начать просмотр')).not.toBeInTheDocument();
    expect(view.container.querySelector('[data-video-direct-play]')).not.toBeInTheDocument();
    expect(view.container.querySelector('iframe')!.parentElement).toHaveClass('pointer-events-none');
    await emit('TimeUpdate', {currentTime: 90});
    expect(provider.seekTo).toHaveBeenLastCalledWith(0); expect(complete).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ['serialized name', { name: 'NotAllowedError', message: 'Playback requires activation' }],
    ['serialized text', 'NotAllowedError: The request is not allowed by the user agent'],
    ['WebKit message', { message: 'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.' }],
    ['generic Error', new Error('The request is not triggered by a user activation.')],
    ['Chromium message', "play() failed because the user didn't interact with the document first."],
  ])('preserves direct playback for a gesture denial from the iframe: %s', async (_label, reason) => {
    provider.play.mockRejectedValue(reason);
    const onError = vi.fn(); const save = vi.fn(); const complete = vi.fn();
    const view = render(<CourseVideoPlayer src="https://kinescope.io/embed/qa" kinescope allowSeek={false}
      onError={onError} onSavePosition={save} onVideoComplete={complete} />);
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    const frame = view.container.querySelector('iframe');
    fireEvent.click(screen.getByRole('button', {name:'Воспроизвести'}));
    expect(await screen.findByText('Нажмите на видео, чтобы начать просмотр')).toBeInTheDocument();
    expect(view.container.querySelector('iframe')).toBe(frame);
    expect(frame!.parentElement).not.toHaveClass('pointer-events-none');
    expect(screen.queryByText('Не удалось воспроизвести видео')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', {name:'Позиция видео'})).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
    await emit('Playing');
    expect(screen.queryByText('Нажмите на видео, чтобы начать просмотр')).not.toBeInTheDocument();
    await emit('Error', {error:{code:'MEDIA_ERR_DECODE',message:'Decoder unavailable'}});
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({stage:'provider-media',code:'MEDIA_ERR_DECODE'}));
  });

  it.each([
    new Error('Decoder unavailable'),
    'Playback failed',
    {name:'NotSupportedError',message:'The request is not triggered by a user activation.'},
    {message:'Token is not allowed'},
    null,
  ])('still reports real or unknown play failures with the specific operation stage: %s', async reason => {
    const onError = vi.fn(); provider.play.mockRejectedValue(reason);
    render(<CourseVideoPlayer src="https://kinescope.io/embed/qa" kinescope onError={onError} />);
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Воспроизвести' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({stage:'api-play'})));
    expect(screen.getByText('Не удалось воспроизвести видео')).toBeInTheDocument();
  });

  it('ignores delayed operation rejection from an old instance after retry', async () => {
    let rejectOld!: (reason: unknown) => void;
    provider.setVolume.mockReturnValue(new Promise((_, reject) => { rejectOld = reject; }));
    const onError = vi.fn();
    render(<CourseVideoPlayer src="https://kinescope.io/embed/qa" kinescope onError={onError} />);
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('slider', {name:'Громкость'}), {target:{value:0.5}});
    const next = makeProvider(); mocks.create.mockResolvedValueOnce(next);
    await emit('Error', {error:new Error('Media failure')});
    fireEvent.click(screen.getByRole('button', {name:'Попробовать снова'}));
    await waitFor(() => expect(next.on).toHaveBeenCalled());
    onError.mockClear();
    await act(async () => rejectOld(new Error('Late volume failure')));
    expect(screen.getByRole('slider', {name:'Громкость'})).toBeEnabled();
    expect(onError).not.toHaveBeenCalled();
    expect(screen.queryByText('Не удалось воспроизвести видео')).not.toBeInTheDocument();
  });

  it('does not apply a late play rejection to the next lesson player', async () => {
    let rejectOld!: (reason: unknown) => void;
    provider.play.mockReturnValue(new Promise((_, reject) => { rejectOld = reject; }));
    const onError = vi.fn();
    const view = render(<CourseVideoPlayer src="https://kinescope.io/embed/qa-a" kinescope onError={onError} />);
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', {name:'Воспроизвести'}));
    const next = makeProvider(); mocks.create.mockResolvedValueOnce(next);
    view.rerender(<CourseVideoPlayer src="https://kinescope.io/embed/qa-b" kinescope onError={onError} />);
    await waitFor(() => expect(next.on).toHaveBeenCalled());
    await act(async () => rejectOld(new Error('Late play failure')));
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {name:'Воспроизвести'})).toBeEnabled();
  });

  it('restores/tracks Kinescope playback while rejecting a jump ahead and a faster rate', async () => {
    const onSavePosition = vi.fn(); const onVideoComplete = vi.fn();
    render(<CourseVideoPlayer src="https://kinescope.io/embed/qa-video" kinescope allowSeek={false} savedPosition={20}
      onSavePosition={onSavePosition} onVideoComplete={onVideoComplete} />);
    await waitFor(() => expect(provider.seekTo).toHaveBeenCalledWith(20));
    await emit('TimeUpdate', { currentTime: 90 }); expect(provider.seekTo).toHaveBeenLastCalledWith(20);
    expect(onVideoComplete).not.toHaveBeenCalled(); expect(onSavePosition).not.toHaveBeenCalled();
    await emit('TimeUpdate', { currentTime: 21 }); expect(onSavePosition).toHaveBeenCalledWith(21, 100);
    await emit('PlaybackRateChange', { playbackRate: 2 }); expect(provider.setPlaybackRate).toHaveBeenCalledWith(1);
  });

  it('removes the old iframe safely when the provider destroy owns DOM removal', async () => {
    const view = render(<CourseVideoPlayer src="https://kinescope.io/embed/qa-video" kinescope />);
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    const frame = view.container.querySelector('iframe')!;
    provider.destroy.mockImplementation(async () => { frame.remove(); });
    expect(() => view.unmount()).not.toThrow(); expect(provider.destroy).toHaveBeenCalledTimes(1);
  });

  it('retries under a fresh API ID while destruction of the old instance is pending', async () => {
    const view = render(<CourseVideoPlayer src="https://kinescope.io/embed/qa-video" kinescope />);
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    const firstId = mocks.create.mock.calls[0][0];
    provider.destroy.mockReturnValue(new Promise(() => {}));
    const next = makeProvider(); mocks.create.mockResolvedValueOnce(next);
    await emit('Error'); fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1][0]).not.toBe(firstId);
    expect(view.container.querySelector('iframe')!.id).toBe(mocks.create.mock.calls[1][0]);
    expect(provider.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('error report action without playback mutations', () => {
  it('exposes the existing sanitized failure for diagnosis without changing the UI or leaking a signed URL', async () => {
    mocks.create.mockRejectedValue({code:403,message:'Denied https://kinescope.io/embed/qa?drmauthtoken=secret'});
    const view = render(<CourseVideoPlayer src="https://kinescope.io/embed/qa" kinescope />);
    await waitFor(() => expect(view.container.firstElementChild).toHaveAttribute('data-video-error-stage', 'api-create'));
    expect(view.container.firstElementChild).toHaveAttribute('data-video-error-code', '403');
    expect(view.container.firstElementChild).toHaveAttribute('data-video-error-message', 'Denied https://kinescope.io/embed/qa');
    expect(view.container.innerHTML).not.toContain('secret');
    expect(screen.getByText('Не удалось воспроизвести видео')).toBeInTheDocument();
  });
  const action = (report: (failure: unknown) => void) => (failure: unknown) =>
    <button onClick={() => report(failure)}>Report video</button>;
  it('offers a native report only after failure and preserves saved position/progress on click', () => {
    const report = vi.fn(); const progress = vi.fn(); const complete = vi.fn(); const save = vi.fn();
    const view = render(<CourseVideoPlayer src="https://example.invalid/private.mp4?token=secret" savedPosition={20}
      renderErrorAction={action(report)} onProgressChange={progress} onSavePosition={save} onVideoComplete={complete} />);
    const video = view.container.querySelector('video')!; metadata(video);
    progress.mockClear(); save.mockClear(); fireEvent.error(video);
    expect(report).not.toHaveBeenCalled(); fireEvent.click(screen.getByText('Report video'));
    expect(report).toHaveBeenCalledWith(expect.objectContaining({backend:'native',stage:'media'}));
    expect(progress).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(20);
  });
  it('offers the action for a fatal HLS error', async () => {
    const report = vi.fn();
    render(<CourseVideoPlayer src="https://example.invalid/master.m3u8" renderErrorAction={action(report)} />);
    await waitFor(() => expect(mocks.hlsInstances).toHaveLength(1));
    act(() => mocks.hlsInstances[0].errorListener('error', {fatal:true,type:'networkError',details:'manifestLoadError'}));
    fireEvent.click(screen.getByText('Report video'));
    expect(report).toHaveBeenCalledWith(expect.objectContaining({backend:'hls',stage:'media'}));
  });
  it('offers the action on Kinescope provider and API errors', async () => {
    const report = vi.fn();
    render(<CourseVideoPlayer src="https://kinescope.io/embed/qa" kinescope renderErrorAction={action(report)} />);
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    await emit('Error', {error: {code:403,message:'private'}});
    expect(report).not.toHaveBeenCalled(); fireEvent.click(screen.getByText('Report video'));
    expect(report).toHaveBeenCalledWith(expect.objectContaining({backend:'kinescope',stage:'provider-media',code:'403'}));
  });
  it('offers the action when the Kinescope API cannot load', async () => {
    const report = vi.fn(); mocks.loadApi.mockRejectedValue(new Error('script failed'));
    render(<CourseVideoPlayer src="https://kinescope.io/embed/qa" kinescope renderErrorAction={action(report)} />);
    fireEvent.click(await screen.findByText('Report video'));
    expect(report).toHaveBeenCalledWith(expect.objectContaining({backend:'kinescope',stage:'api-load'}));
  });
  it('offers a user-initiated report for a loading timeout without completing the lesson', () => {
    vi.useFakeTimers();
    try {
      const report = vi.fn(); const complete = vi.fn();
      render(<CourseVideoPlayer src="https://example.invalid/slow.mp4" renderErrorAction={action(report)} onVideoComplete={complete} />);
      act(() => vi.advanceTimersByTime(15000));
      expect(screen.getByText('Видео загружается слишком долго')).toBeInTheDocument();
      expect(report).not.toHaveBeenCalled(); fireEvent.click(screen.getByText('Report video'));
      expect(report).toHaveBeenCalledWith(expect.objectContaining({stage:'loading-timeout'}));
      expect(complete).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
