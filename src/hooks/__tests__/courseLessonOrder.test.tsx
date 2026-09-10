import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCoursePreview } from '../useCoursePreview';
import { useCourseLearning } from '../course-learning/useCourseLearningFacade';
import { COURSE_LESSON_ORDER_VERSION } from '@/lib/courseLessonOrder';

const COURSE_ID = '7e5bc4e6-0629-4186-9745-a821cbe7255a';
const expected = ['1.1', 'S1', 'test1', '2.1', 'S2', 'test2', 'final-work', 'final-test'];
interface FixtureLesson { id: string; title: string; type: string; course_id: string; order_index: number; module_id: string | null }
const mocks = vi.hoisted(() => ({
  user: { id: 'synthetic-student' },
  from: vi.fn(), rpc: vi.fn(), navigate: vi.fn(), cache: vi.fn(), cached: vi.fn(),
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  lessons: [] as FixtureLesson[],
  modules: [] as { id: string; order_index: number }[],
  reads: [] as { table: string; filters: { column: string; value: unknown }[] }[],
  courseError: false, modulesError: false,
}));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ courseId: '7e5bc4e6-0629-4186-9745-a821cbe7255a' }),
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams()],
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useSwipeGesture', () => ({ useSwipeGesture: () => ({ current: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/utils/courseCache', () => ({ cacheCourseData: mocks.cache, getCachedCourseData: mocks.cached }));
vi.mock('@/utils/offlineSync', () => ({ setupOfflineSyncListeners: () => () => {} }));
vi.mock('@/utils/safeInvoke', () => ({ safeInvoke: vi.fn() }));
vi.mock('@/utils/limitToast', () => ({ showLimitToast: vi.fn() }));
vi.mock('@/utils/generateAttestationProtocol', () => ({ generateAttestationProtocol: vi.fn() }));
vi.mock('@/api/courseLibrary', () => ({ fetchCourseLibraryShell: vi.fn() }));
vi.mock('@/hooks/course-learning/useLessonVideo', () => ({ useLessonVideo: () => ({ setVideoWatchProgress: vi.fn() }) }));
vi.mock('@/hooks/course-learning/useLessonTest', () => ({ useLessonTest: () => ({ testQuestions: [], testAttemptId: null, testSubmitted: false, testScore: null }) }));
vi.mock('@/hooks/course-learning/useLessonTTS', () => ({ useLessonTTS: () => ({}) }));
vi.mock('@/hooks/course-learning/useLessonChat', () => ({ useLessonChat: () => ({}) }));

function course() {
  return { id: COURSE_ID, organization_id: 'synthetic-org', title: 'Synthetic course', description: null,
    duration: null, is_published: true, sequential_lessons: true, skip_video_identification: true };
}

// Network doubles only: both real hooks and their actual ordering/access/cache paths run.
class Query {
  private columns = '';
  private mutation = false;
  private filters: { column: string; value: unknown }[] = [];
  constructor(private table: string) {}
  select(columns: string) { this.columns = columns; return this; }
  eq(column: string, value: unknown) { this.filters.push({ column, value }); return this; }
  in() { return this; }
  order() { return this; }
  insert() { this.mutation = true; return this; }
  single() { return Promise.resolve(this.response()); }
  maybeSingle() { return Promise.resolve(this.response()); }
  then<T>(resolve: (result: { data: unknown; error: Error | null }) => T, reject?: (error: unknown) => T) {
    return Promise.resolve(this.response()).then(resolve, reject);
  }
  private response(): { data: unknown; error: Error | null } {
    if (this.mutation) return { data: null, error: null };
    mocks.reads.push({ table: this.table, filters: this.filters });
    switch (this.table) {
      case 'courses': return { data: mocks.courseError ? null : course(), error: mocks.courseError ? new Error('Offline fixture') : null };
      case 'course_modules': return { data: mocks.modulesError ? null : mocks.modules, error: mocks.modulesError ? new Error('Module read failed') : null };
      case 'lessons': return { data: this.columns === 'content' ? { content: null } : mocks.lessons, error: null };
      case 'enrollments': return { data: { id: 'synthetic-enrollment', status: 'active', expires_at: null }, error: null };
      case 'profiles': return { data: { organization_id: 'synthetic-org' }, error: null };
      case 'lesson_progress': return { data: ['1.1', 'S1', 'test1'].map(lesson_id => ({ lesson_id, completed: true })), error: null };
      case 'module_access_schedules': case 'module_access_overrides':
      case 'course_documents': case 'lesson_attachments': return { data: [], error: null };
      default: throw new Error(`Unexpected synthetic read: ${this.table}`);
    }
  }
}

