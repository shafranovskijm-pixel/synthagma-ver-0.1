// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRtnNewsManualHandler, createRtnNewsScheduledHandler } from './news-handlers';
import type { NewsWorkerClient, RtnNewsClaim } from './news-worker';
import { RTN_NEWS_RSS_URL } from './news-source';

const org = '11111111-1111-4111-8111-111111111111';
const run = { run_id: '90000000-0000-4000-8000-000000000001', status: 'queued' };
const claim: RtnNewsClaim = { ...run, lease_token: '91000000-0000-4000-8000-000000000001', generation: 1,
  source_url: RTN_NEWS_RSS_URL, lease_expires_at: '2026-11-20T12:00:00Z', kind: 'manual' };
const receipt = { ...run, status: 'changed', new_event_count: 1, correction_count: 0, unchanged_count: 0, error_code: null, replayed: false };
const rss = '<rss version="2.0"><channel><title>RTN</title><link>https://www.gosnadzor.ru/news/</link><item><title>Headline</title><link>http://www.gosnadzor.ru/news/67/12345/</link><pubDate>Fri, 20 Nov 2026 12:00:00 +0300</pubDate></item></channel></rss>';
function setup() {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(rss, { headers: { 'content-type': 'text/xml' } }));
  const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => ({
    data: (name === 'claim_rtn_news_check' ? claim : name === 'complete_rtn_news_check' ? receipt : { processed: 0, has_more: false }) as unknown, error: null as { code?: string } | null,
  }));
  const upload = vi.fn(async () => ({ error: null }));
  const service: NewsWorkerClient = { rpc, storage: { from: () => ({ upload, download: () => ({ asStream: async () => ({ data: null, error: null }) }) }) } };
  const getUser = vi.fn(async () => ({ data: { user: { id: 'synthetic-real-session' } as unknown }, error: null as unknown }));
  const userRpc = vi.fn(async (_name: string, _args?: Record<string, unknown>) => ({ data: run as unknown, error: null as { code?: string } | null }));
  const user = vi.fn((_authorization: string) => ({ auth: { getUser }, rpc: userRpc }));
  const authenticate = vi.fn(async (_request: Request): Promise<Response | null> => null);
  const common = { service, withNewsFetch: async <T>(action: (f: typeof fetch) => Promise<T>) => action(fetcher as typeof fetch) };
  return { fetcher, rpc, upload, getUser, userRpc, user, authenticate, manual: createRtnNewsManualHandler({ ...common, user }), cron: createRtnNewsScheduledHandler({ ...common, authenticate }) };
}
const request = (body: unknown = { organizationId: org }, auth: string | null = 'Bearer synthetic-session') => new Request('https://fixture.test/rtn-news-check', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body),
});
afterEach(() => vi.useRealTimers());

