/** Ordinary authenticated delivery for a NEW frozen own-course copy. No URL fallback. */
export type CourseFileReferenceKind = "course_document" | "lesson_attachment";
export type CourseFileAccessMode = "learner" | "staff_preview";
export type CourseFilePurpose = "preview" | "download";

export interface CourseExactFileSelection {
  readonly actorId: string;
  readonly organizationId: string;
  readonly courseId: string;
  readonly referenceKind: CourseFileReferenceKind;
  readonly referenceId: string;
  readonly accessMode: CourseFileAccessMode;
  readonly purpose: CourseFilePurpose;
}

export interface CopiedCourseExactFileBinding {
  readonly schema_version: 1;
  readonly state: "bytes_sealed";
  readonly binding_id: string;
  readonly copy_generation_id: string;
  readonly course_id: string;
  readonly organization_id: string;
  readonly reference_kind: CourseFileReferenceKind;
  readonly reference_id: string;
  readonly module_id: string | null;
  readonly lesson_id: string | null;
  readonly source_organization_id: string;
  readonly source_course_id: string;
  readonly source_reference_kind: CourseFileReferenceKind;
  readonly source_reference_id: string;
  readonly source_module_id: string | null;
  readonly source_lesson_id: string | null;
  readonly publication_id: string;
  readonly publication_manifest_sha256: string;
  readonly file_receipt_id: string;
  readonly captured_edition_id: string;
  readonly source_org_version_id: string | null;
  readonly file_bytes_sha256: string;
  readonly byte_length: number;
  readonly display_name: string;
  readonly visible_to_students: boolean;
  readonly allow_download: boolean;
}

interface DeliveryContextBase {
  readonly schema_version: 1;
  readonly actor_id: string;
  readonly organization_id: string;
  readonly course_id: string;
  readonly reference_kind: CourseFileReferenceKind;
  readonly reference_id: string;
  readonly access_mode: CourseFileAccessMode;
  readonly purpose: CourseFilePurpose;
}
export interface LegacyCourseFileDelivery extends DeliveryContextBase {
  readonly mode: "legacy";
  readonly state: "legacy";
  readonly binding: null;
}
export interface HeldCourseFileDelivery extends DeliveryContextBase {
  readonly mode: "frozen_required";
  readonly state: "hold";
  readonly binding: null;
}
export interface FrozenCourseFileDelivery extends DeliveryContextBase {
  readonly mode: "frozen_required";
  readonly state: "bytes_sealed";
  readonly binding: Readonly<CopiedCourseExactFileBinding>;
}
export type CourseFileDeliveryContext = LegacyCourseFileDelivery | HeldCourseFileDelivery | FrozenCourseFileDelivery;

export interface CopiedCourseExactFileLease {
  readonly url: string;
  readonly mime: string;
  readonly previewKind: "pdf" | "image" | "download_only";
  readonly binding: Readonly<CopiedCourseExactFileBinding>;
  copyVerifiedPdfBytes(): Uint8Array;
  release(): void;
}

export type CourseExactFileRPCName = "read_course_exact_file_delivery_context" | "read_copied_course_exact_file";
export interface CourseExactFileRPC {
  call(name: CourseExactFileRPCName, args: Readonly<Record<string, string>>, signal: AbortSignal): Promise<{ data: unknown; error: unknown }>;
}

export class CourseExactFileUnavailable extends Error {
  readonly code = "COURSE_EXACT_FILE_UNAVAILABLE";
  constructor() {
    super("Точная редакция файла недоступна. Обновите страницу или обратитесь в учебный центр.");
    this.name = "CourseExactFileUnavailable";
  }
}

const SOURCE_ORGANIZATION = "4ac2c05a-d8b5-4e72-ba31-f2c743091d95";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BYTES = 8 * 1024 * 1024; // Operational file bound, never a customer tariff limit.
const RPC_TIMEOUT_MS = 20_000;
const CONTEXT_KEYS = ["schema_version", "actor_id", "organization_id", "course_id", "reference_kind", "reference_id", "access_mode", "purpose", "mode", "state", "binding"] as const;
const BINDING_KEYS = ["schema_version", "state", "binding_id", "copy_generation_id", "course_id", "organization_id", "reference_kind", "reference_id", "module_id", "lesson_id", "source_organization_id", "source_course_id", "source_reference_kind", "source_reference_id", "source_module_id", "source_lesson_id", "publication_id", "publication_manifest_sha256", "file_receipt_id", "captured_edition_id", "source_org_version_id", "file_bytes_sha256", "byte_length", "display_name", "visible_to_students", "allow_download"] as const;
function unavailable(): never { throw new CourseExactFileUnavailable(); }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const nullableUuid = (v: unknown): v is string | null => v === null || uuid(v);
const referenceKind = (v: unknown): v is CourseFileReferenceKind => v === "course_document" || v === "lesson_attachment";
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

