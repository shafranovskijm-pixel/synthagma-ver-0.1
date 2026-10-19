/** UC012 original-caller evidence boundary. No public locator, legal or admission inference. */
export const ADMISSION_EVIDENCE_REVISION = "uc-admission-case-evidence-20261019-v1";
export const ADMISSION_EVIDENCE_BUCKET = "admission-case-evidence";
export const ADMISSION_MAX_BYTES = 20 * 1024 * 1024;
export const ADMISSION_OPERATION_MS = 60_000;
export const admissionCodes = ["ACCESS_DENIED", "INVALID_INPUT", "REVISION_CONFLICT", "SOURCE_CHANGED", "SOURCE_UNAVAILABLE",
  "PREREQUISITE_MISSING", "REVIEW_REQUIRED", "LIMIT_REACHED", "DEPENDENCY_UNAVAILABLE"] as const;
export type AdmissionCode = typeof admissionCodes[number];
const messages: Record<AdmissionCode, string> = {
  ACCESS_DENIED: "Нет доступа к личному делу", INVALID_INPUT: "Некорректный запрос",
  REVISION_CONFLICT: "Данные изменились. Обновите личное дело", SOURCE_CHANGED: "Источник изменился. Проверьте документ заново",
  SOURCE_UNAVAILABLE: "Документ недоступен", PREREQUISITE_MISSING: "Сначала выполните необходимые действия",
  REVIEW_REQUIRED: "Требуется проверка ответственным", LIMIT_REACHED: "Достигнут допустимый предел",
  DEPENDENCY_UNAVAILABLE: "Сервис временно недоступен",
};
export class AdmissionError extends Error {
  constructor(readonly code: AdmissionCode, readonly status = code === "ACCESS_DENIED" ? 403 : code === "INVALID_INPUT" ? 400
    : code === "LIMIT_REACHED" ? 413 : code === "DEPENDENCY_UNAVAILABLE" ? 503 : 409) { super(code); }
}
export const admissionHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Sintagma-Function-Revision, Content-Disposition",
  "X-Sintagma-Function-Revision": ADMISSION_EVIDENCE_REVISION,
  "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff",
};
export const admissionJson = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status, headers: {...admissionHeaders, "Content-Type": "application/json"},
});
export function admissionError(error: unknown): Response {
  const safe = error instanceof AdmissionError ? error : new AdmissionError("DEPENDENCY_UNAVAILABLE");
  return admissionJson({schema_version: 1, code: safe.code, retryable: safe.code === "DEPENDENCY_UNAVAILABLE", message: messages[safe.code]}, safe.status);
}
export const admissionObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function admissionExact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!admissionObject(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new AdmissionError("INVALID_INPUT");
}
export function admissionUuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new AdmissionError("INVALID_INPUT");
  return value;
}
export function admissionRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > Number.MAX_SAFE_INTEGER) throw new AdmissionError("INVALID_INPUT");
  return value as number;
}
export type AdmissionCommitInput = {case_id: string; reservation_id: string; expected_revision: number; request_id: string};
export type AdmissionFileInput = {case_id: string; evidence_version_id: string};
export function parseAdmissionCommit(value: unknown): AdmissionCommitInput {
  admissionExact(value, ["case_id", "reservation_id", "expected_revision", "request_id"]);
  if (value.expected_revision === Number.MAX_SAFE_INTEGER) throw new AdmissionError("LIMIT_REACHED");
  return {case_id: admissionUuid(value.case_id), reservation_id: admissionUuid(value.reservation_id),
    expected_revision: admissionRevision(value.expected_revision), request_id: admissionUuid(value.request_id)};
}
export function parseAdmissionFile(value: unknown): AdmissionFileInput {
  admissionExact(value, ["case_id", "evidence_version_id"]);
  return {case_id: admissionUuid(value.case_id), evidence_version_id: admissionUuid(value.evidence_version_id)};
}
export async function readAdmissionBody(request: Request, signal: AbortSignal): Promise<unknown> {
  admissionCheckSignal(signal);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) throw new AdmissionError("INVALID_INPUT");
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096)) throw new AdmissionError("INVALID_INPUT");
  const reader = request.body?.getReader();
  if (!reader) throw new AdmissionError("INVALID_INPUT");
  let released = false;
  const release = () => {if (!released) {try {reader.releaseLock(); released = true;} catch { /* A pending native read releases in finally. */ }}};
  const abort = () => {
    // cancel closes a pending read immediately, even when the underlying
    // cancellation hook returns a promise. Do not wait on that untrusted hook.
    void reader.cancel().catch(() => {});
    release();
  };
  signal.addEventListener("abort", abort, {once: true});
  if (signal.aborted) abort();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      admissionCheckSignal(signal);
      const chunk = await reader.read();
      admissionCheckSignal(signal);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) {await reader.cancel(); throw new AdmissionError("INVALID_INPUT");}
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) {bytes.set(chunk, at); at += chunk.byteLength;}
    return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
  } catch {if (signal.aborted) throw new AdmissionError("DEPENDENCY_UNAVAILABLE"); throw new AdmissionError("INVALID_INPUT");}
  finally {signal.removeEventListener("abort", abort); release();}
}
export function admissionRequestBoundary(request: Request): Response | string {
  if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: admissionHeaders});
  if (request.method !== "POST") return admissionError(new AdmissionError("INVALID_INPUT", 405));
  const authorization = request.headers.get("Authorization") || "";
  if (authorization.length > 8192 || !/^Bearer [^\s]+$/i.test(authorization)) throw new AdmissionError("ACCESS_DENIED", 401);
  return authorization;
}
export type AdmissionDbResult = {data: unknown; error: unknown};
export interface AdmissionCaller {
  auth: {getUser(token: string): PromiseLike<{data: {user: {id: string} | null}; error: unknown}>};
  rpc(name: string, args: Record<string, unknown>): PromiseLike<AdmissionDbResult>;
  storage: {from(bucket: string): {download(path: string): PromiseLike<{data: Blob | null; error: unknown}>}};
}
export function admissionDbData(result: AdmissionDbResult): unknown {
  if (!result.error) return result.data;
  const error = result.error as {code?: string; message?: string};
  if (error.code === "42501") throw new AdmissionError("ACCESS_DENIED");
  if (error.code === "40001") throw new AdmissionError("REVISION_CONFLICT");
  const code = typeof error.message === "string" && error.message.startsWith("ADMISSION_") ? error.message.slice(10) : "";
  if (admissionCodes.includes(code as AdmissionCode)) throw new AdmissionError(code as AdmissionCode);
  if (error.code === "22023") throw new AdmissionError("INVALID_INPUT");
  throw new AdmissionError("DEPENDENCY_UNAVAILABLE");
}
export async function requireAdmissionActor(caller: AdmissionCaller, authorization: string, expected?: string): Promise<string> {
  const result = await caller.auth.getUser(authorization.slice(7));
  if (result.error || !result.data?.user) throw new AdmissionError("ACCESS_DENIED", 401);
  let actor: string;
  try {actor = admissionUuid(result.data.user.id);} catch {throw new AdmissionError("ACCESS_DENIED", 401);}
  if (expected && actor !== expected) throw new AdmissionError("ACCESS_DENIED");
  return actor;
}
export function admissionTime(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString().slice(0, 19) !== value.slice(0, 19)) throw new AdmissionError("SOURCE_UNAVAILABLE");
  return value.replace(/\+00:00$/, "Z").replace(/(?:\.(\d+))?Z$/, (_all, fraction) => `.${String(fraction || "").padEnd(6, "0")}Z`);
}
export function admissionSame(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => admissionSame(value, right[index]));
  if (!admissionObject(left) || !admissionObject(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && admissionSame(left[key], right[key]));
}
export type AdmissionMime = "application/pdf" | "image/jpeg" | "image/png";
export function admissionMime(value: unknown): AdmissionMime {
  if (value !== "application/pdf" && value !== "image/jpeg" && value !== "image/png") throw new AdmissionError("SOURCE_UNAVAILABLE");
  return value;
}
function validPng(bytes: Uint8Array): boolean {
  if (bytes.length < 57 || [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => bytes[i] !== v)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let offset = 8, header = false, data = false;
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset), end = offset + size + 12;
    if (end > bytes.length) return false;
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(kind) || !header && kind !== "IHDR") return false;
    let crc = 0xffffffff;
    for (let i = offset + 4; i < end - 4; i++) {crc ^= bytes[i]; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;}
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end - 4)) return false;
    if (kind === "IHDR") {
      if (header || size !== 13 || !view.getUint32(offset + 8) || !view.getUint32(offset + 12)
        || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) return false;
      const depth = bytes[offset + 16], color = bytes[offset + 17];
      if (!(color === 0 ? [1, 2, 4, 8, 16] : color === 2 || color === 4 || color === 6 ? [8, 16] : color === 3 ? [1, 2, 4, 8] : []).includes(depth)) return false;
      header = true;
    } else if (kind === "IDAT") data = true;
    else if (kind === "IEND") return data && size === 0 && end === bytes.length;
    else if (kind[0] === kind[0].toUpperCase() && kind !== "PLTE") return false;
    offset = end;
  }
  return false;
}
/** Envelope/byte integrity only: this does not authenticate a document or decode its contents. */
export function validateAdmissionBytes(bytes: Uint8Array, mime: AdmissionMime): void {
  if (!bytes.length || bytes.length > ADMISSION_MAX_BYTES) throw new AdmissionError("SOURCE_UNAVAILABLE");
  const valid = mime === "image/jpeg" ? bytes.length >= 5 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217
    : mime === "image/png" ? validPng(bytes)
    : /^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(new TextDecoder().decode(bytes.subarray(0, 12)))
      && /%%EOF[\x00\t\n\f\r ]*$/.test(new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024))));
  if (!valid) throw new AdmissionError("SOURCE_UNAVAILABLE");
}
export async function admissionHash(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer)), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function admissionCheckSignal(signal: AbortSignal): void {
  if (signal.aborted) throw new AdmissionError("DEPENDENCY_UNAVAILABLE");
}
export async function admissionDeadline<T>(request: Request, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, {once: true});
  if (request.signal.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {controller.abort(); reject(new AdmissionError("DEPENDENCY_UNAVAILABLE"));}, ADMISSION_OPERATION_MS);
  });
  try {admissionCheckSignal(controller.signal); return await Promise.race([run(controller.signal), expired]);}
  finally {if (timer !== undefined) clearTimeout(timer); request.signal.removeEventListener("abort", abort); controller.abort();}
}
/** Used only by this request's SDKs: pin cancellation, forbid redirects and cap actual streamed response bytes. */
export function admissionFetch(network: typeof fetch, signal: AbortSignal): typeof fetch {
  return async (input, init) => {
    admissionCheckSignal(signal);
    const response = await network(input, {...init, signal, redirect: "error", cache: "no-store"});
    const length = response.headers.get("Content-Length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > ADMISSION_MAX_BYTES)) {
      await response.body?.cancel(); throw new AdmissionError("SOURCE_UNAVAILABLE");
    }
    if (!response.body) return response;
    const reader = response.body.getReader(); let size = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          admissionCheckSignal(signal); const next = await reader.read(); admissionCheckSignal(signal);
          if (next.done) {reader.releaseLock(); controller.close(); return;}
          size += next.value.byteLength;
          if (size > ADMISSION_MAX_BYTES) {await reader.cancel(); reader.releaseLock(); throw new AdmissionError("SOURCE_UNAVAILABLE");}
          controller.enqueue(next.value);
        } catch (error) {try {await reader.cancel(); reader.releaseLock();} catch {} controller.error(error);}
      },
      async cancel() {await reader.cancel(); reader.releaseLock();},
    });
    return new Response(body, {status: response.status, statusText: response.statusText, headers: response.headers});
  };
}

