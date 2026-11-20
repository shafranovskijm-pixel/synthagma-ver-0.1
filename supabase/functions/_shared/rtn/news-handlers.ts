import { executeRtnNewsCheck, newsRpc, readRtnNewsClaim, type NewsRpcClient, type NewsWorkerClient, type RtnNewsClaim } from './news-worker.ts';
import type { WithRtnNewsFetch } from './news-http-client.ts';

type UserClient = NewsRpcClient & { auth: { getUser(): PromiseLike<{ data: { user: unknown }; error: unknown }> } };
export type NewsWorkContext = {
  service: NewsWorkerClient;
  forRssClaim(claim: RtnNewsClaim): WithRtnNewsFetch;
  reconcileArchive?: () => Promise<{ status: string; stop_reason: string | null }>;
};
type Common = { createWork(deadlineAt: number, signal: AbortSignal): NewsWorkContext; now?: () => number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (value: unknown, status = 200, manual = false) => new Response(JSON.stringify(value), {
  status, headers: { ...(manual ? cors : {}), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function within<T>(pending: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const stop = () => { if (!done) { done = true;signal.removeEventListener('abort', stop);reject(new Error('RTN_NEWS_WORK_DEADLINE')); } };
    signal.addEventListener('abort', stop, { once: true });if (signal.aborted) stop();
    Promise.resolve(pending).then(value => { if (!done) { done = true;signal.removeEventListener('abort', stop);resolve(value); } }, error => { if (!done) { done = true;signal.removeEventListener('abort', stop);reject(error); } });
  });
}
const archiveStatuses = new Set(['idle','paused','yielded','observed_boundary','observed_end','needs_review','error']);
const archiveReasons = new Set(['archive_disabled','publisher_blocked','publisher_unverified','rss_priority','retry_wait','needs_review','budget_exhausted','invocation_elapsed','calendar_cap','request_cap','byte_cap','page_cap','candidate_cap','moving_pagination','candidate_conflict','anchor_boundary','listing_end','lease_exhausted','later_gap','source_error','archive_unavailable','local_deadline']);
async function archiveSummary(work: NewsWorkContext, signal: AbortSignal) {
  if (!work.reconcileArchive) return undefined;
  try {
    const value = await within(work.reconcileArchive(), signal);
    if (!value || !archiveStatuses.has(value.status) || value.stop_reason !== null && !archiveReasons.has(value.stop_reason)) throw new Error('invalid archive state');
    return { status: value.status, stop_reason: value.stop_reason };
  } catch { return { status: 'error', stop_reason: 'archive_unavailable' }; }
}

async function readObject(request: Request): Promise<Record<string, unknown>> {
  const declared = request.headers.get('content-length');
  if (!request.body || (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 1024))) throw new Error('invalid body');
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let size = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => undefined); reject(new Error('body timeout')); }, 5000); });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024) { void reader.cancel().catch(() => undefined); throw new Error('body too large'); }
      parts.push(part.value);
    }
  } finally { clearTimeout(timer); try { reader.releaseLock(); } catch { /* Cancellation can settle later. */ } }
  const bytes = new Uint8Array(size);let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.length; }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid object');
  return value;
}

