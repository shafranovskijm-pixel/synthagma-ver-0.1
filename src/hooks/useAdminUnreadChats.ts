import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useAdminUnreadChats() {
  const [totalUnread, setTotalUnread] = useState(0);

  const fetchUnread = useCallback(async () => {
    const { count } = await supabase
      .from("admin_org_messages")
      .select("*", { count: "exact", head: true })
      .eq("sender_role", "organization")
      .eq("is_read", false);

    setTotalUnread(count || 0);
  }, []);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);

  useEffect(() => {
    const channel = supabase
      .channel(`admin-unread-chats-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_org_messages" },
        () => fetchUnread()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchUnread]);

  return totalUnread;
}
