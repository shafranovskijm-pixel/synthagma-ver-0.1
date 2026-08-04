import { describe, it, expect } from "vitest";
import { groupContextPath, groupFolderPath, resolveTabParams } from "@/lib/groups/groupContext";

const GROUP = "0cd9dd54-af40-4899-bd94-9d3c1a728d38";
const COURSE = "11111111-2222-3333-4444-555555555555";

function q(path: string) {
  return new URLSearchParams(path.split("?")[1] ?? "");
}

describe("group context navigation", () => {
  it("groupContextPath builds full context for journals and frdo", () => {
    for (const tab of ["journals", "frdo"] as const) {
      const p = q(groupContextPath(tab, { groupId: GROUP, courseId: COURSE }));
      expect(p.get("tab")).toBe(tab);
      expect(p.get("groupId")).toBe(GROUP);
      expect(p.get("courseId")).toBe(COURSE);
      expect(p.get("returnToGroupId")).toBe(GROUP);
    }
  });

  it("keeps groupId+courseId+returnToGroupId when dashboard re-applies the same tab", () => {
    for (const tab of ["journals", "frdo"] as const) {
      const start = q(groupContextPath(tab, { groupId: GROUP, courseId: COURSE }));
      const next = resolveTabParams(start, tab);
      expect(next.get("tab")).toBe(tab);
      expect(next.get("groupId")).toBe(GROUP);
      expect(next.get("courseId")).toBe(COURSE);
      expect(next.get("returnToGroupId")).toBe(GROUP);
    }
  });

  it("switches between journals and frdo without losing context", () => {
    const start = q(groupContextPath("journals", { groupId: GROUP, courseId: COURSE }));
    const next = resolveTabParams(start, "frdo");
    expect(next.get("tab")).toBe("frdo");
    expect(next.get("groupId")).toBe(GROUP);
    expect(next.get("courseId")).toBe(COURSE);
    expect(next.get("returnToGroupId")).toBe(GROUP);
  });

  it("clears the whole group context when leaving to a normal tab", () => {
    const start = q(groupContextPath("journals", { groupId: GROUP, courseId: COURSE }));
    const next = resolveTabParams(start, "library");
    expect(next.get("tab")).toBe("library");
    expect(next.get("groupId")).toBeNull();
    expect(next.get("courseId")).toBeNull();
    expect(next.get("returnToGroupId")).toBeNull();
    expect(next.get("folder")).toBeNull();
  });

  it("does not leak group context into journals opened from the sidebar", () => {
    const next = resolveTabParams("tab=courses", "journals");
    expect(next.get("tab")).toBe("journals");
    expect(next.get("groupId")).toBeNull();
    expect(next.get("courseId")).toBeNull();
    expect(next.get("returnToGroupId")).toBeNull();
  });

  it("does not treat a stray groupId without returnToGroupId as group context", () => {
    const next = resolveTabParams(`tab=journals&groupId=${GROUP}&courseId=${COURSE}`, "journals");
    expect(next.get("groupId")).toBeNull();
    expect(next.get("courseId")).toBeNull();
  });

  it("keeps course-details / student-details / group-folder behaviour intact", () => {
    const course = resolveTabParams(`tab=courses&courseId=${COURSE}`, "course-details");
    expect(course.get("courseId")).toBe(COURSE);

    const student = resolveTabParams("tab=students&studentId=u1", "student-details");
    expect(student.get("studentId")).toBe("u1");

    const folder = resolveTabParams(`tab=students&groupId=${GROUP}&folder=contracts`, "group-folder");
    expect(folder.get("groupId")).toBe(GROUP);
    expect(folder.get("folder")).toBe("contracts");

    // courses is the default tab: no explicit tab param
    expect(resolveTabParams("tab=library", "courses").get("tab")).toBeNull();
  });

  it("back link from the banner returns to the exact group folder", () => {
    const back = q(groupFolderPath(GROUP));
    expect(back.get("tab")).toBe("students");
    expect(back.get("studentsView")).toBe("groups");
    expect(back.get("groupId")).toBe(GROUP);
  });
});
