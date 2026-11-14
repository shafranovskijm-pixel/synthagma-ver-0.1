// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRtnHandler } from './http-handler';
import type { WorkerClient } from './check-worker';

const id = '04cc2cb4-c837-40ca-9767-6d6b95def7f5';
function setup() {
  const serviceRpc = vi.fn(async (name: string) => ({ data: name === 'verify_rtn_cron_secret' ? true : null, error: null }));
  const userRpc = vi.fn(async (name: string) => ({ data: name === 'request_rtn_source_check' ? { run_id: id, status: 'queued' } : {}, error: null }));
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id } }, error: null });
  const service = { rpc: serviceRpc, storage: { from: vi.fn() } } as unknown as WorkerClient;
  const user = vi.fn(() => ({ auth: { getUser }, rpc: userRpc }));
  const handler = createRtnHandler({ service, user, normalize: vi.fn() });
  const request = (body: unknown, headers = { authorization: 'Bearer genuine-user-token' }) => handler(new Request('https://local.test/rtn', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { serviceRpc, userRpc, getUser, user, handler, request };
}
describe('RTN HTTP authorization and queue boundary', () => {
  it('rejects missing/expired user authentication before queueing or service mutations', async () => {
    const a = setup();
    expect((await a.request({}, {} as never)).status).toBe(401);
    a.getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
    expect((await a.request({ organizationId: id, sourceId: id })).status).toBe(401);
    expect(a.userRpc).not.toHaveBeenCalled(); expect(a.serviceRpc).not.toHaveBeenCalled();
  });
  it('rejects a forged scheduler secret and never falls through to user or queue operations', async () => {
    const a = setup(); a.serviceRpc.mockResolvedValue({ data: false, error: null } as never);
    const response = await a.handler(new Request('https://local.test/rtn', { method: 'POST', headers: { 'x-rtn-cron-secret': 'a'.repeat(64) }, body: '{}' }));
    expect(response.status).toBe(401); expect(a.user).not.toHaveBeenCalled();
    expect(a.serviceRpc.mock.calls.map(call => call[0])).toEqual(['verify_rtn_cron_secret']);
  });
  it('queues a manual check only through the real user RPC and claims its exact returned run', async () => {
    const a = setup(); const response = await a.request({ organizationId: id, sourceId: id });
    expect(response.status).toBe(200);
    expect(a.userRpc).toHaveBeenCalledWith('request_rtn_source_check', { p_organization_id: id, p_source_id: id });
    expect(a.serviceRpc).toHaveBeenCalledWith('claim_rtn_check', { p_run_id: id });
    expect(await response.json()).toEqual({ run_id: id, status: 'queued' });
  });
  it('does not claim a source after a genuine user permission denial', async () => {
    const a = setup(); a.userRpc.mockResolvedValue({ data: null, error: { code: '42501' } } as never);
    expect((await a.request({ organizationId: id, sourceId: id })).status).toBe(403);
    expect(a.serviceRpc).not.toHaveBeenCalled();
  });
  it('requires actual administrator RPC approval before bootstrap or normalization', async () => {
    const a = setup(); a.userRpc.mockResolvedValue({ data: null, error: { code: '42501' } } as never);
    expect((await a.request({ operation: 'bootstrap' })).status).toBe(403);
    expect((await a.request({ operation: 'normalize', sourceRevisionId: id, normalizedBanks: [] })).status).toBe(403);
    expect(a.serviceRpc).not.toHaveBeenCalled();
  });
  it('admin bootstrap registers only fixed reviewed sources, ignoring caller URLs', async () => {
    const a = setup(); expect((await a.request({ operation: 'bootstrap', url: 'http://169.254.169.254' })).status).toBe(200);
    const registers = a.serviceRpc.mock.calls.filter(call => call[0] === 'register_rtn_source');
    expect(registers).toHaveLength(2);
    expect(JSON.stringify(registers)).not.toContain('169.254');
    expect(a.serviceRpc.mock.calls.at(-1)?.[0]).toBe('enqueue_due_rtn_checks');
  });
  it('bounds a chunked body before retaining its full contents', async () => {
    const a = setup();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2_000_001)); controller.close(); } });
    const request = new Request('https://local.test/rtn', { method: 'POST', headers: { authorization: 'Bearer genuine-user-token' }, body: stream, duplex: 'half' } as RequestInit);
    expect((await a.handler(request)).status).toBe(400); expect(a.userRpc).not.toHaveBeenCalled(); expect(a.serviceRpc).not.toHaveBeenCalled();
  });
  it('forwards an explicit audited correction and its previous-revision CAS only after admin authorization', async () => {
    const a = setup();
    expect((await a.request({ operation: 'normalize', sourceRevisionId: id, normalizedBanks: [{ code: 'A.1', questions: [] }], previousRevisionIds: { 'A.1': id }, correctionNote: 'Визуально исправлено извлечение из PDF' })).status).toBe(200);
    expect(a.serviceRpc).toHaveBeenCalledWith('normalize_rtn_revision', { p_source_revision_id: id, p_normalized_banks: [{ code: 'A.1', questions: [] }], p_previous_revision_ids: { 'A.1': id }, p_correction_note: 'Визуально исправлено извлечение из PDF' });
  });
  it('rejects an incomplete correction witness before invoking the service mutation', async () => {
    const a = setup();
    expect((await a.request({ operation: 'normalize', sourceRevisionId: id, normalizedBanks: [{}], previousRevisionIds: { 'A.1': 'wrong' }, correctionNote: 'Изменение извлечения' })).status).toBe(400);
    expect(a.serviceRpc).not.toHaveBeenCalled();
  });
});
