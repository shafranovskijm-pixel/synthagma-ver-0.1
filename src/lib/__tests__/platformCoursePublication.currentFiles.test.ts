import { describe, expect, it, vi } from "vitest";
import { canAcceptPublicationReview, canPublishPublication, createPublicationGateway, parsePublicationContext,
  PLATFORM_REVIEW_ORG_ID, type PublicationApiPort } from "../platformCoursePublication";
import { P, contextDto, dossier, proposalDto, readinessDto, sourceDto } from "./platformCoursePublication.fixtures";

const REF = "61000000-0000-0000-0000-000000000001";
const REF2 = "61000000-0000-0000-0000-000000000002";
const CAPTURE = "62000000-0000-0000-0000-000000000001";
const GENERATION = "63000000-0000-0000-0000-000000000001";
function sourceBinding(id = REF) {
  return { reference_kind: "course_document", reference_id: id, state: "unconfirmed", receipt_id: null,
    exact_version_kind: null, exact_version_id: null, file_bytes_sha256: null, byte_length: null };
}
function receipt() {
  return { receipt_id: P.receipt, captured_edition_id: CAPTURE, source_org_version_id: null,
    file_bytes_sha256: "c".repeat(64), byte_length: 43 };
}
function reference(id = REF) {
  return { reference_kind: "course_document", reference_id: id, state: "bytes_sealed", receipt: receipt() };
}
function proof(overrides: Record<string, unknown> = {}) {
  return { schema_version: 1, actor_id: P.actor, organization_id: PLATFORM_REVIEW_ORG_ID,
    marketplace_id: P.target.marketplaceId, course_id: P.target.courseId, proposal_id: P.proposal,
    proposal_edition_sha256: P.sha, current_edition_sha256: P.sha, scope_generation: GENERATION,
    state: "sealed_current", reference_count: 1, references: [reference()], ...overrides };
}
function dto(overrides: Record<string, unknown> = {}) {
  const source = sourceDto(P.target, { file_bindings: [sourceBinding()] });
  return contextDto({ current_source_context: source, proposal: proposalDto({ source_context: source }),
    current_file_state: "sealed_current", current_file_context: proof(),
    readiness: readinessDto({ state: "review_incomplete", blockers: ["file_delivery_consumers_not_accepted"] }), ...overrides });
}
function parse(raw: unknown) { return parsePublicationContext(raw, P.target, P.actor); }
function invalid(raw: unknown) { expect(() => parse(raw)).toThrow("invalid_response"); }

