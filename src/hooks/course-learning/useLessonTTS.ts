import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TTSSettings, getStoredTTSSettings, saveTTSSettings, AdminTTSDefaults } from "@/components/student/TTSSettingsDialog";
import type { ContentBlock } from "@/components/course-builder/block-editor";
import type { Lesson, TestQuestion } from "./types";
import { getOptionText } from "./types";
import { useNativeSpeech } from '@/mobile/useNativeSpeech';
import { isNativeSpeechPlatform } from '@/mobile/nativeSpeech';
import { speakBrowserText, splitSpeechText, SALUTE_SPEECH_CHUNK_SIZE } from '@/lib/browserSpeech';

export const SALUTE_REQUEST_TIMEOUT_MS = 15000;
const abortError = () => new DOMException('Speech cancelled', 'AbortError');

/** Bound both response and body loading; a late response cannot restart playback. */
async function fetchSaluteAudio(text: string, voice: string, signal: AbortSignal): Promise<Blob> {
  if (signal.aborted) throw abortError();
  const request = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let onAbort: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => { request.abort(); reject(abortError()); };
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { request.abort(); reject(new Error('SaluteSpeech не ответил вовремя')); }, SALUTE_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([interrupted, (async () => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ text, voice }),
        signal: request.signal,
      });
      if (request.signal.aborted) throw abortError();
      if (!response.ok) throw new Error(`SaluteSpeech недоступен (${response.status})`);
      const blob = await response.blob();
      if (request.signal.aborted) throw abortError();
      if (!blob.size || !blob.type.startsWith('audio/')) throw new Error('SaluteSpeech вернул пустой или неверный аудиофайл');
      return blob;
    })()]);
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener('abort', onAbort!);
  }
}

function playAudio(url: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(startTimer);
      signal.removeEventListener('abort', onAbort);
      audio.onplaying = null; audio.onended = null; audio.onerror = null;
      audio.pause(); audio.src = '';
      if (error) reject(error); else resolve();
    };
    const onAbort = () => finish(abortError());
    const startTimer = setTimeout(() => finish(new Error('Не удалось начать воспроизведение')), SALUTE_REQUEST_TIMEOUT_MS);
    audio.onplaying = () => clearTimeout(startTimer);
    audio.onended = () => finish(signal.aborted ? abortError() : undefined);
    audio.onerror = () => finish(new Error('Ошибка воспроизведения SaluteSpeech'));
    signal.addEventListener('abort', onAbort, { once: true });
    try { void audio.play().then(() => clearTimeout(startTimer), error => finish(error instanceof Error ? error : new Error('Ошибка воспроизведения'))); }
    catch (error) { finish(error instanceof Error ? error : new Error('Ошибка воспроизведения')); }
  });
}

interface UseLessonTTSParams {
  currentLesson: Lesson | undefined;
  currentLessonIndex: number;
  contentBlocks: ContentBlock[];
  testQuestions: TestQuestion[];
}

