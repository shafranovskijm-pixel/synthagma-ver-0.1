import { useDocumentsKpi } from "@/hooks/useDocumentsKpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  FileSignature, FileCheck, GraduationCap, AlertTriangle,
  TrendingUp, Clock, ShieldAlert, Inbox, RefreshCw, FileText, Receipt, Download
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar
} from "recharts";
import { toast } from "sonner";

interface Props {
  organizationId: string;
  onNavigate?: (tab: string, prefilter?: Record<string, string>) => void;
}

interface KpiCardProps {
  title: string;
  value: number | string;
  hint?: string;
  icon: React.ElementType;
  iconColor?: string;
  variant?: "default" | "warning" | "danger" | "success";
  badge?: { text: string; tone?: "default" | "warning" | "danger" | "success" };
  onClick?: () => void;
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

function KpiCard({ title, value, hint, icon: Icon, iconColor = "text-primary", variant = "default", badge, onClick }: KpiCardProps) {
  const clickable = !!onClick;
  return (
    <Card
      className={`${variantStyles[variant]} transition-all min-w-0 overflow-hidden ${clickable ? "hover:shadow-md hover:border-primary/40 cursor-pointer hover:-translate-y-0.5" : "hover:shadow-md"}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
    >
      <CardContent className="p-4 min-w-0">
        <div className="flex items-start justify-between mb-2 gap-2 min-w-0">
          <Icon className={`w-5 h-5 shrink-0 ${iconColor}`} />
          {badge && (
            <Badge variant="outline" className={`${badgeStyles[badge.tone || "default"]} shrink-0 truncate max-w-[60%]`}>
              {badge.text}
            </Badge>
          )}
        </div>
        <p className="text-xl xl:text-2xl font-semibold tabular-nums truncate">{value}</p>
        <p className="text-xs text-muted-foreground mt-1 truncate">{title}</p>
        {hint && <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function DocumentsKpiDashboard({ organizationId, onNavigate }: Props) {
  const { kpi, loading, refresh } = useDocumentsKpi(organizationId);

  if (loading && !kpi) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
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

  const handleExport = () => {
    if (!kpi) return;
    const rows: [string, string | number][] = [
      ["Раздел", "Значение"],
      ["Подписания — отправлено", kpi.signatures_total],
      ["Подписания — подписано", kpi.signatures_signed],
      ["Подписания — ожидает", kpi.signatures_pending],
      ["Подписания — истёкшие", kpi.signatures_expired],
      ["Подписания — отказы", kpi.signatures_rejected],
      ["Конверсия в подпись, %", kpi.signing_conversion],
      ["Документы об образовании — всего", kpi.education_docs_total],
      ["Документы об образовании — за месяц", kpi.education_docs_this_month],
      ["Документы — дубликаты", kpi.duplicates_count],
      ["Документы — аннулированные", kpi.cancelled_count],
      ["Истекают в 30 дней", kpi.expiring_soon],
      ["Просрочены", kpi.expired_count],
      ["Договоры — всего", kpi.contracts_total],
      ["Договоры — подписано", kpi.contracts_signed],
      ["Договоры — ожидает", kpi.contracts_pending],
      ["КП — всего", kpi.proposals_total],
      ["КП — принято", kpi.proposals_accepted],
      ["Конверсия КП → договор, %", kpi.proposal_to_contract_conversion],
      ["Запросы ПД — открыто", kpi.pd_requests_open],
      ["Запросы ПД — просрочено", kpi.pd_requests_overdue],
      ["Входящие — всего", kpi.incoming_total],
      ["Входящие — за месяц", kpi.incoming_this_month],
    ];
    const csv = "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `documents-kpi-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("KPI выгружены в CSV");
  };

  // Helpers for navigation prefilters
  const goSig = (status: string) => onNavigate?.("signatures", { status });
  const goPd = () => onNavigate?.("pd_requests");
  const goIncoming = () => onNavigate?.("incoming");
  const goCounter = () => onNavigate?.("counterparties");
  const goCertificates = () => onNavigate?.("certificates");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Сводка документооборота</h3>
          <p className="text-xs text-muted-foreground">Метрики обновляются в реальном времени · клик по карточке открывает раздел с фильтром</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Экспорт CSV</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Обновить</span>
          </Button>
        </div>
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
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard title="Всего отправлено" value={kpi.signatures_total} icon={FileSignature} iconColor="text-indigo-500"
            onClick={() => goSig("all")} />
          <KpiCard title="Подписано" value={kpi.signatures_signed} icon={FileCheck} iconColor="text-emerald-500" variant="success"
            badge={{ text: `${kpi.signing_conversion}%`, tone: "success" }} hint="Конверсия в подпись"
            onClick={() => goSig("signed")} />
          <KpiCard title="Ожидает подписи" value={kpi.signatures_pending} icon={Clock} iconColor="text-amber-500" variant={expiringTone}
            hint={kpi.expiring_soon > 0 ? `${kpi.expiring_soon} истекают в 30 дней` : undefined}
            onClick={() => goSig("sent")} />
          <KpiCard title="Истёкшие / отказы" value={kpi.signatures_expired + kpi.signatures_rejected} icon={AlertTriangle}
            iconColor="text-destructive" variant={expiredTone}
            onClick={() => goSig("expired")} />
        </div>
      </div>

      <div>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Документы об образовании</h4>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard title="Всего выдано" value={kpi.education_docs_total} icon={GraduationCap} iconColor="text-blue-500"
            onClick={goCertificates} />
          <KpiCard title="За этот месяц" value={kpi.education_docs_this_month} icon={TrendingUp} iconColor="text-emerald-500"
            onClick={goCertificates} />
          <KpiCard title="Дубликаты" value={kpi.duplicates_count} icon={FileText} iconColor="text-violet-500"
            onClick={goCertificates} />
          <KpiCard title="Аннулированные" value={kpi.cancelled_count} icon={AlertTriangle} iconColor="text-destructive"
            variant={kpi.cancelled_count > 0 ? "warning" : "default"}
            onClick={goCertificates} />
        </div>
      </div>

      <div>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Контрагенты и продажи</h4>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard title="Договоры" value={kpi.contracts_total} icon={Receipt} iconColor="text-primary"
            hint={`Подписано: ${kpi.contracts_signed} · Ожидает: ${kpi.contracts_pending}`}
            onClick={goCounter} />
          <KpiCard title="Коммерческие предложения" value={kpi.proposals_total} icon={FileText} iconColor="text-cyan-500"
            badge={kpi.proposals_total > 0 ? { text: `${kpi.proposal_to_contract_conversion}%`, tone: "success" } : undefined}
            hint="Конверсия КП → договор"
            onClick={goCounter} />
          <KpiCard title="Запросы субъектов ПД" value={kpi.pd_requests_open} icon={ShieldAlert}
            iconColor={kpi.pd_requests_overdue > 0 ? "text-destructive" : "text-emerald-500"}
            variant={pdOverdueTone}
            badge={kpi.pd_requests_overdue > 0 ? { text: `${kpi.pd_requests_overdue} просрочено`, tone: "danger" } : undefined}
            onClick={goPd} />
          <KpiCard title="Входящие документы" value={kpi.incoming_total} icon={Inbox} iconColor="text-cyan-500"
            hint={`За этот месяц: ${kpi.incoming_this_month}`}
            onClick={goIncoming} />
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
                <Line type="monotone" dataKey="signed" name="Подписано" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 3 }} />
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
