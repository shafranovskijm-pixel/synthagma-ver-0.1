import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offlineMemoryStorage } from '@/test/offlineMemoryStorage';
import { cacheCourseData, getCachedCourseData, cacheDashboardData, getCachedDashboardData,
  setOfflineAuthActor, captureOfflineActor, rememberOfflineScope, getOfflineScope, mayUseOfflineFallback,
  markOfflineAccountDeleted, observeOfflineAccess, clearCourseCache } from '../courseCache';

let storage: ReturnType<typeof offlineMemoryStorage>;
const scope = (actorId = 'a', organizationId = 'org-a', effectiveUserId = actorId, mode: 'learner' | 'preview' = 'learner', resource = 'course') =>
  rememberOfflineScope({ actorId, organizationId, effectiveUserId, mode }, resource, captureOfflineActor(actorId))!;
beforeEach(() => { storage = offlineMemoryStorage(); vi.stubGlobal('indexedDB', storage.factory); setOfflineAuthActor(null); setOfflineAuthActor('a'); });
afterEach(() => { vi.unstubAllGlobals(); setOfflineAuthActor(null); });

describe('offline course/dashboard exact ownership', () => {
  it('roundtrips own exact scope, isolates actor, tenant, effective learner and preview mode', async () => {
    const a = scope();
    await cacheCourseData(a, 'course', { title: 'A private course' }, [], [{ lesson_id: 'l', completed: true }], {});
    expect((await getCachedCourseData(a, 'course'))?.course.title).toBe('A private course');
    expect(await getCachedCourseData(scope('a', 'org-b'), 'course')).toBeNull();
    expect(await getCachedCourseData(scope('a', 'org-a', 'student-b', 'preview'), 'course')).toBeNull();
    expect(await getCachedCourseData(scope('a', 'org-a', 'a', 'preview'), 'course')).toBeNull();
    setOfflineAuthActor('b');
    expect(await getCachedCourseData(scope('b'), 'course')).toBeNull();
    expect(await getCachedCourseData(a, 'course')).toBeNull();
  });
  it('quarantines old unowned stores and requires a fresh current tenant after logout or cold actor', async () => {
    storage.rows('sigma-course-cache', 'courses').set('course', { courseId: 'course', course: { title: 'legacy' }, cachedAt: Date.now() });
    expect(getOfflineScope('a', 'a', 'learner', 'course')).toBeNull();
    expect(await getCachedCourseData(null, 'course')).toBeNull();
    const a = scope(); await cacheCourseData(a, 'course', { title: 'scoped' }, [], [], {});
    setOfflineAuthActor(null); setOfflineAuthActor('a');
    expect(getOfflineScope('a', 'a', 'learner', 'course')).toBeNull();
    expect(await getCachedCourseData(a, 'course')).toBeNull();
    expect((await getCachedCourseData(scope(), 'course'))?.course.title).toBe('scoped');
    expect(storage.rows('sigma-course-cache', 'courses').has('course')).toBe(true);
  });
  it('rejects deferred A→B→A cache read and keeps organization-scoped dashboards separate', async () => {
    let a = scope('a', 'org-a', 'a', 'learner', 'dashboard');
    await cacheDashboardData(a, { courses: [], profile: { full_name: 'A' }, branding: null, dashboardSettings: {}, totalTimeSpent: 1, totalCompletedLessons: 1, documentsProgress: { completed: 1, total: 3 } });
    expect((await getCachedDashboardData(a))?.profile.full_name).toBe('A');
    expect(await getCachedDashboardData(scope('a', 'org-b', 'a', 'learner', 'dashboard'))).toBeNull();
    a = scope('a', 'org-a', 'a', 'learner', 'dashboard');
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    storage.holdReads(() => gate);
    const pending = getCachedDashboardData(a);
    await Promise.resolve(); await Promise.resolve();
    setOfflineAuthActor('b'); setOfflineAuthActor('a'); release();
    expect(await pending).toBeNull();
  });
  it('does not turn known server permission denial into offline authorization', () => {
    expect(mayUseOfflineFallback({ status: 403, message: 'network permission denied' })).toBe(false);
    expect(mayUseOfflineFallback({ code: '42501', message: 'connection denied' })).toBe(false);
    expect(mayUseOfflineFallback(new TypeError('Failed to fetch'))).toBe(true);
  });
  it('terminal erasure invalidates already captured effective-subject scope without logging out a different actor', async () => {
    const preview = scope('a', 'org-a', 'deleted-subject', 'preview');
    await cacheCourseData(preview, 'course', { title: 'deleted' }, [], [], {});
    markOfflineAccountDeleted('deleted-subject');
    expect(await getCachedCourseData(preview, 'course')).toBeNull();
    expect(captureOfflineActor('a')).not.toBeNull();
  });
  it('rejects replaced same-actor tenant association and observed role downgrade', async () => {
    const a = scope(); await cacheCourseData(a, 'course', { title: 'private' }, [], [], {});
    scope('a', 'org-b'); expect(await getCachedCourseData(a, 'course')).toBeNull();
    const again = scope(); observeOfflineAccess('a', 'server-role:student');
    expect(await getCachedCourseData(again, 'course')).toBeNull();
    expect(getOfflineScope('a', 'a', 'learner', 'course')).toBeNull();
  });
  it.each(['write', 'clear', 'erased-write'])('does not mutate after delayed DB open invalidates %s', async action => {
    const a = scope(); await cacheCourseData(a, 'course', { title: 'original' }, [], [], {});
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); storage.holdOpens(() => gate);
    const pending = action === 'clear' ? clearCourseCache(a, 'course') : cacheCourseData(a, 'course', { title: 'stale overwrite' }, [], [], {});
    await Promise.resolve();
    if (action === 'erased-write') markOfflineAccountDeleted('a');
    else { setOfflineAuthActor('b'); setOfflineAuthActor('a'); }
    release(); await pending;
    expect([...storage.rows('sigma-course-cache', 'courses_scoped_v2').values()][0].course.title).toBe('original');
  });
});
