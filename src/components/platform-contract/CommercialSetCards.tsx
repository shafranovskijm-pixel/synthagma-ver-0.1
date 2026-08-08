import { FileText, Receipt, FileCheck, Lock, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { PlatformContractDownloadButton } from "@/components/platform-contract/PlatformContractDownloadButton";
import {
  ACT_LOCKED_REASON,
  canIssueAct,
  isInvoicePaid,
  type PlatformCommercialSet,
} from "@/lib/platform-commerce";
import { derivePlatformContractDraft, formatRub, type PlatformContractPeriodMonths } from "@/lib/platform-contract";
import type { SubscriptionPlan } from "@/constants/subscriptionPlans";

interface Props {
  set: PlatformCommercialSet;
  loading?: boolean;
  /** Действие «Открыть акт» — у клиента и админа свои маршруты. */
  onOpenAct?: () => void;
  /** Дополнительное действие по счёту (например, скачать/открыть). */
  onOpenInvoice?: () => void;
  emptyHint?: string;
}

function safeDate(value?: string | null) {
  if (!value) return "—";
  try {
    return format(new Date(value), "d MMMM yyyy", { locale: ru });
  } catch {
    return value;
  }
}

/** Единое представление комплекта: проект договора → счёт → акт. */
export function CommercialSetCards({ set, loading, onOpenAct, onOpenInvoice, emptyHint }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Загрузка документов…
      </div>
    );
  }

  const contractVars = (set.contract?.variables || {}) as any;
  const draft =
    set.contract && contractVars.plan
      ? derivePlatformContractDraft({
          plan: contractVars.plan as SubscriptionPlan,
          periodMonths: (Number(contractVars.periodMonths) === 12 ? 12 : 1) as PlatformContractPeriodMonths,
          customer: contractVars.requisites || {},
          date: contractVars.date,
          projectId: set.contract.id,
        })
      : null;

  const actAvailable = canIssueAct(set);

  if (!set.contract && !set.invoice && !set.act) {
    return <p className="text-sm text-muted-foreground py-4">{emptyHint || "Документы по тарифу пока не сформированы."}</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* Проект договора */}
      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Проект договора</span>
            <Badge variant="outline" className="text-[10px]">без номера</Badge>
          </div>
          {set.contract ? (
            <>
              <p className="text-xs text-muted-foreground">
                Тариф «{contractVars.planName || contractVars.plan}» · {contractVars.periodMonths === 12 ? "12 мес." : "1 мес."}
              </p>
              <p className="text-xs text-muted-foreground">Дата: {safeDate(set.contract.contract_date)}</p>
              {typeof contractVars.totalAmount === "number" && (
                <p className="text-xs font-medium">{formatRub(contractVars.totalAmount)}</p>
              )}
              {draft && (
                <PlatformContractDownloadButton draft={draft} size="sm" variant="outline" className="w-full mt-1" />
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Не сформирован</p>
          )}
        </CardContent>
      </Card>

      {/* Счёт */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-500" />
            <span className="font-medium text-sm">Счёт</span>
            {set.invoice && (
              <Badge variant={isInvoicePaid(set.invoice) ? "default" : "secondary"} className="text-[10px]">
                {isInvoicePaid(set.invoice) ? "оплачен" : "ожидает оплаты"}
              </Badge>
            )}
          </div>
          {set.invoice ? (
            <>
              <p className="text-xs text-muted-foreground break-all">№ {set.invoice.invoice_number}</p>
              <p className="text-xs text-muted-foreground">Дата: {safeDate(set.invoice.invoice_date)}</p>
              <p className="text-xs font-medium">{formatRub(Number(set.invoice.amount))}</p>
              {onOpenInvoice && (
                <Button size="sm" variant="outline" className="w-full mt-1" onClick={onOpenInvoice}>
                  Открыть счёт
                </Button>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Не сформирован</p>
          )}
        </CardContent>
      </Card>

      {/* Акт */}
      <Card className={actAvailable ? "" : "opacity-80"}>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            {actAvailable ? <FileCheck className="w-4 h-4 text-emerald-500" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
            <span className="font-medium text-sm">Акт</span>
          </div>
          {set.act ? (
            <>
              <p className="text-xs text-muted-foreground">{set.act.name}</p>
              <p className="text-xs text-muted-foreground">Создан: {safeDate(set.act.created_at)}</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{actAvailable ? "Готов к оформлению" : ACT_LOCKED_REASON}</p>
          )}
          {onOpenAct && (
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-1"
              disabled={!actAvailable}
              onClick={onOpenAct}
              title={actAvailable ? "Оформить акт по оплаченному счёту" : ACT_LOCKED_REASON}
            >
              {set.act ? "Открыть акты" : "Оформить акт"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
