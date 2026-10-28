import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contextDto, P, parsedContext, sourceDto } from "@/lib/__tests__/platformCoursePublication.fixtures";
import { currentPlatformFileFromReview } from "@/lib/currentPlatformFileCapture";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), from: vi.fn(), queries: [] as Array<{ table: string; select: string; filters: Array<[string, unknown]> }>,
  docLibrary: null as string | null, docURL: "", lessonCourse: "", kind: "course_document" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc, functions: { invoke: mock.invoke }, from: mock.from } }));
import { currentPlatformFileCapture } from "../currentPlatformFileCapture";
const own = "4ac2c05a-d8b5-4e72-ba31-f2c743091d95", ref = "60000000-0000-0000-0000-000000000001";
const lesson = "50000000-0000-0000-0000-000000000001", intent = "a0000000-0000-4000-8000-000000000001";
const receiptId = "a0000000-0000-4000-8000-000000000002", edition = "a0000000-0000-4000-8000-000000000003";
const bytes = new TextEncoder().encode("SYNTHETIC authenticated captured bytes");
const sha = createHash("sha256").update(bytes).digest("hex");
function source() { return sourceDto(P.target, { file_bindings: [{ reference_kind: mock.kind, reference_id: ref, state: "unconfirmed",
  receipt_id: null, exact_version_kind: null, exact_version_id: null, file_bytes_sha256: null, byte_length: null }] }); }
function c() { return contextDto({ current_source_context: source(), current_file_state: "unconfirmed" }); }
function receipt() { return { receipt_id: receiptId, intent_id: intent, course_id: P.target.courseId, marketplace_id: P.target.marketplaceId,
  reference_kind: mock.kind, reference_id: ref, captured_edition_id: edition, source_org_version_id: null, file_bytes_sha256: sha,
  byte_length: bytes.length, recorded_at: P.at, state: "bytes_sealed", replayed: false, source_bucket_public_at_capture: false,
  proof_scope: "actual_captured_bytes_not_historical_origin_attestation_or_review_approval" }; }
