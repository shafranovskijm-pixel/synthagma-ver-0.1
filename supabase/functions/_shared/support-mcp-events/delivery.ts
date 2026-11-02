import { secretAad, type SecretCrypto, type SecretEnvelope } from './crypto.ts';
import { CallbackTransportError, canonicalizeCallback, type PinnedHttpsTransport } from './pinned-https.ts';
import { EVENT_BODY_LIMIT, signWebhook } from './webhooks.ts';

export type DeliveryOutcome = 'accepted' | 'retry' | 'gone' | 'too_large' | 'permanent';
export type DeliveryLease = { job_id: string; lease_token: string; fence: number; attempt_no: number; lease_expires_at: string };
export type PreparedDelivery = {
  job_id: string; subscription_id: string; callback_url: string; owner_user_id: string; oauth_client_id: string; event_name: string;
  secret_envelope: SecretEnvelope; previous_secret_envelope: SecretEnvelope | null; previous_valid_until: string | null;
  event: { eventId: string; name: string; timestamp: string; data: Record<string, unknown>; cursor: null };
};
export type DeliveryStore = {
  claim(workerId: string, limit: number, leaseSeconds: number): Promise<DeliveryLease[]>;
  prepare(lease: DeliveryLease): Promise<PreparedDelivery | null>;
  finish(lease: DeliveryLease, outcome: DeliveryOutcome, status: number | null): Promise<boolean>;
};
export type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export class DeliveryWorkerError extends Error {
  readonly code: 'delivery_store_failed' | 'delivery_config_invalid';
  constructor(code: 'delivery_store_failed' | 'delivery_config_invalid') { super(code); this.name = 'DeliveryWorkerError'; this.code = code; }
}
export function createRpcDeliveryStore(client: RpcClient): DeliveryStore {
  async function rpc(name: string, args: Record<string, unknown>) {
    let result: { data: unknown; error: unknown };
    try { result = await client.rpc(name, args); } catch { throw new DeliveryWorkerError('delivery_store_failed'); }
    if (result.error) throw new DeliveryWorkerError('delivery_store_failed'); return result.data;
  }
  function leaseArgs(lease: DeliveryLease) { return { p_job_id: lease.job_id, p_lease_token: lease.lease_token, p_fence: lease.fence }; }
  return {
    async claim(workerId, limit, leaseSeconds) {
      const data = await rpc('sintagma_support_event_claim', { p_worker_id: workerId, p_limit: limit, p_lease_seconds: leaseSeconds });
      if (!Array.isArray(data)) throw new DeliveryWorkerError('delivery_store_failed'); return data as DeliveryLease[];
    },
    async prepare(lease) { return await rpc('sintagma_support_event_prepare_delivery', leaseArgs(lease)) as PreparedDelivery | null; },
    async finish(lease, outcome, status) {
      const data = await rpc('sintagma_support_event_finish_delivery', { ...leaseArgs(lease), p_outcome: outcome, p_http_status: status });
      if (typeof data !== 'boolean') throw new DeliveryWorkerError('delivery_store_failed'); return data;
    },
  };
}
function uuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
function validLease(lease: DeliveryLease): boolean {
  return !!lease && uuid(lease.job_id) && uuid(lease.lease_token) && Number.isSafeInteger(lease.fence) && lease.fence > 0 &&
    Number.isInteger(lease.attempt_no) && lease.attempt_no >= 1 && lease.attempt_no <= 8 && Number.isFinite(Date.parse(lease.lease_expires_at));
}
function serializeEvent(job: PreparedDelivery): Uint8Array {
  const e = job.event;
  if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).sort().join(',') !== 'cursor,data,eventId,name,timestamp' ||
      typeof e.eventId !== 'string' || !/^[A-Za-z0-9_:-]{1,256}$/.test(e.eventId) || e.name !== job.event_name ||
      typeof e.timestamp !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(e.timestamp) || !Number.isFinite(Date.parse(e.timestamp)) ||
      e.cursor !== null || !e.data || typeof e.data !== 'object' || Array.isArray(e.data)) throw new DeliveryWorkerError('delivery_config_invalid');
  const data = e.data;
  if (Object.keys(data).sort().join(',') !== 'message_id,organization_id,source_id,source_kind' || !uuid(data.source_id) ||
      (data.organization_id !== null && !uuid(data.organization_id)) ||
      !((e.name === 'support.platform_chat.message.created' && data.source_kind === 'platform_chat' && uuid(data.message_id)) ||
        (e.name === 'support.problem_report.created' && data.source_kind === 'problem_report' && data.message_id === null))) {
    throw new DeliveryWorkerError('delivery_config_invalid');
  }
  return new TextEncoder().encode(JSON.stringify(e));
}
export function outcomeForStatus(status: number): DeliveryOutcome {
  if (status >= 200 && status < 300) return 'accepted';
  if (status === 410) return 'gone';
  if (status === 413) return 'too_large';
  if ([408, 425, 429].includes(status) || status >= 500 && status <= 599) return 'retry';
  return 'permanent';
}
export type WorkerResult = { claimed: number; accepted: number; retried: number; stopped: number; dead: number; stale: number };
export function createDeliveryWorker(options: { store: DeliveryStore; crypto: SecretCrypto; transport: PinnedHttpsTransport; now?: () => number }) {
  const now = options.now ?? Date.now;
  async function process(lease: DeliveryLease): Promise<DeliveryOutcome | 'stale'> {
    if (!validLease(lease)) throw new DeliveryWorkerError('delivery_store_failed');
    // Expired leases are never used to send; prepare rechecks current authorization.
    if (Date.parse(lease.lease_expires_at) <= now()) return 'stale';
    const job = await options.store.prepare(lease); if (!job) return 'stale';
    let outcome: DeliveryOutcome = 'permanent', status: number | null = null;
    try {
      if (job.job_id !== lease.job_id || typeof job.subscription_id !== 'string' || !/^sub_[a-f0-9]{64}$/.test(job.subscription_id)) throw new DeliveryWorkerError('delivery_config_invalid');
      // The stored canonical URL is part of AES AAD. Never silently rewrite it.
      if (canonicalizeCallback(job.callback_url) !== job.callback_url) throw new DeliveryWorkerError('delivery_config_invalid');
      const body = serializeEvent(job);
      if (body.byteLength > EVENT_BODY_LIMIT) {
        // No HTTP request was sent: NULL is a local validation failure, not a fabricated 413.
        outcome = 'permanent';
      } else if (Date.parse(lease.lease_expires_at) - now() <= 12_000) {
        outcome = 'retry';
      } else {
        const aad = secretAad(job);
        const secret = await options.crypto.decryptSecret(job.secret_envelope, aad);
        const signedAt = now();
        let previousSecret: string | null = null;
        const until = job.previous_valid_until ? Date.parse(job.previous_valid_until) : NaN;
        if (job.previous_secret_envelope && Number.isFinite(until) && until > signedAt && until - signedAt <= 120_000) {
          previousSecret = await options.crypto.decryptSecret(job.previous_secret_envelope, aad);
        }
        const headers = await signWebhook({ eventId: job.event.eventId, subscriptionId: job.subscription_id, body, secret, signedAt,
          previousSecret, previousValidUntil: job.previous_valid_until });
        if (Date.parse(lease.lease_expires_at) - now() <= 10_000) outcome = 'retry';
        else {
          const result = await options.transport.post({ url: job.callback_url, body, headers, responseLimitBytes: 4096 });
          status = result.status; outcome = outcomeForStatus(status);
        }
      }
    } catch (error) {
      if (error instanceof CallbackTransportError) {
        if (error.httpStatus !== undefined) { status = error.httpStatus; outcome = outcomeForStatus(status); }
        else outcome = ['timeout','network_error'].includes(error.reason) ? 'retry' : 'permanent';
      }
      // Crypto, invalid stored metadata and unknown failures stay permanent and redacted.
    }
    return await options.store.finish(lease, outcome, status) ? outcome : 'stale';
  }
  return {
    async runOnce(workerId: string, requestedLimit = 3): Promise<WorkerResult> {
      options.transport.assertReady(); // Fail before claiming jobs on unproven runtimes.
      if (!uuid(workerId)) throw new DeliveryWorkerError('delivery_config_invalid');
      if (!Number.isFinite(requestedLimit)) throw new DeliveryWorkerError('delivery_config_invalid');
      const limit = Math.min(10, Math.max(1, Math.floor(requestedLimit)));
      const leases = await options.store.claim(workerId, limit, 60);
      if (leases.length > limit || leases.some((l) => !validLease(l))) throw new DeliveryWorkerError('delivery_store_failed');
      const result: WorkerResult = { claimed: leases.length, accepted: 0, retried: 0, stopped: 0, dead: 0, stale: 0 };
      // At most three simultaneous requests; all work fits within the 60-second lease.
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(3, leases.length) }, async () => {
        while (next < leases.length) {
          const lease = leases[next++]; const outcome = await process(lease);
          if (outcome === 'accepted') result.accepted++;
          else if (outcome === 'retry') result.retried++;
          else if (outcome === 'gone') result.stopped++;
          else if (outcome === 'stale') result.stale++;
          else result.dead++;
        }
      }));
      return result;
    },
  };
}
