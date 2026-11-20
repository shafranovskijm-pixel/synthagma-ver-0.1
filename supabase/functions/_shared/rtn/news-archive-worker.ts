import { createRtnArchiveFetcher, RTN_ARCHIVE_BYTE_LIMIT, type RtnArchiveFetchResult } from './news-archive-source.ts';
import { parseRtnNewsRss, RTN_NEWS_RSS_URL } from './news-source.ts';
import { sha256 } from './official-source.ts';
import { isLostPublisherAuthority, LostPublisherAuthority, utc6Milliseconds, type ArchiveGetGrant, type createRtnPublisherTransport } from './news-publisher-http-client.ts';
import type { NewsWorkerClient } from './news-worker.ts';

type Result = { status: 'idle' | 'paused' | 'error' | 'yielded' | 'observed_boundary' | 'observed_end' | 'needs_review'; stop_reason: string | null };
type Dependencies = {
  service: NewsWorkerClient;
  privateClient(deadlineAt: number, signal?: AbortSignal): NewsWorkerClient;
  transport: ReturnType<typeof createRtnPublisherTransport>;
  now?: () => number;
};
type AnchorInput = { rss_run_id: string; response_sha256: string; byte_size: number; original_path: string; resolved_feed_url: string; rss_completed_at: string; baseline: boolean };
type Claim = {
  gap_id: string; lease_token: string; generation: number; publisher_epoch: number;
  lease_expires_at: string; invocation_deadline_at: string; request: ArchiveGetGrant;
  remaining: { get_attempts: number; body_bytes: number; pages: number; candidates: number };
};
type PageReceipt = { status: 'continue' | 'yielded' | 'observed_boundary' | 'observed_end' | 'needs_review' | 'error'; replayed: boolean; accepted_candidates: number; pending_date_precision: number; known_rss: number; stop_reason: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
const reasons = ['calendar_cap','request_cap','byte_cap','page_cap','candidate_cap','moving_pagination','candidate_conflict','anchor_boundary','listing_end','lease_exhausted','later_gap','invocation_elapsed','source_error'];
const pausedReasons = ['archive_disabled','publisher_blocked','publisher_unverified','rss_priority','retry_wait','needs_review','budget_exhausted','invocation_elapsed'];
class Unavailable extends Error {}
class RpcUnavailable extends Unavailable {
  constructor(readonly code: string | null) { super('RTN_ARCHIVE_RPC_UNCONFIRMED'); }
}
class OriginalFailure extends Error {
  constructor(readonly kind: 'read' | 'hash') { super('RTN_ARCHIVE_PRIVATE_ORIGINAL_FAILED'); }
}
const invalid = (): never => { throw new Unavailable('RTN_ARCHIVE_DTO_INVALID'); };
const object = (value: unknown): Record<string, unknown> => !value || typeof value !== 'object' || Array.isArray(value) ? invalid() : value as Record<string, unknown>;
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  const result = object(value);
  if (Object.keys(result).sort().join(',') !== [...keys].sort().join(',')) return invalid();
  return result;
}
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const timestamp = (value: unknown): value is string => Number.isFinite(utc6Milliseconds(value));
const id = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const digest = (value: unknown): value is string => typeof value === 'string' && hash.test(value);

