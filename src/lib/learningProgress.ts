import { supabase } from "@/integrations/supabase/client";

export interface LearningProgressRun {
  enrollmentId: string;
  userId: string;
  courseId: string;
  epoch: string;
  resetAt: string | null;
}
export interface LearningProgressRow {
  lesson_id: string;
  completed: boolean;
  [key: string]: unknown;
}
export interface LearningProgressSnapshot {
  enrollment: Record<string, unknown> & { id: string; user_id: string; course_id: string; status: string; progress: number; expires_at?: string | null; learning_progress_epoch: string };
  lesson_progress: LearningProgressRow[];
  learning_progress_epoch: string;
  learning_progress_reset_at: string | null;
}
export function isLearningProgressEpoch(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}
/** PostgREST table bigint JSON numbers are accepted only when exactly representable. RPCs use strings. */
export function normalizeLearningProgressEpoch(value: unknown): string | null {
  return isLearningProgressEpoch(value) ? value : typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
}
export function compareLearningProgressEpoch(a: string, b: string): number {
  if (!isLearningProgressEpoch(a) || !isLearningProgressEpoch(b)) throw new Error("Invalid learning progress epoch");
  return a.length === b.length ? (a === b ? 0 : a < b ? -1 : 1) : a.length < b.length ? -1 : 1;
}
export function isLearningProgressReset(error: unknown): boolean {
  return /LEARNING_PROGRESS_RESET/.test((error as { message?: string })?.message ?? "");
}
export function parseLearningProgressSnapshot(value: unknown, userId: string, courseId: string): LearningProgressSnapshot {
  const data = value as LearningProgressSnapshot | null;
  if (!data || !data.enrollment || data.enrollment.user_id !== userId || data.enrollment.course_id !== courseId) {
    throw Object.assign(new Error("Доступ к текущему зачислению не подтверждён"), { code: "42501" });
  }
  if (typeof data.enrollment.id !== "string" || typeof data.enrollment.status !== "string" || typeof data.enrollment.progress !== "number" || !isLearningProgressEpoch(data.learning_progress_epoch)
    || data.enrollment.learning_progress_epoch !== data.learning_progress_epoch
    || !(data.learning_progress_reset_at === null || typeof data.learning_progress_reset_at === "string")
    || !Array.isArray(data.lesson_progress)
    || data.lesson_progress.some(row => !row || typeof row.lesson_id !== "string" || typeof row.completed !== "boolean"
      || (row.user_id !== undefined && row.user_id !== userId))) throw new Error("Учебный прогресс не подтверждён сервером");
  return data;
}
export function snapshotRun(snapshot: LearningProgressSnapshot): LearningProgressRun {
  return { enrollmentId: snapshot.enrollment.id, userId: snapshot.enrollment.user_id, courseId: snapshot.enrollment.course_id,
    epoch: snapshot.learning_progress_epoch, resetAt: snapshot.learning_progress_reset_at };
}
/** Only server snapshots may advance this fence. Cached/queued rows never confirm a run. */
export class LearningProgressFence {
  private value: LearningProgressRun | null = null;
  private revision = 0;
  accept(run: LearningProgressRun): boolean {
    if (!isLearningProgressEpoch(run.epoch)) return false;
    const previous = this.value;
    const same = previous?.enrollmentId === run.enrollmentId && previous?.userId === run.userId && previous?.courseId === run.courseId;
    if (same && compareLearningProgressEpoch(run.epoch, previous.epoch) < 0) return false;
    if (!same || previous.epoch !== run.epoch) this.revision++;
    this.value = run;
    return true;
  }
  invalidate(): void { this.value = null; this.revision++; }
  captureRevision(): () => boolean { const revision = this.revision; return () => this.revision === revision; }
  capture(): { run: LearningProgressRun; current: () => boolean } | null {
    if (!this.value) return null;
    const run = this.value, revision = this.revision;
    return { run, current: () => this.value !== null && this.revision === revision && this.value.enrollmentId === run.enrollmentId
      && this.value.userId === run.userId && this.value.courseId === run.courseId && this.value.epoch === run.epoch };
  }
}
export async function fetchOwnLearningProgress(courseId: string, userId: string, authorization?: string): Promise<LearningProgressSnapshot> {
  const request = supabase.rpc("get_course_learning_snapshot" as never, { p_course_id: courseId } as never);
  const { data, error } = await (authorization ? request.setHeader("Authorization", authorization) : request);
  if (error) throw error;
  return parseLearningProgressSnapshot(data, userId, courseId);
}
export async function saveOwnLearningProgress(run: LearningProgressRun, lessonId: string,
  patch: { completed?: boolean; videoPosition?: number; videoDuration?: number; seconds?: number }, authorization?: string): Promise<LearningProgressSnapshot> {
  const request = supabase.rpc("save_own_lesson_progress" as never, {
    p_enrollment_id: run.enrollmentId, p_lesson_id: lessonId, p_expected_epoch: run.epoch,
    p_completed: patch.completed ?? null, p_video_position: patch.videoPosition ?? null,
    p_video_duration: patch.videoDuration ?? null, p_seconds: patch.seconds ?? null,
  } as never);
  const { data, error } = await (authorization ? request.setHeader("Authorization", authorization) : request);
  if (error) throw error;
  const snapshot = parseLearningProgressSnapshot(data, run.userId, run.courseId);
  if (snapshot.enrollment.id !== run.enrollmentId || snapshot.learning_progress_epoch !== run.epoch) throw new Error("LEARNING_PROGRESS_RESET");
  return snapshot;
}
/** Reject an older/missing epoch from either dashboard data source after a newer one was accepted. */
export function acceptDashboardProgressEpochs(rows: readonly { id: string; learning_progress_epoch?: unknown }[],
  known: ReadonlyMap<string, string>): Map<string, string> | null {
  const next = new Map(known);
  for (const row of rows) {
    const prior = known.get(row.id), epoch = row.learning_progress_epoch;
    if (!isLearningProgressEpoch(epoch) || (prior !== undefined && compareLearningProgressEpoch(epoch, prior) < 0)) return null;
    next.set(row.id, epoch);
  }
  return next;
}

export function isDashboardCachedProgressCurrent(rows: readonly { learningEnrollmentId?: string; learningProgressEpoch?: unknown }[], known: ReadonlyMap<string, string>): boolean {
  if (known.size === 0) return true; // Explicitly stale read-only offline view, never authority.
  return rows.every(row => {
    if (!row.learningEnrollmentId || !isLearningProgressEpoch(row.learningProgressEpoch)) return false;
    const epoch = known.get(row.learningEnrollmentId);
    return epoch === undefined || compareLearningProgressEpoch(row.learningProgressEpoch, epoch) >= 0;
  });
}
