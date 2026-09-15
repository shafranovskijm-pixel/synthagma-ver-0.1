import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
import { fetchCourseReviewRegister } from "@/api/courseReviewRegister";

const courseId = "7630559a-6caf-42e7-97f9-1cd0e4598c39";
const row = {
  record_no: 1, status: "active", progress: 20, started_at: "2026-09-15T00:00:00Z", completed_at: null,
  tests: [{ lesson_title: "Модуль 1", score: 4, max_score: 5, completed_at: "2026-09-15T01:00:00Z" }],
  assignments: [{ lesson_title: "Работа 1", status: "revision", score: null, submitted_at: "2026-09-15T01:00:00Z", reviewed_at: null }],
};
const base = { course_id: courseId, recorded_at: "2026-09-15T02:00:00Z", enrollment_count: 1, records: [row] };

describe("course-scoped anonymised reviewer register", () => {
  beforeEach(() => { mocks.rpc.mockReset(); });
  it("requests only the specified course through its allowlisted RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: base, error: null });
    await expect(fetchCourseReviewRegister(courseId)).resolves.toEqual(base);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_course_review_register", { p_course_id: courseId });
  });
  it("accepts a confirmed empty register", async () => {
    const empty = { ...base, enrollment_count: 0, records: [] };
    mocks.rpc.mockResolvedValue({ data: empty, error: null });
    await expect(fetchCourseReviewRegister(courseId)).resolves.toEqual(empty);
  });
  it.each([
    { ...base, records: [{ ...row, user_id: "private-user" }] },
    { ...base, records: [{ ...row, full_name: "private name" }] },
    { ...base, records: [{ ...row, tests: [{ ...row.tests[0], answers: {} }] }] },
    { ...base, records: [{ ...row, assignments: [{ ...row.assignments[0], content: "private answer" }] }] },
    { ...base, course_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    { ...base, enrollment_count: 0 },
  ])("rejects private fields, foreign scope or inconsistent counts", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(fetchCourseReviewRegister(courseId)).rejects.toThrow();
  });
  it("does not turn an access error into an empty register", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Course review is unavailable" } });
    await expect(fetchCourseReviewRegister(courseId)).rejects.toThrow("Course review is unavailable");
  });
});
