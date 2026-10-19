import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCourseLearning } from '../useCourseLearningFacade';
import { setOfflineAuthActor } from '@/utils/courseCache';

const mocks = vi.hoisted(() => ({
  user: { id: 'student-a' },
  from: vi.fn(), rpc: vi.fn(), navigate: vi.fn(),
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  savedLessons: new Set<string>(), savedProgress: 0, failSave: false, lockedNext: false,
  mutations: [] as { table: string; payload: Record<string, unknown> }[],
}));
vi.mock('react-router-dom', () => ({ useParams: () => ({ courseId: 'course-a' }), useNavigate: () => mocks.navigate }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useSwipeGesture', () => ({ useSwipeGesture: () => ({ current: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/utils/courseCache', async importOriginal => ({ ...await importOriginal<typeof import('@/utils/courseCache')>(), cacheCourseData: vi.fn().mockResolvedValue(undefined), getCachedCourseData: vi.fn().mockResolvedValue(null) }));
vi.mock('@/utils/offlineSync', () => ({ setupOfflineSyncListeners: () => () => {} }));
vi.mock('@/utils/safeInvoke', () => ({ safeInvoke: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock('@/utils/limitToast', () => ({ showLimitToast: vi.fn() }));
vi.mock('@/utils/generateAttestationProtocol', () => ({ generateAttestationProtocol: vi.fn().mockResolvedValue(null) }));
vi.mock('@/api/courseLibrary', () => ({ fetchCourseLibraryShell: vi.fn() }));
vi.mock('@/hooks/course-learning/useLessonVideo', () => ({ useLessonVideo: () => ({ setVideoWatchProgress: vi.fn() }) }));
vi.mock('@/hooks/course-learning/useLessonTest', () => ({ useLessonTest: () => ({ testQuestions: [], testAttemptId: null, testSubmitted: false, testScore: null }) }));
vi.mock('@/hooks/course-learning/useLessonTTS', () => ({ useLessonTTS: () => ({}) }));
vi.mock('@/hooks/course-learning/useLessonChat', () => ({ useLessonChat: () => ({}) }));

// Exercise the real facade + markLessonProgress with network adapters only.
// Server grading/tenant isolation are exercised separately against actual SQL.
class Query {
  private columns = '';
  private payload: Record<string, unknown> | null = null;
  constructor(private table: string) {}
  select(columns: string) { this.columns = columns; return this; }
  eq() { return this; }
  in() { return this; }
  order() { return this; }
  insert(payload: Record<string, unknown>) { this.payload = payload; return this; }
  upsert(payload: Record<string, unknown>) { this.payload = payload; return this; }
  update(payload: Record<string, unknown>) { this.payload = payload; return this; }
  private response() {
    if (this.payload) {
      mocks.mutations.push({ table: this.table, payload: this.payload });
      if (this.table === 'lesson_progress') {
        if (mocks.failSave) return { data: null, error: { message: 'permission denied' } };
        mocks.savedLessons.add(this.payload.lesson_id as string);
      }
      if (this.table === 'enrollments') mocks.savedProgress = this.payload.progress as number;
      return { data: null, error: null };
    }
    switch (this.table) {
      case 'courses': return { data: { id: 'course-a', organization_id: 'org-a', title: 'Sequential QA course', sequential_lessons: true, skip_video_identification: true }, error: null };
      case 'lessons': return { data: this.columns === 'content' ? { content: '<p>Synthetic lesson</p>' } : [
        { id: 'lesson-a', course_id: 'course-a', title: 'First', type: 'text', order_index: 0, module_id: null },
        { id: 'lesson-b', course_id: 'course-a', title: 'Second', type: 'text', order_index: 1, module_id: null, is_locked: mocks.lockedNext },
        { id: 'lesson-test', course_id: 'course-a', title: 'Test', type: 'test', order_index: 2, module_id: null },
      ], error: null };
      case 'enrollments': return { data: { id: 'enrollment-a', user_id: 'student-a', course_id: 'course-a', status: 'active', progress: mocks.savedProgress }, error: null };
      case 'profiles': return { data: { organization_id: 'org-a' }, error: null };
      case 'lesson_progress': return { data: [...mocks.savedLessons].map(lesson_id => ({ lesson_id, completed: true })), error: null };
      case 'lesson_attachments': case 'course_modules': return { data: [], error: null };
      default: throw new Error('Unexpected synthetic query: ' + this.table);
    }
  }
  single() { return Promise.resolve(this.response()); }
  maybeSingle() { return Promise.resolve(this.response()); }
  then(resolve: (value: ReturnType<Query['response']>) => unknown, reject?: (error: unknown) => unknown) {
    return Promise.resolve(this.response()).then(resolve, reject);
  }
}

beforeEach(() => {
  setOfflineAuthActor(null); setOfflineAuthActor('student-a');
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  mocks.savedLessons.clear(); mocks.savedProgress = 0; mocks.failSave = false; mocks.lockedNext = false; mocks.mutations.length = 0;
  mocks.from.mockImplementation(table => new Query(table));
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(cleanup);

async function ready(result: { current: ReturnType<typeof useCourseLearning> }) {
  await waitFor(() => expect(result.current.enrollmentId).toBe('enrollment-a'));
  expect(result.current.loading).toBe(false);
  expect(mocks.navigate).not.toHaveBeenCalled();
}

describe('sequential learner progress through the actual facade', () => {
  it('one completion click advances each saved lesson and unlocks the final test', async () => {
    const { result, unmount } = renderHook(() => useCourseLearning());
    await ready(result);
    expect(result.current.isLessonAccessible(1)).toBe(false);
    await act(async () => { await result.current.markLessonComplete(); });
    await waitFor(() => expect(result.current.currentLesson?.id).toBe('lesson-b'));
    expect(mocks.savedProgress).toBe(33);
    expect(mocks.toast.error).not.toHaveBeenCalled();
    await act(async () => { await result.current.markLessonComplete(); });
    await waitFor(() => expect(result.current.currentLesson?.id).toBe('lesson-test'));
    expect(mocks.savedProgress).toBe(67);
    expect([...mocks.savedLessons]).toEqual(['lesson-a', 'lesson-b']);
    expect(mocks.savedLessons.has('lesson-test')).toBe(false);
    unmount();
    const remounted = renderHook(() => useCourseLearning());
    await ready(remounted.result);
    expect(remounted.result.current.completedCount).toBe(2);
    expect(remounted.result.current.isLessonAccessible(2)).toBe(true);
  });

  it('does not advance or unlock the test when the lesson write is denied', async () => {
    mocks.failSave = true;
    const { result } = renderHook(() => useCourseLearning());
    await ready(result);
    await act(async () => { await result.current.markLessonComplete(); });
    expect(result.current.currentLesson?.id).toBe('lesson-a');
    expect(result.current.completedCount).toBe(0);
    expect(result.current.isLessonAccessible(1)).toBe(false);
    expect(mocks.savedLessons.size).toBe(0);
    expect(mocks.mutations.some(row => row.table === 'enrollments')).toBe(false);
    expect(mocks.toast.error).toHaveBeenCalledWith('Ошибка сохранения прогресса. Попробуйте ещё раз.');
  });

  it('preserves a teacher-locked next lesson after saving the previous one', async () => {
    mocks.lockedNext = true;
    const { result } = renderHook(() => useCourseLearning());
    await ready(result);
    await act(async () => { await result.current.markLessonComplete(); });
    expect(result.current.currentLesson?.id).toBe('lesson-a');
    expect(result.current.completedCount).toBe(1);
    expect(result.current.isLessonAccessible(1)).toBe(false);
    expect(result.current.isLessonAccessible(2)).toBe(false);
  });

  it('keeps the next step inaccessible before a completion action', async () => {
    const { result } = renderHook(() => useCourseLearning());
    await ready(result);
    await act(async () => { result.current.goToNextLesson(); });
    expect(result.current.currentLesson?.id).toBe('lesson-a');
    expect(mocks.savedLessons.size).toBe(0);
    expect(mocks.toast.error).toHaveBeenCalledWith('Сначала завершите текущий урок');
  });
});
