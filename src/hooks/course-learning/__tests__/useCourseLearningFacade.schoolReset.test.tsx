import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCourseLearning } from "../useCourseLearningFacade";
import { LearningProgressFence, type LearningProgressRun } from "@/lib/learningProgress";
import { setOfflineAuthActor, getOfflineScope } from "@/utils/courseCache";

const mock = vi.hoisted(() => ({
  epoch: "0", completed: new Set<string>(), from: vi.fn(), rpc: vi.fn(), navigate: vi.fn(),
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  pendingRead: null as Promise<unknown> | null, pendingWrite: null as Promise<unknown> | null,
  pendingFeedbackRead: null as Promise<unknown> | null, pendingFeedbackSend: null as Promise<unknown> | null, feedbackWrites: 0,
  mode: { view: { state: "legacy" } }, cacheRead: vi.fn(), cachedCourse: null as unknown,
}));
vi.mock("react-router-dom", () => ({ useParams: () => ({ courseId: "course" }), useNavigate: () => mock.navigate }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "student" }, loading: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useSwipeGesture", () => ({ useSwipeGesture: () => ({ current: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from, rpc: mock.rpc } }));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("@/utils/courseCache", async original => ({ ...await original<typeof import("@/utils/courseCache")>(),
  cacheCourseData: vi.fn().mockResolvedValue(undefined), getCachedCourseData: mock.cacheRead }));
vi.mock("@/utils/offlineSync", () => ({ setupOfflineSyncListeners: () => () => {} }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn() }));
vi.mock("@/utils/generateAttestationProtocol", () => ({ generateAttestationProtocol: vi.fn() }));
vi.mock("@/hooks/useCourseFileDeliveryMode", () => ({ useCourseFileDeliveryMode: () => mock.mode }));
vi.mock("@/hooks/course-learning/useLessonVideo", () => ({ useLessonVideo: () => ({ setVideoWatchProgress: vi.fn() }) }));
vi.mock("@/hooks/course-learning/useLessonTest", () => ({ useLessonTest: () => ({ testQuestions: [], testAttemptId: null, testSubmitted: false, testScore: null }) }));
vi.mock("@/hooks/course-learning/useLessonTTS", () => ({ useLessonTTS: () => ({}) }));
vi.mock("@/hooks/course-learning/useLessonChat", () => ({ useLessonChat: () => ({}) }));

