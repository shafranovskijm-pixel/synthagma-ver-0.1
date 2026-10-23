import {vi} from "vitest";
import {deflateSync} from "node:zlib";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {admissionHash, admissionFetch, ADMISSION_EVIDENCE_BUCKET, type AdmissionMime, type AdmissionDbResult} from "../admission-case-access";
import {admissionEvidenceCommitRequest} from "../admission-case-evidence-commit";
import {admissionEvidenceFileRequest} from "../admission-case-evidence-file";

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const actor = id(1), caseId = id(2), reservation = id(3), evidence = id(4), requirement = id(5), sourceId = id(6), sealedId = id(7), requestId = id(8);
export const scope = {organization_id: id(10), group_id: id(11), enrollment_id: id(12), user_id: id(13), course_id: id(14)};
export const time = "2026-10-19T03:00:00.000000Z";
export const program = {enrollment_snapshot_id: id(20), binding_id: id(21), binding_revision: 1, version_id: id(22), snapshot_hash: "a".repeat(64),
  facts_hash: "b".repeat(64), file_document_id: id(23), file_version_id: id(24), file_review_id: id(25)};
export const commitInput = {case_id: caseId, reservation_id: reservation, expected_revision: 4, request_id: requestId};
export const fileInput = {case_id: caseId, evidence_version_id: evidence};
export const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<</Type /Catalog>>\nendobj\ntrailer\n<</Root 1 0 R>>\n%%EOF\n");
export const jpeg = new Uint8Array([255, 216, 255, 224, 81, 65, 255, 217]);
function pngChunk(kind: string, bytes: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + bytes.length), view = new DataView(chunk.buffer);
  view.setUint32(0, bytes.length); chunk.set(new TextEncoder().encode(kind), 4); chunk.set(bytes, 8);
  let crc = -1; for (const byte of chunk.subarray(4, -4)) {crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);}
  view.setUint32(chunk.length - 4, (crc ^ -1) >>> 0); return chunk;
}
const ihdr = new Uint8Array([0,0,0,1,0,0,0,1,8,6,0,0,0]);
export const png = new Uint8Array(Buffer.concat([new Uint8Array([137,80,78,71,13,10,26,10]), pngChunk("IHDR", ihdr),
  pngChunk("IDAT", deflateSync(new Uint8Array([0,0,0,0,255]))), pngChunk("IEND", new Uint8Array())]));