type Check = (value: unknown) => void;
const failSource = (): never => {throw new AdmissionError("SOURCE_UNAVAILABLE");};
const literal = (...values: unknown[]): Check => value => {if (!values.includes(value)) failSource();};
const bool: Check = value => {if (typeof value !== "boolean") failSource();};
const sha: Check = value => {if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) failSource();};
const text = (max = 4000): Check => value => {if (typeof value !== "string" || !value || value.trim() !== value || value.length > max) failSource();};
const nullable = (check: Check): Check => value => {if (value !== null) check(value);};
const list = (check: Check, max = 100, min = 0): Check => value => {
  if (!Array.isArray(value) || value.length < min || value.length > max) failSource();
  for (const item of value as unknown[]) check(item);
};
const ids: Check = value => {list(admissionUuid)(value); if (new Set(value as unknown[]).size !== (value as unknown[]).length) failSource();};
const size: Check = value => {if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > ADMISSION_MAX_BYTES) failSource();};
const shape = (value: unknown, checks: Record<string, Check>): Record<string, unknown> => {
  admissionExact(value, Object.keys(checks));
  for (const key of Object.keys(checks)) checks[key](value[key]);
  return value;
};
const date: Check = value => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) failSource();
};
export type AdmissionScope = {organization_id: string; group_id: string; enrollment_id: string; user_id: string; course_id: string};
const scopeCheck: Check = value => {shape(value, {organization_id: admissionUuid, group_id: admissionUuid, enrollment_id: admissionUuid, user_id: admissionUuid, course_id: admissionUuid});};
const programCheck: Check = value => {shape(value, {enrollment_snapshot_id: admissionUuid, binding_id: admissionUuid, binding_revision: admissionRevision,
  version_id: admissionUuid, snapshot_hash: sha, facts_hash: sha, file_document_id: admissionUuid, file_version_id: admissionUuid, file_review_id: admissionUuid});};
