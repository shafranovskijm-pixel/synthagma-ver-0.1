// @vitest-environment node
import {describe, it, expect, vi} from "vitest";
import {createClient as actualCreateClient} from "@supabase/supabase-js";
import {admissionMutationResultSchema} from "../../../../src/lib/admissionCases/contract";
import {admissionEvidenceCommitRequest} from "../admission-case-evidence-commit";
import {admissionEvidenceFileRequest} from "../admission-case-evidence-file";
import {ADMISSION_EVIDENCE_BUCKET, ADMISSION_MAX_BYTES, ADMISSION_EVIDENCE_REVISION, admissionFetch, admissionDeadline, admissionCheckSignal,
  validateAdmissionBytes, admissionHash, AdmissionError} from "../admission-case-access";
import {fixture, entry, state, id, actor, scope, caseId, reservation, evidence, sourceId, sealedId, requestId, time, commitInput, post, pdf, jpeg, png} from "./admission-case-evidence.fixture";

const code = async (response: Response) => ({status: response.status, ...await response.json()});
describe("UC012 private evidence commit boundary", () => {
  it.each(["GET", "PUT", "DELETE", "OPTIONS"])("guards %s before clients", async method => {
    const f = await fixture(), response = await admissionEvidenceCommitRequest(new Request("https://synthetic.invalid", {method}), f.deps);
    expect(response.status).toBe(method === "OPTIONS" ? 204 : 405);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("X-Sintagma-Function-Revision")).toBe(ADMISSION_EVIDENCE_REVISION);
    expect(f.createCaller).not.toHaveBeenCalled(); expect(f.createService).not.toHaveBeenCalled();
  });
  it.each([{}, [], null, {...commitInput, path: "https://evil.invalid/a"}, {...commitInput, bucket: "avatars"}, {...commitInput, sha256: "a".repeat(64)},
    {...commitInput, status: "admitted"}, {...commitInput, expected_revision: 0}, {...commitInput, expected_revision: -1}, {...commitInput, expected_revision: 1.5},
    {...commitInput, case_id: "../private"}, {...commitInput, reservation_id: id(99).toUpperCase().replace("0000", "ABCD")}, {...commitInput, request_id: null}])("rejects malformed public input %j", async body => {
    const f = await fixture(); expect((await f.run(body)).status).toBe(400); expect(f.createCaller).not.toHaveBeenCalled();
  });
  it("refuses a new increment beyond safe revision range", async () => {const f = await fixture(); expect(await code(await f.run({...commitInput, expected_revision: Number.MAX_SAFE_INTEGER}))).toMatchObject({status: 413, code: "LIMIT_REACHED"}); expect(f.createCaller).not.toHaveBeenCalled();});
  it.each(["", "Basic x", "Bearer A B", "Bearer  A"])("rejects malformed bearer %s", async authorization => {
    const f = await fixture(); expect((await admissionEvidenceCommitRequest(post(commitInput, {Authorization: authorization}), f.deps)).status).toBe(401); expect(f.createCaller).not.toHaveBeenCalled();
  });
  it("bounds actual JSON stream and encoding before clients", async () => {
    const f = await fixture();
    const cases = [post({...commitInput, extra: "x".repeat(5000)}), post(commitInput, {"Content-Type": "text/plain"}),
      new Request("https://synthetic.invalid", {method: "POST", headers: {Authorization: "Bearer A", "Content-Type": "application/json"}, body: "{"}),
      new Request("https://synthetic.invalid", {method: "POST", headers: {Authorization: "Bearer A", "Content-Type": "application/json"}, body: new Uint8Array([255, 255])}),
      post(commitInput, {"Content-Length": "9000"}), post(commitInput, {"Content-Length": "oops"})];
    for (const request of cases) expect((await admissionEvidenceCommitRequest(request, f.deps)).status).toBe(400);
    expect(f.createCaller).not.toHaveBeenCalled();
  });
  it("does not construct a client when configuration is absent", async () => {const f = await fixture(); expect((await admissionEvidenceCommitRequest(post(), {...f.deps, configured: false})).status).toBe(503); expect(f.createCaller).not.toHaveBeenCalled();});
  it.each([[pdf, "application/pdf"], [jpeg, "image/jpeg"], [png, "image/png"]] as const)("seals actual %s bytes and original-caller finalizes only evidence", async (bytes, mime) => {
    const f = await fixture(bytes, mime), response = await f.run(); expect(response.status).toBe(200);
    const result = await response.json(); expect(admissionMutationResultSchema.parse(result)).toEqual(f.receipt());
    expect(f.createCaller).toHaveBeenCalledWith("Bearer SYNTHETIC_A", expect.any(AbortSignal));
    expect(f.getUser.mock.calls.every(([token]) => token === "SYNTHETIC_A")).toBe(true);
    expect(f.callerFrom).toHaveBeenCalledWith(ADMISSION_EVIDENCE_BUCKET); expect(f.download).toHaveBeenCalledExactlyOnceWith(f.source.path);
    expect(f.serviceFrom.mock.calls.every(([bucket]) => bucket === ADMISSION_EVIDENCE_BUCKET)).toBe(true);
    expect(f.upload).toHaveBeenCalledExactlyOnceWith(f.sealedPath, Uint8Array.from(bytes).buffer, {contentType: mime, upsert: false, cacheControl: "0"});
    expect(f.attest).toHaveBeenCalledExactlyOnceWith("uc_attest_admission_case_evidence", {p_actor_id: actor, p_case_id: caseId, p_reservation_id: reservation,
      p_expected_revision: 4, p_request_id: requestId, p_source_object_id: sourceId, p_source_updated_at: time, p_source_fingerprint: "e".repeat(64),
      p_sealed_object_id: sealedId, p_sealed_updated_at: time, p_byte_sha256: f.hash, p_byte_size: bytes.length, p_mime_type: mime});
    expect(f.rpc).toHaveBeenCalledWith("uc_finalize_admission_case_evidence", {p_case_id: caseId, p_reservation_id: reservation, p_expected_revision: 4, p_request_id: requestId});
    expect(result.state.decision).toBeNull(); expect(result.receipt.kind).toBe("evidence_committed");
  });
  it.each(["student-documents", "org-documents"])("reads existing %s under original caller, never service", async bucket => {
    const f = await fixture(); f.base.source_kind = "existing"; f.source.bucket = bucket;
    f.source.path = bucket === "student-documents" ? `${scope.user_id}/education/synthetic.pdf` : `${scope.organization_id}/versions/${id(70)}/${id(71)}.pdf`;
    expect((await f.run()).status).toBe(200); expect(f.callerFrom).toHaveBeenCalledWith(bucket);
    expect(f.serviceFrom.mock.calls.some(([value]) => value !== ADMISSION_EVIDENCE_BUCKET)).toBe(false);
  });
  it("reconciles an inaccessible create-only orphan only after proving the same actual bytes", async () => {
    const f = await fixture(); f.upload.mockResolvedValue({data: null, error: {statusCode: "409"}} as any);
    expect((await f.run()).status).toBe(200); expect(f.upload).toHaveBeenCalledOnce(); expect(f.serviceDownload).toHaveBeenCalledOnce();
    const bad = await fixture(); bad.upload.mockResolvedValue({data: null, error: {statusCode: "409"}} as any);
    bad.serviceDownload.mockResolvedValue({data: new Blob([new TextEncoder().encode("%PDF-1.7\nDIFFERENT\n%%EOF\n")], {type: "application/pdf"}), error: null});
    expect((await bad.run()).status).toBe(409); expect(bad.attest).not.toHaveBeenCalled(); expect(bad.rpc.mock.calls.some(([name]) => name.includes("finalize"))).toBe(false);
  });
  it("does not reinterpret an arbitrary upload failure as an orphan retry", async () => {const f = await fixture(); f.upload.mockResolvedValue({data: null, error: {statusCode: "503"}} as any); expect((await f.run()).status).toBe(503); expect(f.info).not.toHaveBeenCalled();});
  it("resumes a sealed reservation without upload or service attestation", async () => {const f = await fixture(); f.setMode("sealed"); expect((await f.run()).status).toBe(200); expect(f.upload).not.toHaveBeenCalled(); expect(f.attest).not.toHaveBeenCalled(); expect(f.download).toHaveBeenCalledOnce();});
  it("consumed replay reads only committed sealed bytes and returns fresh authorized state", async () => {
    const f = await fixture(); f.setMode("consumed"); f.base.expires_at = "2020-01-01T00:00:00Z";
    f.rpc.mockImplementation(async () => ({data: {...f.context(), case_revision: Number.MAX_SAFE_INTEGER, replay_result: f.receipt(true, Number.MAX_SAFE_INTEGER)}, error: null}));
    const result = await f.run(); expect(result.status).toBe(200); expect((await result.json()).state.revision).toBe(Number.MAX_SAFE_INTEGER);
    expect(f.download).not.toHaveBeenCalled(); expect(f.serviceDownload).toHaveBeenCalledExactlyOnceWith(f.sealedPath); expect(f.upload).not.toHaveBeenCalled(); expect(f.attest).not.toHaveBeenCalled();
  });
  it.each([{actor_id: id(99)}, {case_id: id(99)}, {reservation_id: id(99)}, {expected_revision: 5}, {request_id: id(99)}, {case_revision: 5}, {mode: "admitted"},
    {scope: {...scope, user_id: id(99)}}, {expires_at: "2026-02-30T03:00:00Z"}, {sealed: {}}, {replay_result: {}}, {secret: "private"}])("rejects malformed/foreign private context %j", async patch => {
    const f = await fixture(); Object.assign(f.base, patch);
    if ("mode" in patch || "case_revision" in patch || "sealed" in patch || "replay_result" in patch) f.rpc.mockResolvedValue({data: {...f.context(), ...patch}, error: null});
    expect((await f.run()).status).toBe(409); expect(f.download).not.toHaveBeenCalled(); expect(f.upload).not.toHaveBeenCalled();
  });
  it.each([{bucket: "avatars"}, {path: "https://evil.invalid/a"}, {path: `${scope.user_id}/../a`}, {path: `${scope.user_id}/%2e%2e/a`},
    {object_id: "bad"}, {byte_size: 0}, {byte_size: ADMISSION_MAX_BYTES + 1}, {mime_type: "text/html"}, {known_sha256: null}, {updated_at: "not-time"}, {fingerprint: "bad"}])("rejects malformed source proof %j", async patch => {
    const f = await fixture(); Object.assign(f.source, patch); expect((await f.run()).status).toBe(409); expect(f.download).not.toHaveBeenCalled();
  });
  it.each([new Uint8Array(), new TextEncoder().encode("<svg/>"), new TextEncoder().encode("%PDF-1.7\nno EOF"), new TextEncoder().encode("%PDF-1.7\n%%EOF\n<script>"),
    new Uint8Array([255, 216, 255, 217])])("does not seal unapproved or truncated envelope", async bytes => {
    const f = await fixture(); f.source.byte_size = Math.max(1, bytes.length); f.source.known_sha256 = await admissionHash(bytes);
    f.download.mockResolvedValue({data: new Blob([Uint8Array.from(bytes).buffer], {type: "application/pdf"}), error: null});
    expect((await f.run()).status).toBe(409); expect(f.upload).not.toHaveBeenCalled();
  });
  it("rejects lying Blob size/bytes, MIME mismatch and actual hash mismatch", async () => {
    for (const data of [new Blob([pdf], {type: "image/jpeg"}), {size: pdf.length, type: "application/pdf", arrayBuffer: async () => new Uint8Array(ADMISSION_MAX_BYTES + 1).buffer}, new Blob([pdf.slice(1)], {type: "application/pdf"})]) {
      const f = await fixture(); f.download.mockResolvedValue({data, error: null} as any); expect((await f.run()).status).toBe(409); expect(f.upload).not.toHaveBeenCalled();
    }
    const f = await fixture(); f.source.known_sha256 = "0".repeat(64); expect((await f.run()).status).toBe(409); expect(f.upload).not.toHaveBeenCalled();
  });
  it.each([["42501", "secret", 403, "ACCESS_DENIED"], ["40001", "secret", 409, "REVISION_CONFLICT"], ["22023", "secret", 400, "INVALID_INPUT"],
    ["P0001", "ADMISSION_SOURCE_CHANGED", 409, "SOURCE_CHANGED"], ["P0001", "ADMISSION_SOURCE_UNAVAILABLE", 409, "SOURCE_UNAVAILABLE"],
    ["P0001", "ADMISSION_REVIEW_REQUIRED", 409, "REVIEW_REQUIRED"], ["P0001", "raw private SQL/path/token", 503, "DEPENDENCY_UNAVAILABLE"]])("sanitizes SQL %s %s", async (sql, message, status, expected) => {
    const f = await fixture(); f.rpc.mockResolvedValue({data: null, error: {code: sql, message}} as any);
    expect(await code(await f.run())).toMatchObject({status, schema_version: 1, code: expected, retryable: expected === "DEPENDENCY_UNAVAILABLE"}); expect(f.download).not.toHaveBeenCalled();
  });
  it("drops original actor replacement or rights revocation before any seal", async () => {
    const f = await fixture(); f.getUser.mockResolvedValueOnce({data: {user: {id: actor}}, error: null}).mockResolvedValueOnce({data: {user: {id: id(99)}}, error: null});
    expect((await f.run()).status).toBe(403); expect(f.upload).not.toHaveBeenCalled();
    const denied = await fixture(); denied.rpc.mockResolvedValueOnce({data: denied.context(), error: null}).mockResolvedValueOnce({data: null, error: {code: "42501"}} as any);
    expect((await denied.run()).status).toBe(403); expect(denied.upload).not.toHaveBeenCalled();
  });
  it("rejects source changes down to PostgreSQL microseconds", async () => {
    const f = await fixture(); let reads = 0; f.rpc.mockImplementation(async () => ({data: {...f.context(), source: {...f.source, updated_at: ++reads === 1 ? "2026-10-19T03:00:00.000001Z" : "2026-10-19T03:00:00.000002Z"}}, error: null}));
    expect((await f.run()).status).toBe(409); expect(f.upload).not.toHaveBeenCalled();
  });
  it("rejects sealed object replacement after actual read and before attestation", async () => {const f = await fixture(), initial = (await f.info(f.sealedPath)).data; f.info.mockClear().mockResolvedValueOnce({data: {...initial}, error: null}).mockResolvedValueOnce({data: {...initial, id: id(99)}, error: null}); expect((await f.run()).status).toBe(409); expect(f.serviceDownload).toHaveBeenCalledOnce(); expect(f.attest).not.toHaveBeenCalled();});
  it("withholds result if rights disappear after successful finalization", async () => {
    const f = await fixture(); const original = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation(async (name, args) => {if (name === "uc_admission_evidence_context" && f.context().mode === "consumed") return {data: null, error: {code: "42501"}} as any; return original(name, args);});
    expect((await f.run()).status).toBe(403); expect(f.attest).toHaveBeenCalledOnce(); expect(f.rpc.mock.calls.some(([name]) => name.includes("finalize"))).toBe(true);
  });
  it("no original business finalization after late service-attestation authorization loss", async () => {
    const f = await fixture(), original = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation(async (name, args) => name.includes("context") && f.context().mode === "sealed" ? {data: null, error: {code: "42501"}} : original(name, args));
    expect((await f.run()).status).toBe(403); expect(f.attest).toHaveBeenCalledOnce(); expect(f.rpc.mock.calls.some(([name]) => name.includes("finalize"))).toBe(false);
  });
  it.each([{evidence_version_id: id(99)}, {byte_sha256: "0".repeat(64)}, {state: "admitted"}, {secret: "private"}])("rejects service attestation echo mismatch %j", async patch => {
    const f = await fixture(), original = f.attest.getMockImplementation()!;
    f.attest.mockImplementation(async (name, args) => {const result = await original(name, args); return {...result, data: {...result.data, ...patch}} as any;});
    expect((await f.run()).status).toBe(409); expect(f.rpc.mock.calls.some(([name]) => name.includes("finalize"))).toBe(false);
  });
  it("consumed replay cannot hide corrupt sealed bytes behind an old receipt", async () => {
    const f = await fixture(); f.setMode("consumed"); const changed = Uint8Array.from(pdf); changed[15] ^= 1;
    f.serviceDownload.mockResolvedValue({data: new Blob([changed], {type: "application/pdf"}), error: null}); expect((await f.run()).status).toBe(409);
    expect(f.upload).not.toHaveBeenCalled(); expect(f.attest).not.toHaveBeenCalled();
  });
  it("allows historical consumed evidence outside a later current projection", async () => {
    const f = await fixture(); f.setMode("consumed");
    f.rpc.mockImplementation(async () => {const replay = f.receipt(true, 9); replay.state.evidence = []; return {data: {...f.context(), case_revision: 9, replay_result: replay}, error: null};});
    expect((await f.run()).status).toBe(200); expect(f.upload).not.toHaveBeenCalled();
  });
  it.each(["byte_sha256", "byte_size", "mime_type", "requirement_id"])("rejects wrong freshly committed evidence field %s", async field => {
    const f = await fixture(), original = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation(async (name, args) => {
      if (!name.includes("finalize")) return original(name, args);
      const result = f.receipt(); result.state.evidence[0][field] = field === "byte_size" ? 1 : field === "mime_type" ? "image/jpeg" : field === "requirement_id" ? id(99) : "0".repeat(64);
      return {data: result, error: null};
    }); expect((await f.run()).status).toBe(409);
  });
  it.each([{schema_version: 2}, {path: "private"}, {receipt: {schema_version: 1}}, {state: {...state("0".repeat(64), "application/pdf", pdf.length), scope: {...scope, user_id: id(99)}}}])("rejects malformed/leaking business echo %j", async patch => {
    const f = await fixture(), original = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation(async (name, args) => name.includes("finalize") ? {data: {...f.receipt(), ...patch}, error: null} : original(name, args));
    expect((await f.run()).status).toBe(409);
  });
});

