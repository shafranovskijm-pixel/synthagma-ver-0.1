import { officialUrl } from './official-source.ts';
import { INTERMEDIATE, ROOT } from './official-tls-bundle.ts';

export type WithOfficialFetch = <T>(action: (fetcher: typeof fetch) => Promise<T>) => Promise<T>;
export type OfficialHttpClient = { close(): void };
type NativeFetchInit = RequestInit & { client: OfficialHttpClient };
type Dependencies = {
  fetcher(input: string, init: NativeFetchInit): Promise<Response>;
  createHttpClient?: (options: { caCerts: string[] }) => OfficialHttpClient;
  now?: () => number;
};
const fail = (code: string): never => { throw new Error(code); };

function derBytes(pem: string): Uint8Array {
  if (typeof pem !== 'string' || pem.length > 8192) return fail('RTN_TLS_CERTIFICATE_INVALID');
  const match = /^-----BEGIN CERTIFICATE-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END CERTIFICATE-----\s*$/.exec(pem);
  if (!match) return fail('RTN_TLS_CERTIFICATE_INVALID');
  const text = match[1].replace(/[\r\n]/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) return fail('RTN_TLS_CERTIFICATE_INVALID');
  let decoded: string;
  try { decoded = atob(text); } catch { return fail('RTN_TLS_CERTIFICATE_INVALID'); }
  if (decoded.length < 256 || decoded.length > 4096) return fail('RTN_TLS_CERTIFICATE_INVALID');
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}

/** Metadata is trusted only after BOTH byte pins match. No runtime ASN.1 parser,
 * AIA retrieval, certificate auto-rotation or trust-on-first-use is performed. */
export async function verifyOfficialTlsBundle(now: () => number, pems = { intermediate: INTERMEDIATE.pem, root: ROOT.pem }): Promise<void> {
  for (const [pem, expected] of [[pems.intermediate, INTERMEDIATE.derSha256], [pems.root, ROOT.derSha256]]) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', derBytes(pem)));
    if (Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('') !== expected) fail('RTN_TLS_CERTIFICATE_PIN_MISMATCH');
  }
  let time: number;
  try { time = now(); } catch { return fail('RTN_TLS_CLOCK_INVALID'); }
  if (typeof time !== 'number' || !Number.isFinite(time) || !Number.isFinite(new Date(time).getTime())) fail('RTN_TLS_CLOCK_INVALID');
  // Conservative exclusive notAfter; fixed UTC windows belong to these pins.
  for (const cert of [ROOT, INTERMEDIATE]) {
    const before = Date.parse(cert.notBefore), after = Date.parse(cert.notAfter);
    if (!Number.isFinite(before) || !Number.isFinite(after) || before >= after) fail('RTN_TLS_CERTIFICATE_INVALID');
    if (time < before || time >= after) fail('RTN_TLS_CERTIFICATE_OUTSIDE_VALIDITY');
  }
}

/** Only RTN public www.gosnadzor.ru GETs receive this additional ICA anchor.
 * SDK auth/RPC/storage and every other host keep their original transports.
 * The action owns the WHOLE check, including body/storage/one DB completion. */
export function createWithOfficialFetch(deps: Dependencies): WithOfficialFetch {
  return async action => {
    let client: OfficialHttpClient | undefined;
    let closed = false;
    const scopedFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
      if (closed) return fail('RTN_TLS_SCOPE_CLOSED');
      if (typeof input !== 'string' && !(input instanceof URL)) return fail('UNTRUSTED_OFFICIAL_URL');
      // Capture once, before any asynchronous validation or client construction.
      const href = officialUrl(String(input)).href;
      if (new URL(href).hostname !== 'www.gosnadzor.ru') return fail('RTN_TLS_HOST_UNSUPPORTED');
      if ((init.method !== undefined && init.method !== 'GET') || init.body != null
        || init.redirect !== 'manual' || (init.credentials !== undefined && init.credentials !== 'omit')
        || Object.keys(init).some(key => !['method', 'body', 'redirect', 'signal', 'headers', 'credentials'].includes(key))) return fail('RTN_TLS_REQUEST_UNSUPPORTED');
      const headers = new Headers(init.headers);
      if ([...headers.keys()].some(key => key !== 'accept')) return fail('RTN_TLS_REQUEST_UNSUPPORTED');
      const signal = init.signal;
      signal?.throwIfAborted();
      await verifyOfficialTlsBundle(deps.now || Date.now);
      if (closed) return fail('RTN_TLS_SCOPE_CLOSED');
      signal?.throwIfAborted();
      if (!client) {
        if (!deps.createHttpClient) return fail('RTN_TLS_CLIENT_UNAVAILABLE');
        try { client = deps.createHttpClient({ caCerts: [INTERMEDIATE.pem] }); }
        catch (cause) { throw new Error('RTN_TLS_CLIENT_CREATION_FAILED', { cause }); }
        if (!client || typeof client.close !== 'function') return fail('RTN_TLS_CLIENT_UNAVAILABLE');
      }
      // Normal Deno peer hostname/signature/time validation remains enabled.
      // No ignoreCertificateErrors, alternative proxy or insecure retry exists.
      return await deps.fetcher(href, { method: 'GET', redirect: 'manual', credentials: 'omit', headers, signal, client });
    }) as typeof fetch;
    try { return await action(scopedFetch); }
    finally {
      closed = true;
      // A close failure cannot replace a successful/uncertain DB completion.
      try { client?.close(); } catch { /* No retry, raw exception or second completion. */ }
    }
  };
}