const cap = { protocol: "pcf-bytea/1", admin_bytes_reader_source: true, own_learner_bytes_reader_source: true,
  frontend_consumers_accepted: false, copied_centre_exact_binding_supported: false, frozen_reader_implemented: false };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("crypto", webcrypto); mock.queries = []; mock.docLibrary = null;
  mock.kind = "course_document"; mock.lessonCourse = P.target.courseId;
  mock.docURL = "https://api.xn--80aaiswd0ak.xn--p1ai/sb-storage/object/sign/course-files/" + P.target.courseId + "/synthetic.bin?token=never-forward";
  mock.from.mockImplementation((table: string) => {
    const q = { table, select: "", filters: [] as Array<[string, unknown]> }; mock.queries.push(q);
    const allowed: Record<string, string[]> = { courses: ["id", "organization_id"], course_documents: ["id", "course_id", "file_url", "library_document_id"],
      lesson_attachments: ["id", "lesson_id", "file_url"], lessons: ["id", "course_id"] };
    let querySignal: AbortSignal | null = null;
    const chain = {
      select(columns: string) { if (!allowed[table] || columns.split(",").some(x => !allowed[table].includes(x))) throw Error("UNREVIEWED_METADATA_QUERY"); q.select = columns; return chain; },
      eq(field: string, value: unknown) { q.filters.push([field, value]); return chain; },
      abortSignal(signal: AbortSignal) { signal.throwIfAborted(); querySignal = signal; return chain; },
      maybeSingle() {
        if (!querySignal) throw Error("ABORT_SIGNAL_MUST_PRECEDE_MAYBE_SINGLE");
        querySignal.throwIfAborted();
        const rows: Record<string, unknown> = { courses: { id: P.target.courseId, organization_id: own },
          course_documents: { id: ref, course_id: P.target.courseId, file_url: mock.docURL, library_document_id: mock.docLibrary },
          lesson_attachments: { id: ref, lesson_id: lesson, file_url: mock.docURL }, lessons: { id: lesson, course_id: mock.lessonCourse } };
        return Promise.resolve({ data: rows[table], error: null });
      },
    }; return chain;
  });
  mock.rpc.mockImplementation((name: string) => ({ abortSignal: async (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (name === "read_platform_course_publication_review_context") return { data: c(), error: null };
    if (name === "begin_platform_course_current_file_capture") return { data: { schema_version: 1, actor_id: P.actor, organization_id: own,
      marketplace_id: P.target.marketplaceId, course_id: P.target.courseId, current_edition_sha256: P.sha, reference_kind: mock.kind, reference_id: ref,
      intent_id: intent, expires_at: P.next, replayed: false, state: "capture_intent_only_not_verified_or_approved",
      selection_proof: "same_transaction_current_course_files_only_no_library_or_org_version" }, error: null };
    if (name === "read_platform_course_file_receipt") return { data: { ...receipt(), bytes_hex: Buffer.from(bytes).toString("hex"),
      delivery_scope: "authorised_moderator_frozen_context_not_learner_acceptance", consumer_acceptance: cap }, error: null };
    throw Error("UNREVIEWED_RPC");
  } }));
  mock.invoke.mockImplementation(async () => ({ data: receipt(), error: null,
    response: new Response(null, { status: 200, headers: { "Content-Type": "application/json;charset=utf-8" } }) }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function run() {
  const target = currentPlatformFileFromReview(parsedContext({ current_source_context: source(), current_file_state: "unconfirmed" }),
    mock.kind as "course_document" | "lesson_attachment", ref);
  return currentPlatformFileCapture.capture(target, P.request, new AbortController().signal, () => true);
}
describe("ordinary current capture API wiring", () => {
  it("uses only new same-TX begin selection and opaque intent capture; never forwards the metadata locator", async () => {
    await run();
    expect(mock.rpc).toHaveBeenCalledWith("begin_platform_course_current_file_capture", { p_marketplace_id: P.target.marketplaceId,
      p_expected_edition_sha256: P.sha, p_reference_kind: "course_document", p_reference_id: ref, p_request_id: P.request });
    expect(mock.rpc.mock.calls.some(call => call[0] === "begin_platform_course_file_capture")).toBe(false);
    expect(mock.invoke).toHaveBeenCalledWith("platform-course-file/capture", { body: { intent_id: intent }, signal: expect.any(AbortSignal), timeout: 45000 });
    expect(mock.rpc).toHaveBeenCalledWith("read_platform_course_file_receipt", { p_receipt_id: receiptId });
    expect(JSON.stringify(mock.rpc.mock.calls) + JSON.stringify(mock.invoke.mock.calls)).not.toContain("never-forward");
    expect(mock.queries.filter(q => q.table === "course_documents").every(q => q.filters.some(([f, v]) => f === "id" && v === ref)
      && q.filters.some(([f, v]) => f === "course_id" && v === P.target.courseId))).toBe(true);
  });
  it("holds a linked library document before begin without choosing current/latest org versions", async () => {
    mock.docLibrary = receiptId; await expect(run()).rejects.toThrow();
    expect(mock.rpc.mock.calls.some(call => call[0] === "begin_platform_course_current_file_capture")).toBe(false);
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it("holds org-document pointers before begin even when they are in the correct organization", async () => {
    mock.docURL = "https://api.xn--80aaiswd0ak.xn--p1ai/sb-storage/object/public/org-documents/" + own + "/unknown-current.pdf";
    await expect(run()).rejects.toThrow(); expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.rpc.mock.calls.some(call => call[0] === "begin_platform_course_current_file_capture")).toBe(false);
  });
  it("checks current attachment-to-lesson-to-course association before begin", async () => {
    mock.kind = "lesson_attachment"; mock.lessonCourse = receiptId;
    await expect(run()).rejects.toThrow(); expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.queries.find(q => q.table === "lessons")?.filters).toContainEqual(["course_id", P.target.courseId]);
  });
});
