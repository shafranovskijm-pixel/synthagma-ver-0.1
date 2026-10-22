// @vitest-environment node
import {describe, it, expect, vi} from "vitest";
import {createClient as actualCreateClient} from "@supabase/supabase-js";
import {admissionEvidenceFileRequest} from "../../../functions/_shared/admission-case-evidence-file";
import {ADMISSION_EVIDENCE_BUCKET, ADMISSION_MAX_BYTES} from "../../../functions/_shared/admission-case-access";
import {fixture, entry, id, actor, scope, caseId, evidence, fileInput, post, pdf, jpeg, png} from "../../../functions/_shared/__tests__/admission-case-evidence.fixture";

describe("private exact admission evidence bytes", () => {
  it.each(["GET", "PUT", "DELETE", "OPTIONS"])("guards %s before clients", async method => {
    const f = await fixture(), response = await admissionEvidenceFileRequest(new Request("https://synthetic.invalid", {method}), f.deps);
    expect(response.status).toBe(method === "OPTIONS" ? 204 : 405); expect(f.createCaller).not.toHaveBeenCalled(); expect(f.createService).not.toHaveBeenCalled();
  });
  it.each([{}, null, {...fileInput, path: "https://evil.invalid"}, {...fileInput, bucket: "avatars"}, {...fileInput, evidence_version_id: "../x"}, {...fileInput, case_id: null}])("rejects public locator/malformed input %j", async body => {
    const f = await fixture(); expect((await f.file(body)).status).toBe(400); expect(f.createCaller).not.toHaveBeenCalled();
  });
  it.each([[pdf, "application/pdf", "pdf"], [jpeg, "image/jpeg", "jpg"], [png, "image/png", "png"]] as const)("returns exact %s attachment with no locator", async (bytes, mime, extension) => {
    const f = await fixture(bytes, mime), response = await f.file(); expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(mime); expect(response.headers.get("Content-Length")).toBe(String(bytes.length));
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="admission-document.${extension}"`);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes); expect(f.download).not.toHaveBeenCalled();
    expect(f.serviceFrom).toHaveBeenCalledExactlyOnceWith(ADMISSION_EVIDENCE_BUCKET); expect(f.serviceDownload).toHaveBeenCalledExactlyOnceWith(f.sealedPath);
    expect(f.rpc).toHaveBeenCalledTimes(2); expect(f.rpc).toHaveBeenCalledWith("uc_admission_evidence_file_context", {p_case_id: caseId, p_evidence_version_id: evidence});
    expect(f.attest).not.toHaveBeenCalled(); expect(f.upload).not.toHaveBeenCalled(); expect(f.info).not.toHaveBeenCalled();
  });
  it("current-scope denied cannot construct service or expose existence", async () => {const f = await fixture(); f.rpc.mockResolvedValue({data: null, error: {code: "42501", message: "private data"}} as any); const response = await f.file(); expect(response.status).toBe(403); expect(await response.json()).toMatchObject({schema_version: 1, code: "ACCESS_DENIED", retryable: false}); expect(f.createService).not.toHaveBeenCalled();});
  it.each([{actor_id: id(99)}, {case_id: id(99)}, {evidence_version_id: id(99)}, {byte_sha256: "0".repeat(64)}, {byte_size: 0}, {byte_size: ADMISSION_MAX_BYTES + 1},
    {mime_type: "text/html"}, {scope: {...scope, user_id: id(99)}}, {secret: "private"}])("rejects malformed/foreign file context before service read %j", async patch => {
    const f = await fixture(); f.rpc.mockResolvedValue({data: {...f.fileContext(), ...patch}, error: null}); expect((await f.file()).status).toBe(409); expect(f.createService).not.toHaveBeenCalled();
  });
  it.each([{bucket: "student-documents"}, {path: "https://evil.invalid/x"}, {path: `${scope.user_id}/${scope.organization_id}/${caseId}/sealed/${id(99)}`},
    {object_id: "invalid"}, {known_sha256: null}, {updated_at: "2026-02-30T01:00:00Z"}])("rejects wrong sealed proof %j", async patch => {
    const f = await fixture(); f.rpc.mockResolvedValue({data: {...f.fileContext(), object: {...f.fileContext().object, ...patch}}, error: null}); expect((await f.file()).status).toBe(409); expect(f.serviceDownload).not.toHaveBeenCalled();
  });
  it("detects actual corruption/MIME mismatch/missing object rather than returning partial bytes", async () => {
    for (const data of [null, new Blob([pdf], {type: "image/jpeg"}), new Blob([pdf.slice(1)], {type: "application/pdf"})]) {
      const f = await fixture(); f.serviceDownload.mockResolvedValue({data, error: null}); expect((await f.file()).status).toBe(409);
    }
    const f = await fixture(); const changed = Uint8Array.from(pdf); changed[15] ^= 1;
    f.serviceDownload.mockResolvedValue({data: new Blob([changed], {type: "application/pdf"}), error: null}); expect((await f.file()).status).toBe(409);
  });
  it("denial after actual bytes suppresses the file and old presentation", async () => {
    const f = await fixture(); f.rpc.mockResolvedValueOnce({data: f.fileContext(), error: null}).mockResolvedValueOnce({data: null, error: {code: "42501"}} as any);
    const response = await f.file(); expect(response.status).toBe(403); expect(response.headers.get("Content-Type")).toBe("application/json"); expect(f.serviceDownload).toHaveBeenCalledOnce();
  });
  it("actor replacement or expiration after bytes suppresses response", async () => {
    const f = await fixture(); f.getUser.mockResolvedValueOnce({data: {user: {id: actor}}, error: null}).mockResolvedValueOnce({data: {user: {id: id(99)}}, error: null}); expect((await f.file()).status).toBe(403);
    const expired = await fixture(); expired.getUser.mockResolvedValueOnce({data: {user: {id: actor}}, error: null}).mockResolvedValueOnce({data: {user: null}, error: {message: "expired"}} as any); expect((await expired.file()).status).toBe(401);
  });
  it("rejects changed object version or same-millisecond timestamp drift", async () => {
    const f = await fixture(); let reads = 0; f.rpc.mockImplementation(async () => ({data: {...f.fileContext(), object: {...f.fileContext().object,
      updated_at: ++reads === 1 ? "2026-10-19T03:00:00.000001Z" : "2026-10-19T03:00:00.000002Z"}}, error: null})); expect((await f.file()).status).toBe(409);
  });
  it("compares all contexts independent of object-key order and equivalent UTC spelling", async () => {
    const f = await fixture(), reverse = (value: any): any => value && typeof value === "object" ? Array.isArray(value) ? value.map(reverse) : Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value;
    let reads = 0; f.rpc.mockImplementation(async () => ({data: ++reads === 1 ? {...f.fileContext(), object: {...f.fileContext().object, updated_at: "2026-10-19T03:00:00+00:00"}} : reverse(f.fileContext()), error: null}));
    expect((await f.file()).status).toBe(200);
  });
  it("reads retained exact historical evidence without requiring it in current case projection", async () => {
    const f = await fixture(); f.rpc.mockImplementation(async () => ({data: {...f.fileContext(), case_revision: 22}, error: null})); expect((await f.file()).status).toBe(200);
    expect(f.rpc.mock.calls.every(([name]) => name === "uc_admission_evidence_file_context")).toBe(true);
  });
  it("actual installed adapter pins original caller A for context while only service transports fixed sealed bytes", async () => {
    const f = await fixture(); let enter!: () => void, release!: (value: string) => void;
    const entered = new Promise<void>(resolve => {enter = resolve;}), deferred = new Promise<string>(resolve => {release = resolve;});
    const seen: {url: string; bearer: string | null}[] = [];
    const network = vi.fn(async (input: any, init: any) => {
      const request = new Request(input, init); seen.push({url: request.url, bearer: request.headers.get("Authorization")});
      if (request.url.includes("/rest/v1/rpc/uc_admission_evidence_file_context")) return new Response(JSON.stringify(f.fileContext()), {headers: {"Content-Type": "application/json"}});
      expect(request.url).toContain(`/storage/v1/object/${ADMISSION_EVIDENCE_BUCKET}/${f.sealedPath}`); expect(init.redirect).toBe("error"); expect(init.cache).toBe("no-store");
      return new Response(pdf, {headers: {"Content-Type": "application/pdf"}});
    });
    const create = (url: string, key: string, options: any) => {
      const client = actualCreateClient(url, key, options);
      if (key === "SYNTHETIC_ANON") {
        client.auth.getUser = vi.fn(async (token: string) => f.getUser(token)) as any;
        client.auth.getSession = vi.fn(async () => {enter(); return {data: {session: {access_token: await deferred}}, error: null};}) as any;
      }
      return client;
    };
    const running = entry("file", create, network as any)(post(fileInput)); await entered; release("SYNTHETIC_B");
    const response = await running; expect(response.status).toBe(200); expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);
    expect(seen).toHaveLength(3); expect(seen.filter(row => row.url.includes("/rpc/")).every(row => row.bearer === "Bearer SYNTHETIC_A")).toBe(true);
    expect(seen.filter(row => row.url.includes("/storage/")).map(row => row.bearer)).toEqual(["Bearer SYNTHETIC_SERVICE"]);
    expect(f.getUser.mock.calls.every(([token]) => token === "SYNTHETIC_A")).toBe(true);
  });
});
