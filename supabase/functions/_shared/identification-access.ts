/** UC114: original-caller authority and byte proof; no client locator is accepted. */
export const IDENTIFICATION_REVISION = "uc-identification-private-review-20261019-v1";
export const IDENTIFICATION_BUCKET = "student-identification-media";
export const IDENTIFICATION_MAX_BYTES = 5 * 1024 * 1024;
export type IdentificationCode = "IDENTIFICATION_ACCESS_DENIED" | "IDENTIFICATION_CONFLICT" | "IDENTIFICATION_INVALID_REQUEST"
  | "IDENTIFICATION_SOURCE_UNAVAILABLE" | "IDENTIFICATION_UPLOAD_EXPIRED" | "IDENTIFICATION_UNAVAILABLE";
export class IdentificationError extends Error {
  constructor(readonly code: IdentificationCode, readonly status = 503) { super(code); }
}
export const identificationHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Sintagma-Function-Revision",
  "X-Sintagma-Function-Revision": IDENTIFICATION_REVISION,
  "Cache-Control": "private, no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff",
};
export const identificationJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {...identificationHeaders, "Content-Type": "application/json"},
});
export const identificationError = (error: unknown) => identificationJson({code: error instanceof IdentificationError ? error.code : "IDENTIFICATION_UNAVAILABLE"}, error instanceof IdentificationError ? error.status : 503);
export const isIdentificationObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function invalid(): never { throw new IdentificationError("IDENTIFICATION_INVALID_REQUEST", 400); }
function sourceUnavailable(): never { throw new IdentificationError("IDENTIFICATION_SOURCE_UNAVAILABLE", 409); }
export function identificationUuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) invalid();
  return value as string;
}
export function exactIdentificationKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!isIdentificationObject(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) invalid();
}
export type IdentificationSelector = {identificationId: string; sourceId: string};
export type IdentificationSubmitInput = IdentificationSelector & {expectedRevision: number; requestId: string};
export function parseIdentificationMedia(value: unknown): IdentificationSelector {
  exactIdentificationKeys(value, ["identificationId", "sourceId"]);
  return {identificationId: identificationUuid(value.identificationId), sourceId: identificationUuid(value.sourceId)};
}
export function parseIdentificationSubmit(value: unknown): IdentificationSubmitInput {
  exactIdentificationKeys(value, ["identificationId", "sourceId", "expectedRevision", "requestId"]);
  if (!Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 1 || (value.expectedRevision as number) >= Number.MAX_SAFE_INTEGER) invalid();
  return {identificationId: identificationUuid(value.identificationId), sourceId: identificationUuid(value.sourceId),
    expectedRevision: value.expectedRevision as number, requestId: identificationUuid(value.requestId)};
}
/** Bounded stream, including requests without or with a dishonest Content-Length. */
export async function readIdentificationBody(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) invalid();
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096)) invalid();
  const reader = request.body?.getReader();
  if (!reader) invalid();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) { await reader.cancel(); invalid(); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) {bytes.set(chunk, at); at += chunk.byteLength;}
    return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
  } catch { invalid(); }
  finally { reader.releaseLock(); }
}
export function identificationRequestBoundary(request: Request): Response | string {
  if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: identificationHeaders});
  if (request.method !== "POST") return identificationJson({code: "IDENTIFICATION_INVALID_REQUEST"}, 405);
  const authorization = request.headers.get("Authorization") || "";
  if (authorization.length > 8192 || !/^Bearer [^\s]+$/i.test(authorization)) throw new IdentificationError("IDENTIFICATION_ACCESS_DENIED", 401);
  return authorization;
}
export type IdentificationDbResult = {data: unknown; error: unknown};
export interface IdentificationCaller {
  auth: {getUser(token: string): PromiseLike<{data: {user: {id: string} | null}; error: unknown}>};
  rpc(name: string, args: Record<string, unknown>): PromiseLike<IdentificationDbResult>;
  storage: {from(bucket: string): {download(path: string): PromiseLike<{data: Blob | null; error: unknown}>}};
}
export interface IdentificationDependencies {
  configured: boolean;
  createCaller(authorization: string): IdentificationCaller;
  commit?(args: Record<string, unknown>): PromiseLike<IdentificationDbResult>;
}
export function identificationDbData(result: IdentificationDbResult): unknown {
  if (!result.error) return result.data;
  const error = result.error as {code?: string; message?: string};
  if (error.code === "42501") throw new IdentificationError("IDENTIFICATION_ACCESS_DENIED", 403);
  if (error.code === "40001") throw new IdentificationError("IDENTIFICATION_CONFLICT", 409);
  if (error.code === "22023") invalid();
  if (error.code === "P0001" && error.message === "IDENTIFICATION_UPLOAD_EXPIRED") throw new IdentificationError("IDENTIFICATION_UPLOAD_EXPIRED", 410);
  if (error.code === "P0001" && error.message === "IDENTIFICATION_SOURCE_UNAVAILABLE") sourceUnavailable();
  throw new IdentificationError("IDENTIFICATION_UNAVAILABLE", 503);
}
export async function requireIdentificationActor(caller: IdentificationCaller, authorization: string, expected?: string): Promise<string> {
  const result = await caller.auth.getUser(authorization.slice(7));
  if (result.error || !result.data?.user) throw new IdentificationError("IDENTIFICATION_ACCESS_DENIED", 401);
  let actor: string;
  try {actor = identificationUuid(result.data.user.id);} catch {throw new IdentificationError("IDENTIFICATION_ACCESS_DENIED", 401);}
  if (expected && actor !== expected) throw new IdentificationError("IDENTIFICATION_ACCESS_DENIED", 403);
  return actor;
}
const sourceFields = ["contractVersion", "actorId", "organizationId", "studentUserId", "enrollmentId", "identificationId", "sourceId", "revision", "bucket", "path", "storageObjectId", "objectCreatedAt", "objectUpdatedAt", "ownerId", "byteSize", "byteSha256", "mimeType", "maxBytes"];
export type IdentificationContext = {
  contractVersion: 1; actorId: string; organizationId: string; studentUserId: string; enrollmentId: string | null;
  identificationId: string; sourceId: string; revision: number; bucket: typeof IDENTIFICATION_BUCKET; path: string;
  storageObjectId: string; objectCreatedAt: string; objectUpdatedAt: string; ownerId: string; byteSize: number;
  byteSha256: string | null; mimeType: "image/jpeg"; maxBytes: number;
};
export type IdentificationSubmitContext = IdentificationContext & {mode: "prepared" | "committed"; expiresAt: string; replayResult: unknown};
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString().slice(0,19) !== value.slice(0,19)) sourceUnavailable();
  // PostgreSQL may emit microseconds; normalize spellings without dropping precision.
  return (value as string).replace(/\+00:00$/, "Z").replace(/(?:\.(\d+))?Z$/, (_all, fraction) => `.${String(fraction || "").padEnd(6, "0")}Z`);
}
export function parseIdentificationContext(raw: unknown, selector: IdentificationSelector, actor: string, submit?: IdentificationSubmitInput): IdentificationContext | IdentificationSubmitContext {
  try {
    exactIdentificationKeys(raw, submit ? [...sourceFields, "mode", "expiresAt", "replayResult"] : sourceFields);
    if (raw.contractVersion !== 1 || raw.actorId !== actor || raw.identificationId !== selector.identificationId || raw.sourceId !== selector.sourceId
      || raw.bucket !== IDENTIFICATION_BUCKET || raw.mimeType !== "image/jpeg" || raw.maxBytes !== IDENTIFICATION_MAX_BYTES) sourceUnavailable();
    const user = identificationUuid(raw.studentUserId), org = identificationUuid(raw.organizationId);
    identificationUuid(raw.actorId); identificationUuid(raw.storageObjectId);
    if (raw.enrollmentId !== null) identificationUuid(raw.enrollmentId);
    if (raw.ownerId !== user || submit && user !== actor || raw.path !== `${user}/${org}/${selector.identificationId}/${selector.sourceId}/capture.jpg`) sourceUnavailable();
    if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 || !Number.isSafeInteger(raw.byteSize) || (raw.byteSize as number) < 5 || (raw.byteSize as number) > IDENTIFICATION_MAX_BYTES) sourceUnavailable();
    const normalized = {...raw, objectCreatedAt: timestamp(raw.objectCreatedAt), objectUpdatedAt: timestamp(raw.objectUpdatedAt)};
    if (submit) {
      if (raw.mode !== "prepared" && raw.mode !== "committed") sourceUnavailable();
      if (raw.mode === "prepared" && (raw.revision !== submit.expectedRevision || raw.byteSha256 !== null || raw.replayResult !== null)
        || raw.mode === "committed" && ((raw.revision as number) < submit.expectedRevision + 1 || !isIdentificationObject(raw.replayResult))) sourceUnavailable();
      Object.assign(normalized, {expiresAt: timestamp(raw.expiresAt)});
    }
    if ((!submit || raw.mode === "committed") && (typeof raw.byteSha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.byteSha256))) sourceUnavailable();
    return normalized as unknown as IdentificationContext | IdentificationSubmitContext;
  } catch (error) {
    if (error instanceof IdentificationError && error.code === "IDENTIFICATION_SOURCE_UNAVAILABLE") throw error;
    sourceUnavailable();
  }
}
export function sameIdentificationContext(before: IdentificationContext, after: IdentificationContext): void {
  const sameValue = (left: unknown, right: unknown): boolean => {
    if (left === right) return true;
    if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
    if (!isIdentificationObject(left) || !isIdentificationObject(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && sameValue(left[key], right[key]));
  };
  if (!sameValue(before, after)) throw new IdentificationError("IDENTIFICATION_CONFLICT", 409);
}
export async function identificationJpeg(caller: IdentificationCaller, context: IdentificationContext): Promise<{bytes: Uint8Array; sha256: string}> {
  const result = await caller.storage.from(IDENTIFICATION_BUCKET).download(context.path);
  const blob = result.data;
  if (result.error || !blob || blob.type !== "image/jpeg" || blob.size !== context.byteSize || blob.size < 5 || blob.size > IDENTIFICATION_MAX_BYTES) sourceUnavailable();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length !== context.byteSize || bytes.length < 5 || bytes.length > IDENTIFICATION_MAX_BYTES
    || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) sourceUnavailable();
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (context.byteSha256 !== null && context.byteSha256 !== sha256) sourceUnavailable();
  return {bytes, sha256};
}
const capabilities = ["canSubmit", "canReview", "canReject", "canReset", "canReadMedia"];
/** Rebuild only the public frozen receipt; unexpected locators/SQL fields never leave Edge. */
export function identificationSubmitResult(raw: unknown, input: IdentificationSubmitInput, source: IdentificationContext, replayed?: boolean): Record<string, unknown> {
  try {
    exactIdentificationKeys(raw, ["contractVersion", "replayed", "record", "event"]);
    if (raw.contractVersion !== 1 || typeof raw.replayed !== "boolean" || replayed !== undefined && raw.replayed !== replayed) sourceUnavailable();
    const record = raw.record;
    exactIdentificationKeys(record, ["identificationId", "organizationId", "studentUserId", "enrollmentId", "revision", "status", "sourceKind", "assurance", "createdAt", "submittedAt", "decidedAt", "rejectionReason", "media", "projectionPresent", "capabilities"]);
    if (record.identificationId !== input.identificationId || record.organizationId !== source.organizationId || record.studentUserId !== source.studentUserId
      || record.enrollmentId !== source.enrollmentId || record.revision !== input.expectedRevision + 1 || record.status !== "pending" || record.sourceKind !== "self_photo" || record.assurance !== "submitted"
      || record.decidedAt !== null || record.rejectionReason !== null || typeof record.projectionPresent !== "boolean") sourceUnavailable();
    timestamp(record.createdAt); timestamp(record.submittedAt);
    exactIdentificationKeys(record.media, ["identificationId", "sourceId"]);
    if (record.media.identificationId !== input.identificationId || record.media.sourceId !== input.sourceId) sourceUnavailable();
    const currentCapabilities = record.capabilities;
    exactIdentificationKeys(currentCapabilities, capabilities);
    if (capabilities.some(key => typeof currentCapabilities[key] !== "boolean")) sourceUnavailable();
    // Public submit always records a submitted event, including exact replay.
    // The general mutation DTO's nullable event belongs to other operations.
    exactIdentificationKeys(raw.event, ["eventId", "identificationId", "revision", "action", "at", "reason", "reviewerUserId"]);
    identificationUuid(raw.event.eventId); timestamp(raw.event.at);
    if (raw.event.identificationId !== input.identificationId || raw.event.revision !== input.expectedRevision + 1 || raw.event.action !== "submitted" || raw.event.reason !== null || raw.event.reviewerUserId !== null) sourceUnavailable();
    return raw;
  } catch { sourceUnavailable(); }
}
