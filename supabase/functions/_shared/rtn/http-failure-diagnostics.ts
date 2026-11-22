/** Evidence from an already received non-200 response. This module never fetches. */
export type HttpFailureMarker = 'captcha' | 'access_denied' | 'geo_denied' | 'rate_limited' | 'authentication_required';
export type HttpFailureDiagnostic = Readonly<{
  schema: 'rtn-http-failure-v2';
  http_status: number;
  cause_family: 'http_response';
  mime_family: 'html' | 'plain' | 'json' | 'xml' | 'other' | 'missing';
  server_family: 'nginx' | 'apache' | 'cloudflare' | 'envoy' | 'other' | 'missing';
  sample_bytes: number;
  sample_complete: boolean;
  sample_sha256: string | null;
  sample_state: 'complete' | 'capped' | 'timeout' | 'aborted' | 'read_error' | 'no_body';
  markers: readonly HttpFailureMarker[];
}>;

const SAMPLE_BYTES = 2048;
const BUDGET_MS = 250;
const evidence = new WeakMap<Error, HttpFailureDiagnostic>();

function header(response: Response, name: string): string {
  try { return (response.headers.get(name) || '').slice(0, 256).toLowerCase(); }
  catch { return ''; }
}
function mimeFamily(response: Response): HttpFailureDiagnostic['mime_family'] {
  const value = header(response, 'content-type');
  if (!value) return 'missing';
  if (/^text\/html(?:\s*;|$)|^application\/xhtml\+xml(?:\s*;|$)/.test(value)) return 'html';
  if (/^text\/plain(?:\s*;|$)/.test(value)) return 'plain';
  if (/^(?:application|text)\/(?:[a-z0-9.-]+\+)?json(?:\s*;|$)/.test(value)) return 'json';
  if (/^(?:application|text)\/(?:[a-z0-9.-]+\+)?xml(?:\s*;|$)/.test(value)) return 'xml';
  return 'other';
}
function serverFamily(response: Response): HttpFailureDiagnostic['server_family'] {
  const value = header(response, 'server');
  if (!value) return 'missing';
  for (const family of ['nginx', 'apache', 'cloudflare', 'envoy'] as const) {
    if (new RegExp(`(?:^|[ /])${family}(?:$|[ /])`).test(value)) return family;
  }
  return 'other';
}
function markers(prefix: Uint8Array): HttpFailureMarker[] {
  // These literal phrases describe only the bounded prefix, not the reason a
  // publisher rejected the request. Missing markers do not prove no WAF exists.
  const text = new TextDecoder('utf-8').decode(prefix), found: HttpFailureMarker[] = [];
  if (/captcha|verify you are human/i.test(text)) found.push('captcha');
  if (/access denied|forbidden|доступ запрещ[её]н/iu.test(text)) found.push('access_denied');
  if (/country restricted|country is restricted|country is blocked|region restricted|region is restricted|region is blocked|access from your country is denied|access from your region is denied|not available in your country|not available in your region|доступ из вашей страны ограничен|доступ из вашего региона ограничен|доступ из вашей страны запрещ[её]н|доступ из вашего региона запрещ[её]н/iu.test(text)) found.push('geo_denied');
  if (/too many requests|rate limit/i.test(text)) found.push('rate_limited');
  if (/authentication required|login required/i.test(text)) found.push('authentication_required');
  return found;
}
function frozen(value: Omit<HttpFailureDiagnostic, 'markers'> & { markers: readonly HttpFailureMarker[] }): HttpFailureDiagnostic {
  return Object.freeze({ ...value, markers: Object.freeze([...value.markers]) });
}
function cancel(body: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array>): void {
  // A hostile or stalled cancellation hook must never extend the HTTP error.
  try { void body.cancel().catch(() => undefined); } catch { /* best effort */ }
}
function release(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try { reader.releaseLock(); } catch { /* a pending read releases on settlement */ }
}

/** Only errors minted here carry evidence; properties copied onto other errors do not. */
export function httpFailureDiagnostic(error: unknown): HttpFailureDiagnostic | undefined {
  return error !== null && typeof error === 'object' ? evidence.get(error as Error) : undefined;
}

