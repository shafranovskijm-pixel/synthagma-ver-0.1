
// Portable Web Standards factory. The separate reviewed Deno entrypoint reads
// trusted runtime configuration; HTTP input never selects credentials or host.
// No signed/public URL fallback and no programme-review acceptance authority.
const API = 'https://api.xn--80aaiswd0ak.xn--p1ai';
const SITE = 'https://xn--80aaiswd0ak.xn--p1ai';
const OWN = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95';
const MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX_SHA = /^[0-9a-f]{64}$/;

export interface FileByteServerConfig {
  publicApiKey: string;
  workerServiceKey: string;
  /** Fresh independently accepted SQL enforcement stamp after real installation. */
  expectedEnforcementSHA256: string;
}
class PcfError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
function check(value: unknown, code: string, status = 400): asserts value {
  if (!value) throw new PcfError(code, status);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fieldUUID(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
async function digest(bytes: Uint8Array): Promise<string> {
  const exact = new Uint8Array(bytes.byteLength);
  exact.set(bytes);
  return encodeHex(new Uint8Array(await crypto.subtle.digest('SHA-256', exact)));
}
function encodeHex(bytes: Uint8Array): string {
  // One bounded ASCII byte array avoids an 8-million-element JS string array.
  const digits = '0123456789abcdef';
  const ascii = new Uint8Array(bytes.byteLength * 2);
  for (let i = 0; i < bytes.byteLength; i++) {
    ascii[2 * i] = digits.charCodeAt(bytes[i] >>> 4);
    ascii[2 * i + 1] = digits.charCodeAt(bytes[i] & 15);
  }
  return new TextDecoder().decode(ascii);
}
function decodeHex(hex: string): Uint8Array {
  // Caller first checks exact sealed length, cap, and lowercase hex alphabet.
  const bytes = new Uint8Array(hex.length / 2);
  const nibble = (code: number) => code <= 57 ? code - 48 : code - 87;
  for (let i = 0; i < bytes.byteLength; i++) {
    bytes[i] = (nibble(hex.charCodeAt(2 * i)) << 4) | nibble(hex.charCodeAt(2 * i + 1));
  }
  return bytes;
}

async function readBounded(stream: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  check(stream !== null, 'PCF_BODY_MISSING');
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let rejectAbort: ((error: PcfError) => void) | null = null;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const cancel = () => {
    const error = new PcfError('PCF_REQUEST_CANCELLED', 408);
    rejectAbort?.(error);
    void reader.cancel(error).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) cancel();
    while (true) {
      const result = await Promise.race([reader.read(), aborted]);
      if (result.done) break;
      check(result.value instanceof Uint8Array, 'PCF_NON_BYTE_RESPONSE');
      length += result.value.byteLength;
      check(Number.isSafeInteger(length) && length <= limit, 'PCF_OPERATIONAL_SIZE_LIMIT', 413);
      chunks.push(Uint8Array.from(result.value));
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    rejectAbort = null;
    try { reader.releaseLock(); } catch { /* cancellation may still own a pending read */ }
  }
}
function json(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new PcfError('PCF_INVALID_JSON_RESPONSE', 502); }
}
function authToken(request: Request): string {
  const header = request.headers.get('authorization') || '';
  check(/^Bearer [A-Za-z0-9._~-]{10,16384}$/.test(header), 'PCF_ORDINARY_AUTH_REQUIRED', 401);
  return header.slice(7);
}
function cors(request: Request): Headers {
  const origin = request.headers.get('origin');
  check(origin === null || origin === SITE, 'PCF_ORIGIN_NOT_ALLOWED', 403);
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  if (origin === SITE) {
    headers.set('Access-Control-Allow-Origin', SITE);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'authorization, content-type, apikey, x-client-info');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Expose-Headers', 'content-disposition, x-file-sha256, x-file-receipt-id');
  }
  return headers;
}
function responseJSON(value: unknown, headers: Headers, status = 200): Response {
  headers.set('Content-Type', 'application/json;charset=utf-8');
  return new Response(JSON.stringify(value), { headers, status });
}
function safeFailure(error: unknown, headers: Headers): Response {
  const known = error instanceof PcfError;
  return responseJSON({ error: known ? error.code : 'PCF_OPERATION_FAILED' }, headers, known ? error.status : 502);
}
function safeReceipt(wire: unknown): Record<string, unknown> {
  check(record(wire) && fieldUUID(wire.receipt_id) && fieldUUID(wire.intent_id) && fieldUUID(wire.course_id)
    && fieldUUID(wire.marketplace_id) && fieldUUID(wire.reference_id) && fieldUUID(wire.captured_edition_id)
    && ['course_document', 'lesson_attachment'].includes(String(wire.reference_kind))
    && (wire.source_org_version_id === null || fieldUUID(wire.source_org_version_id))
    && typeof wire.file_bytes_sha256 === 'string' && HEX_SHA.test(wire.file_bytes_sha256)
    && Number.isSafeInteger(wire.byte_length) && Number(wire.byte_length) > 0 && Number(wire.byte_length) <= MAX_BYTES
    && wire.state === 'bytes_sealed' && typeof wire.replayed === 'boolean', 'PCF_RECEIPT_RESPONSE_MISMATCH', 502);
  return Object.fromEntries(['receipt_id', 'intent_id', 'course_id', 'marketplace_id', 'reference_kind', 'reference_id',
    'captured_edition_id', 'source_org_version_id', 'file_bytes_sha256', 'byte_length', 'recorded_at', 'state',
    'replayed', 'source_bucket_public_at_capture', 'proof_scope'].map(name => [name, wire[name] ?? null]));
}

