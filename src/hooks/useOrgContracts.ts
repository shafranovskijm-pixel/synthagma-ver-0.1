import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

export interface OrgContractTemplate {
  id: string;
  organization_id: string;
  name: string;
  body_html: string;
  variables: any;
  is_default: boolean;
  version?: number;
  is_active?: boolean;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgContractSignature {
  id: string;
  document_title: string;
  document_type: string;
  recipient_name: string;
  recipient_email: string;
  status: string;
  signature_token: string;
  sent_at: string | null;
  signed_at: string | null;
  email_opened_at: string | null;
  linked_proposal_id: string | null;
  created_at: string;
}

export function useOrgContractTemplates(organizationId: string | null) {
  const [templates, setTemplates] = useState<OrgContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId) { setTemplates([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("org_contract_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setTemplates((data || []) as OrgContractTemplate[]);
    } catch (e) {
      toast.error("Ошибка загрузки шаблонов договоров", { description: getErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsert = useCallback(async (t: Partial<OrgContractTemplate> & { name: string; body_html: string }) => {
    if (!organizationId) return null;
    const payload: any = { ...t, organization_id: organizationId };
    const { data, error } = await supabase
      .from("org_contract_templates")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) { toast.error("Ошибка сохранения", { description: getErrorMessage(error) }); return null; }
    toast.success("Шаблон сохранён");
    refresh();
    return data as OrgContractTemplate;
  }, [organizationId, refresh]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("org_contract_templates").delete().eq("id", id);
    if (error) { toast.error("Ошибка удаления"); return; }
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success("Удалено");
  }, []);

  return { templates, loading, refresh, upsert, remove };
}

export function useOrgContracts(organizationId: string | null) {
  const [contracts, setContracts] = useState<OrgContractSignature[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId) { setContracts([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("document_signatures")
        .select("id, document_title, document_type, recipient_name, recipient_email, status, signature_token, sent_at, signed_at, email_opened_at, linked_proposal_id, created_at")
        .eq("organization_id", organizationId)
        .eq("document_type", "sales_contract")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setContracts((data || []) as OrgContractSignature[]);
    } catch (e) {
      toast.error("Ошибка загрузки договоров", { description: getErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (input: {
    documentTitle: string;
    documentHtml: string;
    recipientName: string;
    recipientEmail: string;
    expiresDays?: number;
    templateEmailId?: string | null;
    linkedProposalId?: string | null;
  }) => {
    if (!organizationId) return null;
    const { data, error } = await supabase.functions.invoke("org-create-contract-signature", {
      body: {
        organization_id: organizationId,
        document_title: input.documentTitle,
        document_html: input.documentHtml,
        recipient_name: input.recipientName,
        recipient_email: input.recipientEmail,
        expires_days: input.expiresDays ?? 14,
        template_email_id: input.templateEmailId ?? null,
        linked_proposal_id: input.linkedProposalId ?? null,
      },
    });
    if (error) { toast.error("Не удалось создать договор", { description: getErrorMessage(error) }); return null; }
    if ((data as any)?.error) { toast.error((data as any).error); return null; }
    toast.success("Договор отправлен на подписание");
    refresh();
    return data as { signature_id: string; signing_url: string };
  }, [organizationId, refresh]);

  return { contracts, loading, refresh, create };
}
