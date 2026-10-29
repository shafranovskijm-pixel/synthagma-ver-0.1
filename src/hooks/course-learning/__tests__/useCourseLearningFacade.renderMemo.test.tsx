import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCourseLearning } from '../useCourseLearningFacade';
import { setOfflineAuthActor } from '@/utils/courseCache';
import { lessonBlocksToSpeechText } from '@/lib/lessonSpeechText';

const mocks = vi.hoisted(() => ({
  user: { id: 'a' }, authLoading: false, type: 'text', content: 'Legacy lesson text',
  from: vi.fn(), rpc: vi.fn(), navigate: vi.fn(), parse: vi.fn(), tts: vi.fn(), chat: vi.fn(),
  accessLog: vi.fn(),
  profileReply: null as Promise<{ data: { organization_id: string } | null; error: unknown }> | null,
}));
vi.mock('react-router-dom', () => ({ useParams: () => ({ courseId: 'course' }), useNavigate: () => mocks.navigate }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user, loading: mocks.authLoading }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useSwipeGesture', () => ({ useSwipeGesture: () => ({ current: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('@/utils/courseCache', async original => ({ ...await original<typeof import('@/utils/courseCache')>(), cacheCourseData: vi.fn().mockResolvedValue(undefined), getCachedCourseData: vi.fn().mockResolvedValue(null) }));
vi.mock('@/utils/offlineSync', () => ({ setupOfflineSyncListeners: () => () => {} }));
vi.mock('@/utils/safeInvoke', () => ({ safeInvoke: vi.fn() }));
vi.mock('@/utils/generateAttestationProtocol', () => ({ generateAttestationProtocol: vi.fn() }));
vi.mock('@/api/courseLibrary', () => ({ fetchCourseLibraryShell: vi.fn() }));
vi.mock('../useLessonVideo', () => ({ useLessonVideo: () => ({ setVideoWatchProgress: vi.fn() }) }));
vi.mock('../useLessonTest', () => ({ useLessonTest: () => ({ testQuestions: [], testAttemptId: null, testScore: null }) }));
vi.mock('../useLessonTTS', () => ({ useLessonTTS: (input: unknown) => { mocks.tts(input); return {}; } }));
vi.mock('../useLessonChat', () => ({ useLessonChat: (input: unknown) => { mocks.chat(input); return {}; } }));
vi.mock('@/components/course-builder/block-editor/parsers', async original => {
  const actual = await original<typeof import('@/components/course-builder/block-editor/parsers')>();
  return { ...actual, parseLessonContent: (content: string) => { mocks.parse(content); return actual.parseLessonContent(content); } };
});

class Query {
  private columns = ''; private mutation = false;
  select(columns: string) { this.columns = columns; return this; }
  constructor(private table: string) {}
  eq() { return this; } in() { return this; } order() { return this; }
  insert(value: unknown) { if (this.table === 'course_access_log') mocks.accessLog(value); this.mutation = true; return this; }
  private response() {
    const data = this.mutation ? null
      : this.table === 'courses' ? { id: 'course', organization_id: 'org', title: 'Synthetic memo course', sequential_lessons: false }
        : this.table === 'enrollments' ? { id: 'enrollment', user_id: mocks.user.id, course_id: 'course', status: 'active' }
          : this.table === 'profiles' ? { organization_id: 'org' }
            : this.table === 'lessons' ? this.columns === 'content' ? { content: mocks.content } : [{ id: 'lesson', course_id: 'course', title: 'Current lesson', type: mocks.type, order_index: 0, module_id: null }]
              : [];
    return { data, error: null };
  }
  single() { return Promise.resolve(this.response()); }
  maybeSingle() { return this.table === 'profiles' && mocks.profileReply ? mocks.profileReply : Promise.resolve(this.response()); }
  then(resolve: (value: ReturnType<Query['response']>) => unknown, reject?: (error: unknown) => unknown) { return Promise.resolve(this.response()).then(resolve, reject); }
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); setOfflineAuthActor(null); setOfflineAuthActor('a');
  mocks.user = { id: 'a' }; mocks.authLoading = false; mocks.type = 'text'; mocks.content = 'Legacy lesson text';
  mocks.profileReply = null;
  mocks.from.mockImplementation(table => new Query(table));
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name !== 'get_course_learning_snapshot') return { data: null, error: null };
    return { data: { enrollment: { id: 'enrollment', user_id: mocks.user.id, course_id: 'course', status: 'active',
      progress: 0, expires_at: null, learning_progress_epoch: '0' }, lesson_progress: [],
      learning_progress_epoch: '0', learning_progress_reset_at: null }, error: null };
  });
});
afterEach(() => { cleanup(); setOfflineAuthActor(null); });
const lastInput = (fn: typeof mocks.tts): { contentBlocks: unknown[] } => fn.mock.calls[fn.mock.calls.length - 1][0];
async function ready(result: { current: ReturnType<typeof useCourseLearning> }) {
  await waitFor(() => expect(result.current.currentLesson?.content).toBe(mocks.content));
  expect(result.current.loading).toBe(false);
}

