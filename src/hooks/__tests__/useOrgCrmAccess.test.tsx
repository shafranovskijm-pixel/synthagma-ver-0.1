import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrgCrmAccess } from "../useOrgCrmAccess";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockImplementation(() => { throw new Error("Sales-only staff has no settings.read; profile organization_id is null"); });
  mocks.rpc.mockResolvedValue({ data: { id: "staff-org", subscription_plan: "professional", custom_enabled_categories: [] }, error: null });
});
afterEach(cleanup);

describe("CRM plan access through the limited core projection", () => {
  it("resolves the selected staff workspace even without profile organization or settings.read", async () => {
    const { result } = renderHook(() => useOrgCrmAccess("staff-org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ enabled: true, mailingEnabled: true, error: null });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_organization_core", { p_org_id: "staff-org" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["free", "start"])("preserves the existing CRM restriction for %s", async plan => {
    mocks.rpc.mockResolvedValue({ data: { id: "staff-org", subscription_plan: plan }, error: null });
    const { result } = renderHook(() => useOrgCrmAccess("staff-org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.mailingEnabled).toBe(plan === "start");
  });

  it.each(["standard", "professional", "maximum"])("honours the existing CRM entitlement for %s", async plan => {
    mocks.rpc.mockResolvedValue({ data: { id: "staff-org", subscription_plan: plan }, error: null });
    const { result } = renderHook(() => useOrgCrmAccess("staff-org"));
    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it.each([
    { data: null, error: null },
    { data: { id: "another-org", subscription_plan: "professional" }, error: null },
    { data: { id: "staff-org", subscription_plan: "unknown" }, error: null },
    { data: { id: "staff-org", subscription_plan: "professional", custom_enabled_categories: "invalid" }, error: null },
    { data: null, error: new Error("network") },
  ])("reports an unconfirmed plan as an error, never as a free plan: %j", async response => {
    mocks.rpc.mockResolvedValue(response);
    const { result } = renderHook(() => useOrgCrmAccess("staff-org"));
    await waitFor(() => expect(result.current.error).toContain("Не удалось проверить"));
    expect(result.current.enabled).toBe(false);
    expect(result.current.mailingEnabled).toBe(false);
  });

  it("recovers through an explicit retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("network") });
    const { result } = renderHook(() => useOrgCrmAccess("staff-org"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    await act(async () => { await result.current.refresh(); });
    expect(result.current.enabled).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("never leaks the previous organization's entitlement into a new workspace", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.rpc.mockImplementation((_name, { p_org_id }) => p_org_id === "old"
      ? new Promise(resolve => { resolveOld = resolve; })
      : Promise.resolve({ data: { id: "new", subscription_plan: "free" }, error: null }));
    const { result, rerender } = renderHook(({ org }) => useOrgCrmAccess(org), { initialProps: { org: "old" } });
    rerender({ org: "new" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { resolveOld({ data: { id: "old", subscription_plan: "maximum" }, error: null }); });
    expect(result.current.enabled).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("does not query an unresolved organization", () => {
    const { result } = renderHook(() => useOrgCrmAccess(null));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
  });
});
