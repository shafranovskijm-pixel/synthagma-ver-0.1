import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("approved organization navigation regressions", () => {
  it("returns organization course workflows to the explicit Courses workspace", () => {
    expect(read("src/hooks/useCourseBuilder.ts")).toContain('"/organization?tab=courses"');
    expect(read("src/hooks/useCourseDetails.ts")).toContain('navigate("/organization?tab=courses")');

    const editor = read("src/pages/CourseEditor.tsx");
    expect(editor).toContain('getAdminAwareBackPath("/organization?tab=courses")');

    const importer = read("src/pages/CourseImport.tsx");
    expect(importer).toContain('getAdminAwareBackPath("/organization?tab=courses")');
    expect(importer).not.toContain("getAdminAwareBackPath()");
  });

  it("uses Home for the organization breadcrumb and leaves actions to contextual chips", () => {
    const header = read("src/components/organization/OrgDashboardHeader.tsx");
    expect(header).toContain('setActiveTab("home")');
    expect(header).not.toContain("activeTab === \"students\" && (");
    expect(header).not.toContain("activeTab === \"organizations\" && (");
    expect(header).not.toContain("activeTab === \"sales\" && (");
  });
});
