import { parsePublicationContext, PLATFORM_REVIEW_ORG_ID, type PublicationReviewContext } from "@/lib/platformCoursePublication";
import type { CourseFileReferenceKind } from "@/lib/courseExactFileDelivery";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const MAX_BYTES = 8 * 1024 * 1024;
const PROOF = "actual_captured_bytes_not_historical_origin_attestation_or_review_approval";
const DELIVERY = "authorised_moderator_frozen_context_not_learner_acceptance";
const RECEIPT_KEYS = ["receipt_id", "intent_id", "course_id", "marketplace_id", "reference_kind", "reference_id",
  "captured_edition_id", "source_org_version_id", "file_bytes_sha256", "byte_length", "recorded_at", "state",
  "replayed", "source_bucket_public_at_capture", "proof_scope"] as const;

export interface CurrentPlatformFileSelection {
  readonly actorId: string; readonly marketplaceId: string; readonly courseId: string;
  readonly currentEditionSha256: string; readonly referenceKind: CourseFileReferenceKind; readonly referenceId: string;
}
export interface CapturedCurrentPlatformFile {
  readonly receipt_id: string; readonly intent_id: string; readonly course_id: string; readonly marketplace_id: string;
  readonly reference_kind: CourseFileReferenceKind; readonly reference_id: string; readonly captured_edition_id: string;
  readonly source_org_version_id: null; readonly file_bytes_sha256: string; readonly byte_length: number;
  readonly recorded_at: string; readonly state: "bytes_sealed"; readonly replayed: boolean;
  readonly source_bucket_public_at_capture: boolean; readonly proof_scope: typeof PROOF;
}
export class CurrentPlatformFileCaptureHeld extends Error {
  constructor(readonly code: "held" | "needs_version" | "changed" = "held") {
    super("Фиксация файла не подтверждена"); this.name = "CurrentPlatformFileCaptureHeld";
  }
}
function deny(code: "held" | "needs_version" | "changed" = "held"): never { throw new CurrentPlatformFileCaptureHeld(code); }
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const keys = (x: Record<string, unknown>, names: readonly string[]) =>
  Object.keys(x).length === names.length && names.every(k => Object.prototype.hasOwnProperty.call(x, k));

export function checkCurrentPlatformFileSelection(s: CurrentPlatformFileSelection): Readonly<CurrentPlatformFileSelection> {
  if (!record(s) || [s.actorId, s.marketplaceId, s.courseId, s.referenceId].some(x => typeof x !== "string" || !UUID.test(x))
    || typeof s.currentEditionSha256 !== "string" || !SHA.test(s.currentEditionSha256)
    || (s.referenceKind !== "course_document" && s.referenceKind !== "lesson_attachment")) deny();
  return Object.freeze({ actorId: s.actorId, marketplaceId: s.marketplaceId, courseId: s.courseId,
    currentEditionSha256: s.currentEditionSha256, referenceKind: s.referenceKind, referenceId: s.referenceId });
}
export function currentPlatformFileFromReview(c: PublicationReviewContext, kind: CourseFileReferenceKind, ref: string) {
  if (c.currentSource.courseId !== c.courseId || c.currentSource.marketplaceId !== c.marketplaceId
    || c.currentSource.fileBindings.filter(f => f.kind === kind && f.referenceId === ref).length !== 1) deny();
  return checkCurrentPlatformFileSelection({ actorId: c.actorId, marketplaceId: c.marketplaceId, courseId: c.courseId,
    currentEditionSha256: c.currentEditionSha256, referenceKind: kind, referenceId: ref });
}

/** Classify metadata locally only. No locator is opened, forwarded, cached or displayed.
 * Other buckets and unknown/ambiguous versions are deliberately held. */
