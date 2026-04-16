import { useState, useRef, useCallback, useEffect } from "react";
import { SALUTE_VOICES, getStoredTTSSettings, saveTTSSettings } from "@/components/student/TTSSettingsDialog";
import type { ContentBlock } from "@/components/course-builder/BlockEditor";
import { toast } from "sonner";

export function useLessonTTS() {
  const [saluteVoice, setSaluteVoice] = useState(() => getStoredTTSSettings().saluteVoice);
  const [isSaluteSpeaking, setIsSaluteSpeaking] = useState(false);
  const [isSaluteLoading, setIsSaluteLoading] = useState(false);
  const saluteAudioRef = useRef<HTMLAudioElement | null>(null);
  const saluteCacheRef = useRef<Map<string, string>>(new Map());

  const extractTextFromBlocks = useCallback((blocks: ContentBlock[]): string => {
    return blocks
      .filter(b => ["heading1", "heading2", "quote", "bulletList", "numberedList", "paragraph"].includes(b.type))
      .map(b => (b.content || "").replace(/<[^>]+>/g, ""))
      .filter(t => t.trim())
      .join(". ");
  }, []);

  const stopSaluteTTS = useCallback(() => {
    if (saluteAudioRef.current) { saluteAudioRef.current.pause(); saluteAudioRef.current.src = ''; saluteAudioRef.current = null; }
    setIsSaluteSpeaking(false); setIsSaluteLoading(false);
  }, []);

  const handleSaluteTTS = useCallback(async (blocks: ContentBlock[]) => {
    if (isSaluteSpeaking || isSaluteLoading) { stopSaluteTTS(); return; }
    const text = extractTextFromBlocks(blocks);
    if (!text.trim()) { toast.error("Нет текста для озвучивания"); return; }

    const hashText = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return h.toString(36); };
    const cacheKey = `${saluteVoice}:${hashText(text)}`;
    const cached = saluteCacheRef.current.get(cacheKey);

    const playAudio = async (url: string) => {
      const audio = new Audio(url);
      saluteAudioRef.current = audio;
      audio.onplay = () => { setIsSaluteLoading(false); setIsSaluteSpeaking(true); };
      audio.onended = () => { setIsSaluteSpeaking(false); };
      audio.onerror = () => { setIsSaluteSpeaking(false); setIsSaluteLoading(false); toast.error('Ошибка воспроизведения'); };
      setIsSaluteLoading(true);
      await audio.play();
    };

    if (cached) { await playAudio(cached); return; }

    setIsSaluteLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/salutespeech-tts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({ text, voice: saluteVoice })
        }
      );
      if (!response.ok) { const err = await response.json().catch(() => ({})); toast.error(err.error || `Ошибка: ${response.status}`); setIsSaluteLoading(false); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      saluteCacheRef.current.set(cacheKey, url);
      await playAudio(url);
    } catch { toast.error('Ошибка озвучивания'); setIsSaluteLoading(false); }
  }, [saluteVoice, isSaluteSpeaking, isSaluteLoading, stopSaluteTTS, extractTextFromBlocks]);

  const handleVoiceChange = useCallback((voiceId: string) => {
    setSaluteVoice(voiceId);
    const settings = getStoredTTSSettings();
    saveTTSSettings({ ...settings, saluteVoice: voiceId, provider: 'salutespeech' });
  }, []);

  useEffect(() => { return () => { stopSaluteTTS(); }; }, []);

  return {
    saluteVoice,
    isSaluteSpeaking,
    isSaluteLoading,
    handleSaluteTTS,
    handleVoiceChange,
    stopSaluteTTS,
    SALUTE_VOICES,
  };
}
