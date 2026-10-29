import { describe, expect, it, vi } from "vitest";
import { canAcceptPublicationReview, canPublishPublication, createPublicationGateway, currentFileDossierReference,
  parsePublicationContext, PLATFORM_REVIEW_ORG_ID, supportedPublicationDossier, type PublicationApiPort } from "../platformCoursePublication";
import { P, contextDto, dossier, proposalDto, readinessDto, sourceDto } from "./platformCoursePublication.fixtures";

const REF = "61000000-0000-0000-0000-000000000001";
const CAPTURE = "62000000-0000-0000-0000-000000000001";
const GENERATION = "63000000-0000-0000-0000-000000000001";
const VERSION = "64000000-0000-0000-0000-000000000001";
function evidence() {
  return { reference: "Synthetic reviewed document", edition: "Synthetic edition", checked_at: P.at,
    reference_kind: "course_document", reference_id: REF, file_receipt_id: P.receipt,
    captured_edition_id: CAPTURE, file_bytes_sha256: "c".repeat(64), source_org_version_id: null };
}
function withEvidence(value: unknown) {
  const base = dossier();
  return { ...base, document_links: { ...base.document_links, evidence: [value] } };
}
function rawContext(savedDossier: unknown = dossier(), requestId = P.request) {
  const binding = { reference_kind: "course_document", reference_id: REF, state: "unconfirmed", receipt_id: null,
    exact_version_kind: null, exact_version_id: null, file_bytes_sha256: null, byte_length: null };
  const source = sourceDto(P.target, { file_bindings: [binding] });
  return contextDto({ current_source_context: source, proposal: proposalDto({ dossier: savedDossier, source_context: source, request_id: requestId }),
    current_file_state: "sealed_current", current_file_context: { schema_version: 1, actor_id: P.actor, organization_id: PLATFORM_REVIEW_ORG_ID,
      marketplace_id: P.target.marketplaceId, course_id: P.target.courseId, proposal_id: P.proposal,
      proposal_edition_sha256: P.sha, current_edition_sha256: P.sha, scope_generation: GENERATION,
      state: "sealed_current", reference_count: 1, references: [{ reference_kind: "course_document", reference_id: REF,
        state: "bytes_sealed", receipt: { receipt_id: P.receipt, captured_edition_id: CAPTURE, source_org_version_id: null,
          file_bytes_sha256: "c".repeat(64), byte_length: 43 } }] },
    readiness: readinessDto({ state: "review_incomplete", blockers: ["file_delivery_consumers_not_accepted"] }) });
}
function current() { return parsePublicationContext(rawContext(), P.target, P.actor); }

