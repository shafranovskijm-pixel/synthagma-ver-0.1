/** UC022 approved source ABI V2B1. This type-only module has no runtime side effects. No runtime imports, side effects, legal approval or test execution.
 * Every object is closed: unknown keys rejected by matching client/server validators.
 * UUID = canonical lowercase UUID; Hash = 64 lowercase hex SHA256; Utc = RFC3339 UTC.
 * No token/password/JWT/OTP/signed URL is permitted in a persisted result/event/export.
 */
// Type-only canonical dependency at the proposed src/lib/signatureAssurance/contract.ts location.
import type {RegistrySource} from '../documentRegistry/contract';
export type UUID = string;
export type Hash = string;
export type Utc = string;
export type Revision = number; // safe integer 0..2147483647; successful new event increments by1.
export type SupportedMethod = 'graphic_asset' | 'scan_received' | 'bearer_invitation_confirmation' | 'authenticated_account_confirmation';
export type UnsupportedMethod = 'verified_email_challenge_confirmation' | 'external_qualified_signature';
export type Method = SupportedMethod | UnsupportedMethod | 'legacy_unknown';
export type SigningParty = 'sender' | 'recipient';
export type PartyRole = SigningParty | 'student' | 'individual' | 'company_representative';
export type PolicyState = 'draft' | 'source_checked' | 'reviewed' | 'centre_accepted' | 'retired';
export type IdentityRequirement = 'declared' | 'account_control';
export type AuthorityRequirement = 'self' | 'declared_representative' | 'exact_document_reference';
export type Conclusion = 'not_confirmed' | 'factual_confirmation' | 'policy_eligible_account_confirmation' | 'scan_received' | 'graphic_prepared' | 'legacy_unknown';
export type ErrorCode = 'ACCESS_DENIED' | 'INVALID_INPUT' | 'NOT_FOUND' | 'REVISION_CONFLICT' | 'REQUEST_CONFLICT' | 'CLASSIFICATION_REQUIRED' | 'POLICY_REQUIRED' | 'POLICY_NOT_ACCEPTED' | 'POLICY_CHANGED' | 'IDENTITY_REQUIRED' | 'IDENTITY_MISMATCH' | 'AUTHORITY_REQUIRED' | 'AGREEMENT_REQUIRED' | 'AGREEMENT_CHANGED' | 'METHOD_UNSUPPORTED' | 'SOURCE_UNAVAILABLE' | 'SOURCE_CHANGED' | 'CLOSED' | 'EXPIRED' | 'LIMIT_EXCEEDED' | 'DEPENDENCY_UNAVAILABLE';
export interface Failure { version: 1; ok: false; code: ErrorCode }
export interface ExactFile {
  bucket: 'external-contracts' | 'signed-documents' | 'org-documents';
  path: string; sha256: Hash; bytes: number; mime: string;
}
/** Canonical UC018 source.content_hash is metadata proof, NEVER actual file-byte SHA256. */
export interface ServiceVerifiedBytes {
  assurance: 'trusted_service_reread'; byte_sha256: Hash; byte_size: number;
  object_id: UUID; updated_at: Utc; verification_record_id: UUID;
}
export type ExactDocumentSelection =
  | { kind: 'org_document_version'; organization_id: UUID; source: RegistrySource }
  | { kind: 'document_registry_file'; organization_id: UUID; registry_record_id: UUID; registry_record_revision: Revision;
      source: RegistrySource };
export type ExactDocumentReference = ExactDocumentSelection & { byte_proof: ServiceVerifiedBytes | null };
// Caller selects a source only. A trusted byte-proof/verification field is never accepted on input.
/** No private UUID/path/source is revealed in a redacted commitment. Raw values stay immutable server-side. */
export type EvidenceDisclosure<T> =
  | { visibility: 'available'; captured_reference_sha256: Hash; captured_reference_json: string; value: T }
  | { visibility: 'redacted'; captured_reference_sha256: Hash; value: null; reason: 'current_file_scope' };
