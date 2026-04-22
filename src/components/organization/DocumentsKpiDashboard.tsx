import { useDocumentsKpi } from "@/hooks/useDocumentsKpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  FileSignature, FileCheck, GraduationCap, AlertTriangle,
  TrendingUp, Clock, ShieldAlert, Inbox, RefreshCw, FileText, Receipt
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar
} from "recharts";

interface Props {
  organizationId: string;
}

interface KpiCardProps {
  title: string;
  value: number | string;
  hint?: string;
  icon: React.ElementType;
  iconColor?: string;
  variant?: "default" | "warning" | "danger" | "success";
  badge?: { text: string; tone?: "default" | "warning" | "danger" | "success" };
}

const variantStyles: Record<string, string> = {
  default: "border-border",
  warning: "border-amber-500/30 bg-amber-500/5",
  danger: "border-destructive/30 bg-destructive/5",
  success: "border-emerald-500/30 bg-emerald-500/5",
};

const badgeStyles: Record<string, string> = {
  default: "bg-muted text-muted-foreground",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/15 text-destructive",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

function KpiCard({ title, value, hint, icon: Icon, iconColor = "text-primary", variant = "default", badge }: KpiCardProps) {
  return (
    <Card className={`${variantStyles[variant]} transition-shadow hover:shadow-md`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <Icon className={`w-5 h-5 ${iconColor}`} />
          {badge && (
            <Badge variant="outline" className={badgeStyles[badge.tone || "default"]}>
              {badge.text}
            </Badge>
          )}
        </div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{title}</p>
        {hint && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function DocumentsKpiDashboard({ organizationId }: Props) {
  const { kpi, loading, refresh } = useDocumentsKpi(organizationId);

  if (loading && !kpi) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!kpi) {
    return <div className="text-center py-12 text-muted-foreground">Нет данных для отображения</div>;
  }

  const expiringTone = kpi.expiring_soon > 0 ? "warning" : "default";
  const expiredTone = kpi.expired_count > 0 ? "danger" : "default";
  const pdOverdueTone = kpi.pd_requests_overdue > 0 ? "danger" : kpi.pd_requests_open > 0 ? "warning" : "default";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Сводка документооборота</h3>
          <p className="text-xs text-muted-foreground">Метрики обновляются в реальном времени</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh}>
          <RefreshCw className="w-3.5 h-3.5" />
          Обновить
        </Button>
      </div>

      {/* Алерты */}
      {(kpi.expired_count > 0 || kpi.pd_requests_overdue > 0) && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Требует внимания</p>
            <ul className="text-xs mt-1 space-y-0.5 text-foreground/80">
              {kpi.expired_count > 0 && <li>• {kpi.expired_count} подписаний с истёкшим сроком</li>}
              {kpi.pd_requests_overdue > 0 && <li>• {kpi.pd_requests_overdue} просроченных запросов ПД (152-ФЗ требует ответа за 30 дней)</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Основные метрики */}
      <div>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Подписания (ПЭП)</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="Всего отправлено" value={kpi.signatures_total} icon={FileSignature} iconColor="text-indigo-500" />
          <KpiCard title="Подписано" value={kpi.signatures_signed} icon={FileCheck} iconColor="text-emerald-500" variant="success"
            badge={{ text: `${kpi.signing_conversion}%`, tone: "success" }} hint="Конверсия в подпись" />
          <KpiCard title="Ожидает подписи" value={kpi.signatures_pending} icon={Clock} iconColor="text-amber-500" variant={expiringTone}
            hint={kpi.expiring_soon > 0 ? `${kpi.expiring_soon} истекают в 30 дней` : undefined} />
          <KpiCard title="Истёкшие / отказы" value={kpi.signatures_expired + kpi.signatures_rejected} icon={AlertTriangle}
            iconColor="text-destructive" variant={expiredTone} />
        </div>
      </div>

      <div>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Документы об образовании</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="Всего выдано" value={kpi.education_docs_total} icon={GraduationCap} iconColor="text-blue-500" />
          <KpiCard title="За этот месяц" value={kpi.education_docs_this_month} icon={TrendingUp} iconColor="text-emerald-500" />
          <KpiCard title="Дубликаты" value={kpi.duplicates_count} icon={FileText} iconColor="text-violet-500" />
          <KpiCard title="Аннулированные" value={kpi.cancelled_count} icon={AlertTriangle} iconColor="text-destructive"
            variant={kpi.cancelled_count > 0 ? "warning" : "default"} />
        </div>
      </div>

      <div>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Контрагенты и продажи</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="Договоры" value={kpi.contracts_total} icon={Receipt} iconColor="text-primary"
            hint={`Подписано: ${kpi.contracts_signed} · Ожидает: ${kpi.contracts_pending}`} />
          <KpiCard title="Коммерческие предложения" value={kpi.proposals_total} icon={FileText} iconColor="text-cyan-500"
            badge={kpi.proposals_total > 0 ? { text: `${kpi.proposal_to_contract_conversion}%`, tone: "success" } : undefined}
            hint="Конверсия КП → договор" />
          <KpiCard title="Запросы субъектов ПД" value={kpi.pd_requests_open} icon={ShieldAlert}
            iconColor={kpi.pd_requests_overdue > 0 ? "text-destructive" : "text-emerald-500"}
            variant={pdOverdueTone}
            badge={kpi.pd_requests_overdue > 0 ? { text: `${kpi.pd_requests_overdue} просрочено`, tone: "danger" } : undefined} />
          <KpiCard title="Входящие документы" value={kpi.incoming_total} icon={Inbox} iconColor="text-cyan-500"
            hint={`За этот месяц: ${kpi.incoming_this_month}`} />
        </div>
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSignature className="w-4 h-4 text-indigo-500" />
              Динамика подписаний (6 мес.)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={kpi.monthly_signatures}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="sent" name="Отправлено" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="signed" name="Подписано" stroke="hsl(142 76% 36%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-blue-500" />
              Выдано документов об образовании (6 мес.)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={kpi.monthly_education_docs}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" name="Выдано" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
