import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLaborSafetyManager } from "@/hooks/useLaborSafetyManager";
import { fetchLaborSafetyGroups, type LaborSafetyGroupsResult } from "@/api/laborSafetyGroups";

type RecordsResponse = { data: Array<{ id: string; group_id: string; full_name: string }>; error: null };
const state = vi.hoisted(() => ({
  records: new Map<string, Promise<RecordsResponse>>(),
  recordsQueries: [] as string[],
}));

vi.mock("@/api/laborSafetyGroups", () => ({ fetchLaborSafetyGroups: vi.fn() }));
vi.mock("@/api/enrollments", () => ({ insertEnrollmentsVerified: vi.fn() }));
vi.mock("@/hooks/useWordDocumentGenerator", () => ({
  useWordDocumentGenerator: () => ({ generateDocument: vi.fn(), isGenerating: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    let groupId = "";
    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => { if (column === "group_id") groupId = value; return builder; },
      order: () => {
        state.recordsQueries.push(groupId);
        return state.records.get(groupId) ?? Promise.resolve({ data: [], error: null });
      },
      maybeSingle: () => {
        if (table !== "labor_safety_profiles") throw new Error(`Unexpected lookup: ${table}`);
        return Promise.resolve({ data: null, error: null });
      },
    };
    return builder;
  } },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const group = (id: string, organizationId = "org-a") => ({
  id, name: `Группа ${id}`, organization_id: organizationId,
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", records_count: 1,
});
const loaded = (groups: LaborSafetyGroupsResult["groups"]): LaborSafetyGroupsResult => ({
  groups, countsUnavailable: false, countsError: null,
});

beforeEach(() => {
  vi.mocked(fetchLaborSafetyGroups).mockReset();
  state.records.clear();
  state.recordsQueries.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("labor safety group loading", () => {
  it("keeps a failed load distinct from an empty result and clears the error after a successful retry", async () => {
    vi.mocked(fetchLaborSafetyGroups).mockRejectedValueOnce(new Error("permission denied"));
    const { result } = renderHook(() => useLaborSafetyManager({ organizationId: "org-a" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.groupsLoadError).toMatch(/Не удалось загрузить группы/);
    expect(result.current.groups).toEqual([]);

    vi.mocked(fetchLaborSafetyGroups).mockResolvedValueOnce(loaded([group("a")]));
    await act(async () => { await result.current.fetchGroups(); });
    expect(result.current.groupsLoadError).toBeNull();
    expect(result.current.groups.map((item) => item.id)).toEqual(["a"]);
  });

  it("retains accessible groups when counts fail without turning an unknown count into zero", async () => {
    vi.mocked(fetchLaborSafetyGroups).mockResolvedValue({
      groups: [{ ...group("a"), records_count: undefined }],
      countsUnavailable: true, countsError: new Error("count query timeout"),
    });
    const { result } = renderHook(() => useLaborSafetyManager({ organizationId: "org-a" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.groupsLoadError).toBeNull();
    expect(result.current.groupCountsUnavailable).toBe(true);
    expect(result.current.groups[0].records_count).toBeUndefined();
    expect(result.current.filteredGroups[0].id).toBe("a");
  });

  it("ignores a slower group response from the previous organization", async () => {
    const oldLoad = deferred<LaborSafetyGroupsResult>();
    vi.mocked(fetchLaborSafetyGroups).mockImplementation((orgId) => orgId === "org-a"
      ? oldLoad.promise : Promise.resolve(loaded([group("b", "org-b")])));
    const { result, rerender } = renderHook(({ organizationId }) => useLaborSafetyManager({ organizationId }), {
      initialProps: { organizationId: "org-a" },
    });
    rerender({ organizationId: "org-b" });
    await waitFor(() => expect(result.current.groups.map((item) => item.id)).toEqual(["b"]));
    await act(async () => { oldLoad.resolve(loaded([group("a")])); await oldLoad.promise; });
    expect(result.current.groups.map((item) => item.id)).toEqual(["b"]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.groupsLoadError).toBeNull();
  });

  it("clears selected records on organization changes and discards an in-flight old roster", async () => {
    vi.mocked(fetchLaborSafetyGroups).mockImplementation((orgId) => Promise.resolve(loaded([group(orgId, orgId)])));
    state.records.set("org-a", Promise.resolve({
      data: [{ id: "record-a", group_id: "org-a", full_name: "Слушатель А" }], error: null,
    }));
    const { result, rerender } = renderHook(({ organizationId }) => useLaborSafetyManager({ organizationId }), {
      initialProps: { organizationId: "org-a" },
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setSelectedGroup(result.current.groups[0]));
    await waitFor(() => expect(result.current.records).toHaveLength(1));
    act(() => result.current.setSelectedRecordIds(new Set(["record-a"])));
    const oldRoster = deferred<RecordsResponse>();
    state.records.set("org-a", oldRoster.promise);
    let pending!: Promise<void>;
    act(() => { pending = result.current.fetchRecords("org-a"); });

    rerender({ organizationId: "org-b" });
    await waitFor(() => expect(result.current.groups[0]?.organization_id).toBe("org-b"));
    expect(result.current.selectedGroup).toBeNull();
    expect(result.current.records).toEqual([]);
    expect(result.current.selectedRecordIds.size).toBe(0);
    await act(async () => {
      oldRoster.resolve({ data: [{ id: "stale-a", group_id: "org-a", full_name: "Старый ответ" }], error: null });
      await pending;
    });
    expect(result.current.records).toEqual([]);
    expect(result.current.selectedRecordIds.size).toBe(0);
    expect(result.current.isLoadingRecords).toBe(false);
  });

  it("does not restart old organization queries when delayed callbacks fire after switching organizations", async () => {
    vi.mocked(fetchLaborSafetyGroups).mockImplementation((orgId) => Promise.resolve(loaded([group(orgId, orgId)])));
    for (const orgId of ["org-a", "org-b"]) {
      state.records.set(orgId, Promise.resolve({
        data: [{ id: `record-${orgId}`, group_id: orgId, full_name: `Слушатель ${orgId}` }], error: null,
      }));
    }
    const { result, rerender } = renderHook(({ organizationId }) => useLaborSafetyManager({ organizationId }), {
      initialProps: { organizationId: "org-a" },
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setSelectedGroup(result.current.groups[0]));
    await waitFor(() => expect(result.current.records[0]?.id).toBe("record-org-a"));
    const oldFetchGroups = result.current.fetchGroups;
    const oldFetchRecords = result.current.fetchRecords;

    rerender({ organizationId: "org-b" });
    await waitFor(() => expect(result.current.groups[0]?.organization_id).toBe("org-b"));
    act(() => result.current.setSelectedGroup(result.current.groups[0]));
    await waitFor(() => expect(result.current.records[0]?.id).toBe("record-org-b"));
    vi.mocked(fetchLaborSafetyGroups).mockClear();
    state.recordsQueries.length = 0;

    await act(async () => {
      await oldFetchGroups();
      await oldFetchRecords("org-a");
    });
    expect(fetchLaborSafetyGroups).not.toHaveBeenCalled();
    expect(state.recordsQueries).toEqual([]);
    expect(result.current.groups.map((item) => item.organization_id)).toEqual(["org-b"]);
    expect(result.current.selectedGroup?.id).toBe("org-b");
    expect(result.current.records.map((item) => item.id)).toEqual(["record-org-b"]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isLoadingRecords).toBe(false);
  });
});
