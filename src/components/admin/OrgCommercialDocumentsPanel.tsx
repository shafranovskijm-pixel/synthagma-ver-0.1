import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileStack, Loader2, RefreshCw } from "lucide-react";
import { CommercialSetCards } from "@/components/platform-contract/CommercialSetCards";
import { usePlatformCommercialSet } from "@/hooks/usePlatformCommercialSet";
import { PLATFORM_CONTRACT_PROJECT_NAME } from "@/lib/platform-commerce";
import type { SubscriptionPlan } from "@/constants/subscriptionPlans";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";
import type { PlatformContractPeriodMonths } from "@/lib/platform-contract";

interface Props {
  organizationId: string;
  organizationName: string;
  subscriptionPlan: SubscriptionPlan;
  /** Переход к вкладке «Финансовые документы» для актов/загрузок. */
  onOpenBillingDocs?: () => void;
}

const PAID_PLANS: SubscriptionPlan[] = ["start", "standard", "professional", "maximum"];

/**
 * Админский блок коммерческих документов организации.
 * Показывает ровно те же записи, что видит клиент (по organization_id).
 */
export function OrgCommercialDocumentsPanel({ organizationId, organizationName, subscriptionPlan, onOpenBillingDocs }: Props) {
  const { loading, set, missing, generating, generate, reload } = usePlatformCommercialSet(organizationId);
  const [plan, setPlan] = useState<SubscriptionPlan>(PAID_PLANS.includes(subscriptionPlan) ? subscriptionPlan : "start");
  const [period, setPeriod] = useState<PlatformContractPeriodMonths>(12);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileStack className="w-4 h-4 text-primary" />
          Документы по тарифу — {organizationName}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void reload()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Обновить
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {PAID_PLANS.map((p) => (
            <Button key={p} size="sm" variant={plan === p ? "default" : "outline"} className="rounded-xl" onClick={() => setPlan(p)}>
              {SUBSCRIPTION_PLANS[p].name}
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          {([1, 12] as PlatformContractPeriodMonths[]).map((m) => (
            <Button key={m} size="sm" variant={period === m ? "default" : "outline"} className="rounded-xl" onClick={() => setPeriod(m)}>
              {m === 1 ? "1 мес." : "12 мес."}
            </Button>
          ))}
        </div>

        {missing.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-amber-600">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            <span>Не заполнены реквизиты организации: {missing.map((m) => m.label).join(", ")}</span>
          </div>
        )}

        <Button size="sm" disabled={generating || missing.length > 0} onClick={() => void generate(plan, period)} className="gap-2">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Сформировать проект договора и счёт
        </Button>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{PLATFORM_CONTRACT_PROJECT_NAME} · без номера</Badge>
        </div>

        <CommercialSetCards
          set={set}
          loading={loading}
          onOpenAct={onOpenBillingDocs}
          emptyHint="У этой организации ещё нет проекта договора и счёта по тарифу."
        />
      </CardContent>
    </Card>
  );
}