/** Authoritative identity is supplied by the own-intent SQL loader, never HTTP input. */
function captureTarget(load: Record<string, unknown>, intent: string, actor: string): Record<string, unknown> {
  const reference = load.reference;
  check(load.intent_id === intent && load.actor_id === actor && fieldUUID(load.marketplace_id)
    && record(reference) && reference.organization_id === OWN && fieldUUID(reference.course_id)
    && fieldUUID(reference.reference_id) && ['course_document', 'lesson_attachment'].includes(String(reference.reference_kind))
    && (reference.source_org_version_id === null || fieldUUID(reference.source_org_version_id)),
  'PCF_INTENT_CONTEXT_OR_ENFORCEMENT', 409);
  return { intent_id: intent, course_id: reference.course_id, marketplace_id: load.marketplace_id,
    reference_kind: reference.reference_kind, reference_id: reference.reference_id,
    source_org_version_id: reference.source_org_version_id };
}
function assertReceiptTarget(receipt: Record<string, unknown>, target: Record<string, unknown>, code: string): void {
  check(['intent_id', 'course_id', 'marketplace_id', 'reference_kind', 'reference_id', 'source_org_version_id']
    .every(field => receipt[field] === target[field]), code, 502);
}

export function createPlatformCourseFileByteHandlers(config: FileByteServerConfig): {
  capture(request: Request): Promise<Response>; read(request: Request): Promise<Response>;
} {
  check(typeof config.publicApiKey === 'string' && config.publicApiKey.length >= 20
    && typeof config.workerServiceKey === 'string' && config.workerServiceKey.length >= 20
    && config.workerServiceKey !== config.publicApiKey && HEX_SHA.test(config.expectedEnforcementSHA256),
  'PCF_SERVER_CONFIGURATION_REQUIRED', 503);
  // Clone secrets/config once; HTTP input cannot override API host, RPC names,
  // keys, verifier stamp, source path, byte hash or approval state.
  const settings = Object.freeze({ ...config });
  async function fetchFixed(path: string, init: RequestInit, timeout: number, signal: AbortSignal): Promise<Response> {
    check(path.startsWith('/') && !path.startsWith('//') && !path.includes('#'), 'PCF_FIXED_PATH_REQUIRED');
    try {
      return await fetch(API + path, { ...init, redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]) });
    } catch { throw new PcfError(signal.aborted ? 'PCF_REQUEST_CANCELLED' : 'PCF_NETWORK_OR_DEADLINE', 408); }
  }
  async function ordinaryUser(token: string, signal: AbortSignal): Promise<string> {
    const res = await fetchFixed('/sb-api/auth/v1/user', { method: 'GET', headers: {
      apikey: settings.publicApiKey, Authorization: 'Bearer ' + token, Accept: 'application/json',
    } }, 8000, signal);
    check(res.status === 200, 'PCF_ORDINARY_AUTH_REQUIRED', 401);
    const user = json(await readBounded(res.body, 65536, signal));
    check(record(user) && fieldUUID(user.id), 'PCF_ORDINARY_AUTH_RESPONSE', 401);
    return user.id;
  }
  type RpcName = 'load_platform_course_file_capture_worker' | 'finish_platform_course_file_capture_worker' | 'read_platform_course_file_receipt';
  async function rpc(name: RpcName, args: Record<string, unknown>, token: string, worker: boolean,
    signal: AbortSignal, limit = 65536): Promise<unknown> {
    const key = worker ? settings.workerServiceKey : settings.publicApiKey;
    const res = await fetchFixed('/sb-api/rest/v1/rpc/' + name, { method: 'POST', headers: {
      apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
      'Content-Profile': 'public', 'Accept-Profile': 'public',
    }, body: JSON.stringify(args) }, 10000, signal);
    const wire = json(await readBounded(res.body, limit, signal));
    if (res.status !== 200) {
      const message = record(wire) && typeof wire.message === 'string' && /^PCF_[A-Z0-9_]{1,80}$/.test(wire.message)
        ? wire.message : 'PCF_RPC_FAILED';
      throw new PcfError(message, res.status === 401 || res.status === 403 ? 403 : 409);
    }
    return wire;
  }
  async function bodyID(request: Request, key: string, signal: AbortSignal): Promise<string> {
    const wire = json(await readBounded(request.body, 1024, signal));
    check(record(wire) && Object.keys(wire).length === 1 && fieldUUID(wire[key]), 'PCF_ONLY_OPAQUE_ID_ACCEPTED');
    return wire[key];
  }
  function sourcePath(reference: Record<string, unknown>): string {
    const bucket = reference.source_bucket, key = reference.source_key;
    check(typeof bucket === 'string' && ['org-documents', 'library-files', 'course-files'].includes(bucket)
      && typeof key === 'string' && key.length > 0 && key.length <= 2048
      && !/[\u0000-\u001f\u007f\\%?#]/.test(key)
      && !key.split('/').some(part => part === '' || part === '.' || part === '..'), 'PCF_SOURCE_LOCATOR_INVALID');
    const course = reference.course_id;
    check(fieldUUID(course) && reference.organization_id === OWN && fieldUUID(reference.source_object_id)
      && typeof reference.source_bucket_public === 'boolean', 'PCF_SOURCE_SCOPE_INVALID');
    check(bucket === 'org-documents' ? key.startsWith(OWN + '/')
      : bucket === 'library-files' ? key.startsWith('library/' + OWN + '/')
        : key.startsWith(course + '/') || key.startsWith('courses/' + course + '/'), 'PCF_SOURCE_SCOPE_INVALID');
    return '/sb-storage/object/authenticated/' + bucket + '/' + key.split('/').map(encodeURIComponent).join('/');
  }
  async function capture(request: Request): Promise<Response> {
    let headers = new Headers({ 'Cache-Control': 'private, no-store' });
    try {
      headers = cors(request);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      check(request.method === 'POST', 'PCF_POST_REQUIRED', 405);
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45000)]);
      const token = authToken(request), intent = await bodyID(request, 'intent_id', signal);
      const actor = await ordinaryUser(token, signal);
      const load = await rpc('load_platform_course_file_capture_worker', { p_intent_id: intent, p_authenticated_user: actor },
        settings.workerServiceKey, true, signal);
      check(record(load) && load.protocol === 'pcf-bytea/1' && typeof load.completed === 'boolean', 'PCF_INTENT_RESPONSE_INVALID', 502);
      const target = captureTarget(load, intent, actor);
      if (load.completed) {
        const receipt = safeReceipt(load.receipt);
        assertReceiptTarget(receipt, target, 'PCF_COMPLETED_TARGET_MISMATCH');
        check(receipt.replayed === true, 'PCF_COMPLETED_REPLAY_REQUIRED', 502);
        return responseJSON(receipt, headers);
      }
      check(load.max_bytes === MAX_BYTES && load.enforcement_sha256 === settings.expectedEnforcementSHA256
        && record(load.reference), 'PCF_INTENT_CONTEXT_OR_ENFORCEMENT', 409);
      const path = sourcePath(load.reference);
      // Never the worker key: the real ordinary user token/RLS reads the source.
      const res = await fetchFixed(path, { method: 'GET', headers: {
        apikey: settings.publicApiKey, Authorization: 'Bearer ' + token, 'Accept-Encoding': 'identity',
      } }, 15000, signal);
      check(res.status === 200, res.status === 401 || res.status === 403 ? 'PCF_SOURCE_AUTHENTICATED_READ_DENIED' : 'PCF_SOURCE_FULL_RESPONSE_REQUIRED', 409);
      check(!res.headers.get('content-encoding') || res.headers.get('content-encoding') === 'identity', 'PCF_SOURCE_ENCODING_UNCONFIRMED', 409);
      const declared = res.headers.get('content-length');
      check(declared === null || /^\d+$/.test(declared) && Number(declared) <= MAX_BYTES, 'PCF_OPERATIONAL_SIZE_LIMIT', 413);
      const bytes = await readBounded(res.body, MAX_BYTES, signal);
      check(bytes.byteLength > 0 && (declared === null || Number(declared) === bytes.byteLength), 'PCF_SOURCE_LENGTH_MISMATCH', 409);
      const expectedLength = load.reference.expected_byte_length;
      check(expectedLength === null || expectedLength === bytes.byteLength, 'PCF_DECLARED_SIZE_MISMATCH', 409);
      const sha = await digest(bytes), capturedEdition = crypto.randomUUID();
      const wire = await rpc('finish_platform_course_file_capture_worker', {
        p_intent_id: intent, p_authenticated_user: actor, p_captured_edition: capturedEdition,
        p_bytes_hex: encodeHex(bytes), p_file_sha256: sha,
        p_capture_enforcement_sha256: settings.expectedEnforcementSHA256,
      }, settings.workerServiceKey, true, signal);
      const receipt = safeReceipt(wire);
      assertReceiptTarget(receipt, target, 'PCF_COMMITTED_TARGET_MISMATCH');
      check(receipt.intent_id === intent && receipt.file_bytes_sha256 === sha && receipt.byte_length === bytes.byteLength,
        'PCF_COMMITTED_RECEIPT_MISMATCH', 502);
      check(receipt.replayed === true || receipt.captured_edition_id === capturedEdition,
        'PCF_COMMITTED_EDITION_MISMATCH', 502);
      // Replayed is a historical idempotent result. It is not a fresh review.
      return responseJSON(receipt, headers);
    } catch (error) { return safeFailure(error, headers); }
  }
  async function read(request: Request): Promise<Response> {
    let headers = new Headers({ 'Cache-Control': 'private, no-store' });
    try {
      headers = cors(request);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      check(request.method === 'POST', 'PCF_POST_REQUIRED', 405);
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45000)]);
      const token = authToken(request), receiptID = await bodyID(request, 'receipt_id', signal);
      await ordinaryUser(token, signal);
      const wire = await rpc('read_platform_course_file_receipt', { p_receipt_id: receiptID }, token, false, signal, 2 * MAX_BYTES + 65536);
      const summary = safeReceipt(wire);
      check(record(wire) && summary.receipt_id === receiptID && typeof wire.bytes_hex === 'string'
        && wire.bytes_hex.length === 2 * Number(summary.byte_length) && /^[a-f0-9]+$/.test(wire.bytes_hex), 'PCF_STORED_BYTES_RESPONSE_INVALID', 502);
      const bytes = decodeHex(wire.bytes_hex);
      check(bytes.length === summary.byte_length && await digest(bytes) === summary.file_bytes_sha256, 'PCF_STORED_BYTE_INTEGRITY', 409);
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Content-Disposition', 'attachment; filename="verified-course-file.bin"');
      headers.set('Content-Length', String(bytes.length));
      headers.set('X-File-SHA256', String(summary.file_bytes_sha256));
      headers.set('X-File-Receipt-Id', receiptID);
      return new Response(bytes, { status: 200, headers });
    } catch (error) { return safeFailure(error, headers); }
  }
  return { capture, read };
}
