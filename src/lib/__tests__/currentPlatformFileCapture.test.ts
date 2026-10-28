import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalCurrentCourseFileKey, createCurrentPlatformFileCapture, currentPlatformFileFromReview,
  parseCapturedCurrentFile, type CurrentPlatformFileCapturePort } from "../currentPlatformFileCapture";
import { contextDto, P, parsedContext, proposalDto, readinessDto, sourceDto } from "./platformCoursePublication.fixtures";
import { canAcceptPublicationReview, canPublishPublication } from "../platformCoursePublication";
const ref = "60000000-0000-0000-0000-000000000001";
const intent = "a0000000-0000-4000-8000-000000000001";
const receiptId = "a0000000-0000-4000-8000-000000000002";
const edition = "a0000000-0000-4000-8000-000000000003";
const bytes = new TextEncoder().encode("%PDF-1.7\nSYNTHETIC capture only\n");
const sha = createHash("sha256").update(bytes).digest("hex");
function source() { return sourceDto(P.target, { file_bindings: [{ reference_kind: "course_document", reference_id: ref,
  state: "unconfirmed", receipt_id: null, exact_version_kind: null, exact_version_id: null, file_bytes_sha256: null, byte_length: null }] }); }
function dto(changed = false) { return contextDto({ current_source_context: source(), current_file_state: "unconfirmed",
  ...(changed ? { current_edition_sha256: P.changedSha,
    readiness: readinessDto({ edition_sha256: P.changedSha, state: "review_stale", is_validated: null, blockers: ["edition_changed"] }),
    proposal: proposalDto({ is_current: false }) } : {}) }); }
function selection() { return currentPlatformFileFromReview(parsedContext({ current_source_context: source(), current_file_state: "unconfirmed" }), "course_document", ref); }
function receipt() { return { receipt_id: receiptId, intent_id: intent, course_id: P.target.courseId, marketplace_id: P.target.marketplaceId,
  reference_kind: "course_document", reference_id: ref, captured_edition_id: edition, source_org_version_id: null,
  file_bytes_sha256: sha, byte_length: bytes.length, recorded_at: P.at, state: "bytes_sealed", replayed: false,
  source_bucket_public_at_capture: false, proof_scope: "actual_captured_bytes_not_historical_origin_attestation_or_review_approval" }; }
function reread() { return { ...receipt(), bytes_hex: Buffer.from(bytes).toString("hex"),
  delivery_scope: "authorised_moderator_frozen_context_not_learner_acceptance", consumer_acceptance: {
    protocol: "pcf-bytea/1", admin_bytes_reader_source: true, own_learner_bytes_reader_source: true,
    frontend_consumers_accepted: false, copied_centre_exact_binding_supported: false, frozen_reader_implemented: false } }; }
function beginIntent() { return {
  schema_version: 1, actor_id: P.actor, organization_id: "4ac2c05a-d8b5-4e72-ba31-f2c743091d95",
  marketplace_id: P.target.marketplaceId, course_id: P.target.courseId, current_edition_sha256: P.sha,
  reference_kind: "course_document", reference_id: ref, intent_id: intent, expires_at: P.next, replayed: false,
  state: "capture_intent_only_not_verified_or_approved", selection_proof: "same_transaction_current_course_files_only_no_library_or_org_version" }; }