export function useLessonTTS({ currentLesson, currentLessonIndex, contentBlocks, testQuestions }: UseLessonTTSParams) {
  const [ttsSettingsOpen, setTtsSettingsOpen] = useState(false);
  const [ttsSettings, updateSettings] = useState<TTSSettings>(() => getStoredTTSSettings());
  const interactedRef = useRef(false);
  const sessionRef = useRef<AbortController | null>(null);
  const [isWebSpeaking, setIsWebSpeaking] = useState(false);
  const saluteCacheRef = useRef<Map<string, string>>(new Map());
  const nativeSpeech = useNativeSpeech(ttsSettings.provider === 'native', currentLesson?.id ?? currentLessonIndex, message => toast.error(message));

  const stopWebSpeech = useCallback((updateUi = true) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.abort();
    if (updateUi) setIsWebSpeaking(false);
  }, []);
  const setTtsSettings: Dispatch<SetStateAction<TTSSettings>> = useCallback(settings => {
    interactedRef.current = true;
    stopWebSpeech();
    updateSettings(settings);
  }, [stopWebSpeech]);

  // Load admin TTS defaults
  useEffect(() => {
    let disposed = false;
    const TTS_KEY = 'tts-settings';
    if (localStorage.getItem(TTS_KEY)) return;
    (async () => {
      try {
        const { data } = await supabase.from('ai_settings').select('provider, extra_config').eq('context', 'tts').maybeSingle();
        if (!data || disposed || interactedRef.current || localStorage.getItem(TTS_KEY)) return;
        const ec = data.extra_config as Record<string, unknown> | null;
        const adminDefaults: AdminTTSDefaults = {
          provider: data.provider || undefined,
          saluteVoice: (ec?.salute_voice as string) || undefined,
        };
        updateSettings(getStoredTTSSettings(adminDefaults));
      } catch { /* fallback to defaults */ }
    })();
    return () => { disposed = true; };
  }, []);

  const isSpeaking = ttsSettings.provider === 'native' ? nativeSpeech.isSpeaking : isWebSpeaking;

  const extractTextFromBlocks = (blocks: ContentBlock[]): string => {
    return blocks.map(block => {
      switch (block.type) {
        case 'paragraph': case 'heading1': case 'heading2': case 'quote':
        case 'callout-info': case 'callout-warning': case 'callout-tip':
          return block.content?.replace(/<[^>]*>/g, '') || '';
        case 'bulletList': case 'numberedList':
          return (block.content || '').split('\n').filter(Boolean).join('. ');
        case 'accordion':
          return `${block.accordionTitle || ''}. ${block.content || ''}`;
        case 'quiz':
          return `Вопрос: ${block.quizQuestion || ''}`;
        default:
          return '';
      }
    }).filter(Boolean).join('. ');
  };

  const getTextToSpeak = (): string => {
    if (!currentLesson) return '';
    if (currentLesson.type === 'text') {
      return contentBlocks.length > 0
        ? extractTextFromBlocks(contentBlocks)
        : currentLesson.content?.replace(/<[^>]*>/g, '').replace(/\n/g, '. ') || '';
    }
    if (currentLesson.type === 'test') {
      return testQuestions.map((q, i) => {
        const options = Array.isArray(q.options) ? q.options : [];
        const optionsText = options.map((opt, j) => `${j + 1}. ${getOptionText(opt)}`).join('. ');
        return `Вопрос ${i + 1}: ${q.question}. Варианты ответа: ${optionsText}`;
      }).join('. ');
    }
    return '';
  };

  const speakText = () => {
    interactedRef.current = true;
    if (sessionRef.current) { stopWebSpeech(); return; }
    if (!currentLesson) return;
    const text = getTextToSpeak().trim();
    if (!text) { toast.error('Нет текста для озвучивания'); return; }
    if (ttsSettings.provider === 'native') { void nativeSpeech.toggle(text); return; }

    const session = new AbortController();
    sessionRef.current = session;
    setIsWebSpeaking(true);
    const current = () => sessionRef.current === session && !session.signal.aborted;
    void (async () => {
      try {
        if (ttsSettings.provider === 'browser') {
          await speakBrowserText(text, session.signal, ttsSettings.browserVoiceURI);
          return;
        }
        const chunks = splitSpeechText(text, SALUTE_SPEECH_CHUNK_SIZE);
        for (let index = 0; index < chunks.length; index++) {
          if (!current()) return;
          const cacheKey = `${ttsSettings.saluteVoice}:${chunks[index]}`;
          try {
            let url = saluteCacheRef.current.get(cacheKey);
            if (!url) {
              const blob = await fetchSaluteAudio(chunks[index], ttsSettings.saluteVoice, session.signal);
              if (!current()) return;
              url = URL.createObjectURL(blob);
              saluteCacheRef.current.set(cacheKey, url);
              // Bound memory retained by long lessons and repeated voice changes.
              if (saluteCacheRef.current.size > 16) {
                const oldest = saluteCacheRef.current.keys().next().value!;
                URL.revokeObjectURL(saluteCacheRef.current.get(oldest)!);
                saluteCacheRef.current.delete(oldest);
              }
            }
            if (!current()) return;
            await playAudio(url, session.signal);
          } catch (error) {
            if (!current()) return;
            const failedUrl = saluteCacheRef.current.get(cacheKey);
            if (failedUrl) { URL.revokeObjectURL(failedUrl); saluteCacheRef.current.delete(cacheKey); }
            if (isNativeSpeechPlatform()) {
              toast.error('Ошибка озвучивания SaluteSpeech', {
                description: 'Можно использовать установленный русский голос Android.',
                action: { label: 'Голос Android', onClick: () => {
                  const next: TTSSettings = { ...ttsSettings, provider: 'native' };
                  setTtsSettings(next); saveTTSSettings(next); setTtsSettingsOpen(true);
                } },
              });
              return;
            }
            // Fall back only for this session, preserving the user's provider choice.
            toast.info('SaluteSpeech недоступен. Продолжаем русским голосом браузера.');
            await speakBrowserText(chunks.slice(index).join(' '), session.signal, ttsSettings.browserVoiceURI);
            return;
          }
        }
      } catch (error) {
        if (current()) toast.error(error instanceof Error ? error.message : 'Ошибка озвучивания');
      } finally {
        if (current()) { sessionRef.current = null; setIsWebSpeaking(false); }
      }
    })();
  };

  // A lesson may change without its index changing (for example another course).
  useEffect(() => { stopWebSpeech(); }, [currentLesson?.id, currentLessonIndex, ttsSettings.provider, ttsSettings.saluteVoice, ttsSettings.browserVoiceURI, stopWebSpeech]);
  useEffect(() => () => {
    stopWebSpeech(false);
    saluteCacheRef.current.forEach(url => URL.revokeObjectURL(url));
    saluteCacheRef.current.clear();
  }, [stopWebSpeech]);
  return {
    ttsSettingsOpen, setTtsSettingsOpen,
    ttsSettings, setTtsSettings,
    isSpeaking, speakText,
  };
}
