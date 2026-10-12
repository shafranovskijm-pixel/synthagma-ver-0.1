import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultMenuSettings, useDashboardSettings } from "../useDashboardSettings";

const mocks = vi.hoisted(() => ({
  core: { menu_settings: { showStats: true } } as { menu_settings: Record<string, unknown> },
  single: vi.fn(), update: vi.fn(), invalidateQueries: vi.fn(),
}));
vi.mock("@/hooks/useOrganizationCore", () => ({ useOrganizationCore: () => ({ data: mocks.core }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => mocks }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  update: (...args: unknown[]) => {
    mocks.update(...args);
    return { eq: () => ({ select: () => ({ single: mocks.single }) }) };
  },
}) } }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.core = { menu_settings: { showStats: true } };
  mocks.single.mockResolvedValue({ data: { id: "org" }, error: null });
  mocks.invalidateQueries.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("confirmed organization menu persistence", () => {
  it.each([
    { data: null, error: { message: "permission denied" } },
    { data: null, error: null },
  ])("preserves current settings when reset does not confirm a changed row (%j)", async response => {
    mocks.single.mockResolvedValue(response);
    const { result } = renderHook(() => useDashboardSettings("org"));
    expect(result.current.menuSettings.showStats).toBe(true);
    let saved: boolean | undefined;
    await act(async () => { saved = await result.current.resetMenuSettings(); });
    expect(saved).toBe(false);
    expect(result.current.menuSettings.showStats).toBe(true);
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it("changes the visible menu only after the server confirms a reset", async () => {
    let resolve!: (value: unknown) => void;
    mocks.single.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result } = renderHook(() => useDashboardSettings("org"));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.resetMenuSettings(); });
    expect(result.current.menuSettings.showStats).toBe(true);
    await act(async () => {
      resolve({ data: { id: "org" }, error: null });
      expect(await pending).toBe(true);
    });
    expect(result.current.menuSettings).toEqual(defaultMenuSettings);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["org-core", "org"] });
  });

  it.each([
    { data: null, error: { message: "permission denied" } },
    { data: null, error: null },
  ])("retains the local migration source after an unconfirmed save (%j)", async response => {
    mocks.core = { menu_settings: {} };
    mocks.single.mockResolvedValue(response);
    const saved = JSON.stringify({ showStats: true });
    localStorage.setItem("orgMenuSettings", saved);
    renderHook(() => useDashboardSettings("org"));
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(localStorage.getItem("orgMenuSettings")).toBe(saved);
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it("removes the local migration source after confirmed persistence", async () => {
    mocks.core = { menu_settings: {} };
    localStorage.setItem("orgMenuSettings", JSON.stringify({ showStats: true }));
    const { result } = renderHook(() => useDashboardSettings("org"));
    await waitFor(() => expect(localStorage.getItem("orgMenuSettings")).toBeNull());
    expect(result.current.menuSettings.showStats).toBe(true);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["org-core", "org"] });
  });
});
