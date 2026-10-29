import { describe, expect, it, vi } from "vitest";
import { LearningProgressFence, acceptDashboardProgressEpochs, isDashboardCachedProgressCurrent, compareLearningProgressEpoch, isLearningProgressEpoch,
  parseLearningProgressSnapshot, saveOwnLearningProgress, type LearningProgressRun } from "../learningProgress";
import { markLessonProgress } from "@/hooks/course-learning/markLessonProgress";

const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
const run = (epoch = "0"): LearningProgressRun => ({ enrollmentId: "enrollment", userId: "student", courseId: "course", epoch, resetAt: epoch === "0" ? null : "2026-10-29T01:00:00Z" });
const snapshot = (epoch = "0", rows: { lesson_id: string; completed: boolean }[] = []) => ({
  enrollment: { id: "enrollment", user_id: "student", course_id: "course", status: "active", learning_progress_epoch: epoch, progress: rows.length * 10 },
  lesson_progress: rows, learning_progress_epoch: epoch, learning_progress_reset_at: run(epoch).resetAt,
});
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

describe("authoritative learning progress runs", () => {
  it.each([null, undefined, 0, 1.2, -1, "", "01", "-1", "1e3", " 1 "])("rejects a noncanonical RPC epoch %j", epoch => {
    expect(isLearningProgressEpoch(epoch)).toBe(false);
    expect(() => parseLearningProgressSnapshot({ ...snapshot(), learning_progress_epoch: epoch }, "student", "course")).toThrow();
  });
  it("does not round bigint epochs through JavaScript numbers", () => {
    const epoch = "9007199254740993123456789";
    expect(parseLearningProgressSnapshot(snapshot(epoch), "student", "course").learning_progress_epoch).toBe(epoch);
    expect(compareLearningProgressEpoch(epoch, "9007199254740993123456788")).toBe(1);
  });
  it.each([
    { enrollment: { ...snapshot().enrollment, user_id: "other" } },
    { enrollment: { ...snapshot().enrollment, course_id: "other" } },
    { enrollment: { ...snapshot().enrollment, learning_progress_epoch: "1" } },
    { lesson_progress: [{ lesson_id: "lesson", user_id: "other", completed: true }] },
  ])("refuses a mismatched authoritative association %j", patch => {
    expect(() => parseLearningProgressSnapshot({ ...snapshot(), ...patch }, "student", "course")).toThrow();
  });
  it("invalidates all captured work when the school advances the run and rejects a late older snapshot", () => {
    const fence = new LearningProgressFence(); expect(fence.capture()).toBeNull();
    expect(fence.accept(run())).toBe(true); const old = fence.capture()!;
    expect(fence.accept(run("1"))).toBe(true); const fresh = fence.capture()!;
    expect(old.current()).toBe(false); expect(fresh.current()).toBe(true);
    expect(fence.accept(run("0"))).toBe(false); expect(fresh.current()).toBe(true);
    fence.invalidate(); expect(fresh.current()).toBe(false); expect(fence.capture()).toBeNull();
  });
  it("does not invalidate in-flight work for a confirmed refresh of the same run", () => {
    const fence = new LearningProgressFence(); fence.accept(run("1")); const captured = fence.capture()!;
    fence.accept({ ...run("1") }); expect(captured.current()).toBe(true);
  });
  it("sends only the captured expected epoch and never falls back to an unfenced writer", async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "LEARNING_PROGRESS_RESET" } });
    await expect(saveOwnLearningProgress(run(), "lesson", { completed: true })).rejects.toMatchObject({ message: "LEARNING_PROGRESS_RESET" });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("save_own_lesson_progress", {
      p_enrollment_id: "enrollment", p_lesson_id: "lesson", p_expected_epoch: "0", p_completed: true,
      p_video_position: null, p_video_duration: null, p_seconds: null,
    });
    mock.rpc.mockClear();
  });
  it("rejects a successful-looking mutation response for another generation", async () => {
    mock.rpc.mockResolvedValueOnce({ data: snapshot("1"), error: null });
    await expect(saveOwnLearningProgress(run(), "lesson", { completed: true })).rejects.toThrow("LEARNING_PROGRESS_RESET");
  });
});

