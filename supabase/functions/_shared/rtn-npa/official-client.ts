import type { Artifact } from './contracts.ts';

export class ProofError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'ProofError'; this.code = code; }
}
export interface PrivateArtifactStore {
  put(input: { bucket: 'rtn-sources'; path: string; bytes: Uint8Array; contentType: string }): Promise<void>;
}
export interface Limits {
  maxRequests: number; maxResponseBytes: number; maxTotalBytes: number;
  requestTimeoutMs: number; sourceVerificationTimeoutMs: number; runTimeoutMs: number;
  maxPages: number; maxPublications: number;
}
export const DEFAULT_LIMITS: Limits = {
  maxRequests: 450, maxResponseBytes: 15 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024, requestTimeoutMs: 15_000, sourceVerificationTimeoutMs: 35_000,
  runTimeoutMs: 90_000, maxPages: 4, maxPublications: 100,
};
export const ACTUAL_BASE = 'http://actual.pravo.gov.ru:8000/api/ebpi/';
export const PUBLICATION_BASE = 'http://publication.pravo.gov.ru';
export const FEDERAL_LAW_TYPE = '82a8bf1c-3bc7-47ed-827f-7affd43a7f27';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// This is an origin AND endpoint allowlist. No URL from a claim is fetched.
// HTTP :8000 is published in the official frontend's config.js. It is not TLS.
export function assertOfficialUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ProofError('INVALID_OFFICIAL_URL'); }
  if (url.username || url.password || url.hash) throw new ProofError('UNSAFE_OFFICIAL_URL');
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) throw new ProofError('DUPLICATE_QUERY_PARAMETER');
  if (url.origin === 'http://actual.pravo.gov.ru:8000') {
    const paths: Record<string, string[]> = {
      '/api/ebpi/attrsearch/': ['bpa', 'q'], '/api/ebpi/redactions/': ['bpa', 't'],
      '/api/ebpi/redtext': ['bpa', 't', 'ttl'], '/api/ebpi/cardfull/': ['bpa', 't', 'hash'],
    };
    const allowed = paths[url.pathname];
    if (!allowed || url.searchParams.get('bpa') !== 'ebpi' || keys.some(key => !allowed.includes(key))) {
      throw new ProofError('UNSUPPORTED_OFFICIAL_ENDPOINT');
    }
    return url;
  }
  if (url.hostname === 'publication.pravo.gov.ru' && !url.port && ['http:', 'https:'].includes(url.protocol)) {
    if (/^\/document\/\d{16}$/.test(url.pathname) && keys.length === 0) return url;
    const allowed = ['DocumentTypes', 'pageSize', 'SortedBy', 'SortDestination', 'PublishDateSearchType', 'PublishDateFrom', 'PublishDateTo', 'index'];
    if (url.pathname === '/search' && keys.every(key => allowed.includes(key)) && url.searchParams.get('DocumentTypes') === FEDERAL_LAW_TYPE) return url;
  }
  throw new ProofError('UNSAFE_OFFICIAL_URL');
}
export async function sha256(bytes: Uint8Array | string): Promise<string> {
  const input = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', input))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
export interface Captured<T = unknown> { value: T; artifact: Artifact; }

export class OfficialClient {
  readonly additionalArtifacts: Artifact[] = [];
  readonly limits: Limits;
  private requests = 0;
  private totalBytes = 0;
  private readonly started: number;
  private readonly uploaded = new Map<string, Promise<void>>();
  constructor(
    readonly runId: string,
    private readonly store: PrivateArtifactStore,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
    limits: Partial<Limits> = {},
    private readonly runSignal?: AbortSignal,
  ) {
    if (!UUID.test(runId)) throw new ProofError('INVALID_RUN_ID');
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    for (const n of Object.values(this.limits)) if (!Number.isSafeInteger(n) || n <= 0) throw new ProofError('INVALID_LIMIT');
    this.started = this.now().getTime();
  }
  instant(): string { return this.now().toISOString(); }
  async boundedDependency<T>(promise: Promise<T>, timeoutCode: string, operationTimeoutMs = this.limits.requestTimeoutMs): Promise<T> {
    if (!Number.isSafeInteger(operationTimeoutMs) || operationTimeoutMs <= 0) throw new ProofError('INVALID_DEPENDENCY_BUDGET');
    const remaining = this.limits.runTimeoutMs - (this.now().getTime() - this.started);
    if (remaining <= 0) throw new ProofError('RUN_DEADLINE');
    if (this.runSignal?.aborted) throw new ProofError('RUN_ABORTED');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const guard = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ProofError(timeoutCode)), Math.min(remaining, operationTimeoutMs));
      onAbort = () => reject(new ProofError('RUN_ABORTED'));
      this.runSignal?.addEventListener('abort', onAbort, { once: true });
    });
    try { return await Promise.race([promise, guard]); }
    finally { if (timer) clearTimeout(timer); if (onAbort) this.runSignal?.removeEventListener('abort', onAbort); }
  }
  private checkBudget(): void {
    if (this.runSignal?.aborted) throw new ProofError('RUN_ABORTED');
    if (this.now().getTime() - this.started >= this.limits.runTimeoutMs) throw new ProofError('RUN_DEADLINE');
    if (++this.requests > this.limits.maxRequests) throw new ProofError('REQUEST_BUDGET');
  }
  async capture<T = unknown>(rawUrl: string, format: 'json' | 'html' = 'json'): Promise<Captured<T>> {
    let url = assertOfficialUrl(rawUrl);
    for (let redirects = 0; redirects <= 3; redirects++) {
      this.checkBudget();
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      this.runSignal?.addEventListener('abort', onAbort, { once: true });
      const remaining = this.limits.runTimeoutMs - (this.now().getTime() - this.started);
      const timer = setTimeout(() => controller.abort(), Math.min(remaining, this.limits.requestTimeoutMs));
      let response: Response;
      let bytes: Uint8Array;
      try {
        response = await this.fetcher(url.href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: format === 'json' ? 'application/json' : 'text/html', 'Cache-Control': 'no-cache' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location || redirects === 3) throw new ProofError('REDIRECT_LIMIT');
          url = assertOfficialUrl(new URL(location, url).href);
          continue;
        }
        if (response.status !== 200) { await response.body?.cancel(); throw new ProofError(`OFFICIAL_HTTP_${response.status}`); }
        if (response.url && new URL(response.url).href !== url.href) throw new ProofError('UNVALIDATED_FETCH_REDIRECT');
        const declared = response.headers.get('content-length');
        if (declared && (!/^\d+$/.test(declared) || Number(declared) > this.limits.maxResponseBytes)) throw new ProofError('RESPONSE_SIZE_LIMIT');
        const chunks: Uint8Array[] = []; let count = 0;
        const reader = response.body?.getReader();
        if (!reader) throw new ProofError('EMPTY_OFFICIAL_BODY');
        try {
          while (true) {
            const next = await reader.read(); if (next.done) break;
            count += next.value.byteLength; this.totalBytes += next.value.byteLength;
            if (count > this.limits.maxResponseBytes || this.totalBytes > this.limits.maxTotalBytes) {
              await reader.cancel(); throw new ProofError('RESPONSE_SIZE_LIMIT');
            }
            chunks.push(next.value);
          }
        } finally { reader.releaseLock(); }
        bytes = new Uint8Array(count); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      } catch (error) {
        if (error instanceof ProofError) throw error;
        throw new ProofError(controller.signal.aborted ? 'OFFICIAL_TIMEOUT' : 'OFFICIAL_NETWORK_ERROR');
      } finally {
        clearTimeout(timer); this.runSignal?.removeEventListener('abort', onAbort);
      }
      const receivedAt = this.instant();
      // Store exact transport bytes BEFORE parsing or reporting a successful proof.
      const digest = await sha256(bytes);
      const path = `npa250/${this.runId}/${digest}.${format}`;
      let upload = this.uploaded.get(path);
      if (!upload) {
        upload = Promise.resolve().then(() => this.store.put({ bucket: 'rtn-sources', path, bytes, contentType: format === 'json' ? 'application/json' : 'text/html' }));
        this.uploaded.set(path, upload);
      }
      try { await this.boundedDependency(upload, 'PRIVATE_ARTIFACT_UPLOAD_TIMEOUT'); }
      catch (error) { throw error instanceof ProofError ? error : new ProofError('PRIVATE_ARTIFACT_UPLOAD_FAILED'); }
      const artifact: Artifact = { path, sha256: digest, bytes: bytes.byteLength, request_url: url.href, http_status: 200, transport: url.protocol === 'https:' ? 'https' : 'http', received_at: receivedAt };
      this.additionalArtifacts.push(artifact);
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new ProofError('INVALID_OFFICIAL_UTF8'); }
      if (format === 'html') return { value: text as T, artifact };
      try { return { value: JSON.parse(text) as T, artifact }; } catch { throw new ProofError('INVALID_OFFICIAL_JSON'); }
    }
    throw new ProofError('REDIRECT_LIMIT');
  }
}
