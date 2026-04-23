import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

export interface OrgProposal {
  id: string;
  organization_id: string | null;
  scope: string;
  company_name: string;
  company_inn: string | null;
  company_email: string | null;
  company_phone: string | null;
  contact_person: string | null;
  custom_note: string | null;
  status: string;
  total_amount: number;
  discount_percent: number | null;
  valid_until: string | null;
  last_sent_at: string | null;
  linked_signature_id: string | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
  preset_id?: string | null;
  intro_html?: string | null;
  outro_html?: string | null;
}

export interface OrgProposalServiceItem {
  id?: string;
  proposal_id?: string;
  service_id: string | null;
  custom_name: string;
  custom_description: string | null;
  price: number;
  quantity: number;
  sort_order: number;
}

export function useOrgProposals(organizationId: string | null) {
  const [proposals, setProposals] = useState<OrgProposal[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId) { setProposals([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("commercial_proposals")
        .select("*")
        .eq("scope", "org")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setProposals((data || []) as OrgProposal[]);
    } catch (e) {
      toast.error("Ошибка загрузки КП", { description: getErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  const getServices = useCallback(async (proposalId: string): Promise<OrgProposalServiceItem[]> => {
    const { data } = await supabase
      .from("commercial_proposal_services")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("sort_order", { ascending: true });
    return (data || []) as OrgProposalServiceItem[];
  }, []);

  const upsertProposal = useCallback(async (
    p: Partial<OrgProposal> & { company_name: string; total_amount: number },
    services: OrgProposalServiceItem[],
  ) => {
    if (!organizationId) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Нет авторизации"); return null; }

    const payload: any = {
      ...p,
      scope: "org",
      organization_id: organizationId,
      created_by: user.id,
    };
    const { data: saved, error } = await supabase
      .from("commercial_proposals")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) { toast.error("Ошибка сохранения КП", { description: getErrorMessage(error) }); return null; }

    // Заменяем услуги
    await supabase.from("commercial_proposal_services").delete().eq("proposal_id", saved.id);
    if (services.length > 0) {
      const rows = services.map((s, idx) => ({
        proposal_id: saved.id,
        service_id: s.service_id,
        custom_name: s.custom_name,
        custom_description: s.custom_description,
        price: s.price,
        quantity: s.quantity,
        sort_order: idx,
      }));
      const { error: sErr } = await supabase.from("commercial_proposal_services").insert(rows);
      if (sErr) { toast.error("Ошибка сохранения услуг", { description: getErrorMessage(sErr) }); }
    }

    refresh();
    return saved as OrgProposal;
  }, [organizationId, refresh]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("commercial_proposals").delete().eq("id", id);
    if (error) { toast.error("Ошибка удаления"); return; }
    setProposals(prev => prev.filter(p => p.id !== id));
    toast.success("КП удалено");
  }, []);

  const sendByEmail = useCallback(async (proposalId: string, toEmail: string, templateId: string | null) => {
    const { data, error } = await supabase.functions.invoke("send-campaign-email", {
      body: {
        purpose: "proposal",
        proposal_id: proposalId,
        recipient_email: toEmail,
        template_id: templateId,
      },
    });
    if (error) { toast.error("Не удалось отправить", { description: getErrorMessage(error) }); return false; }
    if ((data as any)?.error) { toast.error((data as any).error); return false; }
    toast.success("КП отправлено на " + toEmail);
    refresh();
    return true;
  }, [refresh]);

  return { proposals, loading, refresh, getServices, upsertProposal, remove, sendByEmail };
}
