import DOMPurify from "dompurify";
import { CourseExactFileUnavailable, type CourseFileAccessMode, type CourseFileReferenceKind } from "@/lib/courseExactFileDelivery";

export interface CourseFilePreviewReference {
  readonly courseId: string;
  readonly organizationId: string;
  readonly referenceKind: CourseFileReferenceKind;
  readonly referenceId: string;
  readonly name: string;
  readonly fileType: string | null;
  readonly legacyUrl: string | null;
  readonly versionKey?: string;
}
export interface CourseFileModeSelection {
  readonly actorId: string; readonly organizationId: string | null; readonly courseId: string; readonly accessMode: CourseFileAccessMode;
}
export interface CourseFileCohortMarker {
  readonly schema_version: 1; readonly copy_generation_id: string; readonly publication_id: string;
  readonly publication_manifest_sha256: string; readonly source_course_id: string;
  readonly reference_count: number; readonly reference_vector_sha256: string;
}
interface ModeBase {
  readonly schema_version: 1; readonly actor_id: string; readonly organization_id: string;
  readonly course_id: string; readonly access_mode: CourseFileAccessMode;
}
export type CourseFileModeContext =
  | (ModeBase & { readonly mode: "legacy"; readonly state: "legacy"; readonly cohort: null })
  | (ModeBase & { readonly mode: "frozen_required"; readonly state: "held"; readonly cohort: Readonly<CourseFileCohortMarker> | null });
export type CourseFileDeliveryModeView =
  | { readonly state: "idle" | "loading" | "held" }
  | { readonly state: "legacy"; readonly context: Extract<CourseFileModeContext, { mode: "legacy" }> }
  | { readonly state: "frozen_required"; readonly context: Extract<CourseFileModeContext, { mode: "frozen_required" }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
function deny(): never { throw new CourseExactFileUnavailable(); }
export function checkCourseFileModeSelection(input: CourseFileModeSelection): Readonly<CourseFileModeSelection> {
  if (!object(input) || typeof input.actorId !== "string" || !UUID.test(input.actorId) || (input.organizationId !== null && (typeof input.organizationId !== "string" || !UUID.test(input.organizationId))) || typeof input.courseId !== "string" || !UUID.test(input.courseId)
    || !["learner", "staff_preview"].includes(input.accessMode)) deny();
  return Object.freeze({ actorId: input.actorId, organizationId: input.organizationId, courseId: input.courseId, accessMode: input.accessMode });
}
export function parseCourseFileMode(raw: unknown, input: CourseFileModeSelection): Readonly<CourseFileModeContext> {
  const selected = checkCourseFileModeSelection(input);
  if (!object(raw) || !exact(raw, ["schema_version", "actor_id", "organization_id", "course_id", "access_mode", "mode", "state", "cohort"])
    || raw.schema_version !== 1 || raw.actor_id !== selected.actorId || typeof raw.organization_id !== "string" || !UUID.test(raw.organization_id)
    || (selected.organizationId !== null && raw.organization_id !== selected.organizationId)
    || raw.course_id !== selected.courseId || raw.access_mode !== selected.accessMode) deny();
  if (raw.mode === "legacy" && raw.state === "legacy" && raw.cohort === null) return Object.freeze({ ...raw }) as unknown as CourseFileModeContext;
  if (raw.mode !== "frozen_required" || raw.state !== "held") deny();
  if (raw.cohort === null) return Object.freeze({ ...raw }) as unknown as CourseFileModeContext;
  const c = raw.cohort;
  if (!object(c) || !exact(c, ["schema_version", "copy_generation_id", "publication_id", "publication_manifest_sha256", "source_course_id", "reference_count", "reference_vector_sha256"])
    || c.schema_version !== 1 || typeof c.copy_generation_id !== "string" || !UUID.test(c.copy_generation_id)
    || typeof c.publication_id !== "string" || !UUID.test(c.publication_id)
    || typeof c.source_course_id !== "string" || !UUID.test(c.source_course_id) || c.source_course_id === selected.courseId
    || typeof c.publication_manifest_sha256 !== "string" || !SHA.test(c.publication_manifest_sha256)
    || typeof c.reference_vector_sha256 !== "string" || !SHA.test(c.reference_vector_sha256)
    || typeof c.reference_count !== "number" || !Number.isSafeInteger(c.reference_count) || c.reference_count < 0) deny();
  return Object.freeze({ ...raw, cohort: Object.freeze({ ...c }) }) as unknown as CourseFileModeContext;
}
export interface CourseFileModePort { read(args: { p_course_id: string; p_access_mode: CourseFileAccessMode }, signal: AbortSignal): Promise<{ data: unknown; error: unknown }> }
export function createCourseFileModeGateway(port: CourseFileModePort) {
  return async (input: CourseFileModeSelection, signal: AbortSignal): Promise<Readonly<CourseFileModeContext>> => {
    const selected = checkCourseFileModeSelection(input);
    const abort = new AbortController();
    let rejectAbort: (error?: unknown) => void = () => {};
    const cancelled = new Promise<never>((_yes, no) => { rejectAbort = no; });
    const relay = () => abort.abort(signal.reason);
    const rejected = () => rejectAbort(abort.signal.reason);
    signal.addEventListener("abort", relay, { once: true });
    abort.signal.addEventListener("abort", rejected, { once: true });
    const timeout = setTimeout(() => abort.abort(new DOMException("Request timed out", "TimeoutError")), 20_000);
    try {
      signal.throwIfAborted();
      const response = await Promise.race([port.read({ p_course_id: selected.courseId, p_access_mode: selected.accessMode }, abort.signal), cancelled]);
      signal.throwIfAborted(); abort.signal.throwIfAborted();
      if (!object(response) || response.error) deny();
      return parseCourseFileMode(response.data, selected);
    } finally {
      clearTimeout(timeout); signal.removeEventListener("abort", relay); abort.signal.removeEventListener("abort", rejected); abort.abort();
    }
  };
}
/** Safety hints can deny a locator; they can never classify a course/reference as legacy. */
export function isOpaqueCourseFileLocator(value: unknown): boolean { return typeof value === "string" && /^\s*urn:/i.test(value); }
export function isLegacyCourseMediaAllowed(view: CourseFileDeliveryModeView | null | undefined): boolean { return view?.state === "legacy"; }
export function isEmbeddedCourseMedia(lessonType: string | null | undefined, content: string | null | undefined): boolean {
  return ["video", "audio", "pdf", "file", "presentation", "slider", "ai_avatar"].includes(lessonType || "")
    || /https?:\/\/|blob:|data:|<\s*(?:iframe|img|audio|video|object|embed)\b|"(?:imageSrc|imageUrl|videoSrc|videoUrl|audioUrl|documentUrl|embedUrl|buttonUrl|fileUrl|src|href)"\s*:/i.test(content || "");
}
/** Render this directly; sending it through a URL-relinkifying block renderer is unsafe. */
export function safeCourseInlineHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "small", "sub", "sup", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "hr"],
    ALLOWED_ATTR: ["colspan", "rowspan", "scope", "abbr"], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  });
}
