import { describe, expect, it } from "vitest";
import { parsePublicationRecord, parsePublicationRules, parsePublicationCalendar, parsePublicationEditions, validatePublicationMutationReply } from "../api";
import { actor, basis, calendar, createArgs, created, id, now, org, record, rule, rules } from "./fixtures";
describe("UC026 persisted contract and exact operation confirmation", () => {
  it("accepts exact original records and retained source-changed editions without losing microseconds", () => {
    expect(parsePublicationRecord(record(), org).server_as_of).toBe(now);
    const old = record(); old.current_scope.current = false; old.current_scope.profile_revision = 3; old.projection.state = "source_changed";
    expect(parsePublicationRecord(old, org).edition.basis.profileRevision).toBe(2);
  });
  it("closes unknown envelope, edition, scope, event and legal-compliance flags", () => {
    for (const value of [{ ...record(), unknown: true }, { ...record(), edition: { ...record().edition, urlToken: "x" } }, { ...record(), current_scope: { ...record().current_scope, approved: true } }, { ...record(), legal_compliance_confirmed: true }]) expect(() => parsePublicationRecord(value, org)).toThrow();
  });
  it("refuses a different tenant, inconsistent current basis and false history completeness", () => {
    for (const value of [{ ...record(), organization_id: id(9) }, { ...record(), current_scope: { ...record().current_scope, basis: { ...basis(), profileRevision: 4 } } }, { ...record(), latest_event_sequence: 1 }]) expect(() => parsePublicationRecord(value, org)).toThrow();
  });
  it("never accepts verified projection without a persisted approved exact check", () => {
    const value = record(); value.projection = { ...value.projection, state: "verified_at_time", approvedAt: now, verifiedAt: now, checkId: id(8) };
    expect(() => parsePublicationRecord(value, org)).toThrow("PUBLICATION_PROJECTION_MISMATCH");
  });
  it("binds create receipts to actor, request, object and operation", () => {
    expect(() => validatePublicationMutationReply("create_organization_publication", createArgs(), created(), org, actor)).not.toThrow();
    for (const changed of [{ actorId: id(9) }, { requestId: id(9) }, { objectId: id(9) }, { kind: "withdraw" }]) expect(() => validatePublicationMutationReply("create_organization_publication", createArgs(), { ...created(), receipt: { ...created().receipt, ...changed } }, org, actor)).toThrow();
  });
  it("rejects unconfirmed creation even when the read itself is valid", () => expect(() => validatePublicationMutationReply("create_organization_publication", createArgs(), record(), org, actor)).toThrow("UNCONFIRMED_PUBLICATION_MUTATION"));
  it("requires a stable normative request receipt even when the current rule has advanced", () => {
    const args = { p_organization_id: org, p_rule_id: rule().id, p_expected_revision: 0, p_request_id: id(10) };
    const reply = { ...rules(), rules: [{ ...rule(), revision: 2 }], rule_receipt: { actorId: actor, requestId: id(10), ruleId: rule().id, ruleRevision: 1, recordedAt: now } };
    expect(() => validatePublicationMutationReply("append_publication_rule_version", args, reply, org, actor)).not.toThrow();
    for (const bad of [{ ...reply, rule_receipt: undefined }, { ...reply, rule_receipt: { ...reply.rule_receipt, requestId: id(11) } }]) expect(() => validatePublicationMutationReply("append_publication_rule_version", args, bad, org, actor)).toThrow();
  });
  it("does not turn a catalogue hint or impossible date into a reviewed deadline", () => {
    for (const annualDeadline of [{ month: 4, day: 20, yearOffset: 1 }, { month: 2, day: 30, yearOffset: 1 }]) expect(() => parsePublicationRules({ ...rules(), rules: [{ ...rule(), annualDeadline }] }, org)).toThrow();
    expect(() => parsePublicationRules({ ...rules(), rules: [{ ...rule(), legalReview: "reviewed", reviewReason: "Проверено в TEST", annualDeadline: { month: 2, day: 30, yearOffset: 1 } }] }, org)).toThrow();
  });
  it("binds deadline decision confirmations to actor, rule, profile, applicability and request", () => {
    const args = { p_organization_id: org, p_rule_id: rule().id, p_rule_revision: 1, p_profile_revision: 2, p_applicability_revision: 3, p_expected_revision: 0, p_accept: true, p_request_id: id(10) };
    const reply = { schema_version: 1, organization_id: org, request_id: id(10), decision_id: id(12), revision: 1, actor_id: actor, rule_id: rule().id, rule_revision: 1, profile_revision: 2, applicability_revision: 3, accepted: true, decided_at: now, replayed: false };
    expect(() => validatePublicationMutationReply("record_publication_deadline_decision", args, reply, org, actor)).not.toThrow();
    for (const bad of [{ actor_id: id(9) }, { rule_revision: 2 }, { profile_revision: 3 }, { applicability_revision: 4 }, { accepted: false }, { request_id: id(9) }]) expect(() => validatePublicationMutationReply("record_publication_deadline_decision", args, { ...reply, ...bad }, org, actor)).toThrow();
  });
  it("requires calendar receipt object identity and the exact reporting year", () => {
    const args = { p_organization_id: org, p_reporting_year: 2025, p_request_id: id(10) }, reply = { ...calendar(), receipt: { requestId: id(10), actorId: actor, kind: "calendar", objectId: id(10), recordedAt: now } };
    expect(() => validatePublicationMutationReply("sync_organization_publication_calendar", args, reply, org, actor)).not.toThrow();
    expect(() => validatePublicationMutationReply("sync_organization_publication_calendar", args, { ...reply, receipt: { ...reply.receipt, objectId: id(9) } }, org, actor)).toThrow();
    expect(() => parsePublicationCalendar({ ...calendar(), reporting_year: 2026 }, org, 2025)).toThrow();
  });
  it("accepts only a paginated retained edition sequence below the requested boundary", () => {
    const value = { schema_version: 1, organization_id: org, stream_id: id(3), editions: [record()], server_as_of: now };
    expect(parsePublicationEditions(value, org, id(3), 2)).toHaveLength(1);
    expect(() => parsePublicationEditions(value, org, id(3), 1)).toThrow();
    expect(() => parsePublicationEditions({ ...value, editions: [record(), record()] }, org, id(3), 2)).toThrow();
    expect(() => parsePublicationEditions({ ...value, sourceToken: "private" }, org, id(3), 2)).toThrow();
  });
});
