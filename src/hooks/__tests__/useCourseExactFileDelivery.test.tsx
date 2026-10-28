import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CopiedCourseExactFileLease, FrozenCourseFileDelivery } from "@/lib/courseExactFileDelivery";
import { useCourseExactFileDelivery, type CourseExactFileViewScope } from "../useCourseExactFileDelivery";

const mocked = vi.hoisted(() => ({ actor: "00000000-0000-4000-8000-000000000001", revision: 1,
  listeners: new Set<() => void>(), readContext: vi.fn(), readBytes: vi.fn() }));
vi.mock("@/api/courseExactFileDelivery", () => ({ courseExactFileGateway: { readContext: mocked.readContext, readBytes: mocked.readBytes } }));
vi.mock("@/utils/courseCache", () => ({
  captureOfflineAuthRevision: () => mocked.revision,
  captureOfflineContext: () => ({ actorId: mocked.actor, revision: mocked.revision }),
  subscribeOfflineAuthRevision: (listener: () => void) => { mocked.listeners.add(listener); return () => mocked.listeners.delete(listener); },
}));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = (): CourseExactFileViewScope => ({ actorId: id(1), organizationId: id(2), courseId: id(3), referenceKind: "course_document", referenceId: id(4), accessMode: "learner", purpose: "preview", effectiveUserId: id(1), authRevision: 1 });
// The gateway protocol is tested separately; the hook observes only this discriminant and an opaque lease.
const frozen = { mode: "frozen_required", state: "bytes_sealed" } as FrozenCourseFileDelivery;
function lease(tag: string): CopiedCourseExactFileLease {
  return { url: `blob:${tag}`, mime: "application/pdf", previewKind: "pdf", binding: {} as CopiedCourseExactFileLease["binding"], release: vi.fn() };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
beforeEach(() => {
  mocked.actor = id(1); mocked.revision = 1; mocked.listeners.clear(); mocked.readContext.mockReset(); mocked.readBytes.mockReset();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  mocked.readContext.mockResolvedValue(frozen);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("current actor/course/reference lease fences", () => {
  it("loads an exact lease and releases it when the view closes", async () => {
    const file = lease("one"); mocked.readBytes.mockResolvedValue(file);
    const { result, rerender } = renderHook(({ enabled }) => useCourseExactFileDelivery(scope(), enabled), { initialProps: { enabled: true } });
    await waitFor(() => expect(result.current.view.state).toBe("exact"));
    rerender({ enabled: false }); expect(result.current.view.state).toBe("idle"); expect(file.release).toHaveBeenCalledTimes(1);
  });
  it("keeps a server legacy result explicit and never requests frozen bytes for it", async () => {
    mocked.readContext.mockResolvedValue({ mode: "legacy", state: "legacy", binding: null });
    const { result } = renderHook(() => useCourseExactFileDelivery(scope(), true));
    await waitFor(() => expect(result.current.view.state).toBe("legacy")); expect(mocked.readBytes).not.toHaveBeenCalled();
  });
  it("holds failed or unavailable context without exposing a legacy result", async () => {
    mocked.readContext.mockRejectedValue(new Error("RPC absent"));
    const { result } = renderHook(() => useCourseExactFileDelivery(scope(), true));
    await waitFor(() => expect(result.current.view.state).toBe("held")); expect(mocked.readBytes).not.toHaveBeenCalled();
  });
  it("does not load for a stale auth epoch or a different effective learner", () => {
    const { result, rerender } = renderHook(({ value }) => useCourseExactFileDelivery(value, true), { initialProps: { value: { ...scope(), authRevision: 0 } } });
    expect(result.current.view.state).toBe("idle"); expect(mocked.readContext).not.toHaveBeenCalled();
    rerender({ value: { ...scope(), effectiveUserId: id(20) } }); expect(mocked.readContext).not.toHaveBeenCalled();
  });
  it("ignores the old A response after A → B → A", async () => {
    const oldA = deferred<FrozenCourseFileDelivery>(); const b = deferred<FrozenCourseFileDelivery>(); const newA = deferred<FrozenCourseFileDelivery>();
    mocked.readContext.mockReturnValueOnce(oldA.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(newA.promise);
    const current = lease("current-A"); mocked.readBytes.mockResolvedValue(current);
    const { result, rerender } = renderHook(({ value }) => useCourseExactFileDelivery(value, true), { initialProps: { value: scope() } });
    rerender({ value: { ...scope(), courseId: id(30) } }); rerender({ value: scope() });
    await act(async () => { oldA.resolve(frozen); b.resolve(frozen); }); expect(mocked.readBytes).not.toHaveBeenCalled();
    await act(async () => { newA.resolve(frozen); }); await waitFor(() => expect(result.current.view.state).toBe("exact"));
    expect(mocked.readBytes).toHaveBeenCalledTimes(1); expect(result.current.view.state === "exact" && result.current.view.lease.url).toBe("blob:current-A");
  });
  it("releases a late byte lease after the selected reference changes", async () => {
    const late = deferred<CopiedCourseExactFileLease>(); const old = lease("old-reference"); const fresh = lease("fresh-reference");
    mocked.readBytes.mockReturnValueOnce(late.promise).mockResolvedValueOnce(fresh);
    const { result, rerender } = renderHook(({ value }) => useCourseExactFileDelivery(value, true), { initialProps: { value: scope() } });
    await waitFor(() => expect(mocked.readBytes).toHaveBeenCalledTimes(1));
    rerender({ value: { ...scope(), referenceId: id(31) } }); await waitFor(() => expect(result.current.view.state).toBe("exact"));
    await act(async () => { late.resolve(old); }); expect(old.release).toHaveBeenCalledTimes(1);
    expect(result.current.view.state === "exact" && result.current.view.lease.url).toBe("blob:fresh-reference");
  });
  it("revokes the URL synchronously when the account/access epoch changes", async () => {
    const file = lease("revoked"); mocked.readBytes.mockResolvedValue(file);
    const { result } = renderHook(() => useCourseExactFileDelivery(scope(), true));
    await waitFor(() => expect(result.current.view.state).toBe("exact"));
    act(() => { mocked.revision++; for (const listener of mocked.listeners) listener(); expect(file.release).toHaveBeenCalledTimes(1); });
    expect(result.current.view.state).toBe("idle");
  });
  it("revokes while hidden and obtains current rights again on return", async () => {
    const file = lease("before-hide"); const fresh = lease("after-return"); mocked.readBytes.mockResolvedValueOnce(file).mockResolvedValueOnce(fresh);
    const { result } = renderHook(() => useCourseExactFileDelivery(scope(), true));
    await waitFor(() => expect(result.current.view.state).toBe("exact"));
    act(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current.view.state).toBe("idle"); expect(file.release).toHaveBeenCalledTimes(1);
    act(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(result.current.view.state === "exact" && result.current.view.lease.url).toBe("blob:after-return"));
    expect(mocked.readContext).toHaveBeenCalledTimes(2);
  });
});
