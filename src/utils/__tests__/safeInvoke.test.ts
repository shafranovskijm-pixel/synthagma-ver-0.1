import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "../safeInvoke";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toastError: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

describe("safeInvoke retry contract", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.invoke.mockReset();
    mocks.toastError.mockReset();
    sessionStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "setTimeout");
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(["returned", "thrown"] as const)("makes one mutation request on a %s network error when retry=false", async (delivery) => {
    // Use the real detector: this TypeError is a recognised network failure.
    const error = new TypeError("Failed to fetch");
    if (delivery === "returned") mocks.invoke.mockResolvedValue({ data: null, error });
    else mocks.invoke.mockRejectedValue(error);

    const result = await safeInvoke("create-package", {
      body: { groupId: "group-1" }, headers: { "X-Revision": "v16" }, retry: false,
    });
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain("Сетевой запрос заблокирован");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("create-package", {
      body: { groupId: "group-1" }, headers: { "X-Revision": "v16" },
    });
    expect(mocks.invoke.mock.calls[0][1]).not.toHaveProperty("retry");
    // jsdom may schedule storage-event timers when the network warning is marked.
    // Neither of the retry delays may be scheduled for the mutation.
    const delays = vi.mocked(setTimeout).mock.calls.map((call) => call[1]);
    expect(delays).not.toContain(2000);
    expect(delays).not.toContain(5000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, true])("keeps the default three attempts and 2s/5s delays with retry=%s", async (retry) => {
    mocks.invoke.mockResolvedValue({ data: null, error: new TypeError("Failed to fetch") });
    const promise = safeInvoke("read-preview", { body: {}, ...(retry === undefined ? {} : { retry }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4999);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(3);
    expect((await promise).error).toBeInstanceOf(Error);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.invoke).toHaveBeenCalledTimes(3);
  });

  it("keeps retry recovery for callers that omit options", async () => {
    mocks.invoke.mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ data: { ready: true }, error: null });
    const promise = safeInvoke<{ ready: boolean }>("read-preview");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toEqual({ data: { ready: true }, error: null });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("returns a successful retry=false response unchanged without timers", async () => {
    mocks.invoke.mockResolvedValue({ data: { batchId: "batch-1" }, error: null });
    await expect(safeInvoke("create-package", { retry: false })).resolves.toEqual({ data: { batchId: "batch-1" }, error: null });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry non-network failures with the default policy", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("Permission denied") });
    const result = await safeInvoke("read-preview");
    expect(result.error?.message).toBe("Permission denied");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
