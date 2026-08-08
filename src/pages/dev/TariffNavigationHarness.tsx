import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { Button } from "@/components/ui/button";
import { TariffCheckoutDialog } from "@/components/organization/TariffCheckoutDialog";
import { CHECKOUT_PLANS, useTariffCheckout } from "@/lib/organization/subscriptionNavigation";

const HARNESS_ORG_ID = "00000000-0000-4000-8000-000000000000";

/**
 * DEV-only harness для regression-проверки навигации тарифа без реальной сессии.
 * Использует те же handler'ы и то же URL-состояние, что вкладка «Тариф».
 * Данные организации не запрашиваются — счёт/заявка отсюда не создаются.
 */
export default function TariffNavigationHarness() {
  const checkout = useTariffCheckout("free");

  return (
    <div className="min-h-screen bg-background p-4 space-y-4 overflow-x-hidden">
      <h1 className="text-xl font-semibold">Tariff navigation harness</h1>

      <Button type="button" data-testid="open-checkout" onClick={() => checkout.openCheckout("start")}>
        Оформить тариф
      </Button>

      <div className="flex flex-wrap gap-2">
        {CHECKOUT_PLANS.map((p: SubscriptionPlan) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            data-testid={`upgrade-${p}`}
            onClick={() => checkout.openCheckout(p)}
          >
            Перейти — {SUBSCRIPTION_PLANS[p].name}
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground" data-testid="checkout-state">
        open={String(checkout.open)} plan={checkout.plan}
      </p>

      <TariffCheckoutDialog
        open={checkout.open}
        onOpenChange={(v) => (v ? checkout.openCheckout(checkout.plan) : checkout.closeCheckout())}
        organizationId={HARNESS_ORG_ID}
        currentPlan="free"
        plan={checkout.plan}
        onPlanChange={checkout.setPlan}
      />
    </div>
  );
}
