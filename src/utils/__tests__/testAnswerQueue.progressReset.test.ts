import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueTestSubmission, flushPendingSubmissions, listPendingSubmissions } from "../testAnswerQueue";
import { offlineMemoryStorage } from "@/test/offlineMemoryStorage";
const mock = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: mock.getSession }, rpc: mock.rpc } }));
vi.mock("@/lib/learningProgress", async original => ({ ...await original<typeof import("@/lib/learningProgress")>(), fetchOwnLearningProgress: mock.snapshot }));
const payload = () => ({ attemptId: "attempt", userId: "student", courseId: "course", enrollmentId: "enrollment", learningProgressEpoch: "0",
  lessonId: "lesson", answers: { question: 1 }, shownQuestionIds: ["question"] });
let storage: ReturnType<typeof offlineMemoryStorage>;
beforeEach(() => {
  vi.clearAllMocks(); storage = offlineMemoryStorage(); vi.stubGlobal("indexedDB", storage.factory);
  mock.getSession.mockResolvedValue({ data: { session: { user: { id: "student" } } } });
  mock.snapshot.mockResolvedValue({ enrollment: { id: "enrollment" }, learning_progress_epoch: "0" });
  mock.rpc.mockResolvedValue({ data: { passed: true, learning_progress_epoch: "0" }, error: null });
});
afterEach(() => vi.unstubAllGlobals());
describe("queued answers belong to their original learning run", () => {
  it("retains untagged old owned answers without adopting the new run or dispatching", async () => {
    const row = { ...payload(), id: "legacy", learningProgressEpoch: undefined, createdAt: 1, attempts: 0 };
    storage.rows("sigma-test-queue", "pending").set("legacy", row);
    expect(await flushPendingSubmissions()).toEqual({ sent: 0, failed: 1 });
    expect(mock.snapshot).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled();
    expect((await listPendingSubmissions())[0].answers).toEqual({ question: 1 });
  });
  it("quarantines old queued answers after a school reset and preserves them", async () => {
    await enqueueTestSubmission(payload());
    mock.snapshot.mockResolvedValue({ enrollment: { id: "enrollment" }, learning_progress_epoch: "1" });
    expect(await flushPendingSubmissions()).toEqual({ sent: 0, failed: 0 });
    expect(mock.rpc).not.toHaveBeenCalled();
    expect((await listPendingSubmissions())[0]).toMatchObject({ learningProgressEpoch: "0", superseded: true, answers: { question: 1 } });
    await flushPendingSubmissions(); expect(mock.snapshot).toHaveBeenCalledTimes(1);
  });
  it("cannot resurrect progress when reset commits between epoch read and submission", async () => {
    await enqueueTestSubmission(payload());
    const synced = vi.fn(); window.addEventListener("test-submission-synced", synced);
    try {
      mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "LEARNING_PROGRESS_RESET" } });
      expect(await flushPendingSubmissions()).toEqual({ sent: 0, failed: 0 });
      expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("submit_test_attempt_at_epoch", { p_attempt_id: "attempt", p_answers: { question: 1 }, p_expected_epoch: "0" });
      expect(synced).not.toHaveBeenCalled(); expect((await listPendingSubmissions())[0].superseded).toBe(true);
    } finally { window.removeEventListener("test-submission-synced", synced); }
  });
  it("submits the same original attempt exactly with its confirmed epoch", async () => {
    await enqueueTestSubmission(payload());
    expect(await flushPendingSubmissions()).toEqual({ sent: 1, failed: 0 });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("submit_test_attempt_at_epoch", { p_attempt_id: "attempt", p_answers: { question: 1 }, p_expected_epoch: "0" });
    expect(await listPendingSubmissions()).toEqual([]);
  });
});
