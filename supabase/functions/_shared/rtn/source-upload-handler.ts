import { assertDocumentMagic, officialUrl, sha256, validateInflatedXlsx, type SourceDescriptor } from './official-source.ts';
import type { Normalizer } from './check-worker.ts';

export const RTN_UPLOAD_FILE_BYTES = 16 * 1024 * 1024;
export const RTN_UPLOAD_METADATA_BYTES = 64 * 1024;
export const RTN_UPLOAD_TOTAL_BYTES = RTN_UPLOAD_FILE_BYTES + RTN_UPLOAD_METADATA_BYTES + 64 * 1024;
export const RTN_UPLOAD_TIMEOUT_MS = 90_000;
export const RTN_UPLOAD_BODY_TIMEOUT_MS = 20_000;
// The final RPC caps jsonb::text at 2 MB. Compact JSON alone understates the
// spaces and expanded numeric exponents added by PostgreSQL's jsonb renderer.
const NORMALIZED_JSON_BYTES = 1_500_000;
const NORMALIZED_JSONB_BYTES = 2_000_000;
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type SourceUploadService = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
  storage: { from(bucket: string): {
    upload(path: string, bytes: Uint8Array, options: { contentType: string; upsert: false }): PromiseLike<{ error: { statusCode?: string | number; message?: string } | null }>;
    download(path: string): { asStream(): PromiseLike<{ data: ReadableStream<Uint8Array> | null; error: unknown }> };
  } };
};
type UploadUser = {
  auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
};
export type SourceUploadWork = { service: SourceUploadService; user(authorization: string): UploadUser; normalize: Normalizer };
type Dependencies = { createWork(deadlineAt: number, signal: AbortSignal): SourceUploadWork; now?: () => number };
type Metadata = { sourceId: string; intakeRequestId: string; expectedSourceGeneration: number; publicationPageUrl: string; documentUrl: string; attestationVersion: 'official-current-location-v1' };
type Receipt = { intake_id: string; request_id: string; source_id: string; revision_id: string; sha256: string; byte_size: number; received_at: string; acquisition_method: 'admin_upload'; replayed: boolean; normalization_required: boolean; accepted_generation: number; still_current: boolean; automatic_verification_advanced: false };
// Auth contains a real legacy-shaped admin UUID; PostgreSQL does not require a
// particular RFC version/variant. These bytes come only from genuine getUser.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const META_KEYS = ['attestationVersion','documentUrl','expectedSourceGeneration','intakeRequestId','publicationPageUrl','sourceId'];
const RECEIPT_KEYS = ['accepted_generation','acquisition_method','automatic_verification_advanced','byte_size','intake_id','normalization_required','received_at','replayed','request_id','revision_id','sha256','source_id','still_current'];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
class UploadError extends Error { constructor(readonly status: number, readonly safeCode: string) { super(safeCode); } }
const fail: (status: number, code: string) => never = (status, code) => { throw new UploadError(status, code); };
const invalid: () => never = () => fail(400, 'RTN_UPLOAD_INVALID_REQUEST');
const unavailable: () => never = () => fail(503, 'RTN_UPLOAD_UNAVAILABLE');
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function boundedNormalization(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 128) return [];
  const encoded = JSON.stringify(value);
  if (new TextEncoder().encode(encoded).byteLength > NORMALIZED_JSON_BYTES) return [];
  // Round-trip to the exact plain JSON payload that will cross the RPC boundary.
  const plain: unknown[] = JSON.parse(encoded); let nodes = 0;
  const bytes = (part: unknown, depth: number): number => {
    if (depth > 32 || ++nodes > 100_000) throw new Error('normalization shape');
    if (part === null) return 4;
    if (typeof part === 'boolean') return part ? 4 : 5;
    if (typeof part === 'string') {
      // PostgreSQL UTF8 jsonb rejects NUL and unpaired UTF16 surrogates.
      if (/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(part)) throw new Error('normalization Unicode');
      return new TextEncoder().encode(JSON.stringify(part)).byteLength;
    }
    if (typeof part === 'number') {
      const text = JSON.stringify(part), match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);
      if (!match) return text.length;
      const digits = match[2].length + (match[3]?.length || 0), position = match[2].length + Number(match[4]);
      return match[1].length + (position <= 0 ? 2 - position + digits : position >= digits ? position : digits + 1);
    }
    const children = Array.isArray(part) ? part : Object.entries(part as Record<string, unknown>);
    let total = 2;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      total += (i ? 2 : 0) + (Array.isArray(part) ? bytes(child, depth + 1)
        : bytes((child as [string, unknown])[0], depth + 1) + 2 + bytes((child as [string, unknown])[1], depth + 1));
      if (total > NORMALIZED_JSONB_BYTES) throw new Error('normalization size');
    }
    return total;
  };
  return bytes(plain, 0) <= NORMALIZED_JSONB_BYTES ? plain : [];
}

