import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createDocumentUploadOperation, saveDocumentUpload, restoreDocumentFile, type DocumentUploadOperation } from "@/lib/orgDocumentLifecycle";
import { getErrorMessage } from "@/utils/handleSupabaseError";

export interface OrgDocumentVersion {
  id: string; document_id: string; organization_id: string; version_number: number;
  file_url: string | null; file_path: string | null; file_size: number | null; file_name: string | null;
  change_summary: string | null; uploaded_by: string | null; uploaded_by_name: string | null; created_at: string;
  event_kind?: "baseline" | "upload" | "restore" | null;
  restored_from_version_id?: string | null;
}
export function useOrgDocumentVersions(documentId: string | null, canWrite = false) {
  const [versions, setVersions] = useState<OrgDocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [document, setDocument] = useState<{ document_revision: number; current_version_id: string | null; deleted_at: string | null } | null>(null);
  const sequence = useRef(0);
  const activeDocument = useRef(documentId);
  activeDocument.current = documentId;
  const upload = useRef<DocumentUploadOperation | null>(null);
  const restore = useRef<{ key: string; requestId: string } | null>(null);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (activeDocument.current !== documentId) return;
    const run = ++sequence.current;
    setLoading(true);
    setVersions([]); setDocument(null);
    if (!documentId) { setLoading(false); return; }
    try {
      const [history, current] = await Promise.all([
        supabase.from("org_document_versions").select("*").eq("document_id", documentId).order("version_number", { ascending: false }),
        supabase.from("org_documents").select("*").eq("id", documentId).single(),
      ]);
      if (history.error) throw history.error;
      if (current.error) throw current.error;
      if (run !== sequence.current) return;
      setVersions((history.data || []) as OrgDocumentVersion[]);
      setDocument(current.data as unknown as typeof document);
    } catch (e) {
      if (run === sequence.current) toast.error("Ошибка загрузки версий", { description: getErrorMessage(e) });
    } finally { if (run === sequence.current) setLoading(false); }
  }, [documentId]);
  useEffect(() => {
    upload.current = null; restore.current = null;
    void refresh();
    return () => { ++sequence.current; };
  }, [refresh]);

  const uploadVersion = async (params: { organizationId: string; file: File; changeSummary?: string }) => {
    if (!canWrite || !documentId || !document || document.deleted_at || busy.current) return false;
    busy.current = true;
    try {
      const previous = upload.current;
      if (!previous || previous.documentId !== documentId || previous.file !== params.file
        || previous.expectedRevision !== document.document_revision || previous.changeSummary !== (params.changeSummary?.trim() || null)) {
        upload.current = createDocumentUploadOperation({ ...params, documentId, expectedRevision: document.document_revision });
      }
      const result = await saveDocumentUpload(upload.current!);
      upload.current = null;
      toast.success(`Загружена версия №${result.version_number}`);
      await refresh();
      return true;
    } catch (e: any) {
      toast.error(e?.code === "40001" ? "Документ изменён другим сотрудником. Проверьте новую версию." : "Не удалось сохранить версию", { description: getErrorMessage(e) });
      if (e?.code === "40001") { upload.current = null; await refresh(); }
      return false;
    } finally { busy.current = false; }
  };
  const restoreVersion = async (version: OrgDocumentVersion) => {
    if (!canWrite || !documentId || !document || document.deleted_at || !version.file_url || busy.current) return false;
    busy.current = true;
    try {
      const key = `${documentId}:${document.document_revision}:${version.id}`;
      if (restore.current?.key !== key) restore.current = { key, requestId: crypto.randomUUID() };
      await restoreDocumentFile({ documentId, organizationId: version.organization_id,
        requestId: restore.current.requestId, expectedRevision: document.document_revision, versionId: version.id });
      restore.current = null;
      toast.success("Файл восстановлен. В истории создана новая версия.");
      await refresh();
      return true;
    } catch (e: any) {
      toast.error(e?.code === "40001" ? "Документ изменён другим сотрудником. Проверьте новую версию." : "Не удалось восстановить версию", { description: getErrorMessage(e) });
      if (e?.code === "40001") { restore.current = null; await refresh(); }
      return false;
    } finally { busy.current = false; }
  };
  return { versions, loading, refresh, uploadVersion, restoreVersion, currentVersionId: document?.current_version_id,
    canChange: canWrite && !!document && !document.deleted_at };
}
