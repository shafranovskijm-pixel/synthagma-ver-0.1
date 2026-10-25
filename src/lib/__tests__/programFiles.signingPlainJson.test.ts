import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ current: true, session: vi.fn(), identity: vi.fn(), fetch: vi.fn() }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => ({ actorId: '00000000-0000-4000-8000-000000000001', revision: 1 }), isOfflineActorCurrent: () => mock.current }));
vi.mock('@/utils/proxyFetch', () => ({ proxiedAssetUrl: (url: string) => url }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mock.session, getUser: mock.identity } } }));
vi.mock('@/lib/orgDocumentLifecycle', () => ({ createDocumentUploadOperation: () => { throw new Error('No upload in a signing read'); }, saveDocumentUpload: () => { throw new Error('No commit in a signing read'); }, restoreDocumentFile: () => { throw new Error('No restore in a signing read'); } }));
import { createScopedOrgDocumentTransport } from '../programFiles.ts';
const actor = '00000000-0000-4000-8000-000000000001', org = '00000000-0000-4000-8000-000000000002';
const path = org + '/versions/00000000-0000-4000-8000-000000000003/00000000-0000-4000-8000-000000000004.html';
const signedURL = '/object/sign/org-documents/' + path + '?token=SYNTHETIC';
const input = () => ({ bucket: 'org-documents', path, expiresIn: 60, downloadName: 'Тестовый шаблон 1.html', signal: new AbortController().signal, deadline: Date.now() + 45000 });
const scope = () => ({ actorId: actor, organizationId: org, accessRevision: 1, key: 'synthetic-signing-epoch1', current: () => mock.current });
beforeEach(() => {
  vi.clearAllMocks(); mock.current = true; vi.stubGlobal('fetch', mock.fetch);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://safe.invalid'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
  mock.session.mockResolvedValue({ data: { session: { user: { id: actor }, access_token: 'synthetic-original-token' } }, error: null });
  mock.identity.mockResolvedValue({ data: { user: { id: actor } }, error: null });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('Scoped signing exact JSON bytes under observed text/plain MIME', () => {
  it('accepts HTTP200 text/plain;charset JSON while retaining original bearer and exact own signed path', async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ signedURL }), { headers: { 'content-type': 'text/plain; charset=UTF-8' } }));
    const result = await createScopedOrgDocumentTransport(scope()).signUrl(input());
    const url = new URL(result!); expect(url.origin).toBe('https://safe.invalid'); expect(url.pathname).toBe('/storage/v1/object/sign/org-documents/' + path);
    expect(url.searchParams.get('token')).toBe('SYNTHETIC'); expect(url.searchParams.get('download')).toBe('Тестовый шаблон 1.html');
    expect(mock.fetch).toHaveBeenCalledTimes(1); expect(mock.fetch).toHaveBeenCalledWith('https://safe.invalid/storage/v1/object/sign/org-documents/' + path, expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer synthetic-original-token', apikey: 'public-test-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }), credentials: 'omit', cache: 'no-store', redirect: 'error' }));
  });
  it('rejects malformed plain JSON and invalid UTF8 without using a URL fallback', async () => {
    for (const body of ['<html>gateway</html>', '{"signedURL":', new Uint8Array([0xff])]) {
      mock.fetch.mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/plain' } }));
      await expect(createScopedOrgDocumentTransport(scope()).signUrl(input())).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    }
  });
  it('retains exact origin, bucket, path and sole-token validation for plain JSON', async () => {
    for (const value of ['https://foreign.invalid/object/sign/x?token=x', '/object/sign/org-documents/' + org + '/foreign.html?token=x', '/object/sign/other-bucket/' + path + '?token=x', signedURL + '&token=SECOND', '/object/sign/org-documents/' + path + '?other=x']) {
      mock.fetch.mockResolvedValue(new Response(JSON.stringify({ signedURL: value }), { headers: { 'content-type': 'text/plain' } }));
      await expect(createScopedOrgDocumentTransport(scope()).signUrl(input())).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    }
  });
  it('continues to reject HTML and octet-stream even when their bytes contain a valid JSON object', async () => {
    for (const type of ['text/html', 'application/octet-stream']) {
      mock.fetch.mockResolvedValue(new Response(JSON.stringify({ signedURL }), { headers: { 'content-type': type } }));
      await expect(createScopedOrgDocumentTransport(scope()).signUrl(input())).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    }
  });
  it('keeps HTTP401 and403 as access denial even with otherwise valid plain JSON', async () => {
    for (const status of [401, 403]) {
      mock.fetch.mockResolvedValue(new Response(JSON.stringify({ signedURL }), { status, headers: { 'content-type': 'text/plain' } }));
      await expect(createScopedOrgDocumentTransport(scope()).signUrl(input())).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    }
  });
});