async function within<T>(pending: PromiseLike<T>, signal: AbortSignal, late?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const stop = () => { if (!done) { done = true; signal.removeEventListener('abort', stop); reject(new UploadError(503, 'RTN_UPLOAD_UNAVAILABLE')); } };
    signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) stop();
    Promise.resolve(pending).then(value => {
      if (done) { try { late?.(value); } catch { /* No late resource can change the outcome. */ } return; }
      done = true; signal.removeEventListener('abort', stop); resolve(value);
    }, error => { if (!done) { done = true; signal.removeEventListener('abort', stop); reject(error); } });
  });
}
function active(signal: AbortSignal): void { if (signal.aborted) unavailable(); }
function discard(body?: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array> | null): void {
  try { void body?.cancel().catch(() => undefined); } catch { /* Cancellation is best effort, never an unbounded wait. */ }
}

async function admin(user: UploadUser, signal: AbortSignal, expectedActor?: string) {
  active(signal);
  const auth = await within(user.auth.getUser(), signal); active(signal);
  if (auth.error || !auth.data.user || !UUID.test(auth.data.user.id)) fail(401, 'RTN_UPLOAD_AUTH_REQUIRED');
  const actor = auth.data.user.id.toLowerCase();
  if (expectedActor && actor !== expectedActor) fail(403, 'RTN_UPLOAD_ADMIN_REQUIRED');
  const editorial = await within(user.rpc('get_rtn_editorial_workspace'), signal); active(signal);
  if (editorial.error) {
    if (editorial.error.code === '42501') fail(403, 'RTN_UPLOAD_ADMIN_REQUIRED');
    unavailable();
  }
  if (!record(editorial.data) || !Array.isArray(editorial.data.sources)) unavailable();
  const capability = editorial.data.manual_source_import_capability;
  if (!record(capability) || capability.version !== 'rtn-manual-intake-v1'
    || capability.attestation_version !== 'official-current-location-v1'
    || capability.max_file_bytes !== RTN_UPLOAD_FILE_BYTES) unavailable();
  return { actor, sources: editorial.data.sources };
}

async function multipart(request: Request, signal: AbortSignal): Promise<{ file: File; metadata: Metadata }> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.length > 512 || !/^multipart\/form-data\s*;\s*boundary=/i.test(contentType)) invalid();
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) invalid();
  if (declared !== null && Number(declared) > RTN_UPLOAD_TOTAL_BYTES) fail(413, 'RTN_UPLOAD_TOO_LARGE');
  if (!request.body) invalid();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), RTN_UPLOAD_BODY_TIMEOUT_MS);
  const bodySignal = AbortSignal.any([signal, controller.signal]);
  const reader = request.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await within(reader.read(), bodySignal);
      active(bodySignal);
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) invalid();
      size += part.value.byteLength;
      if (size > RTN_UPLOAD_TOTAL_BYTES) fail(413, 'RTN_UPLOAD_TOO_LARGE');
      parts.push(part.value.slice());
    }
    if (!size || declared !== null && size !== Number(declared)) invalid();
    const bytes = new Uint8Array(size); let at = 0;
    for (const part of parts) { bytes.set(part, at); at += part.byteLength; }
    parts.length = 0;
    let form: FormData;
    try { form = await within(new Response(bytes, { headers: { 'Content-Type': contentType } }).formData(), bodySignal); }
    catch (error) { if (bodySignal.aborted) throw error; return invalid(); }
    active(bodySignal);
    const entries = [...form.entries()];
    if (entries.length !== 2 || entries.map(([key]) => key).sort().join(',') !== 'file,metadata') invalid();
    const file = form.get('file'), raw = form.get('metadata');
    if (!(file instanceof File) || typeof raw !== 'string' || !file.size) invalid();
    if (file.size > RTN_UPLOAD_FILE_BYTES || new TextEncoder().encode(raw).byteLength > RTN_UPLOAD_METADATA_BYTES) fail(413, 'RTN_UPLOAD_TOO_LARGE');
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return invalid(); }
    if (!record(value) || Object.keys(value).sort().join(',') !== META_KEYS.join(',')) invalid();
    if (typeof value.sourceId !== 'string' || !UUID.test(value.sourceId)
      || typeof value.intakeRequestId !== 'string' || !UUID.test(value.intakeRequestId)
      || !Number.isSafeInteger(value.expectedSourceGeneration) || Number(value.expectedSourceGeneration) < 0 || Number(value.expectedSourceGeneration) > 2147483647
      || value.attestationVersion !== 'official-current-location-v1') invalid();
    for (const field of ['publicationPageUrl','documentUrl']) {
      const url = value[field];
      if (typeof url !== 'string' || url.length > 4000 || /[\u0000-\u0020\u007f\\]/u.test(url)) invalid();
      try { value[field] = officialUrl(url).href; } catch { return invalid(); }
    }
    return { file, metadata: { ...value, sourceId: value.sourceId.toLowerCase(), intakeRequestId: value.intakeRequestId.toLowerCase() } as Metadata };
  } finally {
    clearTimeout(timer); discard(reader);
    try { reader.releaseLock(); } catch { /* A pending cancelled read releases after settlement. */ }
  }
}

