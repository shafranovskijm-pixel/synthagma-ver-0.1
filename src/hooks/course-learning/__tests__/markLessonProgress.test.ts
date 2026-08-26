import { describe, it, expect, vi } from "vitest";
import { markLessonProgress, type MarkLessonDeps, type MarkLessonState } from "../markLessonProgress";

function makeDeps(overrides: Partial<MarkLessonDeps> = {}): MarkLessonDeps {
  return {
    saveLessonTime: vi.fn().mockResolvedValue(undefined),
    upsertLessonProgress: vi.fn().mockResolvedValue({ error: null }),
    updateEnrollmentProgress: vi.fn().mockResolvedValue({ error: null }),
    handleCourseCompletion: vi.fn().mockResolvedValue(true),
    goToNextLesson: vi.fn(),
    onProgressUpdated: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    ...overrides,
  };
}

function makeState(): MarkLessonState {
  return {
    inFlight: new Set<string>(),
    completed: new Set<string>(),
    courseCompletionStarted: { value: false },
    courseCompletionConfirmed: { value: false },
  };
}

describe("markLessonProgress — последовательное прохождение", () => {
  it("три урока подряд дают 33%, 67%, 100% (без reload)", async () => {
    const state = makeState();
    const deps = makeDeps();
    const call = (id: string) =>
      markLessonProgress({
        lessonId: id,
        userId: "u1",
        enrollmentId: "e1",
        totalLessons: 3,
        autoAdvance: true,
        state,
        deps,
      });

    const r1 = await call("a");
    const r2 = await call("b");
    const r3 = await call("c");

    expect(r1).toMatchObject({ ok: true, progress: 33, completed: true });
    expect(r2).toMatchObject({ ok: true, progress: 67, completed: true });
    expect(r3).toMatchObject({ ok: true, progress: 100, completed: true });

    const updateCalls = (deps.updateEnrollmentProgress as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls.map((c) => c[1])).toEqual([33, 67, 100]);
    expect(deps.handleCourseCompletion).toHaveBeenCalledTimes(1);
    expect(deps.toastSuccess).toHaveBeenCalledTimes(2); // только для не-100%
    expect(deps.goToNextLesson).toHaveBeenCalledTimes(3);
  });
});

describe("markLessonProgress — мьютекс и идемпотентность", () => {
  it("двойной клик по одному уроку не увеличивает прогресс дважды", async () => {
    const state = makeState();
    const deps = makeDeps();
    // Затягиваем upsert, чтобы второй вызов начался, пока первый ещё выполняется.
    (deps.upsertLessonProgress as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((res) => setTimeout(() => res({ error: null }), 20)),
    );

    const [r1, r2] = await Promise.all([
      markLessonProgress({
        lessonId: "a",
        userId: "u",
        enrollmentId: "e",
        totalLessons: 2,
        autoAdvance: false,
        state,
        deps,
      }),
      markLessonProgress({
        lessonId: "a",
        userId: "u",
        enrollmentId: "e",
        totalLessons: 2,
        autoAdvance: false,
        state,
        deps,
      }),
    ]);

    expect(deps.upsertLessonProgress).toHaveBeenCalledTimes(1);
    expect(deps.updateEnrollmentProgress).toHaveBeenCalledTimes(1);
    expect(deps.updateEnrollmentProgress).toHaveBeenCalledWith("e", 50);

    const results = [r1, r2];
    expect(results.filter((r) => r.ok && r.completed).length).toBe(1);
    expect(results.some((r) => r.ok && r.skipped)).toBe(true);
  });

  it("повторный вызов для уже завершённого урока не пишет в БД", async () => {
    const state = makeState();
    const deps = makeDeps();
    await markLessonProgress({
      lessonId: "a", userId: "u", enrollmentId: "e", totalLessons: 2, autoAdvance: false, state, deps,
    });

    (deps.upsertLessonProgress as ReturnType<typeof vi.fn>).mockClear();
    (deps.updateEnrollmentProgress as ReturnType<typeof vi.fn>).mockClear();

    const r = await markLessonProgress({
      lessonId: "a", userId: "u", enrollmentId: "e", totalLessons: 2, autoAdvance: true, state, deps,
    });
    expect(r).toMatchObject({ ok: true, alreadyCompleted: true });
    expect(deps.upsertLessonProgress).not.toHaveBeenCalled();
    expect(deps.updateEnrollmentProgress).not.toHaveBeenCalled();
    expect(deps.goToNextLesson).toHaveBeenCalled();
  });
});