describe('genuine-session news request boundary', () => {
  it('requires real authentication before queue/service/storage work', async () => {
    const a = setup();expect((await a.manual(request(undefined, null))).status).toBe(401);
    expect(a.user).not.toHaveBeenCalled();expect(a.rpc).not.toHaveBeenCalled();
  });
  it('rejects an invalid authenticated user before the scoped queue', async () => {
    const a = setup();a.getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
    expect((await a.manual(request())).status).toBe(401);expect(a.userRpc).not.toHaveBeenCalled();expect(a.rpc).not.toHaveBeenCalled();
  });
  it('does not accept URL/run/admin/actor selectors in the body', async () => {
    for (const extra of [{ url: 'https://attacker.test' }, { runId: run.run_id }, { operation: 'bootstrap' }, { actorId: org }]) {
      const a = setup();expect((await a.manual(request({ organizationId: org, ...extra }))).status).toBe(400);
      expect(a.userRpc).not.toHaveBeenCalled();expect(a.rpc).not.toHaveBeenCalled();
    }
  });
  it('honors an exact-organization permission denial without service elevation', async () => {
    const a = setup();a.userRpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    expect((await a.manual(request())).status).toBe(403);expect(a.rpc).not.toHaveBeenCalled();expect(a.fetcher).not.toHaveBeenCalled();
    expect(a.userRpc).toHaveBeenCalledWith('request_rtn_news_check', { p_organization_id: org });
  });
  it('returns an existing cooldown result without another fetch or claim', async () => {
    const a = setup();a.userRpc.mockResolvedValue({ data: receipt, error: null });
    expect((await a.manual(request())).status).toBe(200);expect(a.rpc).not.toHaveBeenCalled();expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('returns202 when another worker owns the durable lease', async () => {
    const a = setup();a.rpc.mockResolvedValueOnce({ data: null, error: null });
    const response = await a.manual(request());expect(response.status).toBe(202);expect(await response.json()).toEqual(run);
    expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('rejects a service claim for a different run before network work', async () => {
    const a = setup();a.rpc.mockResolvedValueOnce({ data: { ...claim, run_id: '90000000-0000-4000-8000-000000000002' }, error: null });
    expect((await a.manual(request())).status).toBe(503);expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('uses the real user queue and only its returned run for a single service check', async () => {
    const a = setup();const response = await a.manual(request());expect(response.status).toBe(200);
    expect(a.user).toHaveBeenCalledWith('Bearer synthetic-session');
    expect(a.rpc.mock.calls.map(c => c[0])).toEqual(['claim_rtn_news_check', 'complete_rtn_news_check']);
    expect(a.rpc.mock.calls[0][1]).toEqual({ p_run_id: run.run_id });expect(a.fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await response.json())).not.toContain(claim.lease_token);
  });
  it('fails a stalled request body after a bounded deadline before queue access', async () => {
    vi.useFakeTimers();const a = setup();
    const pending = a.manual(new Request('https://fixture.test/rtn-news-check', { method: 'POST', headers: { authorization: 'Bearer synthetic-session' },
      body: new ReadableStream({ pull: () => new Promise(() => {}) }), duplex: 'half' } as RequestInit));
    await vi.advanceTimersByTimeAsync(5001);expect((await pending).status).toBe(400);expect(a.userRpc).not.toHaveBeenCalled();
  });
});

describe('separate opaque authenticated news schedule', () => {
  const cronRequest = (body: unknown = { task: 'rtn-news-reconciliation' }) => request(body);
  it('does no queue, projection or source work when the provider helper denies', async () => {
    const a = setup();a.authenticate.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    expect((await a.cron(cronRequest())).status).toBe(401);expect(a.rpc).not.toHaveBeenCalled();expect(a.fetcher).not.toHaveBeenCalled();
  });
  it('fails closed when opaque authentication is unavailable', async () => {
    const a = setup();a.authenticate.mockRejectedValue(new Error('not configured'));
    expect((await a.cron(cronRequest())).status).toBe(503);expect(a.rpc).not.toHaveBeenCalled();
  });
  it('accepts only the new static task with no source or organization selectors', async () => {
    for (const body of [{ task: 'rtn-source-reconciliation' }, { task: 'rtn-news-reconciliation', organizationId: org }, { task: 'rtn-news-reconciliation', run_id: run.run_id }]) {
      const a = setup();expect((await a.cron(cronRequest(body))).status).toBe(400);expect(a.rpc).not.toHaveBeenCalled();
    }
  });
  it('drains one bounded factual batch and executes at most one global RSS lease', async () => {
    const a = setup();const response = await a.cron(cronRequest());expect(response.status).toBe(200);
    expect(a.rpc.mock.calls.map(c => c[0])).toEqual(['project_rtn_update_intents','enqueue_due_rtn_news_check','claim_rtn_news_check','complete_rtn_news_check']);
    expect(a.rpc.mock.calls[0][1]).toEqual({ p_limit: 25 });expect(a.rpc.mock.calls[2][1]).toEqual({ p_run_id: null });
    expect(a.user).not.toHaveBeenCalled();expect(a.fetcher).toHaveBeenCalledTimes(1);
  });
  it('remains idle without a due lease and does not fetch per organization', async () => {
    const a = setup();a.rpc.mockImplementation(async name => ({ data: name === 'claim_rtn_news_check' ? null : { processed: 0, has_more: false }, error: null }));
    expect((await a.cron(cronRequest())).status).toBe(200);expect(a.fetcher).not.toHaveBeenCalled();expect(a.user).not.toHaveBeenCalled();
  });
  it('does not retry a completion when its commit response is lost', async () => {
    const a = setup();a.rpc.mockImplementation(async name => ({ data: name === 'claim_rtn_news_check' ? claim : null, error: name === 'complete_rtn_news_check' ? { code: '08006' } : null }));
    expect((await a.cron(cronRequest())).status).toBe(503);
    expect(a.rpc.mock.calls.filter(c => c[0] === 'complete_rtn_news_check')).toHaveLength(1);
  });
});
