import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as Array<{ data: unknown; error: unknown } | Error>,
  calls: [] as Array<{
    table: string;
    columns: string;
    filters: Array<[string, string]>;
    order: [string, { ascending: boolean }];
  }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let columns = "";
      const filters: Array<[string, string]> = [];
      const query = {
        select: (value: string) => { columns = value; return query; },
        eq: (column: string, value: string) => { filters.push([column, value]); return query; },
        order: (column: string, options: { ascending: boolean }) => {
          state.calls.push({ table, columns, filters, order: [column, options] });
          const response = state.responses.shift();
          if (response instanceof Error) return Promise.reject(response);
          if (!response) throw new Error("Unexpected extra query");
          return Promise.resolve(response);
        },
      };
      return query;
    },
  },
}));

import { fetchLaborSafetyGroups } from "./laborSafetyGroups";

const group = {
  id: "group-a",
  name: "Группа ОТ",
  organization_id: "org-a",
  created_at: "2026-10-12T00:00:00Z",
  updated_at: "2026-10-12T00:00:00Z",
};

beforeEach(() => {
  state.responses = [];
  state.calls = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("fetchLaborSafetyGroups", () => {
  it("returns explicit zero and nonzero counts in one organization-scoped request", async () => {
    state.responses = [{ data: [
      { ...group, labor_safety_records: [{ count: 0 }] },
      { ...group, id: "group-b", labor_safety_records: [{ count: 17 }] },
    ], error: null }];

    expect(await fetchLaborSafetyGroups("org-a")).toEqual({
      groups: [{ ...group, records_count: 0 }, { ...group, id: "group-b", records_count: 17 }],
      countsUnavailable: false,
      countsError: null,
    });
    expect(state.calls).toEqual([{
      table: "labor_safety_groups",
      columns: "*, labor_safety_records(count)",
      filters: [["organization_id", "org-a"]],
      order: ["created_at", { ascending: false }],
    }]);
  });

  it("recovers groups without inventing zero counts when the embedded query fails", async () => {
    const countsError = { code: "57014", message: "statement timeout" };
    state.responses = [
      { data: null, error: countsError },
      { data: [group], error: null },
    ];

    const result = await fetchLaborSafetyGroups("org-a");

    expect(result).toEqual({
      groups: [{ ...group, records_count: undefined }],
      countsUnavailable: true,
      countsError,
    });
    expect(result.countsError).toBe(countsError);
    expect(state.calls).toHaveLength(2);
    expect(state.calls[1]).toEqual({
      table: "labor_safety_groups",
      columns: "*",
      filters: [["organization_id", "org-a"]],
      order: ["created_at", { ascending: false }],
    });
  });

  it("also retries the plain query after a rejected network request", async () => {
    const networkError = new Error("Connection interrupted");
    state.responses = [networkError, { data: [group], error: null }];

    const result = await fetchLaborSafetyGroups("org-a");
    expect(result.groups).toEqual([{ ...group, records_count: undefined }]);
    expect(result.countsError).toBe(networkError);
    expect(result.countsUnavailable).toBe(true);
  });

  it("throws the plain-query error and retains the first error in diagnostics when both fail", async () => {
    const countsError = { code: "57014", message: "count query failed" };
    const groupsError = { code: "42501", message: "permission denied" };
    state.responses = [
      { data: null, error: countsError },
      { data: null, error: groupsError },
    ];

    await expect(fetchLaborSafetyGroups("org-a")).rejects.toBe(groupsError);
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), countsError);
    expect(state.calls).toHaveLength(2);
  });

  it("recognizes a genuinely empty successful response without fallback", async () => {
    state.responses = [{ data: [], error: null }];
    expect(await fetchLaborSafetyGroups("org-empty")).toEqual({
      groups: [], countsUnavailable: false, countsError: null,
    });
    expect(state.calls).toHaveLength(1);
  });

  it("recognizes an empty plain-query response after a failed count query", async () => {
    const countsError = { message: "count query failed" };
    state.responses = [{ data: null, error: countsError }, { data: [], error: null }];
    expect(await fetchLaborSafetyGroups("org-empty")).toEqual({
      groups: [], countsUnavailable: true, countsError,
    });
  });

  it("leaves a missing count unknown even when group rows loaded successfully", async () => {
    state.responses = [{ data: [{ ...group, labor_safety_records: [] }], error: null }];
    const result = await fetchLaborSafetyGroups("org-a");
    expect(result.groups).toEqual([{ ...group, records_count: undefined }]);
    expect(result.countsUnavailable).toBe(true);
    expect(result.countsError).toBeInstanceOf(Error);
    expect(state.calls).toHaveLength(1);
  });

  it("does not treat missing data as a confirmed empty group list", async () => {
    state.responses = [{ data: null, error: null }, { data: null, error: null }];
    await expect(fetchLaborSafetyGroups("org-a")).rejects.toThrow("group list response is missing");
  });
});
