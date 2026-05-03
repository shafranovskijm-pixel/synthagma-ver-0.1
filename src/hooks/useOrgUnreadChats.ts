import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ConversationSummary {
  studentUserId: string;
  studentName: string;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
  lastSenderIsOrg: boolean;
}

export function useOrgUnreadChats(organizationId: string | null, currentUserId: string | null) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    if (!organizationId || !currentUserId) return;
    setIsLoading(true);
    try {
      // Get all messages for this org, ordered by created_at desc
      const { data: messages } = await supabase
        .from("org_student_messages")
        .select("student_user_id, sender_user_id, content, created_at, is_read, attachment_name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      // Also count unread admin messages
      const { count: adminUnread } = await supabase
        .from("admin_org_messages")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("sender_role", "admin")
        .eq("is_read", false);

      const adminUnreadCount = adminUnread || 0;

      if (!messages || messages.length === 0) {
        setConversations([]);
        setTotalUnread(adminUnreadCount);
        setIsLoading(false);
        return;
      }

      // Group by student_user_id
      const grouped = new Map<string, typeof messages>();
      for (const msg of messages) {
        const key = msg.student_user_id;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(msg);
      }

      // Get unique student ids
      const studentIds = Array.from(grouped.keys());

      // Fetch student names
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", studentIds);

      const nameMap = new Map<string, string>();
      profiles?.forEach((p) => nameMap.set(p.user_id, p.full_name || "Без имени"));

      // Build conversation summaries
      let unreadTotal = 0;
      const convos: ConversationSummary[] = [];

      for (const [studentId, msgs] of grouped) {
        const lastMsg = msgs[0]; // already sorted desc
        const unreadCount = msgs.filter(
          (m) => !m.is_read && m.sender_user_id === m.student_user_id // from student
        ).length;
        unreadTotal += unreadCount;

        convos.push({
          studentUserId: studentId,
          studentName: nameMap.get(studentId) || "Без имени",
          lastMessage: lastMsg.content || (lastMsg.attachment_name ? `📎 ${lastMsg.attachment_name}` : null),
          lastMessageAt: lastMsg.created_at,
          unreadCount,
          lastSenderIsOrg: lastMsg.sender_user_id !== lastMsg.student_user_id,
        });
      }

      // Sort by last message time desc
      convos.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

      setConversations(convos);
      setTotalUnread(unreadTotal + adminUnreadCount);
    } catch (err) {
      console.error("Failed to fetch chats:", err);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, currentUserId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime subscription
  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`org-chats-${organizationId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "org_student_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          fetchConversations();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_org_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, fetchConversations]);

  return {
    conversations,
    totalUnread,
    isLoading,
    refresh: fetchConversations,
  };
}