describe("current selected file review proof (metadata only; no actual capability change)", () => {
  it("CFR01 preserves accepted no-file legacy context without a new proof", () => {
    expect(canAcceptPublicationReview(parse(contextDto()))).toBe(true);
  });
  it("CFR02 sealed CURRENT receipts do not remove the real consumer-readiness blocker", () => {
    const result = parse(dto({ readiness: readinessDto({ state: "review_incomplete", blockers: ["file_delivery_consumers_not_accepted"] }) }));
    expect(result.currentFileContext?.references[0].receipt?.fileBytesSha256).toBe("c".repeat(64));
    expect(canAcceptPublicationReview(result)).toBe(false);
    expect(canPublishPublication(result)).toBe(false);
  });
  it("CFR03 preserves exact file dossier metadata while the real consumer blocker still prevents acceptance", () => {
    const base = dossier();
    const fileDossier = { ...base, document_links: { state: "confirmed", rationale: "Exact synthetic file evidence", evidence: [{
      reference: "Explicit selected synthetic receipt", edition: P.sha, checked_at: P.at,
      reference_kind: "course_document", reference_id: REF, file_receipt_id: P.receipt,
      captured_edition_id: CAPTURE, file_bytes_sha256: "c".repeat(64), source_org_version_id: null,
    }] } };
    const source = sourceDto(P.target, { file_bindings: [sourceBinding()] });
    const result = parse(dto({ proposal: proposalDto({ dossier: fileDossier, source_context: source }) }));
    expect(result.currentFileContext?.state).toBe("sealed_current");
    expect(result.proposal?.supportedDossier).toEqual(fileDossier);
    expect(canAcceptPublicationReview(result)).toBe(false);
    expect(canPublishPublication(result)).toBe(false);
  });
  it("CFR04 rejects an unbound sealed state without the authoritative current proof", () => invalid(dto({ current_file_context: null })));
  it("CFR05 a historically sealed selected A cannot authorize current B", () => {
    invalid(dto({ proposal: proposalDto({ id: P.otherProposal, edition_sha256: P.changedSha, is_current: false }) }));
  });
  it.each([
    ["actor_id", P.otherActor], ["organization_id", P.target.courseId], ["marketplace_id", P.target.courseId],
    ["course_id", P.target.marketplaceId], ["proposal_id", P.otherProposal],
    ["proposal_edition_sha256", P.changedSha], ["current_edition_sha256", P.changedSha],
  ])("CFR06 rejects mismatched selected scope %s", (key, value) => invalid(dto({ current_file_context: proof({ [key]: value }) })));
  it("CFR07 rejects duplicate reference coverage", () => invalid(dto({
    current_file_context: proof({ reference_count: 2, references: [reference(), reference()] }),
  })));
  it("CFR08 rejects a missing actual current reference", () => {
    const source = sourceDto(P.target, { file_bindings: [sourceBinding(), sourceBinding(REF2)] });
    invalid(dto({ current_source_context: source, proposal: proposalDto({ source_context: source }) }));
  });
  it("CFR09 rejects a reference that is absent from the selected immutable source", () => {
    invalid(dto({ proposal: proposalDto({ source_context: sourceDto() }) }));
  });
  it.each([
    { file_bytes_sha256: "not-a-sha" }, { receipt_id: P.sha }, { byte_length: 0 }, { byte_length: 8388609 },
    { byte_length: "43" }, { source_org_version_id: "wrong" }, { source_url: "https://unsafe.example/file" },
  ])("CFR10 rejects malformed or broadened receipt metadata %#", patch => {
    invalid(dto({ current_file_context: proof({ references: [{ ...reference(), receipt: { ...receipt(), ...patch } }] }) }));
  });
  it("CFR11 never seals the vacuous zero-reference case", () => invalid(contextDto({
    current_file_state: "sealed_current", current_file_context: proof({ reference_count: 0, references: [] }),
  })));
  it("CFR12 unsupported embedded media with zero authority references stays held", () => {
    const result = parse(contextDto({ current_file_state: "unconfirmed",
      current_file_context: proof({ state: "unconfirmed", reference_count: 0, references: [] }),
      readiness: readinessDto({ state: "review_incomplete", blockers: ["file_or_external_material_edition_unconfirmed"] }) }));
    expect(canAcceptPublicationReview(result)).toBe(false);
  });
  it("CFR13 one unresolved exact reference stays unconfirmed without a receipt escape", () => {
    const result = parse(dto({ current_file_state: "unconfirmed",
      current_file_context: proof({ state: "unconfirmed", references: [{ ...reference(), state: "unconfirmed", receipt: null }] }),
      readiness: readinessDto({ state: "review_incomplete", blockers: ["file_bytes_receipt_unconfirmed"] }) }));
    expect(canAcceptPublicationReview(result)).toBe(false);
  });
  it("CFR14 no-file state cannot conceal actual file references", () => invalid(dto({ current_file_state: "no_file_reference_detected", current_file_context: null })));
  it("CFR16 no default/latest context response can supply a current-file authority proof", async () => {
    const api = { context: vi.fn().mockResolvedValue({ data: dto(), error: null }) } as unknown as PublicationApiPort;
    await expect(createPublicationGateway(api).context(P.target, P.actor)).rejects.toThrow("invalid_response");
    expect(api.context).toHaveBeenCalledTimes(1);
  });
  it("CFR17 only an explicit exact proposal AND expected current edition can carry the proof", async () => {
    const api = { context: vi.fn().mockResolvedValue({ data: dto(), error: null }) } as unknown as PublicationApiPort;
    await expect(createPublicationGateway(api).context(P.target, P.actor, {
      proposalId: P.proposal, expectedEdition: P.sha,
    })).resolves.toMatchObject({ currentFileState: "sealed_current" });
  });
});
