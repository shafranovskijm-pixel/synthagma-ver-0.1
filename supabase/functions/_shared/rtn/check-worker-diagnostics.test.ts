// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCheck, type CheckClaim, type WorkerClient } from './check-worker';

const claim: CheckClaim = {
  run_id: '17000000-0000-4000-8000-000000000001',
  lease_token: 'LEASE_CANARY_NEVER_LOG',
  kind: 'weekly',
  source: {
    id: '27000000-0000-4000-8000-000000000001',
    page_url: 'https://www.gosnadzor.ru/service/list/Safety%20certification/a1/index.php',
    document_url: 'https://www.gosnadzor.ru/service/list/Safety%20certification/a1/old.pdf',
    trusted_anchor_rule: 'a1', parser: 'industrial-pdf', last_sha256: null,
  },
};

function adapters() {
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({ data: {
    run_id: claim.run_id, status: (args.p_result as { status: string }).status,
  }, error: null }));
  const upload = vi.fn().mockResolvedValue({ error: null });
  const client = { rpc, storage: { from: vi.fn(() => ({ upload, download: vi.fn() })) } } as unknown as WorkerClient;
  return { rpc, upload, client };
}

function officialFixture(options: { fail?: string; invalidUtf8?: string; missingCatalog?: boolean; badPdf?: boolean } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input), at = url.endsWith('/Safety%20certification/') ? 'parent'
      : url.endsWith('/catalog.html') ? 'catalog' : url.endsWith('.pdf') ? 'pdf' : 'page';
    if (options.fail === at) throw new TypeError('private fetch PRIVATE_FETCH_CANARY');
    if (options.invalidUtf8 === at) return new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (at === 'pdf') return new Response(options.badPdf ? 'PRIVATE_BODY_CANARY' : '%PDF-1.7\nsynthetic original', { headers: { 'content-type': 'application/pdf' } });
    const html = at === 'parent' ? options.missingCatalog ? 'PRIVATE_BODY_CANARY' : '<a href="catalog.html">Вопросы тестирования с 1 сентября 2024 г.</a>'
      : at === 'catalog' ? '<a href="a1/index.php">Общие требования промышленной безопасности</a>'
        : '<a href="new.pdf">А.1. Основы промышленной безопасности</a>';
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
}

afterEach(() => vi.restoreAllMocks());

