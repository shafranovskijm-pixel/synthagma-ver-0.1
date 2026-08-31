import { describe, expect, it, vi } from "vitest";
import type { CourseStudentPageRow, FetchCourseStudentsPageInput } from "@/api/courseStudents";
import { fetchOrganizationStudentResults } from "@/api/organizationStudentResults";

function makePageRow(userId: string): CourseStudentPageRow {
  return {
    id: `profile-${userId}`,
    user_id: userId,
    enrollment_id: `enrollment-${userId}`,
    name: `Ученик ${userId}`,
    email: `${userId}@example.ru`,
    login: null,
    progress: 50,
    status: "active",
    started_at: null,
    completed_at: null,
    time_spent: 0,
    archived_at: null,
    tests_total: 1,
    tests_attempted: 0,
    tests_passed: 0,
    average_percent: 0,
    latest_score: null,
    latest_max_score: null,
    latest_percent: null,
    latest_passing_score: 60,
    attempts_used: null,
    last_attempt_at: null,
    result_status: "not_started",
    test_details: [],
  };
}

describe("fetchOrganizationStudentResults", () => {
  it("loads every organization course sequentially and follows every 100-row page", async () => {
    const loadCourses = vi.fn().mockResolvedValue([
      { id: "course-1", title: "Курс 1" },
      { id: "course-2", title: "Курс 2" },
    ]);
    const loadCoursePage = vi.fn(async ({ courseId, offset }: FetchCourseStudentsPageInput) => {
      if (courseId === "course-1" && offset === 0) {
        return {
          rows: Array.from({ length: 100 }, (_, index) => makePageRow(String(index + 1))),
          totalFiltered: 101,
          nextOffset: 100,
        };
      }
      if (courseId === "course-1" && offset === 100) {
        return { rows: [makePageRow("101")], totalFiltered: 101, nextOffset: null };
      }
      return { rows: [makePageRow("201")], totalFiltered: 1, nextOffset: null };
    });
    const progress = vi.fn();
    const loadCourseTests = vi.fn().mockResolvedValue([{
      id: "test-1",
      title: "Итоговый тест",
      passingScore: 60,
      orderIndex: 0,
    }]);

    const rows = await fetchOrganizationStudentResults({
      organizationId: "org-goreltech",
      onProgress: progress,
    }, { loadCourses, loadCourseTests, loadCoursePage });

    expect(loadCourses).toHaveBeenCalledWith("org-goreltech", undefined);
    expect(loadCoursePage.mock.calls.map(([input]) => [input.courseId, input.offset, input.limit])).toEqual([
      ["course-1", 0, 100],
      ["course-1", 100, 100],
      ["course-2", 0, 100],
    ]);
    expect(rows).toHaveLength(102);
    expect(rows[0]).toMatchObject({ user_id: "1", course_id: "course-1", course_title: "Курс 1" });
    expect(rows[100]).toMatchObject({ user_id: "101", course_id: "course-1", course_title: "Курс 1" });
    expect(rows[101]).toMatchObject({ user_id: "201", course_id: "course-2", course_title: "Курс 2" });
    expect(rows.every((row) => row.course_tests[0]?.id === "test-1")).toBe(true);
    expect(progress).toHaveBeenLastCalledWith({ completedCourses: 2, totalCourses: 2 });
  });

  it("rejects the entire report when one course page fails", async () => {
    const loadCoursePage = vi.fn(async ({ courseId }: FetchCourseStudentsPageInput) => {
      if (courseId === "course-2") throw new Error("database unavailable");
      return { rows: [makePageRow("1")], totalFiltered: 1, nextOffset: null };
    });

    await expect(fetchOrganizationStudentResults({
      organizationId: "org-goreltech",
    }, {
      loadCourses: async () => [
        { id: "course-1", title: "Курс 1" },
        { id: "course-2", title: "Курс 2" },
      ],
      loadCourseTests: async () => [{
        id: "test-1",
        title: "Тест",
        passingScore: 60,
        orderIndex: 0,
      }],
      loadCoursePage,
    })).rejects.toThrow("database unavailable");
  });

  it("fails closed when organization is missing or pagination goes backwards", async () => {
    await expect(fetchOrganizationStudentResults({ organizationId: " " }, {
      loadCourses: async () => [],
    })).rejects.toThrow("Не указана организация");

    await expect(fetchOrganizationStudentResults({ organizationId: "org-goreltech" }, {
      loadCourses: async () => [{ id: "course-1", title: "Курс 1" }],
      loadCourseTests: async () => [{
        id: "test-1",
        title: "Тест",
        passingScore: 60,
        orderIndex: 0,
      }],
      loadCoursePage: async () => ({ rows: [], totalFiltered: 2, nextOffset: 0 }),
    })).rejects.toThrow("Некорректная следующая страница");
  });

  it("fails instead of publishing a partial report when the course test list is incomplete", async () => {
    await expect(fetchOrganizationStudentResults({ organizationId: "org-goreltech" }, {
      loadCourses: async () => [{ id: "course-1", title: "Курс 1" }],
      loadCourseTests: async () => [],
      loadCoursePage: async () => ({
        rows: [makePageRow("1")],
        totalFiltered: 1,
        nextOffset: null,
      }),
    })).rejects.toThrow("полный список тестов курса");
  });

  it("forwards cancellation to the course page loader and rejects after an in-flight page", async () => {
    const controller = new AbortController();
    const loadCoursePage = vi.fn(async (input: FetchCourseStudentsPageInput) => {
      expect(input.signal).toBe(controller.signal);
      controller.abort();
      return { rows: [makePageRow("1")], totalFiltered: 1, nextOffset: null };
    });

    await expect(fetchOrganizationStudentResults({
      organizationId: "org-goreltech",
      signal: controller.signal,
    }, {
      loadCourses: async () => [{ id: "course-1", title: "Курс 1" }],
      loadCourseTests: async () => [{
        id: "test-1",
        title: "Тест",
        passingScore: 60,
        orderIndex: 0,
      }],
      loadCoursePage,
    })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("fails when course enrollment pages repeat the same enrollment", async () => {
    await expect(fetchOrganizationStudentResults({ organizationId: "org-goreltech" }, {
      loadCourses: async () => [{ id: "course-1", title: "Курс 1" }],
      loadCourseTests: async () => [{
        id: "test-1",
        title: "Тест",
        passingScore: 60,
        orderIndex: 0,
      }],
      loadCoursePage: async ({ offset }) => ({
        rows: [makePageRow("1")],
        totalFiltered: 2,
        nextOffset: offset === 0 ? 1 : null,
      }),
    })).rejects.toThrow("повторяющиеся зачисления");
  });
});
