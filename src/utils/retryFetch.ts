/**
 * Retry wrapper for async operations with exponential backoff.
 * Designed for Supabase queries that may fail due to transient network/connection issues.
 */

const RETRY_DELAYS = [0, 3000, 6000]; // immediate, 3s, 6s

export async function withRetry<T>(
  fn: () => PromiseLike<T> | Promise<T>,
  maxRetries = 3,
  label = "query"
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] ?? 3000;
        console.log(`[withRetry] ${label} attempt ${attempt + 1}/${maxRetries}, waiting ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`[withRetry] ${label} attempt ${attempt + 1} failed:`, error);
    }
  }

  throw lastError;
}

/**
 * Wrapper specifically for Supabase queries that return { data, error }.
 * Retries on error and throws the Supabase error object.
 */
export async function withSupabaseRetry<T>(
  fn: () => PromiseLike<{ data: T; error: any }>,
  maxRetries = 3,
  label = "supabase-query"
): Promise<T> {
  return withRetry(
    async () => {
      const { data, error } = await fn();
      if (error) throw error;
      return data;
    },
    maxRetries,
    label
  );
}

/**
 * Fetch all rows from a Supabase table, bypassing the 1000-row default limit.
 * Loads data in chunks of `pageSize` and concatenates results.
 */
export async function fetchAllRows<T>(
  queryBuilder: (range: { from: number; to: number }) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await queryBuilder({ from, to });

    if (error) {
      console.error("[fetchAllRows] Error at offset", from, error);
      throw error;
    }

    const rows = data || [];
    allRows.push(...rows);

    // If we got fewer rows than pageSize, we've reached the end
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}
