/** Node HTTPS implementation retained; native Deno selected only when its APIs exist. */
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest,type RequestOptions} from 'node:https';
import {checkServerIdentity,type PeerCertificate} from 'node:tls';
import type {ClientRequest,IncomingMessage} from 'node:http';
import {CallbackTransportError,canonicalizeCallback,isPublicAddress,sameAddress,PINNING_PROBE_URL,type TransportReason,type ResolvedAddress,type PostInput,type PostResult,type PinnedHttpsTransport} from './callback-policy.ts';
import {createNativeDenoHttpsTransport,nativeDenoRuntimeAvailable} from './native-deno-https.ts';
export * from './callback-policy.ts';
export {DENO_NATIVE_HTTPS_PINNING_PROVEN,createNativeDenoHttpsTransport} from './native-deno-https.ts';
// Old failed Node compatibility pilot never enables either transport.
export const DENO_NODE_HTTPS_PINNING_PROVEN=false;
export type TransportDependencies = {
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  request?: typeof httpsRequest;
  identityCheck?: (hostname: string, cert: PeerCertificate) => Error | undefined;
  timeoutMs?: number;
};
export function createPinnedHttpsTransport(deps: TransportDependencies = {}): PinnedHttpsTransport {
  if(!deps.resolve&&!deps.request&&!deps.identityCheck&&nativeDenoRuntimeAvailable())return createNativeDenoHttpsTransport({timeoutMs:deps.timeoutMs});
  return createNodePinnedHttpsTransport(deps);
}
export function createNodePinnedHttpsTransport(deps: TransportDependencies = {}): PinnedHttpsTransport {
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
    implementation: 'node-https',
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
