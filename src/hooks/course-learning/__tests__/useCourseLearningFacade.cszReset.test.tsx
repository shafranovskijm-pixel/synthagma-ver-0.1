import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCourseLearning } from '../useCourseLearningFacade';

const CSZ_COURSE_ID = '7630559a-6caf-42e7-97f9-1cd0e4598c39';
const CSZ_34_COURSE_ID = '7e5bc4e6-0629-4186-9745-a821cbe7255a';
const OTHER_COURSE_ID = '7630559a-6caf-42e7-97f9-1cd0e4598c38';
interface Request {
  table: string;
  action: 'select' | 'insert' | 'update' | 'delete';
  payload?: unknown;
  filters: { operator: 'eq' | 'in'; column: string; value: unknown }[];
}
interface QueryResult { data: unknown; error: null }

const mocks = vi.hoisted(() => ({
  courseId: '7630559a-6caf-42e7-97f9-1cd0e4598c39',
  user: { id: 'student-a' },
  from: vi.fn(), rpc: vi.fn(), navigate: vi.fn(), setVideoWatchProgress: vi.fn(),
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  mutations: [] as Request[],
}));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ courseId: mocks.courseId }), useNavigate: () => mocks.navigate,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useSwipeGesture', () => ({ useSwipeGesture: () => ({ current: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/utils/courseCache', () => ({ cacheCourseData: vi.fn().mockResolvedValue(undefined), getCachedCourseData: vi.fn().mockResolvedValue(null) }));
vi.mock('@/utils/offlineSync', () => ({ setupOfflineSyncListeners: () => () => {} }));
vi.mock('@/utils/safeInvoke', () => ({ safeInvoke: vi.fn() }));
vi.mock('@/utils/limitToast', () => ({ showLimitToast: vi.fn() }));
vi.mock('@/utils/generateAttestationProtocol', () => ({ generateAttestationProtocol: vi.fn() }));
vi.mock('@/api/courseLibrary', () => ({ fetchCourseLibraryShell: vi.fn() }));
vi.mock('@/hooks/course-learning/useLessonVideo', () => ({ useLessonVideo: () => ({ setVideoWatchProgress: mocks.setVideoWatchProgress }) }));
vi.mock('@/hooks/course-learning/useLessonTest', () => ({ useLessonTest: () => ({ testQuestions: [], testAttemptId: null, testSubmitted: false, testScore: null }) }));
vi.mock('@/hooks/course-learning/useLessonTTS', () => ({ useLessonTTS: () => ({}) }));
vi.mock('@/hooks/course-learning/useLessonChat', () => ({ useLessonChat: () => ({}) }));

// Network doubles only. The real facade mounts, loads synthetic progress and
// exposes its actual reset callback; this fixture does not simulate DB guards.
class SyntheticQuery implements PromiseLike<QueryResult> {
  private selectedColumns = '';
  private readonly request: Request;
  constructor(table: string) { this.request = { table, action: 'select', filters: [] }; }
  select(columns: string) { this.selectedColumns = columns; return this; }
  eq(column: string, value: unknown) { this.request.filters.push({ operator: 'eq', column, value }); return this; }
  in(column: string, value: unknown) { this.request.filters.push({ operator: 'in', column, value }); return this; }
  order() { return this; }
  insert(payload: unknown) { return this.mutate('insert', payload); }
  update(payload: unknown) { return this.mutate('update', payload); }
  delete() { return this.mutate('delete'); }
  private mutate(action: Request['action'], payload?: unknown) {
    this.request.action = action;
    if (payload !== undefined) this.request.payload = payload;
    mocks.mutations.push(this.request);
    return this;
  }
  private response(): QueryResult {
    if (this.request.action !== 'select') return { data: null, error: null };
    switch (this.request.table) {
      case 'courses': return { data: {
        id: mocks.courseId, organization_id: 'org-a', title: 'ЦСЗ synthetic title shared by both courses',
        description: null, duration: null, sequential_lessons: false, skip_video_identification: true,
      }, error: null };
      case 'lessons': return { data: this.selectedColumns === 'content' ? { content: null } : [
        { id: 'lesson-a', course_id: mocks.courseId, title: 'Synthetic homework', type: 'homework', order_index: 0, module_id: null },
        { id: 'lesson-b', course_id: mocks.courseId, title: 'Synthetic test', type: 'test', order_index: 1, module_id: null },
      ], error: null };
      case 'enrollments': return { data: {
        id: 'enrollment-a', user_id: 'student-a', course_id: mocks.courseId,
        status: 'completed', progress: 100, expires_at: '2020-01-01T00:00:00Z',
      }, error: null };
      case 'profiles': return { data: { organization_id: 'org-a' }, error: null };
      case 'lesson_progress': return { data: [
        { lesson_id: 'lesson-a', completed: true }, { lesson_id: 'lesson-b', completed: true },
      ], error: null };
      case 'lesson_attachments': return { data: [], error: null };
      default: throw new Error(`Unexpected synthetic read: ${this.request.table}`);
    }
  }
  single() { return Promise.resolve(this.response()); }
  maybeSingle() { return Promise.resolve(this.response()); }
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.response()).then(onfulfilled, onrejected);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.courseId = CSZ_COURSE_ID;
  mocks.mutations.length = 0;
  mocks.from.mockImplementation((table: string) => new SyntheticQuery(table));
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => { cleanup(); localStorage.clear(); });