function descriptor(sources: unknown[], id: string): SourceDescriptor {
  const found = sources.filter(value => record(value) && value.id === id);
  if (found.length !== 1 || !record(found[0])) invalid();
  const source = found[0];
  if (source.parser !== 'industrial-pdf' && source.parser !== 'energy-xlsx'
    || source.trusted_anchor_rule !== (source.parser === 'industrial-pdf' ? 'a1' : 'energy-xlsx')
    || typeof source.page_url !== 'string' || typeof source.document_url !== 'string'
    || source.last_sha256 !== null && (typeof source.last_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(source.last_sha256))) unavailable();
  return { id, page_url: source.page_url, document_url: source.document_url, parser: source.parser,
    trusted_anchor_rule: source.parser === 'industrial-pdf' ? 'a1' : 'energy-xlsx', last_sha256: source.last_sha256 };
}

async function verifiedPrivateHash(stream: ReadableStream<Uint8Array>, expected: number, signal: AbortSignal): Promise<string> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), RTN_UPLOAD_BODY_TIMEOUT_MS);
  const readSignal = AbortSignal.any([signal, controller.signal]);
  const reader = stream.getReader(), parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await within(reader.read(), readSignal); active(readSignal);
      if (part.done) break;
      if (!(part.value instanceof Uint8Array) || size + part.value.byteLength > expected || size + part.value.byteLength > RTN_UPLOAD_FILE_BYTES) unavailable();
      size += part.value.byteLength; parts.push(part.value.slice());
    }
    if (size !== expected) unavailable();
    const bytes = new Uint8Array(size); let at = 0;
    for (const part of parts) { bytes.set(part, at); at += part.byteLength; }
    return await within(sha256(bytes), readSignal);
  } finally {
    clearTimeout(timer);
    discard(reader); try { reader.releaseLock(); } catch { /* Pending read settles after cancellation. */ }
  }
}

function receipt(value: unknown, metadata: Metadata, hash: string, size: number): Receipt {
  if (!record(value) || Object.keys(value).sort().join(',') !== RECEIPT_KEYS.join(',')) unavailable();
  for (const key of ['intake_id','request_id','source_id','revision_id']) if (typeof value[key] !== 'string' || !UUID.test(value[key])) unavailable();
  if (String(value.request_id).toLowerCase() !== metadata.intakeRequestId || String(value.source_id).toLowerCase() !== metadata.sourceId
    || value.sha256 !== hash || value.byte_size !== size || value.acquisition_method !== 'admin_upload' || value.automatic_verification_advanced !== false
    || typeof value.replayed !== 'boolean' || typeof value.normalization_required !== 'boolean' || typeof value.still_current !== 'boolean'
    || !Number.isSafeInteger(value.accepted_generation) || Number(value.accepted_generation) < metadata.expectedSourceGeneration
    || typeof value.received_at !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value.received_at) || !Number.isFinite(Date.parse(value.received_at))) unavailable();
  return value as Receipt;
}

