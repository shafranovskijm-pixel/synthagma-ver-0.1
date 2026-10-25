import { z } from "zod";
import { calendarDate, publicEditionSchema, publicationBasisSchema, publicationEventSchema, publicationUuid, publicationInstant, publicationSha256 } from "./model";
import { projectPublication } from "./projection";
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().regex(/^[A-Za-z0-9_.:-]{1,200}$/);
const text = z.string().min(1).max(4000).refine(v => !!v.trim());
const receipt = z.object({ requestId: publicationUuid, actorId: publicationUuid, kind: z.enum(["create_edition", "approve", "withdraw", "calendar"]), objectId: publicationUuid, recordedAt: publicationInstant }).strict();
const ruleReceipt = z.object({ requestId: publicationUuid, actorId: publicationUuid, ruleId: identifier, ruleRevision: revision, recordedAt: publicationInstant }).strict();
const projection = z.object({ state: z.enum(["draft", "awaiting_check", "verified_at_time", "recheck_required", "withdrawn", "source_changed"]), approvedAt: publicationInstant.nullable(), reportedPublicationDate: calendarDate.nullable(), verifiedAt: publicationInstant.nullable(), checkId: publicationUuid.nullable(), legalComplianceConfirmed: z.literal(false), continuousAvailabilityConfirmed: z.literal(false) }).strict();
const scope = z.object({ current: z.boolean(), stream_revision: revision, edition_revision: revision, profile_revision: revision.nullable(), rule_revision: revision.nullable(), applicability_revision: revision.nullable(), private_source_current: z.boolean(), basis: z.record(z.unknown()) }).strict();
const record = z.object({ receipt: receipt.optional(), schema_version: z.literal(1), organization_id: publicationUuid, edition: publicEditionSchema, current_scope: scope, projection, events: z.array(publicationEventSchema).max(100), latest_event_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), history_complete: z.boolean(), server_as_of: publicationInstant, recheck_after_hours: z.literal(24), legal_compliance_confirmed: z.literal(false), continuous_availability_confirmed: z.literal(false) }).strict();
export type PublicationRecord = z.infer<typeof record>;