function grant(value: unknown): ArchiveGetGrant {
  const r = exact(value, ['request_id','page_url','page_number','purpose','request_deadline_at','max_response_bytes']);
  if (!id(r.request_id) || !integer(r.page_number, 1, 10) || !timestamp(r.request_deadline_at) || r.max_response_bytes !== RTN_ARCHIVE_BYTE_LIMIT
    || !['scan','head_revalidate','boundary_revalidate'].includes(String(r.purpose))
    || r.page_url !== (r.page_number === 1 ? 'https://www.gosnadzor.ru/news/' : `https://www.gosnadzor.ru/news/?PAGEN_1=${r.page_number}`)) return invalid();
  return r as unknown as ArchiveGetGrant;
}
function claim(value: unknown): Claim | null {
  if (value === null) return null;
  const c = exact(value, ['gap_id','lease_token','generation','publisher_epoch','lease_expires_at','invocation_deadline_at','request','remaining']);
  const remaining = exact(c.remaining, ['get_attempts','body_bytes','pages','candidates']);
  if (!id(c.gap_id) || !id(c.lease_token) || !integer(c.generation, 1, Number.MAX_SAFE_INTEGER) || !integer(c.publisher_epoch, 0, Number.MAX_SAFE_INTEGER)
    || !timestamp(c.lease_expires_at) || !timestamp(c.invocation_deadline_at)
    || utc6Milliseconds(c.invocation_deadline_at) > utc6Milliseconds(c.lease_expires_at)
    || !integer(remaining.get_attempts, 0, 19) || !integer(remaining.body_bytes, 0, 19 * RTN_ARCHIVE_BYTE_LIMIT)
    || !integer(remaining.pages, 0, 10) || !integer(remaining.candidates, 0, 200)) return invalid();
  const first = grant(c.request);
  if (utc6Milliseconds(first.request_deadline_at) > utc6Milliseconds(c.invocation_deadline_at)) return invalid();
  return { ...c, request: first, remaining } as unknown as Claim;
}
function pageReceipt(value: unknown): PageReceipt {
  const r = exact(value, ['status','replayed','accepted_candidates','pending_date_precision','known_rss','stop_reason']);
  if (!['continue','yielded','observed_boundary','observed_end','needs_review','error'].includes(String(r.status)) || typeof r.replayed !== 'boolean'
    || !integer(r.accepted_candidates, 0, 200) || !integer(r.pending_date_precision, 0, 200) || !integer(r.known_rss, 0, 200)
    || Number(r.pending_date_precision) + Number(r.known_rss) !== r.accepted_candidates
    || r.stop_reason !== null && !reasons.includes(String(r.stop_reason))) return invalid();
  return r as unknown as PageReceipt;
}
function anchorInput(value: unknown): { state: string; input?: AnchorInput } {
  const envelope = object(value);
  if (envelope.state === 'ready') {
    exact(envelope, ['state','input']);
    const a = exact(envelope.input, ['rss_run_id','response_sha256','byte_size','original_path','resolved_feed_url','rss_completed_at','baseline']);
    if (!id(a.rss_run_id) || !digest(a.response_sha256) || !integer(a.byte_size, 1, RTN_ARCHIVE_BYTE_LIMIT)
      || a.original_path !== `news/rss/${a.response_sha256}.xml` || !timestamp(a.rss_completed_at) || typeof a.baseline !== 'boolean'
      || a.resolved_feed_url !== RTN_NEWS_RSS_URL && a.resolved_feed_url !== 'https://gosnadzor.ru/news/rss/') return invalid();
    return { state: 'ready', input: a as unknown as AnchorInput };
  }
  const a = exact(envelope, ['state','retry_at']);
  if (!['no_success','retry_wait','anchor_history_limited','needs_review'].includes(String(a.state)) || a.retry_at !== null && !timestamp(a.retry_at)) return invalid();
  return { state: String(a.state) };
}
function anchorReceipt(value: unknown): string {
  const r = exact(value, ['status','replayed','gap_created']);
  if (!['baseline','overlap','potential_gap','empty','needs_review','probe_error'].includes(String(r.status)) || typeof r.replayed !== 'boolean' || typeof r.gap_created !== 'boolean') return invalid();
  return String(r.status);
}

