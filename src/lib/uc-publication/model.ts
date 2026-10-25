import { z } from "zod";

// Existing account IDs include canonical UUIDs without a version/variant restriction.
export const publicationUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const publicationSha256 = z.string().regex(/^[0-9a-f]{64}$/);
const nonempty = z.string().min(1).max(4000).refine(value => value.trim().length > 0);
const identifier = z.string().regex(/^[A-Za-z0-9_.:-]{1,200}$/);
export const publicationInstant = z.string().datetime({ offset: true });
const instant = publicationInstant;
export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !value.startsWith("0000-") && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Укажите существующую календарную дату");

export { parsePublicPublicationUrl } from "../../../supabase/functions/_shared/uc-publication-url";
import { parsePublicPublicationUrl } from "../../../supabase/functions/_shared/uc-publication-url";
const publicUrl = z.string().refine(value => { try { return parsePublicPublicationUrl(value) === value; } catch { return false; } }, "Нужен канонический открытый HTTPS-адрес без реквизитов доступа");

export const publicationBasisSchema = z.object({
  catalogVersion: identifier, requirementId: identifier, requirementVersion: identifier,
  profileRevision: z.number().int().positive(), applicabilityDecisionRevision: z.number().int().positive().nullable(),
  legalReview: z.enum(["needs_legal_review", "reviewed"]), sourceRevisionSha256: publicationSha256,
}).strict();
export type PublicationBasis = z.infer<typeof publicationBasisSchema>;

export const publicEditionSchema = z.object({
  id: publicationUuid, organizationId: publicationUuid, revision: z.number().int().positive(),
  title: nonempty, basis: publicationBasisSchema, reportingYear: z.number().int().min(1900).max(9998).nullable(),
  publicUrl, content: z.object({ sha256: publicationSha256, bytes: z.number().int().min(1).max(20 * 1024 * 1024),
    mime: z.enum(["application/pdf", "text/html", "text/plain", "image/png", "image/jpeg"]) }).strict(),
  // A source reference does not publish that private file or assert identical public/private bytes.
  privateSource: z.object({ documentId: publicationUuid, versionId: publicationUuid }).strict().nullable(),
  createdAt: instant, createdBy: publicationUuid,
}).strict();
export type PublicEdition = z.infer<typeof publicEditionSchema>;

export const publicationCheckSchema = z.object({
  id: publicationUuid, organizationId: publicationUuid, editionId: publicationUuid, editionRevision: z.number().int().positive(),
  requestedUrl: publicUrl, finalUrl: publicUrl, checkedAt: instant,
  result: z.enum(["verified", "hash_mismatch", "mime_mismatch", "http_unavailable", "unsafe_target", "source_changed"]),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  observed: z.object({ sha256: publicationSha256, bytes: z.number().int().min(1).max(20 * 1024 * 1024), mime: nonempty }).strict().nullable(),
  observer: z.literal("platform_anonymous_https"), transport: z.literal("public_addresses_pinned_tls_hostname_checked"),
  // This records an observation, never a claim that the address is continuously available.
  responseHeadersSha256: publicationSha256.nullable(), redirectCount: z.number().int().min(0).max(3),
}).strict();
export type PublicationCheck = z.infer<typeof publicationCheckSchema>;

const eventFields = { id: publicationUuid, organizationId: publicationUuid, editionId: publicationUuid,
  sequence: z.number().int().positive(), actorId: publicationUuid, occurredAt: instant };
export const publicationEventSchema = z.discriminatedUnion("kind", [
  z.object({ ...eventFields, kind: z.literal("approved"), reason: nonempty, reportedPublicationDate: calendarDate.nullable() }).strict(),
  z.object({ ...eventFields, kind: z.literal("withdrawn"), reason: nonempty }).strict(),
  z.object({ ...eventFields, kind: z.literal("check_completed"), check: publicationCheckSchema }).strict(),
]);
export type PublicationEvent = z.infer<typeof publicationEventSchema>;

export interface PublicationCurrentScope {
  organizationId: string; basis: PublicationBasis; asOf: string;
  /** A product recheck interval, not a statutory period or proof of continuous availability. */
  recheckAfterHours: number;
}
export interface PublicationProjection {
  state: "draft" | "awaiting_check" | "verified_at_time" | "recheck_required" | "withdrawn" | "source_changed";
  legalReview: PublicationBasis["legalReview"]; approvedAt: string | null; reportedPublicationDate: string | null;
  verifiedAt: string | null; publicUrl: string; checkId: string | null;
  legalComplianceConfirmed: false; continuousAvailabilityConfirmed: false;
}
