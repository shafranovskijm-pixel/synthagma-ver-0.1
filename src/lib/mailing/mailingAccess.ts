const MAILING_PLANS = new Set(["start", "standard", "professional", "maximum"]);

/**
 * One tariff predicate for every mailing entry point. The feature flag alone
 * must never unlock a Free organization, and a paid plan without the flag
 * must stay locked until the backend configuration is ready.
 */
export function isMailingEnabled(
  plan: string | null | undefined,
  emailCampaignsEnabled: boolean | null | undefined,
): boolean {
  return MAILING_PLANS.has(plan ?? "") && emailCampaignsEnabled === true;
}
