/**
 * Classifies errors from Supabase / fetch calls into:
 *  - transient network / gateway errors — safe to retry
 *  - everything else (RLS, 400/401/403, PGRST116, permission denied, validation) — must NOT be retried
 *
 * Used by data loaders that previously retried every error and mislabelled RLS
 * failures as "Slow connection". Keeps retry logic honest.
 */

const TRANSIENT_MESSAGE_PATTERNS: RegExp[] = [
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
  /load failed/i,
  /timed? ?out/i,
  /timeout/i,
  /econn/i,
  /fetch failed/i,
  /err_connection/i,
  /err_network/i,
  /err_name_not_resolved/i,
  /err_internet_disconnected/i,
];

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527]);

// Postgres / PostgREST error codes that are permanent (do NOT retry):
// 42501 permission_denied (RLS), PGRST116 no rows for .single(), 23xxx integrity,
// 22xxx data exception, 42xxx syntax/access rule.
const PERMANENT_ERROR_CODES = new Set([
  "42501",
  "PGRST116",
  "PGRST301",
  "PGRST302",
]);

function extractStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const anyErr = err as any;
  if (typeof anyErr.status === "number") return anyErr.status;
  if (typeof anyErr.statusCode === "number") return anyErr.statusCode;
  if (anyErr.context && typeof anyErr.context.status === "number") return anyErr.context.status;
  return undefined;
}

function extractCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const anyErr = err as any;
  if (typeof anyErr.code === "string") return anyErr.code;
  return undefined;
}

export function isTransientNetworkError(err: unknown): boolean {
  if (!err) return false;

  const code = extractCode(err);
  if (code && PERMANENT_ERROR_CODES.has(code)) return false;
  if (code && code.startsWith("22")) return false; // data exception
  if (code && code.startsWith("23")) return false; // integrity
  if (code && code.startsWith("42")) return false; // syntax / privilege

  const status = extractStatus(err);
  if (typeof status === "number") {
    if (status >= 400 && status < 500 && !TRANSIENT_HTTP_STATUSES.has(status)) return false;
    if (TRANSIENT_HTTP_STATUSES.has(status)) return true;
    if (status >= 500) return true; // 500/501: usually server hiccup
  }

  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : (err as any)?.message ?? "";
  if (typeof message === "string" && message) {
    if (TRANSIENT_MESSAGE_PATTERNS.some((r) => r.test(message))) return true;
    // RLS / permission errors: never retry.
    if (/row-level security|permission denied|not authorized|jwt|access denied/i.test(message)) return false;
  }

  // TypeError from fetch → network layer failure.
  if (err instanceof TypeError) return true;

  return false;
}

export type UserFacingErrorKind = "network" | "permission" | "unauthorized" | "not_found" | "unknown";

export function classifyDataError(err: unknown): UserFacingErrorKind {
  if (!err) return "unknown";
  const code = extractCode(err);
  const status = extractStatus(err);
  const message = (err instanceof Error ? err.message : String((err as any)?.message ?? err ?? "")).toLowerCase();

  if (code === "PGRST116" || status === 404) return "not_found";
  if (status === 401 || /jwt|not authenticated|invalid session/.test(message)) return "unauthorized";
  if (
    code === "42501" ||
    status === 403 ||
    /row-level security|permission denied|not authorized|access denied/.test(message)
  ) {
    return "permission";
  }
  if (isTransientNetworkError(err)) return "network";
  return "unknown";
}
