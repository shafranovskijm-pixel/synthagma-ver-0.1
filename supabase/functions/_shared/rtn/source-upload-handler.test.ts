// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRtnSourceUploadHandler, RTN_UPLOAD_BODY_TIMEOUT_MS, RTN_UPLOAD_FILE_BYTES, RTN_UPLOAD_METADATA_BYTES, RTN_UPLOAD_TIMEOUT_MS, RTN_UPLOAD_TOTAL_BYTES, type SourceUploadService } from './source-upload-handler';

const sourceId = 'c8b8b3b6-39d7-430b-b198-b5073b0741b2';
const requestId = '71000000-0000-4000-8000-000000000001';
const actor = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const page = 'https://www.gosnadzor.ru/service/list/Safety%20certification/current/index.php';
const document = 'https://www.gosnadzor.ru/service/list/Safety%20certification/current/a1.pdf';
const content = new TextEncoder().encode('%PDF-1.4\nSynthetic original, no real official questions.\n');
const hash = createHash('sha256').update(content).digest('hex');
const metadata = { sourceId, intakeRequestId: requestId, expectedSourceGeneration: 0,
  publicationPageUrl: page, documentUrl: document, attestationVersion: 'official-current-location-v1' };
type Reply = { data: unknown; error: { code?: string; message?: string } | null };
const plainStream = (bytes: Uint8Array) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });

