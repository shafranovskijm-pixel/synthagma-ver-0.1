import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANDROID_APP, RUSTORE_AVAILABILITY_URL, RUSTORE_PUBLIC_URL } from "@/constants/androidApp";
import {
  getVerifiedRuStoreAvailability,
  RUSTORE_MAX_CHECK_AGE_MS,
  useRuStoreAvailability,
} from "@/hooks/useRuStoreAvailability";

const now = Date.parse("2026-10-08T04:00:00.000Z");
const availability = (checkedAt = Date.now()) => ({
  schemaVersion: 1,
  packageName: ANDROID_APP.packageName,
  available: true,
  status: "available",
  url: RUSTORE_PUBLIC_URL,
  checkedAt: new Date(checkedAt).toISOString(),
});
const jsonResponse = (data: unknown, ok = true) => ({ ok, json: async () => data }) as Response;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("verified public RuStore listing", () => {
  it("accepts only the expected app with a recent positive check", () => {
    expect(getVerifiedRuStoreAvailability(availability(now - 60_000), now)).toEqual({
      url: RUSTORE_PUBLIC_URL,
      expiresAt: now - 60_000 + RUSTORE_MAX_CHECK_AGE_MS,
    });
  });

  it.each([
    ["pending moderation", { available: false, status: "pending" }],
    ["an inconclusive check", { status: "unknown" }],
    ["a truthy non-boolean value", { available: "true" }],
    ["another app", { packageName: "ru.example.other" }],
    ["another host", { url: "https://example.com/catalog/app/ru.sintagma.app" }],
    ["the developer console", { url: "https://console.rustore.ru/apps/2063766377/versions" }],
    ["a modified public URL", { url: `${RUSTORE_PUBLIC_URL}?redirect=other` }],
    ["another schema", { schemaVersion: 2 }],
    ["a missing timestamp", { checkedAt: undefined }],
    ["an invalid timestamp", { checkedAt: "not-a-date" }],
    ["a future check", { checkedAt: new Date(now + 1).toISOString() }],
    ["a stale check", { checkedAt: new Date(now - RUSTORE_MAX_CHECK_AGE_MS - 1).toISOString() }],
  ])("does not expose a link for %s", (_label, changes) => {
    expect(getVerifiedRuStoreAvailability({ ...availability(now), ...changes }, now)).toBeNull();
  });

  it.each([null, [], "available", 1])("rejects malformed payload %j", data => {
    expect(getVerifiedRuStoreAvailability(data, now)).toBeNull();
  });
});

describe("store availability lifecycle", () => {
  it("keeps the store link hidden until the availability response is verified", async () => {
    let resolveResponse: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { resolveResponse = resolve; }));
    const { result } = renderHook(useRuStoreAvailability);

    expect(result.current).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(RUSTORE_AVAILABILITY_URL, expect.objectContaining({
      cache: "no-store",
      credentials: "omit",
      signal: expect.any(AbortSignal),
    }));
    await act(async () => { resolveResponse(jsonResponse(availability())); });
    expect(result.current).toBe(RUSTORE_PUBLIC_URL);
  });

  it.each([
    ["pending publication", () => Promise.resolve(jsonResponse({ ...availability(), available: false, status: "pending" }))],
    ["an HTTP failure", () => Promise.resolve(jsonResponse(availability(), false))],
    ["a network failure", () => Promise.reject(new Error("Network unavailable"))],
  ])("leaves the store link hidden after %s", async (_label, request) => {
    fetchMock.mockImplementation(request);
    const { result } = renderHook(useRuStoreAvailability);
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBeNull();
  });

  it("rechecks on focus and removes a link after a failed check", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(availability())).mockRejectedValueOnce(new Error("Unavailable"));
    const { result } = renderHook(useRuStoreAvailability);
    await waitFor(() => expect(result.current).toBe(RUSTORE_PUBLIC_URL));

    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("expires a positive check even if the page remains open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    fetchMock.mockResolvedValue(jsonResponse(availability(now - RUSTORE_MAX_CHECK_AGE_MS + 500)));
    const { result } = renderHook(useRuStoreAvailability);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current).toBe(RUSTORE_PUBLIC_URL);

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current).toBeNull();
  });

  it("aborts an unfinished request and removes refresh timers on unmount", () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { unmount } = renderHook(useRuStoreAvailability);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
