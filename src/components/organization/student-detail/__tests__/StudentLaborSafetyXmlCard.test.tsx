import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  permissionsLoading: false,
  fetchContext: vi.fn(),
  fetchCompanies: vi.fn(),
  assignCompany: vi.fn(),
  createCompany: vi.fn(),
  updateCompany: vi.fn(),
  fetchProtocol: vi.fn(),
  saveProtocol: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => state.toastSuccess(...args), warning: (...args: unknown[]) => state.toastWarning(...args), error: (...args: unknown[]) => state.toastError(...args) },
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

vi.mock("@/api/studentLaborSafetyProtocol", () => ({
  fetchStudentLaborSafetyProtocol: (...args: unknown[]) => state.fetchProtocol(...args),
  saveStudentLaborSafetyProtocol: (...args: unknown[]) => state.saveProtocol(...args),
}));

vi.mock("@/components/ui/SigmaSpinner", () => ({
  SigmaSpinner: () => <span data-testid="spinner" />,
}));

import { StudentLaborSafetyXmlCard } from "@/components/organization/student-detail/StudentLaborSafetyXmlCard";
import { StudentLaborSafetyProtocolDialog } from "@/components/organization/student-detail/StudentLaborSafetyProtocolDialog";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(fulfill => { resolve = fulfill; });
  return { promise, resolve };
}

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

const protocol = {
  id: "protocol-1", organization_id: "org-1", enrollment_id: "enr-1",
  source_enrollment_id: "enr-1", source_user_id: "student-1", source_course_id: "course-1",
  learner_name_snapshot: "Тестовый ученик", course_title_snapshot: "Программа А",
  protocol_number: "ОТ-15", knowledge_check_date: "2026-08-30", is_passed: true,
  version: 1, created_by: "operator-1", updated_by: "operator-1",
  created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
};

const emptyProtocolContext = {
  company: { name: "ООО Тест", inn: "7707083893" },
  protocolStorageAvailable: true,
  legacyProtocolLookupFailed: false,
  courses: [{
    enrollmentId: "enr-1", educationDocumentRecordId: null, courseId: "course-1",
    courseTitle: "Программа А", categoryName: "Охрана труда", status: "completed",
    completedAt: "2026-08-30T00:00:00Z", protocolNumber: null,
  }],
};

