import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OrgDocumentShareLink {
  id: string;
  document_id: string;
  organization_id: string;
  token: string;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  last_accessed_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export function useOrgDocumentShareLinks(documentId: string | null) {
  const [links, setLinks] = useState<OrgDocumentShareLink[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!documentId) {
      setLinks([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("org_document_share_links")
        .select("*")
        .eq("document_id", documentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setLinks((data || []) as OrgDocumentShareLink[]);
    } catch (e: any) {
      toast.error("Ошибка загрузки ссылок: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createLink = useCallback(
    async (params: {
      organizationId: string;
      expiresInDays?: number | null;
      maxDownloads?: number | null;
    }) => {
      if (!documentId) return null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = user
          ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
          : { data: null as any };

        const expiresAt = params.expiresInDays
          ? new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
          : null;

        const { data, error } = await supabase
          .from("org_document_share_links")
          .insert({
            document_id: documentId,
            organization_id: params.organizationId,
            expires_at: expiresAt,
            max_downloads: params.maxDownloads || null,
            created_by: user?.id || null,
            created_by_name: profile?.full_name || null,
          })
          .select()
          .single();

        if (error) throw error;
        toast.success("Ссылка создана");
        refresh();
        return data as OrgDocumentShareLink;
      } catch (e: any) {
        toast.error("Не удалось создать ссылку: " + e.message);
        return null;
      }
    },
    [documentId, refresh]
  );

  const revokeLink = useCallback(
    async (linkId: string) => {
      const { error } = await supabase
        .from("org_document_share_links")
        .update({ is_active: false })
        .eq("id", linkId);
      if (error) {
        toast.error("Не удалось отозвать ссылку");
        return false;
      }
      toast.success("Ссылка отозвана");
      refresh();
      return true;
    },
    [refresh]
  );

  const deleteLink = useCallback(
    async (linkId: string) => {
      const { error } = await supabase
        .from("org_document_share_links")
        .delete()
        .eq("id", linkId);
      if (error) {
        toast.error("Не удалось удалить ссылку");
        return false;
      }
      toast.success("Ссылка удалена");
      refresh();
      return true;
    },
    [refresh]
  );

  return { links, loading, refresh, createLink, revokeLink, deleteLink };
}
