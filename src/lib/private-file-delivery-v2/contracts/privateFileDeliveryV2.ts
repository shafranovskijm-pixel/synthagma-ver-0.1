/** CONTRACT CANDIDATE ONLY. No RPC implementation, migration, enable data or authority mint. */
import type { CourseFileModeContext } from "@/lib/courseFileConsumer";
export const OWN_SOURCE_ORG = "4ac2c05a-d8b5-4e72-ba31-f2c743091d95" as const;
export const PRIVATE_DELIVERY_V2 = "platform-private-file-delivery/2" as const;
export const PRIVATE_ROLLOUT_V2 = "platform-private-file-rollout/2" as const;
export const COURSE_ROUTING_V2 = "course-file-routing/2" as const;
export const OWN_VALIDATION_SCOPE = "own_source_private_file_validation" as const;
/** Wire strings require canonical PostgreSQL UUID, lowercase SHA256, or bounded decimal-bigint validation. */
export type UUID = string;
export type SHA256 = string;
export type Revision = string;
export type AccessMode = "learner" | "staff_preview";
export type Purpose = "preview" | "download";
export type ReferenceKind = "course_document" | "lesson_attachment";
export interface ReceiptIdentity {
  readonly receipt_id: UUID; readonly captured_edition_id: UUID;
  readonly source_org_version_id: UUID | null; readonly file_bytes_sha256: SHA256; readonly byte_length: number;
}
export interface CapturedReference {
  readonly reference_kind: ReferenceKind; readonly reference_id: UUID; readonly receipt: ReceiptIdentity;
}
export interface MaterialSelection {
  readonly course_id: UUID; readonly marketplace_id: UUID; readonly proposal_id: UUID;
  readonly material_edition_sha256: SHA256;
}
export interface MaterialProof extends MaterialSelection {
  readonly organization_id: typeof OWN_SOURCE_ORG; readonly source_scope_generation: UUID;
  readonly reference_vector_sha256: SHA256; readonly capture_enforcement_sha256: SHA256;
  readonly references: readonly CapturedReference[];
}
export interface AuthorityMarker {
  readonly authorization_id: UUID; readonly revision: Revision;
  readonly course_id: UUID; readonly organization_id: typeof OWN_SOURCE_ORG;
  readonly proposal_id: UUID; readonly material_edition_sha256: SHA256; readonly source_scope_generation: UUID;
  readonly reference_vector_sha256: SHA256; readonly capture_enforcement_sha256: SHA256;
  readonly delivery_protocol_sha256: SHA256;
}
interface ModeBase {
  readonly schema_version: 2; readonly protocol: typeof COURSE_ROUTING_V2;
  readonly actor_id: UUID; readonly organization_id: UUID; readonly course_id: UUID; readonly access_mode: AccessMode;
}
/** Absence of a V2 marker may delegate successful unchanged V1 classification.
 * An existing disabled/stale marker, malformed result or error never delegates. */
