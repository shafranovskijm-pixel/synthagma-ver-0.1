import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchResults: vi.fn(),
  exportToExcel: vi.fn(),
}));

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({ tabNavigation: { openGroupFolder: vi.fn() } }),
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

vi.mock("@/api/organizationStudentResults", () => ({
  fetchOrganizationStudentResults: mocks.fetchResults,
}));

vi.mock("@/utils/xlsxHelper", () => ({
  exportToExcel: mocks.exportToExcel,
}));

vi.mock("@/components/organization/GroupSettingsDialog", () => ({ GroupSettingsDialog: () => null }));
vi.mock("@/components/organization/tabs/students/StudentTableRow", () => ({ StudentTableRow: () => null }));
vi.mock("@/components/organization/tabs/students/StudentMobileCard", () => ({ StudentMobileCard: () => null }));
vi.mock("@/components/organization/tabs/students/StudentsEmptyState", () => ({ StudentsEmptyState: () => null }));
vi.mock("@/components/organization/tabs/students/StudentConfirmDialogs", () => ({ StudentConfirmDialogs: () => null }));

import { StudentsTab } from "@/components/organization/tabs/StudentsTab";

const resultRow = {
  id: "profile-1",
  user_id: "student-1",
  enrollment_id: "enrollment-1",
  name: "Иванов Иван Иванович",
  email: "ivanov@example.ru",
  login: null,
  progress: 100,
  status: "completed",
  started_at: null,
  completed_at: null,
  time_spent: 0,
  archived_at: null,
  tests_total: 1,
  tests_attempted: 1,
  tests_passed: 1,
  average_percent: 80,
  latest_score: 8,
  latest_max_score: 10,
  latest_percent: 80,
  latest_passing_score: 70,
  attempts_used: 1,
  last_attempt_at: "2026-08-31T10:00:00.000Z",
  result_status: "passed",
  test_details: [{
    lesson_id: "test-1",
    lesson_title: "Итоговый тест",
    score: 8,
    max_score: 10,
    percent: 80,
    passing_score: 70,
    passed: true,
    attempts_used: 1,
    max_attempts: 3,
    completed_at: "2026-08-31T10:00:00.000Z",
  }],
  course_id: "course-1",
  course_title: "Пожарная безопасность",
  course_tests: [{ id: "test-1", title: "Итоговый тест", passingScore: 70, orderIndex: 0 }],
};

function renderStudentsTab() {
  return render(
    <MemoryRouter initialEntries={["/organization?tab=students&studentsView=active"]}>
      <StudentsTab
        organizationId="org-1"
        courses={[{ id: "course-1", title: "Пожарная безопасность" }] as any}
        onViewStudent={vi.fn()}
        onCopyCredentials={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("StudentsTab result actions", () => {
  beforeEach(() => {
    mocks.fetchResults.mockReset();
    mocks.exportToExcel.mockReset();
    mocks.fetchResults.mockResolvedValue([resultRow]);
    mocks.exportToExcel.mockResolvedValue(undefined);
  });

  it("opens the dialog and renders factual existing test results", async () => {
    renderStudentsTab();

    fireEvent.click(screen.getByRole("button", { name: "Результаты тестирования" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("Итоговый тест")).toBeInTheDocument();
    expect(screen.getByText("8/10 · 80%")).toBeInTheDocument();
    expect(screen.getByText("ivanov@example.ru")).toBeInTheDocument();
  });

  it("loads complete results and downloads the requested workbook columns", async () => {
    renderStudentsTab();

    fireEvent.click(screen.getByRole("button", { name: "Экспорт результатов" }));

    await waitFor(() => expect(mocks.exportToExcel).toHaveBeenCalledTimes(1));
    expect(mocks.fetchResults).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      courses: [{ id: "course-1", title: "Пожарная безопасность" }],
    }));
    const [rows, sheetName, fileName] = mocks.exportToExcel.mock.calls[0];
    expect(sheetName).toBe("Результаты");
    expect(fileName).toMatch(/^результаты_тестирования_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(rows[0]).toMatchObject({
      "ФИО": "Иванов Иван Иванович",
      "Email": "ivanov@example.ru",
      "Курс": "Пожарная безопасность",
      "Результат тестирования": "80% — Сдан",
    });
  });

  it("shows a load error and never presents a failed request as an empty report", async () => {
    mocks.fetchResults.mockRejectedValueOnce(new Error("database unavailable"));
    renderStudentsTab();

    fireEvent.click(screen.getByRole("button", { name: "Результаты тестирования" }));

    expect(await screen.findByText("Не удалось загрузить результаты")).toBeInTheDocument();
    expect(screen.getByText("Причина: database unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Результаты не найдены")).not.toBeInTheDocument();
    expect(mocks.exportToExcel).not.toHaveBeenCalled();
  });
});
