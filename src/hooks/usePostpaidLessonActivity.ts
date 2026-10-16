import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Shared by the web and Capacitor lesson screen. The server checks the actual
 * learner/enrollment and records an immutable, deduplicated usage event. */
export function usePostpaidLessonActivity(lessonId: string | undefined, userId: string | undefined, active: boolean) {
  useEffect(() => {
    if (!active || !lessonId || !userId) return;
    let stopped = false;
    let pending = false;
    const record = async () => {
      if (stopped || pending || document.visibilityState === 'hidden' || !navigator.onLine) return;
      pending = true;
      try {
        const { error } = await supabase.rpc('record_postpaid_lesson_activity' as any, { p_lesson_id: lessonId });
        if (error && !stopped) console.warn('Не удалось записать использование урока для сверки постоплаты');
      } catch {
        if (!stopped) console.warn('Не удалось записать использование урока для сверки постоплаты');
      } finally { pending = false; }
    };
    void record();
    // A learner can keep one lesson open across a calendar-month boundary.
    // Heartbeats also retry an interrupted request without affecting learning.
    const timer = window.setInterval(record, 5 * 60_000);
    document.addEventListener('visibilitychange', record);
    window.addEventListener('online', record);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', record);
      window.removeEventListener('online', record);
    };
  }, [lessonId, userId, active]);
}
