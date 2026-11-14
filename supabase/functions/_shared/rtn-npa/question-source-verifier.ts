import type { NpaCheckClaim, QuestionSourceObservation } from './contracts.ts';
import { canonicalJson, ProofError, sha256, type PrivateArtifactStore } from './official-client.ts';
import {
  assertDocumentMagic, decodeOfficialPage, discoverA1Section, discoverDocument,
  discoverIndustryCatalog, fetchOfficial, officialUrl, DOCUMENT_BYTES,
} from '../rtn/official-source.ts';

export const INDUSTRY_SERVICE_URL = 'https://www.gosnadzor.ru/service/list/Safety%20certification/';
export const SOURCE_HTTP_MS = 15_000;
export const SOURCE_OPERATION_MS = 35_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface BoundedFetchOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  deadlineAtMs?: number;
  now?: () => Date;
  maxResponseBytes?: number;
  allowUrl(url: URL): boolean;
  rejectRedirects?: boolean;
}
/** Deadline stays active through response BODY consumption, not only headers.
 * This wrapper adds no credentials; SDK auth headers remain scoped to its
 * separately injected project-only transport. Redirects are never followed.
 */
export function createBoundedFetch(fetcher: typeof fetch, options: BoundedFetchOptions): typeof fetch {
  return async (input, init) => {
    // Deno + the SDK's Node compatibility overloads expose a broader init
    // union. These are the same standard Web fetch fields at runtime.
    const webInit = init as (RequestInit & { signal?: AbortSignal | null; headers?: HeadersInit }) | undefined;
    const now = options.now ?? (() => new Date());
    let url: URL;
    let requestSnapshot: Request | undefined;
    try {
      // Capture a native Request's immutable internals/body ownership now. Do
      // not retain a caller's object or mutable URL across the microtask seam.
      if (input instanceof Request) requestSnapshot = new Request(input);
      url = new URL(requestSnapshot ? requestSnapshot.url : typeof input === 'string' ? input : (input as URL).href);
    }
    catch { throw new ProofError('RTN_NPA_INVALID_TRANSPORT_URL'); }
    const targetHref = url.href;
    if (url.username || url.password || url.hash || !options.allowUrl(url)) throw new ProofError('RTN_NPA_UNTRUSTED_TRANSPORT_URL');
    const remaining = options.deadlineAtMs === undefined ? options.timeoutMs : Math.min(options.timeoutMs, options.deadlineAtMs - now().getTime());
    if (!Number.isFinite(remaining) || remaining <= 0) throw new ProofError('RTN_NPA_REQUEST_DEADLINE');
    const parents = [...new Set([options.signal, webInit?.signal, requestSnapshot?.signal].filter((v): v is AbortSignal => !!v))];
    if (parents.some(signal => signal.aborted)) throw new ProofError('RTN_NPA_REQUEST_ABORTED');
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let cleaned = false, stopped = false;
    let rejectStop: (error: Error) => void = () => {};
    const halt = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
    const stop = (code: string) => {
      if (stopped) return;
      stopped = true; controller.abort(); rejectStop(new ProofError(code));
      void reader?.cancel().catch(() => {});
    };
    const abort = () => stop('RTN_NPA_REQUEST_ABORTED');
    const timer = setTimeout(() => stop('RTN_NPA_REQUEST_TIMEOUT'), remaining);
    for (const signal of parents) signal.addEventListener('abort', abort, { once: true });
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true; clearTimeout(timer);
      for (const signal of parents) signal.removeEventListener('abort', abort);
    };
    const releaseReader = () => { try { reader?.releaseLock(); } catch { /* a canceled read settles separately */ } };
    try {
      if (parents.some(signal => signal.aborted)) stop('RTN_NPA_REQUEST_ABORTED');
      const requestHeaders = new Headers(requestSnapshot?.headers);
      new Headers(webInit?.headers).forEach((value, key) => requestHeaders.set(key, value));
      requestHeaders.set('Cache-Control', 'no-cache');
      const fetchInput = requestSnapshot ?? targetHref;
      const fetchInit: RequestInit = { ...webInit, headers: requestHeaders, signal: controller.signal, redirect: 'manual', credentials: 'omit' };
      const fetched = Promise.resolve().then(() => fetcher(fetchInput, fetchInit));
      void fetched.then(response => { if (stopped) void response.body?.cancel().catch(() => {}); }, () => {});
      const response = await Promise.race([fetched, halt]);
      if (response.url && new URL(response.url).href !== targetHref) throw new ProofError('RTN_NPA_UNVALIDATED_REDIRECT');
      if (options.rejectRedirects && response.status >= 300 && response.status < 400) {
        await response.body?.cancel(); throw new ProofError('RTN_NPA_API_REDIRECT_REJECTED');
      }
      const cap = options.maxResponseBytes ?? DOCUMENT_BYTES;
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > cap)) { await response.body?.cancel(); throw new ProofError('RTN_NPA_RESPONSE_TOO_LARGE'); }
      if (!response.body) { cleanup(); return response; }
      reader = response.body.getReader();
      let bytes = 0;
      const body = new ReadableStream<Uint8Array>({
        async pull(target) {
          try {
            const next = await Promise.race([reader!.read(), halt]);
            if (next.done) { cleanup(); releaseReader(); target.close(); return; }
            bytes += next.value.byteLength;
            if (bytes > cap) { stop('RTN_NPA_RESPONSE_TOO_LARGE'); throw new ProofError('RTN_NPA_RESPONSE_TOO_LARGE'); }
            target.enqueue(next.value);
          } catch (error) {
            cleanup(); await reader!.cancel().catch(() => {}); releaseReader();
            target.error(error instanceof ProofError ? error : new ProofError('RTN_NPA_RESPONSE_UNAVAILABLE'));
          }
        },
        async cancel() { cleanup(); controller.abort(); await reader!.cancel().catch(() => {}); releaseReader(); },
      });
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      cleanup(); controller.abort(); await reader?.cancel().catch(() => {}); releaseReader();
      if (error instanceof ProofError) throw error;
      throw new ProofError('RTN_NPA_TRANSPORT_UNAVAILABLE');
    }
  };
}

