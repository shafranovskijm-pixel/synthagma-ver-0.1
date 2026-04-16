import { safeInvoke } from "@/utils/safeInvoke";
import { supabase } from "@/integrations/supabase/client";
import { markdownToBlocks, blocksToJson } from "@/components/course-builder/BlockEditor";

// ── Types ──

export interface PipelineCourse {
  id: string;
  course_id: string;
  course?: { id: string; title: string; description: string | null; duration: string | null };
}

export interface LogEntry {
  courseName: string;
  status: "ok" | "error" | "pending" | "active";
  message?: string;
  lessonsFilled?: number;
  testsSolved?: number;
  skippedBatches?: number;
  totalQuestions?: number;
}

export interface PipelineSummary {
  totalCourses: number;
  successCourses: number;
  errorCourses: number;
  totalTestsSolved: number;
  totalLessonsFilled: number;
  totalSkippedBatches: number;
  durationMs: number;
}

// ── Errors ──

export class CreditsExhaustedError extends Error {
  constructor() { super("Кредиты ИИ исчерпаны"); this.name = "CreditsExhaustedError"; }
}

export function checkFor402(error: unknown) {
  const err = error as Record<string, unknown> | null;
  if ((err?.context as Record<string, unknown>)?.status === 402 || err?.status === 402) throw new CreditsExhaustedError();
  const msg = (err?.message as string) || String(error || "");
  if (msg.includes("402") || msg.includes("кредит") || msg.includes("баланс") || msg.includes("payment_required") || msg.includes("Not enough credits")) {
    throw new CreditsExhaustedError();
  }
}

// ── Resume helpers ──

const RESUME_KEY = "pipeline_completed_ids";

export function getCompletedIds(): Set<string> {
  try { const saved = localStorage.getItem(RESUME_KEY); if (saved) return new Set(JSON.parse(saved)); } catch {}
  return new Set();
}

export function saveCompletedId(id: string) {
  const ids = getCompletedIds(); ids.add(id);
  localStorage.setItem(RESUME_KEY, JSON.stringify([...ids]));
}

export function clearCompletedIds() { localStorage.removeItem(RESUME_KEY); }

// ── Adaptive delay ──

let lastModelProvider: "gigachat" | "lovable" | "unknown" = "unknown";

export function getDelay(type: "batch" | "lesson"): number {
  if (lastModelProvider === "lovable") return type === "batch" ? 800 : 600;
  if (lastModelProvider === "gigachat") return type === "batch" ? 2000 : 1500;
  return type === "batch" ? 1500 : 1000;
}

export function detectProvider(data: Record<string, unknown> | null) {
  const model = data?.model || data?.modelUsed || "";
  if (typeof model === "string") {
    const lower = model.toLowerCase();
    if (lower.includes("gemini") || lower.includes("gpt") || lower.includes("lovable")) lastModelProvider = "lovable";
    else if (lower.includes("gigachat")) lastModelProvider = "gigachat";
  }
}

// ── Timeout wrapper ──

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} (${ms / 1000}s)`)), ms)),
  ]);
}

export const AI_CALL_TIMEOUT = 90_000;
export const PARALLEL_ITEM_TIMEOUT = 120_000;
export const MAX_CLIENT_RUNTIME = 2 * 60 * 60 * 1000;

// ── Parallel with concurrency limit ──

export async function parallelMap<T, R>(
  items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>, abortSignal?: { current: boolean }
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      if (abortSignal?.current) break;
      const i = nextIndex++;
      try { results[i] = await withTimeout(fn(items[i], i), PARALLEL_ITEM_TIMEOUT, `parallelMap[${i}]`); }
      catch (e) {
        if (e instanceof CreditsExhaustedError) throw e;
        if (abortSignal?.current) break;
        console.error(`[parallelMap] Item ${i} failed/timed out:`, e instanceof Error ? e.message : String(e));
        results[i] = undefined as unknown as R;
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Smart filter ──

export function isReliablySolved(q: { correct_answer: number | null; explanation?: string | null }): boolean {
  if (q.correct_answer === null || q.correct_answer === undefined) return false;
  if (q.explanation && q.explanation.length > 20) return true;
  return false;
}