export interface DisclosureSummary {
  kind: 'complete' | 'current_scope_projection'; redacted_reference_count: number; redacted_content_count: number;
  complete_private_evidence_verified: boolean; // false whenever anything is masked or only a hash commitment is available.
}
export type AuthorityReferenceDisclosure = EvidenceDisclosure<ExactDocumentReference>;
export type PolicyReferenceDisclosure = EvidenceDisclosure<ExactDocumentSelection>;
export type FileDisclosure = EvidenceDisclosure<ExactFile>;
export interface Classification {
  document_type: 'contract' | 'consent' | 'act' | 'order' | 'custom_pdf' | 'education_document' | 'external_upload';
  subtype: string; // explicit nonempty canonical/centre subtype key, max120; no broad wildcard.
  party_role: PartyRole;
}
export interface LegalSourceReference {
  source_key: string; title: string; primary_url: string; provision: string;
  edition: string; checked_on: string; effective_from: string | null; effective_until: string | null;
  completeness: 'verified_body' | 'consolidation_review_required'; limitation: string | null;
}
export interface CanonicalTerms {
  kind: 'pep_agreement' | 'personal_data_consent'; version: string; text: string; sha256: Hash;
}
export interface PolicyBody {
  version: 1; classification: Classification; method: SupportedMethod;
  purpose: 'factual_only' | 'account_pep' | 'paper_scan_record';
  identity_requirement: IdentityRequirement; authority_requirement: AuthorityRequirement;
  basis: { kind: 'law' | 'agreement' | 'local_act' | 'combined'; explanation: string; sources: LegalSourceReference[]; document_references: ExactDocumentSelection[] };
  agreement: CanonicalTerms | null; consent: CanonicalTerms | null;
  limitations: string; // required user-visible limit; no universal legal-validity default.
}
export interface ActorFact {
  user_id: UUID | null; observed_mode: 'account' | 'bearer' | 'legacy_unknown';
  observed_email: string | null; email_control_confirmed: boolean;
  declared_full_name: string | null; name_assurance: 'declared' | 'legacy_unknown';
}
export interface AuthorityFact {
  kind: 'self' | 'declared_representative' | 'exact_document_reference' | 'unknown';
  declaration: string | null; document_reference: AuthorityReferenceDisclosure | null;
  verification: 'not_verified' | 'exact_reference_checked';
}
export interface PolicyDecision {
  id: UUID; revision: Revision; state: PolicyState; server_at: Utc;
  actor_user_id: UUID | null; reason: string; authority: AuthorityFact;
  source_limits_acknowledged: boolean;
}
export type PolicyBodyProjection = Omit<PolicyBody, 'basis'> & {
  basis: Omit<PolicyBody['basis'], 'document_references'> & { document_references: PolicyReferenceDisclosure[] };
};
export interface PolicyVersion {
  id: UUID; family_id: UUID; organization_id: UUID; version: Revision;
  body: PolicyBodyProjection; body_sha256: Hash; // commitment to full private captured canonical body.
  body_json: string | null; // full original literal UTF8 only when ALL captured references remain currently readable.
  projection_json: string; projection_sha256: Hash; disclosure: DisclosureSummary;
  created_at: Utc; created_by: UUID | null; decision: PolicyDecision;
  decision_history?: PolicyDecision[]; // Captured immutable decisions; absent in older snapshots.
}
// projection_json encodes strict {body, body_sha256, disclosure} plus decision_history when captured; its own bytes/hash are verified.
// A masked body NEVER pretends to hash to the private body_sha256; body_json is null when masked.
export interface PolicyChoice {
  id: UUID; family_id: UUID; organization_id: UUID; version: Revision; body_sha256: Hash;
  classification: Classification; method: SupportedMethod; purpose: PolicyBody['purpose'];
  identity_requirement: IdentityRequirement; authority_requirement: AuthorityRequirement;
  limitations: string; decision_revision: Revision;
}
export interface Capabilities {
  can_read: boolean; can_draft_policy: boolean; can_review_policy: boolean; can_accept_policy: boolean;
  can_bind_signature: boolean; can_confirm_account: boolean; can_confirm_sender: boolean;
  can_receive_scan: boolean; can_record_bearer_fact: boolean; can_capture_receipt: boolean;
  supported_methods: SupportedMethod[];
  unsupported_methods: { method: UnsupportedMethod; verified: false; reason: 'VERIFIER_NOT_IMPLEMENTED' }[];
}
export interface EvidenceRequirements {
  eligible: boolean; // technical policy eligibility, never a court/blanket legal conclusion.
  missing: Exclude<ErrorCode, 'INVALID_INPUT' | 'NOT_FOUND' | 'REQUEST_CONFLICT' | 'DEPENDENCY_UNAVAILABLE'>[];
  purpose: 'factual_only' | 'account_pep' | 'paper_scan_record' | 'unconfigured';
  limitations: string[];
}
export interface Binding {
  id: UUID; organization_id: UUID; signature_id: UUID; party_role: SigningParty; revision: Revision;
  document_snapshot_id: UUID; document_revision_id: UUID | null; document_html_sha256: Hash; original_file: FileDisclosure | null;
  classification: Classification; policy_version_id: UUID; policy_sha256: Hash; policy_decision_revision: Revision;
  agreement_sha256: Hash | null; subject_user_id: UUID | null; recipient_user_id: UUID | null;
  bound_at: Utc; bound_by: UUID | null;
}
export interface SignaturePartyContext {
  party_role: SigningParty; binding: Binding | null; policy: PolicyVersion | null;
  latest_party_event_revision: Revision; // a global stream revision; gaps between this party's events are expected.
  conclusion: Conclusion; requirements: EvidenceRequirements;
}
export interface SignatureContext {
  organization_id: UUID; signature_id: UUID; current_document_revision_id: UUID | null;
  current_document_html_sha256: Hash; legacy_status: string; legacy_method: string | null;
  chosen_party: SigningParty; // supplied explicitly by the authenticated query/action, never inferred from UI order.
  parties: { sender: SignaturePartyContext; recipient: SignaturePartyContext };
  latest_event_revision: Revision; // the ONE shared signature CAS/history boundary for both parties.
  capabilities: Capabilities; // current captured actor and chosen_party, not a blanket grant to the other party.
  latest_receipt_id: UUID | null; legacy_evidence_available: boolean;
  // No aggregate signed/PEP/bilateral conclusion is invented from these independent factual histories.
}
export interface DocumentSnapshot {
  id: UUID; organization_id: UUID; signature_id: UUID; party_role: SigningParty; document_revision_id: UUID | null;
  html_text: string | null; html_sha256: Hash; original_file: FileDisclosure | null;
  content_visibility: 'available' | 'redacted_current_file_scope' | 'redacted_credential_bearing_source';
  source_file_state: 'not_present' | 'verified_bytes' | 'unverified_reference'; captured_at: Utc;
  // html_sha256 may remain a commitment when html_text=null; no hidden HTML/paths leak via projection_json.
}
export interface ConsentSnapshot {
  id: UUID; legacy_consent_id: UUID | null; organization_id: UUID; subject_user_id: UUID;
  revision: Revision; state: 'confirmed' | 'withdrawn' | 'legacy_unknown';
  consent_terms: CanonicalTerms | null; rendered_text: string | null; rendered_text_sha256: Hash | null;
  organization_name: string | null; organization_inn: string | null;
  actor: ActorFact; policy_version_id: UUID | null; policy_sha256: Hash | null;
  agreement_event_id: UUID | null; confirmed_at: Utc | null; withdrawn_at: Utc | null;
  legacy_recorded_at: Utc | null; limitations: string[];
}
export type AgreementSnapshot =
  | { kind: 'account_acceptance'; id: UUID; legacy_agreement_id: null; organization_id: UUID; subject_user_id: UUID;
      terms: CanonicalTerms; rendered_text: string; rendered_text_sha256: Hash;
      actor: ActorFact; policy_version_id: UUID; policy_sha256: Hash; accepted_at: Utc;
      timestamp_assurance: 'platform_server_time'; identity_assurance: 'observed_account_control';
      assurance: 'account_acceptance' }
  | { kind: 'legacy_unknown'; id: UUID; legacy_agreement_id: UUID; organization_id: UUID | null; subject_user_id: UUID;
      organization_assurance: 'stored_exact' | 'association_unknown';
      stored_terms: { version: string | null; text: string | null; text_sha256: Hash | null;
        hash_assurance: 'computed_from_known_stored_text' | 'not_available' };
      stored_rendered_text: string | null; stored_rendered_text_sha256: Hash | null;
      actor: ActorFact; policy_version_id: null; policy_sha256: null; accepted_at: null;
      stored_timestamp: string | null; timestamp_assurance: 'legacy_client_timestamp' | 'legacy_origin_unknown';
      identity_assurance: 'unverified'; assurance: 'legacy_unknown'; limitations: string[] };
