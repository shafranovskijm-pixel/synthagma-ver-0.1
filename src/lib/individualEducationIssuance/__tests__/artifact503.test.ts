import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as f from './fixtures';
const port = vi.hoisted(() => ({current: true, actor: '00000000-0000-4000-8000-000000000002', session: vi.fn(), rpc: vi.fn(), invoke: vi.fn(), preparation: null as any}));
vi.mock('@/utils/courseCache', () => ({captureOfflineContext: () => ({actorId: port.actor, revision: 1}), isOfflineActorCurrent: () => port.current}));
vi.mock('@/integrations/supabase/client', () => ({supabase: {auth: {getSession: port.session}, rpc: port.rpc, functions: {invoke: port.invoke}}}));
import * as api from '../client';
const scope = () => api.captureScope(f.org, f.enrollment, f.pupil, f.course, () => true);
beforeEach(() => {
  vi.clearAllMocks(); port.current = true; port.actor = f.actor; port.preparation = f.preparation();
  port.session.mockResolvedValue({data: {session: {user: {id: f.actor}, access_token: 'SYNTHETIC'}}, error: null});
  port.rpc.mockImplementation(() => ({setHeader: async () => ({data: {...f.envelope('preparation'), preparation: port.preparation}, error: null})}));
});
const errorResponse = (code: string, retryable: boolean) => new Response(JSON.stringify({schema_version: 1, code, retryable, message: 'Fixed test message'}), {status: 503, headers: {'Content-Type': 'application/json'}});

describe('actual render operation retains uncertain typed503 identities', () => {
  it.each([['DEPENDENCY_UNAVAILABLE', true], ['DEPENDENCY_UNAVAILABLE', false], ['ARTIFACT_RENDER_FAILED', true], ['ARTIFACT_RENDER_FAILED', false]] as const)
    ('retains %s and the same frozen body even if provider retryable=%s', async (code, retryable) => {
      port.invoke.mockImplementation(async () => ({data: null, error: {context: errorResponse(code, retryable)}}));
      const p = structuredClone(port.preparation), operation = api.render(scope(), p, f.uid(800)); p.plan.reason = 'Later local change';
      await expect(operation.run()).rejects.toMatchObject({code, definitive: false, retryable});
      await expect(operation.run()).rejects.toMatchObject({code, definitive: false});
      expect(port.invoke).toHaveBeenCalledTimes(2);
      const one = port.invoke.mock.calls[0][1].body, two = port.invoke.mock.calls[1][1].body;
      expect(two).toBe(one); expect(two.request_id).toBe(f.uid(800));
      expect(two).toEqual(operation.body);
    });
  it('keeps an explicit source rejection definitive without accepting arbitrary provider text', async () => {
    port.invoke.mockResolvedValue({data: null, error: {context: errorResponse('SOURCE_CHANGED', false)}});
    await expect(api.render(scope(), port.preparation, f.uid(801)).run()).rejects.toMatchObject({code: 'SOURCE_CHANGED', definitive: true, retryable: false});
  });
  it.each([() => new Response('provider HTML', {status: 503, headers: {'Content-Type': 'text/html'}}), () => errorResponse('UNTRUSTED_PROVIDER_CODE', false), () => new Response('{invalid', {status: 503, headers: {'Content-Type': 'application/json'}})])
    ('keeps unconfirmed responses nonterminal and preserves the original operation', async response => {
      port.invoke.mockImplementation(async () => ({data: null, error: {context: response()}}));
      const operation = api.render(scope(), port.preparation, f.uid(802));
      await expect(operation.run()).rejects.toMatchObject({definitive: false});
      expect(operation.body.request_id).toBe(f.uid(802));
    });
});
