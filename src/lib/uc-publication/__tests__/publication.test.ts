import { describe, expect, it } from "vitest";
import { buildPublicationCalendar, type PublicationCalendarRule, type PublicationNormChange } from '../calendar.ts';
import { parsePublicPublicationUrl, publicEditionSchema, type PublicEdition, type PublicationCheck, type PublicationCurrentScope, type PublicationEvent } from '../model.ts';
import { projectPublication } from '../projection.ts';

const org = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const otherOrg = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const sha = "a".repeat(64), nextSha = "b".repeat(64);
function edition(): PublicEdition {
  return { id: id(1), organizationId: org, revision: 1, title: "Отчёт центра за 2025 год", reportingYear: 2025,
    basis: { catalogVersion: "catalog-1", requirementId: "self_examination_report", requirementVersion: "1", profileRevision: 2,
      applicabilityDecisionRevision: 2, legalReview: "needs_legal_review", sourceRevisionSha256: sha },
    publicUrl: "https://school.ru/documents/report-2025.pdf", content: { sha256: sha, bytes: 1234, mime: "application/pdf" },
    privateSource: { documentId: id(3), versionId: id(4) }, createdAt: "2026-10-23T10:00:00Z", createdBy: org };
}
function scope(value = edition()): PublicationCurrentScope {
  return { organizationId: org, basis: { ...value.basis }, asOf: "2026-10-23T12:00:00Z", recheckAfterHours: 24 };
}
function approved(): PublicationEvent {
  return { id: id(5), organizationId: org, editionId: id(1), sequence: 1, actorId: org, occurredAt: "2026-10-23T10:01:00Z",
    kind: "approved", reason: "Центр проверил состав публичной редакции", reportedPublicationDate: "2026-10-22" };
}
function check(): PublicationCheck {
  return { id: id(6), organizationId: org, editionId: id(1), editionRevision: 1, requestedUrl: edition().publicUrl,
    finalUrl: "https://cdn.school.ru/report-2025.pdf", checkedAt: "2026-10-23T11:00:00Z", result: "verified", httpStatus: 200,
    observed: { sha256: sha, bytes: 1234, mime: "application/pdf" }, observer: "platform_anonymous_https",
    transport: "public_addresses_pinned_tls_hostname_checked", responseHeadersSha256: sha, redirectCount: 1 };
}
function checked(value = check()): PublicationEvent {
  return { id: id(7), organizationId: org, editionId: id(1), sequence: 2, actorId: org, occurredAt: value.checkedAt, kind: "check_completed", check: value };
}
function rule(): PublicationCalendarRule {
  return { id: "annual-public-report", revision: 1, basis: edition().basis, applicability: "applicable", period: "reporting_year", annualDeadline: null };
}
function normChange(): PublicationNormChange {
  return { id: id(8), sourceId: "official-source", previousRevisionSha256: sha, nextRevisionSha256: nextSha,
    discoveredOn: "2026-10-23", affectedRequirementIds: ["self_examination_report"] };
}

