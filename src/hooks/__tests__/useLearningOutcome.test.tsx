import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeOfflineAccess, setOfflineAuthActor } from '@/utils/courseCache';
import * as f from '@/lib/learningOutcomes/__tests__/fixtures';
import { useLearningOutcome } from '../useLearningOutcome';

const mock = vi.hoisted(() => ({ user: { id: '' }, role: 'organization', authLoading: false,
  rpc: vi.fn(), session: vi.fn(), handler: (_name: string, _args: any): any => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mock.user, userRole: mock.role, loading: mock.authLoading }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mock.session }, rpc: mock.rpc } }));
const scopeFor = (user = f.learner) => ({ ...f.scope, user_id: user });
const outcomeFor = (user = f.learner, extra: any = {}) => f.outcome({ scope: scopeFor(user), ...extra });
beforeEach(() => {
  vi.clearAllMocks(); setOfflineAuthActor(null); setOfflineAuthActor(f.actor);
  mock.user = { id: f.actor }; mock.role = 'organization'; mock.authLoading = false;
  mock.session.mockImplementation(async () => ({ data: { session: { user: { id: mock.user.id }, access_token: 'ORIGINAL_ACTOR_TOKEN' } }, error: null }));
  mock.handler = (name, args) => {
    if (name === 'read_learning_outcome' && args.p_query.kind === 'associations') return { data: {
      ...f.associations([outcomeFor(args.p_query.user_id)]), user_id: args.p_query.user_id,
    }, error: null };
    if (name === 'read_learning_outcome') return { data: outcomeFor(args.p_query.scope.user_id), error: null };
    return { data: f.mutation(args.p_request_id), error: null };
  };
  mock.rpc.mockImplementation((name, args) => ({ setHeader: () => Promise.resolve(mock.handler(name, args)) }));
});
afterEach(() => { cleanup(); setOfflineAuthActor(null); });
const ready = async (hook: any) => waitFor(() => expect(hook.result.current.data?.scope.user_id).toBe(f.learner));
const useOutcome = (enabled = true) => useLearningOutcome(f.organization, f.learner, f.course, f.enrollment, enabled);

