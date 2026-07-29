import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WarmupStatus {
  scope_key: string;
  day: number;
  daily_limit: number;
  sent_today: number;
  remaining: number;
  total_sent: number;
  started_at: string;
  /** true when the org has SMTP configured; only meaningful in org scope */
  configured?: boolean;
  /** whether safe warmup ladder is currently in effect (org scope) */
  safe_warmup_enabled?: boolean;
  provider_daily_limit?: number;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Phase 5C.1.c:
 *  - For scopeKey === 'platform' → keep platform warmup RPC.
 *  - For a UUID scopeKey (== organization_id) → call get_org_email_delivery_status.
 *    The browser NEVER sends an arbitrary scope_key for org scope; the server
 *    computes the hashed sender key internally.
 */
export function useEmailWarmup(scopeKey: string | null) {
  const [status, setStatus] = useState<WarmupStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!scopeKey) return;
    setLoading(true);
    try {
      if (scopeKey === "platform") {
        const { data, error } = await supabase.rpc("get_warmup_status", { p_scope_key: "platform" });
        if (!error && data) setStatus(data as unknown as WarmupStatus);
      } else if (UUID_RE.test(scopeKey)) {
        const { data, error } = await supabase.rpc("get_org_email_delivery_status", {
          p_organization_id: scopeKey,
        });
        if (!error && data) {
          const d = data as any;
          if (d.configured === false) {
            setStatus({
              scope_key: scopeKey,
              day: 1,
              daily_limit: 10,
              sent_today: 0,
              remaining: 0,
              total_sent: 0,
              started_at: new Date().toISOString(),
              configured: false,
              safe_warmup_enabled: true,
            });
          } else {
            setStatus({
              scope_key: scopeKey,
              day: d.day,
              daily_limit: d.effective_daily_limit,
              sent_today: d.sent_today,
              remaining: d.remaining,
              total_sent: d.total_sent,
              started_at: d.started_at,
              configured: true,
              safe_warmup_enabled: d.safe_warmup_enabled,
              provider_daily_limit: d.provider_daily_limit,
            });
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [scopeKey]);

  useEffect(() => { refresh(); }, [refresh]);

  return { status, loading, refresh };
}
