import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  canRead: true,
  permissionsLoading: false,
  fetchContext: vi.fn(),
}));

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    can: (permission: string) => permission === "labor_safety.read" && state.canRead,
    loading: state.permissionsLoading,
  }),
}));

vi.mock("@/api/studentLaborSafetyXml", () => ({
  fetchStudentLaborSafetyXmlContext: (...args: unknown[]) => state.fetchContext(...args),
}));

vi.mock("@/components/ui/SigmaSpinner", () => ({
  SigmaSpinner: () => <span data-testid="spinner" />,
}));

import { StudentLaborSafetyXmlCard } from "@/components/organization/student-detail/StudentLaborSafetyXmlCard";

const props = {
  organizationId: "org-1",
  student: {
    userId: "student-1",
    fullName: "Попова Елизавета Олеговна",
    companyId: "company-1",
  },
  enrollments: [{
    id: "enr-1",
    course_id: "course-1",
    course_title: "Курс",
    progress: 100,
    status: "completed",
    started_at: "2026-08-01T00:00:00Z",
    completed_at: "2026-08-30T00:00:00Z",
    time_spent: 60,
  }],
  snils: "123-456-789 00",
  position: "Инженер",
};

describe("StudentLaborSafetyXmlCard", () => {
  beforeEach(() => {
    state.canRead = true;
    state.permissionsLoading = false;
    state.fetchContext.mockReset();
  });

  it("does not render or request data without labor_safety.read", () => {
    state.canRead = false;
    render(<StudentLaborSafetyXmlCard {...props} />);

    expect(screen.queryByTestId("student-labor-safety-xml-card")).not.toBeInTheDocument();
    expect(state.fetchContext).not.toHaveBeenCalled();
  });

  it("shows the Beta/XSD warning and allows only a clearly labelled draft while fields are missing", async () => {
    state.fetchContext.mockResolvedValue({
      company: { name: "ООО «Современные горные технологии»", inn: "1234567890" },
      courses: [{
        enrollmentId: "enr-1",
        courseId: "course-1",
        courseTitle: "Общие вопросы охраны труда",
        categoryName: "Охрана труда",
        status: "completed",
        completedAt: "2026-08-30T00:00:00Z",
        protocolNumber: null,
      }],
    });

    render(<StudentLaborSafetyXmlCard {...props} />);

    expect(await screen.findByText("XML по охране труда")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText(/Совместимость с актуальной XSD Минтруда пока не подтверждена/)).toBeInTheDocument();
    expect(screen.getByText(/Не заполнено: Номер протокола/)).toBeInTheDocument();
    expect(screen.getByText(/Черновик можно скачать для демонстрации/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скачать черновик XML" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Открыть ЛКОТ" })).toHaveAttribute(
      "href",
      "https://lkot.mintrud.gov.ru/",
    );
    await waitFor(() => expect(state.fetchContext).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      userId: "student-1",
      companyId: "company-1",
    })));
  });

  it("marks a complete draft as ready for XSD validation", async () => {
    state.fetchContext.mockResolvedValue({
      company: { name: "ООО «Современные горные технологии»", inn: "1234567890" },
      courses: [{
        enrollmentId: "enr-1",
        courseId: "course-1",
        courseTitle: "Общие вопросы охраны труда",
        categoryName: "Охрана труда",
        status: "completed",
        completedAt: "2026-08-30T00:00:00Z",
        protocolNumber: "ОТ-15",
      }],
    });

    render(<StudentLaborSafetyXmlCard {...props} />);

    expect(await screen.findByText("Все поля внутреннего XML заполнены.")).toBeInTheDocument();
    expect(screen.getByText(/Записей с заполненными данными: 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скачать черновик XML" })).toBeEnabled();
  });
});
