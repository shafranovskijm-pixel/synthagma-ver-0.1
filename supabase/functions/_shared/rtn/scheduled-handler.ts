import { executeCheck, rpcValue, type CheckClaim, type Normalizer, type WorkerClient } from './check-worker.ts';

type Dependencies = {
  service: WorkerClient;
  // The runtime injects the provider-generated opaque-token helper unchanged.
  // This handler cannot construct a user client or accept an administrator op.
  authenticate(request: Request): Response | null | PromiseLike<Response | null>;
  normalize: Normalizer;
  fetcher?: typeof fetch;
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function readTask(request: Request): Promise<boolean> {
  const limit = 4096, declared = request.headers.get('content-length');
  if (!request.body || (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit))) return false;
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > limit) { await reader.cancel(); return false; }
      parts.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 1 && value.task === 'rtn-source-reconciliation';
}

export function createRtnScheduledHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    let denied: Response | null;
    try { denied = await deps.authenticate(request); }
    catch { return json({ error: 'RTN_AUTH_UNAVAILABLE' }, 503); }
    if (denied !== null) return denied instanceof Response ? denied : json({ error: 'RTN_AUTH_UNAVAILABLE' }, 503);
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    try { if (!await readTask(request)) return json({ error: 'RTN_INVALID_REQUEST' }, 400); }
    catch { return json({ error: 'RTN_INVALID_REQUEST' }, 400); }
    try {
      await rpcValue(deps.service, 'enqueue_due_rtn_checks');
      // No caller-selected run, source, URL, operation or normalization payload.
      // One durable lease per tick keeps work bounded and crash-recoverable.
      const claim = await rpcValue<CheckClaim | null>(deps.service, 'claim_rtn_check', { p_run_id: null });
      if (!claim) return json({ status: 'idle' });
      const result = await executeCheck(deps.service, claim, deps.normalize, deps.fetcher);
      if (!result || !['changed', 'unchanged', 'error'].includes(result.status)) return json({ error: 'RTN_CHECK_UNAVAILABLE' }, 503);
      return json(result, result.status === 'error' ? 503 : 200);
    } catch {
      // A failed lease/DB commit remains a failure. Never call complete(error)
      // a second time or declare a check successful after a lost completion.
      return json({ error: 'RTN_CHECK_UNAVAILABLE' }, 503);
    }
  };
}