export function canonicalCurrentCourseFileKey(value: unknown, courseId: string): string {
  if (typeof value !== "string" || !UUID.test(courseId)) deny("needs_version");
  const match = value.match(/^https:\/\/api[.]xn--80aaiswd0ak[.]xn--p1ai\/sb-storage\/object\/(?:authenticated|public|sign)\/course-files\/([^?#]+)(?:[?][^#]*)?$/)
    ?? value.match(/^https:\/\/atxwvjxbqjgkbjlhsdch[.]supabase[.]co\/storage\/v1\/object\/(?:authenticated|public|sign)\/course-files\/([^?#]+)(?:[?][^#]*)?$/)
    ?? value.match(/^course-files\/([^?#]+)$/);
  if (!match) deny("needs_version");
  let key: string;
  try { key = decodeURIComponent(match[1]); } catch { return deny("needs_version"); }
  if (!key || key.length > 2048 || /[\u0000-\u001f\u007f\\%?#]/.test(key)
    || key.split("/").some(p => !p || p === "." || p === "..")
    || !(key.startsWith(courseId + "/") || key.startsWith("courses/" + courseId + "/"))) deny("needs_version");
  return key;
}
export async function currentCourseFileMetadataFingerprint(parts: readonly unknown[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}
export function parseCapturedCurrentFile(raw: unknown, input: CurrentPlatformFileSelection, intentId: string): Readonly<CapturedCurrentPlatformFile> {
  const s = checkCurrentPlatformFileSelection(input);
  if (!record(raw) || !keys(raw, RECEIPT_KEYS) || !UUID.test(intentId)
    || [raw.receipt_id, raw.intent_id, raw.course_id, raw.marketplace_id, raw.reference_id, raw.captured_edition_id]
      .some(v => typeof v !== "string" || !UUID.test(v))
    || raw.intent_id !== intentId || raw.course_id !== s.courseId || raw.marketplace_id !== s.marketplaceId
    || raw.reference_kind !== s.referenceKind || raw.reference_id !== s.referenceId || raw.source_org_version_id !== null
    || typeof raw.file_bytes_sha256 !== "string" || !SHA.test(raw.file_bytes_sha256)
    || typeof raw.byte_length !== "number" || !Number.isSafeInteger(raw.byte_length) || raw.byte_length < 1 || raw.byte_length > MAX_BYTES
    || typeof raw.recorded_at !== "string" || !Number.isFinite(Date.parse(raw.recorded_at))
    || raw.state !== "bytes_sealed" || typeof raw.replayed !== "boolean"
    || typeof raw.source_bucket_public_at_capture !== "boolean" || raw.proof_scope !== PROOF) deny();
  return Object.freeze({ ...raw }) as unknown as Readonly<CapturedCurrentPlatformFile>;
}
type Rpc = { data: unknown; error: unknown };
export interface CurrentPlatformFileCapturePort {
  context(s: CurrentPlatformFileSelection, signal: AbortSignal): Promise<Rpc>;
  probe(s: CurrentPlatformFileSelection, signal: AbortSignal): Promise<{ fingerprint: string }>;
  begin(args: { p_marketplace_id: string; p_reference_kind: CourseFileReferenceKind; p_reference_id: string;
    p_expected_edition_sha256: string; p_request_id: string }, signal: AbortSignal): Promise<Rpc>;
  capture(intentId: string, signal: AbortSignal): Promise<Rpc & { response?: Response }>;
  receipt(receiptId: string, signal: AbortSignal): Promise<Rpc>;
}
async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, cancellation: AbortSignal, timeout: number): Promise<T> {
  const abort = new AbortController(); let reject!: (reason: unknown) => void;
  const interrupted = new Promise<never>((_yes, no) => { reject = no; });
  const cancel = () => abort.abort(cancellation.reason);
  const fail = () => reject(abort.signal.reason ?? new CurrentPlatformFileCaptureHeld());
  cancellation.addEventListener("abort", cancel, { once: true }); abort.signal.addEventListener("abort", fail, { once: true });
  const timer = setTimeout(() => abort.abort(new CurrentPlatformFileCaptureHeld()), timeout);
  try { cancellation.throwIfAborted(); const value = await Promise.race([operation(abort.signal), interrupted]); cancellation.throwIfAborted(); abort.signal.throwIfAborted(); return value; }
  finally { clearTimeout(timer); cancellation.removeEventListener("abort", cancel); abort.signal.removeEventListener("abort", fail); abort.abort(); }
}
export function createCurrentPlatformFileCapture(port: CurrentPlatformFileCapturePort) {
  return Object.freeze({
    async capture(input: CurrentPlatformFileSelection, requestId: string, cancellation: AbortSignal, isCurrent: () => boolean) {
      const s = checkCurrentPlatformFileSelection(input); if (!UUID.test(requestId)) deny();
      return bounded(async signal => {
        const current = () => { signal.throwIfAborted(); if (!isCurrent()) deny("changed"); };
        async function step<T>(fn: (signal: AbortSignal) => Promise<T>, deadline: number) {
          current(); const value = await bounded(fn, signal, deadline); current(); return value;
        }
        async function context(sameEdition: boolean) {
          const reply = await step(sig => port.context(s, sig), 20_000);
          if (!record(reply) || reply.error) deny();
          const c = parsePublicationContext(reply.data, s, s.actorId);
          const member = currentPlatformFileFromReview(c, s.referenceKind, s.referenceId);
          if (sameEdition && member.currentEditionSha256 !== s.currentEditionSha256) deny("changed");
          return c;
        }
        async function probe() {
          const p = await step(sig => port.probe(s, sig), 15_000);
          if (!record(p) || !keys(p, ["fingerprint"]) || typeof p.fingerprint !== "string" || !SHA.test(p.fingerprint)) deny();
          return p.fingerprint;
        }
        await context(true); const before = await probe();
        const begin = await step(sig => port.begin({ p_marketplace_id: s.marketplaceId, p_reference_kind: s.referenceKind,
          p_reference_id: s.referenceId, p_expected_edition_sha256: s.currentEditionSha256, p_request_id: requestId }, sig), 15_000);
        const intent = begin.data;
        // A fresh explicit click has one UUID. An unexpected historical replay is
        // held rather than silently called a new current capture.
        if (begin.error || !record(intent) || !keys(intent, ["schema_version", "actor_id", "organization_id", "marketplace_id", "course_id",
          "current_edition_sha256", "reference_kind", "reference_id", "intent_id", "expires_at", "replayed", "state", "selection_proof"])
          || intent.schema_version !== 1 || intent.actor_id !== s.actorId || intent.organization_id !== PLATFORM_REVIEW_ORG_ID
          || intent.marketplace_id !== s.marketplaceId || intent.course_id !== s.courseId
          || intent.current_edition_sha256 !== s.currentEditionSha256 || intent.reference_kind !== s.referenceKind || intent.reference_id !== s.referenceId
          || typeof intent.intent_id !== "string" || !UUID.test(intent.intent_id)
          || typeof intent.expires_at !== "string" || !Number.isFinite(Date.parse(intent.expires_at))
          || intent.replayed !== false || intent.state !== "capture_intent_only_not_verified_or_approved"
          || intent.selection_proof !== "same_transaction_current_course_files_only_no_library_or_org_version") deny();
        const intentId = intent.intent_id;
        // These client probes are supplemental. Only the new ordinary same-TX
        // server selection proof closes hidden bucket/edition ABA at begin.
        if (await probe() !== before) deny("changed");
        await context(true);
        const captured = await step(sig => port.capture(intentId, sig), 45_000);
        if (captured.error || !captured.response || captured.response.status !== 200 || captured.response.redirected
          || captured.response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") deny();
        const receipt = parseCapturedCurrentFile(captured.data, s, intentId);
        const read = await step(sig => port.receipt(receipt.receipt_id, sig), 35_000);
        const wire = read.data;
        if (read.error || !record(wire) || !keys(wire, [...RECEIPT_KEYS, "bytes_hex", "delivery_scope", "consumer_acceptance"])
          || wire.delivery_scope !== DELIVERY) deny();
        const reread = parseCapturedCurrentFile(Object.fromEntries(RECEIPT_KEYS.map(k => [k, wire[k]])), s, intentId);
        if (RECEIPT_KEYS.some(k => k !== "replayed" && reread[k] !== receipt[k])) deny();
        const cap = wire.consumer_acceptance;
        if (!record(cap) || !keys(cap, ["protocol", "admin_bytes_reader_source", "own_learner_bytes_reader_source",
          "frontend_consumers_accepted", "copied_centre_exact_binding_supported", "frozen_reader_implemented"])
          || cap.protocol !== "pcf-bytea/1" || cap.admin_bytes_reader_source !== true || cap.own_learner_bytes_reader_source !== true
          || cap.frontend_consumers_accepted !== false || cap.copied_centre_exact_binding_supported !== false || cap.frozen_reader_implemented !== false) deny();
        if (typeof wire.bytes_hex !== "string" || wire.bytes_hex.length !== receipt.byte_length * 2 || !/^[a-f0-9]+$/.test(wire.bytes_hex)) deny();
        const bytes = new Uint8Array(receipt.byte_length);
        const nibble = (v: number) => v <= 57 ? v - 48 : v - 87;
        for (let i = 0; i < bytes.length; i++) bytes[i] = nibble(wire.bytes_hex.charCodeAt(i * 2)) * 16 + nibble(wire.bytes_hex.charCodeAt(i * 2 + 1));
        const sha = await step(async sig => { const value = await crypto.subtle.digest("SHA-256", bytes); sig.throwIfAborted(); return value; }, 15_000);
        if (Array.from(new Uint8Array(sha), b => b.toString(16).padStart(2, "0")).join("") !== receipt.file_bytes_sha256) deny();
        if (await probe() !== before) deny("changed");
        await context(false); current();
        // Receipt proof only. The V3 current-file state and all methodical,
        // learner, review and publication gates remain unchanged.
        return reread;
      }, cancellation, 100_000);
    },
  });
}
