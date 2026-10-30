import { useLayoutEffect } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVideoProgress } from "../useVideoProgress";
import type { LearningProgressRun } from "@/lib/learningProgress";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), reset: vi.fn(), epoch: "0", position: 0 }));
vi.mock("@/lib/learningProgress", () => ({ fetchOwnLearningProgress: mocks.fetch, saveOwnLearningProgress: mocks.save }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

const run = (epoch: string): LearningProgressRun => ({ enrollmentId: "enrollment", userId: "student", courseId: "course", epoch, resetAt: epoch === "0" ? null : "2026-10-30T00:00:00Z" });
function authority(epoch: string) {
  const capturedRun = run(epoch);
  return { learningRun: capturedRun, onProgressReset: mocks.reset,
    captureProgress: () => ({ run: capturedRun, current: () => mocks.epoch === epoch }) };
}
function hidden() {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.epoch = "0"; mocks.position = 0;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  mocks.fetch.mockImplementation(async () => ({ enrollment: { id: "enrollment", user_id: "student", course_id: "course", status: "active", progress: 0, learning_progress_epoch: mocks.epoch },
    learning_progress_epoch: mocks.epoch, learning_progress_reset_at: mocks.epoch === "0" ? null : "2026-10-30T00:00:00Z",
    lesson_progress: [{ lesson_id: "video-a", completed: false, video_position: mocks.position, video_duration: 100 }] }));
  mocks.save.mockResolvedValue({}); mocks.reset.mockResolvedValue(false);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("video progress remains bound to its originating render/run", () => {
  it("still saves a current video position with its exact server epoch", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVideoProgress("student", "video-a", authority("0")));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    act(() => result.current.savePosition(80, 100));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith(run("0"), "video-a", { videoPosition: 80, videoDuration: 100 });
  });
  it("cannot relabel a retained immediate callback with a newer run", async () => {
    const { result, rerender } = renderHook(({ epoch }) => useVideoProgress("student", "video-a", authority(epoch)), { initialProps: { epoch: "0" } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const oldSave = result.current.savePositionImmediate;
    mocks.epoch = "1"; rerender({ epoch: "1" });
    await act(async () => { await oldSave(80, 100); });
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => { await result.current.savePositionImmediate(5, 100); });
    expect(mocks.save).toHaveBeenCalledWith(run("1"), "video-a", { videoPosition: 5, videoDuration: 100 });
  });
  it("does not save an old hidden-page position between new-run render and passive cleanup", async () => {
    const { result, rerender } = renderHook(({ epoch }) => {
      const value = useVideoProgress("student", "video-a", authority(epoch));
      useLayoutEffect(() => { if (epoch === "1") hidden(); }, [epoch]);
      return value;
    }, { initialProps: { epoch: "0" } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.savePosition(80, 100));
    mocks.epoch = "1"; rerender({ epoch: "1" });
    await act(async () => {});
    expect(mocks.save).not.toHaveBeenCalled();
    expect(result.current.savedPosition).toBe(0);
  });
  it("rejects old callbacks after a lesson A-to-B-to-A transition even when the textual scope key matches again", async () => {
    const { result, rerender } = renderHook(({ lesson }) => useVideoProgress("student", lesson, authority("0")), { initialProps: { lesson: "video-a" } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const oldImmediate = result.current.savePositionImmediate, oldDebounced = result.current.savePosition;
    rerender({ lesson: "video-b" }); rerender({ lesson: "video-a" });
    await act(async () => { oldDebounced(80, 100); await oldImmediate(80, 100); });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("hides the previous run's loaded80 percent position in the render before passive effects reset state", async () => {
    mocks.position = 80;
    const layoutPositions: { epoch: string; position: number }[] = [];
    const { result, rerender } = renderHook(({ epoch }) => {
      const value = useVideoProgress("student", "video-a", authority(epoch));
      useLayoutEffect(() => { layoutPositions.push({ epoch, position: value.savedPosition }); });
      return value;
    }, { initialProps: { epoch: "0" } });
    await waitFor(() => expect(result.current.savedPosition).toBe(80));
    mocks.epoch = "1"; mocks.position = 0; await act(async () => { rerender({ epoch: "1" }); });
    expect(layoutPositions.find(row => row.epoch === "1")?.position).toBe(0);
  });
  it("does not write after the owning video hook unmounts", async () => {
    const { result, unmount } = renderHook(() => useVideoProgress("student", "video-a", authority("0")));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const oldSave = result.current.savePositionImmediate;
    unmount(); await oldSave(80, 100);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
