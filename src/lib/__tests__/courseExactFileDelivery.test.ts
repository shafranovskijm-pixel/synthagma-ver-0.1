import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { webcrypto } from "node:crypto";
import {
  createCourseExactFileGateway, CourseExactFileUnavailable, parseCourseFileDeliveryContext,
  type CourseExactFileSelection, type FrozenCourseFileDelivery,
} from "../courseExactFileDelivery";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PDF = "255044462d312e370a73796e7468657469632d636f70792d6f6e6c790a";
const DIGEST = "a25c5d19bb88e78d7651d9b85ed5f6ee8170df0a15e955171d5892bc0f8b1d00";
const selected: CourseExactFileSelection = { actorId: id(1), organizationId: id(2), courseId: id(3), referenceKind: "course_document", referenceId: id(4), accessMode: "learner", purpose: "preview" };
function frozen(): FrozenCourseFileDelivery {
  return { schema_version: 1, actor_id: selected.actorId, organization_id: selected.organizationId, course_id: selected.courseId,
    reference_kind: selected.referenceKind, reference_id: selected.referenceId, access_mode: selected.accessMode, purpose: selected.purpose,
    mode: "frozen_required", state: "bytes_sealed", binding: {
      schema_version: 1, state: "bytes_sealed", binding_id: id(5), copy_generation_id: id(6), course_id: selected.courseId,
      organization_id: selected.organizationId, reference_kind: selected.referenceKind, reference_id: selected.referenceId,
      module_id: null, lesson_id: null, source_organization_id: "4ac2c05a-d8b5-4e72-ba31-f2c743091d95", source_course_id: id(7),
      source_reference_kind: "course_document", source_reference_id: id(8), source_module_id: null, source_lesson_id: null,
      publication_id: id(9), publication_manifest_sha256: "a".repeat(64), file_receipt_id: id(10), captured_edition_id: id(11),
      source_org_version_id: null, file_bytes_sha256: DIGEST, byte_length: 29, display_name: "QA.pdf", visible_to_students: true, allow_download: true,
    } };
}
const legacy = () => ({ ...frozen(), mode: "legacy", state: "legacy", binding: null });
const signal = () => new AbortController().signal;
const reply = (data: unknown, error: unknown = null) => ({ call: vi.fn(async (_name: string, _args: Readonly<Record<string, string>>, _signal: AbortSignal) => ({ data, error })) });
let createURL: Mock<(value: Blob | MediaSource) => string>;
let revokeURL: Mock<(value: string) => void>;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  createURL = vi.fn<(value: Blob | MediaSource) => string>(() => "blob:qa-exact-file");
  revokeURL = vi.fn<(value: string) => void>();
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL(value: Blob | MediaSource): string { return createURL(value); }
    static revokeObjectURL(value: string): void { revokeURL(value); }
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("explicit delivery mode and exact target binding", () => {
  it("accepts PostgreSQL canonical UUIDs without imposing RFC version or variant bits", async () => {
    const pgSelection = { ...selected, actorId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", organizationId: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
      courseId: "70000000-0000-0000-0000-000000000003", referenceId: "70000000-0000-0000-0000-000000000004" };
    const base = frozen(); const pgContext: FrozenCourseFileDelivery = { ...base, actor_id: pgSelection.actorId,
      organization_id: pgSelection.organizationId, course_id: pgSelection.courseId, reference_id: pgSelection.referenceId,
      binding: { ...base.binding, organization_id: pgSelection.organizationId, course_id: pgSelection.courseId,
        reference_id: pgSelection.referenceId, binding_id: "70000000-0000-0000-0000-000000000005",
        copy_generation_id: "70000000-0000-0000-0000-000000000006", source_course_id: "70000000-0000-0000-0000-000000000007",
        source_reference_id: "70000000-0000-0000-0000-000000000008", publication_id: "70000000-0000-0000-0000-000000000009",
        file_receipt_id: "70000000-0000-0000-0000-000000000010", captured_edition_id: "70000000-0000-0000-0000-000000000011" } };
    const client = { call: vi.fn(async (name: string) => ({ data: name === "read_course_exact_file_delivery_context" ? pgContext : { ...pgContext, bytes_hex: PDF }, error: null })) };
    const gateway = createCourseExactFileGateway(client);
    const context = await gateway.readContext(pgSelection, signal());
    expect(context.state).toBe("bytes_sealed");
    const file = await gateway.readBytes(pgSelection, context as FrozenCourseFileDelivery, signal());
    expect(file.previewKind).toBe("pdf"); expect(client.call).toHaveBeenCalledTimes(2); file.release();
  });
  it.each(["aaaaaaaabbbbccccddddeeeeeeeeeeee", "gggggggg-bbbb-cccc-dddd-eeeeeeeeeeee", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee0", ""])("rejects malformed UUID syntax before an RPC: %s", async actorId => {
    const client = reply(legacy());
    await expect(createCourseExactFileGateway(client).readContext({ ...selected, actorId }, signal())).rejects.toThrow(CourseExactFileUnavailable);
    expect(client.call).not.toHaveBeenCalled();
  });
  it("classifies only the successful literal legacy context as legacy", async () => {
    const client = reply(legacy()); const context = await createCourseExactFileGateway(client).readContext(selected, signal());
    expect(context.mode).toBe("legacy"); expect(client.call).toHaveBeenCalledTimes(1);
    expect(client.call.mock.calls[0][0]).toBe("read_course_exact_file_delivery_context");
    expect(client.call.mock.calls[0][1]).toEqual({ p_course_id: id(3), p_reference_kind: "course_document", p_reference_id: id(4), p_access_mode: "learner", p_purpose: "preview" });
  });
  it("preserves a server-declared frozen hold without converting it to legacy", async () => {
    const client = reply({ ...frozen(), state: "hold", binding: null });
    expect(await createCourseExactFileGateway(client).readContext(selected, signal())).toMatchObject({ mode: "frozen_required", state: "hold", binding: null });
    expect(client.call).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["actor", { actor_id: id(20) }], ["tenant", { organization_id: id(20) }], ["course", { course_id: id(20) }],
    ["reference", { reference_id: id(20) }], ["access mode", { access_mode: "staff_preview" }], ["purpose", { purpose: "download" }],
    ["unknown decision", { mode: "unknown" }], ["extra live URL", { file_url: "https://invalid.example/live.pdf" }],
  ])("rejects a context with mismatched %s", (_name, patch) => {
    expect(() => parseCourseFileDeliveryContext({ ...legacy(), ...patch }, selected)).toThrow(CourseExactFileUnavailable);
  });
  it.each([
    ["source client owner", { source_organization_id: id(20) }], ["source equals copied course", { source_course_id: selected.courseId }],
    ["different target tenant", { organization_id: id(20) }], ["different reference kind", { source_reference_kind: "lesson_attachment" }],
    ["document carries lesson", { lesson_id: id(20) }], ["unbounded bytes", { byte_length: 8 * 1024 * 1024 + 1 }],
    ["hidden learner document", { visible_to_students: false }], ["live URL field", { file_url: "https://invalid.example/live.pdf" }],
  ])("holds a binding with %s", (_name, patch) => {
    const context = frozen(); expect(() => parseCourseFileDeliveryContext({ ...context, binding: { ...context.binding, ...patch } }, selected)).toThrow(CourseExactFileUnavailable);
  });
  it("requires an exact lesson source and target mapping for an attachment", () => {
    const context = frozen(); const attachment = { ...selected, referenceKind: "lesson_attachment" as const };
    const raw = { ...context, reference_kind: "lesson_attachment", binding: { ...context.binding, reference_kind: "lesson_attachment", source_reference_kind: "lesson_attachment" } };
    expect(() => parseCourseFileDeliveryContext(raw, attachment)).toThrow(CourseExactFileUnavailable);
    expect(parseCourseFileDeliveryContext({ ...raw, binding: { ...raw.binding, lesson_id: id(30), source_lesson_id: id(31) } }, attachment).state).toBe("bytes_sealed");
  });
  it("keeps preview available when download is disabled and denies a download request", () => {
    const context = frozen(); const disabled = { ...context, binding: { ...context.binding, allow_download: false } };
    expect(parseCourseFileDeliveryContext(disabled, selected).state).toBe("bytes_sealed");
    expect(() => parseCourseFileDeliveryContext({ ...disabled, purpose: "download" }, { ...selected, purpose: "download" })).toThrow(CourseExactFileUnavailable);
  });
});