describe("UC026 exact public edition and point-in-time evidence", () => {
  it("accepts the existing canonical account UUID and does not mistake a private source for publication", () => {
    const value = publicEditionSchema.parse(edition());
    expect(value.createdBy).toBe(org);
    expect(projectPublication(value, [], scope()).state).toBe("draft");
    expect(projectPublication(value, [], scope()).verifiedAt).toBeNull();
  });
  it("keeps a centre-reported publication date separate from actual HTTP verification", () => {
    const projection = projectPublication(edition(), [approved()], scope());
    expect(projection.state).toBe("awaiting_check");
    expect(projection.reportedPublicationDate).toBe("2026-10-22");
    expect(projection.verifiedAt).toBeNull();
  });
  it("records the exact observed edition without declaring legal or continuous availability", () => {
    expect(projectPublication(edition(), [approved(), checked()], scope())).toMatchObject({ state: "verified_at_time",
      verifiedAt: "2026-10-23T11:00:00Z", legalReview: "needs_legal_review", legalComplianceConfirmed: false,
      continuousAvailabilityConfirmed: false, checkId: id(6) });
  });
  it("rejects a forged verified200 for a login page, changed bytes or absent header proof", () => {
    for (const changed of [
      { ...check(), observed: { sha256: nextSha, bytes: 1234, mime: "application/pdf" } },
      { ...check(), observed: { sha256: sha, bytes: 1234, mime: "text/html" } },
      { ...check(), observed: { sha256: sha, bytes: 1235, mime: "application/pdf" } },
      { ...check(), responseHeadersSha256: null },
    ]) expect(() => projectPublication(edition(), [approved(), checked(changed)], scope())).toThrow("INVALID_PUBLICATION_VERIFICATION");
  });
  it("rejects foreign tenants, editions, versions and requested addresses in check history", () => {
    for (const changed of [{ ...check(), organizationId: otherOrg }, { ...check(), editionId: id(20) },
      { ...check(), editionRevision: 2 }, { ...check(), requestedUrl: "https://school.ru/other.pdf" }]) {
      expect(() => projectPublication(edition(), [approved(), checked(changed)], scope())).toThrow("INVALID_PUBLICATION_CHECK_BINDING");
    }
    expect(() => projectPublication(edition(), [approved()], { ...scope(), organizationId: otherOrg })).toThrow("INVALID_PUBLICATION_SCOPE");
  });
  it("rejects out-of-order, duplicate, future and wrong-tenant events", () => {
    for (const changed of [{ ...approved(), sequence: 2 }, { ...approved(), occurredAt: "2026-10-23T09:59:59Z" },
      { ...approved(), occurredAt: "2026-10-23T13:00:00Z" }, { ...approved(), organizationId: otherOrg }]) {
      expect(() => projectPublication(edition(), [changed], scope())).toThrow("INVALID_PUBLICATION_HISTORY");
    }
    expect(() => projectPublication(edition(), [approved(), approved()], scope())).toThrow("INVALID_PUBLICATION_HISTORY");
  });
  it("does not accept a check before approval or after withdrawal", () => {
    expect(() => projectPublication(edition(), [{ ...checked(), sequence: 1 }], scope())).toThrow("PUBLICATION_NOT_APPROVED");
    const withdrawn: PublicationEvent = { id: id(10), organizationId: org, editionId: id(1), sequence: 2, actorId: org,
      occurredAt: "2026-10-23T10:30:00Z", kind: "withdrawn", reason: "Редакция отозвана" };
    expect(projectPublication(edition(), [approved(), withdrawn], scope()).state).toBe("withdrawn");
    expect(() => projectPublication(edition(), [approved(), withdrawn, { ...checked(), sequence: 3 }], scope())).toThrow("PUBLICATION_ALREADY_WITHDRAWN");
  });
  it("invalidates current verification after any exact profile, source, catalogue or applicability change", () => {
    for (const basis of [{ ...scope().basis, profileRevision: 3 }, { ...scope().basis, catalogVersion: "catalog-2" },
      { ...scope().basis, requirementVersion: "2" }, { ...scope().basis, applicabilityDecisionRevision: 3 },
      { ...scope().basis, sourceRevisionSha256: nextSha }, { ...scope().basis, legalReview: "reviewed" as const }]) {
      expect(projectPublication(edition(), [approved(), checked()], { ...scope(), basis })).toMatchObject({ state: "source_changed", verifiedAt: null });
    }
  });
  it("a later failed observation removes current success without changing previous evidence", () => {
    const oldCheck = check();
    const failed = { ...check(), id: id(11), checkedAt: "2026-10-23T11:30:00Z", result: "http_unavailable" as const, httpStatus: 404, observed: null };
    expect(projectPublication(edition(), [approved(), checked(oldCheck), { ...checked(failed), id: id(12), sequence: 3 }], scope())).toMatchObject({ state: "recheck_required", verifiedAt: null });
    expect(oldCheck.result).toBe("verified");
  });
  it("distinguishes an expired product recheck interval from a statutory deadline", () => {
    expect(projectPublication(edition(), [approved(), checked()], { ...scope(), asOf: "2026-10-24T11:00:00Z" }).state).toBe("verified_at_time");
    expect(projectPublication(edition(), [approved(), checked()], { ...scope(), asOf: "2026-10-24T11:00:01Z" }).state).toBe("recheck_required");
  });
  it("rejects credentials, signed URLs, local/IP targets, unsupported schemes and control characters syntactically", () => {
    for (const value of ["http://school.ru/file.pdf", "https://user:pass@school.ru/file.pdf", "https://school.ru/file.pdf?token=secret",
      "https://127.0.0.1/file", "https://[::1]/file", "https://school.local/file", "https://localhost/file", "https://school.ru:8443/file",
      "https://school.ru/file#fragment", "https://school.ru/\\localhost", "https://school.ru/\nfile"]) expect(() => parsePublicPublicationUrl(value)).toThrow("UNSAFE_PUBLICATION_URL");
    expect(parsePublicPublicationUrl("https://school.ru/report.pdf?download=1")).toBe("https://school.ru/report.pdf?download=1");
  });
});

