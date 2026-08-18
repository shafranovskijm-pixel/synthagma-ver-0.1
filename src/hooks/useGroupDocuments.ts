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
  template_registry_key?: string | null;
  template_version_label?: string | null;
  template_sha256?: string | null;
  variables_snapshot?: Record<string, any> | null;
  docx_sha256?: string | null;
  pdf_status?: string | null;
  generation_status?: string | null;
  package_batch_id?: string | null;
  package_version?: number | null;
  is_current?: boolean | null;
  created_by?: string | null;
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

  /**
   * Атомарное создание партии документов через RPC:
   * версия = max(version)+1 по группе, новая партия current,
   * предыдущие версионированные партии становятся previous.
   * Записи без package_batch_id (созданные до версионирования) не изменяются.
   */
  const saveGenerated = useCallback(async (docs: GeneratedDocument[]) => {
    if (!organizationId || !groupId || docs.length === 0) return null;
    const payload = docs.map(d => ({
      doc_type: d.doc_type,
      name: d.name,
      document_number: d.document_number ?? null,
      document_date: d.document_date ?? null,
      variables: d.variables,
      html: d.html,
      doc_status: d.doc_status,
      fill_mode: d.fill_mode,
      layout_format: d.layout_format,
      source_note: d.source_note ?? null,
    }));
    const { data, error } = await (supabase as any).rpc("create_group_document_batch", {
      p_organization_id: organizationId,
      p_group_id: groupId,
      p_docs: payload,
    });
    if (error) {
      toast.error("Не удалось сохранить документы: " + error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    await refresh();
    return {
      batchId: (row?.batch_id as string) || null,
      version: Number(row?.batch_version) || null,
      insertedCount: Number(row?.inserted_count) || payload.length,
    };
  }, [organizationId, groupId, refresh]);

  const remove = useCallback(async (id: string) => {
    const row = documents.find(document => document.id === id);
    const { error } = await (supabase as any)
      .from("group_documents")
      .delete()
      .eq("organization_id", organizationId)
      .eq("group_id", groupId)
      .eq("id", id);
    if (error) { toast.error("Не удалось удалить документ"); return false; }
    setDocuments(prev => prev.filter(d => d.id !== id));

    let cleanupFailed = false;
    if (row?.file_path) {
      try {
        const { error: cleanupError } = await supabase.storage
          .from("billing-documents")
          .remove([row.file_path]);
        cleanupFailed = !!cleanupError;
      } catch {
        cleanupFailed = true;
      }
    }

    if (cleanupFailed) {
      toast.warning("Документ удалён, но файл не удалось очистить", {
        description: "Запись уже удалена. Повторная очистка файла будет выполнена администратором.",
      });
    } else {
      toast.success("Документ удалён");
    }
    return true;
  }, [documents, groupId, organizationId]);

  return { documents, loading, refresh, saveGenerated, remove };
}
