import type { NpaCompletion } from './contracts.ts';

type RpcReply = { data: unknown; error: { code?: string } | null };
export interface GenuineUserClient {
  auth: { getUser(): PromiseLike<{ data: { user: unknown }; error: unknown }> };
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcReply>;
}
type QueueReply = { run_id: string; status: 'queued' | 'running' | 'completed'; queued_at: string };
type Execute = (runId: string | null) => Promise<NpaCompletion | null>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const outcomes = ['unchanged', 'needs_subject_review', 'unknown', 'partial_coverage', 'error'];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200, browser = false) => new Response(JSON.stringify(body), {
  status, headers: { ...(browser ? cors : {}), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function body4096(request: Request, timeoutMs = 5000): Promise<Record<string, unknown>> {
  const declared = request.headers.get('content-length');
  if (!request.body || (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 4096))) throw new Error('body');
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  let canceled = false;
  const cancel = () => { if (!canceled) { canceled = true; void reader.cancel().catch(() => {}); } };
  let rejectStopped: (reason: Error) => void = () => {};
  const stopped = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
  const abort = () => { rejectStopped(new Error('body')); cancel(); };
  const timer = setTimeout(abort, Math.min(Math.max(timeoutMs, 1), 5000));
  request.signal.addEventListener('abort', abort, { once: true });
  try {
    if (request.signal.aborted) throw new Error('body');
    while (true) {
      const part = await Promise.race([reader.read(), stopped]);
      if (part.done) break;
      size += part.value.length;
      if (size > 4096) { cancel(); throw new Error('body'); }
      parts.push(part.value);
    }
  } catch (error) { cancel(); throw error; }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('body');
  return data as Record<string, unknown>;
}
function keysOnly(body: Record<string, unknown>, keys: string[]) {
  return Object.keys(body).every(key => keys.includes(key));
}
function queueReply(value: unknown): QueueReply | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<QueueReply>;
  if (typeof row.run_id !== 'string' || !uuid.test(row.run_id) || !['queued', 'running', 'completed'].includes(row.status || '') ||
      typeof row.queued_at !== 'string' || !Number.isFinite(Date.parse(row.queued_at))) return null;
  return { run_id: row.run_id, status: row.status as QueueReply['status'], queued_at: row.queued_at };
}
export function readNpaCompletion(value: NpaCompletion | null): NpaCompletion | null {
  if (!value || typeof value !== 'object' || typeof value.run_id !== 'string' || !uuid.test(value.run_id) || !outcomes.includes(value.outcome) ||
      (value.receipt_id !== null && (typeof value.receipt_id !== 'string' || !uuid.test(value.receipt_id))) ||
      !Number.isSafeInteger(value.confirmed_findings) || value.confirmed_findings < 0 ||
      !Number.isSafeInteger(value.finding_epoch) || value.finding_epoch < 0 || typeof value.stale_manifest !== 'boolean') return null;
  const expiry = value.valid_until_exclusive;
  const iso = typeof expiry === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(expiry) && Number.isFinite(Date.parse(expiry));
  if (value.outcome === 'unchanged' ? !iso || value.receipt_id === null || value.stale_manifest : expiry !== null) return null;
  return { run_id: value.run_id, receipt_id: value.receipt_id, outcome: value.outcome,
    confirmed_findings: value.confirmed_findings, finding_epoch: value.finding_epoch,
    valid_until_exclusive: expiry, stale_manifest: value.stale_manifest };
}

export function createNpaUserHandler(deps: {
  user(authorization: string): GenuineUserClient;
  execute: Execute;
  // Inject the actual EdgeRuntime.waitUntil only at trusted server composition.
  // No browser capability flag selects background processing or service access.
  waitUntil?: (task: Promise<unknown>) => void;
  onBackgroundError?: () => void;
  bodyTimeoutMs?: number;
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405, true);
    try {
      const authorization = request.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ')) return json({ error: 'RTN_NPA_AUTH_REQUIRED' }, 401, true);
      const user = deps.user(authorization);
      const identity = await user.auth.getUser();
      if (identity.error || !identity.data.user) return json({ error: 'RTN_NPA_AUTH_REQUIRED' }, 401, true);
      let body: Record<string, unknown>;
      try { body = await body4096(request, deps.bodyTimeoutMs); } catch { return json({ error: 'RTN_NPA_INVALID_REQUEST' }, 400, true); }
      const operation = body.operation ?? 'check';
      if (typeof body.bankId !== 'string' || !uuid.test(body.bankId)) return json({ error: 'RTN_NPA_INVALID_REQUEST' }, 400, true);
      let queued: RpcReply;
      if (operation === 'editorial') {
        if (!keysOnly(body, ['operation', 'bankId'])) return json({ error: 'RTN_NPA_INVALID_REQUEST' }, 400, true);
        // The ordinary caller's RPC independently checks actual admin/privacy.
        // Choosing an operation string never establishes the caller's role.
        queued = await user.rpc('request_rtn_npa_editorial_check', { p_bank_id: body.bankId });
      } else if (operation === 'check') {
        if (!keysOnly(body, ['operation', 'organizationId', 'bankId']) || typeof body.organizationId !== 'string' || !uuid.test(body.organizationId)) return json({ error: 'RTN_NPA_INVALID_REQUEST' }, 400, true);
        queued = await user.rpc('request_rtn_npa_check', { p_organization_id: body.organizationId, p_bank_id: body.bankId });
      } else return json({ error: 'RTN_NPA_INVALID_REQUEST' }, 400, true);
      if (queued.error) return json({ error: queued.error.code === '42501' ? 'RTN_NPA_ACCESS_REQUIRED' : 'RTN_NPA_QUEUE_UNAVAILABLE' }, queued.error.code === '42501' ? 403 : 503, true);
      const accepted = queueReply(queued.data);
      if (!accepted) return json({ error: 'RTN_NPA_QUEUE_UNAVAILABLE' }, 503, true);
      if (accepted.status === 'completed') return json(accepted, 200, true);
      // Only the server-created and user-authorized durable run is claimed.
      const task = Promise.resolve().then(() => deps.execute(accepted.run_id));
      if (deps.waitUntil) {
        const observed = task.catch(() => { try { deps.onBackgroundError?.(); } catch { /* logging cannot expose or restart a run */ } });
        try { deps.waitUntil(observed); return json(accepted, 202, true); }
        catch { /* Await the SAME task if this runtime cannot register it. */ }
      }
      await task;
      // Accepted is not checked/unchanged. The UI polls the real durable result.
      return json(accepted, 202, true);
    } catch { return json({ error: 'RTN_NPA_CHECK_UNAVAILABLE' }, 503, true); }
  };
}