const requirementCheck: Check = value => {shape(value, {id: admissionUuid, revision: admissionRevision, rule_id: admissionUuid, rule_set_id: admissionUuid,
  rule_set_digest: sha, label: text(160), applicability: literal("unknown", "applicable", "not_applicable"), review_event_id: nullable(admissionUuid), evidence_version_ids: ids,
  current_state: literal("unknown", "missing", "unreviewed", "satisfied", "unreadable", "exception_pending", "exception_recorded"), public_next_action: nullable(text(160))});};
const evidenceCheck: Check = value => {shape(value, {id: admissionUuid, case_id: admissionUuid, case_revision_created: admissionRevision, requirement_id: admissionUuid,
  supersedes_id: nullable(admissionUuid), source_kind: literal("upload", "identity_document", "enrollment_document", "contract_artifact", "organization_document_version"),
  captured_at: admissionTime, byte_sha256: sha, byte_size: size, mime_type: admissionMime, availability: literal("available", "unavailable", "integrity_conflict"),
  review: literal("unreviewed", "accepted", "rejected"), review_event_id: nullable(admissionUuid), can_read_bytes: bool});};
const taskCheck: Check = value => {shape(value, {id: admissionUuid, key: sha, requirement_id: nullable(admissionUuid),
  kind: literal("supply_evidence", "review_applicability", "review_evidence", "review_exception", "recheck_source", "recheck_programme"),
  status: literal("open", "resolved", "superseded"), assignee_id: nullable(admissionUuid), public_label: text(160), reason: nullable(text()),
  deadline: deadline => {shape(deadline, {kind: literal("not_set", "internal_target", "reviewed_rule"), date: nullable(date), rule_id: nullable(admissionUuid)});}});};