// Legacy global records without stored org remain organization_id=null, not assigned to the current screen's org.
// Legacy unknown never satisfies a new policy's AGREEMENT_REQUIRED/account confirmation prerequisite.
export type EventKind = 'policy_created' | 'policy_source_checked' | 'policy_reviewed' | 'policy_accepted' | 'policy_retired' | 'signature_bound' | 'graphic_prepared' | 'bearer_confirmed' | 'account_confirmed' | 'scan_received' | 'sender_confirmed' | 'agreement_accepted' | 'consent_confirmed' | 'consent_withdrawn' | 'invitation_revoked' | 'recipient_rejected';
export interface Event {
  id: UUID; organization_id: UUID; stream_kind: 'policy' | 'signature' | 'consent' | 'agreement';
  stream_id: UUID; revision: Revision; kind: EventKind; server_at: Utc;
  actor: ActorFact; authority: AuthorityFact; method: Method;
  policy_version_id: UUID | null; policy_sha256: Hash | null;
  signature_id: UUID | null; binding_id: UUID | null; party_role: SigningParty | null; document_snapshot_id: UUID | null; document_revision_id: UUID | null; document_html_sha256: Hash | null;
  original_file: FileDisclosure | null; scan_file: FileDisclosure | null;
  agreement_event_id: UUID | null; agreement_sha256: Hash | null; consent_snapshot_id: UUID | null;
  conclusion: Conclusion; explanation: string; request_id: UUID;
  cryptographic_verification: 'not_performed';
  time_assurance: 'platform_server_time';
}
export interface EventPage {
  stream_kind: Event['stream_kind']; stream_id: UUID; through_revision: Revision;
  events: Event[]; after_revision: Revision; next_after_revision: Revision | null;
}
export interface FrozenManifestBody {
  schema_version: 1; id: UUID; organization_id: UUID; signature_id: UUID;
  captured_at: Utc; captured_by: UUID | null;
  manifest_kind: 'scoped_derivative'; source_manifest_id: UUID; source_manifest_sha256: Hash;
  disclosure: DisclosureSummary;
  context: SignatureContext; through_revision: Revision; event_count: number; events: Event[];
  referenced_bindings: Binding[]; // complete immutable binding graph, including historical per-role rebindings.
  referenced_policies: PolicyVersion[]; referenced_agreements: Extract<AgreementSnapshot, {kind: 'account_acceptance'}>[];
  document_snapshots: DocumentSnapshot[];
  limitations: string[];
}
export interface FrozenManifest {
  body: FrozenManifestBody;
  body_json: string; body_json_sha256: Hash; // exact server-frozen UTF8 bytes, not client reserialization.
  receipt_html: string; receipt_html_sha256: Hash;
}
export interface MutationReceipt {
  request_id: UUID; payload_sha256: Hash; outcome: 'applied' | 'replayed';
  action: ApplyAction['action'] | Exclude<ServiceAction['action'], 'context'>; event_id: UUID | null;
  party_role: SigningParty | null; binding_id: UUID | null; // ORIGINAL applied facts survive a replay/rebind.
  entity_id: UUID; revision_applied: Revision; server_at: Utc;
}
export interface AuthScope { actor_user_id: UUID; organization_id: UUID }
export type ReadQuery =
  | { kind: 'policy_list'; after_id: UUID | null; limit: number }
  | { kind: 'policy_choices'; signature_id: UUID | null; party_role: SigningParty | null; purpose: 'signature' | 'consent' | 'agreement'; after_id: UUID | null; limit: number }
  | { kind: 'policy'; policy_version_id: UUID }
  | { kind: 'signature'; signature_id: UUID; party_role: SigningParty }
  | { kind: 'events'; stream_kind: Event['stream_kind']; stream_id: UUID; after_revision: Revision; through_revision: Revision | null; limit: number }
  | { kind: 'receipt'; signature_id: UUID; receipt_id: UUID }
  | { kind: 'subject'; subject_user_id: UUID; after_id: UUID | null; limit: number }
  | { kind: 'terms'; policy_version_id: UUID; terms_kind: CanonicalTerms['kind']; declared_full_name: string };
