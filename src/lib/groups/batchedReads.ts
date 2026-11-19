import { fetchAllRows } from "@/utils/retryFetch";

type Page = { from: number; to: number };
type ReadResult<T> = { data: T[] | null; error: any };

/**
 * Bound UUID filters as well as result pages. A group may contain more learners
 * than fit in a request URL, and each learner may have many matching records.
 * The caller must apply a stable unique ordering before the supplied range.
 * A failed page rejects the complete read; partial rows must never become zeros.
 */
export async function fetchRowsByIdBatches<T>(
  ids: string[],
  queryBuilder: (batch: string[], range: Page) => PromiseLike<ReadResult<T>>,
): Promise<T[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const rows: T[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const batch = uniqueIds.slice(offset, offset + 100);
    const batchRows = await fetchAllRows<T>(async range => {
      const result = await queryBuilder(batch, range);
      if (!result.error && !Array.isArray(result.data)) {
        throw new Error("group_rows_invalid_response");
      }
      return result;
    });
    for (const row of batchRows) rows.push(row);
  }
  return rows;
}
