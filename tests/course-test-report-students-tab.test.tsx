// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CourseDetailsContent } from "../src/components/organization/CourseDetailsContent";

const ports = vi.hoisted(() => ({
  database: vi.fn(() => { throw new Error("Unexpected database access in tab routing test"); }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: ports.database, rpc: ports.database,
  storage: { from: ports.database }, functions: { invoke: ports.database },
} }));
vi.mock("@/hooks/useOrgFeatures", () => ({ useOrgFeatures: () => ({ isEnabled: () => false }) }));
vi.mock("@/hooks/useCourseDetails", () => ({ useCourseDetails: () => ({
  isLoadingStats: false, statsErrorKind: null, totalStudents: 0,
  courseStudents: [], showDeleteConfirm: false, resetConfirmStudent: null,
  isDeleting: false, isResetting: false, defaultAccessDays: null,
  setShowDeleteConfirm: vi.fn(), setResetConfirmStudent: vi.fn(),
}) }));
vi.mock("@/components/organization/CourseTestReport", () => ({
  CourseTestReport: ({ courseId, courseName, organizationId }: {courseId:string;courseName:string;organizationId:string}) => (
    <section data-testid="course-test-report" data-course-id={courseId} data-org-id={organizationId}>{courseName}</section>
  ),
}));
vi.mock("@/components/organization/EnrollmentRequestsTab", () => ({ EnrollmentRequestsTab: () => <div data-testid="requests-panel" /> }));
vi.mock("@/components/organization/CourseSettingsTabbed", () => ({ CourseSettingsTabbed: () => <div data-testid="settings-panel" /> }));
vi.mock("@/components/organization/CourseDocumentsManager", () => ({ CourseDocumentsManager: () => null }));
vi.mock("@/components/organization/CancelCourseAssignmentButton", () => ({ CancelCourseAssignmentButton: () => null }));
vi.mock("@/components/course-library/CourseLibraryManager", () => ({ CourseLibraryManager: () => null }));
vi.mock("@/components/organization/CourseRemindersTab", () => ({ CourseRemindersTab: () => null }));
vi.mock("@/components/organization/CourseGroupsTab", () => ({ CourseGroupsTab: () => null }));
vi.mock("@/components/organization/CourseAchievementsTab", () => ({ CourseAchievementsTab: () => null }));
vi.mock("@/components/course-editor/CoursePageSettingsContent", () => ({ CoursePageSettingsContent: () => null }));
vi.mock("@/hooks/useStaffPermissions", () => ({ RequirePerm: ({children}: {children:React.ReactNode}) => <>{children}</> }));

const courseA = {
  id: "10000000-0000-4000-8000-000000000001", title: "Synthetic report A",
  description: null, is_published: false, created_at: "2026-10-26T00:00:00Z",
  lessonsCount: 0, studentsCount: 0, landing_content: null,
};
const orgA = "20000000-0000-4000-8000-000000000001";
function Navigation({course = courseA, organizationId = orgA}) {
  const [activeTab, setActiveTab] = useState<"requests" | "tests" | "settings">("requests");
  return <CourseDetailsContent course={course} courseStudents={[]} organizationId={organizationId}
    activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as typeof activeTab)} onEnrollStudent={() => {}} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Prefetch is unrelated to tab routing and must not start lazy remote modules.
  vi.stubGlobal("requestIdleCallback", vi.fn(() => 1));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Course report integration in students navigation", () => {
  it("opens one scoped report from the tests subtab, updates its scope and unmounts it in non-students content", () => {
    const view = render(<Navigation />);
    expect(screen.queryByTestId("course-test-report")).toBeNull();
    expect(screen.getByTestId("requests-panel")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Результаты тестов/ }));
    const report = screen.getByTestId("course-test-report");
    expect(screen.getAllByTestId("course-test-report")).toHaveLength(1);
    expect(report.getAttribute("data-course-id")).toBe(courseA.id);
    expect(report.getAttribute("data-org-id")).toBe(orgA);
    expect(report.textContent).toBe(courseA.title);
    expect(screen.queryByTestId("requests-panel")).toBeNull();

    const courseB = { ...courseA, id: "10000000-0000-4000-8000-000000000002", title: "Synthetic report B" };
    const orgB = "20000000-0000-4000-8000-000000000002";
    view.rerender(<Navigation course={courseB} organizationId={orgB} />);
    expect(screen.getAllByTestId("course-test-report")).toHaveLength(1);
    expect(screen.getByTestId("course-test-report").getAttribute("data-course-id")).toBe(courseB.id);
    expect(screen.getByTestId("course-test-report").getAttribute("data-org-id")).toBe(orgB);
    expect(screen.getByTestId("course-test-report").textContent).toBe(courseB.title);

    fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
    expect(screen.queryByTestId("course-test-report")).toBeNull();
    expect(screen.getByTestId("settings-panel")).toBeTruthy();
    expect(ports.database).not.toHaveBeenCalled();
  });
});
