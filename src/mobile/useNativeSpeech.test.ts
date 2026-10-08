import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getStatus: vi.fn(), speak: vi.fn(), stop: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  registerPlugin: () => mocks,
}));
import { useNativeSpeech } from './useNativeSpeech';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getStatus.mockResolvedValue({ available: true, reason: 'ready', voiceName: 'test-ru' });
  mocks.speak.mockResolvedValue({ completed: true });
  mocks.stop.mockResolvedValue(undefined);
});

it('does not call speech or claim speaking success when the engine is absent', async () => {
  mocks.getStatus.mockResolvedValue({ available: false, reason: 'no_engine' });
  const onError = vi.fn();
  const { result } = renderHook(() => useNativeSpeech(true, 'lesson-1', onError));
  await act(async () => result.current.toggle('Учебный текст'));
  expect(mocks.speak).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('не установлен синтезатор'));
  expect(result.current.isSpeaking).toBe(false);
});

it('stops active playback on a lesson change and ignores its late completion', async () => {
  let finish!: (value: { completed: boolean }) => void;
  mocks.speak.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(({ lesson }) => useNativeSpeech(true, lesson, vi.fn()), { initialProps: { lesson: 'one' } });
  act(() => { void result.current.toggle('Учебный текст'); });
  await waitFor(() => expect(mocks.speak).toHaveBeenCalledTimes(1));
  expect(result.current.isSpeaking).toBe(true);
  rerender({ lesson: 'two' });
  expect(mocks.stop).toHaveBeenCalled();
  expect(result.current.isSpeaking).toBe(false);
  await act(async () => finish({ completed: false }));
  expect(result.current.isSpeaking).toBe(false);
});

it('does not start delayed initialization after stop or unmount', async () => {
  let ready!: (value: { available: boolean; reason: string }) => void;
  mocks.getStatus.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
  const { result, unmount } = renderHook(() => useNativeSpeech(true, 'one', vi.fn()));
  act(() => { void result.current.toggle('Учебный текст'); });
  unmount();
  await act(async () => ready({ available: true, reason: 'ready' }));
  expect(mocks.speak).not.toHaveBeenCalled();
  expect(mocks.stop).toHaveBeenCalled();
});

it('stops when the document goes into the background', async () => {
  mocks.speak.mockImplementation(() => new Promise(() => undefined));
  const { result } = renderHook(() => useNativeSpeech(true, 'one', vi.fn()));
  act(() => { void result.current.toggle('Учебный текст'); });
  await waitFor(() => expect(mocks.speak).toHaveBeenCalled());
  const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(mocks.stop).toHaveBeenCalled();
  expect(result.current.isSpeaking).toBe(false);
  state.mockRestore();
});