export interface QuestionVerifierDependencies {
  fetch: typeof fetch;
  storeForSignal(signal: AbortSignal): PrivateArtifactStore;
  signal?: AbortSignal;
  deadlineAtMs: number;
  now?: () => Date;
  requestTimeoutMs?: number;
  operationTimeoutMs?: number;
  uploadTimeoutMs?: number;
}
/** Source family and run are bound to a genuine service claim. Neither the
 * caller's old document_url nor its page_url is ever used as a fetch target.
 */
export function createQuestionSourceVerifier(claim: NpaCheckClaim, dependencies: QuestionVerifierDependencies) {
  const expected = { ...claim.question_source };
  const runId = claim.run_id;
  return async (requested: NpaCheckClaim['question_source']): Promise<QuestionSourceObservation> => {
    if (canonicalJson(requested) !== canonicalJson(expected)) throw new ProofError('QUESTION_SOURCE_CONTEXT_CHANGED');
    if (expected.source_code !== 'rtn-industrial-a1-public' || expected.trusted_anchor_rule !== 'a1' || expected.parser !== 'industrial-pdf') throw new ProofError('UNSUPPORTED_QUESTION_SOURCE_FAMILY');
    if (!uuid.test(runId) || !uuid.test(expected.source_id) || !Number.isSafeInteger(expected.source_generation) || expected.source_generation < 0 ||
        ![expected.sha256, expected.parent_normalization_sha256, expected.child_normalization_sha256].every(value => /^[a-f0-9]{64}$/.test(value))) throw new ProofError('QUESTION_SOURCE_INVALID_SERVER_CONTEXT');
    const now = dependencies.now ?? (() => new Date());
    const budget = Math.min(dependencies.operationTimeoutMs ?? SOURCE_OPERATION_MS, SOURCE_OPERATION_MS, dependencies.deadlineAtMs - now().getTime());
    if (!Number.isFinite(budget) || budget <= 0) throw new ProofError('QUESTION_SOURCE_RUN_DEADLINE');
    const controller = new AbortController();
    let rejectStop: (error: Error) => void = () => {};
    const stopped = new Promise<never>((_resolve, reject) => { rejectStop = reject; });
    const abort = () => { controller.abort(); rejectStop(new ProofError('QUESTION_SOURCE_ABORTED')); };
    if (dependencies.signal?.aborted) throw new ProofError('QUESTION_SOURCE_ABORTED');
    dependencies.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { controller.abort(); rejectStop(new ProofError('QUESTION_SOURCE_VERIFICATION_TIMEOUT')); }, budget);
    const fetcher = createBoundedFetch(dependencies.fetch, {
      timeoutMs: Math.min(dependencies.requestTimeoutMs ?? SOURCE_HTTP_MS, SOURCE_HTTP_MS),
      signal: controller.signal, deadlineAtMs: dependencies.deadlineAtMs, now,
      allowUrl(url) { try { officialUrl(url.href); return true; } catch { return false; } },
      maxResponseBytes: DOCUMENT_BYTES,
    });
    const work = async (): Promise<QuestionSourceObservation> => {
      const parent = await fetchOfficial(INDUSTRY_SERVICE_URL, 'page', fetcher);
      const catalogUrl = discoverIndustryCatalog(decodeOfficialPage(parent.bytes, parent.contentType), parent.url);
      const catalog = await fetchOfficial(catalogUrl, 'page', fetcher);
      const sectionUrl = discoverA1Section(decodeOfficialPage(catalog.bytes, catalog.contentType), catalog.url);
      const section = await fetchOfficial(sectionUrl, 'page', fetcher);
      const pdfUrl = discoverDocument(decodeOfficialPage(section.bytes, section.contentType), section.url, 'a1');
      const document = await fetchOfficial(pdfUrl, 'document', fetcher);
      if (document.bytes.byteLength > DOCUMENT_BYTES) throw new ProofError('QUESTION_SOURCE_PDF_TOO_LARGE');
      assertDocumentMagic(document.bytes, 'industrial-pdf');
      const receivedAt = now().toISOString();
      const digest = await sha256(document.bytes);
      const path = `npa250/${runId}/${digest}.pdf`;
      // Preserve the independent15s private-artifact operation cap, including
      // an upload409 + immutable-existing-object verification round trip.
      const upload = new AbortController();
      let rejectUpload: (error: Error) => void = () => {};
      const uploadStopped = new Promise<never>((_resolve, reject) => { rejectUpload = reject; });
      const abortUpload = () => { upload.abort(); rejectUpload(new ProofError('QUESTION_SOURCE_ABORTED')); };
      const uploadBudget = Math.min(dependencies.uploadTimeoutMs ?? SOURCE_HTTP_MS, SOURCE_HTTP_MS, dependencies.deadlineAtMs - now().getTime());
      if (!Number.isFinite(uploadBudget) || uploadBudget <= 0) throw new ProofError('QUESTION_SOURCE_RUN_DEADLINE');
      const uploadTimer = setTimeout(() => { upload.abort(); rejectUpload(new ProofError('QUESTION_SOURCE_PRIVATE_UPLOAD_TIMEOUT')); }, uploadBudget);
      controller.signal.addEventListener('abort', abortUpload, { once: true });
      try {
        if (controller.signal.aborted) throw new ProofError('QUESTION_SOURCE_ABORTED');
        await Promise.race([dependencies.storeForSignal(upload.signal).put({ bucket: 'rtn-sources', path, bytes: document.bytes, contentType: 'application/pdf' }), uploadStopped]);
      } finally { clearTimeout(uploadTimer); controller.signal.removeEventListener('abort', abortUpload); upload.abort(); }
      if (controller.signal.aborted) throw new ProofError('QUESTION_SOURCE_ABORTED');
      return {
        source_id: expected.source_id, source_generation: expected.source_generation, sha256: digest,
        parent_normalization_sha256: expected.parent_normalization_sha256, child_normalization_sha256: expected.child_normalization_sha256,
        fetched_at: now().toISOString(), catalog_complete: true,
        artifact: { path, sha256: digest, bytes: document.bytes.byteLength, request_url: document.url, http_status: 200, transport: 'https', received_at: receivedAt },
      };
    };
    try { return await Promise.race([work(), stopped]); }
    catch (error) {
      if (error instanceof ProofError) throw error;
      if (error instanceof Error && /^(?:OFFICIAL|RTN_NPA)_[A-Z0-9_]+$/.test(error.message)) throw new ProofError(error.message);
      throw new ProofError('QUESTION_SOURCE_VERIFICATION_FAILED');
    }
    finally { clearTimeout(timer); dependencies.signal?.removeEventListener('abort', abort); controller.abort(); }
  };
}
