import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { classifyDataError, type UserFacingErrorKind } from "@/utils/isTransientNetworkError";

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
 * Phase 5C.1.c.1:
 *  - Distinguish `loading` (initial) from `refreshing` (background refetch).
 *  - Surface `errorKind` via classifyDataError instead of silently returning null.
 *  - On background refetch failure, keep the previously loaded status intact.
 *  - `configured === false` is a valid status (SMTP not set), not an error.
 *  - Never leave the hook in an eternal `loading=true` after an error.
 */
export function useEmailWarmup(scopeKey: string | null) {
  const [status, setStatus] = useState<WarmupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorKind, setErrorKind] = useState<UserFacingErrorKind | null>(null);
  const hasDataRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!scopeKey) return;
    const isInitial = !hasDataRef.current;
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    try {
      if (scopeKey === "platform") {
        const { data, error } = await supabase.rpc("get_warmup_status", { p_scope_key: "platform" });
        if (error) {
          setErrorKind(classifyDataError(error));
          if (isInitial) setStatus(null);
          return;
        }
        if (data) {
          setStatus(data as unknown as WarmupStatus);
          setErrorKind(null);
          hasDataRef.current = true;
        }
      } else if (UUID_RE.test(scopeKey)) {
        const { data, error } = await supabase.rpc("get_org_email_delivery_status", {
          p_organization_id: scopeKey,
        });
        if (error) {
          setErrorKind(classifyDataError(error));
          if (isInitial) setStatus(null);
          return;
        }
        if (!data) {
          // Successful response with empty data is a "not configured" signal too.
          setStatus({
            scope_key: scopeKey,
            day: 1,
            daily_limit: 0,
            sent_today: 0,
            remaining: 0,
            total_sent: 0,
            started_at: new Date().toISOString(),
            configured: false,
            safe_warmup_enabled: true,
          });
          setErrorKind(null);
          hasDataRef.current = true;
          return;
        }
        const d = data as any;
        if (d.configured === false) {
          setStatus({
            scope_key: scopeKey,
            day: 1,
            daily_limit: 0,
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
        setErrorKind(null);
        hasDataRef.current = true;
      }
    } catch (err) {
      setErrorKind(classifyDataError(err));
      if (isInitial) setStatus(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [scopeKey]);

  useEffect(() => {
    hasDataRef.current = false;
    setStatus(null);
    setErrorKind(null);
    refresh();
  }, [refresh]);

  return { status, loading, refreshing, errorKind, refresh, retry: refresh };
}
