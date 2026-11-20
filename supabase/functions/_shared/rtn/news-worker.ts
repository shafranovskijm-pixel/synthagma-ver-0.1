import { fetchRtnNewsRss, RTN_NEWS_BYTE_LIMIT, RTN_NEWS_RSS_URL, type RtnNewsFeed } from './news-source.ts';
import { sha256 } from './official-source.ts';
import type { WithRtnNewsFetch } from './news-http-client.ts';
import { isLostPublisherAuthority } from './news-publisher-http-client.ts';

type RpcReply = { data: unknown; error: { code?: string; message?: string } | null };
export type NewsRpcClient = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcReply> };
export type NewsWorkerClient = NewsRpcClient & { storage: { from(bucket: string): {
  upload(path: string, bytes: Uint8Array, options: { contentType: string; upsert: boolean }): PromiseLike<{ error: { statusCode?: string | number; message?: string } | null }>;
  download(path: string): { asStream(): PromiseLike<{ data: ReadableStream<Uint8Array> | null; error: unknown }> };
} } };
export type RtnNewsClaim = {
  run_id: string; lease_token: string; lease_expires_at: string; generation: number;
  kind: 'manual' | 'scheduled'; source_url: typeof RTN_NEWS_RSS_URL;
};
export type RtnNewsCheckReceipt = {
  run_id: string; status: 'queued' | 'running' | 'changed' | 'unchanged' | 'error';
  new_event_count: number; correction_count: number; unchanged_count: number;
  error_code: string | null; replayed: boolean;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (code: string): never => { throw new Error(`RTN_NEWS_${code}`); };

export function readRtnNewsClaim(value: unknown): RtnNewsClaim | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('CLAIM_INVALID');
  const c = value as Record<string, unknown>;
  if (typeof c.run_id !== 'string' || !uuid.test(c.run_id) || typeof c.lease_token !== 'string' || !uuid.test(c.lease_token)
    || c.source_url !== RTN_NEWS_RSS_URL || !['manual', 'scheduled'].includes(String(c.kind))
    || !Number.isSafeInteger(c.generation) || Number(c.generation) < 1
    || typeof c.lease_expires_at !== 'string' || !Number.isFinite(Date.parse(c.lease_expires_at))
    || !/(?:Z|[+-]\d{2}:\d{2})$/.test(c.lease_expires_at)) return fail('CLAIM_INVALID');
  return c as RtnNewsClaim;
}

export async function newsRpc<T>(client: NewsRpcClient, name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) return fail('DATABASE_OPERATION_FAILED');
  return data as T;
}

/** Observe precisely the one response consumed by the approved RSS reader.
 * No clone/second GET/unbounded arrayBuffer and no replacement of URL/TLS rules.
 * Transform cancellation/errors propagate to the scoped native transport. */
export async function captureRtnNewsOriginal(fetcher: typeof fetch): Promise<{ feed: RtnNewsFeed; bytes: Uint8Array }> {
  let captured: Uint8Array[] = [], capturedSize = 0, captureCount = 0;
  const observing = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetcher(input, init);
    if (response.status !== 200 || !response.body) return response;
    if (++captureCount !== 1) { void response.body.cancel().catch(() => undefined); return fail('CAPTURE_MULTIPLE_RESPONSES'); }
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        capturedSize += chunk.byteLength;
        if (capturedSize > RTN_NEWS_BYTE_LIMIT) return fail('BODY_SIZE_INVALID');
        captured.push(chunk.slice()); controller.enqueue(chunk);
      },
    }));
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  }) as typeof fetch;
  const feed = await fetchRtnNewsRss(observing);
  if (captureCount !== 1 || !capturedSize) return fail('CAPTURE_MISSING');
  const bytes = new Uint8Array(capturedSize);
  let at = 0;
  for (const chunk of captured) { bytes.set(chunk, at); at += chunk.byteLength; }
  captured = [];
  if (await sha256(bytes) !== feed.response_sha256) return fail('CAPTURE_HASH_MISMATCH');
  return { feed, bytes };
}

const PRIVATE_READBACK_TIMEOUT_MS = 20_000;

/** Supported storage-js2.90.1 asStream path: do not let its Blob builder
 * materialize a corrupt oversized object before checking its size. SDK header
 * fetch has a separate30s native deadline. This20s body deadline cancels the
 * private stream too; neither mismatch nor timeout gets a public/signed retry. */
