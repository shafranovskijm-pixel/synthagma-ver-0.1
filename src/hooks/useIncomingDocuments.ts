import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type IncomingDocType = "contract" | "act" | "invoice" | "other";

export interface IncomingDocument {
  id: string;
  organization_id: string;
  doc_type: IncomingDocType;
  title: string;
  counterparty_name: string | null;
  counterparty_inn: string | null;
  doc_number: string | null;
  doc_date: string | null;
  file_url: string;
  file_path: string | null;
  file_size: number | null;
  notes: string | null;
  related_signature_id: string | null;
  related_billing_doc_id: string | null;
  related_company_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncomingDocInput {
  doc_type: IncomingDocType;
  title: string;
  counterparty_name?: string;
  counterparty_inn?: string;
  doc_number?: string;
  doc_date?: string | null;
  notes?: string;
  related_signature_id?: string | null;
  related_billing_doc_id?: string | null;
  related_company_id?: string | null;
  file: File;
}

export function useIncomingDocuments(organizationId: string | null) {
  const [items, setItems] = useState<IncomingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    if (!organizationId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("incoming_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setItems((data || []) as IncomingDocument[]);
    } catch (e: any) {
      toast.error("Ошибка загрузки входящих документов: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = useCallback(
    async (input: IncomingDocInput) => {
      if (!organizationId) return false;
      setUploading(true);
      try {
        const ext = input.file.name.split(".").pop() || "bin";
        const path = `${organizationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("incoming-documents")
          .upload(path, input.file, { upsert: false, contentType: input.file.type });
        if (upErr) throw upErr;

        const { data: signed, error: signErr } = await supabase.storage
          .from("incoming-documents")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signErr) throw signErr;

        const { data: u } = await supabase.auth.getUser();
        const { error: insErr } = await supabase.from("incoming_documents").insert({
          organization_id: organizationId,
          doc_type: input.doc_type,
          title: input.title,
          counterparty_name: input.counterparty_name || null,
          counterparty_inn: input.counterparty_inn || null,
          doc_number: input.doc_number || null,
          doc_date: input.doc_date || null,
          notes: input.notes || null,
          related_signature_id: input.related_signature_id || null,
          related_billing_doc_id: input.related_billing_doc_id || null,
          related_company_id: input.related_company_id || null,
          file_url: signed.signedUrl,
          file_path: path,
          file_size: input.file.size,
          uploaded_by: u.user?.id,
        });
        if (insErr) throw insErr;

        toast.success("Документ добавлен");
        refresh();
        return true;
      } catch (e: any) {
        toast.error("Ошибка загрузки: " + e.message);
        return false;
      } finally {
        setUploading(false);
      }
    },
    [organizationId, refresh]
  );

  const remove = useCallback(
    async (doc: IncomingDocument) => {
      // Soft-delete via RPC — file stays in storage so Recycle Bin can restore it
      const { data, error } = await supabase.rpc("soft_delete_document", {
        p_table: "incoming_documents",
        p_id: doc.id,
      });
      if (error || !data) {
        toast.error("Не удалось переместить в корзину", { description: error?.message });
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== doc.id));
      toast.success("Документ перемещён в корзину");
    },
    []
  );

  return { items, loading, uploading, refresh, upload, remove };
}
