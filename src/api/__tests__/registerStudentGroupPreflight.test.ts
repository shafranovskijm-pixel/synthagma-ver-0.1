import { beforeEach, describe, expect, it, vi } from "vitest";
import { preflightRegistrationStudentGroup } from "../../../supabase/functions/_shared/registration-student-group.ts";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const GROUP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COURSE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const from = vi.fn();
const groupRead = vi.fn();
const courseRead = vi.fn();
const eq = vi.fn();
const db = (table: "student_groups" | "courses", id: string) => from(table)
  .select(table === "student_groups" ? "id, organization_id, course_id" : "id, organization_id")
  .eq("id", id).maybeSingle();

describe("registration group and implicit-course tenant guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockImplementation(table => ({ select: () => ({ eq: (column: string, id: string) => {
      eq(table, column, id);
      return { maybeSingle: table === "student_groups" ? groupRead : courseRead };
    } }) }));
    groupRead.mockResolvedValue({ data: { id: GROUP, organization_id: ORG, course_id: null }, error: null });
    courseRead.mockResolvedValue({ data: { id: COURSE, organization_id: ORG }, error: null });
  });

  it.each([null, undefined, ""])("leaves no-group registration unchanged: %s", async value => {
    expect(await preflightRegistrationStudentGroup(db, ORG, value)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it.each(["bad", " aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", [], {}, 0, false])("rejects malformed group identifiers before any read: %j", async value => {
    expect(await preflightRegistrationStudentGroup(db, ORG, value)).toMatchObject({ status: 400, code: "INVALID_STUDENT_GROUP_ID" });
    expect(from).not.toHaveBeenCalled();
  });
  it("accepts the existing same-tenant group without a course", async () => {
    expect(await preflightRegistrationStudentGroup(db, ORG, GROUP.toUpperCase())).toBeNull();
    expect(eq).toHaveBeenCalledWith("student_groups", "id", GROUP.toUpperCase());
    expect(courseRead).not.toHaveBeenCalled();
  });
  it.each([
    [null, 404, "STUDENT_GROUP_NOT_FOUND"],
    [{ id: GROUP, organization_id: OTHER, course_id: null }, 403, "STUDENT_GROUP_ORGANIZATION_MISMATCH"],
    [{ id: OTHER, organization_id: ORG, course_id: null }, 500, "GROUP_PREFLIGHT_FAILED"],
    [{ id: GROUP, organization_id: ORG }, 500, "GROUP_COURSE_PREFLIGHT_FAILED"],
    [{ id: GROUP, organization_id: ORG, course_id: "invalid" }, 500, "GROUP_COURSE_PREFLIGHT_FAILED"],
    [undefined, 500, "GROUP_PREFLIGHT_FAILED"],
  ])("rejects missing, foreign, or malformed group facts", async (data, status, code) => {
    groupRead.mockResolvedValue({ data, error: null });
    expect(await preflightRegistrationStudentGroup(db, ORG, GROUP)).toMatchObject({ status, code });
    expect(courseRead).not.toHaveBeenCalled();
  });
  it.each(["returned", "thrown"])("fails closed on a %s group read failure", async kind => {
    if (kind === "returned") groupRead.mockResolvedValue({ data: null, error: new Error("offline") });
    else groupRead.mockRejectedValue(new Error("offline"));
    expect(await preflightRegistrationStudentGroup(db, ORG, GROUP)).toMatchObject({ status: 500, code: "GROUP_PREFLIGHT_FAILED" });
  });
  it("accepts a same-tenant implicit course after reading it by its exact id", async () => {
    groupRead.mockResolvedValue({ data: { id: GROUP, organization_id: ORG, course_id: COURSE }, error: null });
    expect(await preflightRegistrationStudentGroup(db, ORG, GROUP)).toBeNull();
    expect(eq).toHaveBeenCalledWith("courses", "id", COURSE);
  });
  it.each([
    [null, 404, "GROUP_COURSE_NOT_FOUND"],
    [{ id: COURSE, organization_id: OTHER }, 403, "GROUP_COURSE_ORGANIZATION_MISMATCH"],
    [{ id: OTHER, organization_id: ORG }, 500, "GROUP_COURSE_PREFLIGHT_FAILED"],
    [undefined, 500, "GROUP_COURSE_PREFLIGHT_FAILED"],
  ])("rejects missing, foreign, or malformed implicit course facts", async (data, status, code) => {
    groupRead.mockResolvedValue({ data: { id: GROUP, organization_id: ORG, course_id: COURSE }, error: null });
    courseRead.mockResolvedValue({ data, error: null });
    expect(await preflightRegistrationStudentGroup(db, ORG, GROUP)).toMatchObject({ status, code });
  });
  it.each(["returned", "thrown"])("fails closed on a %s implicit-course read failure", async kind => {
    groupRead.mockResolvedValue({ data: { id: GROUP, organization_id: ORG, course_id: COURSE }, error: null });
    if (kind === "returned") courseRead.mockResolvedValue({ data: null, error: new Error("offline") });
    else courseRead.mockRejectedValue(new Error("offline"));
    expect(await preflightRegistrationStudentGroup(db, ORG, GROUP)).toMatchObject({ status: 500, code: "GROUP_COURSE_PREFLIGHT_FAILED" });
  });
});