async function ready(result: { current: ReturnType<typeof useCourseLearning> }) {
  await waitFor(() => {
    expect(result.current.loading).toBe(false);
    expect(result.current.course?.id).toBe(mocks.courseId);
    expect(result.current.completedCount).toBe(2);
    expect(result.current.enrollmentId).toBe('enrollment-a');
  });
  expect(mocks.navigate).not.toHaveBeenCalled();
}

function clearLoadEvidence() {
  // Initial access-log INSERT is existing learner-load behavior, not reset.
  // Assert its exact scope before measuring reset-specific calls separately.
  expect(mocks.mutations.every(row => row.table === 'course_access_log' && row.action === 'insert')).toBe(true);
  mocks.mutations.length = 0;
  mocks.from.mockClear();
  mocks.rpc.mockClear();
  mocks.toast.info.mockClear();
  mocks.toast.success.mockClear();
  mocks.setVideoWatchProgress.mockClear();
}

describe('useCourseLearningFacade CSZ reset boundary', () => {
  it.each([CSZ_COURSE_ID, CSZ_34_COURSE_ID])('blocks CSZ learner reset for %s before any from/RPC/DML and preserves loaded state', async courseId => {
    mocks.courseId = courseId;
    const { result } = renderHook(() => useCourseLearning());
    await ready(result);
    const progressBefore = result.current.lessonProgress;
    clearLoadEvidence();
    await act(async () => { await result.current.resetCourseProgress(); });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.mutations).toEqual([]);
    expect(mocks.setVideoWatchProgress).not.toHaveBeenCalled();
    expect(result.current.lessonProgress).toBe(progressBefore);
    expect(result.current.completedCount).toBe(2);
    expect(mocks.toast.info).toHaveBeenCalledExactlyOnceWith('Сброс этого курса выполняет администратор');
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it('preserves the existing reset sequence for a different ID even with the same course title', async () => {
    mocks.courseId = OTHER_COURSE_ID;
    const { result } = renderHook(() => useCourseLearning());
    await ready(result);
    clearLoadEvidence();
    await act(async () => { await result.current.resetCourseProgress(); });
    expect(mocks.from.mock.calls).toEqual([['lesson_progress'], ['test_attempts'], ['enrollments']]);
    expect(mocks.mutations).toEqual([
      { table: 'lesson_progress', action: 'delete', filters: [
        { operator: 'eq', column: 'user_id', value: 'student-a' },
        { operator: 'in', column: 'lesson_id', value: ['lesson-a', 'lesson-b'] },
      ] },
      { table: 'test_attempts', action: 'delete', filters: [
        { operator: 'eq', column: 'user_id', value: 'student-a' },
        { operator: 'in', column: 'lesson_id', value: ['lesson-a', 'lesson-b'] },
      ] },
      { table: 'enrollments', action: 'update', payload: { progress: 0, status: 'active', completed_at: null }, filters: [
        { operator: 'eq', column: 'user_id', value: 'student-a' },
        { operator: 'eq', column: 'course_id', value: OTHER_COURSE_ID },
      ] },
    ]);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.current.completedCount).toBe(0);
    expect(mocks.setVideoWatchProgress).toHaveBeenCalledExactlyOnceWith(0);
    expect(mocks.toast.success).toHaveBeenCalledExactlyOnceWith('Прогресс курса сброшен. Начните прохождение заново!');
    expect(mocks.toast.info).not.toHaveBeenCalled();
  });

  it.each([CSZ_COURSE_ID, CSZ_34_COURSE_ID, OTHER_COURSE_ID])('keeps admin preview read-only for %s', async courseId => {
    mocks.courseId = courseId;
    localStorage.setItem('adminViewAsStudent', JSON.stringify({ userId: 'student-preview', name: 'Synthetic preview' }));
    const { result } = renderHook(() => useCourseLearning());
    await ready(result);
    expect(result.current.isAdminView).toBe(true);
    expect(mocks.mutations).toEqual([]);
    clearLoadEvidence();
    await act(async () => { await result.current.resetCourseProgress(); });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.mutations).toEqual([]);
    expect(result.current.completedCount).toBe(2);
    expect(mocks.toast.info).toHaveBeenCalledExactlyOnceWith('Сброс прогресса недоступен в режиме просмотра');
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it.each([CSZ_COURSE_ID, CSZ_34_COURSE_ID])('applies CSZ reset guard after the route changes from another course to %s', async courseId => {
    mocks.courseId = OTHER_COURSE_ID;
    const { result, rerender } = renderHook(() => useCourseLearning());
    await ready(result);
    mocks.courseId = courseId;
    rerender();
    await ready(result);
    clearLoadEvidence();
    await act(async () => { await result.current.resetCourseProgress(); });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.mutations).toEqual([]);
    expect(mocks.toast.info).toHaveBeenCalledExactlyOnceWith('Сброс этого курса выполняет администратор');
  });
});
