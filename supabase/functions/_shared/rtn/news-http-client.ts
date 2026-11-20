import { verifyOfficialTlsBundle, type OfficialHttpClient } from './official-http-client.ts';
import { INTERMEDIATE } from './official-tls-bundle.ts';
import {
  canonicalRtnNewsArticleUrl, fetchRtnNewsRss, RTN_NEWS_RSS_URL,
  RTN_NEWS_TIMEOUT_MS, type RtnNewsFeed,
} from './news-source.ts';

export type RtnNewsHttpDependencies = {
  fetcher(input: string, init: RequestInit & { client: OfficialHttpClient }): Promise<Response>;
  createHttpClient?: (options: { caCerts: string[] }) => OfficialHttpClient;
  now?: () => number;
};
export type WithRtnNewsFetch = <T>(action: (fetcher: typeof fetch) => Promise<T>) => Promise<T>;
const fail = (code: string): never => { throw new Error(`RTN_NEWS_TLS_${code}`); };

function newsHttpsUrl(input: string | URL | Request): string {
  if (typeof input !== 'string' && !(input instanceof URL)) return fail('URL_UNSUPPORTED');
  const raw = String(input);
  if (raw === RTN_NEWS_RSS_URL || raw === 'https://gosnadzor.ru/news/rss/') return raw;
  // HTTP links are admissible RSS identities only, never network destinations.
  if (!raw.startsWith('https://')) return fail('URL_UNSUPPORTED');
  return canonicalRtnNewsArticleUrl(raw);
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal, lateValue?: (value: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const aborted = () => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', aborted); reject(signal.reason);
    };
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    pending.then(value => {
      if (settled) { lateValue?.(value); return; }
      settled = true; signal.removeEventListener('abort', aborted); resolve(value);
    }, error => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', aborted); reject(error);
    });
  });
}

function discardBody(response: Response): void {
  try { void response.body?.cancel().catch(() => undefined); } catch { /* Best effort; never a retry. */ }
}

/** The original bank transport/allowlist is deliberately untouched. Default
 * runtime roots remain enabled; only the reviewed ICA is added for these fixed
 * public news destinations. This is not exclusive leaf/issuer pinning. */
export function createWithRtnNewsFetch(deps: RtnNewsHttpDependencies): WithRtnNewsFetch {
  return async action => {
    let client: OfficialHttpClient | undefined;
    let closed = false;
    const active = new Set<AbortController>();
    const scopedFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
      if (closed) return fail('SCOPE_CLOSED');
      // Capture mutable caller values before asynchronous certificate hashing.
      const href = newsHttpsUrl(input);
      if ((init.method !== undefined && init.method !== 'GET') || init.body != null
        || init.redirect !== 'manual' || (init.credentials !== undefined && init.credentials !== 'omit')
        || Object.keys(init).some(key => !['method', 'body', 'redirect', 'signal', 'headers', 'credentials'].includes(key))) return fail('REQUEST_UNSUPPORTED');
      const headers = new Headers(init.headers);
      if ([...headers.keys()].some(key => key !== 'accept')) return fail('REQUEST_UNSUPPORTED');
      const callerSignal = init.signal;
      callerSignal?.throwIfAborted();
      const controller = new AbortController();
      const callerAborted = () => controller.abort(callerSignal!.reason);
      callerSignal?.addEventListener('abort', callerAborted, { once: true });
      const timer = setTimeout(() => controller.abort(new Error('RTN_NEWS_TLS_TIMEOUT')), RTN_NEWS_TIMEOUT_MS);
      active.add(controller);
      const cleanup = () => {
        clearTimeout(timer); callerSignal?.removeEventListener('abort', callerAborted); active.delete(controller);
      };
      try {
        await verifyOfficialTlsBundle(deps.now || Date.now);
        if (closed) return fail('SCOPE_CLOSED');
        controller.signal.throwIfAborted();
        if (!client) {
          if (!deps.createHttpClient) return fail('CLIENT_UNAVAILABLE');
          try { client = deps.createHttpClient({ caCerts: [INTERMEDIATE.pem] }); }
          catch { return fail('CLIENT_CREATION_FAILED'); }
          if (!client || typeof client.close !== 'function') return fail('CLIENT_UNAVAILABLE');
        }
        // No ignoreCertificateErrors, alternate proxy or insecure fallback.
        const response = await abortable(deps.fetcher(href, {
          method: 'GET', redirect: 'manual', credentials: 'omit', headers,
          signal: controller.signal, client,
        }), controller.signal, discardBody);
        controller.signal.throwIfAborted();
        if (!response.body) { cleanup(); return response; }
        const reader = response.body.getReader();
        let finished = false;
        const release = () => { try { reader.releaseLock(); } catch { /* An aborted read may still settle. */ } };
        const cancelReader = () => {
          try { void reader.cancel().catch(() => undefined).finally(release); } catch { release(); }
        };
        let streamController: ReadableStreamDefaultController<Uint8Array>;
        const finish = () => {
          finished = true; controller.signal.removeEventListener('abort', bodyAborted); cleanup();
        };
        const bodyAborted = () => {
          if (finished) return;
          finish(); cancelReader(); streamController.error(controller.signal.reason);
        };
        const body = new ReadableStream<Uint8Array>({
          start(value) {
            streamController = value;
            controller.signal.addEventListener('abort', bodyAborted, { once: true });
            if (controller.signal.aborted) bodyAborted();
          },
          async pull(value) {
            try {
              const part = await abortable(reader.read(), controller.signal);
              if (finished) return;
              if (part.done) { finish(); release(); value.close(); }
              else value.enqueue(part.value);
            } catch (error) {
              if (!finished) { finish(); cancelReader(); value.error(error); }
            }
          },
          cancel() {
            if (!finished) { finish(); cancelReader(); }
          },
        }, { highWaterMark: 0 });
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      } catch (error) {
        cleanup(); throw error;
      }
    }) as typeof fetch;
    try { return await action(scopedFetch); }
    finally {
      closed = true;
      for (const controller of active) controller.abort(new Error('RTN_NEWS_TLS_SCOPE_CLOSED'));
      try { client?.close(); } catch { /* Closing cannot replace the actual callback outcome. */ }
    }
  };
}

/** Includes RSS redirect/MIME/byte guards, parsing and the one total RSS deadline.
 * There is no scheduler, storage write, article crawl or production claim here. */
export function fetchRtnNewsRssWithTls(deps: RtnNewsHttpDependencies): Promise<RtnNewsFeed> {
  return createWithRtnNewsFetch(deps)(fetchRtnNewsRss);
}
