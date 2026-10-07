import { useCallback, useEffect, useRef, useState } from 'react';
import { getNativeSpeechStatus, nativeSpeechMessage, NativeSpeech } from './nativeSpeech';

/** A lesson switch, stop, or background event invalidates pending async speech. */
export function useNativeSpeech(enabled: boolean, lessonKey: string | number | undefined, onError: (message: string) => void) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const active = useRef(false);
  const generation = useRef(0);
  const errorCallback = useRef(onError);
  errorCallback.current = onError;

  const stop = useCallback((updateUi = true) => {
    generation.current++;
    active.current = false;
    if (updateUi) setIsSpeaking(false);
    void NativeSpeech.stop().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => { if (document.visibilityState === 'hidden') stop(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop(false);
    };
  }, [enabled, lessonKey, stop]);

  useEffect(() => { setIsSpeaking(false); }, [enabled, lessonKey]);

  const toggle = useCallback(async (text: string) => {
    if (!enabled) return;
    if (active.current) { stop(); return; }
    const request = ++generation.current;
    active.current = true;
    setIsSpeaking(true);
    try {
      const status = await getNativeSpeechStatus();
      if (request !== generation.current) return;
      if (!status.available) throw new Error(nativeSpeechMessage(status));
      await NativeSpeech.speak({ text });
    } catch (error) {
      if (request === generation.current) errorCallback.current(error instanceof Error ? error.message : 'Ошибка озвучивания Android');
    } finally {
      if (request === generation.current) {
        active.current = false;
        setIsSpeaking(false);
      }
    }
  }, [enabled, stop]);

  return { isSpeaking, toggle, stop };
}
