// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc, invoke, abortSignal } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), abortSignal: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, functions: { invoke } } }));
import { checkRtnNewsNow, getRtnNewsCheckState } from './rtn-news-check';

const org = '11111111-1111-4111-8111-111111111111', run = '90000000-0000-4000-8000-000000000001';
const time = '2026-11-20T12:00:00+00:00';
const health = () => ({ code: 'official-news-rss', feed_url: 'https://www.gosnadzor.ru/news/rss/', last_checked_at: null, last_success_at: null,
  status: 'never_checked', coverage_kind: 'unknown', coverage_from: null, coverage_until: null, error_code: null, complete_archive: false });
const state = () => ({ check: null, source_health: health(), can_request: true, next_due_at: time });
const receipt = () => ({ run_id: run, status: 'changed', queued_at: time, completed_at: time, new_event_count: 1, correction_count: 0, unchanged_count: 0,
  error_code: null, replayed: false, last_success_at: time, cooldown_until: '2026-11-20T12:10:00Z' });
function reply(data: unknown, error: unknown = null) {
  const promise = Promise.resolve({ data, error });abortSignal.mockReturnValue(promise);rpc.mockReturnValue(Object.assign(promise, { abortSignal }));
}
const failedResponse = (data: unknown, status = 503) => ({ data: null, error: new Error('private server detail'), response: new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }) });
beforeEach(() => { vi.resetAllMocks();reply(state());invoke.mockResolvedValue({ data: receipt(), error: null }); });
afterEach(() => vi.useRealTimers());
describe('genuine scoped news check boundary', () => {
  it('reads only the fixed status RPC and propagates cancellation without actor selectors', async () => {
    const controller = new AbortController();expect(await getRtnNewsCheckState(org, controller.signal)).toEqual(state());
    expect(rpc).toHaveBeenCalledWith('get_rtn_news_check_state', { p_organization_id: org });expect(abortSignal).toHaveBeenCalledWith(controller.signal);expect(invoke).not.toHaveBeenCalled();
  });
  it('invokes only the scoped manual handler with a bounded authenticated SDK request', async () => {
    const controller = new AbortController();expect(await checkRtnNewsNow(org, controller.signal)).toEqual(receipt());
    expect(invoke).toHaveBeenCalledWith('rtn-news-check', { body: { organizationId: org }, signal: controller.signal, timeout: 90_000 });expect(rpc).not.toHaveBeenCalled();
  });
  it('accepts the intentionally minimal202 queue receipt without inventing counts or success', async () => {
    invoke.mockResolvedValue({ data: { run_id: run, status: 'running' }, error: null });
    expect(await checkRtnNewsNow(org)).toEqual({ run_id: run, status: 'running' });
  });
  it('preserves a valid503 terminal failure receipt instead of reporting unchanged', async () => {
    const failed = { ...receipt(), status: 'error', new_event_count: 0, error_code: 'RTN_NEWS_HTTP_403', last_success_at: null };
    invoke.mockResolvedValue(failedResponse(failed));expect(await checkRtnNewsNow(org)).toEqual(failed);expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('retains finite RSS coverage and the last real success after provider blocking', async () => {
    const source = { ...health(), status: 'blocked', last_checked_at: time, last_success_at: '2026-11-20T11:00:00Z', error_code: 'RTN_NEWS_HTTP_403', coverage_kind: 'finite_rss_window', coverage_from: '2026-11-20T08:00:00Z', coverage_until: '2026-11-20T09:00:00Z' };
    reply({ ...state(), source_health: source, next_due_at: '2026-11-21T12:00:00Z' });
    expect((await getRtnNewsCheckState(org)).source_health).toEqual(source);
  });
  it.each(['bad-id', 'https://attacker.test/', '11111111-1111-1111-1111-111111111111'])('denies invalid organization before either API call: %s', async value => {
    await expect(getRtnNewsCheckState(value)).rejects.toMatchObject({ code: 'invalid_response' });await expect(checkRtnNewsNow(value)).rejects.toMatchObject({ code: 'invalid_response' });expect(rpc).not.toHaveBeenCalled();expect(invoke).not.toHaveBeenCalled();
  });
  it.each([
    { can_request: 'true' }, { next_due_at: '2026-11-20T12:00:00' }, { next_due_at: '2026-02-30T12:00:00Z' }, { lease_token: org },
    { check: { ...receipt(), status: 'error', error_code: null } }, { check: { ...receipt(), status: 'running', completed_at: time } },
    { check: { ...receipt(), new_event_count: Number.MAX_SAFE_INTEGER } }, { check: { ...receipt(), correction_count: 200 } },
    { check: { ...receipt(), status: 'unchanged' } }, { check: { ...receipt(), status: 'changed', new_event_count: 0 } },
    { source_health: { ...health(), status: 'partial' } }, { source_health: { ...health(), complete_archive: true } },
    { source_health: { ...health(), feed_url: 'https://attacker.test/' } }, { source_health: { ...health(), coverage_from: time } },
  ])('fails closed on malformed status or invented health: %j', async delta => {
    reply({ ...state(), ...delta });await expect(getRtnNewsCheckState(org)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('does not expose unknown RPC errors or reinterpret a missing endpoint as empty news', async () => {
    reply(null, { code: 'PGRST202', message: 'private schema' });await expect(getRtnNewsCheckState(org)).rejects.toMatchObject({ code: 'network' });
  });
  it('keeps the server permission denial distinct from a provider news check error', async () => {
    reply(null, { code: '42501' });await expect(getRtnNewsCheckState(org)).rejects.toMatchObject({ code: 'forbidden' });
    invoke.mockResolvedValue(failedResponse({ error: 'RTN_NEWS_ACCESS_REQUIRED' }, 403));await expect(checkRtnNewsNow(org)).rejects.toMatchObject({ code: 'forbidden' });
  });
  it.each([{ run_id: run, status: 'unchanged' }, { ...receipt(), lease_token: org }, { ...receipt(), status: 'success' }, { ...receipt(), replayed: 'false' }])('rejects an incomplete or expanded manual receipt: %j', async value => {
    invoke.mockResolvedValue({ data: value, error: null });await expect(checkRtnNewsNow(org)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('does not fabricate a receipt for an unknown commit or relay failure', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('network') });await expect(checkRtnNewsNow(org)).rejects.toMatchObject({ code: 'network' });expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized error readback before buffering the entire body', async () => {
    const cancel = vi.fn();const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(16385)); }, cancel }), { status: 503, headers: { 'content-type': 'application/json' } });
    invoke.mockResolvedValue({ data: null, error: new Error('http'), response });await expect(checkRtnNewsNow(org)).rejects.toMatchObject({ code: 'network' });expect(cancel).toHaveBeenCalled();expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('bounds and cancels a stalled503 response body without a second request', async () => {
    vi.useFakeTimers();const cancel = vi.fn();let read!: () => void;const started = new Promise<void>(resolve => { read = resolve; });
    const response = new Response(new ReadableStream({ pull() { read();return new Promise(() => {}); }, cancel }), { status: 503, headers: { 'content-type': 'application/json' } });
    invoke.mockResolvedValue({ data: null, error: new Error('http'), response });const waiting = expect(checkRtnNewsNow(org)).rejects.toMatchObject({ code: 'network' });
    await started;await vi.advanceTimersByTimeAsync(5001);await waiting;expect(cancel).toHaveBeenCalled();expect(invoke).toHaveBeenCalledTimes(1);
  });
});