/** Client identities are readback/race fences. The SQL RPC independently establishes all authority. */
export function checkCourseExactFileSelection(input: CourseExactFileSelection): Readonly<CourseExactFileSelection> {
  if (!record(input) || !uuid(input.actorId) || !uuid(input.organizationId) || !uuid(input.courseId) || !uuid(input.referenceId)
    || !referenceKind(input.referenceKind) || (input.accessMode !== "learner" && input.accessMode !== "staff_preview")
    || (input.purpose !== "preview" && input.purpose !== "download")) unavailable();
  return Object.freeze({ actorId: input.actorId, organizationId: input.organizationId, courseId: input.courseId,
    referenceKind: input.referenceKind, referenceId: input.referenceId, accessMode: input.accessMode, purpose: input.purpose });
}

function checkBinding(value: unknown, selected: Readonly<CourseExactFileSelection>): Readonly<CopiedCourseExactFileBinding> {
  if (!record(value) || !exactKeys(value, BINDING_KEYS) || value.schema_version !== 1 || value.state !== "bytes_sealed"
    || !uuid(value.binding_id) || !uuid(value.copy_generation_id)
    || value.course_id !== selected.courseId || value.organization_id !== selected.organizationId
    || value.reference_kind !== selected.referenceKind || value.reference_id !== selected.referenceId
    || !nullableUuid(value.module_id) || !nullableUuid(value.lesson_id)
    || value.source_organization_id !== SOURCE_ORGANIZATION || !uuid(value.source_course_id) || value.source_course_id === selected.courseId
    || value.source_reference_kind !== selected.referenceKind || !uuid(value.source_reference_id)
    || !nullableUuid(value.source_module_id) || !nullableUuid(value.source_lesson_id)
    || !uuid(value.publication_id) || typeof value.publication_manifest_sha256 !== "string" || !SHA256.test(value.publication_manifest_sha256)
    || !uuid(value.file_receipt_id) || !uuid(value.captured_edition_id) || !nullableUuid(value.source_org_version_id)
    || typeof value.file_bytes_sha256 !== "string" || !SHA256.test(value.file_bytes_sha256)
    || typeof value.byte_length !== "number" || !Number.isSafeInteger(value.byte_length) || value.byte_length < 1 || value.byte_length > MAX_BYTES
    || typeof value.display_name !== "string" || value.display_name.length < 1 || value.display_name.length > 1000 || /[\u0000-\u001f\u007f]/.test(value.display_name)
    || typeof value.visible_to_students !== "boolean" || typeof value.allow_download !== "boolean") unavailable();
  if (selected.referenceKind === "lesson_attachment" && (!uuid(value.lesson_id) || !uuid(value.source_lesson_id))) unavailable();
  if (selected.referenceKind === "course_document" && (value.lesson_id !== null || value.source_lesson_id !== null)) unavailable();
  if ((selected.accessMode === "learner" && value.visible_to_students !== true) || (selected.purpose === "download" && value.allow_download !== true)) unavailable();
  return Object.freeze({ ...value }) as unknown as Readonly<CopiedCourseExactFileBinding>;
}

/** Only the literal successful server response may classify a reference as legacy. */
export function parseCourseFileDeliveryContext(raw: unknown, input: CourseExactFileSelection): Readonly<CourseFileDeliveryContext> {
  const selected = checkCourseExactFileSelection(input);
  if (!record(raw) || !exactKeys(raw, CONTEXT_KEYS) || raw.schema_version !== 1
    || raw.actor_id !== selected.actorId || raw.organization_id !== selected.organizationId || raw.course_id !== selected.courseId
    || raw.reference_kind !== selected.referenceKind || raw.reference_id !== selected.referenceId
    || raw.access_mode !== selected.accessMode || raw.purpose !== selected.purpose) unavailable();
  if (raw.mode === "legacy" && raw.state === "legacy" && raw.binding === null) return Object.freeze({ ...raw }) as unknown as LegacyCourseFileDelivery;
  if (raw.mode === "frozen_required" && raw.state === "hold" && raw.binding === null) return Object.freeze({ ...raw }) as unknown as HeldCourseFileDelivery;
  if (raw.mode !== "frozen_required" || raw.state !== "bytes_sealed") unavailable();
  return Object.freeze({ ...raw, binding: checkBinding(raw.binding, selected) }) as unknown as FrozenCourseFileDelivery;
}

function rpcArgs(selected: Readonly<CourseExactFileSelection>): Readonly<Record<string, string>> {
  // Neither actor nor organization from the browser is an authorization argument.
  return Object.freeze({ p_course_id: selected.courseId, p_reference_kind: selected.referenceKind,
    p_reference_id: selected.referenceId, p_access_mode: selected.accessMode, p_purpose: selected.purpose });
}

