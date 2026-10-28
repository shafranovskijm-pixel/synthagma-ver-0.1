import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCourseFileDeliveryMode } from "../useCourseFileDeliveryMode";
const mocks = vi.hoisted(() => ({ actor: "00000000-0000-4000-8000-000000000001", revision: 1, read: vi.fn(), listeners: new Set<() => void>() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.actor } }) }));
vi.mock("@/api/courseFileConsumer", () => ({ readCourseFileDeliveryMode: mocks.read }));
vi.mock("@/utils/courseCache", () => ({ captureOfflineAuthRevision: () => mocks.revision, captureOfflineContext: () => ({ actorId: mocks.actor, revision: mocks.revision }), subscribeOfflineAuthRevision: (listener: () => void) => { mocks.listeners.add(listener); return () => mocks.listeners.delete(listener); } }));
const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const scope = { courseId: id(3), organizationId: id(2), accessMode: "learner" as const };
const context = { schema_version: 1, actor_id: id(1), organization_id: id(2), course_id: id(3), access_mode: "learner", mode: "legacy", state: "legacy", cohort: null };
function pending() { let resolve!: (value: any) => void; const promise = new Promise<any>(yes => { resolve = yes; }); return { promise, resolve }; }
beforeEach(() => { mocks.actor = id(1); mocks.revision = 1; mocks.read.mockReset(); mocks.listeners.clear(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("course mode lifecycle", () => {
  it("does not read for missing org or a foreign effective learner", () => {
    const hook = renderHook(({ value }) => useCourseFileDeliveryMode(value), { initialProps: { value: { ...scope, organizationId: "", effectiveUserId: id(1) } } });
    expect(hook.result.current.view.state).toBe("idle"); hook.rerender({ value: { ...scope, effectiveUserId: id(9) } }); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("can discover the authoritative course organization without guessing from a profile", async () => {
    mocks.read.mockResolvedValue(context); const hook = renderHook(() => useCourseFileDeliveryMode({ ...scope, organizationId: null }));
    await waitFor(() => expect(hook.result.current.view.state).toBe("legacy"));
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ actorId: id(1), courseId: id(3), organizationId: null, accessMode: "learner" }), expect.any(AbortSignal));
    expect(hook.result.current.view.state === "legacy" && hook.result.current.view.context.organization_id).toBe(id(2));
  });
  it("keeps missing RPC held rather than legacy", async () => {
    mocks.read.mockRejectedValue(new Error("RPC absent")); const hook = renderHook(() => useCourseFileDeliveryMode(scope));
    await waitFor(() => expect(hook.result.current.view.state).toBe("held"));
  });
  it("ignores old A and B answers after A to B to A", async () => {
    const a1 = pending(), b = pending(), a3 = pending(); mocks.read.mockReturnValueOnce(a1.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(a3.promise);
    const hook = renderHook(({ value }) => useCourseFileDeliveryMode(value), { initialProps: { value: scope } });
    hook.rerender({ value: { ...scope, courseId: id(8) } }); hook.rerender({ value: scope });
    await act(async () => { a1.resolve(context); b.resolve(context); }); expect(hook.result.current.view.state).not.toBe("legacy");
    await act(async () => { a3.resolve(context); }); await waitFor(() => expect(hook.result.current.view.state).toBe("legacy"));
  });
  it("hides old legacy immediately on auth invalidation and holds denied reread", async () => {
    // Both store subscription and scope invalidation can cause a denied reread.
    // Every later operation remains a Promise rejection; an exhausted vi.fn() is not the SDK contract.
    mocks.read.mockRejectedValue(new Error("blocked")).mockResolvedValueOnce(context); const hook = renderHook(() => useCourseFileDeliveryMode(scope));
    await waitFor(() => expect(hook.result.current.view.state).toBe("legacy"));
    act(() => { mocks.revision++; for (const listener of mocks.listeners) listener(); }); expect(hook.result.current.view.state).not.toBe("legacy");
    await waitFor(() => expect(hook.result.current.view.state).toBe("held"));
    expect(mocks.read.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mocks.read.mock.results.every(result => result.type === "return" && typeof result.value?.then === "function")).toBe(true);
  });
  it("aborts on close and rejects the late legacy answer", async () => {
    const late = pending(); mocks.read.mockReturnValue(late.promise); const hook = renderHook(({ enabled }) => useCourseFileDeliveryMode(scope, enabled), { initialProps: { enabled: true } });
    const signal = mocks.read.mock.calls[0][1] as AbortSignal; hook.rerender({ enabled: false }); expect(signal.aborted).toBe(true);
    await act(async () => { late.resolve(context); }); expect(hook.result.current.view.state).toBe("idle");
  });
});
