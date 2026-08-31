import { describe, expect, it } from "vitest";
import {
  normalizeOrganizationWorkspaceTab,
  organizationTabPath,
  resolveStudentsViewParams,
  studentsViewFromParams,
} from "@/lib/organization/workspaceNavigation";
import {
  companiesPath,
  groupFolderPath,
  resolveTabParams,
  studentDetailsPath,
} from "@/lib/groups/groupContext";

describe("organization multi-window navigation", () => {
  it("gives top-level workspaces independent canonical URLs", () => {
    expect(organizationTabPath("home")).toBe("/organization");
    expect(organizationTabPath("courses")).toBe("/organization?tab=courses");
    expect(organizationTabPath("students")).toBe("/organization?tab=students");
    expect(organizationTabPath("organizations")).toBe("/organization?tab=organizations");
  });

  it("keeps legacy Sales and demo payments out of organization URLs", () => {
    expect(normalizeOrganizationWorkspaceTab("sales")).toBe("home");
    expect(normalizeOrganizationWorkspaceTab("payments")).toBe("subscription");
    expect(organizationTabPath("sales")).toBe("/organization");
    expect(organizationTabPath("payments")).toBe("/organization?tab=subscription");
  });

  it("gives student, company and group records stable deep links", () => {
    expect(studentDetailsPath("student-1"))
      .toBe("/organization?tab=student-details&studentId=student-1");
    expect(companiesPath("company-1"))
      .toBe("/organization?tab=organizations&companyId=company-1");
    expect(groupFolderPath("group-1"))
      .toBe("/organization?tab=group-folder&studentsView=groups&groupId=group-1");
  });

  it("derives the students view only from that window URL", () => {
    expect(studentsViewFromParams("tab=students&studentsView=active")).toBe("active");
    expect(studentsViewFromParams("tab=students&studentsView=archive")).toBe("archive");
    expect(studentsViewFromParams("tab=students")).toBe("groups");
    expect(studentsViewFromParams("tab=students&studentsView=invalid")).toBe("groups");
  });

  it("switches students view without leaking an opened entity", () => {
    const next = resolveStudentsViewParams(
      "tab=student-details&studentId=s1&companyId=c1&groupId=g1&folder=docs",
      "archive",
    );
    expect(next.get("tab")).toBe("students");
    expect(next.get("studentsView")).toBe("archive");
    expect(next.get("studentId")).toBeNull();
    expect(next.get("companyId")).toBeNull();
    expect(next.get("groupId")).toBeNull();
    expect(next.get("folder")).toBeNull();
  });

  it("cleans window-specific params when the sidebar changes workspace", () => {
    const start = "tab=organizations&companyId=c1&studentsView=archive&studentId=s1&groupSettings=1";
    const next = resolveTabParams(start, "library");
    expect(next.get("tab")).toBe("library");
    expect(next.get("companyId")).toBeNull();
    expect(next.get("studentsView")).toBeNull();
    expect(next.get("studentId")).toBeNull();
    expect(next.get("groupSettings")).toBeNull();
  });

  it("preserves an explicit company deep link when resolving its workspace", () => {
    const next = resolveTabParams("tab=organizations&companyId=company-1", "organizations");
    expect(next.get("tab")).toBe("organizations");
    expect(next.get("companyId")).toBe("company-1");
  });

  it("does not carry a group folder into a clean Students workspace", () => {
    const next = resolveTabParams(
      "tab=group-folder&studentsView=groups&groupId=group-1&folder=documents&groupSettings=1",
      "students",
    );
    expect(next.get("tab")).toBe("students");
    expect(next.get("groupId")).toBeNull();
    expect(next.get("folder")).toBeNull();
    expect(next.get("groupSettings")).toBeNull();
  });
});
