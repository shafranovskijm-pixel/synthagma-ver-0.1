import { calendarDate, publicationBasisSchema, publicationSha256, publicationUuid, type PublicationBasis } from "./model";

export interface PublicationCalendarRule {
  id: string; revision: number; basis: PublicationBasis;
  applicability: "applicable" | "not_applicable" | "needs_information";
  period: "reporting_year" | "continuous";
  /** A reviewed, centre-accepted date. No date is inferred from an unreviewed catalogue hint. */
  annualDeadline: { month: number; day: number; yearOffset: number; acceptedDecisionId: string; reviewedSourceSha256: string } | null;
}
export interface PublicationNormChange {
  id: string; sourceId: string; previousRevisionSha256: string; nextRevisionSha256: string; discoveredOn: string;
  affectedRequirementIds: readonly string[];
}
export interface PublicationCalendarTask {
  key: string; organizationId: string; requirementId: string; ruleId: string; ruleRevision: number;
  kind: "annual_report" | "norm_change"; reportingYear: number | null; normChangeId: string | null;
  normChange: PublicationNormChange | null;
  basis: PublicationBasis; dueOn: string | null;
  state: "needs_information" | "needs_review" | "open";
  reason: string;
}
const part = (value: string) => `${value.length}:${value}`;

/** Identity for this pure planning preview only. Persisted task identities are issued
 * by the database together with its current scope and deadline-decision revision. */
export function publicationTaskKey(organizationId: string, rule: PublicationCalendarRule, kind: PublicationCalendarTask["kind"], periodKey: string): string {
  publicationUuid.parse(organizationId);
  publicationBasisSchema.parse(rule.basis);
  return ["uc026v1", organizationId.toLowerCase(), rule.id, String(rule.revision), rule.basis.requirementId,
    rule.basis.requirementVersion, rule.basis.catalogVersion, String(rule.basis.profileRevision),
    String(rule.basis.applicabilityDecisionRevision ?? ""), rule.basis.sourceRevisionSha256, kind, periodKey].map(part).join("|");
}

function reviewedDeadline(rule: PublicationCalendarRule, reportingYear: number): string | null {
  const deadline = rule.annualDeadline;
  if (!deadline || rule.basis.legalReview !== "reviewed") return null;
  publicationUuid.parse(deadline.acceptedDecisionId); publicationSha256.parse(deadline.reviewedSourceSha256);
  if (deadline.reviewedSourceSha256 !== rule.basis.sourceRevisionSha256 || !Number.isInteger(deadline.month)
    || !Number.isInteger(deadline.day) || !Number.isInteger(deadline.yearOffset) || deadline.yearOffset < 0 || deadline.yearOffset > 2) throw new Error("INVALID_PUBLICATION_DEADLINE_BASIS");
  const value = `${String(reportingYear + deadline.yearOffset).padStart(4, "0")}-${String(deadline.month).padStart(2, "0")}-${String(deadline.day).padStart(2, "0")}`;
  return calendarDate.parse(value);
}

export function buildPublicationCalendar(input: { organizationId: string; reportingYear: number;
  rules: readonly PublicationCalendarRule[]; normChanges: readonly PublicationNormChange[] }): PublicationCalendarTask[] {
  publicationUuid.parse(input.organizationId);
  if (!Number.isInteger(input.reportingYear) || input.reportingYear < 1900 || input.reportingYear > 9996) throw new Error("INVALID_REPORTING_YEAR");
  const result = new Map<string, PublicationCalendarTask>();
  const ruleKeys = new Set<string>();
  const changes = new Map<string, PublicationNormChange>();
  for (const change of input.normChanges) {
    publicationUuid.parse(change.id); publicationSha256.parse(change.previousRevisionSha256); publicationSha256.parse(change.nextRevisionSha256); calendarDate.parse(change.discoveredOn);
    if (change.previousRevisionSha256 === change.nextRevisionSha256 || !change.sourceId.trim() || change.sourceId.length > 200
      || !Array.isArray(change.affectedRequirementIds) || change.affectedRequirementIds.length > 500
      || change.affectedRequirementIds.some(value => typeof value !== "string" || !value.trim() || value.length > 200)) throw new Error("INVALID_NORMATIVE_CHANGE");
    const normalized = { id: change.id, sourceId: change.sourceId, previousRevisionSha256: change.previousRevisionSha256,
      nextRevisionSha256: change.nextRevisionSha256, discoveredOn: change.discoveredOn,
      affectedRequirementIds: [...new Set(change.affectedRequirementIds)].sort() };
    const previous = changes.get(change.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(normalized)) throw new Error("CONFLICTING_NORMATIVE_CHANGE");
    changes.set(change.id, normalized);
  }
  const put = (task: PublicationCalendarTask) => { const old = result.get(task.key); if (old && JSON.stringify(old) !== JSON.stringify(task)) throw new Error("CONFLICTING_PUBLICATION_TASK"); result.set(task.key, task); };
  for (const rule of input.rules) {
    if (!rule.id.trim() || rule.id.length > 200 || !Number.isSafeInteger(rule.revision) || rule.revision < 1) throw new Error("INVALID_PUBLICATION_RULE");
    publicationBasisSchema.parse(rule.basis);
    if (!["applicable", "not_applicable", "needs_information"].includes(rule.applicability)
      || !["reporting_year", "continuous"].includes(rule.period)) throw new Error("INVALID_PUBLICATION_RULE");
    const ruleKey = `${part(rule.id)}|${rule.revision}`;
    if (ruleKeys.has(ruleKey)) throw new Error("DUPLICATE_PUBLICATION_RULE");
    ruleKeys.add(ruleKey);
    if (rule.applicability === "not_applicable") continue;
    const base = { organizationId: input.organizationId, requirementId: rule.basis.requirementId, ruleId: rule.id, ruleRevision: rule.revision, basis: rule.basis };
    if (rule.period === "reporting_year") {
      const dueOn = reviewedDeadline(rule, input.reportingYear);
      put({ ...base, key: publicationTaskKey(input.organizationId, rule, "annual_report", String(input.reportingYear)), kind: "annual_report",
        reportingYear: input.reportingYear, normChangeId: null, normChange: null, dueOn,
        state: rule.applicability === "needs_information" ? "needs_information" : dueOn ? "open" : "needs_review",
        reason: rule.applicability === "needs_information" ? "Уточните применимость к центру" : dueOn ? "Подготовьте и утвердите публичную редакцию за указанный отчётный год" : "Подтвердите основание и срок; подсказка каталога не считается утверждённым сроком" });
    }
    for (const change of changes.values()) {
      if (!change.affectedRequirementIds.includes(rule.basis.requirementId)) continue;
      put({ ...base, key: publicationTaskKey(input.organizationId, rule, "norm_change", `${change.id}:${change.nextRevisionSha256}`), kind: "norm_change",
        reportingYear: null, normChangeId: change.id, normChange: change, dueOn: null,
        state: rule.applicability === "needs_information" ? "needs_information" : "needs_review",
        reason: "Проверьте изменение нормы, применимость и публичную редакцию; обнаружение изменения не утверждает новое содержание" });
    }
  }
  return [...result.values()].sort((a, b) => a.key.localeCompare(b.key, "en"));
}