export type ReadResult =
  | { kind: 'policy_list'; policies: PolicyVersion[]; next_after_id: UUID | null }
  | { kind: 'policy_choices'; signature_id: UUID | null; party_role: SigningParty | null; purpose: 'signature' | 'consent' | 'agreement'; choices: PolicyChoice[]; next_after_id: UUID | null }
  | { kind: 'policy'; policy: PolicyVersion }
  | { kind: 'signature'; context: SignatureContext }
  | { kind: 'events'; page: EventPage }
  | { kind: 'receipt'; manifest: FrozenManifest }
  | { kind: 'subject'; subject_user_id: UUID; agreement_stream_id: UUID; agreement_revision: Revision; consent_stream_id: UUID; consent_revision: Revision; agreements: AgreementSnapshot[]; consents: ConsentSnapshot[]; next_after_id: UUID | null }
  | { kind: 'terms'; policy_version_id: UUID; subject_user_id: UUID; terms: CanonicalTerms; rendered_text: string; rendered_text_sha256: Hash; declared_full_name: string };
export interface ReadSuccess { version: 1; ok: true; scope: AuthScope; capabilities: Capabilities; result: ReadResult }
export interface AuthorityInput {
  kind: AuthorityFact['kind']; declaration: string | null; document_reference: ExactDocumentSelection | null;
} // Input accepts no visibility, disclosure commitment or verification flags.
export type ApplyAction =
  | { action: 'save_policy_draft'; family_id: UUID | null; previous_version_id: UUID | null; body: PolicyBody }
  | { action: 'record_policy_decision'; policy_version_id: UUID; decision: 'source_checked' | 'reviewed' | 'centre_accepted' | 'retired'; reason: string; authority: AuthorityInput; source_limits_acknowledged: boolean }
  | { action: 'bind_signature'; signature_id: UUID; party_role: SigningParty; document_revision_id: UUID | null; document_html_sha256: Hash; classification: Classification; policy_version_id: UUID }
  | { action: 'accept_agreement'; policy_version_id: UUID; terms_sha256: Hash; rendered_text_sha256: Hash; declared_full_name: string }
  | { action: 'confirm_consent'; policy_version_id: UUID; terms_sha256: Hash; rendered_text_sha256: Hash; declared_full_name: string; agreement_event_id: UUID; authority: AuthorityInput }
  | { action: 'withdraw_consent'; consent_snapshot_id: UUID; reason: string }
  | { action: 'confirm_sender'; signature_id: UUID; party_role: 'sender'; binding_id: UUID; policy_sha256: Hash; document_html_sha256: Hash; declared_full_name: string; authority: AuthorityInput; agreement_event_id: UUID | null; agreement_sha256: Hash | null }
  | { action: 'record_graphic_preparation'; signature_id: UUID; party_role: SigningParty; binding_id: UUID | null; document_html_sha256: Hash; reason: string }
  | { action: 'revoke_invitation'; signature_id: UUID; party_role: 'recipient'; reason: string }
  | { action: 'capture_receipt'; signature_id: UUID; party_role: SigningParty; through_revision: Revision };
