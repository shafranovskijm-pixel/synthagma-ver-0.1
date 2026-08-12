import { describe, expect, it, vi } from "vitest";
import { loadAllReportPages } from "../reportPagination";

describe("campaign report pagination", () => {
  it("loads every row past the former 500-row UI cap", async () => {
    const rows = Array.from({ length: 812 }, (_, index) => index + 1);
    const loadPage = vi.fn(async (from: number, to: number) => rows.slice(from, to + 1));

    const result = await loadAllReportPages(loadPage, 500);

    expect(result).toEqual(rows);
    expect(loadPage).toHaveBeenNthCalledWith(1, 0, 499);
    expect(loadPage).toHaveBeenNthCalledWith(2, 500, 999);
  });

  it("requests one trailing page when the total is an exact page multiple", async () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => index);
    const loadPage = vi.fn(async (from: number, to: number) => rows.slice(from, to + 1));

    await expect(loadAllReportPages(loadPage, 1_000)).resolves.toHaveLength(1_000);
    expect(loadPage).toHaveBeenNthCalledWith(2, 1_000, 1_999);
  });

  it("rejects an invalid page size", async () => {
    await expect(loadAllReportPages(async () => [], 0)).rejects.toThrow("positive integer");
  });
});
