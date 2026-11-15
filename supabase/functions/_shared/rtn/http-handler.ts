import { executeCheck, rpcValue, type CheckClaim, type Normalizer, type WorkerClient } from './check-worker.ts';
import { INITIAL_RTN_SOURCES } from './source-catalog.ts';

type UserClient = Pick<WorkerClient, 'rpc'> & { auth: { getUser(): PromiseLike<{ data: { user: unknown }; error: unknown }> } };
type Dependencies = { service: WorkerClient; user(authorization: string): UserClient; normalize: Normalizer; fetcher?: typeof fetch };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const limit = 2_000_000;
  if (!request.body || Number(request.headers.get('content-length') || 0) > limit) throw new Error('body');
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > limit) { await reader.cancel(); throw new Error('body'); }
      parts.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let cursor = 0;
  for (const part of parts) { bytes.set(part, cursor); cursor += part.length; }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body');
  return body;
}

export function createRtnHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    try {
      // This entrypoint is exclusively a genuine user session. Managed cron
      // has a separate authenticated entrypoint and never reaches user/admin RPCs.
      const service = deps.service, authorization = request.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ')) return json({ error: 'RTN_AUTH_REQUIRED' }, 401);
      const user = deps.user(authorization);
      const { data: auth, error: authError } = await user.auth.getUser();
      if (authError || !auth.user) return json({ error: 'RTN_AUTH_REQUIRED' }, 401);
      let body: Record<string, unknown>;
      try { body = await readBody(request); } catch { return json({ error: 'RTN_INVALID_REQUEST' }, 400); }
      if (body.operation !== undefined) {
        if (!['bootstrap', 'normalize'].includes(String(body.operation))) return json({ error: 'RTN_INVALID_REQUEST' }, 400);
        // The real user's admin/privacy check precedes every narrow service mutation.
        const admin = await user.rpc('get_rtn_editorial_workspace');
        if (admin.error) return json({ error: 'RTN_ADMIN_REQUIRED' }, 403);
        if (body.operation === 'bootstrap') {
          const sources = [];
          for (const source of INITIAL_RTN_SOURCES) sources.push(await rpcValue(service, 'register_rtn_source', { p_source: source }));
          const queued = await rpcValue(service, 'enqueue_due_rtn_checks');
          return json({ sources, queued });
        }
        if (typeof body.sourceRevisionId !== 'string' || !uuid.test(body.sourceRevisionId) || !Array.isArray(body.normalizedBanks) || !body.normalizedBanks.length) return json({ error: 'RTN_INVALID_REQUEST' }, 400);
        const args: Record<string, unknown> = { p_source_revision_id: body.sourceRevisionId, p_normalized_banks: body.normalizedBanks };
        if (body.previousRevisionIds !== undefined || body.correctionNote !== undefined) {
          if (!body.previousRevisionIds || typeof body.previousRevisionIds !== 'object' || Array.isArray(body.previousRevisionIds)
            || !Object.values(body.previousRevisionIds).every(value => typeof value === 'string' && uuid.test(value))
            || typeof body.correctionNote !== 'string' || body.correctionNote.trim().length < 10) return json({ error: 'RTN_INVALID_REQUEST' }, 400);
          args.p_previous_revision_ids = body.previousRevisionIds; args.p_correction_note = body.correctionNote;
        }
        return json(await rpcValue(service, 'normalize_rtn_revision', args));
      }
      if (JSON.stringify(body).length > 4096 || typeof body.organizationId !== 'string' || typeof body.sourceId !== 'string' || !uuid.test(body.organizationId) || !uuid.test(body.sourceId)) return json({ error: 'RTN_INVALID_REQUEST' }, 400);
      const { data, error } = await user.rpc('request_rtn_source_check', { p_organization_id: body.organizationId, p_source_id: body.sourceId });
      if (error) return json({ error: error.code === '42501' ? 'RTN_ACCESS_REQUIRED' : 'RTN_QUEUE_UNAVAILABLE' }, error.code === '42501' ? 403 : 503);
      const queued = data as { run_id?: string; status?: string } | null;
      if (!queued?.run_id || !uuid.test(queued.run_id)) return json({ error: 'RTN_QUEUE_UNAVAILABLE' }, 503);
      if (['changed', 'unchanged', 'error'].includes(queued.status || '')) return json(queued);
      const runId = queued.run_id;
      // One bounded source per invocation; the durable queue drains on later cron
      // ticks. A terminated invocation never silently becomes a successful check.
      const claim = await rpcValue<CheckClaim | null>(service, 'claim_rtn_check', { p_run_id: runId });
      if (!claim) return json({ run_id: runId, status: 'queued' });
      return json(await executeCheck(service, claim, deps.normalize, deps.fetcher));
    } catch { return json({ error: 'RTN_CHECK_UNAVAILABLE' }, 503); }
  };
}
