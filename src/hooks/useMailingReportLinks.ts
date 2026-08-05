import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MailingReportLink {
  id: string;
  campaign_id: string;
  token: string;
  is_active: boolean;
  expires_at: string | null;
  view_count: number;
  created_at: string;
}

function makeToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function useMailingReportLinks(organizationId: string | null) {
  const [links, setLinks] = useState<MailingReportLink[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId) {
      setLinks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("mailing_report_links")
      .select("id, campaign_id, token, is_active, expires_at, view_count, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) toast.error("Не удалось загрузить ссылки: " + error.message);
    setLinks((data || []) as unknown as MailingReportLink[]);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createLink = useCallback(
    async (campaignId: string, days = 30) => {
      if (!organizationId) return null;
      const token = makeToken();
      const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("mailing_report_links")
        .insert({
          campaign_id: campaignId,
          organization_id: organizationId,
          token,
          expires_at: expires,
        } as never)
        .select("id, campaign_id, token, is_active, expires_at, view_count, created_at")
        .single();
      if (error) {
        toast.error("Не удалось создать ссылку: " + error.message);
        return null;
      }
      await refresh();
      const url = `${window.location.origin}/mailing/report/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Ссылка создана и скопирована");
      } catch {
        toast.success("Ссылка создана");
      }
      return data as unknown as MailingReportLink;
    },
    [organizationId, refresh],
  );

  const setActive = useCallback(
    async (id: string, isActive: boolean) => {
      const { error } = await supabase
        .from("mailing_report_links")
        .update({ is_active: isActive } as never)
        .eq("id", id);
      if (error) {
        toast.error("Не удалось обновить ссылку");
        return;
      }
      toast.success(isActive ? "Ссылка включена" : "Ссылка отключена");
      await refresh();
    },
    [refresh],
  );

  return { links, loading, refresh, createLink, setActive };
}
