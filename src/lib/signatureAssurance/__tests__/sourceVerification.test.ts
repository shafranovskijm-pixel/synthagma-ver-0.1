import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getUser: vi.fn(),
  invoke: vi.fn<(name: string, options: { headers: Record<string, string>; body: unknown; timeout?: number }) => Promise<{ data: unknown; error: unknown }>>(),
  live: { current: true },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.getSession, getUser: mocks.getUser }, functions: { invoke: mocks.invoke } } }));
vi.mock('@/utils/courseCache', () => ({
  captureOfflineContext: () => ({ actorId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', revision: 1 }),
  isOfflineActorCurrent: (actor: string, revision: number) => mocks.live.current && actor === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' && revision === 1,
}));
import { prepareSignatureSourceVerification } from '../sourceVerification.ts';

const actor = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const org = '11111111-2222-3333-4444-555555555555';
const signature = '22222222-2222-3333-4444-555555555555';
const requestId = '33333333-2222-3333-4444-555555555555';
const proofId = '44444444-2222-3333-4444-555555555555';
const scope = () => ({ actorId: actor, accessRevision: 1, organizationId: org, current: () => mocks.live.current });
const selected = () => ({ signatureId: signature, party: 'sender' as const, documentRevisionId: null, documentHtmlSha256: 'a'.repeat(64) });
const receipt = () => ({ version: 1, ok: true, kind: 'source_verified', verification_request_id: requestId, verification_record_id: proofId, outcome: 'applied', verified_at: '2026-10-23T00:00:00.000Z', organization_id: org, signature_id: signature, chosen_party: 'sender', document_revision_id: null, document_html_sha256: 'a'.repeat(64), byte_sha256: 'b'.repeat(64), byte_size: 100 });

beforeEach(() => {
  vi.clearAllMocks(); mocks.live.current = true;
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: actor }, access_token: 'original-jwt' } }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null });
  mocks.invoke.mockReset(); mocks.invoke.mockResolvedValue({ data: receipt(), error: null });
});

it('verifies and pins the original JWT and exact immutable source selection', async () => {
  const selection = selected(), plan = prepareSignatureSourceVerification(scope(), selection, requestId);
  selection.documentHtmlSha256 = 'c'.repeat(64);
  const result = await plan.run();
  expect(mocks.getUser).toHaveBeenCalledWith('original-jwt');
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('signature-source-verification', {
    headers: { Authorization: 'Bearer original-jwt' },
    timeout: 60000,
    body: { version: 1, action: 'verify_source', verification_request_id: requestId, address: { kind: 'authenticated_signature', organization_id: org, signature_id: signature, chosen_party: 'sender' }, expected_document_revision_id: null, document_html_sha256: 'a'.repeat(64) },
  });
  expect(result.byte_sha256).toBe('b'.repeat(64)); expect(Object.isFrozen(result)).toBe(true);
});
it('does not call the worker after identity changes during original-token verification', async () => {
  let finish!: (value: unknown) => void;
  mocks.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const plan = prepareSignatureSourceVerification(scope(), selected(), requestId);
  const pending = plan.run(); const rejected = expect(pending).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  mocks.live.current = false; finish({ data: { user: { id: actor } }, error: null }); await rejected;
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('does not expose a worker result after the organization or permission epoch changes', async () => {
  let finish!: (value: { data: unknown; error: unknown }) => void;
  mocks.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = prepareSignatureSourceVerification(scope(), selected(), requestId).run(); const rejected = expect(pending).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  mocks.live.current = false; finish({ data: receipt(), error: null }); await rejected;
});
it('rejects a mismatched verified account before any service request', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' } }, error: null });
  await expect(prepareSignatureSourceVerification(scope(), selected(), requestId).run()).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('refuses a wrong scope, party, revision, HTML hash or request in the returned receipt', async () => {
  for (const changed of [{ organization_id: proofId }, { signature_id: proofId }, { chosen_party: 'recipient' }, { document_revision_id: proofId }, { document_html_sha256: 'c'.repeat(64) }, { verification_request_id: proofId }]) {
    mocks.invoke.mockResolvedValueOnce({ data: { ...receipt(), ...changed }, error: null });
    await expect(prepareSignatureSourceVerification(scope(), selected(), requestId).run()).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  }
});
it('shares a concurrent request and repeats the same UUID after an unconfirmed result', async () => {
  let finish!: (value: { data: unknown; error: unknown }) => void;
  mocks.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const plan = prepareSignatureSourceVerification(scope(), selected(), requestId);
  const first = plan.run(), second = plan.run(); expect(second).toBe(first);
  const rejected = expect(first).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function')); finish({ data: null, error: new Error('unconfirmed') }); await rejected;
  mocks.invoke.mockResolvedValueOnce({ data: { ...receipt(), outcome: 'replayed' }, error: null });
  expect((await plan.run()).outcome).toBe('replayed');
  expect(mocks.invoke.mock.calls.map(([, options]) => (options.body as { verification_request_id: string }).verification_request_id)).toEqual([requestId, requestId]);
});
it('uses only a closed server failure and never propagates upstream secret-bearing error text', async () => {
  mocks.invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ version: 1, ok: false, code: 'SOURCE_CHANGED' }), { status: 409 }) } });
  await expect(prepareSignatureSourceVerification(scope(), selected(), requestId).run()).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
  mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: 'original-jwt /sign/synthetic-secret-token', context: new Response('upstream secret') } });
  await expect(prepareSignatureSourceVerification(scope(), selected(), requestId).run()).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
});
it('rejects secret-bearing extra result fields instead of accepting a purported proof package', async () => {
  mocks.invoke.mockResolvedValueOnce({ data: { ...receipt(), token: 'synthetic-secret-token' }, error: null });
  await expect(prepareSignatureSourceVerification(scope(), selected(), requestId).run()).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
});