export function createNpaScheduledHandler(deps: {
  authenticate(request: Request): Response | null | PromiseLike<Response | null>;
  enqueueDue(): Promise<unknown>;
  execute: Execute;
  bodyTimeoutMs?: number;
}) {
  return async (request: Request): Promise<Response> => {
    let denied: Response | null;
    try { denied = await deps.authenticate(request); }
    catch { return json({ error: 'RTN_NPA_AUTH_UNAVAILABLE' }, 503); }
    if (denied !== null) return denied instanceof Response ? denied : json({ error: 'RTN_NPA_AUTH_UNAVAILABLE' }, 503);
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    let body: Record<string, unknown>;
    try { body = await body4096(request, deps.bodyTimeoutMs); } catch { return json({ error: 'RTN_NPA_INVALID_REQUEST' }, 400); }
    if (!keysOnly(body, ['task']) || Object.keys(body).length !== 1 || body.task !== 'rtn-npa-reconciliation') return json({ error: 'RTN_NPA_INVALID_REQUEST' }, 400);
    try {
      await deps.enqueueDue();
      // Separate hourly job prevents starvation behind question-source jobs.
      const result = await deps.execute(null);
      if (result === null) return json({ status: 'idle' });
      const checked = readNpaCompletion(result);
      if (!checked) return json({ error: 'RTN_NPA_CHECK_UNAVAILABLE' }, 503);
      // A completed check may explicitly be unknown/partial/review-required.
      // Its outcome, never HTTP200 alone, decides whether admission is renewed.
      return json(checked, checked.outcome === 'error' ? 503 : 200);
    } catch { return json({ error: 'RTN_NPA_CHECK_UNAVAILABLE' }, 503); }
  };
}