export type CourseFileRoutingV2 = ModeBase & (
  | { readonly route: "v1"; readonly delegated_v1: CourseFileModeContext; readonly authority: null }
  | { readonly route: "private_v2"; readonly delegated_v1: null; readonly authority: AuthorityMarker }
  | { readonly route: "held"; readonly delegated_v1: null; readonly authority: null }
);
export interface PrivateReferenceRequest {
  readonly p_course_id: UUID; readonly p_reference_kind: ReferenceKind; readonly p_reference_id: UUID;
  readonly p_access_mode: AccessMode; readonly p_purpose: Purpose;
}
interface PrivateContextBase {
  readonly schema_version: 2; readonly protocol: typeof PRIVATE_DELIVERY_V2; readonly authority_scope: typeof OWN_VALIDATION_SCOPE;
  readonly actor_id: UUID; readonly organization_id: typeof OWN_SOURCE_ORG; readonly course_id: UUID;
  readonly reference_kind: ReferenceKind; readonly reference_id: UUID; readonly access_mode: AccessMode; readonly purpose: Purpose;
}
export interface OwnReferenceBinding extends ReceiptIdentity {
  /** Phase1 does not grant library/UMK/org-version access; unsupported resources stay held. */
  readonly source_org_version_id: null;
  readonly module_id: UUID | null; readonly lesson_id: UUID | null; readonly display_name: string;
  readonly reference_row_sha256: SHA256; readonly visible_to_students: boolean; readonly allow_download: boolean;
}
export type PrivateReferenceContext = PrivateContextBase & (
  | { readonly state: "held"; readonly authority: null; readonly binding: null; readonly context_sha256: null }
  | { readonly state: "bytes_sealed"; readonly authority: AuthorityMarker; readonly binding: OwnReferenceBinding; readonly context_sha256: SHA256 }
);
export type SealedPrivateReferenceContext = Extract<PrivateReferenceContext, { state: "bytes_sealed" }>;
export interface PrivateBytesRequest extends PrivateReferenceRequest {
  readonly p_expected_authorization_id: UUID; readonly p_expected_revision: Revision; readonly p_expected_context_sha256: SHA256;
}
export type PrivateBytesResponse = SealedPrivateReferenceContext & { readonly bytes_hex: string };
export interface RolloutSnapshot {
  readonly authorization_id: UUID; readonly revision: Revision; readonly state: "disabled" | "enabled_for_validation";
  readonly material: MaterialProof; readonly audience: "own_source"; readonly audience_organization_id: typeof OWN_SOURCE_ORG;
  readonly delivery_protocol_sha256: SHA256; readonly purposes: readonly Purpose[];
  readonly configured_by: UUID; readonly configured_at: string; readonly last_event_id: UUID;
}
export type AdminControlReadRequest = { readonly p_course_id: UUID } & (
  | { readonly p_marketplace_id: null; readonly p_proposal_id: null; readonly p_expected_material_edition_sha256: null }
  | { readonly p_marketplace_id: UUID; readonly p_proposal_id: UUID; readonly p_expected_material_edition_sha256: SHA256 }
);
export interface AdminControlContext {
  readonly schema_version: 2; readonly protocol: typeof PRIVATE_ROLLOUT_V2; readonly actor_id: UUID;
  readonly organization_id: typeof OWN_SOURCE_ORG; readonly course_id: UUID;
  readonly current: RolloutSnapshot | null; readonly current_revision: Revision;
  readonly selected_material: MaterialProof | null; readonly installed_delivery_protocol_sha256: SHA256;
  readonly effective_state: "disabled" | "held" | "enabled_for_validation"; readonly can_authorize: boolean;
  readonly blockers: readonly string[];
}
export interface AuthorizeRolloutRequest {
  readonly p_course_id: UUID; readonly p_marketplace_id: UUID; readonly p_proposal_id: UUID;
  readonly p_expected_material_edition_sha256: SHA256; readonly p_expected_reference_vector_sha256: SHA256;
  readonly p_expected_delivery_protocol_sha256: SHA256; readonly p_expected_revision: Revision;
  readonly p_purposes: readonly Purpose[]; readonly p_reason: string; readonly p_request_id: UUID;
}
export interface DisableRolloutRequest {
  readonly p_course_id: UUID; readonly p_expected_revision: Revision; readonly p_reason: string; readonly p_request_id: UUID;
}
export interface RolloutCommandReceipt {
  readonly schema_version: 2; readonly protocol: typeof PRIVATE_ROLLOUT_V2;
  readonly actor_id: UUID; readonly course_id: UUID; readonly action: "authorize" | "disable";
  readonly authorization_id: UUID; readonly revision: Revision; readonly event_id: UUID;
  readonly request_id: UUID; readonly request_sha256: SHA256; readonly recorded_at: string;
  readonly state_at_recording: "disabled" | "enabled_for_validation"; readonly replayed: boolean;
}
interface RpcResult { readonly data: unknown; readonly error: unknown }
/** No actor/organization authority, JWT, service key, enable-bypass flag or GUC input. */
export interface PrivateDeliveryV2Port {
  mode(args: { readonly p_course_id: UUID; readonly p_access_mode: AccessMode }, signal: AbortSignal): PromiseLike<RpcResult>;
  context(args: PrivateReferenceRequest, signal: AbortSignal): PromiseLike<RpcResult>;
  bytes(args: PrivateBytesRequest, signal: AbortSignal): PromiseLike<RpcResult>;
  adminControl(args: AdminControlReadRequest, signal: AbortSignal): PromiseLike<RpcResult>;
  authorize(args: AuthorizeRolloutRequest, signal: AbortSignal): PromiseLike<RpcResult>;
  disable(args: DisableRolloutRequest, signal: AbortSignal): PromiseLike<RpcResult>;
}
