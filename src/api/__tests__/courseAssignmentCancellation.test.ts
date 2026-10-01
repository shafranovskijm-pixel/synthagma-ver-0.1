import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), read: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc, from: state.from } }));
import { cancelCourseAssignment, courseAssignmentCancellationError } from "@/api/courseAssignmentCancellation";
import { bulkUnenrollStudents, unenrollStudent } from "@/api/students";

const input = { enrollmentId: "enrollment-1", organizationId: "org-1" };
const confirmed = { cancelled: true, ...input, userId: "student-1", courseId: "course-1" };

beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockResolvedValue({ data: confirmed, error: null });
  state.read.mockResolvedValue({ data: null, error: null });
  state.from.mockImplementation((table: string) => {
    if (table !== "enrollments") throw new Error(`Unexpected table: ${table}`);
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: state.read };
    return query;
  });
});

describe("verified course assignment cancellation", () => {
  it("cancels only through the tenant-scoped RPC and verifies absence", async () => {
    await expect(cancelCourseAssignment(input)).resolves.toEqual(confirmed);
    expect(state.rpc).toHaveBeenCalledWith("cancel_course_assignment", {
      p_enrollment_id: "enrollment-1", p_organization_id: "org-1",
    });
    expect(state.read).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { ...confirmed, cancelled: false }, { ...confirmed, enrollmentId: "other" }, { ...confirmed, organizationId: "other" },
    { ...confirmed, userId: 1 }, { ...confirmed, courseId: {} }])(
    "rejects a no-op or mismatched server confirmation: %j", async (data) => {
      state.rpc.mockResolvedValue({ data, error: null });
      await expect(cancelCourseAssignment(input)).rejects.toThrow("assignment_verification_failed");
      expect(state.read).not.toHaveBeenCalled();
    },
  );
  it.each([{ data: { id: "enrollment-1" }, error: null }, { data: null, error: { message: "network" } }])(
    "does not report success when persistence cannot be verified: %j", async (result) => {
      state.read.mockResolvedValue(result);
      await expect(cancelCourseAssignment(input)).rejects.toThrow("assignment_verification_failed");
      await expect(unenrollStudent("enrollment-1", "org-1")).resolves.toBe(false);
    },
  );
  it("does not fall back to an unguarded DELETE if the RPC is unavailable", async () => {
    const error = { code: "PGRST202", message: "Could not find the function" };
    state.rpc.mockResolvedValue({ data: null, error });
    await expect(cancelCourseAssignment(input)).rejects.toEqual(error);
    expect(state.from).not.toHaveBeenCalled();
    expect(courseAssignmentCancellationError(error)).toContain("ещё недоступна");
  });
  it("keeps progressed and document-bearing assignments as explicit failures in bulk", async () => {
    state.rpc.mockResolvedValueOnce({ data: confirmed, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "assignment_has_learning_history" } })
      .mockResolvedValueOnce({ data: null, error: { message: "assignment_has_dependent_records" } });
    const result = await bulkUnenrollStudents(["enrollment-1", "enrollment-1", "enrollment-2", "enrollment-3"], "org-1");
    expect(result).toMatchObject({ success: 1, failed: 2 });
    expect(result.errors[0]).toContain("Обучение уже начато");
    expect(result.errors[1]).toContain("документы");
    expect(state.rpc).toHaveBeenCalledTimes(3);
  });
  it("rejects missing organization context before a write", async () => {
    await expect(cancelCourseAssignment({ ...input, organizationId: null })).rejects.toThrow("assignment_forbidden");
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
