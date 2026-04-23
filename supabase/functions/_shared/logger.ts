/**
 * Структурированный логгер для edge-функций.
 * Пишет JSON-строки, чтобы их можно было фильтровать в логах
 * по fn / userId / requestId.
 *
 * Использование:
 *   import { createLogger } from "../_shared/logger.ts";
 *   const log = createLogger("my-fn", { userId: "...", requestId: "..." });
 *   log.info("started", { extra: 1 });
 *   log.error("failed", { error: String(e) });
 */

type Level = "debug" | "info" | "warn" | "error";

interface BaseMeta {
  fn: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

function emit(level: Level, base: BaseMeta, message: string, meta?: Record<string, unknown>) {
  const payload = {
    level,
    fn: base.fn,
    msg: message,
    ts: new Date().toISOString(),
    ...(base.userId ? { userId: base.userId } : {}),
    ...(base.requestId ? { requestId: base.requestId } : {}),
    ...(meta ?? {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(fn: string, base: Omit<BaseMeta, "fn"> = {}) {
  const ctx: BaseMeta = { fn, ...base };
  return {
    debug: (m: string, meta?: Record<string, unknown>) => emit("debug", ctx, m, meta),
    info: (m: string, meta?: Record<string, unknown>) => emit("info", ctx, m, meta),
    warn: (m: string, meta?: Record<string, unknown>) => emit("warn", ctx, m, meta),
    error: (m: string, meta?: Record<string, unknown>) => emit("error", ctx, m, meta),
    child: (extra: Record<string, unknown>) => createLogger(fn, { ...base, ...extra }),
  };
}

/** Generate a short request id for tracing */
export function makeRequestId(): string {
  return crypto.randomUUID().split("-")[0];
}
