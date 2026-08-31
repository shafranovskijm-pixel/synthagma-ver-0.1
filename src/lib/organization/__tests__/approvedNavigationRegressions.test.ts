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

  it("keeps unfinished CRM and demo course payments out of the organization shell", () => {
    const sidebar = read("src/components/organization/OrgSidebar.tsx");
    expect(sidebar).not.toContain('label: "Продажи"');

    const secondary = read("src/components/organization/OrgSecondaryNavTabs.tsx");
    expect(secondary).not.toContain('label: "Продажи"');

    const renderer = read("src/components/organization/tabs/TabContentRenderer.tsx");
    expect(renderer).not.toContain("OrgSalesManager");
    expect(renderer).not.toContain("PaymentsTab");

    const subscription = read("src/components/organization/SubscriptionTab.tsx");
    expect(subscription).not.toContain('setActiveTab("payments"');
    expect(subscription).not.toContain("handlePayOnline");

    const documents = read("src/components/organization/tabs/DocumentsTab.tsx");
    expect(documents).not.toContain('next.set("tab", "sales")');
    expect(documents).not.toContain("> Продажи");

    const onboarding = read("src/constants/onboardingSteps.ts");
    expect(onboarding).not.toContain('id: "sales"');

    const staff = read("src/components/organization/StaffManager.tsx");
    expect(staff).not.toContain("CRM-задачи");
    expect(staff).not.toContain("canReceiveCrmTasks");
    expect(staff).not.toContain("Менеджер по продажам");
    expect(staff).toContain("Специалист по рассылкам");

    const customRoles = read("src/components/staff/OrgCustomRolesManager.tsx");
    expect(customRoles).not.toContain('sales: { label: "Продажи"');
    expect(customRoles).toContain('mailing: { label: "Рассылки", perms: ["sales.read", "sales.write"] }');

    const permissionMatrix = read("src/components/staff/PermissionMatrix.tsx");
    expect(permissionMatrix).toContain('{ key: "sales.write", label: "Рассылки" }');
  });
});
