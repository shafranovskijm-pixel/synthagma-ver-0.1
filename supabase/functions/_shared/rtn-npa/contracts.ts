// Product-candidate protocol. No browser JSON is an official-source proof.
// Root's server worker obtains a real service client ONLY after managed cron
// auth or genuine user queue authorization. SQL independently checks leases,
// context/manifest CAS, allowlisted origins, source dates and complete coverage.
export type Sha256 = string;
export type UUID = string;
export type ISODate = string;
export type ISOInstant = string;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface NpaIdentity {
  // 'Российская Федерация' may be derived jurisdiction for verified FederalLaw
  // scope. It is not a claim about a separately unobserved signing authority.
  country: 'RU'; kind: 'FederalLaw'; issuer: string;
  date: ISODate; number: string; title: string; docid: number; dochash: string;
}
export interface NpaCurrent {
  redid: number; effective_from: ISODate;
  actual: boolean; official: boolean; checked: boolean; redcompleted: boolean;
  hascontent: boolean; contentcomplete: boolean;
  // Exact decoded redtext encoded as UTF8, not normalized HTML/legal words.
  text_sha256: Sha256;
}
export interface FutureEdition {
  redid: number; effective_from: ISODate;
  official: boolean; checked: boolean; completed: boolean;
  hascontent: boolean; contentcomplete: boolean;
  text_sha256: Sha256 | null;
}
export interface BasisStable {
  identity: NpaIdentity; current: NpaCurrent;
  graph: {
    // Full reviewed narrow projection of changing refs AND other refs. Only
    // identity-set ordering may be canonicalized. Never discard annotations.
    canonical: Json;
    future_editions: FutureEdition[];
  };
}
export interface Artifact {
  // Existing private rtn-sources bucket, no signed URL or browser storage ACL.
  path: string; // npa250/<run_id>/<sha256>.(json|html|pdf|xml|bin)
  sha256: Sha256; bytes: number;
  request_url: string; http_status: number;
  transport: 'http' | 'https'; received_at: ISOInstant;
}
export interface BasisObservation {
  adapter_version: 'actual-pravo-federal-law-v1';
  stable: BasisStable;
  server_date: ISODate;
  fetched_at: ISOInstant;
  // Named artifacts are required for complete proof. Preserve raw responses.
  artifacts: { identity: Artifact; redactions: Artifact; redtext: Artifact; card: Artifact };
  stable_read_set: boolean;
  // Exact one identity/current result; false/incomplete => unknown, not equal.
  identity_count: number; current_count: number; error_code: string | null;
}
export interface QuestionSourceObservation {
  source_id: UUID; source_generation: number; sha256: Sha256;
  parent_normalization_sha256: Sha256; child_normalization_sha256: Sha256;
  fetched_at: ISOInstant; artifact: Artifact;
  catalog_complete: boolean;
}
export interface DiscoveryPage {
  index: number; reported_total: number; publication_ids: string[]; artifact: Artifact;
}
export interface DiscoveryProof {
  source: 'publication-pravo-federal-laws';
  from: ISODate; to_exclusive: ISODate;
  complete: boolean; reported_total: number; pages: DiscoveryPage[];
  // Full applicable graph/text/publication reconciliation. Title-only or a
  // finite RSS page cannot set this true. Unresolved candidates prevent renewal.
  relevance_complete: boolean; unresolved_candidates: string[];
  resolved_publications: Array<{
    publication_id: string;
    relation: 'not_related' | 'known_changing_act';
    basis_docids: number[];
    artifact: Artifact;
    graph_reference_ids: string[];
  }>;
  error_code: string | null;
}
export interface NpaCheckClaim {
  protocol: 'rtn-npa-v1'; run_id: UUID; lease_token: UUID; lease_expires_at: ISOInstant;
  bank_id: UUID; release_id: UUID; key_set_id: UUID;
  manifest_id: UUID | null; manifest_version: number;
  context_sha256: Sha256; finding_epoch: number;
  question_source: {
    source_code: string; trusted_anchor_rule: 'a1' | 'energy-xlsx'; parser: 'industrial-pdf' | 'energy-xlsx';
    source_id: UUID; page_url: string; document_url: string; sha256: Sha256;
    source_generation: number; parent_normalization_sha256: Sha256; child_normalization_sha256: Sha256;
  };
  // Approved manifest identities; bootstrap uses genuine-admin configured
  // candidate identities. The worker never accepts a caller-supplied fetch URL.
  basis: Array<Pick<NpaIdentity, 'country' | 'kind' | 'date' | 'number' | 'docid'> & { dochash: string | null }>;
  unsupported_basis: Array<{ kind: string; date: ISODate; number: string; title: string }>;
  all_declared_basis_count: number;
  discovery_window: { from: ISODate; to_exclusive: ISODate };
  worker_version: 'rtn-npa-official-v1';
}
export interface NpaCheckResult {
  protocol: 'rtn-npa-v1'; worker_version: 'rtn-npa-official-v1';
  status: 'complete' | 'partial_coverage' | 'unknown' | 'error';
  basis: BasisObservation[];
  question_source: QuestionSourceObservation | null;
  discovery: DiscoveryProof | null;
  // Future text, first/final stability anchors and publication originals.
  // Run-specific paths never enter BasisStable.graph.canonical.
  additional_artifacts: Artifact[];
  // Generated by the actual worker egress check, not a client capability claim.
  runtime_egress_verified: boolean;
  error_code: string | null;
}
export interface NpaCompletion {
  run_id: UUID; receipt_id: UUID | null;
  outcome: 'unchanged' | 'needs_subject_review' | 'unknown' | 'partial_coverage' | 'error';
  confirmed_findings: number; finding_epoch: number;
  valid_until_exclusive: ISOInstant | null;
  stale_manifest: boolean;
}

// SQL RPC contract:
// claim_rtn_npa_check({p_run_id?:UUID|null}) -> NpaCheckClaim|null   SERVICE ONLY
// complete_rtn_npa_check({p_run_id,p_lease_token,p_result:NpaCheckResult})
//   -> NpaCompletion                                            SERVICE ONLY
// request_rtn_npa_check({p_organization_id,p_bank_id})
//   -> {run_id,status}    genuine user; courses.write + entitlement/privacy
// No complete endpoint accepts actor_id, checked_at, expiry or an outcome
// "unchanged" from a browser. Database computes outcomes, epochs and expiry.
