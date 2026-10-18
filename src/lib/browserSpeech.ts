/** Small utterances avoid the long-utterance stalls of browser speech engines. */
export const BROWSER_SPEECH_CHUNK_SIZE = 180;
export const SALUTE_SPEECH_CHUNK_SIZE = 3800;
export const BROWSER_VOICES_WAIT_MS = 1500;

export function splitSpeechText(text: string, limit = BROWSER_SPEECH_CHUNK_SIZE): string[] {
  if (!Number.isInteger(limit) || limit < 2) throw new Error('Invalid speech chunk size');
  let remaining = text.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  while (remaining.length > limit) {
    const head = remaining.slice(0, limit + 1);
    const sentenceEnds = [...head.matchAll(/[.!?;:]\s/g)];
    let end = sentenceEnds.length ? sentenceEnds[sentenceEnds.length - 1].index! + 1 : head.lastIndexOf(' ');
    if (end < limit / 3) end = limit;
    // Do not cut a surrogate pair in a long word with no whitespace.
    if (end === limit && /[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function browserSpeechSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.speechSynthesis)
    && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function getRussianBrowserVoices(): SpeechSynthesisVoice[] {
  if (!browserSpeechSupported()) return [];
  try {
    return window.speechSynthesis.getVoices().filter((voice, index, all) =>
      /^ru(?:[-_]|$)/i.test(voice.lang)
      && all.findIndex(other => other.voiceURI === voice.voiceURI) === index);
  } catch { return []; }
}

export const MISSING_RUSSIAN_VOICE = 'Русский голос не найден. Установите русский голос в настройках речи устройства или выберите другой браузер.';
const aborted = () => new DOMException('Speech cancelled', 'AbortError');

export function waitForRussianVoice(signal: AbortSignal, preferredVoiceURI?: string): Promise<SpeechSynthesisVoice> {
  if (signal.aborted) return Promise.reject(aborted());
  if (!browserSpeechSupported()) return Promise.reject(new Error('Этот браузер не поддерживает озвучивание. Откройте урок в браузере с синтезатором речи.'));
  const choose = () => {
    const voices = getRussianBrowserVoices();
    return voices.find(voice => voice.voiceURI === preferredVoiceURI)
      ?? voices.find(voice => voice.default) ?? voices[0];
  };
  const available = choose();
  if (available) return Promise.resolve(available);
  return new Promise((resolve, reject) => {
    const synth = window.speechSynthesis;
    const cleanup = () => {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', onVoices);
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => { cleanup(); reject(aborted()); };
    const onVoices = () => {
      const voice = choose();
      if (voice) { cleanup(); resolve(voice); }
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error(MISSING_RUSSIAN_VOICE)); }, BROWSER_VOICES_WAIT_MS);
    synth.addEventListener('voiceschanged', onVoices);
    signal.addEventListener('abort', onAbort, { once: true });
    // A voice list may have become available while the listeners were attached.
    onVoices();
  });
}

export async function speakBrowserText(text: string, signal: AbortSignal, preferredVoiceURI?: string): Promise<void> {
  const voice = await waitForRussianVoice(signal, preferredVoiceURI);
  for (const chunk of splitSpeechText(text)) {
    if (signal.aborted) throw aborted();
    await new Promise<void>((resolve, reject) => {
      const synth = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 1;
      utterance.pitch = 1;
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        utterance.onend = null;
        utterance.onerror = null;
        if (error) reject(error); else resolve();
      };
      const onAbort = () => { finish(aborted()); synth.cancel(); };
      utterance.onend = () => finish(signal.aborted ? aborted() : undefined);
      utterance.onerror = () => finish(signal.aborted ? aborted() : new Error('Не удалось прочитать текст выбранным голосом. Проверьте настройки озвучивания.'));
      signal.addEventListener('abort', onAbort, { once: true });
      try { synth.speak(utterance); } catch (error) { finish(error instanceof Error ? error : new Error('Ошибка озвучивания')); }
    });
  }
}
