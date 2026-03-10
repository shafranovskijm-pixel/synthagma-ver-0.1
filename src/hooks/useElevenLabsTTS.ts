import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { safeFetch } from '@/utils/safeInvoke';

interface UseElevenLabsTTSOptions {
  voiceId?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

// Available voices for settings
export const ELEVENLABS_VOICES = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (мужской, РУ)', lang: 'ru' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (женский)', lang: 'en' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (женский)', lang: 'en' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda (женский)', lang: 'en' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (женский)', lang: 'en' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (мужской)', lang: 'en' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian (мужской)', lang: 'en' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (мужской)', lang: 'en' },
] as const;

export const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // George - Russian voice

export function useElevenLabsTTS(options: UseElevenLabsTTSOptions = {}) {
  const { 
    voiceId = DEFAULT_VOICE_ID, 
    onStart, 
    onEnd, 
    onError 
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text || text.trim().length === 0) {
      toast.error('Нет текста для озвучивания');
      return;
    }

    // If already speaking, stop
    if (isSpeaking || isLoading) {
      stop();
      return;
    }

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text, voiceId }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Ошибка: ${response.status}`;
        
        // Handle specific error cases
        if (response.status === 402) {
          toast.error('Озвучка временно недоступна. Попробуйте без VPN.');
          onError?.('Озвучка временно недоступна');
        } else {
          toast.error(errorMessage);
          onError?.(errorMessage);
        }
        setIsLoading(false);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsLoading(false);
        setIsSpeaking(true);
        onStart?.();
      };

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        onEnd?.();
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        setIsLoading(false);
        URL.revokeObjectURL(audioUrl);
        toast.error('Ошибка воспроизведения аудио');
        onError?.('Ошибка воспроизведения');
      };

      await audio.play();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Request was cancelled
        return;
      }
      console.error('TTS error:', error);
      toast.error('Ошибка озвучивания');
      onError?.(error.message || 'Неизвестная ошибка');
      setIsLoading(false);
    }
  }, [voiceId, isSpeaking, isLoading, stop, onStart, onEnd, onError]);

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    isActive: isSpeaking || isLoading,
  };
}