export interface ApplyRequest {
  p_organization_id: UUID; p_request_id: UUID; p_expected_revision: Revision; p_action: ApplyAction;
}
export type ApplyResult =
  | { kind: 'policy'; policy: PolicyVersion }
  | { kind: 'signature'; context: SignatureContext }
  | { kind: 'agreement'; agreement: Extract<AgreementSnapshot, {kind: 'account_acceptance'}> }
  | { kind: 'consent'; consent: ConsentSnapshot }
  | { kind: 'receipt'; manifest: FrozenManifest };
export interface ApplySuccess { version: 1; ok: true; scope: AuthScope; capabilities: Capabilities; receipt: MutationReceipt; result: ApplyResult }
export interface ReadRequest { p_organization_id: UUID; p_query: ReadQuery }
export type ReadResponse = ReadSuccess | Failure;
export type ApplyResponse = ApplySuccess | Failure;
export const AUTHENTICATED_RPC_ABI = {
  read: 'read_signature_assurance', // (p_organization_id uuid, p_query jsonb) returns jsonb
  apply: 'apply_signature_assurance', // (p_organization_id uuid, p_request_id uuid, p_expected_revision integer, p_action jsonb) returns jsonb
} as const;

/** Edge input keeps the invitation only in transport; no client can set observed_actor_user_id. */
export interface PublicConfirmationBase {
  action: 'confirm'; token: string; party_role: 'recipient'; request_id: UUID; expected_revision: Revision;
  expected_document_revision_id: UUID | null; document_html_sha256: Hash;
  declared_full_name: string; authority: AuthorityInput; confirmed: true;
}
export type PublicEdgeRequest =
  | { action: 'context'; token: string; party_role: 'recipient' }
  | (PublicConfirmationBase & { method: 'bearer_invitation_confirmation'; binding_id: UUID | null; policy_sha256: Hash | null; policy_decision_revision: Revision | null })
  | (PublicConfirmationBase & { method: 'authenticated_account_confirmation'; binding_id: UUID; policy_sha256: Hash; policy_decision_revision: Revision; agreement_sha256: Hash; agreement_event_id: UUID | null; agreement_accepted: true })
  | { action: 'receive_scan'; token: string; party_role: 'recipient'; request_id: UUID; expected_revision: Revision; binding_id: UUID | null; expected_document_revision_id: UUID | null; document_html_sha256: Hash; policy_sha256: Hash | null; policy_decision_revision: Revision | null; scan_path: string; declared_full_name: string; declaration: string; authority: AuthorityInput; confirmed: true }
  | { action: 'reject'; token: string; party_role: 'recipient'; request_id: UUID; expected_revision: Revision; expected_document_revision_id: UUID | null; reason: string };
