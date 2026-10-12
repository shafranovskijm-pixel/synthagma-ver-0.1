import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrgSmtp } from "../useOrgSmtp";

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), invoke: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
    upsert: () => ({ select: () => ({ single: mocks.save }) }),
  }),
  functions: { invoke: mocks.invoke },
} }));
const settings = { host: "mail.example.org", port: 465, username: "sender@example.org", from_email: "sender@example.org", encryption: "ssl" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue({ data: null, error: null });
  mocks.save.mockResolvedValue({ data: { organization_id: "org" }, error: null });
  mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
});
afterEach(cleanup);

describe("legacy SMTP save and test results", () => {
  it("recognizes the server's success field and reports SMTP acceptance", async () => {
    const { result } = renderHook(() => useOrgSmtp("org"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { expect(await result.current.testConnection()).toBe(true); });
    expect(mocks.invoke).toHaveBeenCalledWith("test-org-smtp", { body: { organizationId: "org" } });
    expect(mocks.success).toHaveBeenCalledWith("Тестовое письмо принято SMTP-сервером");
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it.each([{ success: false }, { ok: true }, {}])("does not turn an unconfirmed SMTP result into success (%j)", async data => {
    mocks.invoke.mockResolvedValue({ data, error: null });
    const { result } = renderHook(() => useOrgSmtp("org"));
    await act(async () => { expect(await result.current.testConnection()).toBe(false); });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
  });

  it("does not claim settings were saved when the returned row is absent", async () => {
    mocks.save.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useOrgSmtp("org"));
    await act(async () => { expect(await result.current.save(settings)).toBe(false); });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
    expect(result.current.saving).toBe(false);
  });

  it("ignores the old organization's test result after switching workspaces", async () => {
    let complete!: (value: unknown) => void;
    mocks.invoke.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const { result, rerender } = renderHook(({ org }) => useOrgSmtp(org), { initialProps: { org: "org" } });
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.testConnection(); });
    rerender({ org: "new-org" });
    await act(async () => { complete({ data: { success: true }, error: null }); expect(await pending).toBe(false); });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(result.current.testing).toBe(false);
  });
});
