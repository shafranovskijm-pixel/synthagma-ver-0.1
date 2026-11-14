// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRtnScheduledHandler } from './scheduled-handler';
import type { CheckClaim, WorkerClient } from './check-worker';

const task = { task: 'rtn-source-reconciliation' };
const original = new TextEncoder().encode('%PDF-1.7\nsynthetic immutable official questions');
const claim: CheckClaim = {
  run_id: 'synthetic-run', lease_token: 'synthetic-lease', kind: 'daily',
  source: {
    id: 'synthetic-source', page_url: 'https://www.gosnadzor.ru/service/list/Safety%20certification/lab/index.php',
    document_url: 'https://www.gosnadzor.ru/service/list/Safety%20certification/lab/previous.pdf',
    trusted_anchor_rule: 'a1', parser: 'industrial-pdf', last_sha256: null,
  },
};
function setup() {
  // Only an injected fixture authenticator is modeled here. The unchanged
  // provider-generated helper/current+previous timing-safe comparison has its
  // own runtime tests; these fake tokens are never production credentials.
  const authenticate = vi.fn((request: Request) => ['Bearer synthetic-current', 'Bearer synthetic-previous'].includes(request.headers.get('authorization') || '')
    ? null : new Response('synthetic auth denied', { status: 401 }));
  let next: CheckClaim | null = null;
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'enqueue_due_rtn_checks') return { data: { queued: 1 }, error: null };
    if (name === 'claim_rtn_check') return { data: next, error: null };
    if (name === 'complete_rtn_check') return { data: { run_id: claim.run_id, status: (args?.p_result as { status: string }).status }, error: null };
    throw new Error('Unexpected privileged operation: ' + name);
  });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const storage = { from: vi.fn(() => ({ upload, download: vi.fn() })) };
  const service = { rpc, storage } as unknown as WorkerClient;
  const normalize = vi.fn(async () => []);
  const fetcher = vi.fn(async (url: string | URL | Request) => String(url).endsWith('.pdf')
    ? new Response(original, { headers: { 'content-type': 'application/pdf' } })
    : new Response('<a href="current.pdf">А.1. Основы промышленной безопасности</a>', { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  const handler = createRtnScheduledHandler({ service, authenticate, normalize, fetcher });
  const request = (body: unknown = task, authorization = 'Bearer synthetic-current') => handler(new Request('https://local.test/rtn-source-cron', {
    method: 'POST', headers: { authorization }, body: JSON.stringify(body),
  }));
  return { authenticate, rpc, storage, normalize, fetcher, upload, handler, request, claimNext: () => { next = claim; }, service };
}

describe('RTN managed scheduler authentication and bounded queue boundary', () => {
  it.each(['', 'Bearer forged', 'Bearer expired-previous', 'Bearer genuine-user-JWT', 'Bearer synthetic-current-extra'])('denies %s before any queue, storage or network operation', async authorization => {
    const a = setup();
    expect((await a.request(task, authorization)).status).toBe(401);
    expect(a.authenticate).toHaveBeenCalledTimes(1); expect(a.rpc).not.toHaveBeenCalled();
    expect(a.storage.from).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
  });
  it.each(['Bearer synthetic-current', 'Bearer synthetic-previous'])('accepts an explicitly authenticated injected token %s and returns idle', async authorization => {
    const a = setup(); const response = await a.request(task, authorization);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ status: 'idle' });
    expect(a.rpc.mock.calls).toEqual([['enqueue_due_rtn_checks', undefined], ['claim_rtn_check', { p_run_id: null }]]);
    expect(a.fetcher).not.toHaveBeenCalled(); expect(a.normalize).not.toHaveBeenCalled();
  });
  it('authenticates before rejecting a non-POST method or consuming any body', async () => {
    const a = setup();
    expect((await a.handler(new Request('https://local.test/rtn-source-cron', { method: 'GET' }))).status).toBe(401);
    expect((await a.handler(new Request('https://local.test/rtn-source-cron', { method: 'GET', headers: { authorization: 'Bearer synthetic-current' } }))).status).toBe(405);
    expect(a.authenticate).toHaveBeenCalledTimes(2); expect(a.rpc).not.toHaveBeenCalled();
  });
  it('preserves a denial response from the provider helper without fallback authentication', async () => {
    const a = setup(); const denied = new Response('helper-specific denial', { status: 403 });
    const handler = createRtnScheduledHandler({ service: a.service, normalize: a.normalize, authenticate: () => denied });
    expect(await handler(new Request('https://local.test/rtn-source-cron', { method: 'POST', body: '{}' }))).toBe(denied);
    expect(a.rpc).not.toHaveBeenCalled();
  });
  it.each([undefined, false, 'not-an-auth-result'])('fails closed for an invalid authenticator result %s', async result => {
    const a = setup(); const handler = createRtnScheduledHandler({ service: a.service, normalize: a.normalize, authenticate: () => result as never });
    expect((await handler(new Request('https://local.test/rtn-source-cron', { method: 'POST', body: JSON.stringify(task) }))).status).toBe(503);
    expect(a.rpc).not.toHaveBeenCalled();
  });
  it('fails closed without leaking an authenticator exception', async () => {
    const a = setup(); const handler = createRtnScheduledHandler({ service: a.service, normalize: a.normalize, authenticate: () => { throw new Error('synthetic-private-config'); } });
    const response = await handler(new Request('https://local.test/rtn-source-cron', { method: 'POST', body: JSON.stringify(task) }));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'RTN_AUTH_UNAVAILABLE' }); expect(a.rpc).not.toHaveBeenCalled();
  });
  it.each([null, [], true, {}, { task: 'different' }, { task: ['rtn-source-reconciliation'] },
    { ...task, sourceId: 'caller-selected' }, { ...task, url: 'http://169.254.169.254' }, { ...task, operation: 'bootstrap' }, { ...task, operation: 'normalize' }, { ...task, runId: 'caller-selected' }].map(body => ({ body })))('rejects any body outside the single static task: $body', async ({ body }) => {
    const a = setup(); expect((await a.request(body)).status).toBe(400);
    expect(a.rpc).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('rejects malformed and invalid UTF8 JSON before queueing', async () => {
    const a = setup();
    for (const body of ['{', new Uint8Array([0xff])]) {
      expect((await a.handler(new Request('https://local.test/rtn-source-cron', { method: 'POST', headers: { authorization: 'Bearer synthetic-current' }, body }))).status).toBe(400);
    }
    expect(a.rpc).not.toHaveBeenCalled();
  });
  it('accepts exactly 4096 bytes but cancels a streamed body immediately when the limit is crossed', async () => {
    const a = setup(), allowed = JSON.stringify(task).padEnd(4096, ' ');
    expect((await a.handler(new Request('https://local.test/rtn-source-cron', { method: 'POST', headers: { authorization: 'Bearer synthetic-current' }, body: allowed }))).status).toBe(200);
    a.rpc.mockClear();
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(allowed)); controller.enqueue(new Uint8Array([32])); }, cancel });
    const request = new Request('https://local.test/rtn-source-cron', { method: 'POST', headers: { authorization: 'Bearer synthetic-current' }, body: stream, duplex: 'half' } as RequestInit);
    expect((await a.handler(request)).status).toBe(400); expect(cancel).toHaveBeenCalledTimes(1); expect(a.rpc).not.toHaveBeenCalled();
  });
  it('drains exactly one lease and preserves an immutable official download', async () => {
    const a = setup(); a.claimNext(); const response = await a.request();
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ run_id: claim.run_id, status: 'changed' });
    expect(a.rpc.mock.calls.map(call => call[0])).toEqual(['enqueue_due_rtn_checks', 'claim_rtn_check', 'complete_rtn_check']);
    expect(a.rpc).toHaveBeenNthCalledWith(2, 'claim_rtn_check', { p_run_id: null });
    expect(a.rpc.mock.calls[2][1]).toMatchObject({ p_run_id: claim.run_id, p_lease_token: claim.lease_token, p_result: { status: 'changed', normalized_banks: [] } });
    expect(a.normalize).toHaveBeenCalledTimes(1); expect(a.upload).toHaveBeenCalledTimes(1);
    expect(a.upload.mock.calls[0][2]).toEqual({ contentType: 'application/pdf', upsert: false });
  });
  it('returns 503 only after recording a source outage as a durable failed check', async () => {
    const a = setup(); a.claimNext(); a.fetcher.mockRejectedValue(new Error('synthetic-private-provider-error'));
    const response = await a.request();
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ run_id: claim.run_id, status: 'error' });
    expect(a.rpc.mock.calls[2][1]).toMatchObject({ p_result: { status: 'error', error: 'RTN_SOURCE_CHECK_FAILED' } });
    expect(a.rpc.mock.calls.filter(call => call[0] === 'complete_rtn_check')).toHaveLength(1);
  });
  it('does not disguise a completion lease failure or retry it with a second completion', async () => {
    const a = setup(); a.claimNext();
    a.rpc.mockImplementation(async name => name === 'complete_rtn_check' ? { data: null, error: { code: '40001' } } as never : { data: name === 'claim_rtn_check' ? claim : { queued: 1 }, error: null });
    const response = await a.request();
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'RTN_CHECK_UNAVAILABLE' });
    expect(a.rpc.mock.calls.filter(call => call[0] === 'complete_rtn_check')).toHaveLength(1);
  });
  it('never claims after the durable enqueue step failed', async () => {
    const a = setup(); a.rpc.mockResolvedValue({ data: null, error: { code: 'P0001' } } as never);
    expect((await a.request()).status).toBe(503); expect(a.rpc.mock.calls.map(call => call[0])).toEqual(['enqueue_due_rtn_checks']);
  });
});