const decisionCheck: Check = value => {shape(value, {event_id: admissionUuid, case_revision: admissionRevision, outcome: literal("needs_information", "admitted", "not_admitted"),
  recorded_at: admissionTime, responsible_id: nullable(admissionUuid), reason: text(), program_ref: programCheck, rule_set_id: admissionUuid, requirements_digest: sha,
  evidence_version_ids: ids, authority_snapshot_hash: sha, later_review_required: bool});};
const prerequisitesCheck: Check = value => {shape(value, {
  code: literal("missing_group", "missing_enrollment", "missing_program_binding", "missing_enrollment_snapshot", "program_file_unavailable", "association_inactive", "rule_set_unreviewed"),
  public_label: text(160), next_action: literal("select_exact_association", "contact_staff", "open_programme_confirmation", "review_rule_set"), persisted: literal(false),
});};
const capabilityCheck: Check = value => {shape(value, {can_initialize: bool, can_assign: bool, can_review: bool, can_decide: bool, can_prepare_evidence: bool, can_configure_rules: bool});};
const staffCheck = (value: unknown): Record<string, unknown> => shape(value, {id: admissionUuid, scope: scopeCheck, revision: admissionRevision, program_ref: programCheck,
  program_title: text(), program_type: literal("dpo_upskilling", "dpo_retraining", "professional_training", "internal_nonformal"), responsible_id: nullable(admissionUuid),
  rule_set_id: nullable(admissionUuid), requirements: list(requirementCheck, 50), evidence: list(evidenceCheck), tasks: list(taskCheck, 50), decision: nullable(decisionCheck),
  prerequisites: list(prerequisitesCheck, 20), capabilities: capabilityCheck, rule_set_digest: nullable(sha), requirements_digest: sha});
