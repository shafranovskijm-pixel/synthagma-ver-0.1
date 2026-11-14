/** Frontend-only actual-admin NPA editorial protocol; no service worker capability. */
export type NpaJson = null | boolean | number | string | NpaJson[] | { [key: string]: NpaJson };
export type DeclaredBasis = {
  country: 'RU'; kind: string; date: string; number: string; title: string; docid?: number; dochash?: string | null;
};
export type Admission = {
  allowed: boolean; normative_status: 'current' | 'review_required';
  admission_basis: 'manual_review' | 'automatic_attestation' | 'blocked';
  normative_cutoff_at: string | null; reasons: string[]; finding_epoch: number;
  latest_check_status: string | null; latest_check_at: string | null;
};
export type Configuration = {
  id: string; version: number; release_id: string; context_sha256: string;
  basis: DeclaredBasis[]; discovery_from: string; created_at: string;
};
export type Manifest = {
  id: string; version: number; stable_sha256: string; approved_at: string;
  hard_stop_at: string | null; acknowledged_epoch: number; run_id: string;
};
export interface EditorialScope { actorId: string; organizationId: string; signal?: AbortSignal }
export interface CheckRun {
  id: string; status: 'queued' | 'running' | 'completed'; configuration_id: string | null;
  release_id: string | null; key_set_id: string | null; manifest_id: string | null; manifest_version: number;
  context_sha256: string | null; finding_epoch: number; queued_at: string; completed_at: string | null;
  outcome: string | null; error_code: string | null; proof_full: boolean; reason_codes: string[];
  observations: NpaJson[]; discovery_evidence: NpaJson | null; can_approve: boolean;
}
export interface EditorialBank {
  bank_id: string; code: string; title: string; release_id: string | null;
  configuration: Configuration | null; manifest: Manifest | null; admission: Admission;
  latest_check: CheckRun | null; check_runs: CheckRun[]; pending_findings: NpaJson[];
}
export interface NormativeEditorialWorkspace { server_time: string; banks: EditorialBank[] }

/** SQL/Edge still authorize the genuine session and revalidate every immutable binding. */
export interface NpaEditorialRpc {
  configure_rtn_npa_basis: {
    args: { p_bank_id: string; p_expected_configuration_id: string | null; p_expected_release_id: string;
      p_basis: DeclaredBasis[]; p_discovery_from: string; p_note: string; p_request_id: string };
    result: { configuration_id: string; version: number; basis: DeclaredBasis[];
      supported_count: number; unsupported_count: number; replayed: boolean };
  };
  approve_rtn_npa_manifest: {
    args: { p_bank_id: string; p_run_id: string; p_expected_configuration_id: string;
      p_expected_manifest_id: string | null; p_expected_finding_epoch: number; p_note: string; p_request_id: string };
    result: { manifest_id: string; version: number; stable_sha256: string; hard_stop_at: string | null;
      admission: Admission; replayed: boolean };
  };
  acknowledge_rtn_npa_manual_review: {
    args: { p_bank_id: string; p_release_id: string; p_expected_finding_epoch: number;
      p_evidence: { url: string; citation: string }[]; p_note: string; p_request_id: string };
    result: { review_id: string; acknowledged_epoch: number; admission: Admission; replayed: boolean };
  };
  request_rtn_npa_editorial_check: {
    args: { p_bank_id: string };
    // Current SQL returns queued/running. completed is only Edge forward
    // compatibility; it triggers a real workspace read, never assumed success.
    result: { run_id: string; status: 'queued' | 'running' | 'completed'; queued_at: string };
  };
  get_rtn_npa_editorial_workspace: {
    args: Record<string, never>;
    result: NormativeEditorialWorkspace;
  };
}
