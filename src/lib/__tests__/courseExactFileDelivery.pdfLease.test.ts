import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { webcrypto } from "node:crypto";
import { createCourseExactFileGateway, type CourseExactFileSelection, type FrozenCourseFileDelivery } from "../courseExactFileDelivery";

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

let createURL: Mock<(value: Blob | MediaSource) => string>, revokeURL: Mock<(value: string) => void>;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto); createURL = vi.fn<(value: Blob | MediaSource) => string>(() => "blob:synthetic-learner"); revokeURL = vi.fn<(value: string) => void>();
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL(value: Blob | MediaSource): string { return createURL(value); }
    static revokeObjectURL(value: string): void { revokeURL(value); }
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function reader(context = frozen(), hex = PDF) {
  const client = { call: vi.fn(async () => ({ data: { ...context, bytes_hex: hex }, error: null })) };
  return { gateway: createCourseExactFileGateway(client), client };
}
function fromHex(hex: string) { return Uint8Array.from(hex.match(/../g)!, pair => Number.parseInt(pair, 16)); }

describe("verified learner PDF memory lease", () => {
  it("returns private independent byte copies only after the existing full binding/hash verification", async () => {
    const { gateway, client } = reader(); const lease = await gateway.readBytes(selected, frozen(), new AbortController().signal);
    const first = lease.copyVerifiedPdfBytes(), second = lease.copyVerifiedPdfBytes();
    expect(first).toEqual(fromHex(PDF)); expect(second).toEqual(first); expect(first).not.toBe(second);
    first[0] = 0; expect(lease.copyVerifiedPdfBytes()).toEqual(fromHex(PDF));
    expect(client.call).toHaveBeenCalledOnce(); expect(lease.binding.file_bytes_sha256).toBe(DIGEST); lease.release();
  });
  it("rejects further copies after release and revokes the Blob exactly once", async () => {
    const { gateway } = reader(); const lease = await gateway.readBytes(selected, frozen(), new AbortController().signal);
    lease.release(); lease.release(); expect(() => lease.copyVerifiedPdfBytes()).toThrow("Точная редакция файла недоступна");
    expect(revokeURL).toHaveBeenCalledExactlyOnceWith("blob:synthetic-learner");
  });
  it("closes byte access on the same ordinary request cancellation used by scope/focus invalidation", async () => {
    const abort = new AbortController(), { gateway } = reader(); const lease = await gateway.readBytes(selected, frozen(), abort.signal);
    abort.abort(); expect(() => lease.copyVerifiedPdfBytes()).toThrow("Точная редакция файла недоступна");
    expect(revokeURL).toHaveBeenCalledOnce();
  });
  it("does not offer image or unknown-format bytes to the PDF renderer", async () => {
    const hex = "89504e470d0a1a0a00000000", bytes = fromHex(hex);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
    const base = frozen(), context: FrozenCourseFileDelivery = { ...base, binding: { ...base.binding, file_bytes_sha256: digest, byte_length: bytes.length } };
    const { gateway } = reader(context, hex); const lease = await gateway.readBytes(selected, context, new AbortController().signal);
    expect(lease.previewKind).toBe("image"); expect(() => lease.copyVerifiedPdfBytes()).toThrow("Точная редакция файла недоступна"); lease.release();
  });
  it("does not create a byte or Blob lease when the old integrity gate fails", async () => {
    const base = frozen(), context: FrozenCourseFileDelivery = { ...base, binding: { ...base.binding, file_bytes_sha256: "0".repeat(64) } };
    const { gateway } = reader(context); await expect(gateway.readBytes(selected, context, new AbortController().signal)).rejects.toThrow("Точная редакция файла недоступна");
    expect(createURL).not.toHaveBeenCalled();
  });
});
