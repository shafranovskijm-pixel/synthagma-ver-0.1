import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOfflineAuthActor } from '@/utils/courseCache';
import * as f from '@/lib/learningOutcomes/__tests__/fixtures';
import { useLearningCriteria } from '../useLearningCriteria';

const mock = vi.hoisted(() => ({ actor: '', rpc: vi.fn(), handler: (_name: string, _args: any): any => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mock.actor }, userRole: 'organization', loading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: mock.actor }, access_token: 'CRITERIA_ORIGINAL' } }, error: null }) }, rpc: mock.rpc } }));
const useCriteria = () => useLearningCriteria(f.organization, f.course, f.scope.program_version_id);
const save = () => ({ action: 'save_criteria_version' as const, course_id: f.course, program_version_id: f.scope.program_version_id,
  draft_id: f.id(60), expected_revision: 1, definition: f.criteriaDefinition(), reason: 'Сохранить неполный черновик' });
const mutation = (request: string, revision = 2) => ({ schema_version: 1, receipt: { request_id: request, action: 'save_criteria_version',
  scope_hash: f.hash, applied_revision: 2, event_id: f.id(60), input_hash: f.hash, replayed: revision > 2 },
  current: f.criteriaEnvelope([f.criteriaVersion({ revision })]) });
beforeEach(() => {
  vi.clearAllMocks(); setOfflineAuthActor(null); setOfflineAuthActor(f.actor); mock.actor = f.actor;
  mock.handler = (name, args) => name === 'read_learning_outcome' ? { data: args.p_query.kind === 'options' ? f.criteriaOptions() : f.criteriaEnvelope(), error: null }
    : { data: mutation(args.p_request_id), error: null };
  mock.rpc.mockImplementation((name, args) => ({ setHeader: () => Promise.resolve(mock.handler(name, args)) }));
});
afterEach(() => { cleanup(); setOfflineAuthActor(null); });
const ready = async (hook: any) => waitFor(() => expect(hook.result.current.options?.lessons[0].id).toBe(f.id(70)));

describe('criteria hook preserves exact authority and draft/approval boundaries', () => {
  it('saves an incomplete draft without approving, choosing people or inventing a pass threshold', async () => {
    const hook = renderHook(useCriteria); await ready(hook);
    await act(async () => { expect(await hook.result.current.mutate(save())).toBe(true); });
    const writes = mock.rpc.mock.calls.filter(call => call[0] === 'apply_learning_outcome_action');
    expect(writes).toHaveLength(1); expect(writes[0][1].p_command.action).toBe('save_criteria_version');
    expect(writes[0][1].p_command.definition.main).toBeNull(); expect(writes[0][1].p_command.definition.reviewer_id).toBeNull();
    expect(writes[0][1].p_command.definition.eligible_decider_ids).toEqual([]);
  });
  it('requires the actual assigned reviewer and rejects self-approval under independent review', async () => {
    for (const version of [f.criteriaVersion({ reviewer_id: f.id(72), definition: f.criteriaDefinition({ reviewer_id: f.id(72) }) }),
      f.criteriaVersion({ reviewer_id: f.actor, definition: f.criteriaDefinition({ reviewer_id: f.actor, independent_review_required: true }) })]) {
      mock.handler = (_name, args) => ({ data: args.p_query.kind === 'options' ? f.criteriaOptions() : f.criteriaEnvelope([version]), error: null });
      const hook = renderHook(useCriteria); await ready(hook);
      await act(async () => { expect(await hook.result.current.mutate({ action: 'approve_criteria_version', version_id: version.id,
        expected_revision: version.revision, expected_content_hash: version.content_hash, reason: 'Недостаточно полномочий' })).toBe(false); });
      hook.unmount();
    }
    expect(mock.rpc.mock.calls.some(call => call[0] === 'apply_learning_outcome_action')).toBe(false);
  });
  it('cannot edit another author draft and uses a new explicit clone instead', async () => {
    mock.handler = (_name, args) => args.p_query.kind === 'options' ? { data: f.criteriaOptions(), error: null }
      : { data: f.criteriaEnvelope([f.criteriaVersion({ created_by: f.id(72) })]), error: null };
    const hook = renderHook(useCriteria); await ready(hook);
    await act(async () => { expect(await hook.result.current.mutate(save())).toBe(false); });
    expect(mock.rpc.mock.calls.some(call => call[0] === 'apply_learning_outcome_action')).toBe(false);
  });
  it('a denied options read clears the whole private criteria projection', async () => {
    mock.handler = (_name, args) => args.p_query.kind === 'options' ? { data: null, error: { code: '42501' } } : { data: f.criteriaEnvelope(), error: null };
    const hook = renderHook(useCriteria);
    await waitFor(() => expect(hook.result.current.error).toBe('ACCESS_DENIED'));
    expect(hook.result.current.data).toBeNull(); expect(hook.result.current.options).toBeNull(); expect(hook.result.current.pending).toBe(false);
  });
  it('an uncertain retry retains the original request, body and revision after a newer read', async () => {
    const hook = renderHook(useCriteria); await ready(hook); let count = 0; const normal = mock.handler;
    mock.handler = (name, args) => name === 'apply_learning_outcome_action' ? (++count === 1 ? { data: null, error: { message: 'network uncertain' } }
      : { data: mutation(args.p_request_id, 8), error: null }) : args.p_query.kind === 'criteria' ? { data: f.criteriaEnvelope([f.criteriaVersion({ revision: 8 })]), error: null } : normal(name, args);
    await act(async () => { expect(await hook.result.current.mutate(save())).toBe(false); });
    expect(hook.result.current.pending).toBe(true);
    await act(async () => { await hook.result.current.reload(); });
    expect(hook.result.current.data?.versions[0].revision).toBe(8);
    await act(async () => { expect(await hook.result.current.retryPending()).toBe(true); });
    const writes = mock.rpc.mock.calls.filter(call => call[0] === 'apply_learning_outcome_action');
    expect(writes).toHaveLength(2); expect(writes[0]).toEqual(writes[1]); expect(writes[1][1].p_command.expected_revision).toBe(1);
  });
  it('an actor A → B → A cannot publish an old save or retain its pending body', async () => {
    const hook = renderHook(useCriteria); await ready(hook); const normal = mock.handler; let finish!: (value: any) => void;
    mock.handler = (name, args) => name === 'apply_learning_outcome_action' ? new Promise(resolve => { finish = resolve; }) : normal(name, args);
    let response!: Promise<boolean>; act(() => { response = hook.result.current.mutate(save()); }); await waitFor(() => expect(finish).toBeDefined());
    const request = mock.rpc.mock.calls.find(call => call[0] === 'apply_learning_outcome_action')![1].p_request_id;
    act(() => { mock.actor = f.id(99); setOfflineAuthActor(mock.actor); hook.rerender(); });
    act(() => { mock.actor = f.actor; setOfflineAuthActor(mock.actor); hook.rerender(); }); await ready(hook);
    await act(async () => { finish({ data: mutation(request), error: null }); expect(await response).toBe(false); });
    expect(hook.result.current.data?.versions[0].revision).toBe(1); expect(hook.result.current.pending).toBe(false);
  });
});
