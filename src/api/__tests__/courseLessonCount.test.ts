import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as { id: string }[],
  result: undefined as { data: { id: string }[] | null; error: unknown } | undefined,
  failAfterFirstPage: false,
  calls: [] as { columns: string; courseId: string; from: number; to: number }[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      expect(table).toBe("lessons");
      let columns = "";
      let courseId = "";
      const query = {
        select: (selected: string, options?: unknown) => {
          expect(options).toBeUndefined();
          columns = selected;
          return query;
        },
        eq: (column: string, id: string) => {
          expect(column).toBe("course_id");
          courseId = id;
          return query;
        },
        order: () => query,
        range: (from: number, to: number) => {
          state.calls.push({ columns, courseId, from, to });
          if (state.failAfterFirstPage && from > 0) return Promise.reject(new Error("Offline"));
          return Promise.resolve(state.result ?? { data: state.rows.slice(from, to + 1), error: null });
        },
      };
      return query;
    },
  },
}));

import { fetchCourseLessonCount } from "../courseLessonCount";

beforeEach(() => {
  state.rows = [];
  state.result = undefined;
  state.failAfterFirstPage = false;
  state.calls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("course lesson count from lightweight rows", () => {
  it("counts a successful list without a HEAD response or content", async () => {
    state.rows = Array.from({ length: 8 }, (_, i) => ({ id: `lesson-${i}` }));
    expect(await fetchCourseLessonCount("course-a")).toBe(8);
    expect(state.calls).toEqual([{ columns: "id", courseId: "course-a", from: 0, to: 999 }]);
  });

  it("returns zero only for a successful empty list", async () => {
    expect(await fetchCourseLessonCount("course-empty")).toBe(0);
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { message: "Request failed" } },
    { data: [], error: { message: "Request failed" } },
  ])("rejects unavailable rows instead of reporting an empty course: %j", async (result) => {
    state.result = result;
    await expect(fetchCourseLessonCount("course-a")).rejects.toBeDefined();
  });

  it("does not silently truncate a course at the API page size", async () => {
    state.rows = Array.from({ length: 1001 }, (_, i) => ({ id: `lesson-${i}` }));
    expect(await fetchCourseLessonCount("large-course")).toBe(1001);
    expect(state.calls).toHaveLength(2);
  });

  it("rejects a partial result when a later page fails", async () => {
    state.rows = Array.from({ length: 1001 }, (_, i) => ({ id: `lesson-${i}` }));
    state.failAfterFirstPage = true;
    await expect(fetchCourseLessonCount("large-course")).rejects.toThrow("Offline");
  });
});
