export const REPORT_PAGE_SIZE = 1_000;

/**
 * Loads a complete report without relying on PostgREST's per-request row cap.
 * A short final page terminates the loop; a full page triggers the next range.
 */
export async function loadAllReportPages<T>(
  loadPage: (from: number, to: number) => Promise<T[]>,
  pageSize = REPORT_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("report page size must be a positive integer");
  }

  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await loadPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
