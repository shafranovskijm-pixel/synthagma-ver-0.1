import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../useAuth";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), rpc: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn(),
  startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn(), signOut: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: {
    getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange,
    startAutoRefresh: mocks.startAutoRefresh, stopAutoRefresh: mocks.stopAutoRefresh,
    signOut: mocks.signOut,
  },
  rpc: mocks.rpc,
} }));

const session = { user: { id: "existing-learner", email: "learner@example.com" } } as Session;
let onAuthChange: (event: AuthChangeEvent, session: Session | null) => void;
let visibility: DocumentVisibilityState;
let currentTime: number;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolver => { resolve = resolver; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  visibility = "visible";
  currentTime = 10_000;
  vi.spyOn(Date, "now").mockImplementation(() => currentTime);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  mocks.getSession.mockResolvedValue({ data: { session }, error: null });
  mocks.rpc.mockResolvedValue({ data: "student", error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.onAuthStateChange.mockImplementation(callback => {
    onAuthChange = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderLearner() {
  const hook = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(hook.result.current.userRole).toBe("student");
  return hook;
}

describe("effective staff role refresh", () => {
  it("updates an existing learner to the server's organization role on window focus", async () => {
    const { result } = await renderLearner();
    mocks.rpc.mockResolvedValue({ data: "organization", error: null });
    act(() => window.dispatchEvent(new Event("focus")));

    await waitFor(() => expect(result.current.userRole).toBe("organization"));
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenLastCalledWith("get_user_role", { _user_id: "existing-learner" });
    expect(localStorage.getItem("user_role")).toBe("organization");
  });

  it("does not refresh while hidden and checks access when the tab becomes visible", async () => {
    const { result } = await renderLearner();
    mocks.rpc.mockResolvedValue({ data: "organization", error: null });
    visibility = "hidden";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.stopAutoRefresh).toHaveBeenCalled();
    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    await waitFor(() => expect(result.current.userRole).toBe("organization"));
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });

  it("coalesces focus and visibility events and throttles further events for five seconds", async () => {
    await renderLearner();
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
    currentTime += 5_001;
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(3));
  });

  it("does not restore permissions from a role response that arrives after logout", async () => {
    const { result } = await renderLearner();
    const role = deferred<{ data: string; error: null }>();
    mocks.rpc.mockReturnValueOnce(role.promise);
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));

    act(() => onAuthChange("SIGNED_OUT", null));
    await act(async () => { role.resolve({ data: "organization", error: null }); });
    expect(result.current.user).toBeNull();
    expect(result.current.userRole).toBeNull();
    expect(localStorage.getItem("user_role")).toBeNull();
  });

  it("does not restore a session from a focus read that finishes after logout", async () => {
    const { result } = await renderLearner();
    const sessionRead = deferred<{ data: { session: Session }; error: null }>();
    mocks.getSession.mockReturnValueOnce(sessionRead.promise);
    act(() => window.dispatchEvent(new Event("focus")));
    act(() => onAuthChange("SIGNED_OUT", null));

    await act(async () => { sessionRead.resolve({ data: { session }, error: null }); });
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.userRole).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("invalidates a pending role response when the public signOut action completes without an SDK event", async () => {
    const { result } = await renderLearner();
    const role = deferred<{ data: string; error: null }>();
    mocks.rpc.mockReturnValueOnce(role.promise);
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));

    await act(async () => { await result.current.signOut(); });
    await act(async () => { role.resolve({ data: "organization", error: null }); });
    expect(result.current.userRole).toBeNull();
    expect(localStorage.getItem("user_role")).toBeNull();
  });

  it("preserves the current role on a transient role lookup error instead of assuming staff access", async () => {
    const { result } = await renderLearner();
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Network failure" } });
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(result.current.userRole).toBe("student");
    expect(localStorage.getItem("user_role")).toBe("student");
  });

  it("shares an in-flight lookup with explicit refreshUserRole callers", async () => {
    const { result } = await renderLearner();
    const role = deferred<{ data: string; error: null }>();
    mocks.rpc.mockReturnValueOnce(role.promise);
    let first!: Promise<string | null>;
    let second!: Promise<string | null>;
    act(() => {
      first = result.current.refreshUserRole();
      second = result.current.refreshUserRole();
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    await act(async () => { role.resolve({ data: "organization", error: null }); });
    await expect(first).resolves.toBe("organization");
    await expect(second).resolves.toBe("organization");
  });

  it("removes return listeners when the provider unmounts", async () => {
    const { unmount } = await renderLearner();
    unmount();
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
