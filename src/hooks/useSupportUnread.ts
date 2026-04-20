import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useSupportUnread() {
  const { user } = useAuth();
  const [unreadAdmin, setUnreadAdmin] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!user) return;
    // Только глобальные админы — упрощённая проверка через попытку запроса
    const { data, error } = await supabase
      .from('support_conversations')
      .select('unread_for_admin');
    if (error) return;
    const total = (data ?? []).reduce((sum, c) => sum + (c.unread_for_admin ?? 0), 0);
    setUnreadAdmin(total);
  }, [user]);

  useEffect(() => { fetchUnread(); }, [fetchUnread]);

  useEffect(() => {
    const channel = supabase
      .channel('support-unread-admin')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'support_conversations' },
        () => fetchUnread()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchUnread]);

  return unreadAdmin;
}
