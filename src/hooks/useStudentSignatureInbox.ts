import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface InboxSignature {
  id: string;
  document_title: string;
  document_type: string;
  status: string;
  sender_name: string | null;
  expires_at: string | null;
  signature_token: string;
  organization_id: string;
  created_at: string;
  signed_at: string | null;
  viewed_at: string | null;
  signed_document_path: string | null;
}

const PENDING_STATUSES = ["sent", "viewed", "in_review"];
const ARCHIVE_STATUSES = ["signed", "rejected", "expired"];

export function useStudentSignatureInbox(userId: string | null | undefined) {
  const [items, setItems] = useState<InboxSignature[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("document_signatures")
      .select(
        "id, document_title, document_type, status, sender_name, expires_at, signature_token, organization_id, created_at, signed_at, viewed_at, signed_document_path"
      )
      .eq("recipient_user_id", userId)
      .eq("hidden_for_recipient", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[useStudentSignatureInbox]", error);
      setItems([]);
    } else {
      setItems((data || []) as InboxSignature[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime updates for incoming documents
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`student-inbox-${userId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "document_signatures",
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as any;
            toast.info("Новый документ от организации", {
              description: row.document_title,
            });
          }
          load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const pending = items.filter((i) => PENDING_STATUSES.includes(i.status));
  const archive = items.filter((i) => ARCHIVE_STATUSES.includes(i.status));

  return { items, pending, archive, loading, reload: load };
}
