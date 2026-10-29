/** SOURCE CANDIDATE ONLY. No RPC invocation, routing integration, Blob URL or authority mint. */
import { parseCourseFileMode, type CourseFileModeSelection } from "@/lib/courseFileConsumer";
import {
  COURSE_ROUTING_V2, OWN_SOURCE_ORG, OWN_VALIDATION_SCOPE, PRIVATE_DELIVERY_V2, PRIVATE_ROLLOUT_V2,
  type AccessMode, type AdminControlContext, type AdminControlReadRequest, type AuthorityMarker,
  type AuthorizeRolloutRequest, type CapturedReference, type CourseFileRoutingV2,
  type DisableRolloutRequest, type MaterialProof, type OwnReferenceBinding,
  type PrivateBytesResponse, type PrivateReferenceContext, type PrivateReferenceRequest, type Purpose,
  type ReceiptIdentity, type ReferenceKind, type RolloutCommandReceipt, type RolloutSnapshot,
  type SealedPrivateReferenceContext,
} from "../contracts/privateFileDeliveryV2";
export type { PrivateDeliveryV2Port } from "../contracts/privateFileDeliveryV2";

export const MAX_PRIVATE_BYTES = 8_388_608;
export const CAPTURE_ENFORCEMENT_SHA256 = "5d8e867d99288c8e1372c1f7e49c4ca07341ce2fb197b5aa2ff593529095aee6";
const BIGINT_MAX = 9_223_372_036_854_775_807n;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA_PATTERN = /^[0-9a-f]{64}$/;
export class PrivateDeliveryV2ParseError extends Error {
  readonly code = "PRIVATE_DELIVERY_V2_UNAVAILABLE";
  constructor() { super("Private file delivery is unavailable"); this.name = "PrivateDeliveryV2ParseError"; }
}
function deny(): never { throw new PrivateDeliveryV2ParseError(); }
function object(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!object(value) || Object.keys(value).length !== keys.length
    || !keys.every(key => Object.prototype.hasOwnProperty.call(value, key))) deny();
  return value;
}
function optionalRecord(value: unknown, required: readonly string[], optional: readonly string[]): Record<string, unknown> {
  if (!object(value) || !required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) deny();
  return value;
}
function uuid(value: unknown): string { if (typeof value !== "string" || !UUID_PATTERN.test(value)) deny(); return value; }
function nullableUUID(value: unknown): string | null { return value === null ? null : uuid(value); }
function hash(value: unknown): string { if (typeof value !== "string" || !SHA_PATTERN.test(value)) deny(); return value; }
function text(value: unknown): string { if (typeof value !== "string") deny(); return value; }
function bool(value: unknown): boolean { if (typeof value !== "boolean") deny(); return value; }
function own(value: unknown): typeof OWN_SOURCE_ORG { if (value !== OWN_SOURCE_ORG) deny(); return OWN_SOURCE_ORG; }
function revision(value: unknown, zero = false): string {
  if (typeof value !== "string" || value.length > 19 || !/^(0|[1-9][0-9]*)$/.test(value)) deny();
  const number = BigInt(value);
  if (number > BIGINT_MAX || (!zero && number === 0n)) deny();
  return value;
}
function length(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > MAX_PRIVATE_BYTES) deny();
  return value;
}
function access(value: unknown): AccessMode { if (value !== "learner" && value !== "staff_preview") deny(); return value; }
function purpose(value: unknown): Purpose { if (value !== "preview" && value !== "download") deny(); return value; }
function kind(value: unknown): ReferenceKind { if (value !== "course_document" && value !== "lesson_attachment") deny(); return value; }
function purposes(value: unknown): readonly Purpose[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) deny();
  const result = value.map(purpose);
  if (new Set(result).size !== result.length) deny();
  return Object.freeze(result);
}
function timestamp(value: unknown): string {
  if (typeof value !== "string") deny();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) deny();
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || second > 59) deny();
  return value;
}
function equal(value: unknown, expected: unknown): void { if (value !== expected) deny(); }
/** This comparison is between cloned typed DTOs, NOT a server JSONB digest implementation. */
function sameDTO(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

const RECEIPT_KEYS = ["receipt_id", "captured_edition_id", "source_org_version_id", "file_bytes_sha256", "byte_length"] as const;
function receipt(value: unknown): Readonly<ReceiptIdentity> {
  const raw = exact(value, RECEIPT_KEYS);
  if (raw.source_org_version_id !== null) deny(); // Phase1; NULL alone never proves library/UMK absence.
  return Object.freeze({ receipt_id: uuid(raw.receipt_id), captured_edition_id: uuid(raw.captured_edition_id),
    source_org_version_id: null, file_bytes_sha256: hash(raw.file_bytes_sha256), byte_length: length(raw.byte_length) });
}
const AUTHORITY_KEYS = ["authorization_id", "revision", "course_id", "organization_id", "proposal_id",
  "material_edition_sha256", "source_scope_generation", "reference_vector_sha256",
  "capture_enforcement_sha256", "delivery_protocol_sha256"] as const;
function authority(value: unknown, courseId: string): Readonly<AuthorityMarker> {
  const raw = exact(value, AUTHORITY_KEYS);
  equal(raw.course_id, courseId); equal(raw.capture_enforcement_sha256, CAPTURE_ENFORCEMENT_SHA256);
  return Object.freeze({ authorization_id: uuid(raw.authorization_id), revision: revision(raw.revision),
    course_id: uuid(raw.course_id), organization_id: own(raw.organization_id), proposal_id: uuid(raw.proposal_id),
    material_edition_sha256: hash(raw.material_edition_sha256), source_scope_generation: uuid(raw.source_scope_generation),
    reference_vector_sha256: hash(raw.reference_vector_sha256), capture_enforcement_sha256: CAPTURE_ENFORCEMENT_SHA256,
    delivery_protocol_sha256: hash(raw.delivery_protocol_sha256) });
}
const MATERIAL_KEYS = ["course_id", "marketplace_id", "proposal_id", "material_edition_sha256", "organization_id",
  "source_scope_generation", "reference_vector_sha256", "capture_enforcement_sha256", "references"] as const;
function material(value: unknown, courseId: string): Readonly<MaterialProof> {
  const raw = exact(value, MATERIAL_KEYS);
  equal(raw.course_id, courseId); equal(raw.capture_enforcement_sha256, CAPTURE_ENFORCEMENT_SHA256);
  if (!Array.isArray(raw.references) || raw.references.length === 0) deny();
  const references: Readonly<CapturedReference>[] = [];
  let previous = "";
  for (const item of raw.references) {
    const r = exact(item, ["reference_kind", "reference_id", "receipt"]);
    const referenceKind = kind(r.reference_kind), referenceId = uuid(r.reference_id);
    const key = referenceKind + "/" + referenceId;
    if (previous && previous >= key) deny(); // Exact declared ordering, not a client re-sort/hash.
    previous = key;
    references.push(Object.freeze({ reference_kind: referenceKind, reference_id: referenceId, receipt: receipt(r.receipt) }));
  }
  return Object.freeze({ course_id: uuid(raw.course_id), marketplace_id: uuid(raw.marketplace_id), proposal_id: uuid(raw.proposal_id),
    material_edition_sha256: hash(raw.material_edition_sha256), organization_id: own(raw.organization_id),
    source_scope_generation: uuid(raw.source_scope_generation), reference_vector_sha256: hash(raw.reference_vector_sha256),
    capture_enforcement_sha256: CAPTURE_ENFORCEMENT_SHA256, references: Object.freeze(references) });
}
function modeSelection(value: CourseFileModeSelection): Readonly<CourseFileModeSelection> {
  const raw = exact(value, ["actorId", "organizationId", "courseId", "accessMode"]);
  return Object.freeze({ actorId: uuid(raw.actorId), organizationId: nullableUUID(raw.organizationId),
    courseId: uuid(raw.courseId), accessMode: access(raw.accessMode) });
}
export function parseCourseFileRoutingV2(value: unknown, input: CourseFileModeSelection): CourseFileRoutingV2 {
  const selected = modeSelection(input);
  const raw = exact(value, ["schema_version", "protocol", "actor_id", "organization_id", "course_id", "access_mode",
    "route", "delegated_v1", "authority"]);
  equal(raw.schema_version, 2); equal(raw.protocol, COURSE_ROUTING_V2);
  equal(raw.actor_id, selected.actorId); equal(raw.course_id, selected.courseId); equal(raw.access_mode, selected.accessMode);
  const organization = uuid(raw.organization_id);
  if (selected.organizationId !== null) equal(organization, selected.organizationId);
  const base = { schema_version: 2 as const, protocol: COURSE_ROUTING_V2, actor_id: selected.actorId,
    organization_id: organization, course_id: selected.courseId, access_mode: selected.accessMode };
  if (raw.route === "v1") {
    equal(raw.authority, null);
    let delegated: ReturnType<typeof parseCourseFileMode>;
    try { delegated = parseCourseFileMode(raw.delegated_v1, { ...selected, organizationId: organization }); }
    catch { deny(); }
    return Object.freeze({ ...base, route: "v1", delegated_v1: delegated, authority: null });
  }
  equal(raw.delegated_v1, null);
  if (raw.route === "held") { equal(raw.authority, null); return Object.freeze({ ...base, route: "held", delegated_v1: null, authority: null }); }
  if (raw.route !== "private_v2") deny();
  own(organization);
  return Object.freeze({ ...base, route: "private_v2", delegated_v1: null, authority: authority(raw.authority, selected.courseId) });
}

export interface ReferenceSelection {
  readonly actorId: string; readonly request: PrivateReferenceRequest; readonly authority: AuthorityMarker;
}
function request(value: unknown): Readonly<PrivateReferenceRequest> {
  const raw = exact(value, ["p_course_id", "p_reference_kind", "p_reference_id", "p_access_mode", "p_purpose"]);
  return Object.freeze({ p_course_id: uuid(raw.p_course_id), p_reference_kind: kind(raw.p_reference_kind),
    p_reference_id: uuid(raw.p_reference_id), p_access_mode: access(raw.p_access_mode), p_purpose: purpose(raw.p_purpose) });
}
function referenceSelection(value: ReferenceSelection): Readonly<ReferenceSelection> {
  const raw = exact(value, ["actorId", "request", "authority"]), selected = request(raw.request);
  return Object.freeze({ actorId: uuid(raw.actorId), request: selected, authority: authority(raw.authority, selected.p_course_id) });
}
const CONTEXT_KEYS = ["schema_version", "protocol", "authority_scope", "actor_id", "organization_id", "course_id",
  "reference_kind", "reference_id", "access_mode", "purpose", "state", "authority", "binding", "context_sha256"] as const;
function binding(value: unknown, selected: PrivateReferenceRequest): Readonly<OwnReferenceBinding> {
  const raw = exact(value, [...RECEIPT_KEYS, "module_id", "lesson_id", "display_name", "reference_row_sha256",
    "visible_to_students", "allow_download"]);
  const file = receipt(Object.fromEntries(RECEIPT_KEYS.map(key => [key, raw[key]])));
  const moduleId = nullableUUID(raw.module_id), lessonId = nullableUUID(raw.lesson_id);
  if ((selected.p_reference_kind === "course_document" && lessonId !== null)
    || (selected.p_reference_kind === "lesson_attachment" && lessonId === null)) deny();
  const visible = bool(raw.visible_to_students), download = bool(raw.allow_download);
  if ((selected.p_access_mode === "learner" && !visible) || (selected.p_purpose === "download" && !download)) deny();
  return Object.freeze({ ...file, source_org_version_id: null, module_id: moduleId, lesson_id: lessonId,
    display_name: text(raw.display_name), reference_row_sha256: hash(raw.reference_row_sha256),
    visible_to_students: visible, allow_download: download });
}
export function parsePrivateReferenceContextV2(value: unknown, input: ReferenceSelection): PrivateReferenceContext {
  const selected = referenceSelection(input), raw = exact(value, CONTEXT_KEYS), q = selected.request;
  equal(raw.schema_version, 2); equal(raw.protocol, PRIVATE_DELIVERY_V2); equal(raw.authority_scope, OWN_VALIDATION_SCOPE);
  equal(raw.actor_id, selected.actorId); equal(raw.course_id, q.p_course_id); own(raw.organization_id);
  equal(raw.reference_kind, q.p_reference_kind); equal(raw.reference_id, q.p_reference_id);
  equal(raw.access_mode, q.p_access_mode); equal(raw.purpose, q.p_purpose);
  const base = { schema_version: 2 as const, protocol: PRIVATE_DELIVERY_V2, authority_scope: OWN_VALIDATION_SCOPE,
    actor_id: selected.actorId, organization_id: OWN_SOURCE_ORG, course_id: q.p_course_id,
    reference_kind: q.p_reference_kind, reference_id: q.p_reference_id, access_mode: q.p_access_mode, purpose: q.p_purpose };
  if (raw.state === "held") {
    equal(raw.authority, null); equal(raw.binding, null); equal(raw.context_sha256, null);
    return Object.freeze({ ...base, state: "held", authority: null, binding: null, context_sha256: null });
  }
  if (raw.state !== "bytes_sealed") deny();
  const marker = authority(raw.authority, q.p_course_id);
  if (!sameDTO(marker, selected.authority)) deny();
  return Object.freeze({ ...base, state: "bytes_sealed", authority: marker,
    binding: binding(raw.binding, q), context_sha256: hash(raw.context_sha256) });
}
/** No fetch or permission fallback. This parses a full bytes response against an already selected sealed context. */
export function parsePrivateBytesResponseV2(value: unknown, input: ReferenceSelection,
  expectedContext: SealedPrivateReferenceContext): PrivateBytesResponse {
  const raw = exact(value, [...CONTEXT_KEYS, "bytes_hex"]);
  const context = parsePrivateReferenceContextV2(Object.fromEntries(CONTEXT_KEYS.map(key => [key, raw[key]])), input);
  const expected = parsePrivateReferenceContextV2(expectedContext, input);
  if (context.state !== "bytes_sealed" || expected.state !== "bytes_sealed" || !sameDTO(context, expected)) deny();
  if (typeof raw.bytes_hex !== "string" || raw.bytes_hex.length !== 2 * context.binding.byte_length
    || raw.bytes_hex.length > 2 * MAX_PRIVATE_BYTES || !/^[0-9a-f]+$/.test(raw.bytes_hex)) deny();
  return Object.freeze({ ...context, bytes_hex: raw.bytes_hex });
}

function snapshot(value: unknown, courseId: string): Readonly<RolloutSnapshot> {
  const raw = exact(value, ["authorization_id", "revision", "state", "material", "audience", "audience_organization_id",
    "delivery_protocol_sha256", "purposes", "configured_by", "configured_at", "last_event_id"]);
  if (raw.state !== "disabled" && raw.state !== "enabled_for_validation") deny();
  equal(raw.audience, "own_source");
  return Object.freeze({ authorization_id: uuid(raw.authorization_id), revision: revision(raw.revision), state: raw.state,
    material: material(raw.material, courseId), audience: "own_source", audience_organization_id: own(raw.audience_organization_id),
    delivery_protocol_sha256: hash(raw.delivery_protocol_sha256), purposes: purposes(raw.purposes),
    configured_by: uuid(raw.configured_by), configured_at: timestamp(raw.configured_at), last_event_id: uuid(raw.last_event_id) });
}
export interface AdminSelection { readonly actorId: string; readonly request: AdminControlReadRequest }
function adminRequest(value: unknown): Readonly<AdminControlReadRequest> {
  const raw = exact(value, ["p_course_id", "p_marketplace_id", "p_proposal_id", "p_expected_material_edition_sha256"]);
  const courseId = uuid(raw.p_course_id);
  if (raw.p_marketplace_id === null && raw.p_proposal_id === null && raw.p_expected_material_edition_sha256 === null)
    return Object.freeze({ p_course_id: courseId, p_marketplace_id: null, p_proposal_id: null, p_expected_material_edition_sha256: null });
  return Object.freeze({ p_course_id: courseId, p_marketplace_id: uuid(raw.p_marketplace_id), p_proposal_id: uuid(raw.p_proposal_id),
    p_expected_material_edition_sha256: hash(raw.p_expected_material_edition_sha256) });
}
export function parsePrivateRolloutControlV2(value: unknown, input: AdminSelection): AdminControlContext {
  const selected = exact(input, ["actorId", "request"]), actor = uuid(selected.actorId), q = adminRequest(selected.request);
  const raw = exact(value, ["schema_version", "protocol", "actor_id", "organization_id", "course_id", "current",
    "current_revision", "selected_material", "installed_delivery_protocol_sha256", "effective_state", "can_authorize", "blockers"]);
  equal(raw.schema_version, 2); equal(raw.protocol, PRIVATE_ROLLOUT_V2); equal(raw.actor_id, actor); equal(raw.course_id, q.p_course_id);
  own(raw.organization_id);
  if (raw.effective_state !== "disabled" && raw.effective_state !== "held" && raw.effective_state !== "enabled_for_validation") deny();
  if (!Array.isArray(raw.blockers)) deny();
  const blockers = Object.freeze(raw.blockers.map(text)), canAuthorize = bool(raw.can_authorize);
  const current = raw.current === null ? null : snapshot(raw.current, q.p_course_id);
  const currentRevision = revision(raw.current_revision, true);
  equal(currentRevision, current?.revision ?? "0");
  const selectedMaterial = raw.selected_material === null ? null : material(raw.selected_material, q.p_course_id);
  if (q.p_marketplace_id === null) { equal(selectedMaterial, null); equal(canAuthorize, false); }
  else if (selectedMaterial) {
    equal(selectedMaterial.marketplace_id, q.p_marketplace_id); equal(selectedMaterial.proposal_id, q.p_proposal_id);
    equal(selectedMaterial.material_edition_sha256, q.p_expected_material_edition_sha256);
  }
  if (canAuthorize && !selectedMaterial) deny();
  const installed = hash(raw.installed_delivery_protocol_sha256);
  if (!current && raw.effective_state !== "disabled") deny();
  if (raw.effective_state === "enabled_for_validation"
    && (!current || current.state !== "enabled_for_validation" || current.delivery_protocol_sha256 !== installed)) deny();
  return Object.freeze({ schema_version: 2, protocol: PRIVATE_ROLLOUT_V2, actor_id: actor, organization_id: OWN_SOURCE_ORG,
    course_id: q.p_course_id, current, current_revision: currentRevision, selected_material: selectedMaterial,
    installed_delivery_protocol_sha256: installed, effective_state: raw.effective_state, can_authorize: canAuthorize, blockers });
}

export interface AuthorizeReceiptSelection {
  readonly actorId: string; readonly request: AuthorizeRolloutRequest; readonly knownReceipt?: RolloutCommandReceipt;
}
export interface DisableReceiptSelection {
  readonly actorId: string; readonly request: DisableRolloutRequest; readonly knownReceipt?: RolloutCommandReceipt;
}
function reason(value: unknown): void { if (typeof value !== "string" || !value.trim() || value.length > 16_384) deny(); }
function commandReceipt(value: unknown): RolloutCommandReceipt {
  const raw = exact(value, ["schema_version", "protocol", "actor_id", "course_id", "action", "authorization_id",
    "revision", "event_id", "request_id", "request_sha256", "recorded_at", "state_at_recording", "replayed"]);
  equal(raw.schema_version, 2); equal(raw.protocol, PRIVATE_ROLLOUT_V2);
  if (raw.action !== "authorize" && raw.action !== "disable") deny();
  equal(raw.state_at_recording, raw.action === "authorize" ? "enabled_for_validation" : "disabled");
  return Object.freeze({ schema_version: 2, protocol: PRIVATE_ROLLOUT_V2, actor_id: uuid(raw.actor_id), course_id: uuid(raw.course_id),
    action: raw.action, authorization_id: uuid(raw.authorization_id), revision: revision(raw.revision), event_id: uuid(raw.event_id),
    request_id: uuid(raw.request_id), request_sha256: hash(raw.request_sha256), recorded_at: timestamp(raw.recorded_at),
    state_at_recording: raw.action === "authorize" ? "enabled_for_validation" : "disabled", replayed: bool(raw.replayed) });
}
function selectedCommandReceipt(raw: unknown, input: unknown, action: "authorize" | "disable"): RolloutCommandReceipt {
  const selected = optionalRecord(input, ["actorId", "request"], ["knownReceipt"]);
  const q = exact(selected.request, action === "authorize"
    ? ["p_course_id", "p_marketplace_id", "p_proposal_id", "p_expected_material_edition_sha256", "p_expected_reference_vector_sha256",
      "p_expected_delivery_protocol_sha256", "p_expected_revision", "p_purposes", "p_reason", "p_request_id"]
    : ["p_course_id", "p_expected_revision", "p_reason", "p_request_id"]);
  const actor = uuid(selected.actorId), course = uuid(q.p_course_id), requestId = uuid(q.p_request_id);
  const previousRevision = revision(q.p_expected_revision, action === "authorize");
  reason(q.p_reason);
  if (action === "authorize") {
    uuid(q.p_marketplace_id); uuid(q.p_proposal_id); hash(q.p_expected_material_edition_sha256);
    hash(q.p_expected_reference_vector_sha256); hash(q.p_expected_delivery_protocol_sha256); purposes(q.p_purposes);
  }
  const result = commandReceipt(raw);
  equal(result.actor_id, actor); equal(result.course_id, course); equal(result.request_id, requestId); equal(result.action, action);
  equal(BigInt(result.revision), BigInt(previousRevision) + 1n);
  if (selected.knownReceipt !== undefined) {
    const old = commandReceipt(selected.knownReceipt);
    // The only mutable response field is replayed. No locally invented canonical-command hash.
    if (!sameDTO({ ...old, replayed: false }, { ...result, replayed: false })) deny();
  }
  return result;
}
export function parseAuthorizeRolloutReceiptV2(value: unknown, input: AuthorizeReceiptSelection): RolloutCommandReceipt {
  return selectedCommandReceipt(value, input, "authorize");
}
export function parseDisableRolloutReceiptV2(value: unknown, input: DisableReceiptSelection): RolloutCommandReceipt {
  return selectedCommandReceipt(value, input, "disable");
}
/** Metadata acknowledgment only. Neither a receipt nor this predicate grants byte access. */
export function recordedCommandMatchesFreshControl(receiptValue: RolloutCommandReceipt, fresh: AdminControlContext,
  expectedAuthorize?: AuthorizeRolloutRequest): boolean {
  const current = fresh.current;
  if (!current || receiptValue.actor_id !== fresh.actor_id || receiptValue.course_id !== fresh.course_id
    || receiptValue.revision !== fresh.current_revision || current.revision !== receiptValue.revision
    || current.authorization_id !== receiptValue.authorization_id || current.last_event_id !== receiptValue.event_id) return false;
  if (receiptValue.action === "disable") return current.state === "disabled" && fresh.effective_state !== "enabled_for_validation";
  if (!expectedAuthorize) return false;
  try { parseAuthorizeRolloutReceiptV2(receiptValue, { actorId: fresh.actor_id, request: expectedAuthorize }); }
  catch { return false; }
  return current.state === "enabled_for_validation" && fresh.effective_state === "enabled_for_validation"
    && current.delivery_protocol_sha256 === fresh.installed_delivery_protocol_sha256
    && current.delivery_protocol_sha256 === expectedAuthorize.p_expected_delivery_protocol_sha256
    && current.material.course_id === expectedAuthorize.p_course_id && current.material.marketplace_id === expectedAuthorize.p_marketplace_id
    && current.material.proposal_id === expectedAuthorize.p_proposal_id
    && current.material.material_edition_sha256 === expectedAuthorize.p_expected_material_edition_sha256
    && current.material.reference_vector_sha256 === expectedAuthorize.p_expected_reference_vector_sha256
    && current.purposes.length === expectedAuthorize.p_purposes.length
    && current.purposes.every(value => expectedAuthorize.p_purposes.includes(value));
}

export interface TrustedSHA256Port { digest(bytes: Uint8Array): Promise<string> }
export interface ByteVerificationScope {
  readonly signal: AbortSignal;
  /** Must compare a captured, unique operation identity; a string-key ABA equality is insufficient. */
  readonly isCurrent: () => boolean;
}
export interface VerifiedPrivatePayload {
  readonly context: SealedPrivateReferenceContext; readonly bytes: Uint8Array;
  readonly mime: string; readonly previewKind: "pdf" | "image" | "download_only";
}
function current(scope: ByteVerificationScope): void { if (scope.signal.aborted || !scope.isCurrent()) deny(); }
function sniff(bytes: Uint8Array): { mime: string; previewKind: VerifiedPrivatePayload["previewKind"] } {
  const prefix = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (prefix(37, 80, 68, 70, 45)) return { mime: "application/pdf", previewKind: "pdf" };
  if (prefix(137, 80, 78, 71, 13, 10, 26, 10)) return { mime: "image/png", previewKind: "image" };
  if (prefix(255, 216, 255)) return { mime: "image/jpeg", previewKind: "image" };
  if (prefix(71, 73, 70, 56, 55, 97) || prefix(71, 73, 70, 56, 57, 97)) return { mime: "image/gif", previewKind: "image" };
  if (bytes.length >= 12 && prefix(82, 73, 70, 70) && [87, 69, 66, 80].every((value, i) => bytes[i + 8] === value))
    return { mime: "image/webp", previewKind: "image" };
  return { mime: "application/octet-stream", previewKind: "download_only" };
}
/** Pure, injected digest only. No RPC/HTTP/lease/Blob URL; abort does not imply cancellation of a server command. */
export async function verifyPrivatePayloadBytes(response: PrivateBytesResponse, input: ReferenceSelection,
  expectedContext: SealedPrivateReferenceContext, sha256: TrustedSHA256Port, scope: ByteVerificationScope): Promise<VerifiedPrivatePayload> {
  current(scope);
  const parsed = parsePrivateBytesResponseV2(response, input, expectedContext);
  const { bytes_hex: hex, ...context } = parsed;
  const bytes = new Uint8Array(parsed.binding.byte_length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  try {
    current(scope);
    const digest = await sha256.digest(bytes);
    current(scope);
    equal(hash(digest), parsed.binding.file_bytes_sha256);
    return Object.freeze({ context: Object.freeze(context), bytes, ...sniff(bytes) });
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}