describe("exact three-text or nine-field dossier evidence", () => {
  it("preserves every old three-field section, including unfinished draft text", () => {
    const value = dossier(); value.document_links.evidence = [{ reference: "", edition: "", checked_at: "" }];
    expect(supportedPublicationDossier(value)).toEqual(value);
  });
  it.each(["course_document", "lesson_attachment"])("preserves all nine exact fields for %s", kind => {
    const value = withEvidence({ ...evidence(), reference_kind: kind });
    expect(supportedPublicationDossier(value)).toEqual(value);
  });
  it("preserves an explicit non-null organization document version", () => {
    const value = withEvidence({ ...evidence(), source_org_version_id: VERSION });
    expect(supportedPublicationDossier(value)).toEqual(value);
  });
  it.each(["reference_kind", "reference_id", "file_receipt_id", "captured_edition_id", "file_bytes_sha256", "source_org_version_id"])(
    "rejects a partial binding missing %s instead of reducing it to text evidence", key => {
      const ref: Record<string, unknown> = evidence(); delete ref[key];
      expect(supportedPublicationDossier(withEvidence(ref))).toBeNull();
    });
  it.each([
    { source_url: "https://example.invalid/never-use" }, { byte_length: 43 }, { unknown_field: true },
    { reference_kind: "other" }, { reference_id: "not-id" }, { file_receipt_id: null },
    { captured_edition_id: P.sha }, { file_bytes_sha256: "BAD" }, { source_org_version_id: "" },
  ])("rejects unexpected or malformed file evidence %#", patch => {
    expect(supportedPublicationDossier(withEvidence({ ...evidence(), ...patch }))).toBeNull();
  });
  it("does not accept file bindings in an unrelated dossier section", () => {
    const value = dossier();
    expect(supportedPublicationDossier({ ...value, rights: { ...value.rights, evidence: [evidence()] } })).toBeNull();
  });
  it("leaves the exact unknown saved payload untouched and returns unsupported", () => {
    const raw = withEvidence({ ...evidence(), unknown_field: { preserve: "historical" } });
    const before = JSON.stringify(raw);
    expect(supportedPublicationDossier(raw)).toBeNull(); expect(JSON.stringify(raw)).toBe(before);
  });
  it("copies only the selected current receipt binding and invents no annotation, date or approval", () => {
    const context = current(), before = JSON.stringify(context);
    const ref = currentFileDossierReference(context, "course_document", REF);
    expect(ref).toEqual({ ...evidence(), reference: "", edition: "", checked_at: "" });
    expect(Object.keys(ref!)).toHaveLength(9); expect(JSON.stringify(context)).toBe(before);
    expect(context.readiness.blockers).toEqual(["file_delivery_consumers_not_accepted"]);
    expect(canAcceptPublicationReview(context)).toBe(false); expect(canPublishPublication(context)).toBe(false);
  });
  it.each(["missing", "historical", "actor", "target", "proposal", "edition", "scope", "coverage", "duplicate", "unconfirmed"])(
    "cannot create a binding from %s proof", change => {
      const context = current(); const proof = context.currentFileContext!;
      if (change === "missing") context.currentFileContext = null;
      if (change === "historical") context.proposal!.isCurrent = false;
      if (change === "actor") proof.actorId = P.otherActor;
      if (change === "target") proof.courseId = P.target.marketplaceId;
      if (change === "proposal") proof.proposalId = P.otherProposal;
      if (change === "edition") proof.currentEditionSha256 = P.changedSha;
      if (change === "scope") proof.scopeGeneration = "not-id";
      if (change === "coverage") context.currentSource.fileBindings = [];
      if (change === "duplicate") { proof.references.push({ ...proof.references[0] }); proof.referenceCount = 2; }
      if (change === "unconfirmed") proof.references[0] = { ...proof.references[0], state: "unconfirmed", receipt: null };
      expect(currentFileDossierReference(context, "course_document", REF)).toBeNull();
    });
  it("never resolves a different reference or a guessed kind", () => {
    expect(currentFileDossierReference(current(), "course_document", VERSION)).toBeNull();
    expect(currentFileDossierReference(current(), "lesson_attachment", REF)).toBeNull();
  });
  it("submits and reads back the full nine-field payload without stripping its immutable binding", async () => {
    const value = supportedPublicationDossier(withEvidence(evidence()))!;
    const api = { submit: vi.fn().mockResolvedValue({ data: { proposal_id: P.proposal, edition_sha256: P.sha, replayed: false }, error: null }),
      context: vi.fn().mockResolvedValue({ data: rawContext(value), error: null }) } as unknown as PublicationApiPort;
    const result = await createPublicationGateway(api).submit(P.target, P.actor, P.sha, value, P.request);
    expect(api.submit).toHaveBeenCalledWith({ p_marketplace_id: P.target.marketplaceId, p_expected_edition_sha256: P.sha,
      p_dossier: value, p_request_id: P.request });
    expect(result.proposal?.supportedDossier).toEqual(value);
    expect(canAcceptPublicationReview(result)).toBe(false); expect(canPublishPublication(result)).toBe(false);
  });
});
