import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createDocumentUploadOperation, saveDocumentUpload, restoreDocumentFile, type DocumentUploadOperation } from "@/lib/orgDocumentLifecycle";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import type { ScopedOrgDocumentTransport } from "@/lib/programFiles";

export interface OrgDocumentVersion {
  id: string; document_id: string; organization_id: string; version_number: number;
  file_url: string | null; file_path: string | null; file_size: number | null; file_name: string | null;
  change_summary: string | null; uploaded_by: string | null; uploaded_by_name: string | null; created_at: string;
  event_kind?: "baseline" | "upload" | "restore" | null;
  restored_from_version_id?: string | null;
}
export function useOrgDocumentVersions(documentId: string | null, canWrite = false, transport?: ScopedOrgDocumentTransport) {
  const [versions, setVersions] = useState<OrgDocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [document, setDocument] = useState<{ document_revision: number; current_version_id: string | null; deleted_at: string | null } | null>(null);
  const sequence = useRef(0);
  const ownerKey = `${documentId ?? ''}${transport ? ':' + transport.key : ''}`;
  const activeDocument = useRef(ownerKey);
  activeDocument.current = ownerKey;
  const loadedOwner = useRef<string | null>(null);
  const errorOwner = useRef<string | null>(null);
  const currentScope = () => { try { transport?.assertCurrent(); return true; } catch { return false; } };
  const upload = useRef<DocumentUploadOperation | null>(null);
  const restore = useRef<{ key: string; requestId: string } | null>(null);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (activeDocument.current !== ownerKey || !currentScope()) return;
    const run = ++sequence.current;
    setLoading(true);
    setLoadError(null); setHasLoaded(false);
    errorOwner.current = null;
    setVersions([]); setDocument(null);
    if (!documentId) { setLoading(false); return; }
    try {
      const [history, current] = await Promise.all([
        transport ? transport.readVersions(documentId) : supabase.from("org_document_versions").select("*").eq("document_id", documentId).order("version_number", { ascending: false }),
        transport ? transport.readDocument(documentId) : supabase.from("org_documents").select("*").eq("id", documentId).single(),
      ]);
      if (history.error) throw history.error;
      if (current.error) throw current.error;
      if (run !== sequence.current || activeDocument.current !== ownerKey || !currentScope()) return;
      setVersions((history.data || []) as OrgDocumentVersion[]);
      setDocument(current.data as unknown as typeof document);
      loadedOwner.current = ownerKey;
      setHasLoaded(true);
    } catch (e) {
      if (run === sequence.current && activeDocument.current === ownerKey && currentScope()) { errorOwner.current = ownerKey; setLoadError(`Не удалось загрузить историю версий. ${getErrorMessage(e)}`); }
    } finally { if (run === sequence.current && activeDocument.current === ownerKey && currentScope()) setLoading(false); }
  }, [documentId, ownerKey, transport]);
  useEffect(() => {
    upload.current = null; restore.current = null;
    if (transport) busy.current = false;
    void refresh();
    return () => { ++sequence.current; };
  }, [refresh]);

  const uploadVersion = async (params: { organizationId: string; file: File; changeSummary?: string }) => {
    if (!canWrite || !documentId || !document || document.deleted_at || busy.current || !currentScope() || transport && loadedOwner.current !== ownerKey) return false;
    busy.current = true;
    try {
      const previous = upload.current;
      if (!previous || previous.documentId !== documentId || previous.file !== params.file
        || previous.expectedRevision !== document.document_revision || previous.changeSummary !== (params.changeSummary?.trim() || null)) {
        upload.current = createDocumentUploadOperation({ ...params, documentId, expectedRevision: document.document_revision });
      }
      const result = await (transport ? transport.saveUpload(upload.current!) : saveDocumentUpload(upload.current!));
      if (!currentScope() || activeDocument.current !== ownerKey) return false;
      upload.current = null;
      toast.success(`Загружена версия №${result.version_number}`);
      await refresh();
      return true;
    } catch (e: any) {
      if (!currentScope() || activeDocument.current !== ownerKey) return false;
      toast.error(e?.code === "40001" || !!transport && ['PT409','REVISION_CONFLICT'].includes(e?.code) ? "Документ изменён другим сотрудником. Проверьте новую версию." : "Не удалось сохранить версию", { description: getErrorMessage(e) });
      if (e?.code === "40001" || !!transport && ['PT409','REVISION_CONFLICT'].includes(e?.code)) { upload.current = null; await refresh(); }
      return false;
    } finally { if (!transport || activeDocument.current === ownerKey) busy.current = false; }
  };
  const restoreVersion = async (version: OrgDocumentVersion) => {
    if (!canWrite || !documentId || !document || document.deleted_at || !version.file_url || busy.current || !currentScope() || transport && loadedOwner.current !== ownerKey) return false;
    busy.current = true;
    try {
      const key = `${documentId}:${document.document_revision}:${version.id}`;
      if (restore.current?.key !== key) restore.current = { key, requestId: crypto.randomUUID() };
      const restoreInput = { documentId, organizationId: version.organization_id,
        requestId: restore.current.requestId, expectedRevision: document.document_revision, versionId: version.id };
      await (transport ? transport.restore(restoreInput) : restoreDocumentFile(restoreInput));
      if (!currentScope() || activeDocument.current !== ownerKey) return false;
      restore.current = null;
      toast.success("Файл восстановлен. В истории создана новая версия.");
      await refresh();
      return true;
    } catch (e: any) {
      if (!currentScope() || activeDocument.current !== ownerKey) return false;
      toast.error(e?.code === "40001" || !!transport && ['PT409','REVISION_CONFLICT'].includes(e?.code) ? "Документ изменён другим сотрудником. Проверьте новую версию." : "Не удалось восстановить версию", { description: getErrorMessage(e) });
      if (e?.code === "40001" || !!transport && ['PT409','REVISION_CONFLICT'].includes(e?.code)) { restore.current = null; await refresh(); }
      return false;
    } finally { if (!transport || activeDocument.current === ownerKey) busy.current = false; }
  };
  const visible = !transport || loadedOwner.current === ownerKey && currentScope();
  const visibleError = !transport || errorOwner.current === ownerKey && currentScope();
  return { versions: visible ? versions : [], loading, loadError: visibleError ? loadError : null, hasLoaded: visible && hasLoaded, refresh, uploadVersion, restoreVersion, currentVersionId: visible ? document?.current_version_id : null,
    canChange: visible && canWrite && hasLoaded && !loading && !loadError && !!document && !document.deleted_at };
}
