import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseVideoPlayer } from '../CourseVideoPlayer';
import { HlsVideoPlayer } from '../HlsVideoPlayer';
import type { KinescopeEvent } from '../kinescopeApi';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const mocks = vi.hoisted(() => ({ create: vi.fn(), loadApi: vi.fn(), hlsInstances: [] as Array<any> }));
vi.mock('../kinescopeApi', () => ({ loadKinescopeApi: mocks.loadApi }));
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
  it('disables provider controls and wires shared buttons to the API', async () => {
    const view = render(<CourseVideoPlayer src="https://kinescope.io/embed/qa-video?drmauthtoken=qa" kinescope />);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Воспроизвести' })).toBeEnabled());
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ ui: { controls: false, mainPlayButton: false }, behavior: { keyboard: false, localStorage: false } });
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