describe("markLessonProgress — обработка ошибок", () => {
  it("ошибка lesson_progress → нет autoAdvance, нет success-toast", async () => {
    const state = makeState();
    const deps = makeDeps({
      upsertLessonProgress: vi.fn().mockResolvedValue({ error: new Error("boom") }),
    });

    const r = await markLessonProgress({
      lessonId: "a", userId: "u", enrollmentId: "e", totalLessons: 2, autoAdvance: true, state, deps,
    });

    expect(r).toEqual({ ok: false, reason: "progress_save_failed" });
    expect(deps.updateEnrollmentProgress).not.toHaveBeenCalled();
    expect(deps.goToNextLesson).not.toHaveBeenCalled();
    expect(deps.toastSuccess).not.toHaveBeenCalled();
    expect(deps.toastError).toHaveBeenCalled();
    expect(state.completed.has("a")).toBe(false);
    expect(state.inFlight.has("a")).toBe(false);
  });

  it("ошибка enrollments.update → нет ложного успеха, состояние не меняется", async () => {
    const state = makeState();
    const deps = makeDeps({
      updateEnrollmentProgress: vi.fn().mockResolvedValue({ error: new Error("boom") }),
    });

    const r = await markLessonProgress({
      lessonId: "a", userId: "u", enrollmentId: "e", totalLessons: 2, autoAdvance: true, state, deps,
    });

    expect(r).toEqual({ ok: false, reason: "enrollment_update_failed" });
    expect(state.completed.has("a")).toBe(false);
    expect(deps.goToNextLesson).not.toHaveBeenCalled();
    expect(deps.toastSuccess).not.toHaveBeenCalled();
    expect(deps.handleCourseCompletion).not.toHaveBeenCalled();
    expect(deps.toastError).toHaveBeenCalled();
  });
});

describe("markLessonProgress — завершение курса", () => {
  it("handleCourseCompletion вызывается ровно один раз при 100%", async () => {
    const state = makeState();
    const deps = makeDeps();

    await markLessonProgress({
      lessonId: "only", userId: "u", enrollmentId: "e", totalLessons: 1, autoAdvance: false, state, deps,
    });
    // повторный вызов — идёт по already-completed ветке
    await markLessonProgress({
      lessonId: "only", userId: "u", enrollmentId: "e", totalLessons: 1, autoAdvance: false, state, deps,
    });

    expect(deps.handleCourseCompletion).toHaveBeenCalledTimes(1);
  });

  it("параллельные вызовы для последнего урока не запускают завершение дважды", async () => {
    const state = makeState();
    const deps = makeDeps();
    (deps.upsertLessonProgress as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((res) => setTimeout(() => res({ error: null }), 10)),
    );

    await Promise.all([
      markLessonProgress({
        lessonId: "last", userId: "u", enrollmentId: "e", totalLessons: 1, autoAdvance: false, state, deps,
      }),
      markLessonProgress({
        lessonId: "last", userId: "u", enrollmentId: "e", totalLessons: 1, autoAdvance: false, state, deps,
      }),
    ]);

    expect(deps.handleCourseCompletion).toHaveBeenCalledTimes(1);
  });

  it("не сообщает об успешном завершении курса и сбрасывает one-shot при отказе RPC/лимита", async () => {
    const state = makeState();
    const deps = makeDeps({
      handleCourseCompletion: vi.fn().mockResolvedValue(false),
    });

    const result = await markLessonProgress({
      lessonId: "last", userId: "u", enrollmentId: "e", totalLessons: 1, autoAdvance: true, state, deps,
    });

    expect(result).toEqual({
      ok: false,
      reason: "course_completion_failed",
      progress: 100,
      lessonCompleted: true,
    });
    expect(state.courseCompletionStarted.value).toBe(false);
    expect(deps.goToNextLesson).not.toHaveBeenCalled();
    expect(deps.toastSuccess).not.toHaveBeenCalled();
  });

  it("повторяет завершение для уже сохранённого последнего урока после временной ошибки", async () => {
    const state = makeState();
    const complete = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const deps = makeDeps({ handleCourseCompletion: complete });
    const input = {
      lessonId: "last", userId: "u", enrollmentId: "e", totalLessons: 1, autoAdvance: false, state, deps,
    };

    const first = await markLessonProgress(input);
    const retry = await markLessonProgress(input);

    expect(first).toMatchObject({ ok: false, reason: "course_completion_failed" });
    expect(retry).toMatchObject({ ok: true, alreadyCompleted: true, courseCompleted: true });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(state.courseCompletionStarted.value).toBe(true);
    expect(state.courseCompletionConfirmed.value).toBe(true);
  });

  it("не считает started=true подтверждённым завершением и не двигает UI дальше", async () => {
    const state = makeState();
    state.completed.add("last");
    state.courseCompletionStarted.value = true;
    state.courseCompletionConfirmed.value = false;
    const deps = makeDeps();

    const result = await markLessonProgress({
      lessonId: "last", userId: "u", enrollmentId: "e", totalLessons: 1, autoAdvance: true, state, deps,
    });

    expect(result).toMatchObject({ ok: true, courseCompleted: false, skipped: true });
    expect(deps.handleCourseCompletion).not.toHaveBeenCalled();
    expect(deps.goToNextLesson).not.toHaveBeenCalled();
  });
});