describe('source worker failure diagnostics', () => {
  it('records one sanitized first-parent failure while retaining the existing single completion', async () => {
    const a = adapters(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new TypeError('error sending request https://URL_CANARY.invalid/; invalid peer certificate: UnknownIssuer; password=PASSWORD_CANARY'), {
      stack: 'STACK_CANARY', code: 'UNKNOWN_CODE_CANARY',
      headers: { authorization: 'Bearer AUTH_CANARY' }, body: 'BODY_CANARY',
      cause: { name: 'Error', code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'CAUSE_MESSAGE_CANARY',
        cause: { name: 'Error', code: 'ECONNRESET', cause: { name: 'Error', code: 'EAI_AGAIN', marker: 'DEEP_CAUSE_CANARY' } } },
    });
    const fetcher = vi.fn().mockRejectedValue(error);
    await executeCheck(a.client, claim, async () => [], fetcher);
    expect(fetcher.mock.calls[0][0]).toBe('https://www.gosnadzor.ru/service/list/Safety%20certification/');
    expect(log).toHaveBeenCalledTimes(1);
    const event = log.mock.calls[0][0];
    expect(log.mock.calls[0]).toHaveLength(1);
    expect(event).toEqual({
      tag: 'RTN_SOURCE_CHECK_DIAGNOSTIC_V1', run_id: claim.run_id, source_id: claim.source.id,
      stage: 'service_catalog_fetch',
      exception: { name: 'TypeError', transport: 'tls_certificate' },
      causes: [
        { name: 'Error', code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', transport: 'tls_certificate' },
        { name: 'Error', code: 'ECONNRESET', transport: 'connection_reset' },
      ],
    });
    expect(JSON.stringify(event)).not.toMatch(/CANARY|https?:|Bearer|password|stack|headers|lease_token|message|body/i);
    expect(a.rpc).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls[0]).toEqual(['complete_rtn_check', {
      p_run_id: claim.run_id, p_lease_token: claim.lease_token,
      p_result: { status: 'error', error: 'RTN_SOURCE_CHECK_FAILED' },
    }]);
  });

  it.each([
    { title: 'catalog GET', options: { fail: 'catalog' }, kind: 'weekly', stage: 'question_catalog_fetch', code: 'RTN_SOURCE_CHECK_FAILED' },
    { title: 'parent decode', options: { invalidUtf8: 'parent' }, kind: 'weekly', stage: 'service_catalog_decode', code: 'RTN_SOURCE_CHECK_FAILED' },
    { title: 'catalog discovery', options: { missingCatalog: true }, kind: 'weekly', stage: 'service_catalog_discover', code: 'OFFICIAL_CATALOG_MISSING' },
    { title: 'catalog decode', options: { invalidUtf8: 'catalog' }, kind: 'weekly', stage: 'question_catalog_decode', code: 'RTN_SOURCE_CHECK_FAILED' },
    { title: 'page GET', options: { fail: 'page' }, kind: 'manual', stage: 'question_page_fetch', code: 'RTN_SOURCE_CHECK_FAILED' },
    { title: 'page decode', options: { invalidUtf8: 'page' }, kind: 'manual', stage: 'question_page_decode', code: 'RTN_SOURCE_CHECK_FAILED' },
    { title: 'PDF GET', options: { fail: 'pdf' }, kind: 'manual', stage: 'document_fetch', code: 'RTN_SOURCE_CHECK_FAILED' },
    { title: 'PDF validation', options: { badPdf: true }, kind: 'manual', stage: 'document_validate', code: 'OFFICIAL_NOT_PDF' },
  ] as const)('distinguishes $title without changing its durable error', async ({ options, kind, stage, code }) => {
    const a = adapters(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await executeCheck(a.client, { ...claim, kind }, async () => [], officialFixture(options));
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({ stage, run_id: claim.run_id, source_id: claim.source.id });
    expect(JSON.stringify(log.mock.calls)).not.toContain('CANARY');
    expect(a.rpc).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls[0][1].p_result).toEqual({ status: 'error', error: code });
  });

  it('identifies storage transport rejection after a valid PDF without logging SDK detail', async () => {
    const a = adapters(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
    a.upload.mockRejectedValue(Object.assign(new TypeError('private storage PRIVATE_STORAGE_CANARY'), { code: 'ECONNRESET' }));
    await executeCheck(a.client, { ...claim, kind: 'manual' }, async () => [], officialFixture());
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({ stage: 'document_store', exception: { name: 'TypeError', code: 'ECONNRESET', transport: 'connection_reset' } });
    expect(JSON.stringify(log.mock.calls)).not.toContain('CANARY');
    expect(a.rpc.mock.calls[0][1].p_result).toEqual({ status: 'error', error: 'RTN_SOURCE_CHECK_FAILED' });
  });

  it.each([
    { name: 'Error', code: 'CERTIFICATE_VERIFY_FAILED', message: '', transport: 'tls_certificate' },
    { name: 'AbortError', code: undefined, message: 'PRIVATE_CANARY', transport: 'aborted' },
    { name: 'Error', code: 'EAI_AGAIN', message: 'PRIVATE_CANARY', transport: 'dns' },
    { name: 'Error', code: undefined, message: 'dns error: PRIVATE_CANARY', transport: 'dns' },
    { name: 'Error', code: undefined, message: 'TLS handshake failure PRIVATE_CANARY', transport: 'tls_handshake' },
    { name: 'Error', code: 'ECONNREFUSED', message: 'PRIVATE_CANARY', transport: 'connection_refused' },
    { name: 'Error', code: 'ECONNRESET', message: 'PRIVATE_CANARY', transport: 'connection_reset' },
    { name: 'TimeoutError', code: 'ETIMEDOUT', message: 'PRIVATE_CANARY', transport: 'timeout' },
    { name: 'Error', code: 'EHOSTUNREACH', message: 'PRIVATE_CANARY', transport: 'network_unreachable' },
    { name: 'TypeError', code: 20, message: 'PRIVATE_CANARY', transport: 'unclassified' },
    { name: 'TypeError', code: 'PRIVATE_CODE_CANARY', message: 'PRIVATE_CANARY', transport: 'unclassified' },
    { name: 'PRIVATE_NAME_CANARY', code: undefined, message: 'PRIVATE_CANARY', transport: 'unclassified' },
  ])('uses only known classification for $name / $transport', async ({ name, code, message, transport }) => {
    const a = adapters(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error(message), { name, code });
    await executeCheck(a.client, claim, async () => [], vi.fn().mockRejectedValue(error));
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({ exception: { name: name === 'PRIVATE_NAME_CANARY' ? 'unknown' : name, transport } });
    if (typeof code === 'string' && !code.includes('CANARY')) expect(log.mock.calls[0][0].exception.code).toBe(code);
    else expect(log.mock.calls[0][0].exception).not.toHaveProperty('code');
    expect(JSON.stringify(log.mock.calls)).not.toContain('CANARY');
    expect(a.rpc).toHaveBeenCalledTimes(1);
  });

  it('logs only UUID context and handles cyclic causes', async () => {
    const a = adapters(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('PRIVATE_CANARY'); error.cause = error;
    await executeCheck(a.client, { ...claim, run_id: 'RUN_CANARY', source: { ...claim.source, id: 'SOURCE_CANARY' } }, async () => [], vi.fn().mockRejectedValue(error));
    expect(log.mock.calls[0][0]).toMatchObject({ run_id: 'unknown', source_id: 'unknown', causes: [] });
    expect(JSON.stringify(log.mock.calls)).not.toContain('CANARY');
    expect(a.rpc).toHaveBeenCalledTimes(1);
  });

  it('handles unknown thrown objects and hostile diagnostic getters without losing completion', async () => {
    const a = adapters(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.create(null);
    for (const key of ['name', 'message', 'code', 'cause']) Object.defineProperty(error, key, { get() { throw new Error('GETTER_CANARY'); } });
    await executeCheck(a.client, claim, async () => [], vi.fn().mockRejectedValue(error));
    expect(log.mock.calls[0][0]).toMatchObject({ exception: { name: 'unknown', transport: 'unclassified' }, causes: [] });
    expect(JSON.stringify(log.mock.calls)).not.toContain('CANARY');
    expect(a.rpc.mock.calls[0][1].p_result).toEqual({ status: 'error', error: 'RTN_SOURCE_CHECK_FAILED' });
  });

  it('completes once with unchanged public error even when console logging throws', async () => {
    const a = adapters(), log = vi.spyOn(console, 'error').mockImplementation(() => { throw new Error('LOGGER_CANARY'); });
    await expect(executeCheck(a.client, claim, async () => [], vi.fn().mockRejectedValue(new Error('private native PRIVATE_CANARY')))).resolves.toMatchObject({ status: 'error' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(a.rpc).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls[0][1].p_result).toEqual({ status: 'error', error: 'RTN_SOURCE_CHECK_FAILED' });
  });

  it('leaves nonfatal normalization staging and success unlogged', async () => {
    const a = adapters(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await executeCheck(a.client, { ...claim, kind: 'manual' }, async () => { throw new Error('OCR_REVIEW_REQUIRED'); }, officialFixture());
    expect(log).not.toHaveBeenCalled();
    expect(a.rpc).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls[0][1].p_result).toMatchObject({ status: 'changed', metadata: { normalization_required: true, normalization_error: 'OCR_REVIEW_REQUIRED' } });
  });

  it('does not turn a lost completion commit into another error completion or diagnostic', async () => {
    const a = adapters(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
    a.rpc.mockResolvedValue({ data: null, error: { code: '40001' } } as never);
    await expect(executeCheck(a.client, { ...claim, kind: 'manual' }, async () => [], officialFixture())).rejects.toThrow('complete_rtn_check:40001');
    expect(log).not.toHaveBeenCalled();
    expect(a.rpc).toHaveBeenCalledTimes(1);
  });
});
