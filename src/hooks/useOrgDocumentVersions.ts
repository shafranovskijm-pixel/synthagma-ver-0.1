import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OrgDocumentVersion {
  id: string;
  document_id: string;
  organization_id: string;
  version_number: number;
  file_url: string | null;
  file_path: string | null;
  file_size: number | null;
  file_name: string | null;
  change_summary: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export function useOrgDocumentVersions(documentId: string | null) {
  const [versions, setVersions] = useState<OrgDocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!documentId) {
      setVersions([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("org_document_versions")
        .select("*")
        .eq("document_id", documentId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      setVersions((data || []) as OrgDocumentVersion[]);
    } catch (e: any) {
      toast.error("Ошибка загрузки версий: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadVersion = useCallback(
    async (params: {
      organizationId: string;
      file: File;
      changeSummary?: string;
    }) => {
      if (!documentId) return false;
      try {
        const { data: lastVersion } = await supabase
          .from("org_document_versions")
          .select("version_number")
          .eq("document_id", documentId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();

        const nextVersion = (lastVersion?.version_number || 0) + 1;
        const fileExt = params.file.name.split(".").pop();
        const path = `${params.organizationId}/versions/${documentId}/v${nextVersion}-${Date.now()}.${fileExt}`;

        const { error: upErr } = await supabase.storage
          .from("org-documents")
          .upload(path, params.file);
        if (upErr) throw upErr;

        const { data: { publicUrl } } = supabase.storage
          .from("org-documents")
          .getPublicUrl(path);

        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = user
          ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
          : { data: null as any };

        const { error: insErr } = await supabase
          .from("org_document_versions")
          .insert({
            document_id: documentId,
            organization_id: params.organizationId,
            version_number: nextVersion,
            file_url: publicUrl,
            file_path: path,
            file_size: params.file.size,
            file_name: params.file.name,
            change_summary: params.changeSummary || null,
            uploaded_by: user?.id || null,
            uploaded_by_name: profile?.full_name || null,
          });
        if (insErr) throw insErr;

        await supabase
          .from("org_documents")
          .update({ file_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("id", documentId);

        toast.success(`Загружена версия №${nextVersion}`);
        refresh();
        return true;
      } catch (e: any) {
        toast.error("Не удалось загрузить версию: " + e.message);
        return false;
      }
    },
    [documentId, refresh]
  );

  const restoreVersion = useCallback(
    async (version: OrgDocumentVersion) => {
      if (!documentId || !version.file_url) return false;
      const { error } = await supabase
        .from("org_documents")
        .update({ file_url: version.file_url, updated_at: new Date().toISOString() })
        .eq("id", documentId);
      if (error) {
        toast.error("Не удалось восстановить версию");
        return false;
      }
      toast.success(`Восстановлена версия №${version.version_number}`);
      return true;
    },
    [documentId]
  );

  return { versions, loading, refresh, uploadVersion, restoreVersion };
}