export type AdmissionMutation = {schema_version: 1; scope: AdmissionScope; receipt: Record<string, unknown>; replayed: boolean; state: Record<string, unknown>};
/** Pure Deno mirror of the frozen strict frontend wire schema; nothing is stripped silently. */
export function admissionMutation(raw: unknown, input: AdmissionCommitInput, scope: AdmissionScope, replayed?: boolean): AdmissionMutation {
  try {
    const result = shape(raw, {schema_version: literal(1), scope: scopeCheck, receipt: receipt => {shape(receipt, {schema_version: literal(1), request_id: admissionUuid,
      case_id: admissionUuid, revision: admissionRevision, event_id: admissionUuid, kind: literal("evidence_committed"), payload_digest: sha});}, replayed: bool, state: staffCheck});
    const receipt = result.receipt as Record<string, unknown>, state = result.state as Record<string, unknown>;
    if (!admissionSame(result.scope, scope) || !admissionSame(state.scope, scope) || state.id !== input.case_id || receipt.case_id !== input.case_id
      || receipt.request_id !== input.request_id || receipt.revision !== input.expected_revision + 1 || (state.revision as number) < (receipt.revision as number)
      || replayed !== undefined && result.replayed !== replayed) failSource();
    for (const key of ["requirements", "evidence", "tasks"]) {
      const values = state[key] as Record<string, unknown>[];
      if (new Set(values.map(item => item.id)).size !== values.length) failSource();
    }
    if ((state.evidence as Record<string, unknown>[]).some(item => item.case_id !== input.case_id)
      || (state.rule_set_id === null) !== (state.rule_set_digest === null)) failSource();
    return result as unknown as AdmissionMutation;
  } catch {return failSource();}
}
export type AdmissionObjectProof = {bucket: string; path: string; object_id: string; updated_at: string; mime_type: AdmissionMime; byte_size: number; known_sha256: string | null; fingerprint: string};
export type AdmissionSealedProof = {bucket: typeof ADMISSION_EVIDENCE_BUCKET; path: string; object_id: string | null; updated_at: string | null; byte_sha256: string | null; byte_size: number | null; mime_type: AdmissionMime | null};
export type AdmissionEvidenceContext = {schema_version: 1; mode: "prepared" | "sealed" | "consumed"; actor_id: string; scope: AdmissionScope; case_id: string;
  case_revision: number; expected_revision: number; reservation_id: string; evidence_version_id: string; requirement_id: string; supersedes_id: string | null;
  request_id: string; expires_at: string; source_kind: "upload" | "existing"; source: AdmissionObjectProof; sealed: AdmissionSealedProof; replay_result: AdmissionMutation | null};
export type AdmissionFileContext = {schema_version: 1; actor_id: string; scope: AdmissionScope; case_id: string; case_revision: number;
  evidence_version_id: string; object: AdmissionObjectProof; byte_sha256: string; byte_size: number; mime_type: AdmissionMime};