function setup() {
  const state = {
    userId: actor, authenticated: true, adminAllowed: true, capability: true,
    source: { id: sourceId, parser: 'industrial-pdf', trusted_anchor_rule: 'a1', page_url: page, document_url: document, last_sha256: null },
    uploadError: null as { statusCode?: number | string; message?: string } | null,
    stored: content.slice(),
    receipt: { intake_id: '72000000-0000-4000-8000-000000000001', request_id: requestId, source_id: sourceId,
      revision_id: '73000000-0000-4000-8000-000000000001', sha256: hash, byte_size: content.byteLength,
      received_at: '2026-11-22T14:10:00.123456+00:00', acquisition_method: 'admin_upload', replayed: false,
      normalization_required: false, accepted_generation: 1, still_current: true, automatic_verification_advanced: false },
  };
  const getUser = vi.fn(async (): Promise<{ data: { user: { id: string } | null }; error: unknown }> => ({
    data: { user: state.authenticated ? { id: state.userId } : null }, error: null,
  }));
  const userRpc = vi.fn(async (_name: string): Promise<Reply> => state.adminAllowed ? { data: {
    sources: [state.source], ...(state.capability ? { manual_source_import_capability: {
      version: 'rtn-manual-intake-v1', attestation_version: 'official-current-location-v1', max_file_bytes: RTN_UPLOAD_FILE_BYTES,
    } } : {}),
  }, error: null } : { data: null, error: { code: '42501' } });
  const serviceRpc = vi.fn(async (_name: string, _args?: Record<string, unknown>): Promise<Reply> => ({ data: state.receipt, error: null }));
  const upload = vi.fn(async (_path: string, bytes: Uint8Array, _options: { contentType: string; upsert: false }) => {
    if (!state.uploadError) state.stored = bytes.slice();
    return { error: state.uploadError };
  });
  const asStream = vi.fn(async (): Promise<{ data: ReadableStream<Uint8Array> | null; error: unknown }> => ({ data: plainStream(state.stored), error: null }));
  const download = vi.fn((_path: string) => ({ asStream }));
  const from = vi.fn((_bucket: string) => ({ upload, download }));
  const normalize = vi.fn(async (_bytes: Uint8Array, _hash: string, _source: unknown): Promise<unknown[]> => [{
    code: 'A.1', title: 'Synthetic extracted text', domain: 'industrial-safety',
    questions: [{ id: 'synthetic-q1', number: 1, text: 'Synthetic source text', options: [] }],
  }]);
  const user = vi.fn((_authorization: string) => ({ auth: { getUser }, rpc: userRpc }));
  const service = { rpc: serviceRpc, storage: { from } } as SourceUploadService;
  const createWork = vi.fn((_deadline: number, _signal: AbortSignal) => ({ service, user, normalize }));
  const handler = createRtnSourceUploadHandler({ createWork });
  const form = (meta: unknown = metadata, bytes = content, filename = 'source.pdf') => {
    const result = new FormData(); result.append('file', new File([new Uint8Array(bytes).buffer], filename, { type: 'application/pdf' }));
    result.append('metadata', typeof meta === 'string' ? meta : JSON.stringify(meta)); return result;
  };
  const request = (body: FormData = form()) => new Request('https://fixture.invalid/rtn-source-upload', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-genuine-session' }, body,
  });
  return { state, getUser, userRpc, serviceRpc, upload, asStream, download, from, normalize, user, createWork, handler, form, request };
}
async function code(response: Response, status: number, error: string) {
  expect(response.status).toBe(status); expect(await response.json()).toEqual({ error });
}
function noPrivilegedWork(a: ReturnType<typeof setup>) {
  expect(a.upload).not.toHaveBeenCalled(); expect(a.download).not.toHaveBeenCalled(); expect(a.serviceRpc).not.toHaveBeenCalled();
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('manual original upload genuine authority and private-byte proof', () => {
  it('accepts the actual legacy-shaped admin UID, server-hashes bytes, independently reads new storage and commits once', async () => {
    const forbiddenFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No external HTTP in this fixture'));
    const a = setup(); const response = await a.handler(a.request(a.form(metadata, content, '../../untrusted-name.exe')));
    expect(response.status).toBe(200); expect(await response.json()).toEqual(a.state.receipt);
    expect(a.getUser).toHaveBeenCalledTimes(5); expect(a.userRpc).toHaveBeenCalledTimes(5);
    expect(a.user).toHaveBeenCalledWith('Bearer synthetic-genuine-session');
    expect(a.normalize).toHaveBeenCalledWith(expect.any(Uint8Array), hash, a.state.source);
    expect(a.from).toHaveBeenCalledWith('rtn-sources');
    expect(a.upload).toHaveBeenCalledExactlyOnceWith(`${sourceId}/${hash}.pdf`, content, { contentType: 'application/pdf', upsert: false });
    expect(a.download).toHaveBeenCalledExactlyOnceWith(`${sourceId}/${hash}.pdf`); expect(a.asStream).toHaveBeenCalledTimes(1);
    expect(a.serviceRpc).toHaveBeenCalledExactlyOnceWith('finalize_rtn_manual_source_import', {
      p_actor_uid: actor, p_request_id: requestId, p_source_id: sourceId, p_expected_generation: 0,
      p_file: { sha256: hash, byte_size: content.byteLength, media_type: 'application/pdf', original_path: `${sourceId}/${hash}.pdf`, parser: 'industrial-pdf', original_verified: true },
      p_provenance: { publication_page_url: page, document_url: document, attestation_version: 'official-current-location-v1' },
      p_normalized_banks: await a.normalize.mock.results[0].value,
    });
    expect(a.upload.mock.invocationCallOrder[0]).toBeLessThan(a.asStream.mock.invocationCallOrder[0]);
    expect(a.asStream.mock.invocationCallOrder[0]).toBeLessThan(a.serviceRpc.mock.invocationCallOrder[0]);
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });
  it('denies a non-admin before acquiring a reader or private capability', async () => {
    const a = setup(); a.state.adminAllowed = false; const request = a.request(), reader = vi.spyOn(request.body!, 'getReader');
    await code(await a.handler(request), 403, 'RTN_UPLOAD_ADMIN_REQUIRED');
    expect(reader).not.toHaveBeenCalled(); noPrivilegedWork(a);
  });
  it('does not read bytes when genuine getUser fails, regardless of a bearer-looking string', async () => {
    const a = setup(); a.state.authenticated = false; const request = a.request(), reader = vi.spyOn(request.body!, 'getReader');
    await code(await a.handler(request), 401, 'RTN_UPLOAD_AUTH_REQUIRED');
    expect(reader).not.toHaveBeenCalled(); expect(a.userRpc).not.toHaveBeenCalled(); noPrivilegedWork(a);
  });
  it('fails closed on a server without the installed manual capability before consuming the file', async () => {
    const a = setup(); a.state.capability = false; const request = a.request(), reader = vi.spyOn(request.body!, 'getReader');
    await code(await a.handler(request), 503, 'RTN_UPLOAD_UNAVAILABLE'); expect(reader).not.toHaveBeenCalled(); noPrivilegedWork(a);
  });
  it('rejects duplicate multipart parts and unknown client actor/SHA/date metadata', async () => {
    const a = setup(), duplicate = a.form(); duplicate.append('metadata', JSON.stringify(metadata));
    await code(await a.handler(a.request(duplicate)), 400, 'RTN_UPLOAD_INVALID_REQUEST');
    for (const extra of [{ actorUid: actor }, { sha256: hash }, { receivedAt: '2026-11-22T14:00:00Z' }]) {
      await code(await a.handler(a.request(a.form({ ...metadata, ...extra }))), 400, 'RTN_UPLOAD_INVALID_REQUEST');
    }
    noPrivilegedWork(a);
  });
  it('rejects metadata aliases and unofficial destinations without any source request', async () => {
    const a = setup(); const { expectedSourceGeneration: _expected, ...rest } = metadata;
    await code(await a.handler(a.request(a.form({ ...rest, expectedGeneration: 0 }))), 400, 'RTN_UPLOAD_INVALID_REQUEST');
    await code(await a.handler(a.request(a.form({ ...metadata, documentUrl: 'https://evil.invalid/a1.pdf' }))), 400, 'RTN_UPLOAD_INVALID_REQUEST');
    noPrivilegedWork(a);
  });
  it('bounds metadata UTF8 bytes and declared request size before storage', async () => {
    const a = setup(); await code(await a.handler(a.request(a.form('x'.repeat(RTN_UPLOAD_METADATA_BYTES + 1)))), 413, 'RTN_UPLOAD_TOO_LARGE');
    const request = a.request(); request.headers.set('content-length', String(RTN_UPLOAD_TOTAL_BYTES + 1));
    const reader = vi.spyOn(request.body!, 'getReader');
    await code(await a.handler(request), 413, 'RTN_UPLOAD_TOO_LARGE'); expect(reader).not.toHaveBeenCalled(); noPrivilegedWork(a);
  });
  it('bounds the actual chunked stream instead of trusting a missing content length', async () => {
    const a = setup(), cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(RTN_UPLOAD_TOTAL_BYTES + 1)); }, cancel }, { highWaterMark: 0 });
    const request = new Request('https://fixture.invalid/upload', { method: 'POST', headers: {
      authorization: 'Bearer synthetic-genuine-session', 'content-type': 'multipart/form-data; boundary=synthetic',
    }, body: stream, duplex: 'half' } as RequestInit);
    await code(await a.handler(request), 413, 'RTN_UPLOAD_TOO_LARGE'); expect(cancel).toHaveBeenCalledTimes(1); noPrivilegedWork(a);
  });
  it('rejects the wrong magic before normalization, storage or commit', async () => {
    const a = setup(); await code(await a.handler(a.request(a.form(metadata, new TextEncoder().encode('<html>notPDF</html>')))), 415, 'RTN_UPLOAD_UNSUPPORTED_FILE');
    expect(a.normalize).not.toHaveBeenCalled(); noPrivilegedWork(a);
  });
  it('rejects an unsafe ZIP before calling an injected normalizer or storing it', async () => {
    const a = setup(); a.state.source.parser = 'energy-xlsx'; a.state.source.trusted_anchor_rule = 'energy-xlsx';
    await code(await a.handler(a.request(a.form(metadata, new Uint8Array([0x50,0x4b,3,4,0,0,0,0])))), 415, 'RTN_UPLOAD_UNSUPPORTED_FILE');
    expect(a.normalize).not.toHaveBeenCalled(); noPrivilegedWork(a);
  });
  it('retains a verified unknown PDF as pending normalization without inventing answers', async () => {
    const a = setup(); a.normalize.mockResolvedValue([]); a.state.receipt.normalization_required = true;
    const response = await a.handler(a.request()); expect(response.status).toBe(200);
    expect((await response.json()).normalization_required).toBe(true);
    expect(a.serviceRpc.mock.calls[0][1]?.p_normalized_banks).toEqual([]); expect(a.asStream).toHaveBeenCalledTimes(1);
  });
  it('retains a verified original when supported extraction fails, without leaking the private error', async () => {
    const a = setup(); a.normalize.mockRejectedValue(new Error('PRIVATE_DOCUMENT_CANARY')); a.state.receipt.normalization_required = true;
    const response = await a.handler(a.request()); expect(response.status).toBe(200); expect(await response.text()).not.toContain('CANARY');
    expect(a.serviceRpc.mock.calls[0][1]?.p_normalized_banks).toEqual([]);
  });
  it('retains the original when normalization exceeds its separate compact JSON budget', async () => {
    const a = setup(); a.normalize.mockResolvedValue([{ text: 'x'.repeat(1_500_001) }]); a.state.receipt.normalization_required = true;
    const response = await a.handler(a.request()); expect(response.status).toBe(200);
    expect((await response.json()).normalization_required).toBe(true);
    expect(a.serviceRpc.mock.calls[0][1]?.p_normalized_banks).toEqual([]); expect(a.asStream).toHaveBeenCalledTimes(1);
  });
  it('accounts for jsonb numeric expansion even when compact JSON is small', async () => {
    const a = setup(), expanded = [{ synthetic: Array.from({ length: 7_000 }, () => 1e308) }];
    expect(new TextEncoder().encode(JSON.stringify(expanded)).byteLength).toBeLessThan(1_500_000);
    a.normalize.mockResolvedValue(expanded); a.state.receipt.normalization_required = true;
    expect((await a.handler(a.request())).status).toBe(200);
    expect(a.serviceRpc.mock.calls[0][1]?.p_normalized_banks).toEqual([]);
  });
  it('protects original bytes from a mutating normalizer', async () => {
    const a = setup(); a.normalize.mockImplementation(async bytes => { bytes.fill(0); return []; }); a.state.receipt.normalization_required = true;
    expect((await a.handler(a.request())).status).toBe(200); expect(a.upload.mock.calls[0][1]).toEqual(content);
  });
  it('independently verifies a duplicate object and rejects a same-size hash mismatch', async () => {
    const a = setup(); a.state.uploadError = { statusCode: '409', message: 'Duplicate' };
    expect((await a.handler(a.request())).status).toBe(200); expect(a.asStream).toHaveBeenCalledTimes(1);
    const b = setup(); b.upload.mockImplementation(async () => ({ error: { statusCode: 409, message: 'Duplicate' } }));
    b.state.stored = content.slice(); b.state.stored[b.state.stored.length - 1] ^= 1;
    await code(await b.handler(b.request()), 503, 'RTN_UPLOAD_UNAVAILABLE'); expect(b.serviceRpc).not.toHaveBeenCalled();
  });
  it('requires readback even on a successful new upload and rejects excess bytes', async () => {
    const a = setup(); a.asStream.mockResolvedValue({ data: plainStream(new Uint8Array(content.length + 1)), error: null });
    await code(await a.handler(a.request()), 503, 'RTN_UPLOAD_UNAVAILABLE'); expect(a.upload).toHaveBeenCalledTimes(1); expect(a.serviceRpc).not.toHaveBeenCalled();
  });
  it('rechecks admin authority after private upload before reading or committing', async () => {
    const a = setup(); a.upload.mockImplementation(async () => { a.state.adminAllowed = false; return { error: null }; });
    await code(await a.handler(a.request()), 403, 'RTN_UPLOAD_ADMIN_REQUIRED'); expect(a.download).not.toHaveBeenCalled(); expect(a.serviceRpc).not.toHaveBeenCalled();
  });
  it('rechecks authority after readback and refuses an identity switch after body intake', async () => {
    const a = setup(); a.asStream.mockImplementation(async () => { a.state.adminAllowed = false; return { data: plainStream(content), error: null }; });
    await code(await a.handler(a.request()), 403, 'RTN_UPLOAD_ADMIN_REQUIRED'); expect(a.serviceRpc).not.toHaveBeenCalled();
    const b = setup(), original = b.getUser.getMockImplementation()!; b.getUser.mockImplementation(async () => {
      if (b.getUser.mock.calls.length > 1) b.state.userId = '74000000-0000-4000-8000-000000000001'; return original();
    });
    await code(await b.handler(b.request()), 403, 'RTN_UPLOAD_ADMIN_REQUIRED'); noPrivilegedWork(b);
  });
  it('allows exact replay to reach DB after a later generation and exposes still_current=false honestly', async () => {
    const a = setup(); a.state.receipt.replayed = true; a.state.receipt.still_current = false;
    const response = await a.handler(a.request()); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ replayed: true, still_current: false, automatic_verification_advanced: false });
    expect(a.serviceRpc).toHaveBeenCalledTimes(1);
  });
  it('maps source CAS/busy and historical rollback to distinct safe conflicts without retry', async () => {
    const a = setup(); a.serviceRpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'rtn_source_busy' } });
    await code(await a.handler(a.request()), 409, 'RTN_UPLOAD_SOURCE_CONFLICT'); expect(a.serviceRpc).toHaveBeenCalledTimes(1);
    const b = setup(); b.serviceRpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'rtn_manual_import_historical_revision_requires_review' } });
    await code(await b.handler(b.request()), 409, 'RTN_IMPORT_HISTORICAL_REVISION_REQUIRES_REVIEW'); expect(b.serviceRpc).toHaveBeenCalledTimes(1);
  });
  it('never retries a lost commit acknowledgement or returns private exceptions', async () => {
    const a = setup(); a.serviceRpc.mockRejectedValue(new Error('PRIVATE_COMMIT_CANARY'));
    await code(await a.handler(a.request()), 503, 'RTN_UPLOAD_UNAVAILABLE'); expect(a.serviceRpc).toHaveBeenCalledTimes(1);
  });
  it('rejects a contradictory server receipt that claims automatic HTTP verification advanced', async () => {
    const a = setup(); a.serviceRpc.mockResolvedValue({ data: { ...a.state.receipt, automatic_verification_advanced: true }, error: null });
    await code(await a.handler(a.request()), 503, 'RTN_UPLOAD_UNAVAILABLE'); expect(a.serviceRpc).toHaveBeenCalledTimes(1);
  });
  it('bounds a stalled multipart reader without any storage or commit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout'] }); const a = setup(), cancel = vi.fn();
    let started!: () => void; const opening = new Promise<void>(resolve => { started = resolve; });
    const stream = new ReadableStream<Uint8Array>({ pull() { started(); return new Promise(() => {}); }, cancel }, { highWaterMark: 0 });
    const request = new Request('https://fixture.invalid/upload', { method: 'POST', headers: {
      authorization: 'Bearer synthetic-genuine-session', 'content-type': 'multipart/form-data; boundary=synthetic',
    }, body: stream, duplex: 'half' } as RequestInit);
    const pending = a.handler(request); await opening; await vi.advanceTimersByTimeAsync(RTN_UPLOAD_BODY_TIMEOUT_MS);
    await code(await pending, 503, 'RTN_UPLOAD_UNAVAILABLE'); expect(cancel).toHaveBeenCalledTimes(1); noPrivilegedWork(a); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not turn an aborted normalizer into a pending-success original', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout'] }); const a = setup();
    let started!: () => void; const opening = new Promise<void>(resolve => { started = resolve; });
    a.normalize.mockImplementation(() => { started(); return new Promise(() => {}); });
    const pending = a.handler(a.request()); await opening; await vi.advanceTimersByTimeAsync(RTN_UPLOAD_TIMEOUT_MS);
    await code(await pending, 503, 'RTN_UPLOAD_UNAVAILABLE'); noPrivilegedWork(a); expect(vi.getTimerCount()).toBe(0);
  });
});
