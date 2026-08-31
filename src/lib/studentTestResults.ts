import type { OrganizationStudentCourseResult } from "@/api/organizationStudentResults";
import { safePercent } from "@/lib/courseTestResult";

export interface StudentTestResultRecord {
  userId: string;
  fullName: string;
  email: string;
  courseId: string;
  courseTitle: string;
  testTitle: string;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  passingScore: number | null;
  status: string;
  completedAt: string | null;
  attemptsUsed: number | null;
}

const emptyStatusLabels: Record<OrganizationStudentCourseResult["result_status"], string> = {
  passed: "Сдано",
  failed: "Не сдано",
  not_started: "Не приступал",
  no_tests: "В курсе нет тестов",
};

function finiteOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeSpreadsheetText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function flattenStudentTestResults(
  rows: OrganizationStudentCourseResult[],
): StudentTestResultRecord[] {
  const records: StudentTestResultRecord[] = [];

  for (const row of rows) {
    const detailsByLessonId = new Map(
      row.test_details.map((detail) => [detail.lesson_id, detail]),
    );

    for (const test of row.course_tests) {
      const detail = detailsByLessonId.get(test.id);

      if (detail) {
        records.push({
          userId: row.user_id,
          fullName: row.name,
          email: row.email,
          courseId: row.course_id,
          courseTitle: row.course_title,
          testTitle: test.title || detail.lesson_title || "Тест",
          score: finiteOrNull(detail.score),
          maxScore: finiteOrNull(detail.max_score),
          percent: safePercent(detail.score, detail.max_score, detail.percent),
          passingScore: finiteOrNull(detail.passing_score),
          status: detail.passed ? "Сдан" : "Не сдан",
          completedAt: detail.completed_at ?? null,
          attemptsUsed: finiteOrNull(detail.attempts_used),
        });
      } else {
        records.push({
          userId: row.user_id,
          fullName: row.name,
          email: row.email,
          courseId: row.course_id,
          courseTitle: row.course_title,
          testTitle: test.title,
          score: null,
          maxScore: null,
          percent: null,
          passingScore: finiteOrNull(test.passingScore),
          status: "Не приступал",
          completedAt: null,
          attemptsUsed: 0,
        });
      }
    }

    if (row.course_tests.length > 0 || row.test_details.length > 0) continue;

    records.push({
      userId: row.user_id,
      fullName: row.name,
      email: row.email,
      courseId: row.course_id,
      courseTitle: row.course_title,
      testTitle: row.result_status === "no_tests" ? "В курсе нет тестов" : "—",
      score: null,
      maxScore: null,
      percent: null,
      passingScore: row.latest_passing_score,
      status: emptyStatusLabels[row.result_status],
      completedAt: row.last_attempt_at,
      attemptsUsed: row.attempts_used,
    });
  }

  return records.sort((left, right) => (
    left.courseTitle.localeCompare(right.courseTitle, "ru")
    || left.fullName.localeCompare(right.fullName, "ru")
    || left.testTitle.localeCompare(right.testTitle, "ru")
  ));
}

export function toStudentTestWorkbookRows(
  records: StudentTestResultRecord[],
): Array<Record<string, string | number>> {
  return records.map((record) => ({
    "ФИО": safeSpreadsheetText(record.fullName),
    "Email": safeSpreadsheetText(record.email),
    "Курс": safeSpreadsheetText(record.courseTitle),
    "Тест": safeSpreadsheetText(record.testTitle),
    "Результат тестирования": record.percent === null
      ? record.status
      : `${record.percent}% — ${record.status}`,
    "Баллы": record.score ?? "—",
    "Максимальный балл": record.maxScore ?? "—",
    "Результат, %": record.percent ?? "—",
    "Проходной балл, %": record.passingScore ?? "—",
    "Статус": record.status,
    "Дата последней попытки": record.completedAt
      ? new Date(record.completedAt).toLocaleString("ru-RU")
      : "—",
    "Количество попыток": record.attemptsUsed ?? "—",
  }));
}

export const studentTestWorkbookColumnWidths = [
  { wch: 28 },
  { wch: 30 },
  { wch: 36 },
  { wch: 34 },
  { wch: 26 },
  { wch: 12 },
  { wch: 18 },
  { wch: 16 },
  { wch: 20 },
  { wch: 16 },
  { wch: 24 },
  { wch: 20 },
];
