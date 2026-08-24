import { describe, it, expect } from "vitest";
import {
  studentDetailsPath,
  courseDetailsPathForGroup,
  groupFolderPath,
  groupContextPath,
  filterByGroupMembers,
  courseCompletedNotificationPath,
  resolveTabParams,
} from "@/lib/groups/groupContext";

describe("groupContext", () => {
  it("builds student and course paths", () => {
    expect(studentDetailsPath("u-1")).toBe("/organization?tab=student-details&studentId=u-1");
    expect(courseDetailsPathForGroup("c-1")).toBe("/organization?tab=course-details&courseId=c-1");
  });

  it("builds group folder path with and without folder", () => {
    expect(groupFolderPath("g-1")).toBe("/organization?tab=group-folder&studentsView=groups&groupId=g-1");
    expect(groupFolderPath("g-1", "docs")).toContain("&folder=docs");
  });

  it("passes groupId, courseId and returnToGroupId to journals/frdo", () => {
    const url = groupContextPath("frdo", { groupId: "g-1", courseId: "c-1" });
    const q = new URLSearchParams(url.split("?")[1]);
    expect(q.get("tab")).toBe("frdo");
    expect(q.get("groupId")).toBe("g-1");
    expect(q.get("courseId")).toBe("c-1");
    expect(q.get("returnToGroupId")).toBe("g-1");
  });

  it("omits absent context values", () => {
    expect(groupContextPath("journals", {})).toBe("/organization?tab=journals");
  });

  it("filters rows by group members only when member list is provided", () => {
    const rows = [{ user_id: "a" }, { user_id: "b" }];
    expect(filterByGroupMembers(rows, ["b"])).toEqual([{ user_id: "b" }]);
    expect(filterByGroupMembers(rows, null)).toEqual(rows);
    expect(filterByGroupMembers(rows, [])).toEqual([]);
  });

  it("course_completed notification opens student card, falls back to course", () => {
    const fallback = (id: string) => `/course/${id}`;
    expect(courseCompletedNotificationPath({ user_id: "u-9", related_id: "c-1" }, fallback))
      .toBe("/organization?tab=student-details&studentId=u-9");
    expect(courseCompletedNotificationPath({ user_id: null, related_id: "c-1" }, fallback))
      .toBe("/course/c-1");
    expect(courseCompletedNotificationPath({}, fallback)).toBeNull();
  });

  it("keeps the add-students intent in the URL until the group workspace mounts", () => {
    expect(groupFolderPath("group-1", null, { addStudents: true })).toBe(
      "/organization?tab=group-folder&studentsView=groups&groupId=group-1&addStudents=1",
    );
  });

  it("removes one-shot group intents when navigating to another workspace", () => {
    const next = resolveTabParams(
      "tab=group-folder&studentsView=groups&groupId=group-1&addStudents=1&createGroup=1&groupCourseId=course-1",
      "courses",
    );

    expect(next.get("addStudents")).toBeNull();
    expect(next.get("createGroup")).toBeNull();
    expect(next.get("groupCourseId")).toBeNull();
  });
});
