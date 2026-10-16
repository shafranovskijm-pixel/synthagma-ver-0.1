// Pure pricing contract shared by the browser and trusted checkout.
// Custom prices/discounts must come from the server's organization record.
export const SUBSCRIPTION_MONTHLY_PRICES = {
  free: 0, start: 4490, standard: 6990, professional: 16990, maximum: 24990,
} as const;
export const SUBSCRIPTION_YEARLY_DISCOUNT = 0.15;
export type PaidSubscriptionPlan = Exclude<keyof typeof SUBSCRIPTION_MONTHLY_PRICES, "free">;

export function isPaidSubscriptionPlan(value: unknown): value is PaidSubscriptionPlan {
  return typeof value === "string" && value !== "free"
    && Object.prototype.hasOwnProperty.call(SUBSCRIPTION_MONTHLY_PRICES, value);
}

export function subscriptionMonthlyAmount(plan: keyof typeof SUBSCRIPTION_MONTHLY_PRICES, customPrice?: number | null, customDiscount?: number | null): number {
  const price = customPrice != null && Number.isFinite(Number(customPrice)) && Number(customPrice) >= 0
    ? Number(customPrice) : SUBSCRIPTION_MONTHLY_PRICES[plan];
  const discount = customDiscount != null && Number.isFinite(Number(customDiscount)) && Number(customDiscount) > 0
    ? Number(customDiscount) : 0;
  return Math.max(0, price - discount);
}

export function subscriptionQuoteKopecks(plan: PaidSubscriptionPlan, months: 1 | 12, customPrice?: number | null, customDiscount?: number | null): number {
  const monthly = subscriptionMonthlyAmount(plan, customPrice, customDiscount);
  return Math.round(monthly * months * (months === 12 ? 1 - SUBSCRIPTION_YEARLY_DISCOUNT : 1) * 100);
}