function objectProof(raw: unknown): AdmissionObjectProof {
  const value = shape(raw, {bucket: text(100), path: text(2000), object_id: admissionUuid, updated_at: admissionTime, mime_type: admissionMime,
    byte_size: size, known_sha256: nullable(sha), fingerprint: sha});
  const path = value.path as string;
  if (/[\\?#%:\x00-\x1f\x7f]/.test(path) || path.split("/").some(part => !part || part === "." || part === "..")) failSource();
  return {...value, updated_at: admissionTime(value.updated_at)} as AdmissionObjectProof;
}
function sealedProof(raw: unknown, scope: AdmissionScope, caseId: string, evidenceId: string, complete: boolean): AdmissionSealedProof {
  const value = shape(raw, {bucket: literal(ADMISSION_EVIDENCE_BUCKET), path: literal(`${scope.user_id}/${scope.organization_id}/${caseId}/sealed/${evidenceId}`),
    object_id: nullable(admissionUuid), updated_at: nullable(admissionTime), byte_sha256: nullable(sha), byte_size: nullable(size), mime_type: nullable(admissionMime)});
  if (["object_id", "updated_at", "byte_sha256", "byte_size", "mime_type"].some(key => (value[key] !== null) !== complete)) failSource();
  return {...value, updated_at: value.updated_at === null ? null : admissionTime(value.updated_at)} as AdmissionSealedProof;
}
function assertSealedSource(source: AdmissionObjectProof, sealed: AdmissionSealedProof): void {
  if (source.bucket !== sealed.bucket || source.path !== sealed.path || source.object_id !== sealed.object_id || source.updated_at !== sealed.updated_at
    || source.known_sha256 !== sealed.byte_sha256 || source.byte_size !== sealed.byte_size || source.mime_type !== sealed.mime_type) failSource();
}
export function parseAdmissionContext(raw: unknown, input: AdmissionCommitInput, actor: string): AdmissionEvidenceContext {
  try {
    const value = shape(raw, {schema_version: literal(1), mode: literal("prepared", "sealed", "consumed"), actor_id: admissionUuid, scope: scopeCheck,
      case_id: admissionUuid, case_revision: admissionRevision, expected_revision: admissionRevision, reservation_id: admissionUuid, evidence_version_id: admissionUuid,
      requirement_id: admissionUuid, supersedes_id: nullable(admissionUuid), request_id: admissionUuid, expires_at: admissionTime, source_kind: literal("upload", "existing"),
      source: () => {}, sealed: () => {}, replay_result: () => {}});
    const scope = value.scope as AdmissionScope;
    if (value.actor_id !== actor || value.case_id !== input.case_id || value.reservation_id !== input.reservation_id || value.expected_revision !== input.expected_revision
      || value.request_id !== input.request_id || (value.mode === "consumed" ? (value.case_revision as number) < input.expected_revision + 1 : value.case_revision !== input.expected_revision)) failSource();
    const source = objectProof(value.source), sealed = sealedProof(value.sealed, scope, input.case_id, value.evidence_version_id as string, value.mode !== "prepared");
    let replay: AdmissionMutation | null = null;
    if (value.mode === "consumed") {
      assertSealedSource(source, sealed); replay = admissionMutation(value.replay_result, input, scope, true);
      admissionEvidenceEcho(replay, {evidence_version_id: value.evidence_version_id as string, requirement_id: value.requirement_id as string,
        supersedes_id: value.supersedes_id as string | null, sealed}, input.expected_revision);
    }
    else {
      if (value.replay_result !== null) failSource();
      if (value.source_kind === "upload") {
        if (source.bucket !== ADMISSION_EVIDENCE_BUCKET || source.path !== `${scope.user_id}/${scope.organization_id}/${input.case_id}/staging/${actor}/${input.reservation_id}` || source.known_sha256 === null) failSource();
      } else if (source.bucket === "student-documents") {
        if (!source.path.startsWith(`${scope.user_id}/`)) failSource();
      } else if (source.bucket === "org-documents") {
        if (!new RegExp(`^${scope.organization_id}/versions/[a-f0-9-]{36}/[a-f0-9-]{36}\\.[a-z0-9]{1,12}$`).test(source.path)) failSource();
      } else failSource();
    }
    return {...value, source, sealed, replay_result: replay, expires_at: admissionTime(value.expires_at)} as unknown as AdmissionEvidenceContext;
  } catch {return failSource();}
}
export function parseAdmissionFileContext(raw: unknown, input: AdmissionFileInput, actor: string): AdmissionFileContext {
  try {
    const value = shape(raw, {schema_version: literal(1), actor_id: admissionUuid, scope: scopeCheck, case_id: admissionUuid, case_revision: admissionRevision,
      evidence_version_id: admissionUuid, object: () => {}, byte_sha256: sha, byte_size: size, mime_type: admissionMime});
    if (value.actor_id !== actor || value.case_id !== input.case_id || value.evidence_version_id !== input.evidence_version_id) failSource();
    const scope = value.scope as AdmissionScope, object = objectProof(value.object);
    if (object.bucket !== ADMISSION_EVIDENCE_BUCKET || object.path !== `${scope.user_id}/${scope.organization_id}/${input.case_id}/sealed/${input.evidence_version_id}`
      || object.known_sha256 !== value.byte_sha256 || object.byte_size !== value.byte_size || object.mime_type !== value.mime_type) failSource();
    return {...value, object} as unknown as AdmissionFileContext;
  } catch {return failSource();}
}
export interface AdmissionService {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<AdmissionDbResult>;
  storage: {from(bucket: string): {
    download(path: string): PromiseLike<{data: Blob | null; error: unknown}>;
    upload(path: string, bytes: ArrayBuffer, options: {contentType: string; upsert: false; cacheControl: string}): PromiseLike<{data: {id?: string} | null; error: unknown}>;
    info(path: string): PromiseLike<{data: unknown; error: unknown}>;
  }};
}
export interface AdmissionDependencies {configured: boolean; createCaller(authorization: string, signal: AbortSignal): AdmissionCaller; createService(signal: AbortSignal): AdmissionService;}
export async function admissionDownload(reader: Pick<AdmissionCaller, "storage">, source: Pick<AdmissionObjectProof, "bucket" | "path" | "byte_size" | "mime_type" | "known_sha256">, signal: AbortSignal): Promise<{bytes: Uint8Array; sha256: string}> {
  admissionCheckSignal(signal);
  const result = await reader.storage.from(source.bucket).download(source.path), blob = result.data;
  admissionCheckSignal(signal);
  if (result.error || !blob) throw new AdmissionError("SOURCE_UNAVAILABLE");
  if (blob.size !== source.byte_size || blob.size < 1 || blob.size > ADMISSION_MAX_BYTES || blob.type !== source.mime_type) failSource();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  admissionCheckSignal(signal);
  if (bytes.length !== source.byte_size) failSource();
  validateAdmissionBytes(bytes, source.mime_type);
  const sha256 = await admissionHash(bytes);
  admissionCheckSignal(signal);
  if (source.known_sha256 !== null && source.known_sha256 !== sha256) failSource();
  return {bytes, sha256};
}
export function admissionSealedObject(context: AdmissionEvidenceContext): AdmissionObjectProof {
  const sealed = context.sealed;
  if (sealed.object_id === null || sealed.updated_at === null || sealed.byte_sha256 === null || sealed.byte_size === null || sealed.mime_type === null) failSource();
  return {bucket: sealed.bucket, path: sealed.path, object_id: sealed.object_id!, updated_at: sealed.updated_at!, known_sha256: sealed.byte_sha256!,
    byte_size: sealed.byte_size!, mime_type: sealed.mime_type!, fingerprint: context.source.fingerprint};
}
export function admissionEvidenceEcho(result: AdmissionMutation, context: Pick<AdmissionEvidenceContext, "evidence_version_id" | "requirement_id" | "supersedes_id" | "sealed">, expectedRevision: number): void {
  const evidence = (result.state.evidence as Record<string, unknown>[]).find(item => item.id === context.evidence_version_id);
  // Later replacements may move this immutable proof outside the current set;
  // the dedicated file/context APIs still address its exact historical identity.
  if (!evidence) {if (result.state.revision === expectedRevision + 1) failSource(); return;}
  if (evidence.requirement_id !== context.requirement_id || evidence.supersedes_id !== context.supersedes_id || evidence.case_revision_created !== expectedRevision + 1
    || evidence.byte_sha256 !== context.sealed.byte_sha256 || evidence.byte_size !== context.sealed.byte_size || evidence.mime_type !== context.sealed.mime_type) failSource();
}
export async function admissionSealedInfo(service: AdmissionService, path: string, bytes: number, mime: AdmissionMime, signal: AbortSignal): Promise<{object_id: string; updated_at: string}> {
  admissionCheckSignal(signal);
  const result = await service.storage.from(ADMISSION_EVIDENCE_BUCKET).info(path);
  admissionCheckSignal(signal);
  if (result.error || !admissionObject(result.data)) failSource();
  const data = result.data as Record<string, unknown>, metadata = admissionObject(data.metadata) ? data.metadata : {};
  if (data.bucketId !== ADMISSION_EVIDENCE_BUCKET || data.name !== path || (data.size ?? metadata.size) !== bytes || (data.contentType ?? metadata.mimetype) !== mime
    || data.size !== undefined && metadata.size !== undefined && data.size !== metadata.size
    || data.contentType !== undefined && metadata.mimetype !== undefined && data.contentType !== metadata.mimetype) failSource();
  try {return {object_id: admissionUuid(data.id), updated_at: admissionTime(data.updatedAt)};} catch {return failSource();}
}
export function admissionAttestation(raw: unknown, context: AdmissionEvidenceContext, proof: {sha256: string; bytes: Uint8Array}): void {
  try {
    const value = shape(raw, {schema_version: literal(1), case_id: admissionUuid, reservation_id: admissionUuid, evidence_version_id: admissionUuid,
      state: literal("sealed"), byte_sha256: sha, byte_size: size, mime_type: admissionMime});
    if (value.case_id !== context.case_id || value.reservation_id !== context.reservation_id || value.evidence_version_id !== context.evidence_version_id
      || value.byte_sha256 !== proof.sha256 || value.byte_size !== proof.bytes.length || value.mime_type !== context.source.mime_type) failSource();
  } catch {failSource();}
}
