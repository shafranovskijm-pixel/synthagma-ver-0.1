import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offlineMemoryStorage } from '@/test/offlineMemoryStorage';
import { captureOfflineActor, rememberOfflineScope, setOfflineAuthActor } from '../courseCache';
import { addToSyncQueue, syncOfflineQueue, type SyncAction } from '../offlineSync';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), from: vi.fn(), writes: [] as any[], headers: [] as string[], acknowledgement: true, sourceOrg: 'org-a', sourceStatus: 'active', mutationGate: null as Promise<void> | null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.getSession }, from: mocks.from } }));
let storage: ReturnType<typeof offlineMemoryStorage>;
const bind = (actorId = 'a', organizationId = 'org-a', effectiveUserId = actorId, mode: 'learner' | 'preview' = 'learner') =>
  rememberOfflineScope({ actorId, organizationId, effectiveUserId, mode }, 'course', captureOfflineActor(actorId))!;
const queue = () => storage.rows('sigma-offline-sync', 'sync_queue');
const owned = (id: string, overrides: Partial<SyncAction> = {}): SyncAction => ({ id, type: 'enrollment_update', data: { id: 'enrollment', progress: 50 },
  owner: { actorId: 'a', organizationId: 'org-a', effectiveUserId: 'a', mode: 'learner', resource: 'course' }, courseId: 'course', createdAt: 1, ...overrides });
function source(table: string) {
  let write = false; let payload: any; let bearer = '';
  const query: any = {
    select: () => query, eq: () => query,
    setHeader: (name: string, value: string) => { expect(name).toBe('Authorization'); bearer = value; return query; },
    update: (data: any) => { write = true; payload = data; return query; },
    upsert: (data: any) => { write = true; payload = data; return query; },
    maybeSingle: async () => {
      mocks.headers.push(bearer);
      const user = bearer === 'Bearer SYNTHETIC_B' ? 'b' : 'a';
      const enrollmentId = user === 'a' ? 'enrollment' : 'enrollment-b';
      if (write) {
        mocks.writes.push({ table, payload }); if (mocks.mutationGate && user === 'a') await mocks.mutationGate;
        return { data: mocks.acknowledgement ? (table === 'enrollments' ? { id: enrollmentId, user_id: user, course_id: 'course' } : { lesson_id: 'lesson', user_id: user }) : null, error: null };
      }
      const data = table === 'courses' ? { id: 'course', organization_id: mocks.sourceOrg }
        : table === 'enrollments' ? { id: enrollmentId, user_id: user, course_id: 'course', status: mocks.sourceStatus, expires_at: null }
          : { id: 'lesson', course_id: 'course' };
      return { data, error: null };
    },
  };
  return query;
}
beforeEach(() => {
  vi.clearAllMocks(); storage = offlineMemoryStorage(); vi.stubGlobal('indexedDB', storage.factory);
  setOfflineAuthActor(null); setOfflineAuthActor('a'); mocks.writes = []; mocks.headers = []; mocks.acknowledgement = true; mocks.sourceOrg = 'org-a'; mocks.sourceStatus = 'active'; mocks.mutationGate = null;
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' }, access_token: 'SYNTHETIC_A' } }, error: null }); mocks.from.mockImplementation(source);
});
afterEach(() => { vi.unstubAllGlobals(); setOfflineAuthActor(null); });

