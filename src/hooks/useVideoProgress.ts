import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface VideoProgressState {
  position: number;
  duration: number;
  isLoading: boolean;
}

export const useVideoProgress = (
  userId: string | undefined,
  lessonId: string | undefined
) => {
  const [state, setState] = useState<VideoProgressState>({
    position: 0,
    duration: 0,
    isLoading: true,
  });
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPositionRef = useRef<number>(0);
  
  // Current position ref for beforeunload
  const currentPositionRef = useRef<{ position: number; duration: number }>({ position: 0, duration: 0 });
  
  // Load saved position on mount
  useEffect(() => {
    if (!userId || !lessonId) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }
    
    const loadProgress = async () => {
      try {
        const { data, error } = await supabase
          .from('lesson_progress')
          .select('video_position, video_duration')
          .eq('user_id', userId)
          .eq('lesson_id', lessonId)
          .maybeSingle();
        
        if (error) {
          console.error('[useVideoProgress] Error loading:', error);
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }
        
        const position = (data as any)?.video_position ?? 0;
        const duration = (data as any)?.video_duration ?? 0;
        
        console.log('[useVideoProgress] Loaded position:', position, 'duration:', duration);
        lastSavedPositionRef.current = position;
        
        setState({
          position,
          duration,
          isLoading: false,
        });
      } catch (err) {
        console.error('[useVideoProgress] Load error:', err);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };
    
    loadProgress();
  }, [userId, lessonId]);
  
  // Save position with debounce (every 10 seconds of playback change, 3s debounce)
  const savePosition = useCallback(
    async (position: number, duration: number) => {
      if (!userId || !lessonId) return;
      
      // Update current position ref for beforeunload
      currentPositionRef.current = { position, duration };
      
      // Only save if position changed significantly (at least 10 seconds)
      if (Math.abs(position - lastSavedPositionRef.current) < 10) return;
      
      // Debounce saves (3 second debounce to reduce concurrent writes)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          console.log('[useVideoProgress] Saving position:', position);
          lastSavedPositionRef.current = position;
          
          await supabase
            .from('lesson_progress')
            .upsert(
              {
                user_id: userId,
                lesson_id: lessonId,
                video_position: position,
                video_duration: duration,
              },
              { onConflict: 'lesson_id,user_id' }
            );
        } catch (err) {
          console.error('[useVideoProgress] Save error:', err);
        }
      }, 3000); // 3 second debounce
    },
    [userId, lessonId]
  );
  
  // Save immediately (for page unload)
  const savePositionImmediate = useCallback(
    async (position: number, duration: number) => {
      if (!userId || !lessonId) return;
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      try {
        console.log('[useVideoProgress] Immediate save:', position);
        lastSavedPositionRef.current = position;
        
        await supabase
          .from('lesson_progress')
          .upsert(
            {
              user_id: userId,
              lesson_id: lessonId,
              video_position: position,
              video_duration: duration,
            },
            { onConflict: 'lesson_id,user_id' }
          );
      } catch (err) {
        console.error('[useVideoProgress] Immediate save error:', err);
      }
    },
    [userId, lessonId]
  );
  
  // Save on visibility change (tab switch, minimize) and cleanup
  useEffect(() => {
    if (!userId || !lessonId) return;
    
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        const { position, duration } = currentPositionRef.current;
        if (position > 0 && Math.abs(position - lastSavedPositionRef.current) >= 1) {
          console.log('[useVideoProgress] Saving on visibility hidden:', position);
          
          // Clear any pending timeout
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          
          lastSavedPositionRef.current = position;
          
          // Use async IIFE for save
          (async () => {
            try {
              await supabase
                .from('lesson_progress')
                .upsert(
                  {
                    user_id: userId,
                    lesson_id: lessonId,
                    video_position: position,
                    video_duration: duration,
                  },
                  { onConflict: 'lesson_id,user_id' }
                );
              console.log('[useVideoProgress] Saved on visibility change');
            } catch (err) {
              console.error('[useVideoProgress] Visibility save error:', err);
            }
          })();
        }
      }
    };
    
    const handleBeforeUnload = () => {
      const { position, duration } = currentPositionRef.current;
      if (position > 0 && Math.abs(position - lastSavedPositionRef.current) >= 1) {
        // Use sendBeacon for non-blocking, reliable save on page close
        try {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/lesson_progress?on_conflict=lesson_id,user_id`;
          const payload = JSON.stringify({
            user_id: userId,
            lesson_id: lessonId,
            video_position: position,
            video_duration: duration,
          });
          
          const blob = new Blob([payload], { type: 'application/json' });
          
          // sendBeacon doesn't support custom headers, so we append apikey as query param
          // and use Prefer header via URL approach
          const beaconUrl = `${url}&apikey=${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
          const sent = navigator.sendBeacon(beaconUrl, blob);
          
          if (sent) {
            console.log('[useVideoProgress] sendBeacon save on unload:', position);
            lastSavedPositionRef.current = position;
          } else {
            console.warn('[useVideoProgress] sendBeacon failed, data may be lost');
          }
        } catch (err) {
          console.error('[useVideoProgress] Beacon save error:', err);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [userId, lessonId]);
  
  return {
    savedPosition: state.position,
    savedDuration: state.duration,
    isLoading: state.isLoading,
    savePosition,
    savePositionImmediate,
  };
};
