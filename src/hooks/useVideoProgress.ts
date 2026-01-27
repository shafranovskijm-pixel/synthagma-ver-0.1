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
  
  // Save position with debounce (every 5 seconds of playback change)
  const savePosition = useCallback(
    async (position: number, duration: number) => {
      if (!userId || !lessonId) return;
      
      // Only save if position changed significantly (at least 3 seconds)
      if (Math.abs(position - lastSavedPositionRef.current) < 3) return;
      
      // Debounce saves
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
      }, 1000); // 1 second debounce
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
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
  
  return {
    savedPosition: state.position,
    savedDuration: state.duration,
    isLoading: state.isLoading,
    savePosition,
    savePositionImmediate,
  };
};
