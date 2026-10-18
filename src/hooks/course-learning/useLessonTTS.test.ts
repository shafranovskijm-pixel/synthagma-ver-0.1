import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Lesson } from './types';

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(), toastError: vi.fn(), toastInfo: vi.fn(),
  native: false, getStatus: vi.fn(), speak: vi.fn(), stop: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
} }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, info: mocks.toastInfo } }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native, getPlatform: () => 'android' },
  registerPlugin: () => ({ getStatus: mocks.getStatus, speak: mocks.speak, stop: mocks.stop }),
}));
import { SALUTE_REQUEST_TIMEOUT_MS, useLessonTTS } from './useLessonTTS';
import { getStoredTTSSettings, saveTTSSettings } from '@/components/student/TTSSettingsDialog';
import { BROWSER_VOICES_WAIT_MS, SALUTE_SPEECH_CHUNK_SIZE, splitSpeechText } from '@/lib/browserSpeech';

const ru = { voiceURI: 'ru-one', name: 'Русский', lang: 'ru-RU', default: true } as SpeechSynthesisVoice;
let voices: SpeechSynthesisVoice[];
let utterances: SpeechSynthesisUtterance[];
let synth: EventTarget & { speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; getVoices: () => SpeechSynthesisVoice[] };
let audios: FakeAudio[];
let fetchMock: ReturnType<typeof vi.fn>;
let playMock: Mock<() => Promise<void>>;
let objectUrl: ReturnType<typeof vi.fn>;
let revokeUrl: ReturnType<typeof vi.fn>;
class FakeAudio {
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = () => playMock();
  constructor(public src: string) { audios.push(this); }
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flush = async () => { await act(async () => { for (let index = 0; index < 15; index++) await Promise.resolve(); }); };
const lesson = (id = 'lesson-1', content = 'Материал для чтения. '.repeat(25)): Lesson => ({ id, content, type: 'text', title: 'Урок', order_index: 0 });
const renderTTS = (initialLesson = lesson()) => renderHook(({ currentLesson }) => useLessonTTS({ currentLesson, currentLessonIndex: 0, contentBlocks: [], testQuestions: [] }), { initialProps: { currentLesson: initialLesson } });
const salute = () => saveTTSSettings({ provider: 'salutespeech', saluteVoice: 'Boris_24000' });
const response = () => ({ ok: true, blob: async () => new Blob(['audio'], { type: 'audio/ogg' }) });

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); mocks.native = false;
  mocks.maybeSingle.mockResolvedValue({ data: null });
  mocks.getStatus.mockResolvedValue({ available: true, reason: 'ready' });
  mocks.speak.mockImplementation(() => new Promise(() => {})); mocks.stop.mockResolvedValue(undefined);
  voices = [ru]; utterances = []; audios = [];
  synth = Object.assign(new EventTarget(), { speak: vi.fn(u => utterances.push(u)), cancel: vi.fn(), getVoices: () => voices });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  vi.stubGlobal('Audio', FakeAudio);
  fetchMock = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetchMock);
  playMock = vi.fn().mockResolvedValue(undefined);
  objectUrl = vi.fn().mockImplementation(() => `blob:audio-${objectUrl.mock.calls.length}`);
  revokeUrl = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: objectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('lesson speech lifecycle', () => {
  it('defaults to browser speech without a cloud call and preserves an explicit Sber choice', async () => {
    expect(getStoredTTSSettings({ provider: 'salutespeech' }).provider).toBe('browser');
    const { result } = renderTTS();
    act(() => result.current.speakText()); await flush();
    expect(result.current.isSpeaking).toBe(true); expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    salute(); expect(getStoredTTSSettings().provider).toBe('salutespeech');
  });

  it('does not let delayed admin defaults overwrite a user choice or interrupt playback', async () => {
    const admin = deferred<{ data: { provider: string; extra_config: { salute_voice: string } } }>();
    mocks.maybeSingle.mockReturnValue(admin.promise);
    const { result } = renderTTS();
    act(() => result.current.setTtsSettings({ provider: 'browser', saluteVoice: 'Boris_24000', browserVoiceURI: ru.voiceURI }));
    act(() => result.current.speakText()); await flush();
    admin.resolve({ data: { provider: 'salutespeech', extra_config: { salute_voice: 'marfa' } } }); await flush();
    expect(result.current.ttsSettings.saluteVoice).toBe('Boris_24000');
    expect(result.current.ttsSettings.browserVoiceURI).toBe(ru.voiceURI);
    expect(result.current.isSpeaking).toBe(true);
  });

  it('stops synchronously on a double click before the first voice callback', async () => {
    const { result } = renderTTS();
    act(() => { result.current.speakText(); result.current.speakText(); }); await flush();
    expect(result.current.isSpeaking).toBe(false); expect(synth.speak).not.toHaveBeenCalled();
  });

  it('cancels the old queue on lesson ID change even if its index stays zero', async () => {
    const { result, rerender } = renderTTS();
    act(() => result.current.speakText()); await flush();
    const oldEnd = utterances[0].onend;
    rerender({ currentLesson: lesson('lesson-2') });
    act(() => result.current.speakText()); await flush();
    oldEnd?.call(utterances[0], {} as SpeechSynthesisEvent); await flush();
    expect(utterances).toHaveLength(2); expect(result.current.isSpeaking).toBe(true);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on a voice change and unmount; late events cannot advance the queue', async () => {
    const { result, unmount } = renderTTS();
    act(() => result.current.speakText()); await flush();
    const firstEnd = utterances[0].onend;
    act(() => result.current.setTtsSettings(previous => ({ ...previous, browserVoiceURI: 'ru-two' })));
    firstEnd?.call(utterances[0], {} as SpeechSynthesisEvent); await flush();
    expect(result.current.isSpeaking).toBe(false); expect(utterances).toHaveLength(1);
    act(() => result.current.speakText()); await flush();
    const lastEnd = utterances[1].onend;
    unmount(); lastEnd?.call(utterances[1], {} as SpeechSynthesisEvent); await flush();
    expect(utterances).toHaveLength(2); expect(synth.cancel).toHaveBeenCalledTimes(2);
  });

  it('reports no Russian voice and returns the button to idle', async () => {
    vi.useFakeTimers(); voices = [];
    const { result } = renderTTS();
    act(() => result.current.speakText());
    await act(async () => { await vi.advanceTimersByTimeAsync(BROWSER_VOICES_WAIT_MS); });
    expect(result.current.isSpeaking).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('Русский голос не найден'));
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('reads a 20,000+ character Sber lesson sequentially without exceeding its endpoint limit', async () => {
    salute();
    const text = Array.from({ length: 700 }, (_, index) => `Раздел ${index}: учебный материал по безопасной работе.`).join(' ');
    expect(text.length).toBeGreaterThan(20000);
    const chunks = splitSpeechText(text, SALUTE_SPEECH_CHUNK_SIZE);
    const { result } = renderTTS(lesson('long', text));
    act(() => result.current.speakText()); await flush();
    for (let index = 0; index < chunks.length; index++) {
      expect(audios).toHaveLength(index + 1);
      expect(fetchMock).toHaveBeenCalledTimes(index + 1);
      expect(result.current.isSpeaking).toBe(true);
      act(() => audios[index].onended?.()); await flush();
    }
    expect(result.current.isSpeaking).toBe(false);
    const sent = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).text as string);
    expect(sent.every(chunk => chunk.length <= 4000)).toBe(true);
    expect(sent.join(' ')).toBe(text);
  });

  it('falls back after an HTTP error without overwriting the saved Sber provider', async () => {
    salute(); const saved = localStorage.getItem('tts-settings');
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const { result } = renderTTS();
    act(() => result.current.speakText()); await flush();
    expect(utterances).toHaveLength(1); expect(result.current.isSpeaking).toBe(true);
    expect(mocks.toastInfo).toHaveBeenCalledWith(expect.stringContaining('Продолжаем русским голосом'));
    expect(result.current.ttsSettings.provider).toBe('salutespeech');
    expect(localStorage.getItem('tts-settings')).toBe(saved);
    act(() => result.current.speakText()); await flush(); expect(result.current.isSpeaking).toBe(false);
  });

  it('falls back on a timeout and discards a late response without playing it', async () => {
    salute(); vi.useFakeTimers();
    const pending = deferred<ReturnType<typeof response>>(); fetchMock.mockReturnValue(pending.promise);
    const { result } = renderTTS(); act(() => result.current.speakText());
    await act(async () => { await vi.advanceTimersByTimeAsync(SALUTE_REQUEST_TIMEOUT_MS); });
    expect(utterances).toHaveLength(1);
    pending.resolve(response()); await flush();
    expect(audios).toHaveLength(0); expect(objectUrl).not.toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(true);
  });

  it.each(['stop', 'lesson', 'unmount'] as const)('ignores a late audio response after %s', async action => {
    salute(); const pending = deferred<ReturnType<typeof response>>(); fetchMock.mockReturnValue(pending.promise);
    const { result, rerender, unmount } = renderTTS(); act(() => result.current.speakText());
    if (action === 'stop') act(() => result.current.speakText());
    else if (action === 'lesson') rerender({ currentLesson: lesson('other') });
    else unmount();
    pending.resolve(response()); await flush();
    expect(audios).toHaveLength(0); expect(objectUrl).not.toHaveBeenCalled();
    expect(synth.speak).not.toHaveBeenCalled(); expect(mocks.toastInfo).not.toHaveBeenCalled();
  });

  it('discards a blob that finishes after stop', async () => {
    salute(); const blob = deferred<Blob>(); fetchMock.mockResolvedValue({ ok: true, blob: () => blob.promise });
    const { result } = renderTTS(); act(() => result.current.speakText()); await flush();
    act(() => result.current.speakText());
    blob.resolve(new Blob(['audio'], { type: 'audio/ogg' })); await flush();
    expect(audios).toHaveLength(0); expect(objectUrl).not.toHaveBeenCalled();
  });

  it('continues only the unread remainder when the second Sber chunk fails', async () => {
    salute(); const text = Array.from({ length: 150 }, (_, i) => `Абзац ${i}. Важный материал для обучения.`).join(' ');
    const chunks = splitSpeechText(text, SALUTE_SPEECH_CHUNK_SIZE);
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValue({ ok: false, status: 500 });
    const { result } = renderTTS(lesson('long', text));
    act(() => result.current.speakText()); await flush();
    act(() => audios[0].onended?.()); await flush();
    expect(utterances[0].text).toBe(splitSpeechText(chunks.slice(1).join(' '))[0]);
    expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
  });

  it('handles an audio play rejection and ignores late callbacks from a stopped player', async () => {
    salute(); const play = deferred<void>(); playMock.mockReturnValueOnce(play.promise);
    const { result } = renderTTS(); act(() => result.current.speakText()); await flush();
    const oldError = audios[0].onerror; const oldEnd = audios[0].onended;
    act(() => result.current.speakText());
    act(() => result.current.speakText()); await flush();
    play.reject(new Error('autoplay denied')); oldError?.(); oldEnd?.(); await flush();
    expect(audios).toHaveLength(2); expect(audios[0].pause).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(true); expect(mocks.toastInfo).not.toHaveBeenCalled();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('falls back on a current audio play rejection and invalidates that cached audio', async () => {
    salute(); playMock.mockRejectedValueOnce(new Error('autoplay denied'));
    const { result } = renderTTS(); act(() => result.current.speakText()); await flush();
    expect(utterances).toHaveLength(1); expect(revokeUrl).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(true);
  });

  it('uses Android native speech with no browser or cloud request', async () => {
    mocks.native = true; const { result } = renderTTS();
    act(() => result.current.speakText()); await flush();
    expect(result.current.ttsSettings.provider).toBe('native'); expect(mocks.speak).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled(); expect(synth.speak).not.toHaveBeenCalled();
  });
});