const response = (epoch = mock.epoch, completed = [...mock.completed]) => ({ data: {
  enrollment: { id: "enrollment", user_id: "student", course_id: "course", status: "active", progress: completed.length * 10, learning_progress_epoch: epoch },
  lesson_progress: completed.map(lesson_id => ({ lesson_id, completed: true })),
  learning_progress_epoch: epoch, learning_progress_reset_at: epoch === "0" ? null : "2026-10-29T01:00:00Z",
}, error: null });
const deferred = <T,>() => { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; };
class Query {
  private columns = "";
  constructor(private table: string) {}
  select(columns: string) { this.columns = columns; return this; }
  eq() { return this; } in() { return this; } order() { return this; }
  insert() { if (this.table === "org_student_messages") mock.feedbackWrites++; else if (this.table !== "course_access_log") throw Error("Unexpected unfenced insert"); return this; }
  upsert() { throw Error("Unexpected unfenced upsert"); }
  update() { throw Error("Unexpected unfenced update"); }
  private result() {
    if (this.table === "courses") return { data: { id: "course", organization_id: "org", title: "QA", sequential_lessons: true }, error: null };
    if (this.table === "profiles") return { data: { organization_id: "org" }, error: null };
    if (this.table === "lessons") return { data: this.columns === "content" ? { content: "QA" } : Array.from({ length: 10 }, (_, i) => ({
      id: "lesson-" + i, course_id: "course", title: "Lesson " + i, type: "text", order_index: i, module_id: null,
    })), error: null };
    if (["course_modules", "lesson_attachments", "course_documents"].includes(this.table)) return { data: [], error: null };
    if (this.table === "course_access_log" || this.table === "org_student_messages") return { data: null, error: null };
    throw Error("Unexpected query " + this.table);
  }
  single() {
    if (this.table === "courses" && this.columns === "organization_id" && mock.pendingFeedbackRead) { const p = mock.pendingFeedbackRead; mock.pendingFeedbackRead = null; return p; }
    return Promise.resolve(this.result());
  } maybeSingle() { return Promise.resolve(this.result()); }
  then(resolve: (value: ReturnType<Query["result"]>) => unknown, reject?: (error: unknown) => unknown) {
    if (this.table === "org_student_messages" && mock.pendingFeedbackSend) { const p = mock.pendingFeedbackSend; mock.pendingFeedbackSend = null; return p.then(resolve as (value: unknown) => unknown, reject); }
    return Promise.resolve(this.result()).then(resolve, reject);
  }
}
beforeEach(() => {
  vi.clearAllMocks(); mock.cachedCourse = null; mock.cacheRead.mockImplementation(async () => mock.cachedCourse); mock.epoch = "0"; mock.completed = new Set(Array.from({ length: 8 }, (_, i) => "lesson-" + i));
  mock.pendingRead = null; mock.pendingWrite = null; mock.pendingFeedbackRead = null; mock.pendingFeedbackSend = null; mock.feedbackWrites = 0; setOfflineAuthActor(null); setOfflineAuthActor("student");
  mock.from.mockImplementation(table => new Query(table));
  mock.rpc.mockImplementation((name, args) => {
    if (name === "get_course_learning_snapshot") {
      if (mock.pendingRead) { const delayed = mock.pendingRead; mock.pendingRead = null; return delayed; }
      return Promise.resolve(response());
    }
    if (name === "save_own_lesson_progress") {
      if (mock.pendingWrite) { const delayed = mock.pendingWrite; mock.pendingWrite = null; return delayed; }
      if (args.p_expected_epoch !== mock.epoch) return Promise.resolve({ data: null, error: { code: "P0001", message: "LEARNING_PROGRESS_RESET" } });
      if (args.p_completed) mock.completed.add(args.p_lesson_id);
      return Promise.resolve(response());
    }
    throw Error("Unexpected RPC " + name);
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const resetSchool = () => { mock.epoch = "1"; mock.completed.clear(); };
async function focus() { await act(async () => { window.dispatchEvent(new Event("focus")); }); }

describe("school reset in the actual learner facade", () => {
  it("replaces the already-open 80 percent with the server zero on focus", async () => {
    const { result } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.progressPercent).toBe(80));
    resetSchool(); await focus();
    await waitFor(() => expect(result.current.learningRun?.epoch).toBe("1"));
    expect(result.current.progressPercent).toBe(0); expect(result.current.completedCount).toBe(0);
    expect(result.current.currentLessonIndex).toBe(0); expect(result.current.isLessonAccessible(1)).toBe(false);
  });
  it("does not commit a delayed pre-reset completion response after the new zero", async () => {
    const { result } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.progressPercent).toBe(80));
    act(() => result.current.goToLesson(8));
    await waitFor(() => expect(result.current.currentLessonIndex).toBe(8));
    const delayed = deferred<unknown>(), oldResponse = response("0", [...mock.completed, "lesson-8"]);
    mock.pendingWrite = delayed.promise;
    let operation!: Promise<void>;
    await act(async () => { operation = result.current.markLessonComplete(); });
    await waitFor(() => expect(mock.rpc.mock.calls.some(([name]) => name === "save_own_lesson_progress")).toBe(true));
    resetSchool(); await focus();
    await waitFor(() => expect(result.current.progressPercent).toBe(0));
    await act(async () => { delayed.resolve(oldResponse); await operation; });
    expect(result.current.learningRun?.epoch).toBe("1"); expect(result.current.progressPercent).toBe(0);
    expect(result.current.currentLessonIndex).toBe(0); expect(mock.toast.success).not.toHaveBeenCalled();
  });
  it("cancels a pending lesson navigation timer when a new run arrives", async () => {
    const { result } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.progressPercent).toBe(80));
    act(() => result.current.goToLesson(8));
    resetSchool(); await focus();
    await waitFor(() => expect(result.current.learningRun?.epoch).toBe("1"));
    await act(async () => { await new Promise(done => setTimeout(done, 350)); });
    expect(result.current.currentLessonIndex).toBe(0); expect(result.current.progressPercent).toBe(0);
  });
  it("does not send feedback after a pre-reset context lookup returns late", async () => {
    const { result } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.progressPercent).toBe(80));
    act(() => result.current.setFeedbackAnswer("Synthetic feedback"));
    const delayed = deferred<unknown>(); mock.pendingFeedbackRead = delayed.promise;
    let operation!: Promise<void>;
    await act(async () => { operation = result.current.submitFeedback(); });
    resetSchool(); await focus(); await waitFor(() => expect(result.current.learningRun?.epoch).toBe("1"));
    await act(async () => { delayed.resolve({ data: { organization_id: "org" }, error: null }); await operation; });
    expect(mock.feedbackWrites).toBe(0); expect(result.current.progressPercent).toBe(0);
    expect(mock.rpc.mock.calls.some(([name]) => name === "save_own_lesson_progress")).toBe(false);
  });
  it("does not credit the new run when an old feedback insert returns after reset", async () => {
    const { result } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.progressPercent).toBe(80));
    act(() => result.current.setFeedbackAnswer("Synthetic feedback"));
    const delayed = deferred<unknown>(); mock.pendingFeedbackSend = delayed.promise;
    let operation!: Promise<void>;
    await act(async () => { operation = result.current.submitFeedback(); });
    await waitFor(() => expect(mock.feedbackWrites).toBe(1));
    resetSchool(); await focus(); await waitFor(() => expect(result.current.learningRun?.epoch).toBe("1"));
    await act(async () => { delayed.resolve({ data: null, error: null }); await operation; });
    expect(result.current.progressPercent).toBe(0); expect(mock.toast.success).not.toHaveBeenCalled();
    expect(mock.rpc.mock.calls.some(([name]) => name === "save_own_lesson_progress")).toBe(false);
  });
  it("does not fall back to cached 80 after a known reset when revalidation loses network", async () => {
    const { result } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.progressPercent).toBe(80));
    await waitFor(() => expect(getOfflineScope("student", "student", "learner", "course")).not.toBeNull());
    act(() => result.current.goToLesson(8));
    await waitFor(() => expect(result.current.currentLessonIndex).toBe(8));
    mock.cachedCourse = { course: { id: "course" }, lessons: Array.from({ length: 10 }, (_, i) => ({ id: "lesson-" + i })),
      lessonProgress: Array.from({ length: 8 }, (_, i) => ({ lesson_id: "lesson-" + i, completed: true })), lessonAttachments: {}, courseDocuments: [], cachedAt: Date.now() };
    mock.rpc.mockImplementation(name => name === "save_own_lesson_progress"
      ? Promise.resolve({ data: null, error: { code: "P0001", message: "LEARNING_PROGRESS_RESET" } })
      : Promise.reject(new Error("Failed to fetch")));
    await act(async () => { await result.current.markLessonComplete(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mock.cacheRead).not.toHaveBeenCalled();
    expect(getOfflineScope("student", "student", "learner", "course")).toBeNull();
    expect(result.current.learningRun).toBeNull(); expect(result.current.course).toBeNull();
    expect(result.current.progressPercent).toBe(0); // No visible course/progress, not a confirmed new-run zero.
    expect(mock.toast.success).not.toHaveBeenCalled();
  });
  it("polls an open tab with only the atomic snapshot and no extra access-log or metadata reads", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCourseLearning());
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.progressPercent).toBe(80);
    const reads = mock.from.mock.calls.length;
    resetSchool();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(result.current.learningRun?.epoch).toBe("1"); expect(result.current.progressPercent).toBe(0);
    expect(mock.from.mock.calls).toHaveLength(reads);
    expect(mock.rpc.mock.calls.filter(([name]) => name === "get_course_learning_snapshot")).toHaveLength(2);
  });
  it("drops a delayed same-run poll response after a newer local completion", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCourseLearning());
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const delayed = deferred<unknown>(), oldResponse = response();
    mock.pendingRead = delayed.promise;
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(mock.rpc.mock.calls.filter(([name]) => name === "get_course_learning_snapshot")).toHaveLength(2);
    act(() => result.current.goToLesson(8));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await act(async () => { await result.current.markLessonComplete(false); });
    expect(result.current.progressPercent).toBe(90);
    await act(async () => { delayed.resolve(oldResponse); });
    expect(result.current.progressPercent).toBe(90); expect(result.current.completedCount).toBe(9);
  });
  it("clears a denied progress poll and redirects without reading cached/heavy course data", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCourseLearning());
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.progressPercent).toBe(80);
    const reads = mock.from.mock.calls.length;
    mock.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { code: "42501", message: "Access denied" } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(result.current.course).toBeNull(); expect(result.current.learningRun).toBeNull();
    expect(mock.navigate).toHaveBeenCalledWith("/student"); expect(mock.from.mock.calls).toHaveLength(reads);
  });
  it("cannot relabel an old child callback with the new run before React commits", async () => {
    const { result } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.progressPercent).toBe(80));
    act(() => result.current.goToLesson(8));
    await waitFor(() => expect(result.current.currentLessonIndex).toBe(8));
    const oldCallback = result.current.markLessonComplete;
    const accept = LearningProgressFence.prototype.accept;
    let late: Promise<void> | undefined;
    const spy = vi.spyOn(LearningProgressFence.prototype, "accept").mockImplementation(function(this: LearningProgressFence, run: LearningProgressRun) {
      const accepted = accept.call(this, run);
      if (accepted && run.epoch === "1" && !late) late = oldCallback(false);
      return accepted;
    });
    try {
      resetSchool(); await focus();
      await waitFor(() => expect(result.current.learningRun?.epoch).toBe("1"));
      await act(async () => { await late; });
      expect(late).toBeDefined(); expect(result.current.progressPercent).toBe(0);
      expect(result.current.currentLessonIndex).toBe(0);
      expect(mock.rpc.mock.calls.some(([name]) => name === "save_own_lesson_progress")).toBe(false);
      expect(mock.toast.success).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
  it("ignores an old initial network snapshot arriving after a newer focus response", async () => {
    const delayed = deferred<unknown>(), oldResponse = response(); mock.pendingRead = delayed.promise;
    const { result } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("get_course_learning_snapshot", { p_course_id: "course" }));
    resetSchool(); await focus();
    await waitFor(() => expect(result.current.learningRun?.epoch).toBe("1"));
    await act(async () => { delayed.resolve(oldResponse); });
    expect(result.current.progressPercent).toBe(0); expect(result.current.learningRun?.epoch).toBe("1");
  });
});