describe('learning outcome private hook uses actual actor and exact target generations', () => {
  it('does not fetch a closed course or manufacture a decision from an eligible result', async () => {
    const hook = renderHook(({ enabled }) => useOutcome(enabled), { initialProps: { enabled: false } });
    expect(mock.rpc).not.toHaveBeenCalled(); expect(hook.result.current.data).toBeNull();
    hook.rerender({ enabled: true }); await ready(hook);
    expect(hook.result.current.data?.machine?.eligibility).toBe('eligible');
    expect(hook.result.current.data?.last_decision).toBeNull();
    expect(mock.rpc.mock.calls.every(call => call[0] === 'read_learning_outcome')).toBe(true);
  });
  it('does not choose a default when several exact programme snapshots are available', async () => {
    mock.handler = () => ({ data: f.associations([f.outcome(), f.outcome({ scope: { ...f.scope, group_id: f.id(80), program_enrollment_snapshot_id: f.id(81) } })]), error: null });
    const hook = renderHook(() => useOutcome());
    await waitFor(() => expect(hook.result.current.associations?.associations).toHaveLength(2));
    expect(hook.result.current.data).toBeNull(); expect(hook.result.current.selected).toBeNull();
    expect(await hook.result.current.capture('No exact selection')).toBe(false);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it('drops a late private association response after target A → B → A', async () => {
    let finish!: (value: any) => void; let first = true; const normal = mock.handler;
    mock.handler = (name, args) => args.p_query?.user_id === f.learner && first
      ? (first = false, new Promise(resolve => { finish = resolve; })) : normal(name, args);
    const hook = renderHook(({ student }) => useLearningOutcome(f.organization, student, f.course, f.enrollment), { initialProps: { student: f.learner } });
    await waitFor(() => expect(finish).toBeDefined());
    hook.rerender({ student: f.id(90) }); await waitFor(() => expect(hook.result.current.data?.scope.user_id).toBe(f.id(90)));
    hook.rerender({ student: f.learner }); await ready(hook);
    await act(async () => finish({ data: f.associations([f.outcome({ prerequisites: ['STALE PRIVATE NOTE'] })]), error: null }));
    expect(hook.result.current.data?.prerequisites).not.toContain('STALE PRIVATE NOTE');
  });
  it('clears all private data and uncertain writes on authoritative same-key denial', async () => {
    const hook = renderHook(() => useOutcome()); await ready(hook);
    const normal = mock.handler;
    mock.handler = (name, args) => name === 'apply_learning_outcome_action' ? { data: null, error: { message: 'network uncertain' } } : normal(name, args);
    await act(async () => { expect(await hook.result.current.capture('Пересчитать')).toBe(false); });
    expect(hook.result.current.pending).toBe(true);
    mock.handler = () => ({ data: null, error: { message: 'forbidden' }, status: 403 });
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.error).toBe('ACCESS_DENIED');
    expect(hook.result.current.data).toBeNull(); expect(hook.result.current.associations).toBeNull(); expect(hook.result.current.selected).toBeNull();
    expect(hook.result.current.pending).toBe(false); expect(await hook.result.current.retryPending()).toBe(false);
  });
  it('retries unknown capture with its original UUID, CAS, body and bearer after a newer read', async () => {
    const hook = renderHook(() => useOutcome()); await ready(hook); let writes = 0; const normal = mock.handler;
    mock.handler = (name, args) => name === 'apply_learning_outcome_action'
      ? (++writes === 1 ? { data: null, error: { message: 'network uncertain' } }
        : { data: { ...f.mutation(args.p_request_id, { revision: 8 }), receipt: { ...f.mutation(args.p_request_id).receipt, replayed: true } }, error: null })
      : name === 'read_learning_outcome' && args.p_query.kind === 'outcome' ? { data: f.outcome({ revision: 8 }), error: null } : normal(name, args);
    const headers: string[] = [];
    mock.rpc.mockImplementation((name, args) => ({ setHeader: (_name: string, bearer: string) => { if (name === 'apply_learning_outcome_action') headers.push(bearer); return Promise.resolve(mock.handler(name, args)); } }));
    await act(async () => { expect(await hook.result.current.capture('Пересчитать')).toBe(false); });
    expect(hook.result.current.pending).toBe(true);
    mock.session.mockResolvedValue({ data: { session: { user: { id: f.actor }, access_token: 'REFRESHED_TOKEN' } }, error: null });
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.data?.revision).toBe(8);
    await act(async () => { expect(await hook.result.current.capture('New body is forbidden')).toBe(false); expect(await hook.result.current.retryPending()).toBe(true); });
    const calls = mock.rpc.mock.calls.filter(call => call[0] === 'apply_learning_outcome_action');
    expect(calls).toHaveLength(2); expect(calls[0]).toEqual(calls[1]); expect(calls[1][1].p_command.expected_revision).toBe(2);
    expect(headers).toEqual(['Bearer ORIGINAL_ACTOR_TOKEN', 'Bearer ORIGINAL_ACTOR_TOKEN']);
    expect(hook.result.current.pending).toBe(false);
  });
  it('retains the exact pending action through a failed manual read so the independent retry UI can submit it', async () => {
    const hook = renderHook(() => useOutcome()); await ready(hook); let writes = 0;
    mock.handler = (name, args) => name === 'apply_learning_outcome_action' ? (++writes === 1
      ? { data: null, error: { message: 'unknown write response' } } : { data: f.mutation(args.p_request_id), error: null })
      : { data: null, error: { message: 'read unavailable' } };
    await act(async () => { expect(await hook.result.current.capture('Исходное основание')).toBe(false); });
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.data).toBeNull(); expect(hook.result.current.error).toBe('DEPENDENCY_UNAVAILABLE'); expect(hook.result.current.pending).toBe(true);
    await act(async () => { expect(await hook.result.current.retryPending()).toBe(true); });
    const calls = mock.rpc.mock.calls.filter(call => call[0] === 'apply_learning_outcome_action');
    expect(calls).toHaveLength(2); expect(calls[0]).toEqual(calls[1]); expect(calls[1][1].p_command.reason).toBe('Исходное основание');
    expect(hook.result.current.pending).toBe(false);
  });
  it('an actor ABA or observed permission revision cannot publish a previously dispatched capture', async () => {
    const hook = renderHook(() => useOutcome()); await ready(hook); const normal = mock.handler;
    let finish!: (value: any) => void;
    mock.handler = (name, args) => name === 'apply_learning_outcome_action' ? new Promise(resolve => { finish = resolve; }) : normal(name, args);
    let result!: Promise<boolean>;
    act(() => { result = hook.result.current.capture('Рассчитать'); }); await waitFor(() => expect(finish).toBeDefined());
    act(() => { mock.user = { id: f.id(99) }; setOfflineAuthActor(f.id(99)); hook.rerender(); });
    act(() => { mock.user = { id: f.actor }; setOfflineAuthActor(f.actor); hook.rerender(); }); await ready(hook);
    const request = mock.rpc.mock.calls.find(call => call[0] === 'apply_learning_outcome_action')![1].p_request_id;
    await act(async () => { finish({ data: f.mutation(request), error: null }); expect(await result).toBe(false); });
    expect(hook.result.current.data?.revision).toBe(2); expect(hook.result.current.pending).toBe(false);
    act(() => { observeOfflineAccess(f.actor, 'permissions-revoked'); hook.rerender(); });
    expect(hook.result.current.data?.revision).not.toBe(3);
  });
  it('refuses writes for missing criteria or read-only capabilities without sending a mutation', async () => {
    for (const extra of [{ criteria_ref: null, machine: null }, { capabilities: { can_capture: false, can_decide: false } }]) {
      mock.handler = () => ({ data: f.associations([f.outcome(extra)]), error: null });
      const hook = renderHook(() => useOutcome()); await ready(hook);
      await act(async () => { expect(await hook.result.current.capture('Не должен отправляться')).toBe(false); });
      hook.unmount();
    }
    expect(mock.rpc.mock.calls.some(call => call[0] === 'apply_learning_outcome_action')).toBe(false);
  });
  it('records a separate authorized human decision without modifying the machine or technical completion', async () => {
    const normal = mock.handler;
    mock.handler = (name, args) => name === 'read_learning_outcome' ? { data: args.p_query.kind === 'associations'
      ? f.associations([f.outcome({ capabilities: { can_capture: true, can_decide: true } })]) : f.outcome(), error: null }
      : { data: { ...f.mutation(args.p_request_id), receipt: { ...f.mutation(args.p_request_id).receipt, action: 'record_attestation_decision' },
        current: f.outcome({ revision: 3, decision_relation: 'current_inputs', last_decision: { id: f.id(22), machine_result_id: f.id(10), outcome: 'passed',
          learner_summary: 'Итог подтверждён', recorded_at: f.instant, supersedes_id: null, staff_reason: 'Проверены основания', actor_id: f.actor, basis: 'machine' } }) }, error: null };
    const hook = renderHook(() => useOutcome()); await ready(hook);
    await act(async () => { expect(await hook.result.current.decide({ outcome: 'passed', basis: 'machine', staff_reason: 'Проверены основания', learner_summary: 'Итог подтверждён',
      reviewed_current_component_ids: [], recognized_component_ids: [], recognition_file_version_id: null })).toBe(true); });
    expect(hook.result.current.data?.machine?.id).toBe(f.id(10));
    expect(hook.result.current.data?.technical_observation.progress).toBe(100);
    expect(hook.result.current.data?.last_decision?.outcome).toBe('passed');
    const writes = mock.rpc.mock.calls.filter(call => call[0] === 'apply_learning_outcome_action');
    expect(writes).toHaveLength(1); expect(writes[0][1].p_command).toMatchObject({ action: 'record_attestation_decision', expected_revision: 2,
      criteria_ref: f.criteria, machine_result_id: f.id(10), expected_machine_input_hash: f.hash, expected_decision_id: null });
    expect(mock.rpc.mock.calls.every(call => ['read_learning_outcome', 'apply_learning_outcome_action'].includes(call[0]))).toBe(true);
    mock.handler = normal;
  });
  it('a denied recognition options read clears the whole outcome and invalidates pending continuations', async () => {
    const normal = mock.handler;
    mock.handler = (name, args) => args.p_query?.kind === 'decision_options' ? { data: null, error: { code: '42501' } }
      : args.p_query?.kind === 'associations' ? { data: f.associations([f.outcome({ capabilities: { can_capture: true, can_decide: true } })]), error: null } : normal(name, args);
    const hook = renderHook(() => useOutcome()); await ready(hook);
    await act(async () => { await hook.result.current.loadDecisionOptions(); });
    expect(hook.result.current.data).toBeNull(); expect(hook.result.current.associations).toBeNull();
    expect(hook.result.current.decisionOptions).toBeNull(); expect(hook.result.current.error).toBe('ACCESS_DENIED');
  });
});
