import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GeneratedDocument } from "@/lib/group-docs/schema";

export interface GroupDocumentRow {
  id: string;
  organization_id: string;
  group_id: string;
  doc_type: string;
  name: string;
  document_number: string | null;
  document_date: string | null;
  variables: Record<string, any>;
  html: string | null;
  file_path: string | null;
  status: string;
  created_at: string;
  doc_status?: string | null;
  fill_mode?: string | null;
  layout_format?: string | null;
  source_note?: string | null;
  package_batch_id?: string | null;
  package_version?: number | null;
}

export function useGroupDocuments(organizationId: string | null, groupId: string | null) {
  const [documents, setDocuments] = useState<GroupDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId || !groupId) { setDocuments([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("group_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("group_id", groupId)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDocuments((data || []) as GroupDocumentRow[]);
    } catch (e: any) {
      toast.error("Ошибка загрузки документов группы: " + (e?.message || ""));
    } finally {
      setLoading(false);
    }
  }, [organizationId, groupId]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveGenerated = useCallback(async (docs: GeneratedDocument[], batch?: { batchId?: string | null; version?: number | null }) => {
    if (!organizationId || !groupId || docs.length === 0) return false;
    const { data: userRes } = await supabase.auth.getUser();
    const rows = docs.map(d => ({
      organization_id: organizationId,
      group_id: groupId,
      doc_type: d.doc_type,
      name: d.name,
      document_number: d.document_number,
      document_date: d.document_date,
      variables: d.variables,
      html: d.html,
      status: "active",
      doc_status: d.doc_status,
      fill_mode: d.fill_mode,
      layout_format: d.layout_format,
      source_note: d.source_note ?? null,
      package_batch_id: batch?.batchId ?? d.package_batch_id ?? null,
      package_version: batch?.version ?? d.package_version ?? null,
      created_by: userRes?.user?.id || null,
    }));
    const { error } = await (supabase as any).from("group_documents").insert(rows);
    if (error) {
      toast.error("Не удалось сохранить документы: " + error.message);
      return false;
    }
    await refresh();
    return true;
  }, [organizationId, groupId, refresh]);

  const remove = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from("group_documents").delete().eq("id", id);
    if (error) { toast.error("Не удалось удалить документ"); return false; }
    setDocuments(prev => prev.filter(d => d.id !== id));
    toast.success("Документ удалён");
    return true;
  }, []);

  return { documents, loading, refresh, saveGenerated, remove };
}
