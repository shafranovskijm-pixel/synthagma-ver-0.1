import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  permissionsLoading: false,
  fetchContext: vi.fn(),
  fetchCompanies: vi.fn(),
  assignCompany: vi.fn(),
  createCompany: vi.fn(),
  updateCompany: vi.fn(),
}));

vi.mock("@/hooks/useStaffPermissions", () => ({
  useStaffPermissions: () => ({
    can: (permission: string) => state.permissions.has(permission),
    loading: state.permissionsLoading,
  }),
}));

vi.mock("@/api/studentLaborSafetyXml", () => ({
  fetchStudentLaborSafetyXmlContext: (...args: unknown[]) => state.fetchContext(...args),
}));

vi.mock("@/api/studentLaborSafetyCompany", () => ({
  fetchStudentLaborSafetyCompanies: (...args: unknown[]) => state.fetchCompanies(...args),
  assignStudentLaborSafetyCompany: (...args: unknown[]) => state.assignCompany(...args),
  createStudentLaborSafetyCompany: (...args: unknown[]) => state.createCompany(...args),
  updateStudentLaborSafetyCompany: (...args: unknown[]) => state.updateCompany(...args),
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
  snils: "112-233-445 95",
  position: "Инженер",
};

describe("StudentLaborSafetyXmlCard", () => {
  beforeEach(() => {
    state.permissions = new Set([
      "labor_safety.read",
      "students.write",
      "companies.write",
      "courses.write",
      "documents.write",
      "journals.read",
      "journals.write",
    ]);
    state.permissionsLoading = false;
    state.fetchContext.mockReset();
    state.fetchCompanies.mockReset();
    state.assignCompany.mockReset();
    state.createCompany.mockReset();
    state.updateCompany.mockReset();
    state.fetchCompanies.mockResolvedValue([]);
  });

  it("does not render or request data without labor_safety.read", () => {
    state.permissions.delete("labor_safety.read");
    render(<StudentLaborSafetyXmlCard {...props} />);

    expect(screen.queryByTestId("student-labor-safety-xml-card")).not.toBeInTheDocument();
    expect(state.fetchContext).not.toHaveBeenCalled();
  });

  it("shows the Beta/XSD warning and allows only a clearly labelled draft while fields are missing", async () => {
    state.fetchContext.mockResolvedValue({
      company: { name: "ООО «Современные горные технологии»", inn: "7707083893" },
      courses: [{
        enrollmentId: "enr-1",
        educationDocumentRecordId: "record-1",
        courseId: "course-1",
        courseTitle: "Общие вопросы охраны труда",
        categoryName: "Охрана труда",
        status: "completed",
        completedAt: "2026-08-30T00:00:00Z",
        protocolNumber: null,
      }],
    });

    render(
      <StudentLaborSafetyXmlCard
        {...props}
        onOpenEducationDocument={vi.fn()}
      />,
    );

    expect(await screen.findByText("XML по охране труда")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText(/Совместимость с актуальной XSD Минтруда пока не подтверждена/)).toBeInTheDocument();
    expect(screen.getByText("Правовая справка по заполнению")).toBeInTheDocument();
    expect(screen.getByText(/удостоверение и приказы/)).toBeInTheDocument();
    expect(screen.getByText(/не создавайте его фиктивно только ради XML/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Правила обучения по охране труда № 2464/ })).toHaveAttribute(
      "href",
      "https://publication.pravo.gov.ru/document/0001202112290004",
    );
    expect(screen.getByRole("button", { name: "Заполнить: Номер протокола" })).toBeInTheDocument();
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
      company: { name: "ООО «Современные горные технологии»", inn: "7707083893" },
      courses: [{
        enrollmentId: "enr-1",
        educationDocumentRecordId: "record-1",
        courseId: "course-1",
        courseTitle: "Общие вопросы охраны труда",
        categoryName: "Охрана труда",
        status: "completed",
        completedAt: "2026-08-30T00:00:00Z",
        protocolNumber: "ОТ-15",
      }],
    });

    render(<StudentLaborSafetyXmlCard {...props} />);

    expect(await screen.findByText(/Поля внутреннего XML-черновика заполнены/)).toBeInTheDocument();
    expect(screen.getByText(/Записей без найденных синтаксических ошибок: 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скачать черновик XML" })).toBeEnabled();
  });

  it("routes each missing editable field to its exact source", async () => {
    const onOpenProfile = vi.fn();
    const onOpenSnils = vi.fn();
    const onOpenEducationDocument = vi.fn();
    state.fetchContext.mockResolvedValue({
      company: null,
      courses: [{
        enrollmentId: "enr-1",
        educationDocumentRecordId: "record-1",
        courseId: "course-1",
        courseTitle: "Общие вопросы охраны труда",
        categoryName: "Охрана труда",
        status: "completed",
        completedAt: "2026-08-30T00:00:00Z",
        protocolNumber: null,
      }],
    });

    render(
      <StudentLaborSafetyXmlCard
        {...props}
        student={{ ...props.student, companyId: null }}
        snils={null}
        position={null}
        onOpenProfile={onOpenProfile}
        onOpenSnils={onOpenSnils}
        onOpenEducationDocument={onOpenEducationDocument}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Заполнить: СНИЛС" }));
    fireEvent.click(screen.getByRole("button", { name: "Заполнить: Должность" }));
    fireEvent.click(screen.getByRole("button", { name: "Заполнить: ИНН организации" }));
    expect(await screen.findByText("Компания ученика для XML-черновика")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к документам" }));
    await waitFor(() => expect(screen.queryByTestId("labor-safety-company-dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Заполнить: Номер протокола" }));

    expect(onOpenSnils).toHaveBeenCalledOnce();
    expect(onOpenProfile).toHaveBeenCalledOnce();
    expect(onOpenEducationDocument).toHaveBeenCalledWith({
      enrollmentId: "enr-1",
      recordId: "record-1",
    });
  });

  it("requires journal write permission for the protocol edit action", async () => {
    const onOpenEducationDocument = vi.fn();
    const context = {
      company: { name: "ООО Тест", inn: "7707083893" },
      courses: [{
        enrollmentId: "enr-1",
        educationDocumentRecordId: "record-1",
        courseId: "course-1",
        courseTitle: "Общие вопросы охраны труда",
        categoryName: "Охрана труда",
        status: "completed",
        completedAt: "2026-08-30T00:00:00Z",
        protocolNumber: null,
      }],
    };
    state.fetchContext.mockResolvedValue(context);
    state.permissions = new Set([
      "labor_safety.read",
      "documents.write",
      "journals.read",
    ]);

    const readOnly = render(
      <StudentLaborSafetyXmlCard
        {...props}
        onOpenEducationDocument={onOpenEducationDocument}
      />,
    );
    await screen.findByText("XML по охране труда");
    expect(screen.queryByRole("button", { name: "Заполнить: Номер протокола" })).not.toBeInTheDocument();
    readOnly.unmount();

    state.permissions = new Set([
      "labor_safety.read",
      "journals.read",
      "journals.write",
    ]);
    render(
      <StudentLaborSafetyXmlCard
        {...props}
        onOpenEducationDocument={onOpenEducationDocument}
      />,
    );
    expect(await screen.findByRole("button", { name: "Заполнить: Номер протокола" })).toBeInTheDocument();
  });

  it("creates a company and assigns it to a student without leaving the documents card", async () => {
    const onCompanyChanged = vi.fn();
    state.fetchContext.mockResolvedValue({
      company: null,
      courses: [{
        enrollmentId: "enr-1",
        educationDocumentRecordId: "record-1",
        courseId: "course-1",
        courseTitle: "Общие вопросы охраны труда",
        categoryName: "Охрана труда",
        status: "completed",
        completedAt: "2026-08-30T00:00:00Z",
        protocolNumber: "ОТ-15",
      }],
    });
    state.createCompany.mockResolvedValue({ id: "company-new", name: "ООО Новая", inn: "7707083893" });
    state.assignCompany.mockResolvedValue({ id: "company-new", name: "ООО Новая", inn: "7707083893" });

    render(
      <StudentLaborSafetyXmlCard
        {...props}
        student={{ ...props.student, companyId: null }}
        onCompanyChanged={onCompanyChanged}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Заполнить: ИНН организации" }));
    fireEvent.change(await screen.findByLabelText("Наименование компании"), { target: { value: "ООО Новая" } });
    fireEvent.change(screen.getByLabelText("ИНН компании"), { target: { value: "7707083893" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и вернуться" }));

    await waitFor(() => expect(state.createCompany).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      name: "ООО Новая",
      inn: "7707083893",
    })));
    expect(state.assignCompany).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      userId: "student-1",
      companyId: "company-new",
    }));
    expect(onCompanyChanged).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("labor-safety-company-dialog")).not.toBeInTheDocument();
  });

  it("does not mark an internal draft ready when INN or SNILS checksum is invalid", async () => {
    state.fetchContext.mockResolvedValue({
      company: { name: "ООО Тест", inn: "1234567890" },
      courses: [{
        enrollmentId: "enr-1",
        educationDocumentRecordId: "record-1",
        courseId: "course-1",
        courseTitle: "Общие вопросы охраны труда",
        categoryName: "Охрана труда",
        status: "completed",
        completedAt: "2026-08-30T00:00:00Z",
        protocolNumber: "ОТ-15",
      }],
    });

    render(<StudentLaborSafetyXmlCard {...props} snils="123-456-789 00" onOpenSnils={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Исправить: СНИЛС" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Исправить: ИНН организации" })).toBeInTheDocument();
    expect(screen.getByText(/исправьте некорректные значения \(2\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Записей без найденных синтаксических ошибок/)).not.toBeInTheDocument();
  });

  it("opens the assigned company directly and saves its missing INN without reassigning the student", async () => {
    state.fetchContext.mockResolvedValue({
      company: { name: "ООО Тест", inn: null },
      courses: [{
        enrollmentId: "enr-1",
        educationDocumentRecordId: "record-1",
        courseId: "course-1",
        courseTitle: "Общие вопросы охраны труда",
        categoryName: "Охрана труда",
        status: "completed",
        completedAt: "2026-08-30T00:00:00Z",
        protocolNumber: "ОТ-15",
      }],
    });
    state.fetchCompanies.mockResolvedValue([{ id: "company-1", name: "ООО Тест", inn: null }]);
    state.updateCompany.mockResolvedValue({ id: "company-1", name: "ООО Тест", inn: "7707083893" });

    render(<StudentLaborSafetyXmlCard {...props} />);

    fireEvent.click(await screen.findByRole("button", { name: "Заполнить: ИНН организации" }));
    expect(await screen.findByDisplayValue("ООО Тест")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("ИНН компании"), { target: { value: "7707083893" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и вернуться" }));

    await waitFor(() => expect(state.updateCompany).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      companyId: "company-1",
      name: "ООО Тест",
      inn: "7707083893",
    })));
    expect(state.assignCompany).not.toHaveBeenCalled();
  });
});
