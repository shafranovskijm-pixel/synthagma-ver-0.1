const MAILING_PLANS = new Set(["start", "standard", "professional", "maximum"]);

/**
 * A confirmed postpaid agreement includes base mailing without rewriting the
 * legacy plan. Unknown access and a missing feature flag remain closed.
 */
export function isMailingEnabled(
  plan: string | null | undefined,
  emailCampaignsEnabled: boolean | null | undefined,
  access?: { loading?: boolean; error?: unknown; isPostpaid?: boolean },
): boolean {
  if (access && (access.loading !== false || access.error)) return false;
  return (access?.isPostpaid === true || MAILING_PLANS.has(plan ?? "")) && emailCampaignsEnabled === true;
}