function discardStream(stream: ReadableStream<Uint8Array>): void {
  try { void stream.cancel().catch(() => undefined); } catch { /* No retry or unbounded cancellation. */ }
}
function bounded<T>(pending: PromiseLike<T>, deadline: number, signal: AbortSignal | undefined, now: () => number, late?: (value: T) => void): Promise<T> {
  const discardLate = (value: T) => { try { late?.(value); } catch { /* Late cleanup cannot create an unhandled rejection. */ } };
  const remaining = deadline - now();
  if (!Number.isFinite(remaining) || remaining <= 0 || signal?.aborted) {
    Promise.resolve(pending).then(discardLate, () => undefined);
    return Promise.reject(new Unavailable('RTN_ARCHIVE_DEADLINE'));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); };
    const aborted = () => { if (!settled) { settled = true; finish(); reject(new Unavailable('RTN_ARCHIVE_DEADLINE')); } };
    const timer = setTimeout(aborted, remaining);
    signal?.addEventListener('abort', aborted, { once: true }); if (signal?.aborted) aborted();
    Promise.resolve(pending).then(value => {
      if (settled) { discardLate(value); return; }
      if (signal?.aborted || deadline <= now()) { settled = true; finish(); discardLate(value); reject(new Unavailable('RTN_ARCHIVE_DEADLINE')); return; }
      settled = true; finish(); resolve(value);
    }, error => { if (!settled) { settled = true; finish(); reject(error); } });
  });
}
async function rpc(client: NewsWorkerClient, name: string, args: Record<string, unknown> | undefined, deadline: number, signal: AbortSignal | undefined, now: () => number): Promise<unknown> {
  if (deadline <= now() || signal?.aborted) throw new RpcUnavailable(null);
  let reply: { data: unknown; error: { code?: string } | null };
  try { reply = await bounded(client.rpc(name, args), deadline, signal, now); }
  catch { throw new RpcUnavailable(null); }
  if (!reply || typeof reply !== 'object' || reply.error) {
    const code = reply?.error?.code;
    throw new RpcUnavailable(['40001','42501','22023','57014'].includes(code || '') ? code! : null);
  }
  return reply.data;
}
async function privateOriginal(client: NewsWorkerClient, path: string, expectedSize: number, expectedHash: string, deadline: number, signal: AbortSignal | undefined, now: () => number): Promise<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (deadline <= now() || signal?.aborted) throw new OriginalFailure('read');
    const stored = await bounded(client.storage.from('rtn-sources').download(path).asStream(), deadline, signal, now, late => { if (late.data) discardStream(late.data); });
    if (stored.error || !stored.data) throw new OriginalFailure('read');
    reader = stored.data.getReader();
    const bodyDeadline = Math.min(deadline, now() + 20_000), chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await bounded(reader.read(), bodyDeadline, signal, now);
      if (part.done) break;
      if (!(part.value instanceof Uint8Array) || size + part.value.byteLength > expectedSize || size + part.value.byteLength > RTN_ARCHIVE_BYTE_LIMIT) throw new OriginalFailure('hash');
      size += part.value.byteLength; chunks.push(part.value.slice());
    }
    if (size !== expectedSize) throw new OriginalFailure('hash');
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (await bounded(sha256(bytes), deadline, signal, now) !== expectedHash) throw new OriginalFailure('hash');
    return bytes;
  } catch (error) { if (error instanceof OriginalFailure) throw error; throw new OriginalFailure('read'); }
  finally { if (reader) { try { void reader.cancel().catch(() => undefined); } catch { /* Best effort only. */ } try { reader.releaseLock(); } catch { /* Pending read can settle later. */ } } }
}
async function storeArchive(client: NewsWorkerClient, result: RtnArchiveFetchResult, deadline: number, signal: AbortSignal | undefined, now: () => number): Promise<string> {
  const bytes = result.original_bytes, expected = result.page.response_sha256;
  if (!bytes.byteLength || bytes.byteLength > RTN_ARCHIVE_BYTE_LIMIT || bytes.byteLength !== result.page.response_bytes || await bounded(sha256(bytes), deadline, signal, now) !== expected) throw new Error('RTN_ARCHIVE_STORAGE_HASH_CONFLICT');
  const path = `news/archive/${expected}.html`;
  if (deadline <= now() || signal?.aborted) throw new Error('RTN_ARCHIVE_STORAGE_FAILED');
  let reply: Awaited<ReturnType<ReturnType<NewsWorkerClient['storage']['from']>['upload']>>;
  try { reply = await bounded(client.storage.from('rtn-sources').upload(path, bytes, { contentType: 'text/html', upsert: false }), deadline, signal, now); }
  catch { throw new Error('RTN_ARCHIVE_STORAGE_FAILED'); }
  if (!reply || typeof reply !== 'object' || !Object.hasOwn(reply, 'error')) throw new Error('RTN_ARCHIVE_STORAGE_FAILED');
  if (!reply.error) return path;
  const code = String(reply.error.statusCode);
  if (code !== '409' && !(code === '400' && /already exists|duplicate/i.test(reply.error.message || ''))) throw new Error('RTN_ARCHIVE_STORAGE_FAILED');
  try { await privateOriginal(client, path, bytes.byteLength, expected, deadline, signal, now); }
  catch (error) { throw new Error(error instanceof OriginalFailure && error.kind === 'hash' ? 'RTN_ARCHIVE_STORAGE_HASH_CONFLICT' : 'RTN_ARCHIVE_STORAGE_FAILED'); }
  return path;
}
function pageError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/^RTN_ARCHIVE_HTTP_[1-5]\d{2}$/.test(message)) return message;
  if (['RTN_ARCHIVE_BODY_SIZE_INVALID','RTN_ARCHIVE_TIMEOUT','RTN_ARCHIVE_ABORTED','RTN_ARCHIVE_TRANSPORT_ERROR','RTN_ARCHIVE_STORAGE_FAILED','RTN_ARCHIVE_STORAGE_HASH_CONFLICT','RTN_ARCHIVE_REDIRECT_FORBIDDEN'].includes(message)) return message;
  if (message.startsWith('RTN_ARCHIVE_')) return 'RTN_ARCHIVE_PARSE_FAILED';
  return 'RTN_ARCHIVE_TRANSPORT_ERROR';
}