let client: QueryClient;
function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
const ids = (rows: { id: string }[]) => rows.map(row => row.id);
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear(); sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.courseError = false; mocks.modulesError = false; mocks.reads.length = 0;
  mocks.modules = [{ id: 'm2', order_index: 1 }, { id: 'm1', order_index: 0 }];
  mocks.lessons = ['2.1', 'S2', 'test2', 'final-work', 'final-test', '1.1', 'S1', 'test1'].map((id, order_index) => ({
    id, title: id, type: 'text', course_id: COURSE_ID, order_index, module_id: order_index < 5 ? 'm2' : 'm1',
  }));
  mocks.from.mockImplementation(table => new Query(table));
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.cache.mockResolvedValue(undefined); mocks.cached.mockResolvedValue(null);
});
afterEach(() => { cleanup(); client.clear(); localStorage.clear(); });

describe('preview and learner consume the same module order', () => {
  it('loads module order for the exact course and exposes the first M1 lesson in preview', async () => {
    const { result } = renderHook(() => useCoursePreview(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.lessons).toHaveLength(8));
    expect(ids(result.current.lessons)).toEqual(expected);
    expect(result.current.currentLesson?.id).toBe('1.1');
    expect(mocks.reads).toContainEqual({ table: 'course_modules', filters: [{ column: 'course_id', value: COURSE_ID }] });
  });

  it('uses the ordered array for learner navigation, sequential access, and the persisted offline copy', async () => {
    const { result } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ids(result.current.lessons)).toEqual(expected);
    expect(result.current.currentLesson?.id).toBe('1.1');
    expect(result.current.isLessonAccessible(3)).toBe(true); // all M1 items are completed
    expect(result.current.isLessonAccessible(4)).toBe(false); // first M2 item is not completed
    act(() => result.current.goToLesson(4));
    expect(result.current.currentLessonIndex).toBe(0);
    expect(mocks.cache).toHaveBeenCalled();
    const [id, cachedCourse, lessons] = mocks.cache.mock.calls[0];
    expect(id).toBe(COURSE_ID);
    expect(cachedCourse._lessonOrderVersion).toBe(COURSE_LESSON_ORDER_VERSION);
    expect(ids(lessons)).toEqual(expected);
  });

  it('does not silently present the old flat order when the module query fails', async () => {
    mocks.modulesError = true;
    const preview = renderHook(() => useCoursePreview(), { wrapper: Wrapper });
    const learner = renderHook(() => useCourseLearning());
    await waitFor(() => expect(preview.result.current.loading).toBe(false));
    await waitFor(() => expect(learner.result.current.loading).toBe(false));
    expect(preview.result.current.lessons).toEqual([]);
    expect(learner.result.current.lessons).toEqual([]);
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it('restores the marked ordered cache after a later offline reload', async () => {
    const online = renderHook(() => useCourseLearning());
    await waitFor(() => expect(mocks.cache).toHaveBeenCalled());
    const [courseId, cachedCourse, lessons, lessonProgress, lessonAttachments] = mocks.cache.mock.calls[0];
    online.unmount();
    mocks.courseError = true;
    mocks.cached.mockResolvedValue({ courseId, course: cachedCourse, lessons, lessonProgress, lessonAttachments, cachedAt: 123 });
    const offline = renderHook(() => useCourseLearning());
    await waitFor(() => expect(offline.result.current.loading).toBe(false));
    expect(offline.result.current.isOfflineMode).toBe(true);
    expect(ids(offline.result.current.lessons)).toEqual(expected);
    expect(offline.result.current.isLessonAccessible(3)).toBe(true);
    expect(offline.result.current.isLessonAccessible(4)).toBe(false);
  });

  it('refuses an old modular cache whose correct module order is unknowable offline', async () => {
    mocks.courseError = true;
    mocks.cached.mockResolvedValue({ course: course(), lessons: mocks.lessons, lessonProgress: [], lessonAttachments: {}, cachedAt: 123 });
    const { result } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lessons).toEqual([]);
    expect(result.current.isOfflineMode).toBe(false);
    expect(mocks.toast.error).toHaveBeenCalledWith('Подключитесь к Интернету, чтобы обновить порядок модулей курса');
  });

  it('preserves the old offline cache for a legacy course without module IDs', async () => {
    mocks.courseError = true;
    const legacy = mocks.lessons.map(l => ({ ...l, module_id: null }));
    mocks.cached.mockResolvedValue({ course: course(), lessons: legacy, lessonProgress: [], lessonAttachments: {}, cachedAt: 123 });
    const { result } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isOfflineMode).toBe(true);
    expect(result.current.lessons).toEqual(legacy);
  });
});
