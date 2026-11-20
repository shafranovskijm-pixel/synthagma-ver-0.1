import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGroupFolderCounts } from "../useGroupFolderCounts";
import { EMPTY_GROUP_FOLDER_COUNTS, type GroupFolderCounts, type GroupFolderCountSeed } from "@/lib/groups/folderCounts";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/groups/folderCounts", async original => ({
  ...await original<typeof import("@/lib/groups/folderCounts")>(),
  fetchGroupFolderCounts: mocks.fetch,
}));

function pending() {
  let resolve!: (value: GroupFolderCounts) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<GroupFolderCounts>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const counts = (docs: number): GroupFolderCounts => ({ ...EMPTY_GROUP_FOLDER_COUNTS, docs });
beforeEach(() => { mocks.fetch.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("group folder count scope guards", () => {
  it("uses a completed initial seed once, then refreshes changed documents from current sources", async () => {
    const seed: GroupFolderCountSeed = { organizationId: "org-1", groupId: "group-1", studentContractIds: [], passports: 2, snils: 1, exams: 5 };
    mocks.fetch.mockResolvedValueOnce(counts(1)).mockResolvedValueOnce(counts(3));
    const hook = renderHook(() => useGroupFolderCounts("org-1", "group-1", seed));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(mocks.fetch.mock.calls[0]).toEqual([{}, "org-1", "group-1", seed]);
    await act(async () => { await hook.result.current.refresh(); });
    expect(mocks.fetch.mock.calls[1]).toEqual([{}, "org-1", "group-1", undefined]);
    expect(hook.result.current.counts.docs).toBe(3);
  });

  it("ignores an old organization's late result during a new scope load", async () => {
    const oldRead = pending(); const newRead = pending();
    mocks.fetch.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
    const hook = renderHook(({ org, group }) => useGroupFolderCounts(org, group), { initialProps: { org: "org-1", group: "group-1" } });
    hook.rerender({ org: "org-2", group: "group-2" });
    await act(async () => { oldRead.resolve(counts(99)); });
    expect(hook.result.current.counts).toEqual(EMPTY_GROUP_FOLDER_COUNTS);
    expect(hook.result.current.loading).toBe(true);
    await act(async () => { newRead.resolve(counts(2)); });
    expect(hook.result.current.counts.docs).toBe(2);
    expect(hook.result.current.loading).toBe(false);
  });

  it("keeps the latest refresh when an earlier same-scope request finishes later", async () => {
    const first = pending(); const second = pending();
    mocks.fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const hook = renderHook(() => useGroupFolderCounts("org-1", "group-1"));
    let refresh!: Promise<void>;
    act(() => { refresh = hook.result.current.refresh(); });
    await act(async () => { second.resolve(counts(5)); await refresh; });
    await act(async () => { first.resolve(counts(1)); });
    expect(hook.result.current.counts.docs).toBe(5);
    expect(hook.result.current.error).toBe(false);
  });

  it("reports a failed read as unknown and recovers on explicit refresh", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.fetch.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce(counts(7));
    const hook = renderHook(() => useGroupFolderCounts("org-1", "group-1"));
    await waitFor(() => expect(hook.result.current.error).toBe(true));
    expect(hook.result.current.loading).toBe(false);
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.counts.docs).toBe(7);
    expect(hook.result.current.error).toBe(false);
  });

  it("does not issue a request without a complete scope", async () => {
    const hook = renderHook(() => useGroupFolderCounts(null, "group-1"));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(hook.result.current.counts).toEqual(EMPTY_GROUP_FOLDER_COUNTS);
  });
});
