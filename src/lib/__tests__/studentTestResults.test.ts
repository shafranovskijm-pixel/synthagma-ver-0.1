import { describe, expect, it } from "vitest";
import type { OrganizationStudentCourseResult } from "@/api/organizationStudentResults";
import {
  flattenStudentTestResults,
  toStudentTestWorkbookRows,
} from "@/lib/studentTestResults";

function makeRow(
  overrides: Partial<OrganizationStudentCourseResult> = {},
): OrganizationStudentCourseResult {
  return {
    id: "profile-1",
    user_id: "user-1",
    enrollment_id: "enrollment-1",
    name: "Иванов Иван Иванович",
    email: "ivanov@example.ru",
    login: null,
    progress: 100,
    status: "completed",
    started_at: "2026-08-01T00:00:00.000Z",
    completed_at: "2026-08-30T00:00:00.000Z",
    time_spent: 120,
    archived_at: null,
    tests_total: 1,
    tests_attempted: 1,
    tests_passed: 1,
    average_percent: 80,
    latest_score: 8,
    latest_max_score: 10,
    latest_percent: 80,
    latest_passing_score: 75,
    attempts_used: 2,
    last_attempt_at: "2026-08-30T10:00:00.000Z",
    result_status: "passed",
    test_details: [{
      lesson_id: "lesson-1",
      lesson_title: "Итоговый тест",
      score: 8,
      max_score: 10,
      percent: 80,
      passing_score: 75,
      passed: true,
      attempts_used: 2,
      max_attempts: 3,
      completed_at: "2026-08-30T10:00:00.000Z",
    }],
    course_id: "course-1",
    course_title: "Пожарная безопасность",
    course_tests: [{
      id: "lesson-1",
      title: "Итоговый тест",
      passingScore: 75,
      orderIndex: 0,
    }],
    ...overrides,
  };
}

describe("flattenStudentTestResults", () => {
  it("keeps factual course, test, score, passing score and email", () => {
    const [record] = flattenStudentTestResults([makeRow()]);

    expect(record).toMatchObject({
      fullName: "Иванов Иван Иванович",
      email: "ivanov@example.ru",
      courseTitle: "Пожарная безопасность",
      testTitle: "Итоговый тест",
      score: 8,
      maxScore: 10,
      percent: 80,
      passingScore: 75,
      status: "Сдан",
      attemptsUsed: 2,
    });
  });

  it.each([
    ["not_started", "Не приступал", "—"],
    ["no_tests", "В курсе нет тестов", "В курсе нет тестов"],
    ["failed", "Не сдано", "—"],
    ["passed", "Сдано", "—"],
  ] as const)("keeps an enrollment row for %s", (resultStatus, status, testTitle) => {
    const [record] = flattenStudentTestResults([makeRow({
      result_status: resultStatus,
      test_details: [],
      tests_total: resultStatus === "no_tests" ? 0 : 1,
      course_tests: [],
    })]);

    expect(record.status).toBe(status);
    expect(record.testTitle).toBe(testTitle);
  });

  it("does not print an inconsistent reported percentage", () => {
    const [record] = flattenStudentTestResults([makeRow({
      test_details: [{
        lesson_id: "lesson-1",
        lesson_title: "Тест",
        score: 1,
        max_score: 10,
        percent: 95,
        passing_score: 70,
        passed: false,
        attempts_used: 1,
        max_attempts: null,
        completed_at: null,
      }],
    })]);

    expect(record.percent).toBeNull();
  });

  it("includes every configured test and marks tests without attempts as not started", () => {
    const records = flattenStudentTestResults([makeRow({
      tests_total: 3,
      course_tests: [
        { id: "lesson-1", title: "Тест 1", passingScore: 75, orderIndex: 0 },
        { id: "lesson-2", title: "Тест 2", passingScore: 80, orderIndex: 1 },
        { id: "lesson-3", title: "Тест 3", passingScore: 60, orderIndex: 2 },
      ],
    })]);

    expect(records.map((record) => [record.testTitle, record.status, record.passingScore])).toEqual([
      ["Тест 1", "Сдан", 75],
      ["Тест 2", "Не приступал", 80],
      ["Тест 3", "Не приступал", 60],
    ]);
  });
});

describe("toStudentTestWorkbookRows", () => {
  it("contains the requested columns and never exports login or password", () => {
    const workbookRows = toStudentTestWorkbookRows(flattenStudentTestResults([makeRow()]));
    const columns = Object.keys(workbookRows[0]);

    expect(columns).toEqual(expect.arrayContaining([
      "ФИО",
      "Email",
      "Курс",
      "Результат тестирования",
    ]));
    expect(columns).not.toContain("Логин");
    expect(columns).not.toContain("Пароль");
    expect(workbookRows[0]["Результат тестирования"]).toBe("80% — Сдан");
  });

  it("neutralizes spreadsheet formulas in user-controlled text", () => {
    const workbookRows = toStudentTestWorkbookRows(flattenStudentTestResults([
      makeRow({ name: "=HYPERLINK(\"bad\")", email: "+1@example.ru" }),
    ]));

    expect(workbookRows[0]["ФИО"]).toBe("'=HYPERLINK(\"bad\")");
    expect(workbookRows[0]["Email"]).toBe("'+1@example.ru");
  });
});