export function createRtnSourceUploadHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'RTN_UPLOAD_USE_POST' }, 405);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), RTN_UPLOAD_TIMEOUT_MS);
    const signal = AbortSignal.any([controller.signal, request.signal]);
    try {
      const authorization = request.headers.get('authorization');
      if (!authorization || !/^Bearer [^\s,]+$/.test(authorization)) fail(401, 'RTN_UPLOAD_AUTH_REQUIRED');
      const work = deps.createWork((deps.now || Date.now)() + RTN_UPLOAD_TIMEOUT_MS, signal), user = work.user(authorization);
      const initial = await admin(user, signal);
      const parsed = await multipart(request, signal); active(signal);
      const current = await admin(user, signal, initial.actor), source = descriptor(current.sources, parsed.metadata.sourceId);
      const bytes = new Uint8Array(await within(parsed.file.arrayBuffer(), signal)); active(signal);
      try { assertDocumentMagic(bytes, source.parser); }
      catch { fail(415, 'RTN_UPLOAD_UNSUPPORTED_FILE'); }
      if (source.parser === 'energy-xlsx') {
        try { await within(validateInflatedXlsx(bytes), signal); active(signal); }
        catch (error) { if (signal.aborted) throw error; fail(415, 'RTN_UPLOAD_UNSUPPORTED_FILE'); }
      }
      const hash = await within(sha256(bytes), signal); active(signal);
      let normalized: unknown[] = [];
      try {
        const result = await within(work.normalize(bytes.slice(), hash, source), signal); active(signal);
        normalized = boundedNormalization(result);
      } catch (error) { if (signal.aborted) throw error; /* A verified original can await supported normalization. */ }
      await admin(user, signal, initial.actor); active(signal);
      const extension = source.parser === 'industrial-pdf' ? 'pdf' : 'xlsx';
      const mediaType = extension === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const path = `${source.id}/${hash}.${extension}`, bucket = work.service.storage.from('rtn-sources');
      const uploaded = await within(bucket.upload(path, bytes, { contentType: mediaType, upsert: false }), signal); active(signal);
      if (uploaded.error && !(String(uploaded.error.statusCode) === '409'
        || String(uploaded.error.statusCode) === '400' && /already exists|duplicate/i.test(uploaded.error.message || ''))) unavailable();
      await admin(user, signal, initial.actor); active(signal);
      const existing = await within(bucket.download(path).asStream(), signal, value => discard(value.data)); active(signal);
      if (existing.error || !existing.data) unavailable();
      if (await verifiedPrivateHash(existing.data, bytes.byteLength, signal) !== hash) unavailable();
      await admin(user, signal, initial.actor); active(signal);
      const result = await within(work.service.rpc('finalize_rtn_manual_source_import', {
        p_actor_uid: initial.actor, p_request_id: parsed.metadata.intakeRequestId, p_source_id: source.id,
        p_expected_generation: parsed.metadata.expectedSourceGeneration,
        p_file: { sha256: hash, byte_size: bytes.byteLength, media_type: mediaType, original_path: path, parser: source.parser, original_verified: true },
        p_provenance: { publication_page_url: parsed.metadata.publicationPageUrl, document_url: parsed.metadata.documentUrl, attestation_version: parsed.metadata.attestationVersion },
        p_normalized_banks: normalized,
      }), signal); active(signal);
      if (result.error) {
        if (result.error.code === '42501') fail(403, 'RTN_UPLOAD_ADMIN_REQUIRED');
        if (result.error.code === '40001' && result.error.message === 'rtn_manual_import_historical_revision_requires_review') fail(409, 'RTN_IMPORT_HISTORICAL_REVISION_REQUIRES_REVIEW');
        if (['40001','55P03','23505'].includes(result.error.code || '')) fail(409, 'RTN_UPLOAD_SOURCE_CONFLICT');
        if (result.error.code === '22023') invalid();
        unavailable();
      }
      return json(receipt(result.data, parsed.metadata, hash, bytes.byteLength));
    } catch (error) {
      if (error instanceof UploadError) return json({ error: error.safeCode }, error.status);
      return json({ error: 'RTN_UPLOAD_UNAVAILABLE' }, 503);
    } finally { clearTimeout(timer); controller.abort(); discard(request.body); }
  };
}
