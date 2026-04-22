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
  signing_conversion: number; // %

  // Документы об образовании
  education_docs_total: number;
  education_docs_this_month: number;
  duplicates_count: number;
  cancelled_count: number;

  // Истекающие документы (в ближайшие 30 дней)
  expiring_soon: number;
  expired_count: number;

  // Договоры с контрагентами
  contracts_total: number;
  contracts_signed: number;
  contracts_pending: number;

  // КП → договор конверсия
  proposals_total: number;
  proposals_accepted: number;
  proposal_to_contract_conversion: number; // %

  // Запросы ПД
  pd_requests_open: number;
  pd_requests_overdue: number;

  // Входящие
  incoming_total: number;
  incoming_this_month: number;

  // Динамика по месяцам (последние 6 месяцев)
  monthly_signatures: { month: string; sent: number; signed: number }[];
  monthly_education_docs: { month: string; count: number }[];
}

const startOfMonth = (date = new Date()) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const monthLabel = (d: Date) => d.toLocaleString("ru-RU", { month: "short", year: "2-digit" });

export function useDocumentsKpi(organizationId: string | null) {
  const [kpi, setKpi] = useState<DocumentsKpi | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const monthStart = startOfMonth().toISOString();
      const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const nowIso = new Date().toISOString();

      // 6 months range for trends
      const sixMonthsAgo = startOfMonth(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)).toISOString();

      const [
        sigAll,
        sigSigned,
        sigPending,
        sigExpired,
        sigRejected,
        eduAll,
        eduMonth,
        duplicates,
        cancelled,
        expiringSoon,
        expiredDocs,
        contractsAll,
        contractsSigned,
        contractsPending,
        proposalsAll,
        proposalsAccepted,
        pdOpen,
        pdOverdue,
        incomingAll,
        incomingMonth,
        sigTrend,
        eduTrend,
      ] = await Promise.all([
        supabase.from("document_signatures").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabase.from("document_signatures").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "signed"),
        supabase.from("document_signatures").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["sent", "viewed"]),
        supabase.from("document_signatures").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "expired"),
        supabase.from("document_signatures").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "rejected"),
        supabase.from("education_document_records").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabase.from("education_document_records").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", monthStart),
        supabase.from("education_document_records").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("document_status", "duplicate"),
        supabase.from("education_document_records").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("document_status", "cancelled"),
        supabase.from("document_signatures").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["sent", "viewed"]).lte("expires_at", in30Days).gte("expires_at", nowIso),
        supabase.from("document_signatures").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["sent", "viewed"]).lt("expires_at", nowIso),
        supabase.from("company_documents").select("id", { count: "exact", head: true }).eq("type", "contract"),
        supabase.from("company_documents").select("id", { count: "exact", head: true }).eq("type", "contract").eq("is_paid", true),
        supabase.from("company_documents").select("id", { count: "exact", head: true }).eq("type", "contract").eq("is_paid", false),
        supabase.from("commercial_proposals").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabase.from("commercial_proposals").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["accepted", "signed"]),
        supabase.from("data_subject_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["new", "in_progress"]),
        supabase.from("data_subject_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["new", "in_progress"]).lt("due_date", nowIso),
        supabase.from("incoming_documents").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabase.from("incoming_documents").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", monthStart),
        supabase.from("document_signatures").select("created_at, signed_at, status").eq("organization_id", organizationId).gte("created_at", sixMonthsAgo).limit(5000),
        supabase.from("education_document_records").select("created_at").eq("organization_id", organizationId).gte("created_at", sixMonthsAgo).limit(5000),
      ]);

      // Build monthly trends
      const monthsMap: Record<string, { sent: number; signed: number }> = {};
      const eduMap: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = monthLabel(startOfMonth(d));
        monthsMap[key] = { sent: 0, signed: 0 };
        eduMap[key] = 0;
      }

      (sigTrend.data || []).forEach((row: any) => {
        const key = monthLabel(startOfMonth(new Date(row.created_at)));
        if (monthsMap[key]) monthsMap[key].sent++;
        if (row.signed_at) {
          const sk = monthLabel(startOfMonth(new Date(row.signed_at)));
          if (monthsMap[sk]) monthsMap[sk].signed++;
        }
      });
      (eduTrend.data || []).forEach((row: any) => {
        const key = monthLabel(startOfMonth(new Date(row.created_at)));
        if (eduMap[key] !== undefined) eduMap[key]++;
      });

      const monthly_signatures = Object.entries(monthsMap).map(([month, v]) => ({ month, ...v }));
      const monthly_education_docs = Object.entries(eduMap).map(([month, count]) => ({ month, count }));

      const sigTotal = sigAll.count || 0;
      const sigSignedCount = sigSigned.count || 0;
      const propTotal = proposalsAll.count || 0;
      const propAccepted = proposalsAccepted.count || 0;

      setKpi({
        signatures_total: sigTotal,
        signatures_signed: sigSignedCount,
        signatures_pending: sigPending.count || 0,
        signatures_expired: sigExpired.count || 0,
        signatures_rejected: sigRejected.count || 0,
        signing_conversion: sigTotal > 0 ? Math.round((sigSignedCount / sigTotal) * 100) : 0,
        education_docs_total: eduAll.count || 0,
        education_docs_this_month: eduMonth.count || 0,
        duplicates_count: duplicates.count || 0,
        cancelled_count: cancelled.count || 0,
        expiring_soon: expiringSoon.count || 0,
        expired_count: expiredDocs.count || 0,
        contracts_total: contractsAll.count || 0,
        contracts_signed: contractsSigned.count || 0,
        contracts_pending: contractsPending.count || 0,
        proposals_total: propTotal,
        proposals_accepted: propAccepted,
        proposal_to_contract_conversion: propTotal > 0 ? Math.round((propAccepted / propTotal) * 100) : 0,
        pd_requests_open: pdOpen.count || 0,
        pd_requests_overdue: pdOverdue.count || 0,
        incoming_total: incomingAll.count || 0,
        incoming_this_month: incomingMonth.count || 0,
        monthly_signatures,
        monthly_education_docs,
      });
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
