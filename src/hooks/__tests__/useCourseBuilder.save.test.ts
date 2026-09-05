import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  from: vi.fn(),
  profileMaybeSingle: vi.fn(),
  courseInsert: vi.fn(),
  courseInsertSingle: vi.fn(),
  courseUpdateBuilder: vi.fn(),
  courseUpdate: vi.fn(),
  lessonUpsert: vi.fn(),
  lessonUpdateIn: vi.fn(),
  lessonDeleteEq: vi.fn(),
  lessonDeleteNot: vi.fn(),
  lessonDeleteIn: vi.fn(),
  attachmentUpsert: vi.fn(),
  courseRead: vi.fn(),
  moduleRead: vi.fn(),
  lessonsRead: vi.fn(),
  questionsRead: vi.fn(),
  attachmentsRead: vi.fn(),
  testQuestionUpsert: vi.fn(),
  courseModuleInsertSingle: vi.fn(),
  courseModuleInsert: vi.fn(),
  importFiles: vi.fn(),
  generateAIContent: vi.fn(),
  safeInvoke: vi.fn(),
  clearDraft: vi.fn(),
  saveDraft: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ courseId: undefined }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "test-user-id", email: "test@test.com" },
    userRole: "organization",
  }),
}));

vi.mock("@/lib/courseImportScope", () => ({
  resolveCourseWriteScope: vi.fn().mockResolvedValue({ organizationId: "org-id", source: "current_organization" }),
}));

vi.mock("@/hooks/useAiGenerationLimit", () => ({
  useAiGenerationLimit: () => ({
    checkAndNotify: vi.fn().mockResolvedValue(true),
    increment: vi.fn().mockResolvedValue(undefined),
  }),
  setAiLimitContext: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock("@/hooks/useCourseBuilderHelpers", () => ({
  saveDraftToLocal: mocks.saveDraft,
  loadDraftFromLocal: vi.fn().mockReturnValue(null),
  clearDraftFromLocal: mocks.clearDraft,
  normalizeLessonsFromDB: vi.fn().mockReturnValue([]),
  importFiles: mocks.importFiles,
  generateAIContent: mocks.generateAIContent,
  createFallbackSlides: vi.fn(),
}));

vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mocks.safeInvoke }));

vi.mock("@/components/course-builder/block-editor", () => ({
  blocksToJson: vi.fn().mockReturnValue("[]"),
  markdownToBlocks: vi.fn().mockReturnValue([]),
  jsonToBlocks: vi.fn().mockReturnValue([]),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: mocks.toastWarning,
    info: vi.fn(),
  },
}));

import { useCourseBuilder } from "@/hooks/useCourseBuilder";

const ok = { data: null, error: null };

function installSupabaseMock() {
  mocks.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: mocks.profileMaybeSingle }),
        }),
      };
    }

    if (table === "organizations") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: { subscription_plan: "free" },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "courses") {
      return {
        select: () => ({ eq: () => ({ single: mocks.courseRead }) }),
        insert: mocks.courseInsert,
        update: mocks.courseUpdateBuilder,
      };
    }

    if (table === "lessons") {
      return {
        select: () => ({ eq: () => ({ order: mocks.lessonsRead }) }),
        upsert: mocks.lessonUpsert,
        update: () => ({ in: mocks.lessonUpdateIn }),
        delete: () => ({
          eq: mocks.lessonDeleteEq,
        }),
      };
    }

    if (table === "course_modules") {
      return {
        select: () => ({ eq: () => ({ order: mocks.moduleRead }) }),
        insert: mocks.courseModuleInsert,
      };
    }

    if (table === "test_questions") {
      return {
        select: () => ({ in: () => ({ order: mocks.questionsRead }) }),
        upsert: mocks.testQuestionUpsert,
        delete: () => ({ eq: () => Promise.resolve(ok) }),
      };
    }

    if (table === "lesson_attachments") {
      return {
        select: () => ({ in: () => ({ order: mocks.attachmentsRead }) }),
        upsert: mocks.attachmentUpsert,
        delete: () => ({ eq: () => Promise.resolve(ok) }),
      };
    }

    throw new Error(`Unexpected Supabase table in test: ${table}`);
  });
}