describe('actual course facade render work', () => {
  it('retains the actual legacy text/TTS/chat representation without reparsing input-only renders', async () => {
    mocks.content = '<p>Урок &amp; практика</p>';
    const h = renderHook(() => useCourseLearning()); await ready(h.result);
    const blocks = h.result.current.contentBlocks; const before = mocks.parse.mock.calls.length;
    expect(before).toBeGreaterThan(0); expect(lessonBlocksToSpeechText(blocks)).toContain('Урок & практика');
    act(() => { h.result.current.setFeedbackAnswer('Draft feedback'); }); h.rerender();
    expect(mocks.parse).toHaveBeenCalledTimes(before); expect(h.result.current.contentBlocks).toBe(blocks);
    expect(lastInput(mocks.tts).contentBlocks).toBe(blocks); expect(lastInput(mocks.chat).contentBlocks).toBe(blocks);
  });

  it.each(['slider', 'video', 'test', 'audio', 'homework', 'ai_avatar'])('does not send %s content through the text/markdown parser', async type => {
    mocks.type = type; mocks.content = JSON.stringify({ slides: [{ id: 'slide', content: 'Synthetic slide', imageUrl: 'data:image/png;base64,c3ludGhldGlj' }] });
    const h = renderHook(() => useCourseLearning()); await ready(h.result);
    act(() => h.result.current.setFeedbackAnswer('Unrelated input')); h.rerender();
    expect(mocks.parse).not.toHaveBeenCalled(); expect(h.result.current.currentLesson.content).toBe(mocks.content);
    expect(h.result.current.contentBlocks).toEqual([]); expect(lastInput(mocks.tts).contentBlocks).toEqual([]); expect(lastInput(mocks.chat).contentBlocks).toEqual([]);
  });

  it('drops private memoized blocks immediately for unknown auth and rebuilds after access is current', async () => {
    const h = renderHook(() => useCourseLearning()); await ready(h.result); const previous = h.result.current.contentBlocks;
    act(() => { mocks.authLoading = true; h.rerender(); });
    expect(h.result.current.contentBlocks).toEqual([]); expect(h.result.current.course).toBeNull();
    act(() => { mocks.authLoading = false; h.rerender(); }); await ready(h.result);
    expect(h.result.current.contentBlocks).not.toBe(previous); expect(lessonBlocksToSpeechText(h.result.current.contentBlocks)).toContain('Legacy lesson text');
  });
});

describe('best-effort course access audit', () => {
  it('opens the authorized lesson before a slow logging profile reply, then records the access', async () => {
    let reply!: (value: { data: { organization_id: string }; error: null }) => void;
    mocks.profileReply = new Promise(resolve => { reply = resolve; });
    const h = renderHook(() => useCourseLearning());
    await ready(h.result);
    expect(mocks.accessLog).not.toHaveBeenCalled();
    await act(async () => { reply({ data: { organization_id: 'audit-org' }, error: null }); });
    await waitFor(() => expect(mocks.accessLog).toHaveBeenCalledTimes(1));
    expect(mocks.accessLog).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'a', course_id: 'course', organization_id: 'audit-org' }));
    expect(h.result.current.loading).toBe(false);
  });

  it('keeps a logging transport rejection out of course loading and offline fallback', async () => {
    let reject!: (error: Error) => void;
    mocks.profileReply = new Promise((_, fail) => { reject = fail; });
    const h = renderHook(() => useCourseLearning());
    await ready(h.result);
    await act(async () => { reject(new Error('Synthetic audit connection failure')); });
    expect(mocks.accessLog).not.toHaveBeenCalled();
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.isOfflineMode).toBe(false);
    expect(h.result.current.currentLesson.content).toBe(mocks.content);
  });

  it('does not insert an old actor access after a delayed profile reply', async () => {
    let oldReply!: (value: { data: { organization_id: string }; error: null }) => void;
    mocks.profileReply = new Promise(resolve => { oldReply = resolve; });
    const h = renderHook(() => useCourseLearning());
    await ready(h.result);
    act(() => {
      setOfflineAuthActor('b'); mocks.user = { id: 'b' };
      mocks.profileReply = Promise.resolve({ data: { organization_id: 'new-org' }, error: null });
      h.rerender();
    });
    await ready(h.result);
    await waitFor(() => expect(mocks.accessLog).toHaveBeenCalledTimes(1));
    await act(async () => { oldReply({ data: { organization_id: 'old-org' }, error: null }); });
    expect(mocks.accessLog).toHaveBeenCalledTimes(1);
    expect(mocks.accessLog).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'b', organization_id: 'new-org' }));
  });
});
