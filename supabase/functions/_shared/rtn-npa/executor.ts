import type { NpaCheckClaim, NpaCheckResult, NpaCompletion } from './contracts.ts';
import { runOfficialNpaCheck, type WorkerDependencies } from './worker.ts';
import { readNpaCompletion } from './http-handler.ts';

export interface NpaServiceRpc {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function rpc(service: NpaServiceRpc, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const result = await service.rpc(name, args);
  if (result.error) throw new Error('RTN_NPA_DATABASE_UNAVAILABLE');
  return result.data;
}

/** Server-only durable lease -> actual observations -> exactly ONE completion.
 * The producer gets no browser arguments, role flags, URLs, expiry or verdict.
 */
export function createNpaExecutor(service: NpaServiceRpc, dependencies: (claim: NpaCheckClaim) => WorkerDependencies, observe: (claim: NpaCheckClaim, deps: WorkerDependencies) => Promise<NpaCheckResult> = runOfficialNpaCheck, now: () => number = Date.now) {
  return {
    enqueueDue: () => rpc(service, 'enqueue_due_rtn_npa_checks'),
    async execute(runId: string | null): Promise<NpaCompletion | null> {
      if (runId !== null && !uuid.test(runId)) throw new Error('RTN_NPA_INVALID_RUN');
      const data = await rpc(service, 'claim_rtn_npa_check', { p_run_id: runId });
      if (data === null) return null;
      const claim = data as NpaCheckClaim;
      if (!claim || claim.protocol !== 'rtn-npa-v1' || claim.worker_version !== 'rtn-npa-official-v1' ||
          typeof claim.run_id !== 'string' || !uuid.test(claim.run_id) || typeof claim.lease_token !== 'string' || !uuid.test(claim.lease_token) ||
          (runId !== null && claim.run_id !== runId) || typeof claim.lease_expires_at !== 'string' ||
          !Number.isFinite(Date.parse(claim.lease_expires_at)) || Date.parse(claim.lease_expires_at) <= now()) throw new Error('RTN_NPA_INVALID_SERVER_LEASE');
      const ownedRunId = claim.run_id, ownedLeaseToken = claim.lease_token;
      const observed = await observe(claim, dependencies(claim));
      // A lost DB commit is uncertain. Calling complete(error) again would mask
      // that state and could overwrite/duplicate the first observation.
      const receipt = await rpc(service, 'complete_rtn_npa_check', { p_run_id: ownedRunId, p_lease_token: ownedLeaseToken, p_result: observed });
      const checked = readNpaCompletion(receipt as NpaCompletion | null);
      if (!checked || checked.run_id !== ownedRunId) throw new Error('RTN_NPA_INVALID_COMPLETION_RECEIPT');
      return checked;
    },
  };
}
