import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentsTab } from "@/components/organization/tabs/StudentsTab";

const state = vi.hoisted(() => ({ active: 0, archived: 79, loading: false, error: null as string | null }));
vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({ tabNavigation: { openGroupFolder: vi.fn() } }),
}));
vi.mock("@/hooks/useWordDocumentGenerator", () => ({
  useWordDocumentGenerator: () => ({ generateDocument: vi.fn(), isGenerating: false }),
}));
vi.mock("@/hooks/useStudents", () => ({ useStudents: () => ({
  students: [], isLoading: false, isError: false, error: null, errorKind: null, nextPageErrorKind: null,
  frdoStatus: new Map(), selectedStudentIds: new Set(), setSelectedStudentIds: vi.fn(), toggleSelection: vi.fn(),
  toggleSelectAll: vi.fn(), getSelectedUserIds: vi.fn(() => []), statusFilter: "all", setStatusFilter: vi.fn(),
  courseFilter: "all", setCourseFilter: vi.fn(), groupFilter: "all", setGroupFilter: vi.fn(),
  studentGroups: [{ id: "group-1", name: "Учебный центр", color: "#123456", created_at: "2026-09-01", start_date: null, end_date: null }],
  refreshGroups: vi.fn(), studentGroupMap: new Map(),
  groupCounts: new Map(state.loading ? [] : [["group-1", { total_count: state.active + state.archived, active_count: state.active, archived_count: state.archived }]]),
  countsLoading: false, countsErrorKind: null, countsInconsistent: false, retryCounts: vi.fn(),
  groupCountsLoading: state.loading, groupCountsErrorKind: state.error, retryGroupCounts: vi.fn(),
  docsFilter: "all", setDocsFilter: vi.fn(), searchQuery: "", setSearchQuery: vi.fn(), removeStudent: vi.fn(),
  activeStudentsCount: state.active, archivedCount: state.archived, archiveByMonth: [], archiveStudent: vi.fn(), unarchiveStudent: vi.fn(),
  refresh: vi.fn(), refreshRows: vi.fn(), loadMore: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
  loadedCount: 0, totalFiltered: 0, retryNextPage: vi.fn(), fetchStudentCredentialsOnDemand: vi.fn(),
}) }));
vi.mock("@/components/organization/GroupSettingsDialog", () => ({ GroupSettingsDialog: () => null }));
vi.mock("@/components/organization/tabs/students/StudentTableRow", () => ({ StudentTableRow: () => null }));
vi.mock("@/components/organization/tabs/students/StudentMobileCard", () => ({ StudentMobileCard: () => null }));
vi.mock("@/components/organization/tabs/students/StudentsEmptyState", () => ({ StudentsEmptyState: () => null }));
vi.mock("@/components/organization/tabs/students/StudentConfirmDialogs", () => ({ StudentConfirmDialogs: () => null }));

function mount(managementDialog = false) {
  render(<MemoryRouter initialEntries={[`/organization?tab=students&studentsView=groups${managementDialog ? "&createGroup=1" : ""}`]}>
    <StudentsTab organizationId="org-1" courses={[]} onViewStudent={vi.fn()} onCopyCredentials={vi.fn()} />
  </MemoryRouter>);
}
beforeEach(() => { state.active = 0; state.archived = 79; state.loading = false; state.error = null; });
afterEach(cleanup);

describe("student group counters", () => {
  it("separates archived learners from the active roster count", () => {
    mount();
    expect(screen.getByText("0 активных · 79 в архиве")).toBeInTheDocument();
  });
  it("uses server counts even when no paginated student rows are loaded", () => {
    state.active = 79; state.archived = 0;
    mount();
    expect(screen.getByText("79 активных")).toBeInTheDocument();
  });
  it("uses the same labels in group management", async () => {
    state.active = 50; state.archived = 29;
    mount(true);
    await screen.findByText("Управление группами");
    expect(screen.getAllByText("50 активных · 29 в архиве")).toHaveLength(2);
  });
  it("does not turn a pending count into zero", () => {
    state.loading = true;
    mount();
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText(/0 активных/)).not.toBeInTheDocument();
  });
  it("does not show stale counts as confirmed after a count error", () => {
    state.error = "permission";
    mount();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/79 в архиве/)).not.toBeInTheDocument();
  });
});