export const post = (body: unknown = commitInput, headers: Record<string, string> = {}) => new Request("https://synthetic.invalid/functions/v1/admission-case-evidence-commit", {
  method: "POST", headers: {Authorization: "Bearer SYNTHETIC_A", "Content-Type": "application/json", ...headers}, body: JSON.stringify(body),
});
export function state(hash: string, mime: AdmissionMime, bytes: number, revision = 5): Record<string, any> {
  return {id: caseId, scope, revision, program_ref: program, program_title: "Synthetic programme", program_type: "dpo_upskilling", responsible_id: actor,
    rule_set_id: id(30), rule_set_digest: "c".repeat(64), requirements_digest: "d".repeat(64),
    requirements: [{id: requirement, revision: 1, rule_id: id(31), rule_set_id: id(30), rule_set_digest: "c".repeat(64), label: "Synthetic requirement",
      applicability: "unknown", review_event_id: null, evidence_version_ids: [], current_state: "unreviewed", public_next_action: null}],
    evidence: [{id: evidence, case_id: caseId, case_revision_created: 5, requirement_id: requirement, supersedes_id: null, source_kind: "upload", captured_at: time,
      byte_sha256: hash, byte_size: bytes, mime_type: mime, availability: "available", review: "unreviewed", review_event_id: null, can_read_bytes: true}],
    tasks: [], decision: null, prerequisites: [], capabilities: {can_initialize: false, can_assign: true, can_review: true, can_decide: true, can_prepare_evidence: true, can_configure_rules: true}};
}
export async function fixture(bytes = pdf, mime: AdmissionMime = "application/pdf") {
  const hash = await admissionHash(bytes); let mode: "prepared" | "sealed" | "consumed" = "prepared";
  const sealedPath = `${scope.user_id}/${scope.organization_id}/${caseId}/sealed/${evidence}`;
  const source: Record<string, any> = {bucket: ADMISSION_EVIDENCE_BUCKET, path: `${scope.user_id}/${scope.organization_id}/${caseId}/staging/${actor}/${reservation}`,
    object_id: sourceId, updated_at: time, mime_type: mime, byte_size: bytes.length, known_sha256: hash, fingerprint: "e".repeat(64)};
  const receipt = (replayed = false, revision = 5) => ({schema_version: 1, scope, receipt: {schema_version: 1, request_id: requestId, case_id: caseId,
    revision: 5, event_id: id(40), kind: "evidence_committed", payload_digest: "f".repeat(64)}, replayed, state: state(hash, mime, bytes.length, revision)});
  const base: Record<string, any> = {schema_version: 1, actor_id: actor, scope, case_id: caseId, case_revision: 4, expected_revision: 4,
    reservation_id: reservation, evidence_version_id: evidence, requirement_id: requirement, supersedes_id: null, request_id: requestId,
    expires_at: "2026-10-19T03:30:00Z", source_kind: "upload"};
  const sealed = () => ({bucket: ADMISSION_EVIDENCE_BUCKET, path: sealedPath, object_id: mode === "prepared" ? null : sealedId,
    updated_at: mode === "prepared" ? null : time, byte_sha256: mode === "prepared" ? null : hash, byte_size: mode === "prepared" ? null : bytes.length,
    mime_type: mode === "prepared" ? null : mime});
  const sealedSource = () => ({bucket: ADMISSION_EVIDENCE_BUCKET, path: sealedPath, object_id: sealedId, updated_at: time,
    byte_size: bytes.length, mime_type: mime, known_sha256: hash, fingerprint: "a".repeat(64)});
  const context = () => ({...base, mode, case_revision: mode === "consumed" ? 5 : 4, source: mode === "consumed" ? sealedSource() : {...source},
    sealed: sealed(), replay_result: mode === "consumed" ? receipt(true) : null});
  const fileContext = () => ({schema_version: 1, actor_id: actor, scope, case_id: caseId, case_revision: 5, evidence_version_id: evidence,
    object: sealedSource(), byte_sha256: hash, byte_size: bytes.length, mime_type: mime});
  const getUser = vi.fn(async (_token: string) => ({data: {user: {id: actor}}, error: null}));
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>): Promise<AdmissionDbResult> => {
    if (name === "uc_finalize_admission_case_evidence") {mode = "consumed"; return {data: receipt(), error: null};}
    return {data: name === "uc_admission_evidence_file_context" ? fileContext() : context(), error: null};
  });
  const download = vi.fn(async (_path: string): Promise<{data: Blob | null; error: unknown}> => ({data: new Blob([Uint8Array.from(bytes).buffer], {type: mime}), error: null}));
  const callerFrom = vi.fn((_bucket: string) => ({download}));
  const caller = {auth: {getUser}, rpc, storage: {from: callerFrom}};
  const serviceDownload = vi.fn(async (_path: string): Promise<{data: Blob | null; error: unknown}> => ({data: new Blob([Uint8Array.from(bytes).buffer], {type: mime}), error: null}));
  const upload = vi.fn(async (_path: string, _bytes: ArrayBuffer, _options: unknown) => ({data: {id: sealedId}, error: null}));
  const info = vi.fn(async (_path: string) => ({data: {id: sealedId, bucketId: ADMISSION_EVIDENCE_BUCKET, name: sealedPath, updatedAt: time,
    size: bytes.length, contentType: mime, metadata: {size: bytes.length, mimetype: mime}}, error: null}));
  const attest = vi.fn(async (_name: string, _args: Record<string, unknown>) => {mode = "sealed"; return {data: {schema_version: 1, case_id: caseId,
    reservation_id: reservation, evidence_version_id: evidence, state: "sealed", byte_sha256: hash, byte_size: bytes.length, mime_type: mime}, error: null};});
  const serviceFrom = vi.fn((_bucket: string) => ({download: serviceDownload, upload, info}));
  const observe = vi.fn(async (_args: Record<string, unknown>): Promise<AdmissionDbResult> => ({data: {schema_version: 1, actor_id: actor, case_id: caseId,
    reservation_id: reservation, evidence_version_id: evidence, expected_revision: 4, request_id: requestId, source_fingerprint: source.fingerprint,
    object: {bucket: ADMISSION_EVIDENCE_BUCKET, path: sealedPath, object_id: sealedId, updated_at: time, byte_size: bytes.length,
      mime_type: mime, known_sha256: null, fingerprint: "9".repeat(64)}}, error: null}));
  const service = {rpc: vi.fn((name: string, args: Record<string, unknown>) => name === "uc_observe_admission_sealed_object" ? observe(args) : attest(name, args)), storage: {from: serviceFrom}};
  const createCaller = vi.fn((_authorization: string, _signal: AbortSignal) => caller), createService = vi.fn((_signal: AbortSignal) => service);
  const deps = {configured: true, createCaller, createService};
  return {hash, bytes, mime, source, base, context, fileContext, receipt, caller, service, getUser, rpc, download, callerFrom, serviceDownload, upload, info,
    attest, observe, serviceFrom, createCaller, createService, deps, sealedPath, setMode: (value: typeof mode) => {mode = value;},
    run: (body: unknown = commitInput) => admissionEvidenceCommitRequest(post(body), deps),
    file: (body: unknown = fileInput) => admissionEvidenceFileRequest(post(body), deps)};
}

export function entry(kind: "commit" | "file", createClient: (...args: any[]) => any, network: typeof fetch = globalThis.fetch,
  env: Record<string, string> = {SUPABASE_URL: "https://synthetic.invalid", SUPABASE_ANON_KEY: "SYNTHETIC_ANON", SUPABASE_SERVICE_ROLE_KEY: "SYNTHETIC_SERVICE"}) {
  let handler!: (request: Request) => Promise<Response>;
  const source = readFileSync(`supabase/functions/admission-case-evidence-${kind}/index.ts`, "utf8").replace(/^import .*;\r?\n/gm, "");
  const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None}}).outputText;
  new Function("createClient", "admissionEvidenceCommitRequest", "admissionEvidenceFileRequest", "admissionFetch", "Deno", "fetch", compiled)(
    createClient, admissionEvidenceCommitRequest, admissionEvidenceFileRequest, admissionFetch,
    {env: {get: (key: string) => env[key]}, serve: (value: typeof handler) => {handler = value;}}, network);
  return handler;
}
