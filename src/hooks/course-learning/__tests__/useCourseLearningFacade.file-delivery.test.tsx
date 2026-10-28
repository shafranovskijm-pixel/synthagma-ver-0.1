import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@/integrations/supabase/types';
import { useCourseLearning } from '../useCourseLearningFacade';
import { setOfflineAuthActor, observeOfflineAccess } from '@/utils/courseCache';
import { offlineMemoryStorage } from '@/test/offlineMemoryStorage';

const mocks = vi.hoisted(() => ({ user: { id: 'a' } as { id: string } | null, authLoading: false,
  from: vi.fn(), rpc: vi.fn(), navigate: vi.fn(), toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
  courseResponses: [] as Promise<any>[], fail: false, status: 'active', mode: { state: 'held' } as any, cache: vi.fn(), selections: [] as Array<[string,string]>, materialsDenied: false, policyDenied: false, shell: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ courseId: 'course' }), useNavigate: () => mocks.navigate }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user, loading: mocks.authLoading }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useSwipeGesture', () => ({ useSwipeGesture: () => ({ current: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
// Mode lifecycle/protocol are tested independently; this suite observes facade wiring only.
vi.mock('@/hooks/useCourseFileDeliveryMode', () => ({ useCourseFileDeliveryMode: () => ({ view: mocks.mode, refresh: vi.fn() }) }));
vi.mock('@/utils/courseCache', async original => ({ ...await original<typeof import('@/utils/courseCache')>(), cacheCourseData: mocks.cache }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/utils/offlineSync', () => ({ setupOfflineSyncListeners: () => () => {} }));
vi.mock('@/utils/safeInvoke', () => ({ safeInvoke: vi.fn() }));
vi.mock('@/utils/limitToast', () => ({ showLimitToast: vi.fn() }));
vi.mock('@/utils/generateAttestationProtocol', () => ({ generateAttestationProtocol: vi.fn() }));
vi.mock('@/api/courseLibrary', () => ({ fetchCourseLibraryShell: mocks.shell }));
vi.mock('@/hooks/course-learning/useLessonVideo', () => ({ useLessonVideo: () => ({ setVideoWatchProgress: vi.fn() }) }));
vi.mock('@/hooks/course-learning/useLessonTest', () => ({ useLessonTest: () => ({ testQuestions: [], testAttemptId: null, testScore: null }) }));
vi.mock('@/hooks/course-learning/useLessonTTS', () => ({ useLessonTTS: () => ({}) }));
vi.mock('@/hooks/course-learning/useLessonChat', () => ({ useLessonChat: () => ({}) }));
const resultCourse = (title: string) => ({ data: { id: 'course', organization_id: 'org', title, skip_video_identification: true, allow_materials_download: false }, error: null });
const pending = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; };
const actualDocumentColumns: readonly (keyof Database['public']['Tables']['course_documents']['Row'])[] = ['allow_download','course_id','created_at','description','file_url','id','library_category','library_document_id','module_id','name','sort_order','type','updated_at','visible_to_students'];
class Query {
  private columns = ''; private mutation = false;
  constructor(private table: string) {}
  select(columns: string) { if (this.table === "course_documents" && columns.split(",").some(column => !actualDocumentColumns.includes(column.trim() as keyof Database["public"]["Tables"]["course_documents"]["Row"]))) throw new Error("UNKNOWN_ACTUAL_DOCUMENT_COLUMN"); this.columns = columns; mocks.selections.push([this.table,columns]); return this; } eq() { return this; } in() { return this; } order() { return this; }
  insert() { this.mutation = true; return this; }
  response(): any {
    if (this.mutation) return Promise.resolve({ data: null, error: null });
    if (mocks.fail) return Promise.reject(new TypeError('Failed to fetch'));
    if (this.table === 'courses' && mocks.policyDenied && this.columns === 'organization_id, allow_materials_download') return Promise.resolve({data:null,error:{code:'42501'}});
    if (this.table === 'courses') return mocks.courseResponses.shift() || Promise.resolve(resultCourse('current'));
    if (mocks.materialsDenied && ['lesson_attachments','course_documents'].includes(this.table)) return Promise.resolve({ data: null, error: { code: '42501' } });
    const data = this.table === 'lesson_attachments' ? [{ id: 'target-attachment', lesson_id: 'lesson', name: 'Лекция', file_url: 'urn:sintagma:course-file-binding:reference', file_type: 'pdf', file_size: 50, category: 'lecture' }]
      : this.table === 'course_documents' ? [{ id: 'target-document', course_id: 'course', name: 'Программа', type: 'program', file_url: null, module_id: null, visible_to_students: true, allow_download: false, library_document_id: null, library_category: null }, { id: 'hidden-document', course_id: 'course', name: 'Скрытый', visible_to_students: false, library_document_id: null, library_category: null }, { id: 'library-target', course_id: 'course', visible_to_students: true, library_document_id: 'library-source', library_category: 'umk' }]
      : this.table === 'enrollments' ? { id: 'enrollment', user_id: mocks.user?.id, status: mocks.status, course_id: 'course' }
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
  mocks.courseResponses = []; mocks.fail = false; mocks.status = 'active'; mocks.mode = { state: 'held' }; mocks.cache.mockResolvedValue(undefined); mocks.selections = []; mocks.materialsDenied = false; mocks.policyDenied = false; mocks.shell.mockResolvedValue({courseId:"course", title:"Library draft", libraryOnly:true, modules:[]}); window.history.replaceState({}, "", "/course/course/learn"); mocks.from.mockImplementation(table => new Query(table));
  vi.stubGlobal('indexedDB', offlineMemoryStorage().factory);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setOfflineAuthActor(null); });


describe('learner stable files and cache classification wiring', () => {
  it('selects download policy explicitly and retains target IDs, NULL URLs and row download denial', async () => {
    const hook = renderHook(() => useCourseLearning()); await waitFor(() => expect(hook.result.current.course?.id).toBe('course'));
    expect(mocks.selections.find(row => row[0] === 'courses')?.[1]).toContain('allow_materials_download');
    expect(hook.result.current.course?.allow_materials_download).toBe(false);
    const selectedDocumentColumns = mocks.selections.find(row => row[0] === 'course_documents')![1].split(',').map(column => column.trim());
    expect(selectedDocumentColumns).not.toContain('file_type'); expect(selectedDocumentColumns.every(column => actualDocumentColumns.includes(column as any))).toBe(true);
    expect(hook.result.current.materialsError).toBe(false);
    expect(hook.result.current.lessonAttachments.lesson[0]).toEqual(expect.objectContaining({ id: 'target-attachment', course_id: 'course', organization_id: 'org', lesson_id: 'lesson', reference_kind: 'lesson_attachment' }));
    expect(hook.result.current.courseDocuments).toHaveLength(1);
    expect(hook.result.current.courseDocuments[0]).toEqual(expect.objectContaining({ id: 'target-document', file_url: null, reference_kind: 'course_document', file_type: null, allow_download: false }));
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it('does not create an offline association while mode is held/frozen and caches only a later explicit legacy decision', async () => {
    const hook = renderHook(() => useCourseLearning()); await waitFor(() => expect(hook.result.current.course?.id).toBe('course'));
    expect(mocks.cache).not.toHaveBeenCalled();
    act(() => { mocks.mode = { state: 'frozen_required', context: { mode: 'frozen_required', cohort: null } }; hook.rerender(); }); expect(mocks.cache).not.toHaveBeenCalled();
    act(() => { mocks.mode = { state: 'legacy', context: { mode: 'legacy' } }; hook.rerender(); });
    await waitFor(() => expect(mocks.cache).toHaveBeenCalledTimes(1));
    expect(mocks.cache.mock.calls[0][2]).toEqual(expect.objectContaining({ _fileDeliveryMode: 'legacy', _fileDeliveryAuthority: 1 }));
  });
  it('keeps learning metadata but exposes no old/raw file list after material query denial', async () => {
    mocks.materialsDenied = true; const hook = renderHook(() => useCourseLearning()); await waitFor(() => expect(hook.result.current.course?.id).toBe('course'));
    expect(hook.result.current.materialsError).toBe(true); expect(hook.result.current.courseDocuments).toEqual([]); expect(hook.result.current.lessonAttachments).toEqual({}); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it('opens the existing unpublished library-only shell without requiring courses RLS or profile-org guessing', async () => {
    window.history.replaceState({}, '', '/course/course/learn?view=library'); mocks.policyDenied = true;
    const hook = renderHook(() => useCourseLearning()); await waitFor(() => expect(hook.result.current.course?.title).toBe('Library draft'));
    expect(hook.result.current.course?.organization_id).toBeNull(); expect(hook.result.current.fileOrganizationId).toBeNull();
    act(() => { mocks.mode = { state:'legacy', context:{mode:'legacy',actor_id:'a',course_id:'course',organization_id:'server-derived-org',access_mode:'learner'} }; hook.rerender(); });
    expect(hook.result.current.fileOrganizationId).toBe('server-derived-org'); expect(mocks.from.mock.calls.some(call => call[0] === 'profiles')).toBe(false); expect(mocks.cache).not.toHaveBeenCalled();
  });
  it('never publishes an old actor file list after a deferred A to B to A load', async () => {
    const oldA = pending(), b = pending(), a3 = pending(); mocks.courseResponses = [oldA.promise,b.promise,a3.promise]; const hook = renderHook(() => useCourseLearning());
    await waitFor(() => expect(mocks.courseResponses).toHaveLength(2));
    act(() => { setOfflineAuthActor('b'); mocks.user = {id:'b'}; hook.rerender(); }); await waitFor(() => expect(mocks.courseResponses).toHaveLength(1));
    act(() => { setOfflineAuthActor('a'); mocks.user = {id:'a'}; hook.rerender(); }); await waitFor(() => expect(mocks.courseResponses).toHaveLength(0));
    await act(async () => { oldA.resolve(resultCourse('old')); b.resolve(resultCourse('other')); }); expect(hook.result.current.courseDocuments).toEqual([]); expect(hook.result.current.lessonAttachments).toEqual({}); expect(mocks.cache).not.toHaveBeenCalled();
    await act(async () => { a3.resolve(resultCourse('fresh')); }); await waitFor(() => expect(hook.result.current.course?.title).toBe('fresh'));
    expect(hook.result.current.courseDocuments[0].id).toBe('target-document');
  });
});
