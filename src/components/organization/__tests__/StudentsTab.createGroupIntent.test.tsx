import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    tabNavigation: { openGroupFolder: vi.fn() },
  }),
}));

vi.mock("@/hooks/useWordDocumentGenerator", () => ({
  useWordDocumentGenerator: () => ({ generateDocument: vi.fn(), isGenerating: false }),
}));

vi.mock("@/hooks/useStudents", () => ({
  useStudents: () => ({
    students: [],
    isLoading: false,
    isError: false,
    error: null,
    errorKind: null,
    nextPageErrorKind: null,
    frdoStatus: new Map(),
    selectedStudentIds: new Set(),
    setSelectedStudentIds: vi.fn(),
    toggleSelection: vi.fn(),
    toggleSelectAll: vi.fn(),
    getSelectedUserIds: vi.fn(() => []),
    statusFilter: "all",
    setStatusFilter: vi.fn(),
    courseFilter: "all",
    setCourseFilter: vi.fn(),
    groupFilter: "all",
    setGroupFilter: vi.fn(),
    studentGroups: [],
    refreshGroups: vi.fn(),
    studentGroupMap: new Map(),
    groupCounts: new Map(),
    countsLoading: false,
    countsErrorKind: null,
    countsInconsistent: false,
    retryCounts: vi.fn(),
    groupCountsLoading: false,
    groupCountsErrorKind: null,
    retryGroupCounts: vi.fn(),
    docsFilter: "all",
    setDocsFilter: vi.fn(),
    searchQuery: "",
    setSearchQuery: vi.fn(),
    removeStudent: vi.fn(),
    activeStudentsCount: 0,
    archivedCount: 0,
    archiveByMonth: [],
    archiveStudent: vi.fn(),
    unarchiveStudent: vi.fn(),
    refresh: vi.fn(),
    refreshRows: vi.fn(),
    loadMore: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    loadedCount: 0,
    totalFiltered: 0,
    retryNextPage: vi.fn(),
    fetchStudentCredentialsOnDemand: vi.fn(),
  }),
}));

vi.mock("@/components/organization/GroupSettingsDialog", () => ({
  GroupSettingsDialog: () => null,
}));
vi.mock("@/components/organization/tabs/students/StudentTableRow", () => ({ StudentTableRow: () => null }));
vi.mock("@/components/organization/tabs/students/StudentMobileCard", () => ({ StudentMobileCard: () => null }));
vi.mock("@/components/organization/tabs/students/StudentsEmptyState", () => ({ StudentsEmptyState: () => null }));
vi.mock("@/components/organization/tabs/students/StudentConfirmDialogs", () => ({ StudentConfirmDialogs: () => null }));

import { StudentsTab } from "@/components/organization/tabs/StudentsTab";

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe">{location.pathname}{location.search}</span>;
}

describe("StudentsTab create-group URL intent", () => {
  it("opens the dialog after mount, preselects the course and consumes one-shot params", async () => {
    render(
      <MemoryRouter initialEntries={[
        "/organization?tab=students&studentsView=groups&createGroup=1&groupCourseId=course-1",
      ]}>
        <StudentsTab
          organizationId="org-1"
          courses={[{ id: "course-1", title: "Охрана труда" }] as any}
          onViewStudent={vi.fn()}
          onCopyCredentials={vi.fn()}
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Управление группами")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Охрана труда");
    await waitFor(() =>
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/organization?tab=students&studentsView=groups",
      ),
    );
  });
});
