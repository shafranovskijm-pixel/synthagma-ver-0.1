/**
 * Виджет «Требует внимания сегодня» — карточки с числами по 4 ключевым событиям:
 *  - Заявки на зачисление (pending)
 *  - Домашние работы на проверку
 *  - Неоплаченные счета (>7 дней)
 *  - Подписи, истекающие в ближайшие 3 дня
 *
 * Скрывается, если все счётчики = 0.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Inbox, FileCheck2, Receipt, PenTool, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";

interface AttentionCounts {
  enrollmentRequests: number;
  homeworkPending: number;
  billingUnpaid: number;
  signaturesExpiring: number;
}

async function fetchCounts(orgId: string): Promise<AttentionCounts> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const threeDaysFromNow = new Date(Date.now() + 3 * 86400_000).toISOString();
  const now = new Date().toISOString();

  // Cast to any to avoid excessive type instantiation depth across multiple parallel queries.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const [enrollment, homework, billing, signatures] = await Promise.all([
    sb.from("enrollment_requests").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("status", "pending"),
    sb.from("homework_submissions").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("status", "pending")
      .then((r: { count: number | null }) => r, () => ({ count: 0 })),
    sb.from("org_billing_documents").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("doc_kind", "invoice")
      .is("paid_at", null).lte("created_at", sevenDaysAgo),
    sb.from("document_signatures").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).in("status", ["sent", "viewed"])
      .lte("expires_at", threeDaysFromNow).gte("expires_at", now),
  ]);

  return {
    enrollmentRequests: enrollment.count ?? 0,
    homeworkPending: homework.count ?? 0,
    billingUnpaid: billing.count ?? 0,
    signaturesExpiring: signatures.count ?? 0,
  };
}

interface AttentionCardProps {
  label: string;
  count: number;
  icon: React.ElementType;
  accent: string;
  onClick: () => void;
}

function AttentionCard({ label, count, icon: Icon, accent, onClick }: AttentionCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 p-3.5 rounded-xl",
        "border border-border bg-card hover:border-primary/40 hover:shadow-sm",
        "transition-all text-left w-full overflow-hidden",
      )}
    >
      <div
        className={cn(
          "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
          accent,
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-xl font-bold leading-tight">{count}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </button>
  );
}

export function RequiresAttentionWidget() {
  const navigate = useNavigate();
  const d = useOrgDashboard();
  const orgId = d.organizationId;

  const { data, isLoading } = useQuery({
    queryKey: orgId ? qk.org.attentionWidget(orgId) : ["__noop__"],
    enabled: !!orgId,
    queryFn: () => fetchCounts(orgId!),
    staleTime: 60 * 1000,
    refetchOnMount: true,
  });

  if (isLoading || !data) return null;
  const total =
    data.enrollmentRequests +
    data.homeworkPending +
    data.billingUnpaid +
    data.signaturesExpiring;
  if (total === 0) return null;

  return (
    <Card className="p-4 mb-4 rounded-2xl border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Требует внимания
        </h3>
        <span className="text-xs text-muted-foreground">
          Всего событий: <span className="font-semibold text-foreground">{total}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {data.enrollmentRequests > 0 && (
          <AttentionCard
            label="Заявки на зачисление"
            count={data.enrollmentRequests}
            icon={Inbox}
            accent="bg-blue-500/15 text-blue-600 dark:text-blue-400"
            onClick={() => d.tabNavigation.setActiveTab("students" as never)}
          />
        )}
        {data.homeworkPending > 0 && (
          <AttentionCard
            label="Домашние на проверку"
            count={data.homeworkPending}
            icon={FileCheck2}
            accent="bg-amber-500/15 text-amber-600 dark:text-amber-400"
            onClick={() => d.tabNavigation.setActiveTab("homework-review" as never)}
          />
        )}
        {data.billingUnpaid > 0 && (
          <AttentionCard
            label="Счета без оплаты >7 дн."
            count={data.billingUnpaid}
            icon={Receipt}
            accent="bg-rose-500/15 text-rose-600 dark:text-rose-400"
            onClick={() => d.tabNavigation.setActiveTab("payments" as never)}
          />
        )}
        {data.signaturesExpiring > 0 && (
          <AttentionCard
            label="Подписи, ≤3 дн. до истечения"
            count={data.signaturesExpiring}
            icon={PenTool}
            accent="bg-violet-500/15 text-violet-600 dark:text-violet-400"
            onClick={() => navigate("/organization/signatures")}
          />
        )}
      </div>
    </Card>
  );
}