describe("actual completion async reset races", () => {
  function fixture() {
    const fence = new LearningProgressFence(); fence.accept(run()); const captured = fence.capture()!;
    const state = { completed: new Set(["old-1", "old-2", "old-3", "old-4", "old-5", "old-6", "old-7", "old-8"]),
      inFlight: new Set<string>(), courseCompletionStarted: { value: false } };
    const deps = { isCurrent: captured.current, saveLessonTime: vi.fn().mockResolvedValue(undefined),
      upsertLessonProgress: vi.fn().mockResolvedValue({ error: null }), updateEnrollmentProgress: vi.fn().mockResolvedValue({ error: null }),
      handleCourseCompletion: vi.fn(), goToNextLesson: vi.fn(), onProgressUpdated: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() };
    return { fence, state, deps, execute: () => markLessonProgress({ lessonId: "new", userId: "student", enrollmentId: "enrollment", totalLessons: 10, autoAdvance: true, state, deps }) };
  }
  it("a completion response delayed across reset cannot restore the previous 80 percent or navigate", async () => {
    const f = fixture(), response = deferred<{ error: null }>(); f.deps.upsertLessonProgress.mockReturnValue(response.promise);
    const operation = f.execute(); await vi.waitFor(() => expect(f.deps.upsertLessonProgress).toHaveBeenCalledOnce());
    f.fence.accept(run("1")); response.resolve({ error: null });
    expect(await operation).toEqual({ ok: false, reason: "progress_reset" });
    expect(f.state.completed.size).toBe(8); expect(f.state.completed.has("new")).toBe(false);
    expect(f.deps.updateEnrollmentProgress).not.toHaveBeenCalled(); expect(f.deps.onProgressUpdated).not.toHaveBeenCalled();
    expect(f.deps.goToNextLesson).not.toHaveBeenCalled(); expect(f.deps.handleCourseCompletion).not.toHaveBeenCalled();
  });
  it("reset during pending time save prevents even the later lesson write", async () => {
    const f = fixture(), response = deferred<void>(); f.deps.saveLessonTime.mockReturnValue(response.promise);
    const operation = f.execute(); f.fence.accept(run("1")); response.resolve();
    expect(await operation).toEqual({ ok: false, reason: "progress_reset" });
    expect(f.deps.upsertLessonProgress).not.toHaveBeenCalled();
  });
  it("reset after lesson write but before enrollment acknowledgement cannot commit local state", async () => {
    const f = fixture(), response = deferred<{ error: null }>(); f.deps.updateEnrollmentProgress.mockReturnValue(response.promise);
    const operation = f.execute(); await vi.waitFor(() => expect(f.deps.updateEnrollmentProgress).toHaveBeenCalledOnce());
    f.fence.accept(run("1")); response.resolve({ error: null });
    expect(await operation).toEqual({ ok: false, reason: "progress_reset" });
    expect(f.deps.onProgressUpdated).not.toHaveBeenCalled(); expect(f.deps.goToNextLesson).not.toHaveBeenCalled();
  });
});

describe("two dashboard data sources", () => {
  it("does not restore an older/untagged offline cache after a new server generation was confirmed", () => {
    const known = new Map([["enrollment", "1"]]);
    expect(isDashboardCachedProgressCurrent([{ learningEnrollmentId: "enrollment", learningProgressEpoch: "0" }], known)).toBe(false);
    expect(isDashboardCachedProgressCurrent([{}], known)).toBe(false);
    expect(isDashboardCachedProgressCurrent([{ learningEnrollmentId: "enrollment", learningProgressEpoch: "1" }], known)).toBe(true);
  });
  it("late pre-reset heavy load cannot overwrite the fresh snapshot from another request", async () => {
    const old = deferred<{ id: string; learning_progress_epoch: string }[]>();
    let known = new Map<string, string>(), displayed = 80;
    const heavy = old.promise.then(rows => { const accepted = acceptDashboardProgressEpochs(rows, known); if (accepted) { known = accepted; displayed = 80; } });
    known = acceptDashboardProgressEpochs([{ id: "enrollment", learning_progress_epoch: "1" }], known)!; displayed = 0;
    old.resolve([{ id: "enrollment", learning_progress_epoch: "0" }]); await heavy;
    expect(displayed).toBe(0); expect(known.get("enrollment")).toBe("1");
  });
  it("rejects missing epochs instead of adopting untagged cache/progress into the current run", () => {
    expect(acceptDashboardProgressEpochs([{ id: "enrollment" }], new Map([["enrollment", "1"]]))).toBeNull();
  });
});
