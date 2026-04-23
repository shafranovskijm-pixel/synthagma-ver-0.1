import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FrdoReadinessStats {
  total_documents: number;
  ready_for_export: number;
  missing_frdo_data: number;
  missing_birth_date: number;
  missing_snils: number;
  missing_passport: number;
  missing_gender_resolvable: number;
  missing_gender_unresolvable: number;
  missing_profession_name: number;
}

const EMPTY: FrdoReadinessStats = {
  total_documents: 0,
  ready_for_export: 0,
  missing_frdo_data: 0,
  missing_birth_date: 0,
  missing_snils: 0,
  missing_passport: 0,
  missing_gender_resolvable: 0,
  missing_gender_unresolvable: 0,
  missing_profession_name: 0,
};

export function useFrdoReadiness(organizationId: string | null | undefined) {
  const [stats, setStats] = useState<FrdoReadinessStats>(EMPTY);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_frdo_export_readiness", {
        p_organization_id: organizationId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setStats(row as FrdoReadinessStats);
      else setStats(EMPTY);
    } catch (err) {
      console.error("[useFrdoReadiness] failed", err);
      setStats(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const readinessPercent =
    stats.total_documents > 0
      ? Math.round((stats.ready_for_export / stats.total_documents) * 100)
      : 0;

  return { stats, loading, refresh, readinessPercent };
}
