import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OrgSmtpSettings {
  organization_id: string;
  host: string;
  port: number;
  username: string;
  from_email: string;
  from_name: string | null;
  encryption: string;
  is_verified: boolean;
  last_test_at: string | null;
  last_test_error: string | null;
}

export function useOrgSmtp(organizationId: string | null) {
  const [settings, setSettings] = useState<OrgSmtpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("org_smtp_settings")
        .select("organization_id, host, port, username, from_email, from_name, encryption, is_verified, last_test_at, last_test_error")
        .eq("organization_id", organizationId)
        .maybeSingle();
      setSettings(data as OrgSmtpSettings | null);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async (input: {
    host: string; port: number; username: string; password?: string;
    from_email: string; from_name?: string; encryption: string;
  }) => {
    if (!organizationId) return false;
    setSaving(true);
    try {
      const payload: any = {
        organization_id: organizationId,
        host: input.host.trim(),
        port: input.port,
        username: input.username.trim(),
        from_email: input.from_email.trim(),
        from_name: input.from_name?.trim() || null,
        encryption: input.encryption,
        is_verified: false,
      };
      if (input.password && input.password.trim()) {
        payload.password_encrypted = input.password;
      }
      const { error } = await supabase
        .from("org_smtp_settings")
        .upsert(payload, { onConflict: "organization_id" });
      if (error) throw error;
      toast.success("SMTP-настройки сохранены");
      await refresh();
      return true;
    } catch (e: any) {
      toast.error("Ошибка сохранения: " + e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [organizationId, refresh]);

  const testConnection = useCallback(async () => {
    if (!organizationId) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-org-smtp", {
        body: { organizationId },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success("Тестовое письмо отправлено успешно");
      } else {
        toast.error("Ошибка SMTP: " + (data?.error || "Unknown"));
      }
      await refresh();
    } catch (e: any) {
      toast.error("Не удалось проверить: " + e.message);
    } finally {
      setTesting(false);
    }
  }, [organizationId, refresh]);

  return { settings, loading, save, saving, testConnection, testing, refresh };
}
