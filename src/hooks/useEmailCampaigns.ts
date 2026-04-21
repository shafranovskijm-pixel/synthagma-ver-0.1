import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  status: "draft" | "sending" | "completed" | "failed" | "paused";
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  open_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function useEmailCampaigns(scope: "platform" | "org", organizationId: string | null) {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from("email_campaigns").select("*").eq("scope", scope).order("created_at", { ascending: false });
      if (scope === "org" && organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q;
      if (error) throw error;
      setCampaigns((data || []) as EmailCampaign[]);
    } catch (e: any) {
      toast.error("Ошибка загрузки кампаний: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [scope, organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
    if (error) { toast.error("Ошибка удаления"); return; }
    toast.success("Кампания удалена");
    setCampaigns(prev => prev.filter(c => c.id !== id));
  }, []);

  const launch = useCallback(async (id: string) => {
    const { data, error } = await supabase.functions.invoke("run-email-campaign", { body: { campaignId: id } });
    if (error) { toast.error("Не удалось запустить: " + error.message); return; }
    if (data?.error) { toast.error(data.error); return; }
    toast.success("Кампания запущена");
    refresh();
  }, [refresh]);

  return { campaigns, loading, refresh, remove, launch };
}
