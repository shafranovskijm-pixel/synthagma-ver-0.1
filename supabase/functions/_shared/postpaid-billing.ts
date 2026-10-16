/** Fixed monthly terms from signed contract 59-09/26 (08 September 2026).
 * This calculator does not issue invoices, grant access or infer consent.
 * Features passed here must already have evidence of actual use and PRIOR
 * notice/customer confirmation. The database is the authoritative calculator.
 */
export const POSTPAID_TERMS_VERSION = "59-09-26-v1";
export type PostpaidPlan = "start" | "standard" | "professional";
export type PostpaidFeature = "crm" | "webinar" | "videoserviceplus" | "frdoplus";
export interface PostpaidUsage {
  courses: number;
  learners: number;
  confirmedUsedFeatures?: readonly PostpaidFeature[];
  accessDays: number;
  monthDays: number;
}
export function calculatePostpaid(usage: PostpaidUsage) {
  for (const [name, value] of Object.entries({ courses: usage.courses, learners: usage.learners, accessDays: usage.accessDays, monthDays: usage.monthDays })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}`);
  }
  if (usage.monthDays < 28 || usage.monthDays > 31 || usage.accessDays < 1 || usage.accessDays > usage.monthDays) throw new Error("Invalid calendar access period");
  const features = new Set(usage.confirmedUsedFeatures ?? []);
  for (const feature of features) if (!["crm", "webinar", "videoserviceplus", "frdoplus"].includes(feature)) throw new Error("Invalid feature");
  let plan: PostpaidPlan = usage.courses <= 15 && usage.learners <= 100 ? "start"
    : usage.courses <= 30 && usage.learners <= 200 ? "standard" : "professional";
  if (features.has("crm") && plan === "start") plan = "standard";
  if (["webinar", "videoserviceplus", "frdoplus"].some(f => features.has(f as PostpaidFeature))) plan = "professional";
  const monthlyAmount = { start: 4490, standard: 6990, professional: 16990 }[plan];
  const amountKopecks = Math.round(monthlyAmount * 100 * usage.accessDays / usage.monthDays);
  return { termsVersion: POSTPAID_TERMS_VERSION, plan, monthlyAmount, amountKopecks, amount: amountKopecks / 100 };
}

export function featureUseIsBillable(input: {
  feature: PostpaidFeature; occurredAt: string; notifiedAt: string; confirmedAt: string;
  effectiveTo?: string | null; bytes?: number | null;
}) {
  const [occurred, notified, confirmed] = [input.occurredAt, input.notifiedAt, input.confirmedAt].map(Date.parse);
  if (![occurred, notified, confirmed].every(Number.isFinite) || notified > confirmed || confirmed > occurred) return false;
  if (input.effectiveTo != null && (!Number.isFinite(Date.parse(input.effectiveTo)) || occurred >= Date.parse(input.effectiveTo))) return false;
  return input.feature !== "videoserviceplus" || (Number.isSafeInteger(input.bytes) && Number(input.bytes) > 2147483648);
}
