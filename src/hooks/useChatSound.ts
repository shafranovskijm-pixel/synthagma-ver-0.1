import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useChatSound() {
  const { user } = useAuth();
  const soundRef = useRef<string>("message-1");
  const enabledRef = useRef(true);

  // Load user sound preference
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("chat_notification_settings")
        .select("muted, notification_sound")
        .eq("user_id", user.id)
        .eq("chat_type", "global")
        .is("chat_partner_id", null)
        .maybeSingle();
      if (data) {
        enabledRef.current = !data.muted;
        soundRef.current = data.notification_sound || "message-1";
      }
    })();
  }, [user]);

  const playSound = useCallback(() => {
    if (!enabledRef.current) return;
    try {
      const audio = new Audio(`/sounds/${soundRef.current}.wav`);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}
  }, []);

  const updatePreference = useCallback((muted: boolean, sound: string) => {
    enabledRef.current = !muted;
    soundRef.current = sound;
  }, []);

  return { playSound, updatePreference };
}

/** Play a specific sound file for preview */
export function previewSound(sound: string) {
  try {
    const audio = new Audio(`/sounds/${sound}.wav`);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch {}
}
