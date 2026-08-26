/**
 * Виджет «Требует внимания сегодня» — карточки с числами по 4 ключевым событиям:
 *  - Заявки на зачисление (pending)
 *  - Домашние работы на проверку
 *  - Неоплаченные счета (>7 дней)
 *  - Подписи, истекающие в ближайшие 3 дня
 *
 * Скрывается, если все счётчики = 0.
 *
 * Клик по карточке «Заявки на зачисление» раскрывает превью 3 заявок.
 * Решение по заявке выполняется только в штатной вкладке курса «Заявки»,
 * где подтверждение связано с созданием и проверкой зачисления.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Inbox, FileCheck2, Receipt, PenTool, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { toast } from "sonner";
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
  course_id: string | null;
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
  const { data, error } = await (supabase as any)
    .from("enrollment_requests")
    .select("id, course_id, full_name, email, created_at, courses(title)")
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) || []).map((r: any) => ({
    id: r.id,
    course_id: r.course_id,
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
  const d = useOrgDashboard();
  const orgId = d.organizationId;
  const [expanded, setExpanded] = useState<"enrollment" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: orgId ? qk.org.attentionWidget(orgId) : ["__noop__"],
    enabled: !!orgId,
    queryFn: () => fetchCounts(orgId!),
    staleTime: 60 * 1000,
    refetchOnMount: true,
  });

  const {
    data: enrollmentPreview = [],
    isLoading: isEnrollmentPreviewLoading,
    isError: isEnrollmentPreviewError,
  } = useQuery({
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

  const openRequestFlow = (request: EnrollmentRequestPreview) => {
    if (!request.course_id) {
      d.tabNavigation.setActiveTab("courses" as never);
      toast.warning(
        "У заявки не указан курс. Выберите курс и откройте вкладку «Заявки» — решение из виджета не выполнялось.",
      );
      return;
    }

    d.tabNavigation.openCourseDetails(request.course_id);
    toast.info(
      "Откройте вкладку «Заявки» в карточке курса. Только там подтверждение создаёт и проверяет зачисление.",
    );
  };

  const toggleEnrollment = () => {
    setExpanded(expanded === "enrollment" ? null : "enrollment");
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
          <p className="text-xs text-muted-foreground px-1 pb-1">
            Откройте курс и подтвердите заявку во вкладке «Заявки». Виджет не меняет статус и не зачисляет ученика.
          </p>
          {isEnrollmentPreviewLoading ? (
            <div className="text-xs text-muted-foreground text-center py-3">
              Загружаем заявки...
            </div>
          ) : isEnrollmentPreviewError ? (
            <div className="text-xs text-destructive text-center py-3">
              Не удалось загрузить заявки. Перейдите в «Курсы» и откройте вкладку «Заявки» нужного курса.
            </div>
          ) : enrollmentPreview.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">
              Новых заявок в превью нет. Обновите страницу или проверьте заявки внутри курса.
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
                  variant="outline"
                  className="h-8 shrink-0 gap-1"
                  onClick={() => openRequestFlow(req)}
                >
                  {req.course_id ? "Открыть заявку" : "Выбрать курс"}
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))
          )}
          {data.enrollmentRequests > 3 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7 mt-1"
              onClick={() => {
                d.tabNavigation.setActiveTab("courses" as never);
                toast.info("Откройте нужный курс и перейдите во вкладку «Заявки».");
              }}
            >
              Открыть курсы — всего заявок {data.enrollmentRequests}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