export type PublicContext = Pick<SignatureContext, 'organization_id' | 'signature_id' | 'current_document_revision_id' | 'current_document_html_sha256' | 'legacy_status' | 'legacy_method' | 'latest_event_revision'> & {
  party_role: 'recipient'; latest_party_event_revision: Revision; conclusion: Conclusion; requirements: EvidenceRequirements;
  binding: Pick<Binding, 'id' | 'organization_id' | 'signature_id' | 'party_role' | 'revision' | 'document_revision_id' | 'document_html_sha256' | 'classification' | 'policy_version_id' | 'policy_sha256' | 'policy_decision_revision' | 'agreement_sha256'> & {source_file_sha256:Hash|null;source_file_bytes:number|null} | null;
  policy: {
    id: UUID; family_id: UUID; organization_id: UUID; version: Revision; body_sha256: Hash;
    classification: Classification; method: SupportedMethod; purpose: PolicyBody['purpose'];
    identity_requirement: IdentityRequirement; authority_requirement: AuthorityRequirement;
    agreement: CanonicalTerms | null; consent: CanonicalTerms | null;
    basis_explanation: string; legal_sources: LegalSourceReference[]; limitations: string;
  } | null; // no staff identities, internal authority document references or private file paths.
  supported_methods: SupportedMethod[]; unsupported_methods: Capabilities['unsupported_methods'];
  authenticated_recipient: boolean;
  // There is deliberately NO sender party context, sender policy/basis/authority or sender account assurance here.
};
export type PublicEdgeSuccess =
  | { version: 1; ok: true; kind: 'context'; context: PublicContext }
  | { version: 1; ok: true; kind: 'confirmation'; context: PublicContext; receipt: MutationReceipt; certificate_state: 'not_requested' | 'pending' | 'ready' | 'failed' };
export type PublicEdgeResponse = PublicEdgeSuccess | Failure;

/** Service-only RPC input. Trusted edge derives actor from auth.getUser with exact request JWT.
 * DB rechecks account revocation, recipient binding and canonical auth email association.
 * No arbitrary client headers/actor JSON pass-through. Body validators cannot accept this shape publicly.
 */
export type ServiceAction = PublicEdgeRequest;
export interface ServiceRequest {
  p_action: ServiceAction;
  p_observed_actor_user_id: UUID | null;
  p_request_ip: string | null; p_request_user_agent: string | null;
  p_original_proof: ExactFile | null; p_scan_proof: ExactFile | null;
}
export const SERVICE_RPC_ABI = 'uc_signature_assurance_service';
// (p_action jsonb, p_observed_actor_user_id uuid, p_request_ip text, p_request_user_agent text,
//  p_original_proof jsonb, p_scan_proof jsonb) returns jsonb;
// Effective EXECUTE service_role only. Helpers/new private tables: no PUBLIC/anon/authenticated/service_role access.
export const LIMITS = {
  listPage: 100, eventPage: 100, historyExportEvents: 5000, manifestBytes: 2_000_000,
  termsBytes: 65_536, policyBytes: 196_608, documentHtmlBytes: 1_000_000, sources: 20, authorityReferences: 20,
  fullName: 300, reason: 4000, subtype: 120, token: 200, requestIp: 200, userAgent: 2000,
} as const;
// Limits refuse explicitly; no truncation of history/text/hash inputs. Existing title/display limits retained.
// A current-scoped derivative never rewrites the original private snapshot/manifest or an older exported blob.
