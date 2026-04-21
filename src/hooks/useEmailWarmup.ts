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
}

export function useEmailWarmup(scopeKey: string | null) {
  const [status, setStatus] = useState<WarmupStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!scopeKey) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_warmup_status", { p_scope_key: scopeKey });
      if (!error && data) setStatus(data as unknown as WarmupStatus);
    } finally {
      setLoading(false);
    }
  }, [scopeKey]);

  useEffect(() => { refresh(); }, [refresh]);

  return { status, loading, refresh };
}
