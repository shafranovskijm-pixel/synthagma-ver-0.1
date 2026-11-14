import type { NpaCheckClaim, NpaCheckResult, QuestionSourceObservation } from './contracts.ts';
import { OfficialClient, ProofError, type Limits, type PrivateArtifactStore } from './official-client.ts';
import { LAW_116, observe116 } from './actual-pravo-116.ts';
import { discoverPublications } from './publication-discovery.ts';

export interface WorkerDependencies {
  privateArtifactStore: PrivateArtifactStore;
  // Trusted server composition only. It must perform the real production
  // runtime's egress check; a browser capability flag is not this dependency.
  runtimeEgressProbe?: () => Promise<boolean>;
  // Root owns the existing question PDF/catalog/normalization worker. This
  // adapter consumes its independent proof; it cannot fabricate that proof.
  verifyQuestionSource?: (claim: NpaCheckClaim['question_source']) => Promise<QuestionSourceObservation>;
  fetch?: typeof fetch;
  now?: () => Date;
  limits?: Partial<Limits>;
  signal?: AbortSignal;
}
function validateClaim(claim: NpaCheckClaim): void {
  if (claim.protocol !== 'rtn-npa-v1' || claim.worker_version !== 'rtn-npa-official-v1' || !Array.isArray(claim.basis) || !Array.isArray(claim.unsupported_basis) ||
      !Number.isSafeInteger(claim.all_declared_basis_count) || claim.all_declared_basis_count < 1 ||
      claim.all_declared_basis_count !== claim.basis.length + claim.unsupported_basis.length ||
      new Set(claim.basis.map(row => `${row.kind}/${row.date}/${row.number}/${row.docid}`)).size !== claim.basis.length) throw new ProofError('INVALID_CHECK_CLAIM');
  if (!Number.isFinite(Date.parse(claim.lease_expires_at))) throw new ProofError('INVALID_CHECK_LEASE');
}
function verifyQuestionProof(source: QuestionSourceObservation, claim: NpaCheckClaim, now: string): void {
  const expected = claim.question_source;
  if (!source || source.source_id !== expected.source_id || source.source_generation !== expected.source_generation ||
      !/^[a-f0-9]{64}$/.test(source.sha256) || source.parent_normalization_sha256 !== expected.parent_normalization_sha256 ||
      source.child_normalization_sha256 !== expected.child_normalization_sha256 || source.catalog_complete !== true ||
      source.artifact.sha256 !== source.sha256 || !/^npa250\/[0-9a-f-]{36}\/[0-9a-f]{64}\.pdf$/.test(source.artifact.path) ||
      !source.artifact.path.startsWith(`npa250/${claim.run_id}/`) || source.artifact.http_status !== 200 ||
      source.fetched_at > now || !Number.isFinite(Date.parse(source.fetched_at))) throw new ProofError('QUESTION_SOURCE_PROOF_MISMATCH');
  // A positively observed changed PDF is useful evidence. Keep its new SHA;
  // SQL records official_question_source_changed rather than renewing it.
  // Generation/normalization stay bound to the claimed context.
}
export async function runOfficialNpaCheck(claim: NpaCheckClaim, dependencies: WorkerDependencies): Promise<NpaCheckResult> {
  const result: NpaCheckResult = { protocol: 'rtn-npa-v1', worker_version: 'rtn-npa-official-v1', status: 'unknown', basis: [], question_source: null, discovery: null, additional_artifacts: [], runtime_egress_verified: false, error_code: null };
  let client: OfficialClient | undefined;
  try {
    validateClaim(claim);
    client = new OfficialClient(claim.run_id, dependencies.privateArtifactStore, dependencies.fetch, dependencies.now, dependencies.limits, dependencies.signal);
    if (Date.parse(claim.lease_expires_at) <= Date.parse(client.instant())) throw new ProofError('CHECK_LEASE_EXPIRED');
    try { result.runtime_egress_verified = dependencies.runtimeEgressProbe ? await client.boundedDependency(Promise.resolve().then(dependencies.runtimeEgressProbe), 'EGRESS_PROBE_TIMEOUT') === true : false; } catch { result.runtime_egress_verified = false; }
    let basisFailure: string | null = null;
    for (const basis of claim.basis) {
      try { result.basis.push(await observe116(client, basis)); }
      catch (error) { basisFailure ??= error instanceof ProofError ? error.code : 'NPA_OBSERVATION_ERROR'; }
    }
    if (dependencies.verifyQuestionSource) {
      try {
        const source = await client.boundedDependency(dependencies.verifyQuestionSource(claim.question_source), 'QUESTION_SOURCE_VERIFIER_TIMEOUT', client.limits.sourceVerificationTimeoutMs);
        verifyQuestionProof(source, claim, client.instant());
        result.question_source = {
          source_id: source.source_id, source_generation: source.source_generation, sha256: source.sha256,
          parent_normalization_sha256: source.parent_normalization_sha256, child_normalization_sha256: source.child_normalization_sha256,
          fetched_at: source.fetched_at, artifact: source.artifact, catalog_complete: source.catalog_complete,
        };
      } catch (error) { result.error_code ??= error instanceof ProofError ? error.code : 'QUESTION_SOURCE_VERIFICATION_ERROR'; }
    } else result.error_code = 'QUESTION_SOURCE_VERIFIER_NOT_CONNECTED';
    const todayMoscow = new Date(Date.parse(client.instant()) + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const staleServer = result.basis.some(row => row.server_date !== todayMoscow);
    const incompleteFuture = result.basis.some(row => row.stable.graph.future_editions.some(future => !future.official || !future.checked || !future.completed || !future.hascontent || !future.contentcomplete || future.text_sha256 === null));
    const completeBasis = result.basis.length === claim.basis.length && result.basis.every(row => row.stable_read_set && row.error_code === null) && !staleServer && !incompleteFuture;
    // Unsupported PP/orders may still permit collection of supported federal
    // facts, but can NEVER make the whole course's legal basis current.
    if (claim.unsupported_basis.length || claim.basis.some(row => row.docid !== LAW_116.docid || row.number !== LAW_116.number || row.date !== LAW_116.date)) {
      result.status = 'partial_coverage'; result.error_code = 'UNSUPPORTED_BASIS_ADAPTER';
    } else if (!completeBasis) result.error_code = basisFailure ?? result.basis.find(row => row.error_code)?.error_code ?? (staleServer ? 'OFFICIAL_SERVER_DATE_STALE' : incompleteFuture ? 'FUTURE_NPA_TEXT_NOT_READY' : 'INCOMPLETE_NPA_BASIS');
    if (result.basis.length) result.discovery = await discoverPublications(client, claim.discovery_window, result.basis);
    if (result.status !== 'partial_coverage') {
      if (!result.runtime_egress_verified) result.error_code ??= 'RUNTIME_EGRESS_UNVERIFIED';
      if (!result.discovery?.complete || !result.discovery.relevance_complete) result.error_code ??= result.discovery?.error_code ?? 'DISCOVERY_INCOMPLETE';
      if (!result.error_code && completeBasis && result.question_source && result.runtime_egress_verified && result.discovery?.complete && result.discovery.relevance_complete) result.status = 'complete';
    }
    if (Date.parse(claim.lease_expires_at) <= Date.parse(client.instant())) { result.status = 'unknown'; result.error_code = 'CHECK_LEASE_EXPIRED'; }
  } catch (error) {
    result.status = 'error'; result.error_code = error instanceof ProofError ? error.code : 'WORKER_ERROR';
  } finally {
    // Keep first/final anchors and future/original bodies as raw evidence.
    // Paths are intentionally excluded from the stable legal graph.
    result.additional_artifacts = client?.additionalArtifacts ?? [];
  }
  // SQL, not this adapter or any browser, decides unchanged/review and expiry.
  return result;
}
