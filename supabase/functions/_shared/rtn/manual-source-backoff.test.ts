// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRtnHandler } from './http-handler';
import type { WorkerClient } from './check-worker';

const org = '60000000-0000-4000-8000-000000000001';
const source = '61000000-0000-4000-8000-000000000001';
const terminal = {
  run_id: '62000000-0000-4000-8000-000000000001', status: 'error',
  queued_at: '2026-11-21T14:00:00Z', replayed: true,
  retry_after: '2026-11-22T14:00:03Z', can_manual_check: false,
};
function setup() {
  const rpc = vi.fn().mockResolvedValue({ data: terminal, error: null });
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: org } }, error: null });
  const serviceRpc = vi.fn(), from = vi.fn(), fetcher = vi.fn(), normalize = vi.fn();
  const withOfficialFetch = vi.fn();
  const service = { rpc: serviceRpc, storage: { from } } as unknown as WorkerClient;
  const handler = createRtnHandler({ service, user: () => ({ rpc, auth: { getUser } }),
    fetcher, normalize, withOfficialFetch });
  const request = () => handler(new Request('https://fixture.invalid/rtn-source-check', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-owned-session' },
    body: JSON.stringify({ organizationId: org, sourceId: source }),
  }));
  return { rpc, getUser, serviceRpc, from, fetcher, normalize, withOfficialFetch, request };
}

describe('manual bank denial-backoff HTTP composition', () => {
  it('returns the exact existing terminal retry receipt without claim, official transport or storage', async () => {
    const a = setup(); const response = await a.request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(terminal);
    expect(a.rpc).toHaveBeenCalledExactlyOnceWith('request_rtn_source_check', {
      p_organization_id: org, p_source_id: source,
    });
    expect(a.serviceRpc).not.toHaveBeenCalled(); expect(a.withOfficialFetch).not.toHaveBeenCalled();
    expect(a.fetcher).not.toHaveBeenCalled(); expect(a.from).not.toHaveBeenCalled();
    expect(a.normalize).not.toHaveBeenCalled();
  });
  it('keeps authenticated tenant denial ahead of a private terminal receipt and every service capability', async () => {
    const a = setup(); a.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    const response = await a.request();
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: 'RTN_ACCESS_REQUIRED' });
    expect(a.serviceRpc).not.toHaveBeenCalled(); expect(a.withOfficialFetch).not.toHaveBeenCalled();
    expect(a.fetcher).not.toHaveBeenCalled(); expect(a.from).not.toHaveBeenCalled();
  });
  it('does not reach even the private retry RPC when genuine user verification fails', async () => {
    const a = setup(); a.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } });
    const response = await a.request();
    expect(response.status).toBe(401); expect(await response.json()).toEqual({ error: 'RTN_AUTH_REQUIRED' });
    expect(a.rpc).not.toHaveBeenCalled(); expect(a.serviceRpc).not.toHaveBeenCalled();
    expect(a.withOfficialFetch).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
  });
});
