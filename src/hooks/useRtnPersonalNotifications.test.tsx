import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRtnPersonalNotifications } from "./useRtnPersonalNotifications";
const api = vi.hoisted(() => ({ getMyRtnNotifications: vi.fn(), markMyRtnNotificationsRead: vi.fn(), notifyRtnPersonalRefresh: vi.fn(), RTN_PERSONAL_REFRESH: "rtn-personal-refresh" }));
vi.mock("@/api/rtn-personal-notifications", () => api);
const scope = { organizationId: "11111111-1111-4111-8111-111111111111", actorId: "22222222-2222-4222-8222-222222222222" };
const page = (generation = 1) => ({ items: [], unread_count: 0, materialization_pending: false, subscription_generation: generation, subscription_enabled: true, has_more: false, next_before_sequence: null });
let visible = "visible";
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); visible = "visible"; Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible }); api.getMyRtnNotifications.mockResolvedValue(page()); api.markMyRtnNotificationsRead.mockResolvedValue({ read_event_ids: [], matched_count: 0 }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
describe("own RTN visible refresh", () => {
  it("does not read while hidden and checks on visibility return plus at most one periodic visible tick", async () => {
    visible = "hidden"; renderHook(() => useRtnPersonalNotifications(scope, true, false)); await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); }); expect(api.getMyRtnNotifications).not.toHaveBeenCalled();
    visible = "visible"; act(() => document.dispatchEvent(new Event("visibilitychange"))); await flush();
    expect(api.getMyRtnNotifications).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); }); expect(api.getMyRtnNotifications).toHaveBeenCalledTimes(2);
  });
  it("coalesces mount, focus and bell-open requests while a read is in flight", async () => {
    let finish!: (v: unknown) => void; api.getMyRtnNotifications.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = renderHook(({ open }) => useRtnPersonalNotifications(scope, true, open), { initialProps: { open: false } });
    view.rerender({ open: true }); act(() => window.dispatchEvent(new Event("focus")));
    expect(api.getMyRtnNotifications).toHaveBeenCalledTimes(1); finish(page()); await flush();
  });
  it("does not expose a previous actor response in the same organization", async () => {
    let finish!: (v: unknown) => void; api.getMyRtnNotifications.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(page(2));
    const view = renderHook(({ actorId }) => useRtnPersonalNotifications({ ...scope, actorId }, true, false), { initialProps: { actorId: scope.actorId } });
    view.rerender({ actorId: "33333333-3333-4333-8333-333333333333" }); await flush();
    finish({ ...page(), unread_count: 99 }); await flush(); expect(view.result.current.data?.unread_count).toBe(0); expect(view.result.current.data?.subscription_generation).toBe(2);
  });
  it("turns a failed refresh into unknown rather than retaining an old zero count", async () => {
    const view = renderHook(() => useRtnPersonalNotifications(scope, true, false)); await flush();
    api.getMyRtnNotifications.mockRejectedValue(new Error("Недоступно")); act(() => window.dispatchEvent(new Event("focus"))); await flush();
    expect(view.result.current.data).toBeUndefined(); expect(view.result.current.error).toBeInstanceOf(Error);
  });
  it("retains incomplete catch-up independently of unread zero and pages only by the server cursor", async () => {
    api.getMyRtnNotifications.mockResolvedValue({ ...page(), materialization_pending: true, has_more: true, next_before_sequence: 50 });
    const view = renderHook(() => useRtnPersonalNotifications(scope, true, false)); await flush();
    expect(view.result.current.data).toMatchObject({ unread_count: 0, materialization_pending: true });
    act(() => view.result.current.next()); await flush();
    expect(api.getMyRtnNotifications.mock.calls[1][1]).toEqual({ beforeSequence: 50, limit: 20 });
  });
  it("queues one newer-generation refresh instead of accepting an in-flight pre-save state", async () => {
    let finish!: (v: unknown) => void; api.getMyRtnNotifications.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(page(2));
    const view = renderHook(() => useRtnPersonalNotifications(scope, true, false));
    act(() => window.dispatchEvent(new CustomEvent(api.RTN_PERSONAL_REFRESH, { detail: { ...scope, generation: 2 } })));
    finish(page(1)); await flush(); await flush();
    expect(api.getMyRtnNotifications).toHaveBeenCalledTimes(2); expect(view.result.current.data?.subscription_generation).toBe(2);
  });
  it("marks only the supplied own canonical event IDs and performs no write when disabled", async () => {
    const view = renderHook(({ enabled }) => useRtnPersonalNotifications(scope, enabled, false), { initialProps: { enabled: true } }); await flush();
    await act(async () => { await view.result.current.mark(["event-a"]); });
    expect(api.markMyRtnNotificationsRead).toHaveBeenCalledWith(scope, ["event-a"]);
    view.rerender({ enabled: false }); await act(async () => { await view.result.current.mark(["event-b"]); });
    expect(api.markMyRtnNotificationsRead).toHaveBeenCalledTimes(1);
  });
});