export function createRtnNewsManualHandler(deps: Common & { user(authorization: string, deadlineAt: number, signal: AbortSignal): UserClient }) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'RTN_NEWS_USE_POST' }, 405, true);
    const deadlineAt = (deps.now || Date.now)() + 90_000;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const authorization = request.headers.get('authorization');
      if (!authorization || !/^Bearer [^\s,]+$/.test(authorization)) return json({ error: 'RTN_NEWS_AUTH_REQUIRED' }, 401, true);
      const user = deps.user(authorization, deadlineAt, controller.signal), auth = await within(user.auth.getUser(), controller.signal);
      if (auth.error || !auth.data.user) return json({ error: 'RTN_NEWS_AUTH_REQUIRED' }, 401, true);
      let body: Record<string, unknown>;
      try { body = await readObject(request); } catch { return json({ error: 'RTN_NEWS_INVALID_REQUEST' }, 400, true); }
      if (Object.keys(body).length !== 1 || typeof body.organizationId !== 'string' || !uuid.test(body.organizationId)) return json({ error: 'RTN_NEWS_INVALID_REQUEST' }, 400, true);
      const queued = await within(user.rpc('request_rtn_news_check', { p_organization_id: body.organizationId }), controller.signal);
      if (queued.error) return json({ error: queued.error.code === '42501' ? 'RTN_NEWS_ACCESS_REQUIRED' : 'RTN_NEWS_QUEUE_UNAVAILABLE' }, queued.error.code === '42501' ? 403 : 503, true);
      const run = queued.data as { run_id?: string; status?: string } | null;
      if (!run || typeof run.run_id !== 'string' || !uuid.test(run.run_id) || !['queued','running','changed','unchanged','error'].includes(run.status || '')) return json({ error: 'RTN_NEWS_QUEUE_UNAVAILABLE' }, 503, true);
      if (['changed','unchanged','error'].includes(run.status!)) return json(run, 200, true);
      // This ID came only from the genuine scoped RPC, never an HTTP selector.
      const work = deps.createWork(deadlineAt, controller.signal);
      const claim = readRtnNewsClaim(await within(newsRpc(work.service, 'claim_rtn_news_check_v2', { p_run_id: run.run_id }), controller.signal));
      if (!claim) return json({ run_id: run.run_id, status: run.status }, 202, true);
      if (claim.run_id !== run.run_id) return json({ error: 'RTN_NEWS_CLAIM_INVALID' }, 503, true);
      const result = await within(executeRtnNewsCheck(work.service, claim, work.forRssClaim(claim)), controller.signal);
      return json(result, result.status === 'error' ? 503 : 200, true);
    } catch { return json({ error: 'RTN_NEWS_CHECK_UNAVAILABLE' }, 503, true); }
    finally { clearTimeout(timer); controller.abort(); }
  };
}

export function createRtnNewsScheduledHandler(deps: Common & { authenticate(request: Request): Response | null | PromiseLike<Response | null> }) {
  return async (request: Request): Promise<Response> => {
    const deadlineAt = (deps.now || Date.now)() + 115_000;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 115_000);
    try {
    let denied: Response | null;
    try { denied = await within(Promise.resolve(deps.authenticate(request)), controller.signal); } catch { return json({ error: 'RTN_NEWS_AUTH_UNAVAILABLE' }, 503); }
    if (denied !== null) return denied instanceof Response ? denied : json({ error: 'RTN_NEWS_AUTH_UNAVAILABLE' }, 503);
    if (request.method !== 'POST') return json({ error: 'RTN_NEWS_USE_POST' }, 405);
    let body: Record<string, unknown>;
    try { body = await readObject(request); } catch { return json({ error: 'RTN_NEWS_INVALID_REQUEST' }, 400); }
    if (Object.keys(body).length !== 1 || body.task !== 'rtn-news-reconciliation') return json({ error: 'RTN_NEWS_INVALID_REQUEST' }, 400);
    try {
      const work = deps.createWork(deadlineAt, controller.signal);
      const projection = await within(newsRpc(work.service, 'project_rtn_update_intents', { p_limit: 25 }), controller.signal);
      await within(newsRpc(work.service, 'enqueue_due_rtn_news_check'), controller.signal);
      const claim = readRtnNewsClaim(await within(newsRpc(work.service, 'claim_rtn_news_check_v2', { p_run_id: null }), controller.signal));
      if (!claim) {
        const archive = await archiveSummary(work, controller.signal);
        return json({ status: 'idle', projection, ...(archive ? { archive } : {}) });
      }
      const result = await within(executeRtnNewsCheck(work.service, claim, work.forRssClaim(claim)), controller.signal);
      if (result.status === 'error') return json({ ...result, projection }, 503);
      // A due RSS lease is the usual hourly path, so archive cannot be idle-only.
      // Its failure stays a separate channel and cannot relabel committed RSS.
      const archive = await archiveSummary(work, controller.signal);
      return json({ ...result, projection, ...(archive ? { archive } : {}) });
    } catch { return json({ error: 'RTN_NEWS_CHECK_UNAVAILABLE' }, 503); }
    } finally { clearTimeout(timer); controller.abort(); }
  };
}
