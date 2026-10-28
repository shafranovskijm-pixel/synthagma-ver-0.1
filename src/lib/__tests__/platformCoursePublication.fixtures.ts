import { emptyPublicationDossier, parsePublicationContext, TEMPLATE_REVIEW_SCOPE, PLATFORM_REVIEW_ORG_ID,
  type PublicationTarget } from "../platformCoursePublication";

export const P = {
  target: { marketplaceId: "70000000-0000-0000-0000-000000000001", courseId: "30000000-0000-0000-0000-000000000001" },
  actor: "10000000-0000-0000-0000-000000000001", otherActor: "10000000-0000-0000-0000-000000000002",
  proposal: "80000000-0000-0000-0000-000000000001", otherProposal: "80000000-0000-0000-0000-000000000002",
  review: "80000000-0000-0000-0000-000000000003", receipt: "80000000-0000-0000-0000-000000000004",
  request: "90000000-0000-0000-0000-000000000001", otherRequest: "90000000-0000-0000-0000-000000000002",
  sha: "a".repeat(64), changedSha: "b".repeat(64), at: "2026-10-28T00:00:00Z", next: "2100-01-01T00:00:00.000Z",
};
export function dossier() {
  const value = emptyPublicationDossier();
  for (const field of Object.keys(value.passport) as (keyof typeof value.passport)[]) value.passport[field] = "Explicit SYNTHETIC fixture";
  for (const name of ["source_review", "subject_keys", "rights"] as const) value[name] = {
    state: "confirmed", rationale: "Explicit SYNTHETIC review reference",
    evidence: [{ reference: "Synthetic source only", edition: "fixture-1", checked_at: "2026-10-01T00:00:00Z" }],
  };
  value.practices = { state: "not_applicable", rationale: "Synthetic inline fixture", evidence: [] };
  value.document_links = { state: "not_applicable", rationale: "Synthetic inline fixture", evidence: [] };
  return value;
}
export function sourceDto(target: PublicationTarget = P.target, overrides: Record<string, unknown> = {}) {
  return { schema_version: 1, manifest_schema_version: 2, marketplace_id: target.marketplaceId, course_id: target.courseId,
    modules: [], lessons: [{ id: "50000000-0000-0000-0000-000000000001", module_id: null, type: "text" }],
    file_bindings_schema_version: 1, file_bindings: [], historical_content_state: "fingerprint_only_not_reconstructed_from_current_bank",
    file_authority_state: "v3_unconfirmed_until_separate_trusted_file_receipt_adapter", ...overrides };
}
export function readinessDto(overrides: Record<string, unknown> = {}, target: PublicationTarget = P.target) {
  return { marketplace_id: target.marketplaceId, course_id: target.courseId, edition_sha256: P.sha,
    proposal_id: P.proposal, review_id: P.review, state: "eligible", is_validated: false, blockers: [], decision_scope: TEMPLATE_REVIEW_SCOPE, ...overrides };
}
export function proposalDto(overrides: Record<string, unknown> = {}, target: PublicationTarget = P.target) {
  return { id: P.proposal, marketplace_id: target.marketplaceId, course_id: target.courseId, edition_sha256: P.sha,
    submitted_at: P.at, submitted_by: P.actor, request_id: P.request, is_current: true, dossier: dossier(), source_context: sourceDto(target), ...overrides };
}
export function eventDto(overrides: Record<string, unknown> = {}) {
  return { id: P.review, sequence: "2", proposal_id: P.proposal, event_kind: "review_decided", edition_sha256: P.sha,
    recorded_at: P.at, actor_id: P.actor, request_id: P.request, decision: "accepted_for_template_publication", notes: "Explicit SYNTHETIC decision",
    next_review_at: P.next, same_person_review: true, ...overrides };
}
export function contextDto(overrides: Record<string, unknown> = {}, target: PublicationTarget = P.target, actorId = P.actor) {
  return { schema_version: 1, marketplace_id: target.marketplaceId, course_id: target.courseId, organization_id: PLATFORM_REVIEW_ORG_ID,
    actor_id: actorId, current_edition_sha256: P.sha, readiness: readinessDto({}, target), proposal: proposalDto({}, target),
    current_source_context: sourceDto(target), current_file_state: "no_file_reference_detected",
    history: [eventDto()], history_has_more: false, history_next_before_sequence: null, confirmed_event: null,
    decision_scope: TEMPLATE_REVIEW_SCOPE, ...overrides };
}
export function parsedContext(overrides: Record<string, unknown> = {}, target: PublicationTarget = P.target, actorId = P.actor) {
  return parsePublicationContext(contextDto(overrides, target, actorId), target, actorId);
}

export function publicationResultDto(overrides: Record<string, unknown> = {}) {
  return { id: P.target.marketplaceId, course_id: P.target.courseId, edition_sha256: P.sha, is_validated: true, receipt_id: P.receipt, replayed: false, ...overrides };
}
