/** HTTPS POST with no default-fetch fallback and no reusable sockets. */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { checkServerIdentity, type PeerCertificate } from 'node:tls';
import type { ClientRequest, IncomingMessage } from 'node:http';

export type TransportReason = 'invalid_callback' | 'destination_not_public' | 'dns_failed' | 'network_error' | 'tls_failed' | 'timeout' | 'redirect_blocked' | 'response_too_large' | 'payload_too_large' | 'runtime_not_proven' | 'pinning_failed';
export class CallbackTransportError extends Error {
  readonly reason: TransportReason; readonly httpStatus?: number;
  constructor(reason: TransportReason, httpStatus?: number) {
    super(reason); this.name = 'CallbackTransportError'; this.reason = reason;
    if (httpStatus !== undefined) this.httpStatus = httpStatus;
  }
}
export type ResolvedAddress = { address: string; family: 4 | 6 };
export type PostInput = { url: string; body: Uint8Array; headers: Record<string, string>; responseLimitBytes?: number; signal?: AbortSignal };
export type PostResult = { status: number; body: Uint8Array };
export type PinnedHttpsTransport = { assertReady(): void; post(input: PostInput): Promise<PostResult>; probeRuntime?(): Promise<{ status: number }> };
// Source candidate only: Node tests do not prove Supabase Edge's lookup/TLS behavior.
// Enable only in a new reviewed revision after an actual Edge compatibility pilot.
export const DENO_NODE_HTTPS_PINNING_PROVEN = false;
export const PINNING_PROBE_URL = 'https://developers.openai.com/plugins/build/mcp-events';

