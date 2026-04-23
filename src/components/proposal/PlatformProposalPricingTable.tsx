import { Check, X } from "lucide-react";
import { SUBSCRIPTION_PLANS, YEARLY_DISCOUNT } from "@/constants/subscriptionPlans";
import { PLAN_ORDER, pricingFeatureRows, formatPriceRu } from "@/lib/pricingFeatureRows";

export function PlatformProposalPricingTable() {
  return (
    <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <th className="p-4 font-medium text-muted-foreground">Возможность</th>
            {PLAN_ORDER.map((p) => {
              const plan = SUBSCRIPTION_PLANS[p];
              const isRec = p === 'standard';
              return (
                <th key={p} className={`p-4 text-center font-display ${isRec ? 'bg-accent/10' : ''}`}>
                  <div className={`text-base font-semibold ${isRec ? 'text-accent' : 'text-foreground'}`}>{plan.name}</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {plan.price === 0 ? '0 ₽' : `${formatPriceRu(plan.price)} ₽/мес`}
                  </div>
                  {plan.price > 0 && (
                    <div className="text-[11px] text-foreground/70 mt-0.5">
                      или {formatPriceRu(Math.round(plan.price * (1 - YEARLY_DISCOUNT)))} ₽/мес за год
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/60">
            <td className="p-3 font-medium">Обучений в месяц</td>
            {PLAN_ORDER.map((p) => {
              const v = SUBSCRIPTION_PLANS[p].limits.maxTrainedPerMonth;
              return (
                <td key={p} className={`p-3 text-center text-xs ${p === 'standard' ? 'bg-accent/5' : ''}`}>
                  {v === -1 ? '∞' : v}
                </td>
              );
            })}
          </tr>
          {pricingFeatureRows.map((row) => (
            <tr key={row.label} className="border-b border-border/60 last:border-b-0">
              <td className="p-3 font-medium text-foreground/90">{row.label}</td>
              {PLAN_ORDER.map((p) => {
                const v = row.getValue(p);
                const isRec = p === 'standard';
                return (
                  <td key={p} className={`p-3 text-center ${isRec ? 'bg-accent/5' : ''}`}>
                    {typeof v === 'boolean' ? (
                      v ? (
                        <Check className="mx-auto h-4 w-4 text-accent" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-muted-foreground/40" />
                      )
                    ) : (
                      <span className={`text-xs font-semibold ${v === 'ФРДО+' ? 'text-[hsl(38,92%,50%)]' : 'text-foreground'}`}>
                        {v === 'Безлимит' ? '∞' : v === 'ФРДО+' ? 'ФИС ФРДО+' : v}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
