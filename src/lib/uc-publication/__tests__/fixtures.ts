import type { PublicationRecord, PublicationRule } from '../api.ts';
export const id = (n: number) => "00000000-0000-0000-0000-" + String(n).padStart(12, "0");
export const org = id(1), actor = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", sha = "a".repeat(64), now = "2026-10-24T10:00:00.123456Z";
export const basis = () => ({ catalogVersion: "2026-10-18", requirementId: "self_examination_report", requirementVersion: "1", profileRevision: 2, applicabilityDecisionRevision: 3, legalReview: "needs_legal_review" as const, sourceRevisionSha256: sha });
export function record(): PublicationRecord { return { schema_version: 1, organization_id: org,
  edition: { id: id(2), organizationId: org, revision: 1, title: "Тестовая публичная редакция", basis: basis(), reportingYear: 2025, publicUrl: "https://school.ru/report.pdf", content: { sha256: sha, bytes: 40, mime: "application/pdf" }, privateSource: null, createdAt: now, createdBy: actor },
  current_scope: { current: true, stream_revision: 1, edition_revision: 1, profile_revision: 2, rule_revision: 1, applicability_revision: 3, private_source_current: true, basis: basis() },
  projection: { state: "draft", approvedAt: null, reportedPublicationDate: null, verifiedAt: null, checkId: null, legalComplianceConfirmed: false, continuousAvailabilityConfirmed: false },
  events: [], latest_event_sequence: 0, history_complete: true, server_as_of: now, recheck_after_hours: 24, legal_compliance_confirmed: false, continuous_availability_confirmed: false }; }
export function rule(): PublicationRule { return { id: "publication:self_examination_report", revision: 1, catalogVersion: "2026-10-18", requirementId: "self_examination_report", requirementVersion: "1", title: "Тестовое основание", period: "reporting_year", sourceSnapshot: { test: true }, sourceRevisionSha256: sha, legalReview: "needs_legal_review", annualDeadline: null, createdAt: now, reviewReason: null, centreDeadlineDecision: null }; }
export const rules = () => ({ schema_version: 1, organization_id: org, rules: [rule()], legal_compliance_confirmed: false });
export const list = () => ({ schema_version: 1, organization_id: org, items: [{ stream_id: id(3), record: record() }], server_as_of: now });
export const calendar = () => ({ schema_version: 1, organization_id: org, reporting_year: 2025, tasks: [], server_as_of: now, legal_compliance_confirmed: false });
export const createArgs = () => ({ p_organization_id: org, p_expected_stream_revision: 0, p_request_id: id(10), p_input: { TEST: true } });
export const created = () => ({ ...record(), receipt: { requestId: id(10), actorId: actor, kind: "create_edition", objectId: id(2), recordedAt: now } });