export function canonicalizeCallback(raw: string): string {
  if (typeof raw !== 'string' || raw.length > 4096 || /[\s\u0000-\u001f\u007f#\\]/.test(raw)) throw new CallbackTransportError('invalid_callback');
  let u: URL; try { u = new URL(raw); } catch { throw new CallbackTransportError('invalid_callback'); }
  const host = u.hostname.toLowerCase();
  // IP literals and single-label/internal names are deliberately unsupported.
  if (u.protocol !== 'https:' || (u.port !== '' && u.port !== '443') || u.username || u.password ||
      host.length > 253 || host.endsWith('.') || host.startsWith('[') || isIP(host) || !host.includes('.') ||
      !host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid|example)$/.test(host)) throw new CallbackTransportError('invalid_callback');
  return u.href;
}
function ipv4Number(ip: string): number | null {
  if (isIP(ip) !== 4) return null;
  return ip.split('.').reduce((n, x) => n * 256 + Number(x), 0);
}
function inV4(ip: number, base: string, bits: number): boolean {
  const n = ipv4Number(base)!; const width = 2 ** (32 - bits);
  return Math.floor(ip / width) === Math.floor(n / width);
}
function ipv6Words(ip: string): number[] | null {
  if (isIP(ip) !== 6 || ip.includes('.') || ip.includes('%')) return null;
  const pieces = ip.split('::'); if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(':').map((x) => parseInt(x, 16)) : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(':').map((x) => parseInt(x, 16)) : [];
  return pieces.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right] : left;
}
export function isPublicAddress(ip: string): boolean {
  const v4 = ipv4Number(ip);
  if (v4 !== null) {
    const denied: [string, number][] = [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]];
    return !denied.some(([base,bits]) => inV4(v4,base,bits));
  }
  const w = ipv6Words(ip); if (!w || w.length !== 8) return false;
  // Only global unicast 2000::/3; exclude special-use 2001::/23,
  // documentation 2001:db8::/32 and 3fff::/20, and all 6to4 2002::/16.
  return (w[0] & 0xe000) === 0x2000 && !(w[0] === 0x2001 && w[1] < 0x0200) &&
    !(w[0] === 0x2001 && w[1] === 0x0db8) && w[0] !== 0x2002 && !(w[0] === 0x3fff && w[1] < 0x1000);
}
function sameAddress(a: string, b: string): boolean {
  if (isIP(a) !== isIP(b)) return false;
  if (isIP(a) === 4) return ipv4Number(a) === ipv4Number(b);
  return JSON.stringify(ipv6Words(a)) === JSON.stringify(ipv6Words(b));
}
export type TransportDependencies = {
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  request?: typeof httpsRequest;
  identityCheck?: (hostname: string, cert: PeerCertificate) => Error | undefined;
  timeoutMs?: number;
};
export function createPinnedHttpsTransport(deps: TransportDependencies = {}): PinnedHttpsTransport {
  const resolve = deps.resolve ?? ((hostname) => lookup(hostname, { all: true, verbatim: true }) as Promise<ResolvedAddress[]>);
  const request = deps.request ?? httpsRequest;
  const identityCheck = deps.identityCheck ?? checkServerIdentity;
  const timeoutMs = Math.min(10_000, Math.max(1, deps.timeoutMs ?? 10_000));
  function assertReady() {
    if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined' && !DENO_NODE_HTTPS_PINNING_PROVEN) throw new CallbackTransportError('runtime_not_proven');
  }
  async function send(input: PostInput, probe: boolean): Promise<PostResult> {
      if (!probe) assertReady();
      const u = new URL(canonicalizeCallback(input.url));
      if (!(input.body instanceof Uint8Array) || input.body.byteLength > 262144) throw new CallbackTransportError('payload_too_large');
      const body = Uint8Array.from(input.body);
      const requestedLimit = input.responseLimitBytes ?? 4096;
      if (!Number.isFinite(requestedLimit)) throw new CallbackTransportError('invalid_callback');
      const limit = Math.min(262144, Math.max(0, Math.floor(requestedLimit)));
      const headers = { ...input.headers, 'Content-Length': String(body.byteLength), 'Connection': 'close' };
      if (Object.entries(headers).some(([k,v]) => /[\r\n]/.test(k + v))) throw new CallbackTransportError('invalid_callback');
      return await new Promise<PostResult>((resolveResult, reject) => {
        let done = false, req: ClientRequest | undefined, response: IncomingMessage | undefined;
        let status: number | undefined;
        const clear = () => { clearTimeout(timer); input.signal?.removeEventListener('abort', onAbort); };
        const fail = (reason: TransportReason, httpStatus = status) => {
          if (done) return; done = true; clear(); req?.destroy(); response?.destroy();
          reject(new CallbackTransportError(reason, httpStatus));
        };
        const onAbort = () => fail('timeout');
        const timer = setTimeout(onAbort, timeoutMs);
        input.signal?.addEventListener('abort', onAbort, { once: true });
        if (input.signal?.aborted) { onAbort(); return; }
        void (async () => {
          let addresses: ResolvedAddress[];
          try { addresses = await resolve(u.hostname); }
          catch (error) {
            const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
            fail(['EAI_AGAIN','ETIMEOUT','ETIMEDOUT'].includes(code) ? 'network_error' : 'dns_failed'); return;
          }
          if (done) return;
          if (!Array.isArray(addresses) || addresses.length === 0 || addresses.length > 64 ||
              addresses.some((x) => !x || isIP(x.address) !== x.family || !isPublicAddress(x.address))) { fail('destination_not_public'); return; }
          const pinned = addresses[0]; let lookupObserved = false, identityVerified = false, sent = false;
          const options: RequestOptions & { autoSelectFamily: boolean } = {
            protocol: 'https:', hostname: u.hostname, port: 443, path: u.pathname + u.search, method: probe ? 'HEAD' : 'POST', headers,
            agent: false, family: pinned.family, autoSelectFamily: false,
            servername: u.hostname, rejectUnauthorized: true, maxHeaderSize: 16384,
            lookup: ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
              if (hostname !== u.hostname || done) { callback(new Error('pinning_failed')); return; }
              lookupObserved = true;
              if (options?.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
              else callback(null, pinned.address, pinned.family);
            }) as RequestOptions['lookup'],
            checkServerIdentity: (_hostname, cert) => {
              const failure = identityCheck(u.hostname, cert); identityVerified = failure === undefined; return failure;
            },
          };
          try {
            req = request(options, (res) => {
              response = res; status = res.statusCode;
              if (!sent || !status || status < 200 || status > 599) { fail('network_error'); return; }
              if (status >= 300 && status < 400) { fail('redirect_blocked'); return; }
              const chunks: Uint8Array[] = []; let size = 0;
              res.on('data', (chunk: Uint8Array) => {
                if (!chunk || !Number.isSafeInteger(chunk.byteLength) || size + chunk.byteLength > limit) { fail('response_too_large'); return; }
                const b = Uint8Array.from(chunk); size += b.byteLength; chunks.push(b);
              });
              res.once('error', () => fail('network_error'));
              res.once('aborted', () => fail('network_error'));
              res.once('end', () => {
                if (done) return; done = true; clear();
                const result = new Uint8Array(size); let offset = 0;
                for (const b of chunks) { result.set(b, offset); offset += b.byteLength; }
                resolveResult({ status: status!, body: result });
              });
            });
            req.once('socket', (socket) => {
              socket.once('secureConnect', () => {
                const tlsSocket = socket as typeof socket & { authorized?: boolean; remoteAddress?: string };
                if (done) return;
                if (!lookupObserved || !identityVerified || tlsSocket.authorized !== true ||
                    !tlsSocket.remoteAddress || !sameAddress(tlsSocket.remoteAddress, pinned.address)) { fail('pinning_failed'); return; }
                sent = true; req!.end(body);
              });
            });
            req.once('error', (err: Error & { code?: string }) => {
              const code = String(err.code ?? '');
              fail(/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code) ? 'tls_failed' : 'network_error');
            });
          } catch { fail('network_error'); }
        })().catch(() => fail('network_error'));
      });
  }
  return {
    assertReady,
    post: (input) => send(input, false),
    async probeRuntime() {
      // The only readiness bypass is a fixed, data-free HEAD; no callback or
      // request headers can be supplied by the caller. This never enables delivery.
      const result = await send({ url: PINNING_PROBE_URL, body: new Uint8Array(), headers: {}, responseLimitBytes: 0 }, true);
      // A completed, pinned TLS exchange proves transport compatibility even if
      // the fixed documentation endpoint denies HEAD or is temporarily unwell.
      // send() still rejects redirects/invalid status and all DNS/IP/TLS failures.
      // Callback verification and delivery acknowledgments keep their 2xx rules.
      return { status: result.status };
    },
  };
}
