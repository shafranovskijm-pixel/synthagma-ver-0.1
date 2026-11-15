// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRtnHandler } from './http-handler';
import { createRtnScheduledHandler } from './scheduled-handler';
import type { CheckClaim, WorkerClient } from './check-worker';
import { createWithOfficialFetch } from './official-http-client';

const id = '04cc2cb4-c837-40ca-9767-6d6b95def7f5';
const claim: CheckClaim = { run_id: id, lease_token: 'synthetic-only-lease', kind: 'manual', source: {
  id, page_url: 'https://www.gosnadzor.ru/service/list/Safety%20certification/lab/index.php',
  document_url: 'https://www.gosnadzor.ru/service/list/Safety%20certification/lab/old.pdf',
  trusted_anchor_rule: 'a1', parser: 'industrial-pdf', last_sha256: null,
} };
function fixture() {
  const events: string[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    events.push('fetch');
    const text = String(input).endsWith('.pdf') ? '%PDF-1.7\nsynthetic official original' : '<a href="new.pdf">А.1. Основы промышленной безопасности</a>';
    const body = new ReadableStream({ pull(controller) { events.push('body'); controller.enqueue(new TextEncoder().encode(text)); controller.close(); } });
    return new Response(body, { headers: { 'content-type': String(input).endsWith('.pdf') ? 'application/pdf' : 'text/html; charset=utf-8' } });
  });
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    events.push(name);
    if (name === 'claim_rtn_check') return { data: claim, error: null };
    if (name === 'complete_rtn_check') return { data: { run_id: id, status: (args?.p_result as { status: string }).status }, error: null };
    return { data: {}, error: null };
  });
  const service = { rpc, storage: { from: () => ({ upload: async () => ({ error: null }) }) } } as unknown as WorkerClient;
  const withOfficialFetch = vi.fn(async <T>(action: (fetcher: typeof fetch) => Promise<T>) => {
    events.push('scope');
    try { return await action(fetcher); } finally { events.push('close'); }
  });
  const user = () => ({ auth: { getUser: async () => { events.push('auth'); return { data: { user: { id } }, error: null }; } },
    rpc: async () => { events.push('queue'); return { data: { run_id: id, status: 'queued' }, error: null }; } });
  return { events, rpc, fetcher, withOfficialFetch, service, user, normalize: vi.fn(async () => []) };
}
describe('source handler official fetch lifetime', () => {
  it.each(['user', 'cron'])('opens the per-run scope only after a genuine %s claim and closes after body/storage/completion', async entry => {
    const a = fixture();
    const handler = entry === 'user' ? createRtnHandler(a) : createRtnScheduledHandler({ ...a, authenticate: () => null });
    const response = await handler(new Request('https://local.test/rtn', { method: 'POST', headers: { authorization: 'Bearer synthetic-user' }, body: JSON.stringify(entry === 'user' ? { organizationId: id, sourceId: id } : { task: 'rtn-source-reconciliation' }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ run_id: id, status: 'changed' });
    expect(a.withOfficialFetch).toHaveBeenCalledTimes(1);
    expect(a.events.indexOf('claim_rtn_check')).toBeLessThan(a.events.indexOf('scope'));
    expect(a.events.indexOf('scope')).toBeLessThan(a.events.indexOf('fetch'));
    expect(a.events.lastIndexOf('body')).toBeLessThan(a.events.indexOf('complete_rtn_check'));
    expect(a.events.at(-1)).toBe('close');
  });
  it.each(['user', 'cron'])('real %s scope closes once after an uncertain completion without completing twice', async entry => {
    const a = fixture(), close = vi.fn(() => { a.events.push('native-close'); });
    const withOfficialFetch = createWithOfficialFetch({ fetcher: a.fetcher, createHttpClient: () => ({ close }), now: () => Date.parse('2026-11-15T01:00:00Z') });
    a.rpc.mockImplementation(async (name: string) => {
      a.events.push(name);
      return name === 'claim_rtn_check' ? { data: claim, error: null } : name === 'complete_rtn_check'
        ? { data: null, error: { code: '40001' } } as never : { data: {}, error: null };
    });
    const deps = { ...a, withOfficialFetch };
    const handler = entry === 'user' ? createRtnHandler(deps) : createRtnScheduledHandler({ ...deps, authenticate: () => null });
    const response = await handler(new Request('https://local.test/rtn', { method: 'POST', headers: { authorization: 'Bearer synthetic-user' }, body: JSON.stringify(entry === 'user' ? { organizationId: id, sourceId: id } : { task: 'rtn-source-reconciliation' }) }));
    expect(response.status).toBe(503); expect(close).toHaveBeenCalledTimes(1);
    expect(a.rpc.mock.calls.filter(call => call[0] === 'complete_rtn_check')).toHaveLength(1);
    expect(a.events.indexOf('complete_rtn_check')).toBeLessThan(a.events.indexOf('native-close'));
  });
  it.each(['user', 'cron'])('does not allocate or open a scope for unauthenticated/idle %s requests', async entry => {
    const a = fixture(), createHttpClient = vi.fn(() => ({ close: vi.fn() }));
    const withOfficialFetch = vi.fn(createWithOfficialFetch({ fetcher: a.fetcher, createHttpClient, now: () => Date.parse('2026-11-15T01:00:00Z') }));
    const deps = { ...a, withOfficialFetch };
    const denied = entry === 'user' ? createRtnHandler(deps) : createRtnScheduledHandler({ ...deps, authenticate: () => new Response(null, { status: 401 }) });
    expect((await denied(new Request('https://local.test/rtn', { method: 'POST', body: '{}' }))).status).toBe(401);
    a.rpc.mockResolvedValue({ data: null, error: null } as never);
    const idle = entry === 'user' ? createRtnHandler(deps) : createRtnScheduledHandler({ ...deps, authenticate: () => null });
    expect((await idle(new Request('https://local.test/rtn', { method: 'POST', headers: { authorization: 'Bearer synthetic-user' }, body: JSON.stringify(entry === 'user' ? { organizationId: id, sourceId: id } : { task: 'rtn-source-reconciliation' }) }))).status).toBe(200);
    expect(withOfficialFetch).not.toHaveBeenCalled(); expect(createHttpClient).not.toHaveBeenCalled(); expect(a.fetcher).not.toHaveBeenCalled();
  });
});
