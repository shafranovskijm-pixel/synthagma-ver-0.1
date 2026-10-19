import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCourseLearning } from '../useCourseLearningFacade';
import { setOfflineAuthActor, observeOfflineAccess } from '@/utils/courseCache';
import { offlineMemoryStorage } from '@/test/offlineMemoryStorage';

const mocks = vi.hoisted(() => ({ user: { id: 'a' } as { id: string } | null, authLoading: false,
  from: vi.fn(), rpc: vi.fn(), navigate: vi.fn(), toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
  courseResponses: [] as Promise<any>[], fail: false, status: 'active' }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ courseId: 'course' }), useNavigate: () => mocks.navigate }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user, loading: mocks.authLoading }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useSwipeGesture', () => ({ useSwipeGesture: () => ({ current: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/utils/offlineSync', () => ({ setupOfflineSyncListeners: () => () => {} }));
vi.mock('@/utils/safeInvoke', () => ({ safeInvoke: vi.fn() }));
vi.mock('@/utils/limitToast', () => ({ showLimitToast: vi.fn() }));
vi.mock('@/utils/generateAttestationProtocol', () => ({ generateAttestationProtocol: vi.fn() }));
vi.mock('@/api/courseLibrary', () => ({ fetchCourseLibraryShell: vi.fn() }));
vi.mock('@/hooks/course-learning/useLessonVideo', () => ({ useLessonVideo: () => ({ setVideoWatchProgress: vi.fn() }) }));
vi.mock('@/hooks/course-learning/useLessonTest', () => ({ useLessonTest: () => ({ testQuestions: [], testAttemptId: null, testScore: null }) }));
vi.mock('@/hooks/course-learning/useLessonTTS', () => ({ useLessonTTS: () => ({}) }));
vi.mock('@/hooks/course-learning/useLessonChat', () => ({ useLessonChat: () => ({}) }));
const resultCourse = (title: string) => ({ data: { id: 'course', organization_id: 'org', title, skip_video_identification: true }, error: null });
const pending = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; };
class Query {
  private columns = ''; private mutation = false;
  constructor(private table: string) {}
  select(columns: string) { this.columns = columns; return this; } eq() { return this; } in() { return this; } order() { return this; }
  insert() { this.mutation = true; return this; }
  response(): any {
    if (this.mutation) return Promise.resolve({ data: null, error: null });
    if (mocks.fail) return Promise.reject(new TypeError('Failed to fetch'));
    if (this.table === 'courses') return mocks.courseResponses.shift() || Promise.resolve(resultCourse('current'));
    const data = this.table === 'enrollments' ? { id: 'enrollment', user_id: mocks.user?.id, status: mocks.status, course_id: 'course' }
      : this.table === 'profiles' ? { organization_id: 'org' }
        : this.table === 'lessons' ? this.columns === 'content' ? { content: 'private current content' } : [{ id: 'lesson', course_id: 'course', title: 'Lesson', type: 'text', module_id: null }]
          : [];
    return Promise.resolve({ data, error: null });
  }
  single() { return this.response(); } maybeSingle() { return this.response(); }
  then(resolve: any, reject: any) { return this.response().then(resolve, reject); }
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); setOfflineAuthActor(null); setOfflineAuthActor('a'); mocks.user = { id: 'a' }; mocks.authLoading = false;
  mocks.courseResponses = []; mocks.fail = false; mocks.status = 'active'; mocks.from.mockImplementation(table => new Query(table));
  vi.stubGlobal('indexedDB', offlineMemoryStorage().factory);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setOfflineAuthActor(null); });

describe('actual course facade privacy boundary', () => {
  it('deferred A→B→A fetch cannot publish stale course/content/toast/finally state', async () => {
    const oldA = pending(); const b = pending(); const freshA = pending(); mocks.courseResponses = [oldA.promise, b.promise, freshA.promise];
    const hook = renderHook(() => useCourseLearning());
    await waitFor(() => expect(mocks.courseResponses).toHaveLength(2));
    act(() => { setOfflineAuthActor('b'); mocks.user = { id: 'b' }; hook.rerender(); });
    expect(hook.result.current.course).toBeNull(); await waitFor(() => expect(mocks.courseResponses).toHaveLength(1));
    act(() => { setOfflineAuthActor('a'); mocks.user = { id: 'a' }; hook.rerender(); });
    await waitFor(() => expect(mocks.courseResponses).toHaveLength(0));
    await act(async () => { oldA.resolve(resultCourse('stale old A')); b.resolve(resultCourse('stale B')); });
    expect(hook.result.current.course).toBeNull(); expect(hook.result.current.loading).toBe(true); expect(mocks.toast.error).not.toHaveBeenCalled();
    await act(async () => { freshA.resolve(resultCourse('fresh A')); });
    await waitFor(() => expect(hook.result.current.course?.title).toBe('fresh A'));
  });
  it('observed same-actor access change and unknown auth hide old private data before fallback', async () => {
    const hook = renderHook(() => useCourseLearning()); await waitFor(() => expect(hook.result.current.course?.title).toBe('current'));
    mocks.fail = true;
    act(() => { observeOfflineAccess('a', 'server-role:student'); hook.rerender(); });
    expect(hook.result.current.course).toBeNull();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.isOfflineMode).toBe(false); expect(hook.result.current.lessonProgress).toEqual([]);
    act(() => { mocks.authLoading = true; hook.rerender(); }); expect(hook.result.current.course).toBeNull();
  });
  it('known pending enrollment never becomes a validated offline learning association', async () => {
    mocks.status = 'pending'; const hook = renderHook(() => useCourseLearning());
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/student'));
    expect(hook.result.current.course).toBeNull(); expect(hook.result.current.enrollmentId).toBeNull();
  });
});
