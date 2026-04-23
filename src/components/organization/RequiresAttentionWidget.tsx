/**
 * Виджет «Требует внимания сегодня» — карточки с числами по 4 ключевым событиям:
 *  - Заявки на зачисление (pending)
 *  - Домашние работы на проверку
 *  - Неоплаченные счета (>7 дней)
 *  - Подписи, истекающие в ближайшие 3 дня
 *
 * Скрывается, если все счётчики = 0.
 *
 * Inline-режим: клик по карточке «Заявки на зачисление» раскрывает
 * превью 3 заявок с кнопками «Одобрить» / «Отклонить» прямо в виджете.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Inbox, FileCheck2, Receipt, PenTool, ChevronRight, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface AttentionCounts {
  enrollmentRequests: number;
  homeworkPending: number;
  billingUnpaid: number;
  signaturesExpiring: number;
}

interface EnrollmentRequestPreview {
  id: string;
  full_name: string | null;
  email: string | null;
  course_title: string | null;
  created_at: string;
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

async function fetchEnrollmentPreview(orgId: string): Promise<EnrollmentRequestPreview[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("enrollment_requests")
    .select("id, full_name, email, created_at, courses(title)")
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(3);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) || []).map((r: any) => ({
    id: r.id,
    full_name: r.full_name,
    email: r.email,
    course_title: r.courses?.title ?? null,
    created_at: r.created_at,
  }));
}

interface AttentionCardProps {
  label: string;
  count: number;
  icon: React.ElementType;
  accent: string;
  onClick: () => void;
  active?: boolean;
}

function AttentionCard({ label, count, icon: Icon, accent, onClick, active }: AttentionCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 p-3.5 rounded-xl",
        "border bg-card hover:shadow-sm transition-all text-left w-full overflow-hidden",
        active ? "border-primary/60 ring-2 ring-primary/20" : "border-border hover:border-primary/40",
      )}
    >
      <div className={cn("shrink-0 w-10 h-10 rounded-lg flex items-center justify-center", accent)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-xl font-bold leading-tight">{count}</p>
      </div>
      <ChevronRight
        className={cn(
          "w-4 h-4 text-muted-foreground/60 transition-all",
          "group-hover:text-primary group-hover:translate-x-0.5",
          active && "rotate-90 text-primary",
        )}
      />
    </button>
  );
}

export function RequiresAttentionWidget() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const d = useOrgDashboard();
  const orgId = d.organizationId;
  const [expanded, setExpanded] = useState<"enrollment" | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: orgId ? qk.org.attentionWidget(orgId) : ["__noop__"],
    enabled: !!orgId,
    queryFn: () => fetchCounts(orgId!),
    staleTime: 60 * 1000,
    refetchOnMount: true,
  });

  const { data: enrollmentPreview = [] } = useQuery({
    queryKey: orgId ? [...qk.org.enrollmentRequests(orgId), "preview"] : ["__noop__"],
    enabled: !!orgId && expanded === "enrollment",
    queryFn: () => fetchEnrollmentPreview(orgId!),
    staleTime: 30 * 1000,
  });

  if (isLoading || !data) return null;
  const total =
    data.enrollmentRequests +
    data.homeworkPending +
    data.billingUnpaid +
    data.signaturesExpiring;
  if (total === 0) return null;

  const handleAct = async (id: string, status: "approved" | "rejected") => {
    if (!orgId) return;
    setActingId(id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("enrollment_requests")
        .update({ status, decided_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success(status === "approved" ? "Заявка одобрена" : "Заявка отклонена");
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.org.attentionWidget(orgId) }),
        qc.invalidateQueries({ queryKey: qk.org.enrollmentRequests(orgId) }),
      ]);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setActingId(null);
    }
  };

  const toggleEnrollment = () => {
    if (expanded === "enrollment") {
      setExpanded(null);
    } else if (data.enrollmentRequests > 3) {
      // Если заявок много — сразу в полный список
      d.tabNavigation.setActiveTab("students" as never);
    } else {
      setExpanded("enrollment");
    }
  };

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
            onClick={toggleEnrollment}
            active={expanded === "enrollment"}
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

      {/* Inline-разворот для заявок на зачисление */}
      {expanded === "enrollment" && (
        <div className="mt-3 pt-3 border-t border-border/60 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {enrollmentPreview.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">
              Загружаем заявки...
            </div>
          ) : (
            enrollmentPreview.map((req) => (
              <div
                key={req.id}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-foreground">
                    {req.full_name || req.email || "Студент"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {req.course_title ?? "Курс"} •{" "}
                    {format(new Date(req.created_at), "d MMM, HH:mm", { locale: ru })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-primary hover:bg-primary/10"
                  onClick={() => handleAct(req.id, "approved")}
                  disabled={actingId === req.id}
                  aria-label="Одобрить"
                >
                  {actingId === req.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() => handleAct(req.id, "rejected")}
                  disabled={actingId === req.id}
                  aria-label="Отклонить"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
          {data.enrollmentRequests > 3 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7 mt-1"
              onClick={() => d.tabNavigation.setActiveTab("students" as never)}
            >
              Показать все ({data.enrollmentRequests})
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
