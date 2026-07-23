/**
 * Retry wrapper for async operations with exponential backoff.
 * Designed for Supabase queries that may fail due to transient network/connection issues.
 */

import { toast } from "sonner";

const RETRY_DELAYS = [0, 3000, 6000]; // immediate, 3s, 6s

function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /Failed to fetch|NetworkError|Load failed|network|timeout|ECONN|fetch failed/i.test(msg);
}

export async function withRetry<T>(
  fn: () => PromiseLike<T> | Promise<T>,
  maxRetries = 3,
  label = "query"
): Promise<T> {
  let lastError: unknown;
  const toastId = `retry:${label}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] ?? 3000;
        if (isNetworkError(lastError)) {
          toast.loading(`Медленное соединение — повторяем (${attempt + 1}/${maxRetries})...`, {
            id: toastId,
            duration: delay + 1500,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const result = await fn();
      if (attempt > 0) toast.dismiss(toastId);
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[withRetry:${label}] attempt ${attempt + 1} failed:`, error);
    }
  }

  toast.dismiss(toastId);
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
