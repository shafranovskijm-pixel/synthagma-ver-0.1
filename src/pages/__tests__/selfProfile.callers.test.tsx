// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useStudentProfile } from "@/hooks/useStudentProfile";
import { OrgProfileTab } from "@/components/organization/tabs/OrgProfileTab";
const state = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111", email: "synthetic@example.invalid" },
  save: vi.fn(), success: vi.fn(), error: vi.fn(), invalidate: vi.fn(), profileLoads: [] as Promise<unknown>[],
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/api/selfProfile", () => ({ saveOwnProfile: (...args: unknown[]) => state.save(...args) }));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => state.success(...a), error: (...a: unknown[]) => state.error(...a) } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: (...a: unknown[]) => state.invalidate(...a) }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => queryKey[0] === "student-profile-page" ? { isSuccess: true, data: { full_name: "Current", phone: "", city: "", bio: "", avatar_url: null } } : { data: null },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from(table: string) { const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "is", "update", "order"]) chain[name] = () => chain;
    chain.maybeSingle = () => table === "profiles" ? state.profileLoads.shift() ?? Promise.resolve({ data: null, error: null }) : Promise.resolve({ data: {}, error: null });
    chain.single = () => Promise.resolve({ data: { branding: {} }, error: null });
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  }, rpc: () => Promise.resolve({ data: [], error: null }), auth: {},
} }));
vi.mock("@/hooks/useUrlNavigation", () => ({ useUrlQueryState: (_key: unknown, initial: unknown) => [initial, vi.fn()] }));
vi.mock("@/hooks/useDashboardSettings", () => ({ defaultMenuSettings: {}, useDashboardSettings: () => ({ menuSettings: {}, setMenuSettings: vi.fn(), reloadMenuSettings: vi.fn(), resetMenuSettings: vi.fn() }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ can: () => true, loading: false }) }));
vi.mock("@/hooks/useOrgTheme", () => ({ useOrgTheme: () => ({ theme: {}, saveTheme: vi.fn(), loaded: true, error: null, saving: false }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/organization/PartnerCabinet", () => ({ PartnerCabinet: () => null }));
vi.mock("@/components/ui/ThemePersonalization", () => ({ ThemePersonalization: () => null }));
vi.mock("@/components/organization/ProfileBrandingTab", () => ({ ProfileBrandingTab: () => null }));
vi.mock("@/components/organization/ProfileLoginBrandingTab", () => ({ ProfileLoginBrandingTab: () => null }));
vi.mock("@/components/organization/BrandingHints", () => ({ AvatarLocationHint: () => null, OrgIconLocationHint: () => null, HintBlock: () => null }));
vi.mock("@/components/organization/SettingsStudentDashboardTab", () => ({ SettingsStudentDashboardTab: () => null }));
vi.mock("@/components/organization/StaffManager", () => ({ StaffManager: () => null }));
vi.mock("@/components/organization/OrgShowcaseAndTelegramSection", () => ({ OrgShowcaseAndTelegramSection: () => null }));
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
function pending<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const profile = (full_name: string) => ({ data: { full_name, email: "synthetic@example.invalid", phone: "", avatar_url: "", vk_link: "", telegram_link: "", bio: "" }, error: null });
beforeEach(() => { state.user = { id: a, email: "synthetic@example.invalid" }; state.profileLoads = []; for (const fn of [state.save, state.success, state.error, state.invalidate]) fn.mockReset(); });
afterEach(cleanup);
it("SPS01 Own Save then admin preview cannot emit old success or invalidate current view", async () => {
  const saved = pending<void>(); state.save.mockReturnValue(saved.promise);
  const hook = renderHook(({ target, preview }) => useStudentProfile(target, preview, a), { initialProps: { target: a, preview: false } });
  let operation!: Promise<void>; act(() => { operation = hook.result.current.handleSaveProfile(); });
  hook.rerender({ target: b, preview: true });
  await act(async () => { saved.resolve(); await operation; });
  expect(state.success).not.toHaveBeenCalled(); expect(state.invalidate).not.toHaveBeenCalled(); expect(hook.result.current.profileSaving).toBe(false);
});
it("SPS02 A→preview B→A does not revive an old failed Save or clear a new busy state", async () => {
  const old = pending<void>(), current = pending<void>(); state.save.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const hook = renderHook(({ target, preview }) => useStudentProfile(target, preview, a), { initialProps: { target: a, preview: false } });
  let first!: Promise<void>; act(() => { first = hook.result.current.handleSaveProfile(); });
  hook.rerender({ target: b, preview: true }); hook.rerender({ target: a, preview: false });
  let second!: Promise<void>; act(() => { second = hook.result.current.handleSaveProfile(); });
  expect(state.save).toHaveBeenCalledTimes(2);
  await act(async () => { old.reject(new Error("late")); await first; });
  expect(state.error).not.toHaveBeenCalled(); expect(hook.result.current.profileSaving).toBe(true);
  await act(async () => { current.resolve(); await second; });
  expect(state.success).toHaveBeenCalledTimes(1); expect(hook.result.current.profileSaving).toBe(false);
});
it("SPS03 Captured old handler cannot start a write after view identity changes", async () => {
  const hook = renderHook(({ target, preview }) => useStudentProfile(target, preview, a), { initialProps: { target: a, preview: false } });
  const staleHandler = hook.result.current.handleSaveProfile;
  hook.rerender({ target: b, preview: true }); hook.rerender({ target: a, preview: false });
  await act(async () => { await staleHandler(); }); expect(state.save).not.toHaveBeenCalled();
});
it("SPO01 Delayed A1 read cannot overwrite fresh A3 after actor ABA", async () => {
  const oldA = pending<ReturnType<typeof profile>>(), other = pending<ReturnType<typeof profile>>(), newA = pending<ReturnType<typeof profile>>();
  state.profileLoads = [oldA.promise, other.promise, newA.promise];
  const view = render(<OrgProfileTab organizationId="synthetic-org" />);
  state.user = { id: b, email: "synthetic-b@example.invalid" }; view.rerender(<OrgProfileTab organizationId="synthetic-org" />);
  state.user = { id: a, email: "synthetic@example.invalid" }; view.rerender(<OrgProfileTab organizationId="synthetic-org" />);
  await act(async () => newA.resolve(profile("Fresh A3")));
  expect((screen.getByPlaceholderText("Иванов Иван Иванович") as HTMLInputElement).value).toBe("Fresh A3");
  await act(async () => { oldA.resolve(profile("Old A1")); other.resolve(profile("Old B")); });
  expect((screen.getByPlaceholderText("Иванов Иван Иванович") as HTMLInputElement).value).toBe("Fresh A3");
  state.save.mockResolvedValue({}); fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
  await waitFor(() => expect(state.save).toHaveBeenCalled());
  expect(state.save.mock.calls[0][1].full_name).toBe("Fresh A3");
});
it("SPO02 Organization transition while Save waits cannot acknowledge or clear new Save", async () => {
  state.profileLoads = [Promise.resolve(profile("One")), Promise.resolve(profile("Two"))];
  const old = pending<void>(), current = pending<void>(); state.save.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const view = render(<OrgProfileTab organizationId="org-one" />);
  await waitFor(() => expect((screen.getByPlaceholderText("Иванов Иван Иванович") as HTMLInputElement).value).toBe("One"));
  fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
  view.rerender(<OrgProfileTab organizationId="org-two" />);
  await waitFor(() => expect((screen.getByPlaceholderText("Иванов Иван Иванович") as HTMLInputElement).value).toBe("Two"));
  fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
  await act(async () => old.resolve());
  expect(state.success).not.toHaveBeenCalled(); expect((screen.getByRole("button", { name: /Сохранить/ }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => current.resolve()); expect(state.success).toHaveBeenCalledTimes(1);
});

it("SPU01 Unmounted Student Save emits no global acknowledgment or cache mutation", async () => {
  const saved = pending<void>(); state.save.mockReturnValue(saved.promise);
  const hook = renderHook(() => useStudentProfile(a, false, a));
  let operation!: Promise<void>; act(() => { operation = hook.result.current.handleSaveProfile(); });
  hook.unmount();
  await act(async () => { saved.resolve(); await operation; });
  expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled(); expect(state.invalidate).not.toHaveBeenCalled();
});
it("SPU02 Unmounted Org Save denial emits no global error", async () => {
  state.profileLoads = [Promise.resolve(profile("Own"))];
  const saved = pending<void>(); state.save.mockReturnValue(saved.promise);
  const view = render(<OrgProfileTab organizationId="synthetic-org" />);
  await waitFor(() => expect((screen.getByPlaceholderText("Иванов Иван Иванович") as HTMLInputElement).value).toBe("Own"));
  fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
  view.unmount(); await act(async () => saved.reject(new Error("late denial")));
  expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
});