describe("UC026 calendar keeps reviewed dates and changes separate", () => {
  it("creates an annual task without adopting the old unreviewed April20 hint", () => {
    expect(buildPublicationCalendar({ organizationId: org, reportingYear: 2025, rules: [rule()], normChanges: [] })[0])
      .toMatchObject({ kind: "annual_report", reportingYear: 2025, dueOn: null, state: "needs_review" });
  });
  it("uses an exact reviewed and centre-accepted deadline basis without moving it on file edits", () => {
    const reviewed = { ...rule(), basis: { ...rule().basis, legalReview: "reviewed" as const },
      annualDeadline: { month: 4, day: 20, yearOffset: 1, acceptedDecisionId: id(30), reviewedSourceSha256: sha } };
    expect(buildPublicationCalendar({ organizationId: org, reportingYear: 2025, rules: [reviewed], normChanges: [] })[0]).toMatchObject({ dueOn: "2026-04-20", state: "open" });
    expect(() => buildPublicationCalendar({ organizationId: org, reportingYear: 2025, rules: [{ ...reviewed,
      annualDeadline: { ...reviewed.annualDeadline, reviewedSourceSha256: nextSha } }], normChanges: [] })).toThrow("INVALID_PUBLICATION_DEADLINE_BASIS");
  });
  it("retains an unresolved applicability task and omits a confirmed nonapplicable requirement", () => {
    expect(buildPublicationCalendar({ organizationId: org, reportingYear: 2025, rules: [{ ...rule(), applicability: "needs_information" }], normChanges: [] })[0].state).toBe("needs_information");
    expect(buildPublicationCalendar({ organizationId: org, reportingYear: 2025, rules: [{ ...rule(), applicability: "not_applicable" }], normChanges: [] })).toEqual([]);
  });
  it("deduplicates the same norm event and creates a review task without approving replacement law", () => {
    const value = normChange();
    const tasks = buildPublicationCalendar({ organizationId: org, reportingYear: 2025, rules: [rule()], normChanges: [value, value] });
    expect(tasks).toHaveLength(2);
    expect(tasks.find(task => task.kind === "norm_change")).toMatchObject({ normChangeId: value.id, dueOn: null, state: "needs_review" });
  });
  it("has stable tenant/year/rule/profile/event identities and never merges different task scopes", () => {
    const input = { organizationId: org, reportingYear: 2025, rules: [rule()], normChanges: [normChange()] };
    const original = buildPublicationCalendar(input);
    expect(buildPublicationCalendar(input)).toEqual(original);
    for (const changed of [{ ...input, organizationId: otherOrg }, { ...input, reportingYear: 2026 },
      { ...input, rules: [{ ...rule(), revision: 2 }] }, { ...input, rules: [{ ...rule(), basis: { ...rule().basis, profileRevision: 3 } }] }]) {
      expect(buildPublicationCalendar(changed).find(task => task.kind === "annual_report")?.key).not.toBe(original.find(task => task.kind === "annual_report")?.key);
    }
  });
  it("rejects duplicate rules, impossible dates, conflicting event identities and malformed current basis", () => {
    const input = { organizationId: org, reportingYear: 2025, rules: [rule()], normChanges: [] };
    expect(() => buildPublicationCalendar({ ...input, rules: [rule(), rule()] })).toThrow("DUPLICATE_PUBLICATION_RULE");
    expect(() => buildPublicationCalendar({ ...input, reportingYear: 2025.5 })).toThrow("INVALID_REPORTING_YEAR");
    expect(() => buildPublicationCalendar({ ...input, normChanges: [normChange(), { ...normChange(), sourceId: "other-source" }] })).toThrow("CONFLICTING_NORMATIVE_CHANGE");
    expect(() => buildPublicationCalendar({ ...input, rules: [{ ...rule(), basis: { ...rule().basis, profileRevision: 0 } }] })).toThrow();
    const reviewed = { ...rule(), basis: { ...rule().basis, legalReview: "reviewed" as const },
      annualDeadline: { month: 2, day: 30, yearOffset: 1, acceptedDecisionId: id(30), reviewedSourceSha256: sha } };
    expect(() => buildPublicationCalendar({ ...input, rules: [reviewed] })).toThrow();
  });
});

describe("UC026 exact observed time and terminal history",()=>{
 it("keeps network observation time distinct from later database event recording time",()=>{const event=checked();event.occurredAt="2026-10-23T11:00:02.123456Z";expect(projectPublication(edition(),[approved(),event],scope()).verifiedAt).toBe("2026-10-23T11:00:00Z");event.occurredAt="2026-10-23T10:59:59Z";expect(()=>projectPublication(edition(),[approved(),event],scope())).toThrow();});
 it("rejects a future edition or non-ISO current clock and repeated approval",()=>{expect(()=>projectPublication({...edition(),createdAt:"2026-10-23T13:00:00Z"},[],scope())).toThrow();expect(()=>projectPublication(edition(),[],{...scope(),asOf:"October 23 2026"})).toThrow();expect(()=>projectPublication(edition(),[approved(),{...approved(),id:id(90),sequence:2}],scope())).toThrow();});
 it("keeps an explicit withdrawal terminal even if the current normative basis later changes",()=>{const withdrawal:PublicationEvent={id:id(91),organizationId:org,editionId:id(1),sequence:2,actorId:org,occurredAt:"2026-10-23T10:02:00Z",kind:"withdrawn",reason:"Решение центра"};expect(projectPublication(edition(),[approved(),withdrawal],{...scope(),basis:{...scope().basis,profileRevision:3}}).state).toBe("withdrawn");expect(()=>projectPublication(edition(),[withdrawal],scope())).toThrow();});
});
