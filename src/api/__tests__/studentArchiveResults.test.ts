import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { setArchivedStudentRemoved } from "@/api/studentArchiveRemoval";
import { fetchStudentLearningResults } from "@/api/studentLearningResults";

describe("archive removal and learner result acknowledgements", () => {
  beforeEach(() => rpc.mockReset());
  it("requires a matching tenant/student/removal acknowledgement", async () => {
    rpc.mockResolvedValue({ data: { organization_id: "foreign", user_id: "student", removed: true }, error: null });
    await expect(setArchivedStudentRemoved("org", "student", true)).rejects.toThrow("не подтвердил");
    rpc.mockResolvedValue({ data: { organization_id: "org", user_id: "student", removed: false }, error: null });
    await expect(setArchivedStudentRemoved("org", "student", true)).rejects.toThrow("не подтвердил");
    await expect(setArchivedStudentRemoved("org", "student", false)).resolves.toBeUndefined();
  });
  it("propagates refusal instead of reporting successful deletion", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("student_must_be_archived") });
    await expect(setArchivedStudentRemoved("org", "student", true)).rejects.toThrow("student_must_be_archived");
  });
  it("does not represent a missing or foreign result payload as no enrollments", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(fetchStudentLearningResults("org", "student")).rejects.toThrow();
    rpc.mockResolvedValue({ data: { organization_id: "org", user_id: "foreign", courses: [] }, error: null });
    await expect(fetchStudentLearningResults("org", "student")).rejects.toThrow();
    rpc.mockResolvedValue({ data: { organization_id: "org", user_id: "student", courses: [] }, error: null });
    await expect(fetchStudentLearningResults("org", "student")).resolves.toEqual([]);
  });
  it("rejects duplicated or incomplete course payloads", async () => {
    rpc.mockResolvedValue({ data: { organization_id: "org", user_id: "student", courses: [{ enrollment_id: "e", tests: [] }, { enrollment_id: "e", tests: [] }] }, error: null });
    await expect(fetchStudentLearningResults("org", "student")).rejects.toThrow("неполные");
  });
});
