import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOfflineAuthActor } from '@/utils/courseCache';
import * as api from '../client';
import * as f from './fixtures';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mock.session }, rpc: mock.rpc } }));
beforeEach(() => {
  vi.clearAllMocks(); setOfflineAuthActor(null); setOfflineAuthActor(f.actor);
  mock.session.mockResolvedValue({ data: { session: { user: { id: f.actor }, access_token: 'SYNTHETIC_ORIGINAL' } }, error: null });
  mock.rpc.mockImplementation(() => ({ setHeader: vi.fn().mockResolvedValue({ data: f.associations(), error: null }) }));
});
afterEach(() => setOfflineAuthActor(null));
const actorScope = (exact = false) => api.captureLearningOutcomeScope(f.organization, f.learner, f.course, f.enrollment, exact ? f.scope : null);
const command = () => ({ action: 'capture_machine_result' as const, scope: f.scope, expected_revision: 2, expected_criteria_ref: f.criteria, reason: 'Проверить сведения' });

describe('actual strict outcome client and pinned original actor', () => {
  it('reads exact enrollment candidates with the original actor bearer and verifies target echo', async () => {
    const header = vi.fn().mockResolvedValue({ data: f.associations(), error: null });
    mock.rpc.mockReturnValue({ setHeader: header });
    expect((await api.readLearningOutcomeAssociations(actorScope())).associations).toHaveLength(1);
    expect(header).toHaveBeenCalledWith('Authorization', 'Bearer SYNTHETIC_ORIGINAL');
    expect(mock.rpc).toHaveBeenCalledWith('read_learning_outcome', { p_organization_id: f.organization,
      p_query: { kind: 'associations', user_id: f.learner, course_id: f.course, enrollment_id: f.enrollment, after_snapshot_id: null, limit: 50 } });
    header.mockResolvedValue({ data: { ...f.associations(), enrollment_id: f.id(99) }, error: null });
    await expect(api.readLearningOutcomeAssociations(actorScope())).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  });
  it('rejects cross-tenant nested scopes, repeated snapshots and dishonest continuation cursors', async () => {
    for (const data of [
      f.associations([f.outcome({ scope: { ...f.scope, organization_id: f.id(99) } })]),
      f.associations([f.outcome(), f.outcome()]),
      { ...f.associations(), next_after_snapshot_id: f.id(99) },
    ]) {
      mock.rpc.mockReturnValue({ setHeader: () => Promise.resolve({ data, error: null }) });
      await expect(api.readLearningOutcomeAssociations(actorScope())).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    }
  });
  it('rejects an actor ABA before dispatch and an auth session belonging to another actor', async () => {
    const old = actorScope(); setOfflineAuthActor(f.id(90)); setOfflineAuthActor(f.actor);
    await expect(api.readLearningOutcomeAssociations(old)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.session.mockResolvedValue({ data: { session: { user: { id: f.id(90) }, access_token: 'OTHER' } }, error: null });
    await expect(api.readLearningOutcomeAssociations(actorScope())).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([{ code: '42501' }, { code: 'PGRST301' }, { status: 401 }, { status: 403 }])('masks authoritative denial %j', async error => {
    mock.rpc.mockReturnValue({ setHeader: () => Promise.resolve({ data: null, error }) });
    await expect(api.readLearningOutcomeAssociations(actorScope())).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it.each([401, 403])('masks authoritative HTTP %s even if a response contains a valid data shape', async status => {
    mock.rpc.mockReturnValue({ setHeader: () => Promise.resolve({ data: f.associations(), error: null, status }) });
    await expect(api.readLearningOutcomeAssociations(actorScope())).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('keeps the original command, request UUID and bearer when an uncertain capture is retried', async () => {
    const prepared = await api.prepareLearningOutcomeCapture(actorScope(true), command(), f.id(20));
    mock.session.mockResolvedValue({ data: { session: { user: { id: f.actor }, access_token: 'NEW_TOKEN' } }, error: null });
    const header = vi.fn().mockRejectedValueOnce(new Error('uncertain network')).mockResolvedValueOnce({ data: f.mutation(), error: null });
    mock.rpc.mockReturnValue({ setHeader: header });
    await expect(api.applyPreparedLearningOutcomeCapture(prepared)).rejects.toThrow();
    expect((await api.applyPreparedLearningOutcomeCapture(prepared)).receipt.applied_revision).toBe(3);
    expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
    expect(header.mock.calls).toEqual([['Authorization', 'Bearer SYNTHETIC_ORIGINAL'], ['Authorization', 'Bearer SYNTHETIC_ORIGINAL']]);
    expect(mock.session).toHaveBeenCalledTimes(1);
  });
  it('refuses a receipt for another request, CAS or criteria rather than publishing it', async () => {
    const prepared = await api.prepareLearningOutcomeCapture(actorScope(true), command(), f.id(20));
    for (const data of [
      f.mutation(f.id(99)),
      { ...f.mutation(), receipt: { ...f.mutation().receipt, applied_revision: 4 } },
      f.mutation(f.id(20), { criteria_ref: { ...f.criteria, id: f.id(90) }, machine: null }),
    ]) {
      mock.rpc.mockReturnValue({ setHeader: () => Promise.resolve({ data, error: null }) });
      await expect(api.applyPreparedLearningOutcomeCapture(prepared)).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    }
  });
});
