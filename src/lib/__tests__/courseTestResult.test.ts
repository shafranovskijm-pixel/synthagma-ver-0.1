import { describe, it, expect } from "vitest";
import { formatCourseTestResult, safePercent } from "@/lib/courseTestResult";

const base = {
  tests_total: 1,
  tests_attempted: 1,
  tests_passed: 1,
  average_percent: 93,
  latest_score: 14,
  latest_max_score: 15,
  latest_percent: 93,
  attempts_used: 1,
  latest_passing_score: 70,
};

describe("safePercent", () => {
  it("returns computed percent when score/max_score match reported percent", () => {
    expect(safePercent(14, 15, 93)).toBe(93);
  });
  it("returns null when reported percent disagrees with computed", () => {
    expect(safePercent(1, 15, 93)).toBeNull();
  });
  it("returns null when max_score is 0 or missing", () => {
    expect(safePercent(0, 0, 0)).toBeNull();
    expect(safePercent(1, null, 100)).toBeNull();
  });
});

describe("formatCourseTestResult", () => {
  it("passed — single test", () => {
    const r = formatCourseTestResult({ ...base, result_status: "passed" });
    expect(r.tone).toBe("success");
    expect(r.title).toBe("Сдан — 93%");
    expect(r.subtitle).toBe("14 из 15 · попытка 1");
  });

  it("failed — single test", () => {
    const r = formatCourseTestResult({
      ...base, result_status: "failed",
      latest_score: 9, latest_max_score: 30, latest_percent: 30, average_percent: 30, tests_passed: 0,
    });
    expect(r.tone).toBe("danger");
    expect(r.title).toBe("Не сдан — 30%");
  });

  it("not_started when there are tests but no attempts", () => {
    const r = formatCourseTestResult({
      ...base, result_status: "not_started",
      tests_attempted: 0, tests_passed: 0, latest_score: null, latest_max_score: null, latest_percent: null, attempts_used: null,
    });
    expect(r.tone).toBe("neutral");
    expect(r.title).toBe("Не проходил");
  });

  it("no_tests when the course has no tests", () => {
    const r = formatCourseTestResult({
      ...base, result_status: "no_tests",
      tests_total: 0, tests_attempted: 0, tests_passed: 0, latest_score: null, latest_max_score: null, latest_percent: null, attempts_used: null,
    });
    expect(r.tone).toBe("muted");
    expect(r.title).toBe("В курсе нет тестов");
  });

  it("multi-test summary", () => {
    const r = formatCourseTestResult({
      ...base,
      result_status: "failed",
      tests_total: 3, tests_attempted: 3, tests_passed: 2, average_percent: 78,
    });
    expect(r.title).toBe("Сдано 2 из 3");
    expect(r.subtitle).toBe("средний результат 78%");
  });

  it("hides percent when score/max_score disagree with reported percent", () => {
    const r = formatCourseTestResult({
      ...base, result_status: "passed",
      latest_score: 1, latest_max_score: 15, latest_percent: 93,
    });
    // percent hidden but pass/fail label still shown
    expect(r.title).toBe("Сдан");
  });
});