async function boundedRPC(client: CourseExactFileRPC, name: CourseExactFileRPCName, args: Readonly<Record<string, string>>, cancellation: AbortSignal): Promise<unknown> {
  const abort = new AbortController();
  const relay = () => abort.abort(cancellation.reason);
  cancellation.addEventListener("abort", relay, { once: true });
  const rejectOnAbort = () => rejectAbort(abort.signal.reason);
  let rejectAbort: (reason?: unknown) => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  abort.signal.addEventListener("abort", rejectOnAbort, { once: true });
  const timer = setTimeout(() => abort.abort(new DOMException("Request timed out", "TimeoutError")), RPC_TIMEOUT_MS);
  try {
    cancellation.throwIfAborted();
    // Abort remains a finite caller boundary even if a transport ignores its signal.
    const result = await Promise.race([client.call(name, args, abort.signal), aborted]);
    abort.signal.throwIfAborted();
    cancellation.throwIfAborted();
    if (!record(result) || result.error || !Object.prototype.hasOwnProperty.call(result, "data")) unavailable();
    return result.data;
  } finally {
    clearTimeout(timer);
    cancellation.removeEventListener("abort", relay);
    abort.signal.removeEventListener("abort", rejectOnAbort);
    abort.abort();
  }
}

function sniff(bytes: Uint8Array): { mime: string; previewKind: CopiedCourseExactFileLease["previewKind"] } {
  const prefix = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  if (prefix(0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: "application/pdf", previewKind: "pdf" };
  if (prefix(137, 80, 78, 71, 13, 10, 26, 10)) return { mime: "image/png", previewKind: "image" };
  if (prefix(255, 216, 255)) return { mime: "image/jpeg", previewKind: "image" };
  if (prefix(71, 73, 70, 56, 55, 97) || prefix(71, 73, 70, 56, 57, 97)) return { mime: "image/gif", previewKind: "image" };
  if (bytes.length >= 12 && prefix(82, 73, 70, 70) && [87, 69, 66, 80].every((value, i) => bytes[i + 8] === value)) return { mime: "image/webp", previewKind: "image" };
  return { mime: "application/octet-stream", previewKind: "download_only" }; // No HTML/SVG/external Office viewer.
}

/** No cache, source receipt RPC, signed URL, service key, or endpoint retry is available here. */
export function createCourseExactFileGateway(client: CourseExactFileRPC) {
  return Object.freeze({
    async readContext(input: CourseExactFileSelection, cancellation: AbortSignal): Promise<Readonly<CourseFileDeliveryContext>> {
      const selected = checkCourseExactFileSelection(input);
      const raw = await boundedRPC(client, "read_course_exact_file_delivery_context", rpcArgs(selected), cancellation);
      return parseCourseFileDeliveryContext(raw, selected);
    },

    async readBytes(input: CourseExactFileSelection, inputContext: FrozenCourseFileDelivery, cancellation: AbortSignal): Promise<CopiedCourseExactFileLease> {
      const selected = checkCourseExactFileSelection(input);
      const context = parseCourseFileDeliveryContext(inputContext, selected);
      if (context.mode !== "frozen_required" || context.state !== "bytes_sealed") unavailable();
      const binding = context.binding;
      const raw = await boundedRPC(client, "read_copied_course_exact_file", { ...rpcArgs(selected),
        p_binding_id: binding.binding_id, p_copy_generation_id: binding.copy_generation_id }, cancellation);
      if (!record(raw) || typeof raw.bytes_hex !== "string") unavailable();
      const { bytes_hex: hex, ...rawContext } = raw;
      const returned = parseCourseFileDeliveryContext(rawContext, selected);
      if (returned.mode !== "frozen_required" || returned.state !== "bytes_sealed"
        || BINDING_KEYS.some(key => returned.binding[key] !== binding[key])
        || hex.length !== binding.byte_length * 2 || !/^[0-9a-f]+$/.test(hex)) unavailable();
      const bytes = new Uint8Array(binding.byte_length);
      for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      cancellation.throwIfAborted();
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      cancellation.throwIfAborted();
      if (Array.from(digest, b => b.toString(16).padStart(2, "0")).join("") !== binding.file_bytes_sha256) unavailable();
      const media = sniff(bytes);
      const url = URL.createObjectURL(new Blob([bytes], { type: media.mime }));
      let released = false;
      const release = () => {
        if (!released) { released = true; bytes.fill(0); URL.revokeObjectURL(url); cancellation.removeEventListener("abort", release); }
      };
      cancellation.addEventListener("abort", release, { once: true });
      if (cancellation.aborted) { release(); cancellation.throwIfAborted(); }
      const copyVerifiedPdfBytes = () => {
        if (released || cancellation.aborted || media.previewKind !== "pdf") unavailable();
        return bytes.slice();
      };
      return Object.freeze({ url, ...media, binding, copyVerifiedPdfBytes, release });
    },
  });
}