describe("finite byte and network bounds", () => {
  it.each(["commit", "file"] as const)("%s deadline cancels and unlocks an actually stalled native Request body", async kind => {
    vi.useFakeTimers();
    try {
      const f = await fixture(), cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({start(controller) {controller.enqueue(new TextEncoder().encode('{"case_id":'));}, cancel});
      const request = new Request("https://synthetic.invalid", {method: "POST", headers: {Authorization: "Bearer SYNTHETIC_A", "Content-Type": "application/json"}, body, duplex: "half"} as RequestInit);
      const running = (kind === "commit" ? admissionEvidenceCommitRequest : admissionEvidenceFileRequest)(request, f.deps);
      await Promise.resolve(); expect(request.body!.locked).toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await code(await running)).toMatchObject({status: 503, code: "DEPENDENCY_UNAVAILABLE"});
      expect(cancel).toHaveBeenCalledOnce(); expect(request.body!.locked).toBe(false);
      expect(f.createCaller).not.toHaveBeenCalled(); expect(f.createService).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled(); expect(f.attest).not.toHaveBeenCalled();
    } finally {vi.useRealTimers();}
  });
  it.each(["commit", "file"] as const)("%s original Request abort cancels pending body without later operations", async kind => {
    const f = await fixture(), cancel = vi.fn(), controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({start(stream) {stream.enqueue(new TextEncoder().encode('{"case_id":'));}, cancel});
    const request = new Request("https://synthetic.invalid", {method: "POST", signal: controller.signal,
      headers: {Authorization: "Bearer SYNTHETIC_A", "Content-Type": "application/json"}, body, duplex: "half"} as RequestInit);
    const running = (kind === "commit" ? admissionEvidenceCommitRequest : admissionEvidenceFileRequest)(request, f.deps);
    await Promise.resolve(); expect(request.body!.locked).toBe(true); controller.abort();
    expect(await code(await running)).toMatchObject({status: 503, code: "DEPENDENCY_UNAVAILABLE"});
    expect(cancel).toHaveBeenCalledOnce(); expect(request.body!.locked).toBe(false);
    await Promise.resolve(); expect(f.createCaller).not.toHaveBeenCalled(); expect(f.createService).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled(); expect(f.upload).not.toHaveBeenCalled();
  });
  it("PNG CRC/chunk/end checks reject corruption, truncation and trailing bytes", () => {
    expect(() => validateAdmissionBytes(png, "image/png")).not.toThrow();
    const changed = Uint8Array.from(png); changed[20] ^= 1;
    for (const bytes of [changed, png.slice(0, -1), new Uint8Array([...png, 0]), new Uint8Array([137,80,78,71,13,10,26,10])]) expect(() => validateAdmissionBytes(bytes, "image/png")).toThrow(AdmissionError);
  });
  it("caps actual streamed response even when Content-Length lies or is absent", async () => {
    const cancel = vi.fn(), signal = new AbortController().signal;
    for (const headers of [{}, {"Content-Length": "1"}]) {
      const network = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(ADMISSION_MAX_BYTES)); controller.enqueue(new Uint8Array(1));}, cancel}), {headers: headers as Record<string, string>}));
      const response = await admissionFetch(network as any, signal)("https://synthetic.invalid/storage/v1/object/a");
      await expect(response.arrayBuffer()).rejects.toThrow(); expect(network.mock.calls[0][1]).toMatchObject({redirect: "error", cache: "no-store", signal});
    }
    expect(cancel).toHaveBeenCalled();
  });
  it("rejects declared oversize before body read", async () => {const body = new ReadableStream({cancel: vi.fn()}); const network = vi.fn(async () => new Response(body, {headers: {"Content-Length": String(ADMISSION_MAX_BYTES + 1)}})); await expect(admissionFetch(network as any, new AbortController().signal)("https://synthetic.invalid")).rejects.toThrow();});
  it("whole-operation timeout aborts all SDK work and prevents a late mutation checkpoint", async () => {
    vi.useFakeTimers(); try {
      let release!: () => void, signal!: AbortSignal; const mutate = vi.fn();
      const run = admissionDeadline(new Request("https://synthetic.invalid"), async current => {signal = current; await new Promise<void>(resolve => {release = resolve;}); admissionCheckSignal(current); mutate();});
      const observed = expect(run).rejects.toThrow(AdmissionError); await vi.advanceTimersByTimeAsync(60_000); await observed;
      expect(signal.aborted).toBe(true); release(); await Promise.resolve(); expect(mutate).not.toHaveBeenCalled();
    } finally {vi.useRealTimers();}
  });
});

