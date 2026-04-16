import { useState, useEffect } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ChatNotificationToggleProps {
  chatType: string;
  chatPartnerId?: string;
}

export function ChatNotificationToggle({ chatType, chatPartnerId }: ChatNotificationToggleProps) {
  const { user } = useAuth();
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadSetting();
  }, [user, chatType, chatPartnerId]);

  const loadSetting = async () => {
    if (!user) return;
    let query = (supabase as any)
      .from("chat_notification_settings")
      .select("muted")
      .eq("user_id", user.id)
      .eq("chat_type", chatType);

    if (chatPartnerId) {
      query = query.eq("chat_partner_id", chatPartnerId);
    } else {
      query = query.is("chat_partner_id", null);
    }

    const { data } = await query.maybeSingle();
    if (data) setMuted(data.muted);
  };

  const toggleMute = async () => {
    if (!user) return;
    const newMuted = !muted;
    setMuted(newMuted);

    const payload: Record<string, unknown> = {
      user_id: user.id,
      chat_type: chatType,
      muted: newMuted,
    };
    if (chatPartnerId) payload.chat_partner_id = chatPartnerId;

    // Upsert
    const { error } = await (supabase as any)
      .from("chat_notification_settings")
      .upsert(payload, { onConflict: "user_id,chat_type,chat_partner_id" });

    if (error) {
      setMuted(!newMuted);
      console.error("Failed to toggle notification:", error);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={toggleMute} className="h-8 w-8">
          {muted ? <BellOff className="w-4 h-4 text-muted-foreground" /> : <Bell className="w-4 h-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{muted ? "Включить уведомления" : "Отключить уведомления"}</TooltipContent>
    </Tooltip>
  );
}
