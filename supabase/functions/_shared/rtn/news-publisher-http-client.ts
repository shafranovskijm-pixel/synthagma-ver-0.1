import { verifyOfficialTlsBundle, type OfficialHttpClient } from './official-http-client.ts';
import { INTERMEDIATE } from './official-tls-bundle.ts';
import type { WithRtnNewsFetch } from './news-http-client.ts';
import type { RtnNewsClaim, NewsRpcClient } from './news-worker.ts';
import { RTN_NEWS_RSS_URL } from './news-source.ts';

/** A failed/unconfirmed authorization is NOT a failed official source check.
 * In particular another worker may own the successful CAS acknowledgement. */
export class LostPublisherAuthority extends Error {
  constructor() { super('RTN_NEWS_PUBLISHER_AUTHORITY_LOST'); }
}
export const isLostPublisherAuthority = (error: unknown): error is LostPublisherAuthority => error instanceof LostPublisherAuthority;

export type ArchiveGetGrant = {
  request_id: string; page_url: string; page_number: number;
  purpose: 'scan' | 'head_revalidate' | 'boundary_revalidate';
  request_deadline_at: string; max_response_bytes: 1048576;
};
export type NativeArchiveObservation = { resolved_url: string; content_type: string };
export type ArchiveTransportScope = {
  withGrant<T>(grant: ArchiveGetGrant, action: (fetcher: typeof fetch, observation: () => NativeArchiveObservation) => Promise<T>): Promise<T>;
};
export type PublisherHttpDependencies = {
  rpc: NewsRpcClient;
  fetcher(input: string, init: RequestInit & { client: OfficialHttpClient }): Promise<Response>;
  createHttpClient?: (options: { caCerts: string[] }) => OfficialHttpClient;
  now?: () => number;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = (code: string): never => { throw new Error(`RTN_NEWS_TLS_${code}`); };
export function utc6Milliseconds(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === `${value.slice(0, 23)}Z` ? parsed : NaN;
}
function discard(response: Response): void {
  try { void response.body?.cancel().catch(() => undefined); } catch { /* No retry or unbounded wait. */ }
}
function bounded<T>(pending: PromiseLike<T>, signal: AbortSignal, late?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const aborted = () => { if (!settled) { settled = true; signal.removeEventListener('abort', aborted); reject(signal.reason); } };
    signal.addEventListener('abort', aborted, { once: true }); if (signal.aborted) aborted();
    Promise.resolve(pending).then(value => {
      if (settled) { late?.(value); return; }
      settled = true; signal.removeEventListener('abort', aborted); resolve(value);
    }, error => { if (!settled) { settled = true; signal.removeEventListener('abort', aborted); reject(error); } });
  });
}
function request(input: RequestInfo | URL, init: RequestInit): { href: string; headers: Headers } {
  if (typeof input !== 'string' && !(input instanceof URL)) return fail('URL_UNSUPPORTED');
  if (init.method !== undefined && init.method !== 'GET' || init.body != null || init.redirect !== 'manual'
    || init.credentials !== undefined && init.credentials !== 'omit'
    || Object.keys(init).some(key => !['method','body','redirect','credentials','headers','signal'].includes(key))) return fail('REQUEST_UNSUPPORTED');
  const headers = new Headers(init.headers);
  if ([...headers.keys()].some(key => key !== 'accept')) return fail('REQUEST_UNSUPPORTED');
  return { href: String(input), headers };
}
function archiveGrant(value: ArchiveGetGrant): ArchiveGetGrant {
  const number = value?.page_number;
  const expected = number === 1 ? 'https://www.gosnadzor.ru/news/' : `https://www.gosnadzor.ru/news/?PAGEN_1=${number}`;
  if (!value || !uuid.test(value.request_id) || !Number.isInteger(number) || number < 1 || number > 10
    || value.page_url !== expected || !['scan','head_revalidate','boundary_revalidate'].includes(value.purpose)
    || !Number.isFinite(utc6Milliseconds(value.request_deadline_at)) || value.max_response_bytes !== 1048576) throw new LostPublisherAuthority();
  return { ...value };
}

/** New fixed public publisher capabilities. The bank and legacy news transports
 * are unchanged. No SDK/auth headers or arbitrary URL/options reach this client. */
