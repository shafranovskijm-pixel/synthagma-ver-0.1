import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DocumentsKpi {
  // Подписания
  signatures_total: number;
  signatures_signed: number;
  signatures_pending: number;
  signatures_expired: number;
  signatures_rejected: number;
  signing_conversion: number;

  // Документы об образовании
  education_docs_total: number;
  education_docs_this_month: number;
  duplicates_count: number;
  cancelled_count: number;

  // Истекающие документы
  expiring_soon: number;
  expired_count: number;

  // Договоры с контрагентами
  contracts_total: number;
  contracts_signed: number;
  contracts_pending: number;

  // КП
  proposals_total: number;
  proposals_accepted: number;
  proposal_to_contract_conversion: number;

  // Запросы ПД
  pd_requests_open: number;
  pd_requests_overdue: number;

  // Входящие
  incoming_total: number;
  incoming_this_month: number;

  // Динамика
  monthly_signatures: { month: string; sent: number; signed: number }[];
  monthly_education_docs: { month: string; count: number }[];
}

export function useDocumentsKpi(organizationId: string | null) {
  const [kpi, setKpi] = useState<DocumentsKpi | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      // Single RPC call instead of 22 parallel queries
      const { data, error } = await supabase.rpc("get_documents_kpi", {
        p_organization_id: organizationId,
      });
      if (error) throw error;
      setKpi(data as unknown as DocumentsKpi);
    } catch (e: any) {
      console.error("KPI load error:", e);
      toast.error("Не удалось загрузить KPI: " + (e?.message || "ошибка"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { kpi, loading, refresh };
}
