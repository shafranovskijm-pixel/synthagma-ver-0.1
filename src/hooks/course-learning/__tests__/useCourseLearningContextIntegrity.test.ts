import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: any; error: any };

const harness = vi.hoisted(() => ({
  courseId: "course-a",
  user: { id: "student-1", email: "student@example.test" },
  navigate: vi.fn(),
  courseResults: {} as Record<string, QueryResult | Promise<QueryResult>>,
  lessonResults: {} as Record<string, QueryResult | Promise<QueryResult>>,
  enrollmentResults: {} as Record<string, QueryResult | Promise<QueryResult>>,
  completionResults: {} as Record<string, QueryResult | Promise<QueryResult>>,
  lessonProgressUpsertResults: {} as Record<string, QueryResult | Promise<QueryResult>>,
  lessonProgressDeleteResult: null as QueryResult | Promise<QueryResult> | null,
  feedbackInsertResult: null as QueryResult | Promise<QueryResult> | null,
  completionCalls: [] as string[],
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

function course(id: string) {
  return {
    id,
    title: `Курс ${id}`,
    description: null,
    duration: null,
    sequential_lessons: false,
    allow_video_seek: true,
    skip_video_identification: true,
    landing_content: null,
    organization_id: "org-1",
  };
}

function lesson(id: string, courseId: string) {
  return {
    id,
    course_id: courseId,
    title: `Урок ${id}`,
    type: "text",
    order_index: 0,
    module_id: null,
    is_locked: false,
    content: "[]",
  };
}

function enrollment(id: string, courseId: string) {
  return { id, course_id: courseId, user_id: "student-1", status: "active", progress: 0, expires_at: null };
}

vi.mock("react-router-dom", () => ({
  useParams: () => ({ courseId: harness.courseId }),
  useNavigate: () => harness.navigate,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: harness.user }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useSwipeGesture", () => ({ useSwipeGesture: () => ({ current: null }) }));
vi.mock("@/utils/adminViewMode", () => ({ getAdminViewData: () => null, isAdminViewActive: () => false }));
vi.mock("@/utils/courseCache", () => ({
  cacheCourseData: vi.fn().mockResolvedValue(undefined),
  getCachedCourseData: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/utils/offlineSync", () => ({ setupOfflineSyncListeners: () => () => undefined }));
vi.mock("@/components/course-builder/block-editor/parsers", () => ({ parseLessonContent: () => [] }));
vi.mock("@/utils/generateAttestationProtocol", () => ({ generateAttestationProtocol: vi.fn().mockResolvedValue(null) }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn().mockResolvedValue({ data: {}, error: null }) }));
vi.mock("@/utils/limitToast", () => ({ showLimitToast: vi.fn() }));
vi.mock("sonner", () => ({ toast: harness.toast }));

vi.mock("../useLessonTTS", () => ({ useLessonTTS: () => ({}) }));
vi.mock("../useLessonChat", () => ({ useLessonChat: () => ({}) }));
vi.mock("../useLessonTest", () => ({
  useLessonTest: () => ({ testSubmitted: false, testScore: null }),
}));
vi.mock("../useLessonVideo", () => ({
  useLessonVideo: () => ({ setVideoWatchProgress: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => {
  function resultFor(table: string, filters: Record<string, any>, operation: string): QueryResult | Promise<QueryResult> {
    const selectedCourseId = filters.id || filters.course_id || harness.courseId;
    if (table === "lesson_progress" && operation === "upsert") {
      return harness.lessonProgressUpsertResults[filters.lesson_id] ?? { data: null, error: null };
    }
    if (table === "lesson_progress" && operation === "delete" && harness.lessonProgressDeleteResult) {
      return harness.lessonProgressDeleteResult;
    }
    if (table === "org_student_messages" && operation === "insert" && harness.feedbackInsertResult) {
      return harness.feedbackInsertResult;
    }
    if (table === "courses") return harness.courseResults[selectedCourseId] ?? { data: course(selectedCourseId), error: null };
    if (table === "lessons" && filters.course_id) return harness.lessonResults[selectedCourseId] ?? { data: [lesson(`lesson-${selectedCourseId}`, selectedCourseId)], error: null };
    if (table === "enrollments") return harness.enrollmentResults[selectedCourseId] ?? { data: enrollment(`enrollment-${selectedCourseId}`, selectedCourseId), error: null };
    if (table === "profiles") return { data: { full_name: "Ученик", organization_id: "org-1" }, error: null };
    if (table === "organizations") return { data: { id: "org-1", name: "Организация", director_name: null, director_position: null, subscription_plan: "free" }, error: null };
    if (table === "lesson_progress" || table === "lesson_attachments") return { data: [], error: null };
    return { data: null, error: null };
  }

  function makeBuilder(table: string) {
    const filters: Record<string, any> = {};
    let operation = "select";
    const builder: Record<string, any> = {};
    builder.select = vi.fn(() => { operation = "select"; return builder; });
    builder.eq = vi.fn((field: string, value: any) => { filters[field] = value; return builder; });
    builder.in = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.update = vi.fn(() => { operation = "update"; return builder; });
    builder.insert = vi.fn(() => { operation = "insert"; return builder; });
    builder.delete = vi.fn(() => { operation = "delete"; return builder; });
    builder.upsert = vi.fn((payload: Record<string, any>) => {
      operation = "upsert";
      if (payload?.lesson_id) filters.lesson_id = payload.lesson_id;
      return builder;
    });
    builder.single = vi.fn(() => Promise.resolve(resultFor(table, filters, operation)));
    builder.maybeSingle = vi.fn(() => Promise.resolve(resultFor(table, filters, operation)));
    builder.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(resultFor(table, filters, operation)).then(resolve, reject);
    return builder;
  }

  return {
    supabase: {
      from: vi.fn((table: string) => makeBuilder(table)),
      rpc: vi.fn((name: string, args: Record<string, any>) => {
        if (name === "count_org_completions_this_month") return Promise.resolve({ data: 0, error: null });
        if (name === "complete_own_course_enrollment") {
          harness.completionCalls.push(args.p_enrollment_id);
          return Promise.resolve(harness.completionResults[args.p_enrollment_id] ?? { data: null, error: new Error("missing completion result") });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    },
  };
});

import { useCourseLearning } from "../useCourseLearningFacade";

describe("useCourseLearning — изоляция контекста курса", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.courseId = "course-a";
    harness.courseResults = {
      "course-a": { data: course("course-a"), error: null },
      "course-b": { data: course("course-b"), error: null },
    };
    harness.lessonResults = {
      "course-a": { data: [lesson("lesson-a", "course-a")], error: null },
      "course-b": { data: [lesson("lesson-b", "course-b")], error: null },
    };
    harness.enrollmentResults = {
      "course-a": { data: enrollment("enrollment-a", "course-a"), error: null },
      "course-b": { data: enrollment("enrollment-b", "course-b"), error: null },
    };
    harness.completionResults = {};
    harness.lessonProgressUpsertResults = {};
    harness.lessonProgressDeleteResult = null;
    harness.feedbackInsertResult = null;
    harness.completionCalls = [];
  });

  it("не применяет запоздалый fetch курса A после загрузки курса B", async () => {
    const fetchA = deferred<QueryResult>();
    harness.courseResults["course-a"] = fetchA.promise;
    const { result, rerender } = renderHook(() => useCourseLearning());

    harness.courseId = "course-b";
    rerender();
    await waitFor(() => expect(result.current.course?.id).toBe("course-b"));

    await act(async () => {
      fetchA.resolve({ data: course("course-a"), error: null });
      await fetchA.promise;
      await Promise.resolve();
    });

    expect(result.current.course?.id).toBe("course-b");
    expect(result.current.enrollmentId).toBe("enrollment-b");
    expect(result.current.lessons.map(item => item.id)).toEqual(["lesson-b"]);
  });

  it("не применяет запоздалое завершение A к уже открытому курсу B", async () => {
    const completionA = deferred<QueryResult>();
    harness.completionResults["enrollment-a"] = completionA.promise;
    const { result, rerender } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.enrollmentId).toBe("enrollment-a"));

    let completionPromise!: Promise<boolean>;
    act(() => { completionPromise = result.current.retryCourseCompletion(); });
    await waitFor(() => expect(harness.completionCalls).toEqual(["enrollment-a"]));

    harness.courseId = "course-b";
    rerender();
    await waitFor(() => expect(result.current.enrollmentId).toBe("enrollment-b"));
    expect(result.current.courseCompletionConfirmed).toBe(false);

    let completionResult!: boolean;
    await act(async () => {
      completionA.resolve({ data: { id: "enrollment-a", status: "completed", progress: 100 }, error: null });
      completionResult = await completionPromise;
    });

    expect(completionResult).toBe(false);
    expect(result.current.course?.id).toBe("course-b");
    expect(result.current.courseCompletionConfirmed).toBe(false);
    expect(result.current.lessonProgress).toEqual([]);
  });

  it("не применяет запоздалую отметку урока A и auto-advance к курсу B", async () => {
    const upsertA = deferred<QueryResult>();
    harness.lessonResults["course-a"] = {
      data: [lesson("lesson-a-1", "course-a"), { ...lesson("lesson-a-2", "course-a"), order_index: 1 }],
      error: null,
    };
    harness.lessonProgressUpsertResults["lesson-a-1"] = upsertA.promise;
    const { result, rerender } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.currentLesson?.id).toBe("lesson-a-1"));

    let markPromise!: Promise<void>;
    act(() => { markPromise = result.current.markLessonComplete(true); });
    await act(async () => { await Promise.resolve(); });

    harness.courseId = "course-b";
    rerender();
    await waitFor(() => expect(result.current.currentLesson?.id).toBe("lesson-b"));
    harness.toast.success.mockClear();

    await act(async () => {
      upsertA.resolve({ data: null, error: null });
      await markPromise;
      await new Promise(resolve => setTimeout(resolve, 350));
    });

    expect(result.current.currentLesson?.id).toBe("lesson-b");
    expect(result.current.currentLessonIndex).toBe(0);
    expect(result.current.lessonProgress).toEqual([]);
    expect(harness.toast.success).not.toHaveBeenCalledWith("Урок завершён!");
  });

  it("не сбрасывает состояние курса B после запоздалого reset курса A", async () => {
    const deleteA = deferred<QueryResult>();
    harness.lessonProgressDeleteResult = deleteA.promise;
    harness.lessonResults["course-b"] = {
      data: [lesson("lesson-b-1", "course-b"), { ...lesson("lesson-b-2", "course-b"), order_index: 1 }],
      error: null,
    };
    const { result, rerender } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.course?.id).toBe("course-a"));

    let resetPromise!: Promise<void>;
    act(() => { resetPromise = result.current.resetCourseProgress(); });
    await act(async () => { await Promise.resolve(); });

    harness.courseId = "course-b";
    rerender();
    await waitFor(() => expect(result.current.currentLesson?.id).toBe("lesson-b-1"));
    act(() => { result.current.goToLesson(1); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
    expect(result.current.currentLesson?.id).toBe("lesson-b-2");
    harness.toast.success.mockClear();

    await act(async () => {
      deleteA.resolve({ data: null, error: null });
      await resetPromise;
    });

    expect(result.current.currentLesson?.id).toBe("lesson-b-2");
    expect(result.current.currentLessonIndex).toBe(1);
    expect(harness.toast.success).not.toHaveBeenCalledWith("Прогресс курса сброшен. Начните прохождение заново!");
  });

  it("не применяет отложенный переход к следующему уроку A после открытия курса B", async () => {
    harness.lessonResults["course-a"] = {
      data: [lesson("lesson-a-1", "course-a"), { ...lesson("lesson-a-2", "course-a"), order_index: 1 }],
      error: null,
    };
    const { result, rerender } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.currentLesson?.id).toBe("lesson-a-1"));

    act(() => { result.current.goToNextLesson(); });
    harness.courseId = "course-b";
    rerender();
    await waitFor(() => expect(result.current.currentLesson?.id).toBe("lesson-b"));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });

    expect(result.current.currentLesson?.id).toBe("lesson-b");
    expect(result.current.currentLessonIndex).toBe(0);
  });

  it("считает серверное завершение подтверждённым, даже если sessionStorage недоступен", async () => {
    harness.completionResults["enrollment-a"] = {
      data: { id: "enrollment-a", status: "completed", progress: 100 },
      error: null,
    };
    const storageSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("storage denied", "SecurityError");
    });
    try {
      const { result } = renderHook(() => useCourseLearning());
      await waitFor(() => expect(result.current.enrollmentId).toBe("enrollment-a"));

      let completionResult!: boolean;
      await act(async () => { completionResult = await result.current.retryCourseCompletion(); });

      expect(completionResult).toBe(true);
      expect(result.current.courseCompletionConfirmed).toBe(true);
    } finally {
      storageSpy.mockRestore();
    }
  });

  it("не применяет запоздалую отправку обратной связи A к курсу B", async () => {
    const feedbackA = deferred<QueryResult>();
    harness.feedbackInsertResult = feedbackA.promise;
    const { result, rerender } = renderHook(() => useCourseLearning());
    await waitFor(() => expect(result.current.currentLesson?.id).toBe("lesson-a"));
    act(() => { result.current.setFeedbackAnswer("Ответ A"); });

    let feedbackPromise!: Promise<void>;
    act(() => { feedbackPromise = result.current.submitFeedback(); });
    await act(async () => { await Promise.resolve(); });

    harness.courseId = "course-b";
    rerender();
    await waitFor(() => expect(result.current.currentLesson?.id).toBe("lesson-b"));
    harness.toast.success.mockClear();

    await act(async () => {
      feedbackA.resolve({ data: null, error: null });
      await feedbackPromise;
    });

    expect(result.current.feedbackSent).toBe(false);
    expect(result.current.feedbackSending).toBe(false);
    expect(result.current.lessonProgress).toEqual([]);
    expect(harness.toast.success).not.toHaveBeenCalledWith("Ваш ответ отправлен");
  });
});
