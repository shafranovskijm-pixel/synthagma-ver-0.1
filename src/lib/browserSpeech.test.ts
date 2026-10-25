import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_SPEECH_CHUNK_SIZE, BROWSER_VOICES_WAIT_MS, MISSING_RUSSIAN_VOICE, speakBrowserText, splitSpeechText, waitForRussianVoice } from './browserSpeech.ts';

const russian = { voiceURI: 'ru-one', name: 'Русский', lang: 'ru-RU', default: false } as SpeechSynthesisVoice;
const english = { voiceURI: 'en-one', name: 'English', lang: 'en-US', default: true } as SpeechSynthesisVoice;
let voices: SpeechSynthesisVoice[];
let synth: EventTarget & { speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; getVoices: () => SpeechSynthesisVoice[] };
let utterances: SpeechSynthesisUtterance[];
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

beforeEach(() => {
  voices = [english, russian]; utterances = [];
  synth = Object.assign(new EventTarget(), {
    speak: vi.fn(utterance => utterances.push(utterance)), cancel: vi.fn(), getVoices: () => voices,
  });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Russian browser speech queue', () => {
  it('reads all of a 20,000+ character lesson in bounded sequential chunks', async () => {
    const text = 'Длинный учебный материал. Важны безопасность и последовательность. '.repeat(360).trim();
    expect(text.length).toBeGreaterThan(20000);
    let completed = false;
    const promise = speakBrowserText(text, new AbortController().signal).then(() => { completed = true; });
    await flush();
    expect(utterances).toHaveLength(1);
    for (let index = 0; !completed; index++) {
      expect(index).toBeLessThan(1000);
      expect(utterances).toHaveLength(index + 1);
      const utterance = utterances[index];
      expect(utterance.text.length).toBeLessThanOrEqual(BROWSER_SPEECH_CHUNK_SIZE);
      expect(utterance.voice).toBe(russian);
      utterance.onend?.({} as SpeechSynthesisEvent);
      await flush();
    }
    await promise;
    expect(utterances.map(u => u.text).join(' ')).toBe(text);
  });

  it('keeps all characters and surrogate pairs in a word longer than the chunk size', () => {
    const text = 'Я'.repeat(179) + '😀'.repeat(200);
    const chunks = splitSpeechText(text);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every(chunk => chunk.length <= BROWSER_SPEECH_CHUNK_SIZE && !/[\uD800-\uDBFF]$/.test(chunk))).toBe(true);
  });

  it('waits for an asynchronously loaded Russian voice instead of using English', async () => {
    voices = [english];
    const promise = speakBrowserText('Русский текст', new AbortController().signal);
    await flush(); expect(synth.speak).not.toHaveBeenCalled();
    voices.push(russian); synth.dispatchEvent(new Event('voiceschanged'));
    await flush(); expect(utterances[0].voice).toBe(russian);
    utterances[0].onend?.({} as SpeechSynthesisEvent);
    await promise;
  });

  it('uses the explicitly selected Russian voice and never a selected English voice', async () => {
    const second = { ...russian, voiceURI: 'ru-two', name: 'Другой русский' } as SpeechSynthesisVoice;
    voices.push(second);
    expect(await waitForRussianVoice(new AbortController().signal, second.voiceURI)).toBe(second);
    expect(await waitForRussianVoice(new AbortController().signal, english.voiceURI)).toBe(russian);
  });

  it('reports missing Russian voices after a bounded wait without starting English speech', async () => {
    vi.useFakeTimers(); voices = [english];
    const outcome = speakBrowserText('Текст', new AbortController().signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(BROWSER_VOICES_WAIT_MS);
    expect((await outcome).message).toBe(MISSING_RUSSIAN_VOICE);
    voices.push(russian); synth.dispatchEvent(new Event('voiceschanged')); await flush();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('cancels voice discovery without reacting to later voiceschanged events', async () => {
    voices = []; const controller = new AbortController();
    const outcome = speakBrowserText('Текст', controller.signal).catch(error => error);
    controller.abort(); voices.push(russian); synth.dispatchEvent(new Event('voiceschanged'));
    expect((await outcome).name).toBe('AbortError');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('stops the current utterance and ignores a saved late end callback', async () => {
    const controller = new AbortController();
    const outcome = speakBrowserText('Длинный русский урок. '.repeat(1000), controller.signal).catch(error => error);
    await flush(); const lateEnd = utterances[0].onend;
    controller.abort(); lateEnd?.call(utterances[0], {} as SpeechSynthesisEvent); await flush();
    expect((await outcome).name).toBe('AbortError');
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(utterances).toHaveLength(1);
  });

  it('stops the queue on a synthesis error and reports unsupported browsers', async () => {
    const outcome = speakBrowserText('Материал. '.repeat(500), new AbortController().signal).catch(error => error);
    await flush(); utterances[0].onerror?.({ error: 'synthesis-failed' } as SpeechSynthesisErrorEvent);
    expect((await outcome).message).toContain('Не удалось прочитать');
    expect(utterances).toHaveLength(1);
    vi.stubGlobal('speechSynthesis', undefined);
    await expect(speakBrowserText('Текст', new AbortController().signal)).rejects.toThrow('не поддерживает');
  });
});