export function createRtnPublisherTransport(deps: PublisherHttpDependencies): {
  forRssClaim(claim: RtnNewsClaim, signal?: AbortSignal): WithRtnNewsFetch;
  withArchiveTransport<T>(action: (scope: ArchiveTransportScope) => Promise<T>, signal?: AbortSignal): Promise<T>;
} {
  const now = deps.now || Date.now;
  async function scope<T>(action: (wire: (href: string, init: RequestInit, deadline: number, observe?: (value: NativeArchiveObservation) => void, after?: () => void) => Promise<Response>, isOpen: () => boolean) => Promise<T>, outer?: AbortSignal): Promise<T> {
    let client: OfficialHttpClient | undefined, closed = false;
    const active = new Set<AbortController>();
    try {
      try {
        outer?.throwIfAborted();
        // Local preflight has no acknowledged GET grant. A failure here must
        // never become a source-error completion requiring such a grant.
        await verifyOfficialTlsBundle(now); outer?.throwIfAborted();
        if (!deps.createHttpClient) throw new LostPublisherAuthority();
        client = deps.createHttpClient({ caCerts: [INTERMEDIATE.pem] });
        if (!client || typeof client.close !== 'function') throw new LostPublisherAuthority();
        outer?.throwIfAborted();
      } catch { throw new LostPublisherAuthority(); }
      const wire = async (href: string, init: RequestInit, deadline: number, observe?: (value: NativeArchiveObservation) => void, after?: () => void): Promise<Response> => {
        if (closed) throw new LostPublisherAuthority();
        const remaining = Math.min(20_000, deadline - now());
        if (!Number.isFinite(remaining) || remaining <= 0) throw new LostPublisherAuthority();
        const controller = new AbortController(); active.add(controller);
        const signals = [outer, init.signal].filter((value): value is AbortSignal => Boolean(value));
        const aborted = () => controller.abort(new Error('RTN_NEWS_TLS_ABORTED'));
        for (const signal of signals) { signal.addEventListener('abort', aborted, { once: true }); if (signal.aborted) aborted(); }
        const timer = setTimeout(() => controller.abort(new Error('RTN_NEWS_TLS_TIMEOUT')), remaining);
        let finished = false;
        let unownedResponse: Response | undefined;
        let pendingReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const cleanup = () => { if (finished) return; finished = true; clearTimeout(timer); active.delete(controller); for (const signal of signals) signal.removeEventListener('abort', aborted); after?.(); };
        try {
          controller.signal.throwIfAborted();
          const native = await bounded(deps.fetcher(href, { method: 'GET', redirect: 'manual', credentials: 'omit', headers: new Headers(init.headers), signal: controller.signal, client: client! }), controller.signal, discard);
          unownedResponse = native;
          controller.signal.throwIfAborted();
          if (native.url !== href || native.redirected) { discard(native); unownedResponse = undefined; return fail('RESPONSE_URL_INVALID'); }
          // Non-200 status is authoritative publisher failure evidence. Do not
          // mask a real403/429 with a success-only metadata/header validation.
          if (observe && native.status === 200) {
            const contentType = native.headers.get('content-type') || '';
            if (contentType.length > 128) { discard(native); unownedResponse = undefined; return fail('RESPONSE_HEADER_INVALID'); }
            observe({ resolved_url: native.url, content_type: contentType });
          }
          if (!native.body) { unownedResponse = undefined; cleanup(); return native; }
          const reader = native.body.getReader();
          pendingReader = reader; unownedResponse = undefined;
          const release = () => { try { reader.releaseLock(); } catch { /* Pending read can settle later. */ } };
          const cancel = () => { pendingReader = undefined; try { void reader.cancel().catch(() => undefined).finally(release); } catch { release(); } };
          let streamController: ReadableStreamDefaultController<Uint8Array>;
          const bodyAborted = () => { if (finished) return; cleanup(); controller.signal.removeEventListener('abort', bodyAborted); cancel(); streamController.error(controller.signal.reason); };
          const finish = () => { controller.signal.removeEventListener('abort', bodyAborted); cleanup(); };
          const body = new ReadableStream<Uint8Array>({
            start(value) { streamController = value; controller.signal.addEventListener('abort', bodyAborted, { once: true }); if (controller.signal.aborted) bodyAborted(); },
            async pull(value) {
              try {
                const part = await bounded(reader.read(), controller.signal);
                if (finished) return;
                if (part.done) { finish(); release(); value.close(); } else value.enqueue(part.value);
              } catch (error) { if (!finished) { finish(); cancel(); value.error(error); } }
            },
            cancel() { if (!finished) { finish(); cancel(); } },
          }, { highWaterMark: 0 });
          const response = new Response(body, { status: native.status, statusText: native.statusText, headers: native.headers });
          pendingReader = undefined;
          return response;
        } catch (error) {
          if (unownedResponse) discard(unownedResponse);
          if (pendingReader) {
            const held = pendingReader;
            try { void held.cancel().catch(() => undefined).finally(() => { try { held.releaseLock(); } catch { /* Pending read. */ } }); } catch { /* No unbounded cleanup. */ }
          }
          cleanup(); throw error;
        }
      };
      return await action(wire, () => !closed);
    } finally {
      closed = true;
      for (const controller of active) controller.abort(new Error('RTN_NEWS_TLS_SCOPE_CLOSED'));
      try { client?.close(); } catch { /* Never replace a completion outcome. */ }
    }
  }
  return {
    forRssClaim(claim, outer) {
      // Claim selector remains the exact server-generated old DTO, not a URL.
      const selected = { ...claim };
      if (!uuid.test(selected.run_id) || !uuid.test(selected.lease_token) || !Number.isSafeInteger(selected.generation) || selected.generation < 1
        || selected.source_url !== RTN_NEWS_RSS_URL || !Number.isFinite(Date.parse(selected.lease_expires_at))) throw new LostPublisherAuthority();
      return action => scope(async (wire, isOpen) => {
        let count = 0, epoch: number | null = null, busy = false;
        const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
          const { href, headers } = request(input, init);
          if (href !== RTN_NEWS_RSS_URL && href !== 'https://gosnadzor.ru/news/rss/') return fail('URL_UNSUPPORTED');
          if (!isOpen() || busy || count >= 5) throw new LostPublisherAuthority();
          busy = true;
          const guardController = new AbortController();
          const stop = () => guardController.abort(new LostPublisherAuthority());
          const signals = [outer, init.signal].filter((value): value is AbortSignal => Boolean(value));
          for (const signal of signals) { signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) stop(); }
          const timer = setTimeout(stop, Math.max(0, Math.min(20_000, Date.parse(selected.lease_expires_at) - now())));
          let expires: number;
          try {
            const reply = await bounded(deps.rpc.rpc('authorize_rtn_news_rss_get', { p_run_id: selected.run_id, p_lease_token: selected.lease_token, p_generation: selected.generation, p_expected_get_count: count }), guardController.signal);
            if (reply.error || !reply.data || typeof reply.data !== 'object' || Array.isArray(reply.data)) throw new LostPublisherAuthority();
            const grant = reply.data as Record<string, unknown>;
            expires = utc6Milliseconds(grant.expires_at);
            if (Object.keys(grant).sort().join(',') !== 'expires_at,get_count,permitted,publisher_epoch' || grant.permitted !== true
              || grant.get_count !== count + 1 || !Number.isSafeInteger(grant.publisher_epoch) || Number(grant.publisher_epoch) < 0
              || epoch !== null && grant.publisher_epoch !== epoch || !Number.isFinite(expires) || expires <= now()) throw new LostPublisherAuthority();
            epoch = Number(grant.publisher_epoch); count++;
          } catch { throw new LostPublisherAuthority(); }
          finally { clearTimeout(timer); for (const signal of signals) signal.removeEventListener('abort', stop); }
          try { return await wire(href, { ...init, headers }, Math.min(expires, Date.parse(selected.lease_expires_at)), undefined, () => { busy = false; }); }
          catch (error) { busy = false; throw error; }
        }) as typeof fetch;
        return action(fetcher);
      }, outer);
    },
    withArchiveTransport(action, outer) {
      return scope(async wire => {
        const spent = new Set<string>(); let active = false;
        return action({ async withGrant(raw, operation) {
          const grant = archiveGrant(raw);
          if (active || spent.has(grant.request_id) || utc6Milliseconds(grant.request_deadline_at) <= now()) throw new LostPublisherAuthority();
          active = true; spent.add(grant.request_id);
          let calls = 0, observation: NativeArchiveObservation | null = null;
          const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
            const { href, headers } = request(input, init);
            if (href !== grant.page_url || ++calls !== 1) throw new LostPublisherAuthority();
            return wire(href, { ...init, headers }, utc6Milliseconds(grant.request_deadline_at), value => { observation = Object.freeze({ ...value }); });
          }) as typeof fetch;
          try {
            return await operation(fetcher, () => { if (calls !== 1 || !observation) throw new LostPublisherAuthority(); return { ...observation }; });
          } finally { active = false; }
        } });
      }, outer);
    },
  };
}

/** SDK upload FileOptions does not forward signal. Inject it at the supported
 * global.fetch boundary, preserving SDK auth/body/options on its own origin. */
export function createDeadlinePrivateFetch(fetcher: typeof fetch, origin: string, deadlineAt: number, signal?: AbortSignal, now: () => number = Date.now): typeof fetch {
  const allowed = new URL(origin).origin;
  return ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (new URL(raw).origin !== allowed) return Promise.reject(new Error('RTN_ARCHIVE_PRIVATE_ORIGIN_INVALID'));
    const remaining = Math.min(30_000, deadlineAt - now());
    if (!Number.isFinite(remaining) || remaining <= 0) return Promise.reject(new Error('RTN_ARCHIVE_ABORTED'));
    const inherited = 'signal' in init ? init.signal : undefined;
    const signals = [inherited, signal, input instanceof Request ? input.signal : undefined].filter((value): value is AbortSignal => Boolean(value));
    return fetcher(input, { ...init, signal: AbortSignal.any([...signals, AbortSignal.timeout(remaining)]) });
  }) as typeof fetch;
}