export function parsePublicationRecord(value: unknown, organizationId: string): PublicationRecord {
  const r = record.parse(value), time = Date.parse(r.server_as_of);
  if (r.organization_id !== organizationId || r.edition.organizationId !== organizationId || r.current_scope.edition_revision !== r.edition.revision || Date.parse(r.edition.createdAt) > time
    || r.events.some((e, i) => e.organizationId !== organizationId || e.editionId !== r.edition.id || e.sequence > r.latest_event_sequence || Date.parse(e.occurredAt) > time || Date.parse(e.occurredAt) < Date.parse(r.edition.createdAt)
      || i > 0 && (e.sequence !== r.events[i - 1].sequence + 1 || Date.parse(e.occurredAt) < Date.parse(r.events[i - 1].occurredAt)))
    || r.history_complete !== (r.events.length === r.latest_event_sequence) || r.history_complete && r.events.length > 0 && r.events[0].sequence !== 1) throw new Error("PUBLICATION_RECORD_MISMATCH");
  if (r.current_scope.current) {
    const basis = publicationBasisSchema.parse(r.current_scope.basis);
    if (!r.current_scope.private_source_current || r.current_scope.stream_revision !== r.edition.revision || r.current_scope.profile_revision !== basis.profileRevision || r.current_scope.applicability_revision !== basis.applicabilityDecisionRevision
      || JSON.stringify(basis) !== JSON.stringify(r.edition.basis)) throw new Error("PUBLICATION_CURRENT_SCOPE_MISMATCH");
  }
  for (const event of r.events) if (event.kind === "check_completed") {
    const check = event.check;
    if (check.organizationId !== organizationId || check.editionId !== r.edition.id || check.editionRevision !== r.edition.revision || check.requestedUrl !== r.edition.publicUrl || Date.parse(check.checkedAt) > Date.parse(event.occurredAt)
      || check.result === "verified" && (check.httpStatus !== 200 || !check.responseHeadersSha256 || check.observed?.sha256 !== r.edition.content.sha256 || check.observed?.bytes !== r.edition.content.bytes || check.observed?.mime !== r.edition.content.mime)) throw new Error("PUBLICATION_CHECK_MISMATCH");
  }
  if (r.projection.state === "verified_at_time" && (!r.current_scope.current || !r.projection.verifiedAt || !r.projection.checkId || !r.projection.approvedAt || Date.parse(r.projection.verifiedAt) > time || time - Date.parse(r.projection.verifiedAt) > 24 * 3_600_000)) throw new Error("PUBLICATION_VERIFICATION_MISMATCH");
  if (r.history_complete) {
    const expected = projectPublication(r.edition, r.events, { organizationId, basis: r.edition.basis, asOf: r.server_as_of, recheckAfterHours: 24 });
    if (!r.current_scope.current && expected.state !== "withdrawn") { expected.state = "source_changed"; expected.verifiedAt = null; }
    for (const key of Object.keys(r.projection) as (keyof typeof r.projection)[]) if (r.projection[key] !== expected[key]) throw new Error("PUBLICATION_PROJECTION_MISMATCH");
  }
  return r;
}
export const publicationRuleSchema = z.object({ id: identifier, revision, catalogVersion: identifier, requirementId: identifier, requirementVersion: identifier, title: text, period: z.enum(["continuous", "reporting_year"]), sourceSnapshot: z.record(z.unknown()), sourceRevisionSha256: publicationSha256, legalReview: z.enum(["needs_legal_review", "reviewed"]), annualDeadline: z.object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31), yearOffset: z.number().int().min(0).max(2) }).strict().nullable(), createdAt: publicationInstant, reviewReason: z.string().max(8000).nullable(), centreDeadlineDecision: z.object({ id: publicationUuid, revision, accepted: z.boolean(), reason: text, profileRevision: revision, ruleRevision: revision, applicabilityRevision: revision, decidedAt: publicationInstant }).strict().nullable() }).strict();
export type PublicationRule = z.infer<typeof publicationRuleSchema>;
const task = z.object({ id: publicationUuid, body: z.object({ schema_version: z.literal(1), calendarYear: z.number().int().min(1900).max(9996), kind: z.enum(["annual_report", "norm_change"]), title: text, requirementId: identifier, basis: publicationBasisSchema, reportingYear: z.number().int().min(1900).max(9998).nullable(), dueOn: calendarDate.nullable(), deadlineDecisionId: publicationUuid.nullable(), acceptedDeadlineDecisionId: publicationUuid.nullable(), state: z.enum(["needs_information", "needs_review", "open"]), reason: text, sourceChange: z.object({ previousRevisionSha256: publicationSha256, nextRevisionSha256: publicationSha256 }).strict().nullable() }).strict(), current: z.boolean(), created_at: publicationInstant, publication: z.object({ edition_id: publicationUuid, projection }).strict().nullable() }).strict();
export type PublicationCalendarRow = z.infer<typeof task>;
const rulesEnvelope = (org: string) => z.object({ schema_version: z.literal(1), organization_id: z.literal(org), rules: z.array(publicationRuleSchema).max(1000), legal_compliance_confirmed: z.literal(false), rule_receipt: ruleReceipt.optional() }).strict();
export function parsePublicationRules(value: unknown, org: string): PublicationRule[] {
  const v = rulesEnvelope(org).parse(value);
  if (new Set(v.rules.map(r => r.id)).size !== v.rules.length) throw new Error("DUPLICATE_PUBLICATION_RULE");
  for (const r of v.rules) if (r.annualDeadline && (r.legalReview !== "reviewed" || !r.reviewReason?.trim() || r.period !== "reporting_year" || !calendarDate.safeParse(`2000-${String(r.annualDeadline.month).padStart(2, "0")}-${String(r.annualDeadline.day).padStart(2, "0")}`).success)) throw new Error("INVALID_PUBLICATION_DEADLINE_BASIS");
  return v.rules;
}
export function parsePublicationList(value: unknown, org: string): { streamId: string; record: PublicationRecord }[] {
  const v = z.object({ schema_version: z.literal(1), organization_id: z.literal(org), items: z.array(z.object({ stream_id: publicationUuid, record: z.unknown() }).strict()).max(50), server_as_of: publicationInstant }).strict().parse(value);
  const rows = v.items.map(x => ({ streamId: x.stream_id, record: parsePublicationRecord(x.record, org) }));
  if (new Set(rows.map(r => r.streamId)).size !== rows.length) throw new Error("DUPLICATE_PUBLICATION_STREAM");
  return rows;
}
export function parsePublicationEditions(value: unknown, org: string, stream: string, before: number | null): PublicationRecord[] {
  const v = z.object({ schema_version: z.literal(1), organization_id: z.literal(org), stream_id: z.literal(stream), editions: z.array(z.unknown()).max(25), server_as_of: publicationInstant }).strict().parse(value);
  const rows = v.editions.map(e => parsePublicationRecord(e, org));
  if (rows.some((r, i) => before !== null && r.edition.revision >= before || i > 0 && rows[i - 1].edition.revision <= r.edition.revision)) throw new Error("PUBLICATION_EDITION_PAGE_MISMATCH");
  return rows;
}
export function parsePublicationCalendar(value: unknown, org: string, year: number): PublicationCalendarRow[] {
  const v = z.object({ schema_version: z.literal(1), organization_id: z.literal(org), receipt: receipt.optional(), reporting_year: z.literal(year), tasks: z.array(task).max(100), server_as_of: publicationInstant, legal_compliance_confirmed: z.literal(false) }).strict().parse(value);
  if (new Set(v.tasks.map(t => t.id)).size !== v.tasks.length) throw new Error("DUPLICATE_PUBLICATION_TASK");
  for (const t of v.tasks) if (t.body.calendarYear !== year || t.body.basis.requirementId !== t.body.requirementId
    || t.body.kind === "annual_report" && (t.body.reportingYear !== year || t.body.sourceChange !== null)
    || t.body.kind === "norm_change" && (!t.body.sourceChange || t.body.dueOn !== null || t.body.sourceChange.previousRevisionSha256 === t.body.sourceChange.nextRevisionSha256)
    || t.body.dueOn !== null && (!t.body.acceptedDeadlineDecisionId || t.body.deadlineDecisionId !== t.body.acceptedDeadlineDecisionId || t.body.basis.legalReview !== "reviewed") || t.body.state === "open" && !t.body.dueOn) throw new Error("PUBLICATION_CALENDAR_BINDING_MISMATCH");
  return v.tasks;
}
export function validatePublicationMutationReply(name: string, args: Record<string, unknown>, value: unknown, org: string, actor: string): void {
  if (args.p_organization_id !== org) throw new Error("PUBLICATION_MUTATION_ORGANIZATION_MISMATCH");
  if (name === "create_organization_publication" || name === "record_organization_publication_action") {
    const r = parsePublicationRecord(value, org), p = r.receipt;
    if (!p || p.requestId !== args.p_request_id || p.actorId !== actor || p.objectId !== r.edition.id || p.kind !== (name === "create_organization_publication" ? "create_edition" : args.p_kind) || name === "record_organization_publication_action" && r.edition.id !== args.p_edition_id) throw new Error("UNCONFIRMED_PUBLICATION_MUTATION");
    return;
  }
  if (name === "sync_organization_publication_calendar") {
    parsePublicationCalendar(value, org, args.p_reporting_year as number);
    const p = z.object({ receipt }).passthrough().parse(value).receipt;
    if (p.requestId !== args.p_request_id || p.actorId !== actor || p.kind !== "calendar" || p.objectId !== args.p_request_id) throw new Error("UNCONFIRMED_PUBLICATION_CALENDAR");
    return;
  }
  if (name === "record_publication_deadline_decision") {
    z.object({ schema_version: z.literal(1), organization_id: z.literal(org), request_id: z.literal(publicationUuid.parse(args.p_request_id)), actor_id: z.literal(actor), rule_id: z.literal(identifier.parse(args.p_rule_id)), rule_revision: z.literal(revision.parse(args.p_rule_revision)), profile_revision: z.literal(revision.parse(args.p_profile_revision)), applicability_revision: z.literal(revision.parse(args.p_applicability_revision)), accepted: z.literal(z.boolean().parse(args.p_accept)), decision_id: publicationUuid, revision: z.literal(z.number().int().nonnegative().parse(args.p_expected_revision) + 1), decided_at: publicationInstant, replayed: z.boolean() }).strict().parse(value);
    return;
  }
  if (name === "append_publication_rule_version") {
    parsePublicationRules(value, org);
    const p = rulesEnvelope(org).parse(value).rule_receipt;
    if (!p || p.actorId !== actor || p.requestId !== args.p_request_id || p.ruleId !== args.p_rule_id || p.ruleRevision !== (args.p_expected_revision as number) + 1) throw new Error("UNCONFIRMED_PUBLICATION_RULE");
    return;
  }
  throw new Error("UNKNOWN_PUBLICATION_MUTATION");
}
