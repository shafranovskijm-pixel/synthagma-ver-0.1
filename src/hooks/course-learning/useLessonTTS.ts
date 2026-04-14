import { useState, useEffect, useRef, useCallback } from "react";
import { useElevenLabsTTS } from "@/hooks/useElevenLabsTTS";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TTSSettings, getStoredTTSSettings, AdminTTSDefaults } from "@/components/student/TTSSettingsDialog";
import type { ContentBlock } from "@/components/course-builder/BlockEditor";
import type { Lesson, TestQuestion } from "./types";
import { getOptionText } from "./types";

interface UseLessonTTSParams {
  currentLesson: Lesson | undefined;
  currentLessonIndex: number;
  contentBlocks: ContentBlock[];
  testQuestions: TestQuestion[];
}

export function useLessonTTS({ currentLesson, currentLessonIndex, contentBlocks, testQuestions }: UseLessonTTSParams) {
  const [ttsSettingsOpen, setTtsSettingsOpen] = useState(false);
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(() => getStoredTTSSettings());
  const adminDefaultsLoaded = useRef(false);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [isBrowserSpeaking, setIsBrowserSpeaking] = useState(false);
  const [isSaluteSpeaking, setIsSaluteSpeaking] = useState(false);
  const [isSaluteLoading, setIsSaluteLoading] = useState(false);
  const saluteAudioRef = useRef<HTMLAudioElement | null>(null);
  const saluteAbortRef = useRef<AbortController | null>(null);
  const saluteCacheRef = useRef<Map<string, string>>(new Map());

  const elevenLabsTTS = useElevenLabsTTS({ voiceId: ttsSettings.voiceId });

  // Load admin TTS defaults
  useEffect(() => {
    if (adminDefaultsLoaded.current) return;
    adminDefaultsLoaded.current = true;
    const TTS_KEY = 'tts-settings';
    if (localStorage.getItem(TTS_KEY)) return;
    (async () => {
      try {
        const { data } = await supabase.from('ai_settings').select('provider, extra_config').eq('context', 'tts').maybeSingle();
        if (!data) return;
        const ec = data.extra_config as Record<string, unknown> | null;
        const adminDefaults: AdminTTSDefaults = {
          provider: data.provider || undefined,
          saluteVoice: (ec?.salute_voice as string) || undefined,
        };
        setTtsSettings(getStoredTTSSettings(adminDefaults));
      } catch { /* fallback to defaults */ }
    })();
  }, []);

  const isSpeaking = ttsSettings.provider === 'elevenlabs'
    ? elevenLabsTTS.isActive
    : ttsSettings.provider === 'salutespeech'
      ? (isSaluteSpeaking || isSaluteLoading)
      : isBrowserSpeaking;

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

  const stopSaluteSpeech = useCallback(() => {
    if (saluteAbortRef.current) { saluteAbortRef.current.abort(); saluteAbortRef.current = null; }
    if (saluteAudioRef.current) { saluteAudioRef.current.pause(); saluteAudioRef.current.src = ''; saluteAudioRef.current = null; }
    setIsSaluteSpeaking(false);
    setIsSaluteLoading(false);
  }, []);

  const speakSalute = useCallback(async (text: string) => {
    if (isSaluteSpeaking || isSaluteLoading) { stopSaluteSpeech(); return; }
    const hashText = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return h.toString(36); };
    const cacheKey = `${ttsSettings.saluteVoice}:${hashText(text)}`;
    const cached = saluteCacheRef.current.get(cacheKey);

    if (cached) {
      const audio = new Audio(cached);
      saluteAudioRef.current = audio;
      audio.onplay = () => { setIsSaluteLoading(false); setIsSaluteSpeaking(true); };
      audio.onended = () => { setIsSaluteSpeaking(false); };
      audio.onerror = () => { setIsSaluteSpeaking(false); toast.error('Ошибка воспроизведения'); };
      setIsSaluteLoading(true);
      await audio.play();
      return;
    }

    setIsSaluteLoading(true);
    saluteAbortRef.current = new AbortController();
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ text, voice: ttsSettings.saluteVoice }),
          signal: saluteAbortRef.current.signal,
        }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || `Ошибка SaluteSpeech: ${response.status}`);
        setIsSaluteLoading(false);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      saluteCacheRef.current.set(cacheKey, url);
      const audio = new Audio(url);
      saluteAudioRef.current = audio;
      audio.onplay = () => { setIsSaluteLoading(false); setIsSaluteSpeaking(true); };
      audio.onended = () => { setIsSaluteSpeaking(false); };
      audio.onerror = () => { setIsSaluteSpeaking(false); setIsSaluteLoading(false); toast.error('Ошибка воспроизведения'); };
      await audio.play();
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      toast.error('Ошибка озвучивания SaluteSpeech');
      setIsSaluteLoading(false);
    }
  }, [ttsSettings.saluteVoice, isSaluteSpeaking, isSaluteLoading, stopSaluteSpeech]);

  const speakText = () => {
    if (!currentLesson) return;
    const textToSpeak = getTextToSpeak();
    if (!textToSpeak) { toast.error('Нет текста для озвучивания'); return; }

    if (ttsSettings.provider === 'elevenlabs') {
      elevenLabsTTS.speak(textToSpeak);
    } else if (ttsSettings.provider === 'salutespeech') {
      speakSalute(textToSpeak);
    } else {
      if (isBrowserSpeaking) { window.speechSynthesis?.cancel(); setIsBrowserSpeaking(false); return; }
      if (!('speechSynthesis' in window)) { toast.error('Озвучивание не поддерживается'); return; }
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'ru-RU'; utterance.rate = 1.0; utterance.pitch = 1.0;
      const voices = window.speechSynthesis?.getVoices() || [];
      const russianVoice = voices.find(v => v.lang.startsWith('ru'));
      if (russianVoice) utterance.voice = russianVoice;
      utterance.onend = () => setIsBrowserSpeaking(false);
      utterance.onerror = () => { setIsBrowserSpeaking(false); toast.error('Ошибка озвучивания'); };
      speechSynthesisRef.current = utterance;
      window.speechSynthesis?.speak(utterance);
      setIsBrowserSpeaking(true);
    }
  };

  // Stop speaking when lesson changes
  useEffect(() => { window.speechSynthesis?.cancel(); setIsBrowserSpeaking(false); elevenLabsTTS.stop(); stopSaluteSpeech(); }, [currentLessonIndex]);
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); elevenLabsTTS.stop(); stopSaluteSpeech(); saluteCacheRef.current.forEach(url => URL.revokeObjectURL(url)); saluteCacheRef.current.clear(); };
  }, []);

  return {
    ttsSettingsOpen, setTtsSettingsOpen,
    ttsSettings, setTtsSettings,
    isSpeaking, speakText, elevenLabsTTS,
  };
}
