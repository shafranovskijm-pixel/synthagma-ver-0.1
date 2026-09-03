import { describe, expect, it, vi } from "vitest";
import {
  loadGroupDocumentFacts,
  type EnrollmentFactRow,
  type FactPageRequest,
  type GroupFactsReader,
  type StudentFrdoFactRow,
} from "../../../../supabase/functions/_shared/docx-ooxml/groupDocumentFactsSource";

const scope = { organizationId: "org-a", courseId: "course-a", studentUserIds: ["u1"] };
const enrollment = (id = "e1", user = "u1"): EnrollmentFactRow => ({
  id, user_id: user, course_id: "course-a", status: "active", progress: 0, completed_at: null,
});
const frdo = (id = "f1", user = "u1"): StudentFrdoFactRow => ({
  id, user_id: user, organization_id: "org-a", passport_series: null,
  passport_number: null, education_level: null,
});
const page = <T,>(data: T[], count = data.length) => ({ data, count, error: null });
function readers(): GroupFactsReader {
  return {
    enrollments: vi.fn().mockResolvedValue(page([enrollment()])),
    studentFrdoData: vi.fn().mockResolvedValue(page([frdo()])),
  };
}

describe("server group document fact reads", () => {
  it("reads exact authorized course and organization scopes without names or browser fields", async () => {
    const reader = readers();
    const result = await loadGroupDocumentFacts(scope, reader);
    expect(reader.enrollments).toHaveBeenCalledWith({ ...scope, from: 0, to: 199 });
    expect(reader.studentFrdoData).toHaveBeenCalledWith({ ...scope, from: 0, to: 199 });
    expect(result).toEqual({ enrollments: [enrollment()], studentFrdoData: [frdo()], sourceIssues: [] });
  });

  it("chunks large rosters and keeps every user even beyond the usual API row limit", async () => {
    const users = Array.from({ length: 1105 }, (_, i) => `user-${String(i).padStart(4, "0")}`);
    const enrollmentReader = vi.fn(async (request: FactPageRequest) =>
      page(request.studentUserIds.map((user) => enrollment(`enrollment-${user}`, user))));
    const frdoReader = vi.fn(async (request: FactPageRequest) =>
      page(request.studentUserIds.map((user) => frdo(`frdo-${user}`, user))));
    const result = await loadGroupDocumentFacts({ ...scope, studentUserIds: [...users, users[0]] }, {
      enrollments: enrollmentReader, studentFrdoData: frdoReader,
    });
    expect(result.sourceIssues).toEqual([]);
    expect(result.enrollments.map((row) => row.user_id)).toEqual(users);
    expect(result.studentFrdoData).toHaveLength(1105);
    expect(enrollmentReader).toHaveBeenCalledTimes(12);
    for (const [request] of enrollmentReader.mock.calls) {
      expect(request.studentUserIds.length).toBeLessThanOrEqual(100);
      expect(request.courseId).toBe(scope.courseId);
      expect(request.organizationId).toBe(scope.organizationId);
    }
  });

  it("paginates by actual received count when the server returns a shorter page", async () => {
    const reader = readers();
    reader.enrollments = vi.fn()
      .mockResolvedValueOnce(page([enrollment("a")], 3))
      .mockResolvedValueOnce(page([enrollment("b"), enrollment("c")], 3));
    const result = await loadGroupDocumentFacts(scope, reader);
    expect(result.enrollments.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(reader.enrollments).toHaveBeenNthCalledWith(2, { ...scope, from: 1, to: 200 });
  });

  it.each([
    ["unreadable count", { data: [], count: null, error: null }, "incomplete_page"],
    ["missing rows", { data: null, count: 0, error: null }, "incomplete_page"],
    ["empty truncated page", page([], 1), "incomplete_page"],
    ["invalid count", page([], -1), "incomplete_page"],
    ["unbounded result", page([], 10001), "incomplete_page"],
    ["SQL error", { data: [enrollment()], count: 1, error: { message: "private SQL detail" } }, "read_failed"],
    ["another course", page([{ ...enrollment(), course_id: "foreign-course" }]), "scope_mismatch"],
    ["another user", page([enrollment("e2", "foreign-user")]), "scope_mismatch"],
  ])("discards %s without claiming no students exist", async (_name, response, code) => {
    const reader = readers();
    reader.enrollments = vi.fn().mockResolvedValue(response);
    const result = await loadGroupDocumentFacts(scope, reader);
    expect(result.enrollments).toEqual([]);
    expect(result.studentFrdoData).toEqual([frdo()]);
    expect(result.sourceIssues).toEqual([expect.objectContaining({ source: "enrollments", code })]);
    expect(JSON.stringify(result.sourceIssues)).not.toContain("private SQL detail");
  });

  it.each(["changed count", "repeated row", "empty next page", "network error"])(
    "discards earlier pages after %s rather than saving partial facts", async (scenario) => {
      const next = scenario === "changed count" ? page([enrollment("e2")], 3)
        : scenario === "repeated row" ? page([enrollment()], 2) : page([], 2);
      const read = vi.fn().mockResolvedValueOnce(page([enrollment()], 2));
      if (scenario === "network error") read.mockRejectedValueOnce(new Error("network"));
      else read.mockResolvedValueOnce(next);
      const result = await loadGroupDocumentFacts(scope, { ...readers(), enrollments: read });
      expect(result.enrollments).toEqual([]);
      expect(result.sourceIssues).toHaveLength(1);
      expect(result.studentFrdoData).toEqual([frdo()]);
    },
  );

  it("never uses another organization's FRDO row for an otherwise matching user", async () => {
    const result = await loadGroupDocumentFacts(scope, {
      ...readers(), studentFrdoData: vi.fn().mockResolvedValue(page([{ ...frdo(), organization_id: "foreign" }])),
    });
    expect(result.studentFrdoData).toEqual([]);
    expect(result.sourceIssues).toEqual([expect.objectContaining({ source: "student_frdo_data", code: "scope_mismatch" })]);
    expect(result.enrollments).toEqual([enrollment()]);
  });

  it("supports a student list before course enrollment and skips empty-roster requests", async () => {
    const reader = readers();
    const result = await loadGroupDocumentFacts({ ...scope, courseId: null }, reader);
    expect(reader.enrollments).not.toHaveBeenCalled();
    expect(result.studentFrdoData).toEqual([frdo()]);
    const emptyReader = readers();
    const empty = await loadGroupDocumentFacts({ ...scope, studentUserIds: [] }, emptyReader);
    expect(emptyReader.enrollments).not.toHaveBeenCalled();
    expect(emptyReader.studentFrdoData).not.toHaveBeenCalled();
    expect(empty).toEqual({ enrollments: [], studentFrdoData: [], sourceIssues: [] });
  });
});