async function readRssOriginal(stream: ReadableStream<Uint8Array>, expectedSize: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const chunks: Uint8Array[] = [];let size = 0;
  const reading = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array) || size + value.byteLength > RTN_NEWS_BYTE_LIMIT
          || size + value.byteLength > expectedSize) return fail('ORIGINAL_HASH_CONFLICT');
        size += value.byteLength;chunks.push(value.slice());
      }
      if (size !== expectedSize) return fail('ORIGINAL_HASH_CONFLICT');
      const bytes = new Uint8Array(size);let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.byteLength; }
      return bytes;
    } finally {
      // cancel() settles pending reads. Do not wait for an untrusted source's
      // cancellation hook; the deadline must remain a real upper bound.
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  })();
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { void reader.cancel().catch(() => undefined);reject(new Error('RTN_NEWS_ORIGINAL_READBACK_TIMEOUT')); }, PRIVATE_READBACK_TIMEOUT_MS);
  });
  try { return await Promise.race([reading, deadline]); }
  catch (error) {
    if (error instanceof Error && /^RTN_NEWS_/.test(error.message)) throw error;
    return fail('ORIGINAL_STORAGE_READ_FAILED');
  } finally { clearTimeout(timer); }
}

async function storeRssOriginal(client: NewsWorkerClient, bytes: Uint8Array, expectedHash: string): Promise<string> {
  if (!bytes.byteLength || bytes.byteLength > RTN_NEWS_BYTE_LIMIT || await sha256(bytes) !== expectedHash) return fail('CAPTURE_HASH_MISMATCH');
  const path = `news/rss/${expectedHash}.xml`, bucket = client.storage.from('rtn-sources');
  const result = await bucket.upload(path, bytes, { contentType: 'application/xml', upsert: false });
  if (!result.error) return path;
  const status = String(result.error.statusCode);
  if (status !== '409' && !(status === '400' && /already exists|duplicate/i.test(result.error.message || ''))) return fail('ORIGINAL_STORAGE_FAILED');
  // A content-addressed conflict is accepted only after independent exact readback.
  const existing = await bucket.download(path).asStream();
  if (existing.error || !existing.data) return fail('ORIGINAL_STORAGE_READ_FAILED');
  const existingBytes = await readRssOriginal(existing.data, bytes.byteLength);
  if (await sha256(existingBytes) !== expectedHash) return fail('ORIGINAL_HASH_CONFLICT');
  return path;
}

export function safeRtnNewsError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^RTN_NEWS_[A-Z0-9_]{1,100}$/.test(message) ? message : 'RTN_NEWS_CHECK_FAILED';
}

/** Exactly one immutable original and one completion. A failed completion is
 * outside the fetch/storage catch: do not mask an unknown commit with error RPC. */
export async function executeRtnNewsCheck(client: NewsWorkerClient, claim: RtnNewsClaim, withNewsFetch: WithRtnNewsFetch): Promise<RtnNewsCheckReceipt> {
  if (!readRtnNewsClaim(claim)) return fail('CLAIM_INVALID');
  let completion: Record<string, unknown>;
  try {
    const { feed, bytes } = await withNewsFetch(captureRtnNewsOriginal);
    const originalPath = await storeRssOriginal(client, bytes, feed.response_sha256);
    completion = {
      status: 'success', response_sha256: feed.response_sha256, byte_size: bytes.byteLength,
      original_path: originalPath, resolved_feed_url: feed.resolved_feed_url,
      // Public cards use the official headline+link, not copied full descriptions
      // or a generated summary. Raw item's digest is retained as evidence only.
      items: feed.items.map(({ canonical_url, title, published_at, content_sha256 }) => ({ canonical_url, title, published_at, content_sha256 })),
    };
  } catch (error) {
    // An unacknowledged publisher CAS may belong to another valid worker.
    // Never turn lost authority into a competing source-error completion.
    if (isLostPublisherAuthority(error)) throw error;
    completion = { status: 'error', error_code: safeRtnNewsError(error) };
  }
  const result = await newsRpc<RtnNewsCheckReceipt>(client, 'complete_rtn_news_check', {
    p_run_id: claim.run_id, p_lease_token: claim.lease_token, p_result: completion,
  });
  if (!result || result.run_id !== claim.run_id || !['changed', 'unchanged', 'error'].includes(result.status)) return fail('COMPLETION_INVALID');
  return result;
}
