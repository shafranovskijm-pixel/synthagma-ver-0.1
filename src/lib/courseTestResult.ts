/**
 * Pure helpers for rendering per-student test result summaries in the
 * "Ученики курса" table (Phase 5D).
 *
 * The RPC `get_course_student_test_results_page` computes result_status and
 * aggregates on the server. This module renders human-readable labels and
 * validates that percent === round(score / max_score * 100) — if the numbers
 * are inconsistent we degrade to "—" rather than showing a misleading value.
 */

export type CourseResultStatus = "passed" | "failed" | "not_started" | "no_tests";

export interface CourseTestResultInput {
  result_status: CourseResultStatus;
  tests_total: number;
  tests_attempted: number;
  tests_passed: number;
  average_percent: number;
  latest_score: number | null;
  latest_max_score: number | null;
  latest_percent: number | null;
  attempts_used: number | null;
  latest_passing_score: number | null;
}

export interface CourseTestResultBadge {
  tone: "success" | "danger" | "neutral" | "muted";
  title: string;
  subtitle: string | null;
}

/**
 * Compute percent = round(score / max_score * 100) and return it only when it
 * matches what the RPC reported. If the two disagree (or max_score <= 0),
 * return null — the UI should hide the percent instead of showing an
 * inconsistent number next to the raw score.
 */
export function safePercent(
  score: number | null,
  maxScore: number | null,
  reportedPercent: number | null
): number | null {
  if (score == null || maxScore == null || maxScore <= 0) return null;
  const computed = Math.round((score / maxScore) * 100);
  if (reportedPercent != null && Math.abs(reportedPercent - computed) > 1) {
    return null;
  }
  return computed;
}

export function formatCourseTestResult(row: CourseTestResultInput): CourseTestResultBadge {
  if (row.result_status === "no_tests" || row.tests_total <= 0) {
    return { tone: "muted", title: "В курсе нет тестов", subtitle: null };
  }
  if (row.result_status === "not_started" || row.tests_attempted === 0) {
    return { tone: "neutral", title: "Не проходил", subtitle: null };
  }

  // Multi-test course: summarise across all tests.
  if (row.tests_total > 1) {
    const avg = Math.max(0, Math.min(100, row.average_percent));
    return {
      tone: row.result_status === "passed" ? "success" : "danger",
      title: `Сдано ${row.tests_passed} из ${row.tests_total}`,
      subtitle: `средний результат ${avg}%`,
    };
  }

  // Single-test course: show the concrete latest attempt.
  const percent = safePercent(row.latest_score, row.latest_max_score, row.latest_percent);
  const passed = row.result_status === "passed";
  const scorePart =
    row.latest_score != null && row.latest_max_score != null
      ? `${row.latest_score} из ${row.latest_max_score}`
      : null;
  const attemptsPart =
    row.attempts_used != null ? `попытка ${row.attempts_used}` : null;
  const subtitleBits = [scorePart, attemptsPart].filter((v): v is string => !!v);
  return {
    tone: passed ? "success" : "danger",
    title:
      percent != null
        ? `${passed ? "Сдан" : "Не сдан"} — ${percent}%`
        : passed
        ? "Сдан"
        : "Не сдан",
    subtitle: subtitleBits.length ? subtitleBits.join(" · ") : null,
  };
}
