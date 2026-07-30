import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { classifyDataError, type UserFacingErrorKind } from "@/utils/isTransientNetworkError";

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
  provider_daily_limit: number;
  safe_warmup_enabled: boolean;
}

/**
 * Phase 5C.1.c.1: distinguish "SMTP not configured" (data===null AND no error)
 * from "failed to read SMTP" (SELECT error).
 *
 * Phase 5C.1.c.2: stale-response guard — a SELECT belonging to a previous
 * organizationId must never write settings, clear errors or toggle the loading
 * flags of the current request. Settings whose organization_id no longer matches
 * are discarded.
 */
export function useOrgSmtp(organizationId: string | null) {
  const [settings, setSettings] = useState<OrgSmtpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadErrorKind, setLoadErrorKind] = useState<UserFacingErrorKind | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const hasDataRef = useRef(false);
  const seqRef = useRef(0);
  const orgRef = useRef<string | null>(organizationId);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    const seq = ++seqRef.current;
    orgRef.current = organizationId;
    const isCurrent = () => seqRef.current === seq && orgRef.current === organizationId;
    const isInitial = !hasDataRef.current;
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from("org_smtp_settings")
        .select("organization_id, host, port, username, from_email, from_name, encryption, is_verified, last_test_at, last_test_error, provider_daily_limit, safe_warmup_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!isCurrent()) return;
      if (error) {
        setLoadErrorKind(classifyDataError(error));
        // Do NOT overwrite existing settings on a background refetch error.
        if (isInitial) setSettings(null);
        return;
      }
      const row = data as OrgSmtpSettings | null;
      // Defensive: never accept a row belonging to another organization.
      if (row && row.organization_id !== organizationId) return;
      setSettings(row);
      setLoadErrorKind(null);
      hasDataRef.current = true;
      setLoaded(true);
    } catch (err) {
      if (!isCurrent()) return;
      setLoadErrorKind(classifyDataError(err));
      if (isInitial) setSettings(null);
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [organizationId]);

  useEffect(() => {
    seqRef.current++;
    orgRef.current = organizationId;
    hasDataRef.current = false;
    setSettings(null);
    setLoaded(false);
    setLoadErrorKind(null);
    setRefreshing(false);
    setLoading(true);
    refresh();
  }, [refresh, organizationId]);

  const save = useCallback(async (input: {
    host: string; port: number; username: string; password?: string;
    from_email: string; from_name?: string; encryption: string;
    provider_daily_limit?: number;
    safe_warmup_enabled?: boolean;
  }) => {
    if (!organizationId) return false;
    setSaving(true);
    try {
      const cap = Math.max(1, Math.min(50, Math.round(input.provider_daily_limit ?? 50)));
      const payload: any = {
        organization_id: organizationId,
        host: input.host.trim(),
        port: input.port,
        username: input.username.trim(),
        from_email: input.from_email.trim(),
        from_name: input.from_name?.trim() || null,
        encryption: input.encryption,
        provider_daily_limit: cap,
        safe_warmup_enabled: input.safe_warmup_enabled ?? true,
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

  return {
    settings,
    loading,
    refreshing,
    loaded,
    loadErrorKind,
    retryLoad: refresh,
    save,
    saving,
    testConnection,
    testing,
    refresh,
  };
}