/** The caller is only the authenticated scheduled handler after a committed
 * successful RSS result (or idle). HTML never enters RSS completion/events. */
export async function reconcileRtnNewsArchive(deps: Dependencies, overallDeadlineAt: number, signal?: AbortSignal): Promise<Result> {
  const rawNow = deps.now || Date.now; let last = rawNow();
  const now = () => { const current = rawNow(); if (!Number.isFinite(current) || current < last) throw new Unavailable('RTN_ARCHIVE_CLOCK_INVALID'); last = current; return current; };
  const unavailable = (): Result => ({ status: 'error', stop_reason: 'archive_unavailable' });
  const available = (deadline: number) => Number.isFinite(deadline) && deadline > now() && !signal?.aborted;
  try {
    if (!available(overallDeadlineAt) || overallDeadlineAt - now() < 10_000) return { status: 'paused', stop_reason: 'local_deadline' };
    const anchorDeadline = Math.min(overallDeadlineAt, now() + 30_000), anchorClient = deps.privateClient(anchorDeadline, signal);
    const input = anchorInput(await rpc(anchorClient, 'get_rtn_news_archive_anchor_input', undefined, Math.min(anchorDeadline, now() + 5000), signal, now));
    if (input.state === 'anchor_history_limited') {
      const status = anchorReceipt(await rpc(anchorClient, 'record_rtn_news_archive_anchor', { p_rss_run_id: null, p_result: { status: 'error', error_code: 'RTN_ARCHIVE_ANCHOR_HISTORY_LIMIT' } }, Math.min(anchorDeadline, now() + 5000), signal, now));
      return status === 'needs_review' || status === 'probe_error' ? { status: 'needs_review', stop_reason: 'archive_unavailable' } : unavailable();
    }
    if (input.state !== 'ready' && input.state !== 'no_success') return { status: input.state === 'needs_review' ? 'needs_review' : 'paused', stop_reason: input.state === 'needs_review' ? 'archive_unavailable' : 'retry_wait' };
    // no_success means no NEW anchor input after the stored cursor; an already
    // existing eligible gap may still resume on an idle cron invocation.
    if (input.state === 'ready') {
    const selected = input.input!;
    let payload: Record<string, unknown>;
    try {
      const readDeadline = Math.min(anchorDeadline - 5000, now() + 20_000);
      const original = await privateOriginal(deps.privateClient(readDeadline, signal), selected.original_path, selected.byte_size, selected.response_sha256, readDeadline, signal, now);
      let feed;
      try { feed = await bounded(parseRtnNewsRss(original, 'application/rss+xml', selected.resolved_feed_url), readDeadline, signal, now); }
      catch { throw new Error('RTN_ARCHIVE_ORIGINAL_PARSE_FAILED'); }
      payload = { status: 'success', parser_format: 'rtn-rss-anchor-v1', response_sha256: selected.response_sha256, byte_size: selected.byte_size,
        items: feed.items.map(({ canonical_url, published_at, content_sha256 }) => ({ canonical_url, published_at, raw_item_sha256: content_sha256 })).sort((a, b) => a.canonical_url < b.canonical_url ? -1 : a.canonical_url > b.canonical_url ? 1 : 0) };
    } catch (error) {
      const code = error instanceof OriginalFailure ? error.kind === 'hash' ? 'RTN_ARCHIVE_ORIGINAL_HASH_CONFLICT' : 'RTN_ARCHIVE_ORIGINAL_READ_FAILED' : 'RTN_ARCHIVE_ORIGINAL_PARSE_FAILED';
      payload = { status: 'error', error_code: code };
    }
    // Outside private-read/parse catch: an unknown committed record must NEVER
    // be contradicted by a second error record or followed by a publisher GET.
    const anchored = anchorReceipt(await rpc(anchorClient, 'record_rtn_news_archive_anchor', { p_rss_run_id: selected.rss_run_id, p_result: payload }, Math.min(anchorDeadline, now() + 5000), signal, now));
    if (payload.status === 'error') return { status: anchored === 'needs_review' ? 'needs_review' : 'error', stop_reason: 'source_error' };
    if (anchored === 'needs_review') return { status: 'needs_review', stop_reason: 'source_error' };
    if (anchored === 'probe_error') return unavailable();
    }
    if (overallDeadlineAt - now() < 50_000) return { status: 'paused', stop_reason: 'local_deadline' };
    return await deps.transport.withArchiveTransport(async scope => {
      const claimClient = deps.privateClient(overallDeadlineAt, signal);
      const owned = claim(await rpc(claimClient, 'claim_rtn_news_archive_gap', undefined, Math.min(overallDeadlineAt, now() + 5000), signal, now));
      if (!owned) return { status: 'idle', stop_reason: null };
      const deadline = Math.min(overallDeadlineAt, now() + 70_000, utc6Milliseconds(owned.invocation_deadline_at), utc6Milliseconds(owned.lease_expires_at));
      if (!available(deadline)) return unavailable();
      let delegated: typeof fetch | null = null, authorityLost = false, transportFailure: string | null = null;
      const factory = createRtnArchiveFetcher({ now, signal, fetcher: (input, init) => {
        if (!delegated) return Promise.reject(new LostPublisherAuthority());
        return delegated(input, init).catch(error => {
          if (isLostPublisherAuthority(error)) authorityLost = true;
          if (error instanceof Error && error.message === 'RTN_NEWS_TLS_TIMEOUT') transportFailure = 'RTN_ARCHIVE_TIMEOUT';
          if (error instanceof Error && error.message === 'RTN_NEWS_TLS_ABORTED') transportFailure = 'RTN_ARCHIVE_ABORTED';
          throw error;
        });
      } });
      let next = owned.request;
      const used = new Set<string>();
      for (let attempted = 0; attempted < 3; attempted++) {
        if (!available(deadline) || used.has(next.request_id) || utc6Milliseconds(next.request_deadline_at) <= now()
          || utc6Milliseconds(next.request_deadline_at) > deadline) return unavailable();
        used.add(next.request_id);
        transportFailure = null;
        const before = factory.usage().response_bytes;
        let result: Record<string, unknown>;
        try {
          const fetched = await scope.withGrant(next, async (fetcher, observation) => {
            delegated = fetcher;
            try {
              const page = await bounded(factory.fetchPage(next.page_url), Math.min(deadline, utc6Milliseconds(next.request_deadline_at)), signal, now);
              const native = observation();
              if (native.resolved_url !== next.page_url || native.content_type !== page.observation.content_type || native.content_type.length > 128) throw new LostPublisherAuthority();
              return { page, native };
            } finally { delegated = null; }
          });
          const privateDeadline = Math.min(deadline - 5000, now() + 20_000);
          const path = await storeArchive(deps.privateClient(privateDeadline, signal), fetched.page, privateDeadline, signal, now);
          const yieldAfter = attempted >= 2 || deadline - now() < 50_000 || owned.remaining.get_attempts <= attempted;
          result = { status: 'success', page: fetched.page.page, original_path: path, resolved_url: fetched.native.resolved_url,
            content_type: fetched.page.observation.content_type, decoded_encoding: fetched.page.observation.decoded_encoding,
            body_bytes_seen: fetched.page.observation.body_bytes_seen, yield_after: yieldAfter };
        } catch (error) {
          if (authorityLost || isLostPublisherAuthority(error) || error instanceof Unavailable
            || error instanceof Error && /^RTN_ARCHIVE_(?:INVOCATION_BUDGET_EXHAUSTED|CLOCK_INVALID|CONCURRENT_FETCH_FORBIDDEN|PAGE_URL_INVALID)$/.test(error.message)) return unavailable();
          const received = factory.usage().response_bytes - before;
          result = { status: 'error', error_code: transportFailure || pageError(error), body_bytes_seen: Math.min(received, RTN_ARCHIVE_BYTE_LIMIT + 1), byte_limit_exceeded: received > RTN_ARCHIVE_BYTE_LIMIT };
        }
        // Single completion outside fetch/storage catch. Lost/invalid ACK or
        // 40001 has UNKNOWN/changed authority semantics, never a second result.
        const completed = pageReceipt(await rpc(deps.privateClient(deadline, signal), 'complete_rtn_news_archive_request', {
          p_request_id: next.request_id, p_lease_token: owned.lease_token, p_generation: owned.generation, p_result: result,
        }, Math.min(deadline, now() + 5000), signal, now));
        if (completed.status !== 'continue') return { status: completed.status, stop_reason: completed.stop_reason };
        if (result.status === 'error') return unavailable();
        if (factory.usage().get_attempts >= 3 || deadline - now() < 50_000) return { status: 'yielded', stop_reason: null };
        const authorized = object(await rpc(deps.privateClient(deadline, signal), 'authorize_rtn_news_archive_request', {
          p_gap_id: owned.gap_id, p_lease_token: owned.lease_token, p_generation: owned.generation,
        }, Math.min(deadline, now() + 5000), signal, now));
        if (authorized.status === 'paused') {
          exact(authorized, ['status','reason']);
          if (!pausedReasons.includes(String(authorized.reason))) return unavailable();
          return { status: authorized.reason === 'needs_review' || authorized.reason === 'budget_exhausted' ? 'needs_review' : 'paused', stop_reason: String(authorized.reason) };
        }
        exact(authorized, ['status','request']);
        if (authorized.status !== 'granted') return unavailable();
        next = grant(authorized.request);
      }
      return { status: 'yielded', stop_reason: null };
    }, signal);
  } catch { return unavailable(); }
}
