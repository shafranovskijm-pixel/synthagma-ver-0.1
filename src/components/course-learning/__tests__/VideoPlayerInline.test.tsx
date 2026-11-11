import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayerInline } from '../VideoPlayerInline';

// Use the real video URL helpers: their time-dependent DRM token caused the reload.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const sdk = vi.hoisted(() => ({loadApi:vi.fn(),create:vi.fn()}));
vi.mock('@/components/video/kinescopeApi', async importOriginal => ({...await importOriginal<typeof import('@/components/video/kinescopeApi')>(),loadKinescopeApi:sdk.loadApi}));

const props = {
  content: 'kinescope:qa-video',
  userId: 'qa-student',
  courseId: 'qa-course',
  lessonId: 'qa-lesson',
};
let now: number;

function fullscreen(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element });
  fireEvent(document, new Event('fullscreenchange'));
}

function tokenPayload(frame: HTMLIFrameElement) {
  const token = new URL(frame.src).searchParams.get('drmauthtoken');
  return token ? JSON.parse(atob(token)) : null;
}

beforeEach(() => {
  sdk.create.mockReset().mockImplementation(async (id, options) => {
    document.getElementById(id)!.setAttribute('src', options.url);
    return {Events:{},on:vi.fn(),off:vi.fn(),getDuration:async()=>100,seekTo:async()=>{},setPlaybackRate:async()=>{},destroy:async()=>{}};
  });
  sdk.loadApi.mockReset().mockResolvedValue({create:sdk.create});
  now = Date.parse('2026-10-01T00:00:00Z');
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
});

describe('VideoPlayerInline playback continuity', () => {
  it('keeps the Kinescope iframe while the API loads when entering and leaving fullscreen', () => {
    sdk.loadApi.mockReturnValue(new Promise(() => {}));
    const view = render(<VideoPlayerInline {...props} />);
    const frame = view.container.querySelector('iframe')!;
    const originalSrc = frame.src;

    now += 1_000;
    fullscreen(frame);
    expect(view.container.querySelector('iframe')).toBe(frame);
    expect(frame.src).toBe(originalSrc);

    now += 1_000;
    fullscreen(null);
    expect(frame.src).toBe(originalSrc);
  });

  it('keeps the Kinescope frame while the API loads during ordinary parent progress updates', () => {
    sdk.loadApi.mockReturnValue(new Promise(() => {}));
    const view = render(<VideoPlayerInline {...props} savedPosition={10} />);
    const frame = view.container.querySelector('iframe')!;
    const originalSrc = frame.src;

    now += 30_000;
    view.rerender(<VideoPlayerInline {...props} savedPosition={40} onProgressChange={() => {}} />);
    expect(view.container.querySelector('iframe')).toBe(frame);
    expect(frame.src).toBe(originalSrc);
  });

  it.each(['userId', 'courseId'] as const)('refreshes the token when %s changes', async key => {
    const view = render(<VideoPlayerInline {...props} />);
    await waitFor(() => expect(view.container.querySelector('iframe')!.src).toContain('drmauthtoken='));
    const originalSrc = view.container.querySelector('iframe')!.src;
    now += 1_000;

    view.rerender(<VideoPlayerInline {...props} {...{ [key]: `${key}-new` }} />);
    const frame = view.container.querySelector('iframe')!;
    await waitFor(() => expect(frame.src).toContain('drmauthtoken='));
    expect(frame.src).not.toBe(originalSrc);
    expect(tokenPayload(frame)).toMatchObject({
      userId: key === 'userId' ? 'userId-new' : props.userId,
      courseId: key === 'courseId' ? 'courseId-new' : props.courseId,
    });
  });

  it('loads a different video when the lesson content changes', async () => {
    const view = render(<VideoPlayerInline {...props} />);
    now += 1_000;
    view.rerender(<VideoPlayerInline {...props} content="kinescope:next-video" />);
    await waitFor(() => expect(view.container.querySelector('iframe')!.src).toContain('/embed/next-video'));
    expect(new URL(view.container.querySelector('iframe')!.src).pathname).toBe('/embed/next-video');
  });

  it('removes the previous learner token when the authenticated context disappears', async () => {
    const view = render(<VideoPlayerInline {...props} />);
    view.rerender(<VideoPlayerInline {...props} userId={undefined} />);
    await waitFor(() => expect(view.container.querySelector('iframe')!.src).toContain('/embed/qa-video'));
    expect(tokenPayload(view.container.querySelector('iframe')!)).toBeNull();
  });

  it('preserves the native video element and playing state on fullscreen changes', () => {
    const view = render(<VideoPlayerInline {...props} content="https://example.invalid/lesson.mp4" />);
    const video = view.container.querySelector('video')!;
    fireEvent.play(video);
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeInTheDocument();

    fullscreen(video.parentElement);
    expect(view.container.querySelector('video')).toBe(video);
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeInTheDocument();
    fullscreen(null);
    expect(view.container.querySelector('video')).toBe(video);
  });
});