describe("StudentLaborSafetyXmlCard", () => {
  beforeEach(() => {
    state.permissions = new Set([
      "labor_safety.read",
      "labor_safety.write",
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
    state.fetchProtocol.mockReset();
    state.saveProtocol.mockReset();
    state.toastSuccess.mockReset();
    state.toastError.mockReset();
    state.toastWarning.mockReset();
    state.fetchCompanies.mockResolvedValue([]);
    state.fetchProtocol.mockResolvedValue(null);
    state.saveProtocol.mockResolvedValue(protocol);
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it.each(["\u000b", "\ud800"])("blocks an invalid XML download without losing the source or reporting success: %j", async bad => {
    state.fetchContext.mockResolvedValue({ ...emptyProtocolContext, courses: [{ ...emptyProtocolContext.courses[0], protocolRecord: protocol }] });
    const createObjectURL = vi.fn(() => "blob:xml-test");
    vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = vi.fn(); });
    const blob = vi.spyOn(globalThis, "Blob");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const onOpenProfile = vi.fn();
    const view = render(<StudentLaborSafetyXmlCard {...props} onOpenProfile={onOpenProfile} student={{ ...props.student, fullName: `${bad}${props.student.fullName}` }} />);
    expect(await screen.findByRole("button", { name: "Исправить: ФИО" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Скачать черновик XML" }));
    expect(state.toastError).toHaveBeenCalledWith(expect.stringContaining("Запись 1, поле «ФИО»"));
    expect(state.toastError.mock.calls[0][0]).not.toContain(props.student.fullName);
    expect(blob).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(state.toastSuccess).not.toHaveBeenCalled();
    expect(state.toastWarning).not.toHaveBeenCalled();

    view.rerender(<StudentLaborSafetyXmlCard {...props} onOpenProfile={onOpenProfile} />);
    await screen.findByText(/Поля внутреннего XML-черновика заполнены/);
    fireEvent.click(screen.getByRole("button", { name: "Скачать черновик XML" }));
    expect(blob).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(state.toastSuccess).toHaveBeenCalledTimes(1);
    expect(state.fetchContext).toHaveBeenCalledTimes(1);
  });

  it("does not render or request data without labor_safety.read", () => {
    state.permissions.delete("labor_safety.read");
    render(<StudentLaborSafetyXmlCard {...props} />);

    expect(screen.queryByTestId("student-labor-safety-xml-card")).not.toBeInTheDocument();
    expect(state.fetchContext).not.toHaveBeenCalled();
  });

  it("retries a failed metadata request exactly once with the same parent enrollments", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const retry = deferred<typeof emptyProtocolContext>();
    state.fetchContext.mockRejectedValueOnce(new Error("Temporary network failure")).mockReturnValueOnce(retry.promise);
    render(<StudentLaborSafetyXmlCard {...props} />);

    const button = await screen.findByRole("button", { name: "Повторить загрузку" });
    expect(state.fetchContext).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Скачать черновик XML" })).toBeDisabled();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByText("Загружаем данные повторно…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Повторить загрузку" })).not.toBeInTheDocument();
    expect(state.fetchContext).toHaveBeenCalledTimes(2);
    const originalInput = state.fetchContext.mock.calls[0][0];
    expect(state.fetchContext.mock.calls[1][0]).toEqual(originalInput);
    expect(state.fetchContext.mock.calls[1][0].enrollments).toBe(props.enrollments);

    await act(async () => { retry.resolve(emptyProtocolContext); await retry.promise; });
    expect(await screen.findByRole("button", { name: "Заполнить протокол: Программа А" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скачать черновик XML" })).toBeEnabled();
    expect(state.fetchContext).toHaveBeenCalledTimes(2);
    expect(props.enrollments).toHaveLength(1);
  });

  it("does not retry after the labor-safety read permission is removed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.fetchContext.mockRejectedValueOnce(new Error("Temporary network failure"));
    const view = render(<StudentLaborSafetyXmlCard {...props} />);
    const oldButton = await screen.findByRole("button", { name: "Повторить загрузку" });
    state.permissions.delete("labor_safety.read");
    view.rerender(<StudentLaborSafetyXmlCard {...props} />);
    fireEvent.click(oldButton);
    expect(screen.queryByTestId("student-labor-safety-xml-card")).not.toBeInTheDocument();
    expect(state.fetchContext).toHaveBeenCalledTimes(1);
  });

  it("does not deliver a late protocol save to callbacks after the scoped dialog is replaced", async () => {
    const pendingSave = deferred<typeof protocol>();
    state.fetchProtocol.mockResolvedValue(protocol);
    state.saveProtocol.mockReturnValueOnce(pendingSave.promise);
    const oldEvents = { onSaved: vi.fn(), onClose: vi.fn() };
    const newEvents = { onSaved: vi.fn(), onClose: vi.fn() };
    const view = render(<StudentLaborSafetyProtocolDialog key="org-1:enr-1" organizationId="org-1"
      enrollmentId="enr-1" courseTitle="Старый курс" canEdit {...oldEvents} />);
    await screen.findByLabelText("Номер протокола *");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить протокол" }));
    expect(state.saveProtocol).toHaveBeenCalledTimes(1);
    state.fetchProtocol.mockResolvedValue(null);
    view.rerender(<StudentLaborSafetyProtocolDialog key="org-1:enr-2" organizationId="org-1"
      enrollmentId="enr-2" courseTitle="Новый курс" canEdit {...newEvents} />);
    expect(await screen.findByLabelText("Номер протокола *")).toHaveValue("");
    await act(async () => { pendingSave.resolve(protocol); await pendingSave.promise; });

    expect(oldEvents.onSaved).not.toHaveBeenCalled();
    expect(oldEvents.onClose).not.toHaveBeenCalled();
    expect(newEvents.onSaved).not.toHaveBeenCalled();
    expect(newEvents.onClose).not.toHaveBeenCalled();
    expect(state.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Номер протокола *")).toHaveValue("");
  });

  it("keeps the new student's card and open dialog unchanged when the old student's save resolves", async () => {
    const pendingSave = deferred<typeof protocol>();
    state.fetchContext.mockResolvedValue(emptyProtocolContext);
    state.fetchProtocol.mockResolvedValue(protocol);
    state.saveProtocol.mockReturnValueOnce(pendingSave.promise);
    const view = render(<StudentLaborSafetyXmlCard {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Заполнить протокол: Программа А" }));
    await screen.findByLabelText("Номер протокола *");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить протокол" }));
    expect(state.saveProtocol).toHaveBeenCalledTimes(1);

    state.fetchContext.mockResolvedValue({ ...emptyProtocolContext,
      courses: [{ ...emptyProtocolContext.courses[0], enrollmentId: "enr-2", courseTitle: "Курс нового ученика" }],
    });
    state.fetchProtocol.mockResolvedValue(null);
    view.rerender(<StudentLaborSafetyXmlCard {...props}
      student={{ ...props.student, userId: "student-2", fullName: "Новый ученик" }}
      enrollments={[{ ...props.enrollments[0], id: "enr-2" }]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Заполнить протокол: Курс нового ученика" }));
    expect(await screen.findByLabelText("Номер протокола *")).toHaveValue("");
    await act(async () => { pendingSave.resolve(protocol); await pendingSave.promise; });

    expect(state.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId("labor-safety-protocol-dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Номер протокола *")).toHaveValue("");
    expect(screen.getByTestId("protocol-source-enr-2")).toHaveTextContent("ещё не заполнен");
    expect(screen.queryByTestId("protocol-source-enr-1")).not.toBeInTheDocument();
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
        protocolRecord: protocol,
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
    expect(await screen.findByTestId("labor-safety-protocol-dialog")).toBeInTheDocument();
    expect(state.fetchProtocol).toHaveBeenCalledWith({ organizationId: "org-1", enrollmentId: "enr-1" });
    expect(onOpenEducationDocument).not.toHaveBeenCalled();
  });

  it("requires labor_safety.write, not journal permissions, for the protocol edit action", async () => {
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
      "labor_safety.write",
    ]);
    render(
      <StudentLaborSafetyXmlCard
        {...props}
        onOpenEducationDocument={onOpenEducationDocument}
      />,
    );
    expect(await screen.findByRole("button", { name: "Заполнить: Номер протокола" })).toBeInTheDocument();
  });

  it("opens the independent protocol form without routing to document issuance", async () => {
    const onOpenEducationDocument = vi.fn();
    state.fetchContext.mockResolvedValue({
      company: { name: "ООО Тест", inn: "7707083893" },
      courses: [{
        enrollmentId: "enr-1",
        educationDocumentRecordId: null,
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
        onOpenEducationDocument={onOpenEducationDocument}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Заполнить: Номер протокола" }));
    expect(await screen.findByTestId("labor-safety-protocol-dialog")).toBeInTheDocument();
    expect(onOpenEducationDocument).not.toHaveBeenCalled();
  });

  it("shows an unavailable save state before the protocol migration is installed", async () => {
    state.fetchContext.mockResolvedValue({
      company: { name: "ООО Тест", inn: "7707083893" },
      protocolStorageAvailable: false,
      courses: [{ enrollmentId: "enr-1", educationDocumentRecordId: null, courseId: "course-1",
        courseTitle: "Программа А", categoryName: "Охрана труда", status: "completed",
        completedAt: "2026-08-30T00:00:00Z", protocolNumber: null }],
    });
    render(<StudentLaborSafetyXmlCard {...props} />);
    expect(await screen.findByText(/обновление базы ещё не установлено/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Заполнить протокол: Программа А" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Скачать черновик XML" })).toBeEnabled();
  });

  it("updates the card only with a protocol returned after verified persistence", async () => {
    state.fetchContext.mockResolvedValue({
      company: { name: "ООО Тест", inn: "7707083893" },
      protocolStorageAvailable: true,
      courses: [{ enrollmentId: "enr-1", educationDocumentRecordId: null, courseId: "course-1",
        courseTitle: "Программа А", categoryName: "Охрана труда", status: "completed",
        completedAt: "2026-08-30T00:00:00Z", protocolNumber: null }],
    });
    render(<StudentLaborSafetyXmlCard {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Заполнить протокол: Программа А" }));
    fireEvent.change(await screen.findByLabelText("Номер протокола *"), { target: { value: "ОТ-15" } });
    fireEvent.change(screen.getByLabelText("Дата проверки знаний по протоколу *"), { target: { value: "2026-08-30" } });
    fireEvent.click(screen.getByRole("radio", { name: "Сдал" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить протокол" }));
    expect(await screen.findByText(/Протокол сохранён оператором: № ОТ-15/)).toBeInTheDocument();
    expect(screen.getByText(/Поля внутреннего XML-черновика заполнены/)).toBeInTheDocument();
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
