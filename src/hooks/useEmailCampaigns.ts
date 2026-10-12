import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { readCampaignRunFeedback } from "@/lib/mailing/campaignRunFeedback";

export interface EmailCampaign {
  id: string;
  scope: "platform" | "org";
  organization_id: string | null;
  name: string;
  subject: string;
  html_body: string;
  from_name: string | null;
  reply_to: string | null;
  recipient_source: string;
  recipient_filter: any;
  manual_emails: string[] | null;
  status: "draft" | "scheduled" | "sending" | "completed" | "failed" | "paused";
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  open_count: number;
  click_count: number;
  unsubscribe_count: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  campaign_mode?: "permission_marketing" | "cold_outreach";
  delivery_mode?: "standard" | "control_20" | "fast_2_day";
  operator_attested_at?: string | null;
  paused_reason?: string | null;
  user_paused?: boolean;
  created_at: string;
}

export function useEmailCampaigns(scope: "platform" | "org", organizationId: string | null) {
  const scopeKey = `${scope}:${organizationId || ""}`;
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
  const requestSequence = useRef(0);
  const [state, setState] = useState({
    scopeKey, campaigns: [] as EmailCampaign[], loading: true, loadError: null as string | null,
  });
  const current = state.scopeKey === scopeKey;
  const campaigns = current ? state.campaigns : [];
  const loading = current ? state.loading : true;
  const loadError = current ? state.loadError : null;

  const refresh = useCallback(async () => {
    if (activeScope.current !== scopeKey) return;
    const sequence = ++requestSequence.current;
    const isCurrent = () => activeScope.current === scopeKey && sequence === requestSequence.current;
    if (scope === "org" && !organizationId) {
      setState({ scopeKey, campaigns: [], loading: false, loadError: null });
      return;
    }
    setState(previous => ({
      scopeKey, campaigns: previous.scopeKey === scopeKey ? previous.campaigns : [],
      loading: true, loadError: null,
    }));
    try {
      let q = supabase.from("email_campaigns").select("*").eq("scope", scope).order("created_at", { ascending: false });
      if (scope === "org" && organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q;
      if (error) throw error;
      if (isCurrent()) setState({ scopeKey, campaigns: (data || []) as EmailCampaign[], loading: false, loadError: null });
    } catch {
      if (isCurrent()) setState(previous => ({
        ...previous, loading: false, loadError: "Не удалось загрузить кампании. Повторите попытку.",
      }));
    }
  }, [scope, organizationId, scopeKey]);

  useEffect(() => {
    void refresh();
    return () => { requestSequence.current++; };
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    if (activeScope.current !== scopeKey || (scope === "org" && !organizationId)) return;
    try {
      let query = supabase.from("email_campaigns").delete().eq("id", id).eq("scope", scope);
      if (scope === "org") query = query.eq("organization_id", organizationId!);
      const { data, error } = await query.select("id");
      if (activeScope.current !== scopeKey) return;
      if (error || data?.length !== 1 || data[0].id !== id) {
        toast.error("Удаление не подтверждено. Обновите список кампаний.");
        return;
      }
      toast.success("Кампания удалена");
      await refresh();
    } catch {
      if (activeScope.current === scopeKey) toast.error("Удаление не подтверждено. Обновите список кампаний.");
    }
  }, [scope, organizationId, scopeKey, refresh]);

  const launch = useCallback(async (id: string) => {
    if (activeScope.current !== scopeKey || (scope === "org" && !organizationId)) return;
    let feedback;
    try {
      const { data, error } = await supabase.functions.invoke("run-email-campaign", { body: { campaignId: id } });
      feedback = await readCampaignRunFeedback(data, error);
    } catch (error) {
      feedback = await readCampaignRunFeedback(null, error);
    }
    if (activeScope.current !== scopeKey) return;
    toast[feedback.level](feedback.message);
    await refresh();
  }, [scope, organizationId, scopeKey, refresh]);

  return { campaigns, loading, loadError, refresh, remove, launch };
}