function port() { return {
  context: vi.fn<CurrentPlatformFileCapturePort["context"]>().mockResolvedValue({ data: dto(), error: null }),
  probe: vi.fn<CurrentPlatformFileCapturePort["probe"]>().mockResolvedValue({ fingerprint: "d".repeat(64) }),
  begin: vi.fn<CurrentPlatformFileCapturePort["begin"]>().mockResolvedValue({ data: beginIntent(), error: null }),
  capture: vi.fn<CurrentPlatformFileCapturePort["capture"]>().mockResolvedValue({ data: receipt(), error: null,
    response: new Response(null, { status: 200, headers: { "Content-Type": "application/json" } }) }),
  receipt: vi.fn<CurrentPlatformFileCapturePort["receipt"]>().mockResolvedValue({ data: reread(), error: null }),
}; }
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("explicit current platform file capture", () => {
  it("selects only unique current-source membership, never a historical proposal member", () => {
    const c = parsedContext({ current_source_context: source(), current_file_state: "unconfirmed" });
    c.proposal!.source.fileBindings = [{ kind: "lesson_attachment", referenceId: edition, state: "unconfirmed" }];
    expect(currentPlatformFileFromReview(c, "course_document", ref).referenceId).toBe(ref);
    expect(() => currentPlatformFileFromReview(c, "lesson_attachment", edition)).toThrow();
    c.currentSource.fileBindings.push({ ...c.currentSource.fileBindings[0] });
    expect(() => currentPlatformFileFromReview(c, "course_document", ref)).toThrow();
  });
  it("accepts only fixed canonical course-files metadata and strips an old signed query locally", () => {
    const key = P.target.courseId + "/synthetic.pdf";
    expect(canonicalCurrentCourseFileKey("https://api.xn--80aaiswd0ak.xn--p1ai/sb-storage/object/sign/course-files/" + key + "?token=not-forwarded", P.target.courseId)).toBe(key);
    expect(canonicalCurrentCourseFileKey("course-files/courses/" + key, P.target.courseId)).toBe("courses/" + key);
  });
  it.each(["https://source.invalid/raw.pdf", "org-documents/" + P.target.courseId + "/v.pdf",
    "library-files/library/" + P.target.courseId + "/v.pdf", "urn:sintagma:course-file-binding:" + ref,
    "course-files/" + ref + "/other.pdf", "course-files/" + P.target.courseId + "/%252e%252e/x.pdf"])("holds foreign/unversioned/ambiguous metadata %s", url => {
    expect(() => canonicalCurrentCourseFileKey(url, P.target.courseId)).toThrow();
  });
  it("performs no action until explicitly called and acknowledges only after strict ordinary reread and fresh context", async () => {
    const p = port(), gateway = createCurrentPlatformFileCapture(p);
    expect(p.begin).not.toHaveBeenCalled(); expect(p.capture).not.toHaveBeenCalled();
    const result = await gateway.capture(selection(), P.request, new AbortController().signal, () => true);
    expect(result.receipt_id).toBe(receiptId);
    expect(p.context).toHaveBeenCalledTimes(3); expect(p.probe).toHaveBeenCalledTimes(3);
    expect(p.begin).toHaveBeenCalledWith({ p_marketplace_id: P.target.marketplaceId, p_reference_kind: "course_document",
      p_reference_id: ref, p_expected_edition_sha256: P.sha, p_request_id: P.request }, expect.any(AbortSignal));
    expect(p.capture).toHaveBeenCalledWith(intent, expect.any(AbortSignal));
    expect(p.receipt).toHaveBeenCalledWith(receiptId, expect.any(AbortSignal));
  });
  it("keeps capture-induced edition changes separate from readiness and does not make unconfirmed files acceptable", async () => {
    const p = port(); p.context.mockResolvedValueOnce({ data: dto(), error: null }).mockResolvedValueOnce({ data: dto(), error: null }).mockResolvedValueOnce({ data: dto(true), error: null });
    const initial = selection(); const copy = { ...initial };
    const originalContext = parsedContext({ current_source_context: source(), current_file_state: "unconfirmed" });
    expect(canAcceptPublicationReview(originalContext)).toBe(false); expect(canPublishPublication(originalContext)).toBe(false);
    await createCurrentPlatformFileCapture(p).capture(initial, P.request, new AbortController().signal, () => true);
    expect(initial).toEqual(copy); expect(originalContext.currentFileState).toBe("unconfirmed");
    expect(canAcceptPublicationReview(originalContext)).toBe(false); expect(canPublishPublication(originalContext)).toBe(false);
  });
  it("holds an explicit org-document/library metadata probe before creating an intent", async () => {
    const p = port(); p.probe.mockRejectedValue(new Error("exact version required"));
    await expect(createCurrentPlatformFileCapture(p).capture(selection(), P.request, new AbortController().signal, () => true)).rejects.toThrow();
    expect(p.begin).not.toHaveBeenCalled(); expect(p.capture).not.toHaveBeenCalled();
  });
  it("holds a pointer change between metadata and begin before the worker can run", async () => {
    const p = port(); p.probe.mockResolvedValueOnce({ fingerprint: "d".repeat(64) }).mockResolvedValueOnce({ fingerprint: "e".repeat(64) });
    await expect(createCurrentPlatformFileCapture(p).capture(selection(), P.request, new AbortController().signal, () => true)).rejects.toThrow();
    expect(p.begin).toHaveBeenCalledOnce(); expect(p.capture).not.toHaveBeenCalled();
  });
  it("does not create an intent when the fresh course edition has changed", async () => {
    const p = port(); p.context.mockResolvedValue({ data: dto(true), error: null });
    await expect(createCurrentPlatformFileCapture(p).capture(selection(), P.request, new AbortController().signal, () => true)).rejects.toThrow();
    expect(p.begin).not.toHaveBeenCalled();
  });
  it("holds an unexpected historical begin replay instead of presenting it as a new capture", async () => {
    const p = port(); p.begin.mockResolvedValue({ data: { intent_id: intent, expires_at: P.next, receipt_id: receiptId, replayed: true,
      scope: "historical_request_not_new_capture_or_approval" }, error: null });
    await expect(createCurrentPlatformFileCapture(p).capture(selection(), P.request, new AbortController().signal, () => true)).rejects.toThrow();
    expect(p.capture).not.toHaveBeenCalled();
  });
  it.each([{ actor_id: P.otherActor }, { current_edition_sha256: P.changedSha },
    { selection_proof: "client_probe_only" }, { raw_url: "https://not-forwarded.invalid" }])("requires exact same-TX selection proof before any worker call %j", change => {
    const p = port(); p.begin.mockResolvedValue({ data: { ...beginIntent(), ...change }, error: null });
    return expect(createCurrentPlatformFileCapture(p).capture(selection(), P.request, new AbortController().signal, () => true)).rejects.toThrow()
      .then(() => expect(p.capture).not.toHaveBeenCalled());
  });
  it.each([{ course_id: ref }, { reference_id: edition }, { intent_id: edition }, { source_org_version_id: edition },
    { byte_length: 8388609 }, { file_bytes_sha256: "b".repeat(63) }, { proof_scope: "review_approved" }, { raw_url: "https://not-used.invalid" }])("rejects a wrong or overclaimed receipt %j", change => {
    expect(() => parseCapturedCurrentFile({ ...receipt(), ...change }, selection(), intent)).toThrow();
  });
  it("requires actual committed reread bytes, not a capture response or echoed hash alone", async () => {
    const p = port(); p.receipt.mockResolvedValue({ data: { ...reread(), bytes_hex: "00".repeat(bytes.length) }, error: null });
    await expect(createCurrentPlatformFileCapture(p).capture(selection(), P.request, new AbortController().signal, () => true)).rejects.toThrow();
  });
  it("rejects missing, denied or mismatched reread without success", async () => {
    const p = port(); p.receipt.mockResolvedValue({ data: { ...reread(), delivery_scope: "current_own_course_authorised_learner" }, error: null });
    await expect(createCurrentPlatformFileCapture(p).capture(selection(), P.request, new AbortController().signal, () => true)).rejects.toThrow();
  });
  it("checks current actor/scope before starting any subsequent write after a delayed fresh read", async () => {
    const p = port(); let done!: (x: { data: unknown; error: unknown }) => void; let current = true;
    p.context.mockReturnValueOnce(new Promise(yes => { done = yes; }));
    const pending = createCurrentPlatformFileCapture(p).capture(selection(), P.request, new AbortController().signal, () => current);
    const rejected = expect(pending).rejects.toThrow(); current = false; done({ data: dto(), error: null }); await rejected;
    expect(p.begin).not.toHaveBeenCalled(); expect(p.capture).not.toHaveBeenCalled();
  });
  it("rejects a fresh context from another ordinary actor before creating an intent", async () => {
    const p = port(); p.context.mockResolvedValue({ data: { ...dto(), actor_id: P.otherActor }, error: null });
    await expect(createCurrentPlatformFileCapture(p).capture(selection(), P.request, new AbortController().signal, () => true)).rejects.toThrow();
    expect(p.begin).not.toHaveBeenCalled();
  });
  it("bounds a transport that ignores cancellation and never begins after timeout", async () => {
    vi.useFakeTimers(); const p = port(); p.context.mockReturnValue(new Promise(() => {}));
    const pending = createCurrentPlatformFileCapture(p).capture(selection(), P.request, new AbortController().signal, () => true);
    const rejected = expect(pending).rejects.toThrow(); await vi.advanceTimersByTimeAsync(20_001); await rejected;
    expect(p.begin).not.toHaveBeenCalled();
  });
});