/** Preserve the old Error.message even if sampling, hashing or logging fails. */
export async function createHttpFailureError(response: Response, message: string, signal?: AbortSignal): Promise<Error> {
  const error = new Error(message);
  let body: ReadableStream<Uint8Array> | null = null;
  try {
    const status = response.status;
    if (!Number.isInteger(status) || status < 100 || status > 599 || status === 200) return error;
    const base = frozen({
      schema: 'rtn-http-failure-v2', http_status: status, cause_family: 'http_response',
      mime_family: mimeFamily(response), server_family: serverFamily(response), sample_bytes: 0,
      sample_complete: false, sample_sha256: null,
      sample_state: 'read_error', markers: [],
    });
    // Bind the known response before any await. Diagnostic failure can only leave
    // this safe base summary; it cannot turn a known403 into a timeout or success.
    evidence.set(error, base);
    body = response.body;
    if (!body || signal?.aborted) {
      evidence.set(error, frozen({ ...base, sample_state: !body ? 'no_body' : 'aborted' }));
      if (body) cancel(body); return error;
    }

    const deadline = performance.now() + BUDGET_MS;
    let reader: ReadableStreamDefaultReader<Uint8Array>;
    try { reader = body.getReader(); } catch { cancel(body); return error; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    let stopReason: 'timeout' | 'aborted' | undefined;
    let stop!: () => void;
    const stopped = new Promise<void>(resolve => { stop = resolve; });
    const terminate = (reason: 'timeout' | 'aborted') => {
      if (!stopReason) { stopReason = reason; stop(); }
    };
    const isStopped = () => {
      if (signal?.aborted) terminate('aborted');
      else if (performance.now() >= deadline) terminate('timeout');
      return stopReason !== undefined;
    };
    const prefix = new Uint8Array(SAMPLE_BYTES);
    let size = 0, complete = false;
    let state: HttpFailureDiagnostic['sample_state'] = 'read_error';
    try {
      timer = setTimeout(() => terminate('timeout'), Math.max(0, deadline - performance.now()));
      onAbort = () => terminate('aborted');
      signal?.addEventListener('abort', onAbort, { once: true });
      const reading = (async () => {
        try {
          while (!isStopped()) {
            const part = await reader.read();
            if (isStopped()) break;
            if (part.done) { complete = true; state = 'complete'; return; }
            if (!(part.value instanceof Uint8Array)) { state = 'read_error'; return; }
            const remaining = SAMPLE_BYTES - size, take = Math.min(remaining, part.value.byteLength);
            // Never copy an oversized upstream chunk; retain only the remaining prefix.
            prefix.set(part.value.subarray(0, take), size); size += take;
            if (size === SAMPLE_BYTES) { state = 'capped'; return; }
          }
          state = stopReason || 'read_error';
        } catch { state = stopReason || 'read_error'; }
        finally { if (!complete) cancel(reader); release(reader); }
      })();
      // Both race inputs observe rejection. A pending read may settle after our
      // deadline; it cannot modify the prefix once stopReason is set.
      await Promise.race([reading, stopped]);
      if (stopReason) state = stopReason;
      if (!complete) cancel(reader);
      release(reader);

      let digest: string | null = null;
      if (size && !isStopped()) {
        try {
          const hashing = crypto.subtle.digest('SHA-256', prefix.subarray(0, size));
          const hashed = await Promise.race([hashing, stopped.then(() => null)]);
          if (hashed && !isStopped()) digest = [...new Uint8Array(hashed)].map(b => b.toString(16).padStart(2, '0')).join('');
        } catch { /* Hash failure is only missing diagnostic evidence. */ }
      }
      if (stopReason) state = stopReason;
      let observed: HttpFailureMarker[] = [];
      try { observed = markers(prefix.subarray(0, size)); } catch { /* no text leaves this helper */ }
      evidence.set(error, frozen({ ...base, sample_bytes: size, sample_complete: complete, sample_sha256: digest, sample_state: state, markers: observed }));
    } catch { /* Keep the bound base and the original HTTP error. */ }
    finally {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      if (!complete) cancel(reader);
      release(reader);
    }
    return error;
  } catch { if (body) cancel(body); return error; }
}
