import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ actor: 'actor-a' as string | null, revision: 1, getSession: vi.fn(), getUser: vi.fn(), invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: state.getSession, getUser: state.getUser }, functions: { invoke: state.invoke } } }));
vi.mock('@/utils/proxyFetch', () => ({ proxiedAssetUrl: (value: string) => value }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => state.actor ? { actorId: state.actor, revision: state.revision } : null,
  captureOfflineAuthRevision: () => state.revision, isOfflineActorCurrent: (id: string, revision: number) => id === state.actor && revision === state.revision }));
import { getSignatureTokenFile, getAuthenticatedSignatureFile, downloadStoredSignatureArtifact } from '../signatureTokenFile.ts';
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const options = { token: 'synthetic-bearer', signatureId: 'signature-a', organizationId: 'tenant', locator: 'tenant/certificate.html' };
beforeEach(() => {
  vi.clearAllMocks(); state.actor = 'actor-a'; state.revision = 1;
  state.getSession.mockResolvedValue({ data: { session: { user: { id: 'actor-a' }, access_token: 'original-jwt' } }, error: null });
  state.getUser.mockResolvedValue({ data: { user: { id: 'actor-a' } }, error: null });
  state.invoke.mockResolvedValue({ data: { signatureId: 'signature-a', kind: 'certificate', expiresIn: 60, url: 'https://safe.invalid/object' }, error: null });
  vi.stubEnv('VITE_SUPABASE_URL', 'https://safe.invalid'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'project-public-key');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('keeps the captured JWT on the token broker call and never uses the bearer in a URL', async () => {
  await getSignatureTokenFile({ token: options.token, signatureId: options.signatureId, kind: 'certificate' });
  expect(state.getUser).toHaveBeenCalledWith('original-jwt');
  expect(state.invoke).toHaveBeenCalledWith('get-signature-file', { headers: { Authorization: 'Bearer original-jwt' }, body: { token: options.token, kind: 'certificate' } });
});
it('refuses broker results after actor A→B→A even before any React render', async () => {
  const reply = deferred<any>(); state.invoke.mockReturnValue(reply.promise);
  const result = getSignatureTokenFile({ token: options.token, signatureId: options.signatureId, kind: 'certificate' });
  await vi.waitFor(() => expect(state.invoke).toHaveBeenCalled());
  state.actor = 'actor-b'; state.revision++; state.actor = 'actor-a'; state.revision++;
  reply.resolve({ data: { signatureId: 'signature-a', kind: 'certificate', expiresIn: 60, url: 'https://safe.invalid/object' }, error: null });
  await expect(result).rejects.toThrow('Доступ изменился');
});
it('pins private signing POST to the original bearer and rejects a late body after a document-scope change', async () => {
  const body = deferred<ReadableStreamReadResult<Uint8Array>>(); let current = true;
  const request = vi.fn(async () => ({ ok: true, body: { getReader: () => ({ read: () => body.promise, cancel: vi.fn(async () => undefined) }) } }));
  vi.stubGlobal('fetch', request);
  const result = getAuthenticatedSignatureFile('tenant/file name.pdf', 'tenant', 'external-contracts', { assertCurrent: () => { if (!current) throw new Error('old document'); } });
  await vi.waitFor(() => expect(request).toHaveBeenCalled());
  expect(request).toHaveBeenCalledWith('https://safe.invalid/storage/v1/object/sign/external-contracts/tenant/file%20name.pdf', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer original-jwt', apikey: 'project-public-key' }), credentials: 'omit', redirect: 'error' }));
  current = false; body.resolve({ done: true, value: undefined });
  await expect(result).rejects.toThrow('old document');
});
it('does not hand saved bytes to the browser after the selected document changed during GET', async () => {
  const body = deferred<Blob>(); let current = true;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, headers: new Headers({ 'content-type': 'text/html' }), blob: () => body.promise })));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const result = downloadStoredSignatureArtifact({ ...options, assertCurrent: () => { if (!current) throw new Error('old document'); } });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled()); current = false; body.resolve(new Blob(['private bytes']));
  await expect(result).rejects.toThrow('old document'); expect(click).not.toHaveBeenCalled();
});
it('does not revive an anonymous invitation read after anonymous→login→anonymous', async () => {
  state.actor = null; state.getSession.mockResolvedValue({ data: { session: null }, error: null });
  const reply = deferred<any>(); state.invoke.mockReturnValue(reply.promise);
  const result = getSignatureTokenFile({ token: options.token, signatureId: options.signatureId, kind: 'certificate' });
  await vi.waitFor(() => expect(state.invoke).toHaveBeenCalled());
  expect(state.invoke.mock.calls[0][1].headers.Authorization).toBe('Bearer project-public-key');
  state.actor = 'actor-a'; state.revision++; state.actor = null; state.revision++;
  reply.resolve({ data: { signatureId: 'signature-a', kind: 'certificate', expiresIn: 60, url: 'https://safe.invalid/object' }, error: null });
  await expect(result).rejects.toThrow('Доступ изменился');
});
it('rejects an external or mismatched signed path rather than following it', async () => {
  for (const signedURL of ['https://attacker.invalid/object', '/object/sign/external-contracts/other/file.pdf?token=x', '/object/sign/external-contracts/tenant/file.pdf?token=x&token=y']) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ signedURL }))));
    await expect(getAuthenticatedSignatureFile('tenant/file.pdf', 'tenant')).rejects.toThrow('ссылку');
  }
});