describe("ordinary copied-course exact byte readback", () => {
  it("verifies the whole target/source tuple and hash, creates one PDF lease, and revokes once", async () => {
    const context = frozen(); const client = reply({ ...context, bytes_hex: PDF }); const abort = new AbortController();
    const lease = await createCourseExactFileGateway(client).readBytes(selected, context, abort.signal);
    expect(client.call.mock.calls[0][0]).toBe("read_copied_course_exact_file");
    expect(client.call.mock.calls[0][1]).toMatchObject({ p_course_id: id(3), p_binding_id: id(5), p_copy_generation_id: id(6) });
    expect(lease.previewKind).toBe("pdf"); expect(lease.mime).toBe("application/pdf"); expect(createURL).toHaveBeenCalledTimes(1);
    lease.release(); abort.abort(); lease.release(); expect(revokeURL).toHaveBeenCalledExactlyOnceWith("blob:qa-exact-file");
  });
  it("rejects changed bytes even when the server repeats the original hash", async () => {
    const context = frozen(); const client = reply({ ...context, bytes_hex: PDF.replace("25", "26") });
    await expect(createCourseExactFileGateway(client).readBytes(selected, context, signal())).rejects.toThrow(CourseExactFileUnavailable);
    expect(createURL).not.toHaveBeenCalled();
  });
  it.each(["file_receipt_id", "binding_id", "copy_generation_id", "source_reference_id", "captured_edition_id"] as const)("rejects another %s with the same bytes", async field => {
    const context = frozen(); const client = reply({ ...context, binding: { ...context.binding, [field]: id(70) }, bytes_hex: PDF });
    await expect(createCourseExactFileGateway(client).readBytes(selected, context, signal())).rejects.toThrow(CourseExactFileUnavailable);
    expect(createURL).not.toHaveBeenCalled();
  });
  it.each([PDF.toUpperCase(), PDF.slice(2), "zz".repeat(29)])("rejects noncanonical or wrong-length hex", async bytes_hex => {
    const context = frozen(); await expect(createCourseExactFileGateway(reply({ ...context, bytes_hex })).readBytes(selected, context, signal())).rejects.toThrow(CourseExactFileUnavailable);
    expect(createURL).not.toHaveBeenCalled();
  });
  it("revokes a delivered lease on cancellation", async () => {
    const context = frozen(); const abort = new AbortController();
    await createCourseExactFileGateway(reply({ ...context, bytes_hex: PDF })).readBytes(selected, context, abort.signal);
    abort.abort(); expect(revokeURL).toHaveBeenCalledTimes(1);
  });
  it("does not display SVG/HTML through an active or external viewer", async () => {
    const bytes = new TextEncoder().encode("<svg onload=alert(1)></svg>");
    const hash = Array.from(new Uint8Array(await webcrypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    const context = frozen(); const changed = { ...context, binding: { ...context.binding, byte_length: bytes.length, file_bytes_sha256: hash } };
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    const lease = await createCourseExactFileGateway(reply({ ...changed, bytes_hex: hex })).readBytes(selected, changed, signal());
    expect(lease.previewKind).toBe("download_only"); expect(lease.mime).toBe("application/octet-stream"); lease.release();
  });
});

describe("no error, cancellation, or absence becomes a legacy endpoint fallback", () => {
  it.each([{ code: "PGRST202" }, { status: 403 }, { message: "Failed to fetch" }])("rejects the RPC error even with legacy data", async error => {
    const client = reply(legacy(), error);
    await expect(createCourseExactFileGateway(client).readContext(selected, signal())).rejects.toThrow(CourseExactFileUnavailable);
    expect(client.call).toHaveBeenCalledTimes(1);
  });
  it("rejects an already cancelled selection before calling the SDK", async () => {
    const abort = new AbortController(); abort.abort(); const client = reply(legacy());
    await expect(createCourseExactFileGateway(client).readContext(selected, abort.signal)).rejects.toBeDefined(); expect(client.call).not.toHaveBeenCalled();
  });
  it("cancels without waiting for a transport that ignores its signal", async () => {
    const client = { call: vi.fn(() => new Promise<never>(() => {})) }; const abort = new AbortController();
    const pending = createCourseExactFileGateway(client).readContext(selected, abort.signal); abort.abort();
    await expect(pending).rejects.toBeDefined(); expect(client.call).toHaveBeenCalledTimes(1);
  });
  it("enforces the finite deadline even when the transport never resolves", async () => {
    vi.useFakeTimers(); const client = { call: vi.fn(() => new Promise<never>(() => {})) };
    const outcome = createCourseExactFileGateway(client).readContext(selected, signal()).then(() => "unexpected", error => error);
    await vi.advanceTimersByTimeAsync(20_000); expect(await outcome).toMatchObject({ name: "TimeoutError" });
    expect(client.call).toHaveBeenCalledTimes(1);
  });
});