describe("actual installed SDK entry adapters", () => {
  it("guards config/method before constructing SDKs", async () => {const create = vi.fn(); expect((await entry("commit", create)(new Request("https://synthetic.invalid", {method: "OPTIONS"}))).status).toBe(204); expect((await entry("commit", create, undefined, {})(post())).status).toBe(503); expect(create).not.toHaveBeenCalled();});
  it("pins original A across actual lazy-token SDK RPC+legacy Storage; service only seals/transports exact proof", async () => {
    const f = await fixture(); f.base.source_kind = "existing"; f.source.bucket = "student-documents"; f.source.path = `${scope.user_id}/synthetic.pdf`;
    let release!: (token: string) => void, enter!: () => void; const entered = new Promise<void>(resolve => {enter = resolve;}), deferred = new Promise<string>(resolve => {release = resolve;});
    const seen: {url: string; method: string; bearer: string | null}[] = [];
    const json = (value: unknown) => new Response(JSON.stringify(value), {headers: {"Content-Type": "application/json"}});
    const network = vi.fn(async (input: any, init: any) => {
      const request = new Request(input, init); seen.push({url: request.url, method: request.method, bearer: request.headers.get("Authorization")});
      expect(init.redirect).toBe("error"); expect(init.cache).toBe("no-store");
      if (request.url.includes("/rest/v1/rpc/")) {
        const name = request.url.split("/").pop()!; const args = await request.json();
        return json((await (name.includes("attest") ? f.attest(name, args) : f.rpc(name, args))).data);
      }
      if (request.url.includes("/storage/v1/object/info/")) return json({id: sealedId, name: f.sealedPath, bucket_id: ADMISSION_EVIDENCE_BUCKET,
        updated_at: time, created_at: time, size: pdf.length, content_type: "application/pdf", metadata: {size: pdf.length, mimetype: "application/pdf"}});
      if (request.method === "POST") {expect(new Uint8Array(await request.arrayBuffer())).toEqual(pdf); expect(request.headers.get("x-upsert")).toBe("false"); return json({Id: sealedId, Key: `${ADMISSION_EVIDENCE_BUCKET}/${f.sealedPath}`});}
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
    const running = entry("commit", create, network as any)(post()); await entered; release("SYNTHETIC_B");
    const response = await running; expect(response.status).toBe(200); expect(admissionMutationResultSchema.parse(await response.json()).receipt.kind).toBe("evidence_committed");
    for (const row of seen) {
      const original = row.url.includes("/rpc/uc_admission_evidence_context") || row.url.includes("/rpc/uc_finalize_") || row.url.includes("/object/student-documents/");
      expect(row.bearer).toBe(original ? "Bearer SYNTHETIC_A" : "Bearer SYNTHETIC_SERVICE");
    }
    expect(seen.some(row => row.bearer === "Bearer SYNTHETIC_B")).toBe(false);
    expect(seen.filter(row => row.url.includes("/rpc/uc_attest_")).length).toBe(1);
  });
});
