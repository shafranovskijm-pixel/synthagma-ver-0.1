import { SignatureSourceError, verifySignatureSource, type SignatureSourceDependencies } from './worker.ts';

const MAX_REQUEST_BYTES = 16384;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

async function readJson(request: Request, signal: AbortSignal): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d{1,12}$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) {
    throw new SignatureSourceError('INVALID_INPUT');
  }
  if (!request.body) throw new SignatureSourceError('INVALID_INPUT');
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0, completed = false;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw new SignatureSourceError('DEPENDENCY_UNAVAILABLE');
      const next = await reader.read();
      if (signal.aborted) throw new SignatureSourceError('DEPENDENCY_UNAVAILABLE');
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_REQUEST_BYTES) throw new SignatureSourceError('INVALID_INPUT');
      parts.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    completed = true;
    return value;
  } catch (error) {
    if (error instanceof SignatureSourceError) throw error;
    throw new SignatureSourceError('INVALID_INPUT');
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!completed) cancel();
    try { reader.releaseLock(); } catch { /* An aborted stream is being cancelled. */ }
  }
}

/** The factory receives the original captured bearer once. Body fields cannot select an actor. */
export function createSignatureSourceHttpHandler(makeDependencies: (originalJwt: string) => SignatureSourceDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });
    if (request.method !== 'POST') return reply({ version: 1, ok: false, code: 'INVALID_INPUT' }, 405);
    const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') ?? '');
    if (!match || match[1].length > 32768) return reply({ version: 1, ok: false, code: 'ACCESS_DENIED' }, 401);
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    const wholeTimer = setTimeout(abort, 55000);
    let bodyTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(abort, 10000);
    try {
      const input = await readJson(request, controller.signal);
      clearTimeout(bodyTimer); bodyTimer = undefined;
      if (controller.signal.aborted) throw new SignatureSourceError('DEPENDENCY_UNAVAILABLE');
      const result = await verifySignatureSource(input, makeDependencies(match[1]), controller.signal);
      return reply(result, 200);
    } catch (error) {
      const code = error instanceof SignatureSourceError ? error.code : 'DEPENDENCY_UNAVAILABLE';
      const status = code === 'ACCESS_DENIED' ? 401 : code === 'INVALID_INPUT' ? 400
        : code === 'NOT_FOUND' ? 404 : code === 'DEPENDENCY_UNAVAILABLE' ? 503 : 409;
      return reply({ version: 1, ok: false, code }, status);
    } finally {
      if (bodyTimer !== undefined) clearTimeout(bodyTimer);
      clearTimeout(wholeTimer);
      request.signal.removeEventListener('abort', abort);
      controller.abort();
    }
  };
}
