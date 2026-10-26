import { describe, it, expect, vi } from "vitest";
import { markLessonProgress, type MarkLessonDeps, type MarkLessonState } from "../markLessonProgress";

function makeDeps(overrides: Partial<MarkLessonDeps> = {}): MarkLessonDeps {
  return {
    saveLessonTime: vi.fn().mockResolvedValue(undefined),
    upsertLessonProgress: vi.fn().mockResolvedValue({ error: null }),
    updateEnrollmentProgress: vi.fn().mockResolvedValue({ error: null }),
    handleCourseCompletion: vi.fn().mockResolvedValue(undefined),
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
  };
}

describe("markLessonProgress — последовательное прохождение", () => {
  it("три урока подряд дают 33%, 66%, 100% (без reload)", async () => {
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
    expect(r2).toMatchObject({ ok: true, progress: 66, completed: true });
    expect(r3).toMatchObject({ ok: true, progress: 100, completed: true });

    const updateCalls = (deps.updateEnrollmentProgress as ReturnType<typeof vi.fn>).mock.calls;
    expect(updateCalls.map((c) => c[1])).toEqual([33, 66, 100]);
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
});

describe("markLessonProgress — authoritative integer progress ceiling", () => {
  it.each([
    { completedBefore: 0, expected: 6 },
    { completedBefore: 3, expected: 26 },
    { completedBefore: 6, expected: 46 },
    { completedBefore: 13, expected: 93 },
  ])("persists $expected% after lesson $completedBefore + 1 of fifteen", async ({ completedBefore, expected }) => {
    const state = makeState();
    for (let index = 0; index < completedBefore; index++) state.completed.add(`previous-${index}`);
    const deps = makeDeps({
      // Model the server contract: reject a claim above this observed fact ceiling.
      updateEnrollmentProgress: vi.fn(async (_id: string, progress: number) => ({
        error: progress > expected ? new Error("PLP_PROGRESS_EXCEEDS_FACTS") : null,
      })),
    });

    const result = await markLessonProgress({
      lessonId: "next", userId: "learner", enrollmentId: "enrollment", totalLessons: 15,
      autoAdvance: true, state, deps,
    });

    expect(result).toEqual({ ok: true, progress: expected, completed: true });
    expect(deps.updateEnrollmentProgress).toHaveBeenCalledWith("enrollment", expected);
    expect(state.completed.size).toBe(completedBefore + 1);
    expect(deps.onProgressUpdated).toHaveBeenCalledWith([...state.completed], expected);
    expect(deps.goToNextLesson).toHaveBeenCalledTimes(1);
    expect(deps.handleCourseCompletion).not.toHaveBeenCalled();
    expect(deps.toastError).not.toHaveBeenCalled();
  });

  it("retries the same persisted lesson after the enrollment update fails without double counting", async () => {
    const state = makeState();
    const persistedLessons = new Set<string>();
    const deps = makeDeps({
      upsertLessonProgress: vi.fn(async (lessonId: string) => {
        persistedLessons.add(lessonId); // The first server-side lesson write already committed.
        return { error: null };
      }),
      updateEnrollmentProgress: vi.fn()
        .mockResolvedValueOnce({ error: new Error("transport failure after lesson save") })
        .mockResolvedValueOnce({ error: null }),
    });
    const input = {
      lessonId: "first", userId: "learner", enrollmentId: "enrollment", totalLessons: 15,
      autoAdvance: true, state, deps,
    };

    const failed = await markLessonProgress(input);
    expect(failed).toEqual({ ok: false, reason: "enrollment_update_failed" });
    expect(persistedLessons.size).toBe(1);
    expect(state.completed.size).toBe(0);
    expect(state.inFlight.size).toBe(0);
    expect(deps.onProgressUpdated).not.toHaveBeenCalled();
    expect(deps.goToNextLesson).not.toHaveBeenCalled();
    expect(deps.toastSuccess).not.toHaveBeenCalled();

    const retried = await markLessonProgress(input);
    expect(retried).toEqual({ ok: true, progress: 6, completed: true });
    expect(persistedLessons.size).toBe(1);
    expect(state.completed).toEqual(new Set(["first"]));
    expect(deps.updateEnrollmentProgress).toHaveBeenNthCalledWith(1, "enrollment", 6);
    expect(deps.updateEnrollmentProgress).toHaveBeenNthCalledWith(2, "enrollment", 6);
    expect(deps.onProgressUpdated).toHaveBeenCalledTimes(1);
    expect(deps.goToNextLesson).toHaveBeenCalledTimes(1);
    expect(deps.handleCourseCompletion).not.toHaveBeenCalled();
  });

  it("does not rewrite an already completed lesson and reports the same bounded percentage", async () => {
    const state = makeState();
    state.completed.add("first");
    const deps = makeDeps();

    const result = await markLessonProgress({
      lessonId: "first", userId: "learner", enrollmentId: "enrollment", totalLessons: 15,
      autoAdvance: true, state, deps,
    });

    expect(result).toEqual({ ok: true, progress: 6, completed: false, alreadyCompleted: true });
    expect(deps.saveLessonTime).not.toHaveBeenCalled();
    expect(deps.upsertLessonProgress).not.toHaveBeenCalled();
    expect(deps.updateEnrollmentProgress).not.toHaveBeenCalled();
    expect(deps.onProgressUpdated).not.toHaveBeenCalled();
    expect(deps.goToNextLesson).toHaveBeenCalledTimes(1);
    expect(deps.handleCourseCompletion).not.toHaveBeenCalled();
  });

  it("reaches 100% only with all fifteen completed lessons, then completes exactly once", async () => {
    const state = makeState();
    const deps = makeDeps();
    const input = { userId: "learner", enrollmentId: "enrollment", totalLessons: 15, autoAdvance: false, state, deps };
    for (let index = 0; index < 14; index++) {
      const result = await markLessonProgress({ ...input, lessonId: `lesson-${index}` });
      expect(result.ok && result.progress < 100).toBe(true);
      expect(deps.handleCourseCompletion).not.toHaveBeenCalled();
    }
    const final = await markLessonProgress({ ...input, lessonId: "lesson-14" });
    expect(final).toEqual({ ok: true, progress: 100, completed: true });
    expect(state.completed.size).toBe(15);
    expect(deps.handleCourseCompletion).toHaveBeenCalledTimes(1);
    await markLessonProgress({ ...input, lessonId: "lesson-14" });
    expect(deps.handleCourseCompletion).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.updateEnrollmentProgress).mock.calls.map(call => call[1]))
      .toEqual([6, 13, 20, 26, 33, 40, 46, 53, 60, 66, 73, 80, 86, 93, 100]);
  });

  it("does not round 199 of 200 lessons into premature course completion", async () => {
    const state = makeState();
    for (let index = 0; index < 198; index++) state.completed.add(`previous-${index}`);
    const deps = makeDeps();
    const result = await markLessonProgress({
      lessonId: "next", userId: "learner", enrollmentId: "enrollment", totalLessons: 200,
      autoAdvance: false, state, deps,
    });
    expect(result).toEqual({ ok: true, progress: 99, completed: true });
    expect(deps.handleCourseCompletion).not.toHaveBeenCalled();
  });

  it("retains exact integer percentages without divide-first floating undercount", async () => {
    const state = makeState();
    for (let index = 0; index < 28; index++) state.completed.add(`previous-${index}`);
    const deps = makeDeps();
    const result = await markLessonProgress({
      lessonId: "next", userId: "learner", enrollmentId: "enrollment", totalLessons: 100,
      autoAdvance: false, state, deps,
    });
    expect(result).toEqual({ ok: true, progress: 29, completed: true });
    expect(deps.updateEnrollmentProgress).toHaveBeenCalledWith("enrollment", 29);
  });
});