async function buildTestCourse() {
  const hook = renderHook(() => useCourseBuilder());
  await waitFor(() => expect(hook.result.current.organizationId).toBe("org-id"));

  act(() => {
    hook.result.current.setCourseTitle("Пожарная безопасность");
    hook.result.current.addLesson("test");
  });
  const lessonId = hook.result.current.lessons[0].id;
  act(() => {
    hook.result.current.updateLesson(lessonId, {
      module_id: "module-id",
      questions: [
        {
          id: "question-1",
          question: "Что делать при пожаре?",
          options: [{ text: "Эвакуироваться" }, { text: "Продолжить работу" }],
          correct_answer: 0,
          order_index: 0,
          explanation: "",
          image_url: null,
          isNew: true,
          isDeleted: false,
        },
      ],
    });
  });

  return hook;
}

type CourseBuilderApi = ReturnType<typeof useCourseBuilder>;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function expectDelayedSaveToUseLatestTitle(
  trigger: (api: CourseBuilderApi) => void | Promise<void>,
  delayMs = 650,
) {
  const hook = await buildTestCourse();
  await act(async () => {
    await trigger(hook.result.current);
  });
  act(() => {
    hook.result.current.setCourseTitle("Название после планирования");
    hook.result.current.markAsChanged();
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  });

  expect(mocks.courseInsert).toHaveBeenCalledWith(expect.objectContaining({
    title: "Название после планирования",
  }));
  hook.unmount();
}

