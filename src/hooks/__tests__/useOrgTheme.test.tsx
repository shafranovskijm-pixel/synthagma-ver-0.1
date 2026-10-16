import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrgTheme } from "../useOrgTheme";
import { DEFAULT_THEME_PREFERENCES, readDeviceThemePreferences } from "@/lib/themePreferences";
const mocks = vi.hoisted(() => ({ read: vi.fn(), rpc: vi.fn(), realtime: null as any }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }) }), rpc: mocks.rpc,
  channel: () => ({ on: (_event: unknown, _filter: unknown, handler: any) => { mocks.realtime = handler; return { subscribe: () => ({}) }; } }),
  removeChannel: vi.fn(),
} }));
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  mocks.read.mockResolvedValue({ data: { branding: { orgTheme: { enforce: false } } }, error: null });
});
afterEach(async () => { cleanup(); await Promise.resolve(); });
describe("organization theme synchronization", () => {
  it("applies confirmed patches to all consumers and preserves fields from rapid saves", async () => {
    let saved: any = { ...DEFAULT_THEME_PREFERENCES, enforce: true };
    mocks.rpc.mockImplementation(async (_name, { p_patch }) => { saved = { ...saved, ...p_patch }; return { data: saved, error: null }; });
    const a = renderHook(() => useOrgTheme("org"));
    const b = renderHook(() => useOrgTheme("org"));
    await waitFor(() => expect(a.result.current.loaded && b.result.current.loaded).toBe(true));
    await act(async () => { await Promise.all([a.result.current.saveTheme({ density: "compact" }), b.result.current.saveTheme({ animLevel: "none" })]); });
    expect(a.result.current.theme).toMatchObject({ density: "compact", animLevel: "none", enforce: true });
    expect(b.result.current.theme).toEqual(a.result.current.theme);
    expect(a.result.current.saving || b.result.current.saving).toBe(false);
    expect(mocks.rpc.mock.calls.map(([, args]) => args.p_patch)).toEqual([{ density: "compact" }, { animLevel: "none" }]);
    expect(readDeviceThemePreferences()).toMatchObject({ density: "compact", animLevel: "none" });
  });

  it("keeps personal appearance and the last confirmed theme when save is rejected", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
    const hook = renderHook(() => useOrgTheme("org"));
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    await act(async () => { await expect(hook.result.current.saveTheme({ enforce: true, density: "compact" })).rejects.toThrow("Не удалось сохранить"); });
    expect(hook.result.current.theme.enforce).toBe(false);
    expect(readDeviceThemePreferences()).toEqual(DEFAULT_THEME_PREFERENCES);
  });

  it("does not replace a newer save with a delayed initial fetch", async () => {
    let finishRead: (value: unknown) => void = () => {};
    mocks.read.mockReturnValue(new Promise(resolve => { finishRead = resolve; }));
    mocks.rpc.mockResolvedValue({ data: { enforce: true, radius: "soft" }, error: null });
    const hook = renderHook(() => useOrgTheme("org"));
    await act(async () => { await hook.result.current.saveTheme({ radius: "soft" }); });
    await act(async () => { finishRead({ data: { branding: { orgTheme: { radius: "sharp" } } }, error: null }); });
    expect(hook.result.current.theme.radius).toBe("soft");
  });

  it("reports unavailable initial settings without applying a default shared theme", async () => {
    mocks.read.mockResolvedValue({ data: null, error: { message: "denied" } });
    const hook = renderHook(() => useOrgTheme("org"));
    await waitFor(() => expect(hook.result.current.error).toContain("Не удалось загрузить"));
    expect(hook.result.current.loaded).toBe(false);
    expect(localStorage.getItem("org-theme-enforce-active")).toBeNull();
  });

  it("does not apply a late save from the previous organization or leave the new one stuck saving", async () => {
    let finishOld: (value: unknown) => void = () => {};
    mocks.rpc.mockImplementation((_name, { p_organization_id }) => p_organization_id === "old"
      ? new Promise(resolve => { finishOld = resolve; })
      : Promise.resolve({ data: { enforce: true, density: "comfortable" }, error: null }));
    const hook = renderHook(({ org }) => useOrgTheme(org), { initialProps: { org: "old" } });
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    let pending: Promise<unknown>;
    await act(async () => { pending = hook.result.current.saveTheme({ density: "compact" }); });
    hook.rerender({ org: "new" });
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    await act(async () => { await hook.result.current.saveTheme({ density: "comfortable" }); });
    expect(hook.result.current.saving).toBe(false);
    await act(async () => { finishOld({ data: { enforce: true, density: "compact" }, error: null }); await pending; });
    expect(hook.result.current.theme.density).toBe("comfortable");
    expect(readDeviceThemePreferences().density).toBe("comfortable");
    expect(hook.result.current.saving).toBe(false);
  });

  it("rejects a response that fails to confirm the edited value", async () => {
    mocks.rpc.mockResolvedValue({ data: { enforce: true, density: "default" }, error: null });
    const hook = renderHook(() => useOrgTheme("org"));
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    await act(async () => { await expect(hook.result.current.saveTheme({ density: "compact" })).rejects.toThrow("Не удалось сохранить"); });
    expect(hook.result.current.theme.enforce).toBe(false);
  });
});