describe('offline queue original actor/context delivery', () => {
  it('replays only exact owned current learner/course and quarantines legacy, foreign actor and preview entries', async () => {
    const scope = bind();
    queue().set('own', owned('own'));
    queue().set('legacy', owned('legacy', { owner: undefined }));
    queue().set('foreign', owned('foreign', { owner: { ...owned('').owner!, actorId: 'b', effectiveUserId: 'b' } }));
    queue().set('preview', owned('preview', { owner: { ...owned('').owner!, mode: 'preview' } }));
    expect(await syncOfflineQueue(scope, 'course')).toBe(1);
    expect(mocks.writes).toEqual([{ table: 'enrollments', payload: { progress: 50 } }]);
    expect(mocks.headers).toEqual(['Bearer SYNTHETIC_A', 'Bearer SYNTHETIC_A', 'Bearer SYNTHETIC_A']);
    expect([...queue().keys()].sort()).toEqual(['foreign', 'legacy', 'preview']);
  });
  it('requires a fresh exact tenant/enrollment source and actual returning acknowledgement', async () => {
    const scope = bind(); queue().set('own', owned('own')); mocks.sourceOrg = 'other-org';
    expect(await syncOfflineQueue(scope, 'course')).toBe(0); expect(mocks.writes).toHaveLength(0);
    mocks.sourceOrg = 'org-a'; mocks.acknowledgement = false;
    expect(await syncOfflineQueue(scope, 'course')).toBe(0); expect(queue().has('own')).toBe(true);
  });
  it('never dispatches a session without its original captured bearer', async () => {
    const scope = bind(); queue().set('own', owned('own'));
    mocks.getSession.mockResolvedValue({data: {session: {user: {id: 'a'}}}, error: null});
    expect(await syncOfflineQueue(scope, 'course')).toBe(0); expect(mocks.from).not.toHaveBeenCalled(); expect(queue().has('own')).toBe(true);
  });
  it.each(['pending', 'cancelled', 'blocked'])('known enrollment status %s cannot replay prior active work', async status => {
    const scope = bind(); queue().set('own', owned('own')); mocks.sourceStatus = status;
    expect(await syncOfflineQueue(scope, 'course')).toBe(0); expect(mocks.writes).toHaveLength(0); expect(queue().has('own')).toBe(true);
  });
  it.each([{ user_id: 'b' }, { course_id: 'other' }, { organization_id: 'other' }, { group_id: 'other' }, { status: 'completed' }])('never forwards an identity/issuance enrollment patch %j', async extra => {
    const scope = bind(); queue().set('forged', owned('forged', { data: { id: 'enrollment', progress: 10, ...extra } }));
    expect(await syncOfflineQueue(scope, 'course')).toBe(0); expect(mocks.writes).toHaveLength(0); expect(queue().has('forged')).toBe(true);
  });
  it('stops deferred getAll on A→B→A and does not infer that returning actor owns legacy work', async () => {
    const scope = bind(); queue().set('own', owned('own'));
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); storage.holdReads(() => gate);
    const pending = syncOfflineQueue(scope, 'course'); await Promise.resolve(); await Promise.resolve();
    setOfflineAuthActor('b'); setOfflineAuthActor('a'); bind(); release();
    expect(await pending).toBe(0); expect(mocks.writes).toHaveLength(0); expect(queue().has('own')).toBe(true);
  });
  it('same actor enters preview while session is pending: no learner batch dispatches', async () => {
    const scope = bind(); queue().set('own', owned('own')); let active = true;
    let release!: (value: any) => void; mocks.getSession.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const pending = syncOfflineQueue(scope, 'course', () => active);
    await vi.waitFor(() => expect(mocks.getSession).toHaveBeenCalledOnce());
    active = false; bind('a', 'org-a', 'student-b', 'preview');
    release({ data: { session: { user: { id: 'a' }, access_token: 'SYNTHETIC_A' } }, error: null });
    expect(await pending).toBe(0); expect(mocks.writes).toHaveLength(0);
  });
  it('already dispatched write may finish after actor switch, but no stale deletion/success/next dispatch is claimed', async () => {
    const scope = bind(); queue().set('first', owned('first')); queue().set('second', owned('second'));
    let release!: () => void; mocks.mutationGate = new Promise(resolve => { release = resolve; });
    const pending = syncOfflineQueue(scope, 'course');
    await vi.waitFor(() => expect(mocks.writes).toHaveLength(1)); setOfflineAuthActor('b'); setOfflineAuthActor('a'); bind(); release();
    expect(await pending).toBe(0); expect(mocks.writes).toHaveLength(1); expect([...queue().keys()]).toEqual(['first', 'second']);
  });
  it('new B context can finish its own batch while a dispatched stopped A request remains pending', async () => {
    const a = bind(); queue().set('a', owned('a'));
    queue().set('b', owned('b', {data: {id: 'enrollment-b', progress: 30}, owner: {...owned('').owner!, actorId: 'b', effectiveUserId: 'b'}}));
    let release!: () => void; mocks.mutationGate = new Promise(resolve => {release = resolve;}); const old = syncOfflineQueue(a, 'course');
    await vi.waitFor(() => expect(mocks.writes).toHaveLength(1)); setOfflineAuthActor('b'); const b = bind('b');
    mocks.getSession.mockResolvedValue({data: {session: {user: {id: 'b'}, access_token: 'SYNTHETIC_B'}}, error: null});
    expect(await syncOfflineQueue(b, 'course')).toBe(1); expect(queue().has('b')).toBe(false); expect(queue().has('a')).toBe(true);
    release(); expect(await old).toBe(0); expect(mocks.headers).toContain('Bearer SYNTHETIC_B');
  });
  it('enqueue records exact owner and denies preview writes without inventing a new producer', async () => {
    const scope = bind(); await addToSyncQueue({ type: 'lesson_progress', data: { lesson_id: 'lesson', user_id: 'a', completed: true } }, scope, 'course');
    expect([...queue().values()][0].owner).toEqual(owned('').owner);
    const preview = bind('a', 'org-a', 'b', 'preview'); await addToSyncQueue({ type: 'lesson_progress', data: {} }, preview, 'course');
    expect(queue().size).toBe(1);
  });
});