describe("useCourseBuilder save integrity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { organization_id: "org-id" },
      error: null,
    });
    mocks.courseInsertSingle.mockResolvedValue({
      data: { id: "new-course-id" },
      error: null,
    });
    mocks.courseInsert.mockImplementation(() => ({
      select: () => ({ single: mocks.courseInsertSingle }),
    }));
    mocks.courseUpdateBuilder.mockImplementation(() => ({ eq: mocks.courseUpdate }));
    mocks.courseUpdate.mockResolvedValue(ok);
    mocks.lessonUpsert.mockResolvedValue(ok);
    mocks.lessonUpdateIn.mockResolvedValue(ok);
    mocks.lessonDeleteNot.mockResolvedValue(ok);
    mocks.lessonDeleteIn.mockResolvedValue(ok);
    mocks.attachmentUpsert.mockResolvedValue(ok);
    mocks.courseRead.mockResolvedValue({ data: { id: "existing-course", title: "Курс", organization_id: "org-id", description: "" }, error: null });
    mocks.moduleRead.mockResolvedValue({ data: [], error: null });
    mocks.lessonsRead.mockResolvedValue({ data: [{ id: "existing-lesson", type: "test", title: "Тест" }], error: null });
    mocks.questionsRead.mockResolvedValue({ data: [], error: null });
    mocks.attachmentsRead.mockResolvedValue({ data: [], error: null });
    mocks.lessonDeleteEq.mockImplementation(() => ({ ...ok, not: mocks.lessonDeleteNot, in: mocks.lessonDeleteIn }));
    mocks.testQuestionUpsert.mockResolvedValue(ok);
    mocks.courseModuleInsertSingle.mockResolvedValue({
      data: { id: "module-id", course_id: "new-course-id", title: "Основной", order_index: 0 },
      error: null,
    });
    mocks.courseModuleInsert.mockImplementation(() => ({
      select: () => ({ single: mocks.courseModuleInsertSingle }),
    }));
    mocks.importFiles.mockResolvedValue(0);
    mocks.generateAIContent.mockResolvedValue(undefined);
    mocks.safeInvoke.mockResolvedValue({ data: { success: true, lessons: [] }, error: null });
    installSupabaseMock();
  });

  it("treats a fulfilled Supabase response containing error as a failed save and remains retryable", async () => {
    mocks.testQuestionUpsert
      .mockResolvedValueOnce({
        data: null,
        error: { message: "question write failed" },
      })
      .mockResolvedValueOnce(ok);
    const { result } = await buildTestCourse();

    let firstSave = true;
    await act(async () => {
      firstSave = await result.current.saveCourse();
    });

    expect(firstSave).toBe(false);
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.autoSaveStatus).toBe("error");
    expect(result.current.isSaving).toBe(false);
    expect(mocks.clearDraft).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    let retrySave = false;
    await act(async () => {
      retrySave = await result.current.saveCourse();
    });

    expect(retrySave).toBe(true);
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.autoSaveStatus).toBe("saved");
    expect(mocks.clearDraft).toHaveBeenCalledTimes(2);
    expect(mocks.clearDraft).toHaveBeenCalledWith(undefined);
    expect(mocks.clearDraft).toHaveBeenCalledWith("new-course-id");
    expect(mocks.testQuestionUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1);
    expect(mocks.courseUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not convert a fulfilled AbortError into success or clear the draft", async () => {
    const abortError = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    mocks.lessonUpsert.mockResolvedValueOnce({ data: null, error: abortError });
    const { result } = await buildTestCourse();

    let saved = true;
    await act(async () => {
      saved = await result.current.saveCourse();
    });

    expect(saved).toBe(false);
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.autoSaveStatus).toBe("error");
    expect(result.current.isSaving).toBe(false);
    expect(mocks.clearDraft).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("does not convert a rejected AbortError into success or clear the draft", async () => {
    const abortError = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    mocks.courseInsertSingle.mockRejectedValueOnce(abortError);
    const { result } = await buildTestCourse();

    let saved = true;
    await act(async () => {
      saved = await result.current.saveCourse();
    });

    expect(saved).toBe(false);
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.autoSaveStatus).toBe("error");
    expect(result.current.isSaving).toBe(false);
    expect(mocks.clearDraft).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("coalesces concurrent saves into one new-course insert and one shared result", async () => {
    let resolveInsert!: (value: { data: { id: string }; error: null }) => void;
    const pendingInsert = new Promise<{ data: { id: string }; error: null }>(resolve => {
      resolveInsert = resolve;
    });
    mocks.courseInsertSingle.mockReturnValue(pendingInsert);
    const { result } = await buildTestCourse();

    let firstSave!: Promise<boolean>;
    let secondSave!: Promise<boolean>;
    act(() => {
      firstSave = result.current.saveCourse();
      secondSave = result.current.saveCourse();
    });

    await waitFor(() => expect(mocks.courseInsertSingle).toHaveBeenCalled());
    const insertsBeforeResolution = mocks.courseInsertSingle.mock.calls.length;
    let outcomes: boolean[] = [];
    await act(async () => {
      resolveInsert({ data: { id: "new-course-id" }, error: null });
      outcomes = await Promise.all([firstSave, secondSave]);
    });

    expect(firstSave).toBe(secondSave);
    expect(outcomes).toEqual([true, true]);
    expect(insertsBeforeResolution).toBe(1);
    expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1);
    expect(mocks.lessonUpsert).toHaveBeenCalledTimes(1);
  });

  it("clears a scheduled delayed save when a manual save starts", async () => {
    let resolveInsert!: (value: { data: { id: string }; error: null }) => void;
    const pendingInsert = new Promise<{ data: { id: string }; error: null }>(resolve => {
      resolveInsert = resolve;
    });
    mocks.courseInsertSingle.mockReturnValue(pendingInsert);
    const hook = await buildTestCourse();
    const lessonId = hook.result.current.lessons[0].id;
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    act(() => hook.result.current.deleteLesson(lessonId));
    let delayedSaveTimer: ReturnType<typeof setTimeout> | undefined;
    for (let index = setTimeoutSpy.mock.calls.length - 1; index >= 0; index -= 1) {
      if (setTimeoutSpy.mock.calls[index][1] === 500) {
        delayedSaveTimer = setTimeoutSpy.mock.results[index]?.value;
        break;
      }
    }
    let manualSave!: Promise<boolean>;
    act(() => {
      manualSave = hook.result.current.saveCourse();
    });

    expect(delayedSaveTimer).toBeDefined();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(delayedSaveTimer);
    await act(async () => {
      resolveInsert({ data: { id: "new-course-id" }, error: null });
      await manualSave;
    });

    expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1);
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
    hook.unmount();
  });

  it("uses the latest editor state when an older save callback fires", async () => {
    const { result } = await buildTestCourse();
    const staleSave = result.current.saveCourse;

    act(() => {
      result.current.setCourseTitle("Актуальное название курса");
      result.current.markAsChanged();
    });
    await act(async () => {
      await staleSave();
    });

    expect(mocks.courseInsert).toHaveBeenCalledWith(expect.objectContaining({
      title: "Актуальное название курса",
    }));
  });

  it("keeps the exit dialog and draft when Save and Exit fails", async () => {
    mocks.courseInsertSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "course write failed" },
    });
    const { result } = await buildTestCourse();
    act(() => result.current.setShowExitDialog(true));

    await act(async () => {
      await result.current.handleSaveAndExit();
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(result.current.showExitDialog).toBe(true);
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(mocks.clearDraft).not.toHaveBeenCalled();
  });

  async function startPersistedCourseSaveAndExitRace() {
    const hook = await buildTestCourse();
    await act(async () => {
      expect(await hook.result.current.saveCourse()).toBe(true);
    });
    expect(hook.result.current.lessons).toHaveLength(1);
    expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1);

    mocks.navigate.mockClear();
    mocks.courseUpdate.mockClear();
    mocks.courseUpdateBuilder.mockClear();
    mocks.clearDraft.mockClear();
    mocks.saveDraft.mockClear();

    const firstUpdate = createDeferred<{ data: null; error: null }>();
    const followUpUpdate = createDeferred<{ data: null; error: unknown }>();
    mocks.courseUpdate
      .mockReturnValueOnce(firstUpdate.promise)
      .mockReturnValueOnce(followUpUpdate.promise);

    act(() => {
      hook.result.current.setCourseTitle("Снимок первого автосохранения");
      hook.result.current.markAsChanged();
    });
    let autosave!: Promise<boolean>;
    act(() => {
      autosave = hook.result.current.saveCourse(true);
    });
    await waitFor(() => expect(mocks.courseUpdate).toHaveBeenCalledTimes(1));

    act(() => {
      hook.result.current.setCourseTitle("Последняя правка перед выходом");
      hook.result.current.markAsChanged();
      hook.result.current.setShowExitDialog(true);
    });
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith(
      "new-course-id",
      "Последняя правка перед выходом",
      expect.any(String),
      expect.any(Array),
    ));

    let exitPromise!: Promise<void>;
    act(() => {
      exitPromise = hook.result.current.handleSaveAndExit();
    });

    return { hook, autosave, exitPromise, firstUpdate, followUpUpdate };
  }

  it("waits for latest persistence before Save and Exit navigates", async () => {
    const race = await startPersistedCourseSaveAndExitRace();

    await act(async () => {
      race.firstUpdate.resolve(ok);
      expect(await race.autosave).toBe(true);
    });
    await waitFor(() => expect(mocks.courseUpdate).toHaveBeenCalledTimes(2));
    const navigationsBeforeFollowUp = mocks.navigate.mock.calls.length;

    await act(async () => {
      race.followUpUpdate.resolve(ok);
      await race.exitPromise;
    });

    expect(navigationsBeforeFollowUp).toBe(0);
    expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1);
    expect(mocks.courseUpdateBuilder).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: "Снимок первого автосохранения",
    }));
    expect(mocks.courseUpdateBuilder).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: "Последняя правка перед выходом",
    }));
    expect(race.hook.result.current.hasUnsavedChanges).toBe(false);
    expect(race.hook.result.current.showExitDialog).toBe(false);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    race.hook.unmount();
  });

  const followUpFailures: Array<{
    name: string;
    settle: (deferred: Deferred<{ data: null; error: unknown }>) => void;
  }> = [
    {
      name: "fulfilled error",
      settle: deferred => deferred.resolve({ data: null, error: { message: "follow-up write failed" } }),
    },
    {
      name: "rejected write",
      settle: deferred => deferred.reject(new Error("follow-up rejected")),
    },
    {
      name: "AbortError",
      settle: deferred => deferred.resolve({
        data: null,
        error: Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
      }),
    },
  ];

  it.each(followUpFailures)(
    "does not navigate when latest Save and Exit follow-up ends with $name",
    async ({ settle }) => {
      const race = await startPersistedCourseSaveAndExitRace();

      await act(async () => {
        race.firstUpdate.resolve(ok);
        expect(await race.autosave).toBe(true);
      });
      await waitFor(() => expect(mocks.courseUpdate).toHaveBeenCalledTimes(2));
      const navigationsBeforeFollowUp = mocks.navigate.mock.calls.length;

      await act(async () => {
        settle(race.followUpUpdate);
        await race.exitPromise;
      });

      expect(navigationsBeforeFollowUp).toBe(0);
      expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1);
      expect(race.hook.result.current.hasUnsavedChanges).toBe(true);
      expect(race.hook.result.current.showExitDialog).toBe(true);
      expect(race.hook.result.current.autoSaveStatus).toBe("error");
      expect(mocks.clearDraft).not.toHaveBeenCalled();
      expect(mocks.navigate).not.toHaveBeenCalled();
      race.hook.unmount();
    },
  );

  it("deletes every persisted lesson when the last editor lesson is removed", async () => {
    const { result } = await buildTestCourse();
    await act(async () => {
      expect(await result.current.saveCourse()).toBe(true);
    });
    const lastLessonId = result.current.lessons[0].id;
    mocks.lessonDeleteEq.mockClear();
    mocks.lessonDeleteNot.mockClear();

    act(() => result.current.deleteLesson(lastLessonId));
    let saved = false;
    await act(async () => {
      saved = await result.current.saveCourse();
    });

    expect(saved).toBe(true);
    expect(mocks.lessonDeleteEq).toHaveBeenCalledWith("course_id", "new-course-id");
    expect(mocks.lessonDeleteIn).toHaveBeenCalledWith("id", [lastLessonId]);
    expect(mocks.lessonDeleteNot).not.toHaveBeenCalled();
    expect(result.current.lessons).toEqual([]);
  });

  it("treats a fulfilled lesson-delete response containing error as a failed save", async () => {
    const { result } = await buildTestCourse();
    await act(async () => {
      expect(await result.current.saveCourse()).toBe(true);
    });
    const deletedLessonId = result.current.lessons[0].id;
    act(() => result.current.addLesson("text", "module-id"));
    act(() => result.current.deleteLesson(deletedLessonId));
    mocks.clearDraft.mockClear();
    mocks.lessonDeleteIn.mockResolvedValueOnce({
      data: null,
      error: { message: "stale lesson delete failed" },
    });

    let saved = true;
    await act(async () => {
      saved = await result.current.saveCourse();
    });

    expect(saved).toBe(false);
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.autoSaveStatus).toBe("error");
    expect(mocks.clearDraft).not.toHaveBeenCalled();
  });

  it("uses current state for the debounced add-lesson autosave", async () => {
    await expectDelayedSaveToUseLatestTitle(api => api.addLesson("text", "module-id"), 1650);
  });

  it("uses current state for the delayed AI-content autosave", async () => {
    await expectDelayedSaveToUseLatestTitle(api => api.handleAIGenerate("image", "Схема эвакуации"));
  });

  it("uses current state for the delayed file-import autosave", async () => {
    mocks.importFiles.mockResolvedValueOnce(1);
    await expectDelayedSaveToUseLatestTitle(api => api.handleFileImport({
      target: {
        files: [new File(["lesson"], "lesson.txt", { type: "text/plain" })],
        value: "lesson.txt",
      },
    } as unknown as React.ChangeEvent<HTMLInputElement>));
  });

  it("uses current state for the delayed reorder autosave", async () => {
    await expectDelayedSaveToUseLatestTitle(api => {
      const first = api.lessons[0];
      const second = { ...first, id: "second-lesson-id", title: "Второй урок" };
      api.setLessons(prev => [...prev, second]);
      api.markAsChanged();
      api.handleDragEnd({ active: { id: first.id }, over: { id: second.id } } as any);
    });
  });

  it("uses current state for the delayed delete autosave", async () => {
    await expectDelayedSaveToUseLatestTitle(api => api.deleteLesson(api.lessons[0].id));
  });

  it("reuses the created course for delayed AI-structure autosave", async () => {
    mocks.safeInvoke.mockResolvedValueOnce({
      data: {
        success: true,
        lessons: [{ type: "text", title: "Вводный урок", description: "Описание" }],
      },
      error: null,
    });
    const hook = await buildTestCourse();

    await act(async () => {
      await hook.result.current.handleGenerateStructure();
    });
    act(() => {
      hook.result.current.setCourseTitle("Актуальное название после AI");
      hook.result.current.markAsChanged();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 650));
    });

    expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1);
    expect(mocks.courseUpdateBuilder).toHaveBeenCalledWith(expect.objectContaining({
      title: "Актуальное название после AI",
    }));
    hook.unmount();
  });

  it("keeps the draft and does not navigate when an attachment write resolves with an error", async () => {
    mocks.attachmentUpsert.mockResolvedValueOnce({ data: null, error: { message: "attachment denied" } });
    const hook = await buildTestCourse();
    act(() => {
      hook.result.current.updateLesson(hook.result.current.lessons[0].id, {
        attachments: [{ id: "attachment-1", lesson_id: hook.result.current.lessons[0].id,
          name: "Материал", file_url: "https://example.test/material.pdf", file_type: "pdf",
          file_size: 100, category: "material", order_index: 0, isNew: true, isDeleted: false }],
      });
      hook.result.current.setShowExitDialog(true);
    });
    await act(async () => { await hook.result.current.handleSaveAndExit(); });
    expect(hook.result.current.hasUnsavedChanges).toBe(true);
    expect(hook.result.current.autoSaveStatus).toBe("error");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.clearDraft).not.toHaveBeenCalled();
    expect(mocks.saveDraft).toHaveBeenCalled();
    hook.unmount();
  });

  it.each(["moduleRead", "lessonsRead", "questionsRead", "attachmentsRead"] as const)(
    "prevents writes after an incomplete %s load",
    async (reader) => {
      mocks[reader].mockResolvedValueOnce({ data: null, error: { message: "read denied" } });
      const hook = renderHook(() => useCourseBuilder("existing-course"));
      await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
      expect(hook.result.current.scopeError).toMatch(/Не удалось загрузить/);
      await act(async () => { expect(await hook.result.current.saveCourse()).toBe(false); });
      expect(mocks.courseUpdate).not.toHaveBeenCalled();
      expect(mocks.lessonDeleteEq).not.toHaveBeenCalled();
      expect(mocks.lessonUpsert).not.toHaveBeenCalled();
      expect(mocks.clearDraft).not.toHaveBeenCalled();
      hook.unmount();
    },
  );

  it("deletes only a known removed lesson, leaving another editor's new lesson untouched", async () => {
    const hook = await buildTestCourse();
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(true); });
    const knownId = hook.result.current.lessons[0].id;
    const persistedIds = new Set([knownId, "added-in-another-window"]);
    mocks.lessonDeleteIn.mockImplementationOnce((_column: string, ids: string[]) => {
      ids.forEach(id => persistedIds.delete(id));
      return Promise.resolve(ok);
    });
    act(() => hook.result.current.deleteLesson(knownId));
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(true); });
    expect([...persistedIds]).toEqual(["added-in-another-window"]);
    expect(mocks.lessonDeleteNot).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("preserves lazy lesson content and metadata while saving current test settings", async () => {
    const hook = await buildTestCourse();
    act(() => hook.result.current.addLesson("slider", "module-id", {
      id: "lazy-slider", __contentLoaded: false, content: "", metadata: { source: "client-original" },
    }));
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(true); });
    const writtenRows = mocks.lessonUpsert.mock.calls.flatMap(call => call[0]);
    expect(writtenRows.find(row => row.id === "lazy-slider")).toEqual(expect.objectContaining({
      metadata: { source: "client-original" }, module_id: "module-id",
    }));
    expect(writtenRows.find(row => row.id === "lazy-slider")).not.toHaveProperty("content");
    expect(writtenRows.find(row => row.type === "test")).toEqual(expect.objectContaining({
      test_passing_score: 60, test_show_answers: true,
    }));
    hook.unmount();
  });

  it("waits for the sibling lesson batch after rejection before allowing a retry", async () => {
    const sibling = createDeferred<typeof ok>();
    mocks.lessonUpsert.mockRejectedValueOnce(new Error("first batch rejected"))
      .mockReturnValueOnce(sibling.promise);
    const hook = await buildTestCourse();
    act(() => hook.result.current.addLesson("slider", "module-id", {
      id: "lazy-slider", __contentLoaded: false,
    }));
    let firstSave!: Promise<boolean>;
    act(() => { firstSave = hook.result.current.saveCourse(); });
    await waitFor(() => expect(mocks.lessonUpsert).toHaveBeenCalledTimes(2));
    expect(hook.result.current.isSaving).toBe(true);
    expect(hook.result.current.saveCourse()).toBe(firstSave);
    await act(async () => { sibling.resolve(ok); expect(await firstSave).toBe(false); });
    expect(hook.result.current.isSaving).toBe(false);
    expect(hook.result.current.hasUnsavedChanges).toBe(true);
    expect(mocks.clearDraft).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("can remove an attempted lesson after its write response was lost", async () => {
    mocks.lessonUpsert.mockRejectedValueOnce(new Error("network response lost"));
    const hook = await buildTestCourse();
    const id = hook.result.current.lessons[0].id;
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(false); });
    act(() => hook.result.current.deleteLesson(id));
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(true); });
    expect(mocks.lessonDeleteIn).toHaveBeenCalledWith("id", [id]);
    expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("does not clear another tab's new-course draft after this course has its own ID", async () => {
    const drafts = new Map<string, string>();
    mocks.saveDraft.mockImplementation((id: string | undefined, title: string) => drafts.set(id || "new", title));
    mocks.clearDraft.mockImplementation((id: string | undefined) => drafts.delete(id || "new"));
    const first = await buildTestCourse();
    await act(async () => { expect(await first.result.current.saveCourse()).toBe(true); });
    const second = await buildTestCourse();
    act(() => { second.result.current.setCourseTitle("Черновик другой вкладки"); second.result.current.markAsChanged(); });
    expect(drafts.get("new")).toBe("Черновик другой вкладки");
    mocks.clearDraft.mockClear();
    act(() => { first.result.current.setCourseDescription("Правка первого курса"); first.result.current.markAsChanged(); });
    await act(async () => { expect(await first.result.current.saveCourse()).toBe(true); });
    expect(drafts.get("new")).toBe("Черновик другой вкладки");
    expect(mocks.clearDraft).not.toHaveBeenCalledWith(undefined);
    expect(mocks.clearDraft).toHaveBeenCalledWith("new-course-id");
    first.unmount();
    second.unmount();
  });

  it.each(["discard", "unmount"] as const)("does not save newer edits after %s while an older autosave is pending", async (exit) => {
    const hook = await buildTestCourse();
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(true); });
    const pending = createDeferred<typeof ok>();
    mocks.courseUpdate.mockClear();
    mocks.courseUpdate.mockReturnValueOnce(pending.promise);
    act(() => { hook.result.current.setCourseTitle("Автосохранение A"); hook.result.current.markAsChanged(); });
    let autosave!: Promise<boolean>;
    act(() => { autosave = hook.result.current.saveCourse(true); });
    await waitFor(() => expect(mocks.courseUpdate).toHaveBeenCalledTimes(1));
    act(() => { hook.result.current.setCourseTitle("Новая правка B"); hook.result.current.markAsChanged(); });
    vi.useFakeTimers();
    if (exit === "discard") act(() => hook.result.current.handleExitWithoutSave());
    else hook.unmount();
    mocks.saveDraft.mockClear();
    mocks.clearDraft.mockClear();
    mocks.toastSuccess.mockClear();
    const writesBeforeExit = mocks.lessonUpsert.mock.calls.length;
    await act(async () => { pending.resolve(ok); expect(await autosave).toBe(false); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_500); });
    expect(mocks.courseUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.lessonUpsert).toHaveBeenCalledTimes(writesBeforeExit);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
    expect(mocks.clearDraft).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    if (exit === "discard") hook.unmount();
    vi.useRealTimers();
  });

  it.each(["save-first", "module-first"] as const)("shares the first course insert with module creation: %s", async (order) => {
    const pending = createDeferred<{ data: { id: string }; error: null }>();
    mocks.courseInsertSingle.mockReturnValueOnce(pending.promise);
    const hook = await buildTestCourse();
    let save!: Promise<boolean>;
    let module!: Promise<void>;
    if (order === "save-first") {
      act(() => { save = hook.result.current.saveCourse(); });
      await waitFor(() => expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1));
      act(() => { module = hook.result.current.createModule(); });
    } else {
      act(() => { module = hook.result.current.createModule(); });
      await waitFor(() => expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1));
      act(() => { hook.result.current.setCourseTitle("Название после начала создания модуля"); hook.result.current.markAsChanged(); });
      act(() => { save = hook.result.current.saveCourse(); });
    }
    await act(async () => {
      pending.resolve({ data: { id: "new-course-id" }, error: null });
      expect(await save).toBe(true);
      await module;
    });
    expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1);
    expect(mocks.courseModuleInsert).toHaveBeenCalledWith(expect.objectContaining({ course_id: "new-course-id" }));
    expect(hook.result.current.courseId).toBe("new-course-id");
    expect(mocks.lessonUpsert.mock.calls.flatMap(call => call[0]).every(row => row.course_id === "new-course-id")).toBe(true);
    if (order === "module-first") expect(mocks.courseUpdateBuilder).toHaveBeenCalledWith(expect.objectContaining({
      title: "Название после начала создания модуля",
    }));
    hook.unmount();
  });

  it("keeps partial writes retryable and can remove the lesson after its question write failed", async () => {
    mocks.testQuestionUpsert.mockResolvedValueOnce({ data: null, error: { message: "question denied" } });
    const hook = await buildTestCourse();
    const id = hook.result.current.lessons[0].id;
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(false); });
    act(() => hook.result.current.deleteLesson(id));
    await act(async () => { expect(await hook.result.current.saveCourse()).toBe(true); });
    expect(mocks.lessonDeleteIn).toHaveBeenCalledWith("id", [id]);
    expect(mocks.courseInsertSingle).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

});
