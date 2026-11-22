import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const transport = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: transport.rpc, functions: { invoke: transport.invoke } } }));
import { getRtnEditorial } from "./rtn-editorial";
import { RTN_SOURCE_FILE_BYTES, uploadRtnOfficialFile, type RtnSourceUploadRequest } from "./rtn-source-upload";
const sourceId = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222";
const metadata = { sourceId, intakeRequestId: requestId, expectedSourceGeneration: 0, publicationPageUrl: "https://www.gosnadzor.ru/service/list/Safety%20certification/index.php", documentUrl: "https://www.gosnadzor.ru/service/list/Safety%20certification/A.1.pdf", attestationVersion: "official-current-location-v1" as const };
function request(name = "official.pdf"): RtnSourceUploadRequest {
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 49]);
  const file = new File([bytes], name, { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { configurable: true, value: async () => bytes.buffer });
  return { metadata: { ...metadata }, file, parser: "industrial-pdf" };
}
const receipt = { intake_id: "33333333-3333-4333-8333-333333333333", request_id: requestId, source_id: sourceId, revision_id: "44444444-4444-4444-8444-444444444444", sha256: "1a".repeat(32), byte_size: 6, received_at: "2026-11-22T14:01:28Z", acquisition_method: "admin_upload", replayed: false, normalization_required: false, accepted_generation: 1, still_current: true, automatic_verification_advanced: false };
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("crypto", { subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).fill(0x1a).buffer) } }); });
afterEach(() => vi.unstubAllGlobals());

describe("official file upload API", () => {
  it("sends exactly the binary file and six canonical metadata fields without a fake HTTP status, hash or storage path", async () => {
    transport.invoke.mockResolvedValue({ data: receipt, error: null });
    const input = request();
    await expect(uploadRtnOfficialFile(input)).resolves.toEqual(receipt);
    expect(transport.invoke).toHaveBeenCalledTimes(1);
    const [endpoint, options] = transport.invoke.mock.calls[0];
    expect(endpoint).toBe("rtn-source-upload"); expect(options.body).toBeInstanceOf(FormData);
    expect([...options.body.keys()]).toEqual(["metadata", "file"]);
    expect(JSON.parse(options.body.get("metadata"))).toEqual(metadata);
    expect(options.body.get("file").size).toBe(input.file.size);
    expect(options.headers).toBeUndefined(); expect(options.timeout).toBe(100_000);
    expect(transport.rpc).not.toHaveBeenCalled();
  });
  it.each(["request_id", "source_id", "byte_size", "sha256"])("rejects a receipt bound to a different %s as an uncertain outcome", async key => {
    transport.invoke.mockResolvedValue({ data: { ...receipt, [key]: key === "byte_size" ? 7 : key === "sha256" ? "f".repeat(64) : "55555555-5555-4555-8555-555555555555" }, error: null });
    await expect(uploadRtnOfficialFile(request())).rejects.toMatchObject({ code: "invalid_response", uncertain: true });
    expect(transport.invoke).toHaveBeenCalledTimes(1);
  });
  it("does not accept a receipt claiming that a manual upload advanced automatic verification", async () => {
    transport.invoke.mockResolvedValue({ data: { ...receipt, automatic_verification_advanced: true }, error: null });
    await expect(uploadRtnOfficialFile(request())).rejects.toMatchObject({ code: "invalid_response", uncertain: true });
  });
  it.each([400, 401, 403, 409, 413, 415])("keeps HTTP%s definite and never retries through a different endpoint", async status => {
    transport.invoke.mockResolvedValue({ data: null, error: { context: { status } } });
    await expect(uploadRtnOfficialFile(request())).rejects.toMatchObject({ uncertain: false });
    expect(transport.invoke).toHaveBeenCalledTimes(1);
  });
  it.each(["503", "network"])("keeps the same request available after uncertain %s without an automatic retry", async kind => {
    if (kind === "503") transport.invoke.mockResolvedValue({ data: null, error: { context: { status: 503 } } });
    else transport.invoke.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(uploadRtnOfficialFile(request())).rejects.toMatchObject({ code: "unavailable", uncertain: true });
    expect(transport.invoke).toHaveBeenCalledTimes(1);
  });
  it("explains a historical-original denial without retrying or changing the current edition", async () => {
    const response = new Response(JSON.stringify({ error: "RTN_IMPORT_HISTORICAL_REVISION_REQUIRES_REVIEW" }), { status: 409 });
    transport.invoke.mockResolvedValue({ data: null, error: { context: response }, response });
    await expect(uploadRtnOfficialFile(request())).rejects.toMatchObject({ code: "historical", uncertain: false, message: expect.stringContaining("текущая редакция не изменена") });
    expect(transport.invoke).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized files before reading or sending any bytes", async () => {
    const input = request(); Object.defineProperty(input.file, "size", { value: RTN_SOURCE_FILE_BYTES + 1 });
    await expect(uploadRtnOfficialFile(input)).rejects.toMatchObject({ code: "too_large", uncertain: false });
    expect(transport.invoke).not.toHaveBeenCalled();
  });
  it("rejects a file type or publication URL outside the selected official channel", async () => {
    await expect(uploadRtnOfficialFile(request("not-official.txt"))).rejects.toMatchObject({ code: "unsupported" });
    const input = request(); input.metadata.documentUrl = "https://other.example/A.1.pdf";
    await expect(uploadRtnOfficialFile(input)).rejects.toMatchObject({ code: "invalid" });
    expect(transport.invoke).not.toHaveBeenCalled();
  });
  it("does not send a file after the original UI scope has been aborted during local hashing", async () => {
    const controller = new AbortController(), input = request();
    Object.defineProperty(input.file, "arrayBuffer", { configurable: true, value: async () => { controller.abort(); return new Uint8Array(6).buffer; } });
    await expect(uploadRtnOfficialFile(input, controller.signal)).rejects.toMatchObject({ uncertain: false });
    expect(transport.invoke).not.toHaveBeenCalled();
  });
  it("requires the exact advertised intake capability and leaves an old server without an upload action", async () => {
    const data = { sources: [], banks: [], source_revisions: [], bank_revisions: [], key_sets: [], releases: [] };
    transport.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(getRtnEditorial()).resolves.not.toHaveProperty("manual_source_import_capability");
    transport.rpc.mockResolvedValueOnce({ data: { ...data, manual_source_import_capability: { version: "rtn-manual-intake-v1", attestation_version: "official-current-location-v1", max_file_bytes: RTN_SOURCE_FILE_BYTES * 2 } }, error: null });
    await expect(getRtnEditorial()).rejects.toThrow("Не удалось подтвердить возможность загрузки");
  });
});
