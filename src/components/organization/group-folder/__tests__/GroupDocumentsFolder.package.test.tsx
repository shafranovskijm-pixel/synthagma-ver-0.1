import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GroupDocumentsFolder } from "../GroupDocumentsFolder";
import { SAMPLE_CONTEXT } from "@/lib/group-docs/sampleContext";
import { emptyFactualData } from "@/lib/group-docs/factualData";
import { PACKAGE_DOC_TYPES } from "@/lib/group-docs/packageTypes";
import { GORELTECH_ORGANIZATION_ID } from "@/lib/group-docs/clientProfile";
import type { GroupDocumentRow } from "@/hooks/useGroupDocuments";
import { groupAttendancePath } from "@/lib/groups/groupContext";
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }) }));

const mocks = vi.hoisted(() => ({
  useGroupDocuments: vi.fn(),
  useGroupFactualData: vi.fn(),
  generatePackage: vi.fn(),
  generateDocument: vi.fn(),
  downloadHtml: vi.fn(),
  generateClassJournalDocx: vi.fn(),
  readClassJournalOperation: vi.fn(),
  refreshDocuments: vi.fn(),
  reconcilePackage: vi.fn(),
  saveGenerated: vi.fn(),
  onDataChanged: vi.fn(),
  docxSave: vi.fn(),
  individualSave: vi.fn(),
  legalSave: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  downloadPrivateFile: vi.fn(),
  remove: vi.fn(),
  dialogState: {
    docxProps: null as any,
    individualProps: null as any,
    legalProps: null as any,
  },
}));

vi.mock("@/hooks/useGroupDocuments", () => ({
  useGroupDocuments: mocks.useGroupDocuments,
}));

vi.mock("@/utils/storageHelpers", () => ({
  downloadPrivateFile: mocks.downloadPrivateFile,
}));

vi.mock("@/hooks/useGroupFactualData", () => ({
  useGroupFactualData: mocks.useGroupFactualData,
}));

vi.mock("@/lib/group-docs/generate", () => ({
  generateDocument: mocks.generateDocument,
  generatePackage: mocks.generatePackage,
  groupDocumentDate: vi.fn(() => "2026-01-16"),
  downloadHtml: mocks.downloadHtml,
}));

vi.mock("@/lib/group-docs/docxJournal", () => ({
  generateClassJournalDocx: mocks.generateClassJournalDocx,
  readClassJournalOperation: mocks.readClassJournalOperation,
}));
vi.mock("@/lib/group-docs/packageReconciliation", () => ({
  reconcileGroupDocumentPackage: mocks.reconcilePackage,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
    info: vi.fn(),
  },
}));

vi.mock("../GenerateDocxContractDialog", () => ({
  GenerateDocxContractDialog: (props: any) => {
    mocks.dialogState.docxProps = props;
    return (
      <button
        type="button"
        onClick={async () => {
          mocks.docxSave();
          await props.onGenerated({
            scenario: "legal",
            count: 1,
            contractNumbers: ["2026-001"],
            contractId: "contract-word-1",
          });
          props.onClose();
        }}
      >
        Сохранить договор Word
      </button>
    );
  },
}));

vi.mock("../GenerateContractDialog", () => ({
  GenerateContractDialog: (props: any) => {
    const legal = props.fixedScenario === "legal";
    if (legal) mocks.dialogState.legalProps = props;
    else mocks.dialogState.individualProps = props;
    return (
      <button
        type="button"
        onClick={async () => {
          if (legal) mocks.legalSave();
          else mocks.individualSave();
          await props.onGenerated({
            scenario: legal ? "legal" : "individual",
            count: legal ? 1 : 2,
            contractNumbers: legal ? ["2026-201"] : ["2026-101", "2026-102"],
          });
          props.onClose();
        }}
      >
        {legal ? "Сохранить универсальный договор компании" : "Сохранить договоры физлиц"}
      </button>
    );
  },
}));

const legacyDocs = PACKAGE_DOC_TYPES
  .filter((type) => type !== "class_journal")
  .map((type) => ({ doc_type: type }));

const docxRow = {
  id: "doc-word-1",
  organization_id: "org-1",
  group_id: "group-1",
  doc_type: "class_journal",
  name: "Журнал учета занятий",
  document_number: null,
  document_date: "2026-08-16",
  variables: {},
  html: null,
  file_path: "org-1/group-1/journal.docx",
  status: "active",
  created_at: "2026-08-16T00:00:00.000Z",
  layout_format: "docx_ooxml",
  package_batch_id: "batch-1",
  package_version: 1,
  is_current: true,
};

const expulsionBlankMarker = {
  docType: "expulsion_order",
  code: "expulsion_classification_not_confirmed",
  field: "expulsion_decisions",
  severity: "warning",
  message: "Решения о выдаче не подтверждены; списки оставлены пустыми для ручного заполнения.",
};

function mockDocuments(documents: GroupDocumentRow[]) {
  mocks.useGroupDocuments.mockReturnValue({
    documents,
    loading: false,
    refresh: mocks.refreshDocuments,
    saveGenerated: mocks.saveGenerated,
    remove: mocks.remove,
  });
}

function goreltechContext() {
  const ctx = structuredClone(SAMPLE_CONTEXT);
  ctx.organization.id = GORELTECH_ORGANIZATION_ID;
  ctx.group.instructor_name = "Ляпко Дарья Константиновна";
  return ctx;
}

function renderFolder(ctx = goreltechContext()) {
  return render(
    <GroupDocumentsFolder
      organizationId="org-1"
      groupId="group-1"
      groupName="Группа 1"
      students={SAMPLE_CONTEXT.students}
      ctx={ctx}
      onDataChanged={mocks.onDataChanged}
    />,
  );
}

async function confirmSourceSignatories() {
  fireEvent.click(screen.getByRole("button", { name: "Подписанты документов" }));
  fireEvent.click(await screen.findByRole("button", { name: "Подтвердить подписантов" }));
}

describe("GroupDocumentsFolder package contract routing", () => {
  it("не объявляет очной журнал пустым по отсутствию online completions и вызывает переход с контекстом группы", () => {
    // This UI test verifies the callback and URL only, not live saved attendance.
    const openEditor = vi.fn((path: string) => {
      const params = new URL(path, "https://example.test").searchParams;
      expect(params.get("journal")).toBe("group-attendance");
      expect(params.get("groupId")).toBe("group-manual");
    });
    render(<GroupDocumentsFolder organizationId={GORELTECH_ORGANIZATION_ID} groupId="group-manual"
      groupName="Очная группа" students={SAMPLE_CONTEXT.students} ctx={goreltechContext()}
      onOpenGroupAttendance={() => openEditor(groupAttendancePath("group-manual"))} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Заполнить по данным Синтагмы" }), { button: 0, ctrlKey: false });
    expect(screen.getByText(/сохранённые очные отметки этой группы/)).toBeInTheDocument();
    expect(screen.queryByText(/Нет завершённых уроков — журнал будет пустым/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Открыть очные отметки группы" }));
    expect(openEditor).toHaveBeenCalledWith(groupAttendancePath("group-manual"));
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dialogState.docxProps = null;
    mocks.dialogState.individualProps = null;
    mocks.dialogState.legalProps = null;
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.downloadPrivateFile.mockReset();
    mocks.downloadPrivateFile.mockResolvedValue(true);
    mocks.remove.mockReset();
    mocks.remove.mockResolvedValue(true);
    mocks.refreshDocuments.mockResolvedValue(undefined);
    mocks.reconcilePackage.mockResolvedValue({ documents: [], currentVersion: null });
    mocks.saveGenerated.mockResolvedValue({ version: 1 });
    mocks.generatePackage.mockReturnValue(legacyDocs);
    mocks.generateClassJournalDocx.mockImplementation(async (params: { operationId?: string; dryRun?: boolean }) => ({ version: 1, operationId: params.operationId ?? null, dryRun: params.dryRun === true }));
    mocks.readClassJournalOperation.mockResolvedValue(null);
    mocks.useGroupDocuments.mockReturnValue({
      documents: [],
      loading: false,
      refresh: mocks.refreshDocuments,
      saveGenerated: mocks.saveGenerated,
      remove: mocks.remove,
    });
    mocks.useGroupFactualData.mockReturnValue({
      factual: emptyFactualData(),
      loading: false,
    });
  });

  it("направляет пакет компании в Word-диалог и запускает 9 документов после одного договора", async () => {
    renderFolder();
    await confirmSourceSignatories();

    expect(screen.queryByRole("button", { name: /Отдельный документ/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Пересобрать 9 Word-документов" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (Word клиента)" }));

    expect(await screen.findByRole("button", { name: "Сохранить договор Word" })).toBeInTheDocument();
    expect(mocks.dialogState.docxProps.open).toBe(true);
    expect(mocks.dialogState.individualProps).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить договор Word" }));

    await waitFor(() => expect(mocks.generateClassJournalDocx).toHaveBeenCalledTimes(1));
    expect(mocks.docxSave).toHaveBeenCalledTimes(1);
    expect(mocks.individualSave).not.toHaveBeenCalled();
    expect(mocks.generatePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        extras: expect.objectContaining({
          contract_basis: "Договор № 2026-001",
          signatory_position_enrollment_order: "Генеральный директор",
          signatory_name_enrollment_order: "",
        }),
      }),
      PACKAGE_DOC_TYPES.filter((type) => type !== "class_journal"),
      expect.any(Object),
    );
    expect(mocks.generateClassJournalDocx).toHaveBeenCalledWith(
      expect.objectContaining({
        journalSignatory: {
          position: "Генеральный директор",
          name: SAMPLE_CONTEXT.organization.director_name,
        },
      }),
    );
  });

  it("открывает настройки сохранённого расписания и не выдаёт отсутствие browser-данных за пустую базу", async () => {
    const onOpenGroupSettings = vi.fn();
    render(<GroupDocumentsFolder organizationId="org-1" groupId="group-1" groupName="Группа 1"
      students={SAMPLE_CONTEXT.students} ctx={goreltechContext()} onOpenGroupSettings={onOpenGroupSettings} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Заполнить по данным Синтагмы" }), { button: 0, ctrlKey: false });
    const settings = await screen.findByRole("button", { name: "Настроить расписание" });
    fireEvent.click(settings);
    expect(onOpenGroupSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Источник: сохранённое расписание/)).toBeInTheDocument();
    expect(screen.queryByText(/занятий не задано/)).not.toBeInTheDocument();
    expect(mocks.generateClassJournalDocx).not.toHaveBeenCalled();
  });

  it.each(["id", "inn", "name"] as const)("не показывает CTA сохранённого расписания при несовпадении точного профиля: %s", async field => {
    const ctx = goreltechContext();
    ctx.organization[field] = field === "name" ? "Другая организация" : "other-organization";
    const onOpenGroupSettings = vi.fn();
    render(<GroupDocumentsFolder organizationId="org-1" groupId="group-1" groupName="Группа 1"
      students={SAMPLE_CONTEXT.students} ctx={ctx} onOpenGroupSettings={onOpenGroupSettings} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Заполнить по данным Синтагмы" }), { button: 0, ctrlKey: false });
    await screen.findByRole("button", { name: "Пакет компании (универсальный)" });
    expect(screen.queryByRole("button", { name: "Настроить расписание" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Источник: сохранённое расписание/)).not.toBeInTheDocument();
    expect(onOpenGroupSettings).not.toHaveBeenCalled();
    expect(mocks.generateClassJournalDocx).not.toHaveBeenCalled();
  });

  it("заранее показывает, что пакет ГОРЭЛТЕХ останется черновиком без номера", () => {
    renderFolder();

    expect(screen.getByText(
      "Комплект будет сохранён как черновик без официальных номеров до полной серверной сверки реквизитов.",
    )).toBeInTheDocument();
  });

  it("не считает два юрлица-договора успешным пакетом компании", async () => {
    renderFolder();
    await confirmSourceSignatories();
    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (Word клиента)" }));
    await screen.findByRole("button", { name: "Сохранить договор Word" });

    const result = await mocks.dialogState.docxProps.onGenerated({
      scenario: "legal",
      count: 2,
      contractNumbers: ["2026-001", "2026-002"],
    });

    expect(result).toBe(false);
    expect(mocks.generateClassJournalDocx).not.toHaveBeenCalled();
  });

  it("повторяет только 9 документов, если Word-договор уже сохранён", async () => {
    mocks.generateClassJournalDocx
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async (params: { operationId?: string }) => ({ version: 2, operationId: params.operationId }));
    renderFolder();
    await confirmSourceSignatories();

    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (Word клиента)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Сохранить договор Word" }));

    const retry = await screen.findByRole("button", { name: "Повторить 9 документов" });
    expect(screen.getByRole("button", { name: "Пакет компании (Word клиента)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Пакет физлица" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Пересобрать 9 Word-документов" })).toBeDisabled();

    expect(retry).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Повторить сохранение без дубликата" }));

    await waitFor(() => expect(mocks.generateClassJournalDocx).toHaveBeenCalledTimes(2));
    expect(mocks.docxSave).toHaveBeenCalledTimes(1);
    expect(mocks.individualSave).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Повторить 9 документов" })).not.toBeInTheDocument();
    });
  });

  it("сохраняет универсальный HTML-мастер только для пакета физлиц", async () => {
    renderFolder();
    await confirmSourceSignatories();

    fireEvent.click(screen.getByRole("button", { name: "Пакет физлица" }));

    expect(await screen.findByRole("button", { name: "Сохранить договоры физлиц" })).toBeInTheDocument();
    expect(mocks.dialogState.individualProps.fixedScenario).toBe("individual");
    expect(mocks.dialogState.individualProps.quick).toBe(true);
    expect(mocks.dialogState.docxProps).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить договоры физлиц" }));

    await waitFor(() => expect(mocks.generateClassJournalDocx).toHaveBeenCalledTimes(1));
    expect(mocks.individualSave).toHaveBeenCalledTimes(1);
    expect(mocks.docxSave).not.toHaveBeenCalled();
  });

  it("для другой организации скрывает клиентский Word и собирает нейтральный legal-пакет", async () => {
    const genericContext = structuredClone(SAMPLE_CONTEXT);
    genericContext.organization.name = "ТЕСТОВАЯ ОРГАНИЗАЦИЯ — НЕ РЕАЛЬНАЯ";
    genericContext.organization.inn = "0000000000";
    genericContext.organization.director_name = "ТЕСТОВЫЙ РУКОВОДИТЕЛЬ";
    genericContext.organization.director_position = "Директор";
    genericContext.group.instructor_name = "ТЕСТОВЫЙ ПРЕПОДАВАТЕЛЬ";

    renderFolder(genericContext);

    expect(screen.queryByRole("button", { name: "Пакет компании (Word клиента)" })).not.toBeInTheDocument();
    expect(screen.queryByText(/ГОРЭЛТЕХ/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (универсальный)" }));

    expect(await screen.findByRole("button", { name: "Сохранить универсальный договор компании" })).toBeInTheDocument();
    expect(mocks.dialogState.legalProps.fixedScenario).toBe("legal");
    expect(mocks.dialogState.legalProps.quick).toBe(true);
    expect(mocks.dialogState.docxProps).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить универсальный договор компании" }));

    await waitFor(() => expect(mocks.generatePackage).toHaveBeenCalledTimes(1));
    expect(mocks.generatePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: expect.objectContaining({
          name: "ТЕСТОВАЯ ОРГАНИЗАЦИЯ — НЕ РЕАЛЬНАЯ",
          inn: "0000000000",
        }),
      }),
      PACKAGE_DOC_TYPES,
      expect.any(Object),
    );
    expect(mocks.saveGenerated).toHaveBeenCalledTimes(1);
    expect(mocks.generateClassJournalDocx).not.toHaveBeenCalled();
    expect(mocks.legalSave).toHaveBeenCalledTimes(1);
    expect(mocks.docxSave).not.toHaveBeenCalled();
  });

  it("оставляет заблокированные package-кнопки кликабельными и объясняет причину", async () => {
    const ctx = goreltechContext();
    render(
      <GroupDocumentsFolder
        organizationId="org-1"
        groupId="group-1"
        groupName="Группа 1"
        students={ctx.students}
        ctx={ctx}
        missingFields={["должность руководителя учебного центра"]}
        blockingFields={["должность руководителя учебного центра"]}
      />,
    );

    const company = screen.getByRole("button", { name: "Пакет компании (Word клиента)" });
    const individual = screen.getByRole("button", { name: "Пакет физлица" });
    expect(company).not.toBeDisabled();
    expect(individual).not.toBeDisabled();
    await confirmSourceSignatories();

    fireEvent.click(company);

    expect(mocks.toastError).toHaveBeenCalledWith(
      "Заполните обязательные данные группы",
      { description: "должность руководителя учебного центра" },
    );
    expect(mocks.dialogState.docxProps).toBeNull();
    expect(mocks.dialogState.legalProps).toBeNull();
    expect(mocks.generateClassJournalDocx).not.toHaveBeenCalled();
  });

  it("направляет незаполненный ИНН в реквизиты организации, а не в настройки группы", () => {
    const ctx = goreltechContext();
    const onOpenOrganizationRequisites = vi.fn();
    const onOpenGroupSettings = vi.fn();
    render(
      <GroupDocumentsFolder
        organizationId="org-1"
        groupId="group-1"
        groupName="Группа 1"
        students={ctx.students}
        ctx={ctx}
        missingFields={["ИНН учебного центра"]}
        blockingFields={["ИНН учебного центра"]}
        organizationMissingFields={["ИНН учебного центра"]}
        onOpenOrganizationRequisites={onOpenOrganizationRequisites}
        onOpenGroupSettings={onOpenGroupSettings}
      />,
    );

    expect(screen.getByText(/Создание курса, зачисление и обучение остаются доступны/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Открыть настройки группы" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Заполнить реквизиты организации" }));
    expect(onOpenOrganizationRequisites).toHaveBeenCalledTimes(1);
    expect(onOpenGroupSettings).not.toHaveBeenCalled();
  });

  it("показывает разные действия для пропусков организации и группы", () => {
    const ctx = goreltechContext();
    const onOpenOrganizationRequisites = vi.fn();
    const onOpenGroupSettings = vi.fn();
    render(
      <GroupDocumentsFolder
        organizationId="org-1"
        groupId="group-1"
        groupName="Группа 1"
        students={ctx.students}
        ctx={ctx}
        missingFields={["ИНН учебного центра", "номер группы"]}
        blockingFields={["ИНН учебного центра"]}
        organizationMissingFields={["ИНН учебного центра"]}
        onOpenOrganizationRequisites={onOpenOrganizationRequisites}
        onOpenGroupSettings={onOpenGroupSettings}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Заполнить реквизиты организации" }));
    fireEvent.click(screen.getByRole("button", { name: "Открыть настройки группы" }));
    expect(onOpenOrganizationRequisites).toHaveBeenCalledTimes(1);
    expect(onOpenGroupSettings).toHaveBeenCalledTimes(1);
  });

  it("не открывает пакет, если одному из девяти Word-документов не хватает печатаемого поля", async () => {
    const ctx = goreltechContext();
    ctx.group.instructor_name = "";
    renderFolder(ctx);
    await confirmSourceSignatories();

    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (Word клиента)" }));

    expect(mocks.toastError).toHaveBeenCalledWith(
      "Заполните обязательные данные группы",
      { description: "преподаватель" },
    );
    expect(mocks.dialogState.docxProps).toBeNull();
    expect(mocks.generateClassJournalDocx).not.toHaveBeenCalled();
  });

  it("не подменяет пустой номер группы её названием для пакета ГОРЭЛТЕХ", async () => {
    const ctx = goreltechContext();
    ctx.group.name = "Группа с названием";
    ctx.group.number = "";
    renderFolder(ctx);
    await confirmSourceSignatories();

    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (Word клиента)" }));

    expect(mocks.toastError).toHaveBeenCalledWith(
      "Заполните обязательные данные группы",
      { description: "номер группы" },
    );
    expect(mocks.dialogState.docxProps).toBeNull();
    expect(mocks.generateClassJournalDocx).not.toHaveBeenCalled();
  });

  it("не подменяет пустой номер группы её названием для универсального пакета", () => {
    const ctx = structuredClone(SAMPLE_CONTEXT);
    ctx.organization.name = "ТЕСТОВАЯ ОРГАНИЗАЦИЯ — НЕ РЕАЛЬНАЯ";
    ctx.organization.inn = "0000000000";
    ctx.organization.director_name = "ТЕСТОВЫЙ РУКОВОДИТЕЛЬ";
    ctx.organization.director_position = "Директор";
    ctx.group.instructor_name = "ТЕСТОВЫЙ ПРЕПОДАВАТЕЛЬ";
    ctx.group.name = "Группа с названием";
    ctx.group.number = "";
    renderFolder(ctx);

    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (универсальный)" }));

    expect(mocks.toastError).toHaveBeenCalledWith(
      "Заполните обязательные данные группы",
      { description: "номер группы" },
    );
    expect(mocks.dialogState.legalProps).toBeNull();
    expect(mocks.saveGenerated).not.toHaveBeenCalled();
  });

  it("показывает некритичную подсказку, но не выдаёт её за блокирующее поле", async () => {
    const ctx = goreltechContext();
    render(
      <GroupDocumentsFolder
        organizationId="org-1"
        groupId="group-1"
        groupName="Группа 1"
        students={ctx.students}
        ctx={ctx}
        missingFields={["проверить реквизиты программы"]}
      />,
    );
    await confirmSourceSignatories();

    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (Word клиента)" }));

    expect(mocks.dialogState.docxProps).not.toBeNull();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("скачивает DOCX напрямую и не показывает действие, создающее пустую вкладку", async () => {
    mockDocuments([docxRow]);
    renderFolder();

    expect(screen.queryByRole("button", { name: `Открыть ${docxRow.name}` })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Скачать Word ${docxRow.name}` }));
    await waitFor(() => {
      expect(mocks.downloadPrivateFile).toHaveBeenCalledWith(
        "billing-documents",
        docxRow.file_path,
        `${docxRow.name}.docx`,
      );
    });
  });

  it("показывает ошибку, если временная ссылка на Word недоступна", async () => {
    mocks.downloadPrivateFile.mockResolvedValue(false);
    mockDocuments([docxRow]);
    renderFolder();

    fireEvent.click(screen.getByRole("button", { name: `Скачать Word ${docxRow.name}` }));
    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Не удалось скачать файл Word",
        expect.objectContaining({ description: expect.stringContaining("временную ссылку") }),
      );
    });
  });

  it("передаёт отдельного подписанта журнала и остальных документов", async () => {
    renderFolder();

    fireEvent.click(screen.getByRole("button", { name: "Подписанты документов" }));
    const dialog = await screen.findByRole("dialog", { name: "Подписанты документов ГОРЭЛТЕХ" });
    const position = dialog.querySelector<HTMLInputElement>("#signatory-position-class_journal");
    const name = dialog.querySelector<HTMLInputElement>("#signatory-name-class_journal");
    expect(position).not.toBeNull();
    expect(name).not.toBeNull();
    fireEvent.change(position!, { target: { value: "Руководитель учебного центра" } });
    fireEvent.change(name!, { target: { value: "Ляпко Дарья Константиновна" } });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить подписантов" }));

    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (Word клиента)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Сохранить договор Word" }));

    await waitFor(() => {
      expect(mocks.generateClassJournalDocx).toHaveBeenCalledWith(
        expect.objectContaining({
          journalSignatory: {
            position: "Руководитель учебного центра",
            name: "Ляпко Дарья Константиновна",
          },
        }),
      );
    });
  });

  it("использует согласованную должность подписанта ГОРЭЛТЕХ по умолчанию", async () => {
    renderFolder();

    fireEvent.click(screen.getByRole("button", { name: "Подписанты документов" }));
    const dialog = await screen.findByRole("dialog", { name: "Подписанты документов ГОРЭЛТЕХ" });
    const orderPosition = dialog.querySelector<HTMLInputElement>("#signatory-position-enrollment_order");
    const orderName = dialog.querySelector<HTMLInputElement>("#signatory-name-enrollment_order");
    const journalPosition = dialog.querySelector<HTMLInputElement>("#signatory-position-class_journal");
    const journalName = dialog.querySelector<HTMLInputElement>("#signatory-name-class_journal");
    const passPosition = dialog.querySelector<HTMLInputElement>("#signatory-position-pass");
    const passName = dialog.querySelector<HTMLInputElement>("#signatory-name-pass");

    expect(orderPosition).toHaveValue("Генеральный директор");
    expect(orderName).toHaveValue("");
    expect(journalPosition).toHaveValue("Генеральный директор");
    expect(journalName).toHaveValue("Дроздов Дмитрий Викторович");
    expect(passPosition).toHaveValue("");
    expect(passName).toHaveValue("");
  });

  it("сразу открывает проверку пустых подписантов и после подтверждения продолжает пакет", async () => {
    const ctx = goreltechContext();
    ctx.organization.director_position = "";
    ctx.organization.director_name = "";
    renderFolder(ctx);

    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (Word клиента)" }));
    expect(await screen.findByRole("dialog", { name: "Подписанты документов ГОРЭЛТЕХ" })).toBeInTheDocument();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.dialogState.docxProps).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Подтвердить подписантов" }));

    expect(await screen.findByRole("button", { name: "Сохранить договор Word" })).toBeInTheDocument();
  });

  it("объясняет скрытую блокировку пересборки и продолжает после подтверждения подписантов", async () => {
    renderFolder();

    const rebuild = screen.getByRole("button", {
      name: "Проверить подписантов и пересобрать 9 Word-документов",
    });
    expect(rebuild).toBeEnabled();

    fireEvent.click(rebuild);

    expect(await screen.findByRole("dialog", { name: "Подписанты документов ГОРЭЛТЕХ" })).toBeInTheDocument();
    expect(mocks.generateClassJournalDocx).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить подписантов" }));

    await waitFor(() => expect(mocks.generateClassJournalDocx).toHaveBeenCalledTimes(1));
    expect(mocks.generatePackage).toHaveBeenCalledWith(
      expect.any(Object),
      PACKAGE_DOC_TYPES.filter((type) => type !== "class_journal"),
      expect.any(Object),
    );
    expect(screen.getByRole("button", { name: "Пересобрать 9 Word-документов" })).toBeEnabled();
  });

  it("проверяет 9 Word-документов без сохранения и не обновляет рабочие данные", async () => {
    mocks.generateClassJournalDocx.mockResolvedValue({
      dryRun: true,
      writesPerformed: false,
      insertedCount: 9,
      documents: [],
      warnings: [],
    });
    renderFolder();
    await confirmSourceSignatories();

    fireEvent.click(screen.getByRole("button", {
      name: "Проверить 9 Word-документов без сохранения",
    }));

    await waitFor(() => {
      expect(mocks.generateClassJournalDocx).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      );
    });
    expect(mocks.refreshDocuments).not.toHaveBeenCalled();
    expect(mocks.onDataChanged).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Проверка пройдена: 9 Word-документов собраны без сохранения",
      expect.objectContaining({
        description: expect.stringContaining("Storage и база данных не изменялись"),
      }),
    );
  });

  it("повторно проверяет обязательные данные после открытия диалога подписантов", async () => {
    const view = renderFolder();

    fireEvent.click(screen.getByRole("button", {
      name: "Проверить подписантов и пересобрать 9 Word-документов",
    }));
    expect(await screen.findByRole("dialog", { name: "Подписанты документов ГОРЭЛТЕХ" })).toBeInTheDocument();

    view.rerender(
      <GroupDocumentsFolder
        organizationId="org-1"
        groupId="group-1"
        groupName="Группа 1"
        students={SAMPLE_CONTEXT.students}
        ctx={goreltechContext()}
        blockingFields={["номер группы"]}
        onDataChanged={mocks.onDataChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить подписантов" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      "Заполните обязательные данные группы",
      expect.objectContaining({ description: "номер группы" }),
    ));
    expect(mocks.generatePackage).not.toHaveBeenCalled();
    expect(mocks.generateClassJournalDocx).not.toHaveBeenCalled();
  });

  it("не выдаёт безусловный успех проверки при ошибках источников серверных данных", async () => {
    const warning = "Список обучающихся: не удалось подтвердить паспортные данные в базе.";
    mocks.generateClassJournalDocx.mockResolvedValue({
      dryRun: true, writesPerformed: false, insertedCount: 9, documents: [], warnings: [warning],
    });
    renderFolder();
    await confirmSourceSignatories();
    fireEvent.click(screen.getByRole("button", { name: "Проверить 9 Word-документов без сохранения" }));

    await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalledWith(
      "Проверка завершена с замечаниями", { description: `Файлы не сохранены. ${warning}` },
    ));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.refreshDocuments).not.toHaveBeenCalled();
    expect(mocks.saveGenerated).not.toHaveBeenCalled();
    expect(mocks.onDataChanged).not.toHaveBeenCalled();
  });

  it("после повторного открытия показывает причины неполных данных сохранённого Word, не блокируя скачивание", async () => {
    const sourceMessage = "Не удалось полностью подтвердить паспортные данные в базе.";
    const fieldMessage = "Образование: поле списка оставлено пустым.";
    const row: GroupDocumentRow = {
      ...docxRow,
      doc_type: "student_list", name: "Список обучающихся", doc_status: "draft", fill_mode: "data",
      variables_snapshot: {
        source_issues: [{ code: "read_failed", message: sourceMessage }],
        fact_issues: [{ message: fieldMessage }, { message: fieldMessage }],
      },
    };
    mockDocuments([row]);
    const firstView = renderFolder();
    expect(screen.getByText("Требует проверки")).toBeInTheDocument();
    firstView.unmount();

    renderFolder();
    expect(screen.getByText("Требует проверки")).toBeInTheDocument();
    expect(screen.getByText(/Источник данных не подтверждён/)).toBeInTheDocument();
    const reasons = screen.getByText("Причины (2)");
    fireEvent.click(reasons);
    expect(reasons.closest("details")).toHaveAttribute("open");
    expect(screen.getByText(sourceMessage)).toBeVisible();
    expect(screen.getByText(fieldMessage)).toBeVisible();
    expect(screen.getByText("Черновик")).toBeInTheDocument();
    expect(screen.getByText("По данным Синтагмы")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Скачать Word Список обучающихся" }));
    await waitFor(() => expect(mocks.downloadPrivateFile).toHaveBeenCalledWith(
      "billing-documents", row.file_path, "Список обучающихся.docx",
    ));
  });

  it("явно отличает новый пустой приказ об отчислении и сохраняет скачивание его бланка", async () => {
    const row = {
      ...docxRow, doc_type: "expulsion_order", name: "Приказ об отчислении", doc_status: "draft",
      variables_snapshot: { rows: [], fact_issues: [expulsionBlankMarker] },
    };
    mockDocuments([row]);
    renderFolder();

    const notice = screen.getByRole("note", { name: "Распределение в приказе об отчислении" });
    expect(within(notice).getByText("Бланк для ручного распределения")).toBeVisible();
    expect(within(notice).getByText(/Списки учеников с выдачей и без выдачи оставлены пустыми/)).toBeVisible();
    expect(notice.closest("details")).toBeNull();
    expect(screen.queryByText("Распределение учеников не проверено")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Скачать бланк Word ${row.name}` }));
    await waitFor(() => expect(mocks.downloadPrivateFile).toHaveBeenCalledWith(
      "billing-documents", row.file_path, `${row.name}.docx`,
    ));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.saveGenerated).not.toHaveBeenCalled();
  });

  it.each([false, true])("показывает подтверждённое распределение только с полноценным снимком; malformed=%s", async malformed => {
    const userId = "00000000-0000-4000-8000-000000000001";
    const enrollmentId = "00000000-0000-4000-8000-000000000002";
    const omitted = "00000000-0000-4000-8000-000000000003";
    const row = { ...docxRow, doc_type: "expulsion_order", name: "Приказ по решениям", doc_status: "draft", variables_snapshot: {
      rows: [], decision_source: "operator_confirmed_sql_snapshot_v1",
      rows_by_source: { expulsion_with_issuance: [malformed ? null : { N: "1", STUDENT_NAME: "Тестовый Ученик", STUDENT_PROGRAM: "Учебная программа", STUDENT_HOURS: "40", STUDENT_PERIOD: "01.09.2026–30.09.2026", STUDENT_BASIS: "" }], expulsion_without_issuance: [] },
      row_sources: [{ userId, enrollmentId }],
      decision_sources: [{ userId, enrollmentId, decisionId: "00000000-0000-4000-8000-000000000004", decisionRevision: 2,
        enrollmentFactsRevision: "23", confirmedBy: userId, confirmedAt: "2026-09-04T00:00:00Z", issuanceDecision: "with_document" }],
      decision_coverage: { total: 2, confirmed: 1, omitted: [{ userId: omitted, fullName: "Пропущенный Ученик" }] },
      fact_issues: [{ message: "Пропущенный Ученик: решение не подтверждено." }],
    } };
    mockDocuments([row]); renderFolder();
    expect(screen.getByRole("button", { name: "Заполнить итоговые решения" })).toBeVisible();
    if (malformed) {
      expect(screen.getByText("Распределение учеников не проверено")).toBeVisible();
      expect(screen.queryByText(/Включено 1 из 2/)).not.toBeInTheDocument();
    } else {
      expect(screen.getByText("Распределение по сохранённым решениям")).toBeVisible();
      expect(screen.getByText(/Включено 1 из 2/)).toBeVisible();
      expect(screen.getByText("Не включены: Пропущенный Ученик.")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Скачать черновик Word Приказ по решениям" }));
      await waitFor(() => expect(mocks.downloadPrivateFile).toHaveBeenCalledWith("billing-documents", row.file_path, "Приказ по решениям.docx"));
    }
    expect(mocks.saveGenerated).not.toHaveBeenCalled();
  });

  it.each([
    ["нет snapshot", undefined],
    ["нет маркера", { rows: [], fact_issues: [] }],
    ["маркер без rows", { fact_issues: [expulsionBlankMarker] }],
    ["непустые rows с маркером", { rows: [{ STUDENT_NAME: "Тестовый ученик" }], fact_issues: [expulsionBlankMarker] }],
    ["rows не массив", { rows: { length: 0 }, fact_issues: [expulsionBlankMarker] }],
    ["маркер другого документа", { rows: [], fact_issues: [{ ...expulsionBlankMarker, docType: "student_list" }] }],
    ["маркер другого поля", { rows: [], fact_issues: [{ ...expulsionBlankMarker, field: "other" }] }],
    ["неполный маркер", { rows: [], fact_issues: [{ code: expulsionBlankMarker.code }, null] }],
  ])("не объявляет старый или неподтверждённый приказ пустым: %s", async (_description, variables_snapshot) => {
    const row = {
      ...docxRow, doc_type: "expulsion_order", name: "Прежний приказ об отчислении", is_current: false,
      variables_snapshot,
    };
    mockDocuments([row]);
    renderFolder();

    const notice = screen.getByRole("note", { name: "Распределение в приказе об отчислении" });
    expect(within(notice).getByText("Распределение учеников не проверено")).toBeVisible();
    expect(within(notice).getByText(/могли заполняться автоматически/)).toBeVisible();
    expect(within(notice).getByText(/Сформируйте новый бланк и проверьте распределение вручную/)).toBeVisible();
    expect(notice.closest("details")).toBeNull();
    expect(screen.queryByRole("button", { name: /Скачать бланк Word/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Скачать для проверки ${row.name}` }));
    await waitFor(() => expect(mocks.downloadPrivateFile).toHaveBeenCalledWith(
      "billing-documents", row.file_path, `${row.name}.docx`,
    ));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.saveGenerated).not.toHaveBeenCalled();
  });

  it("предупреждение приказа не меняет кнопки скачивания остальных восьми Word-документов", async () => {
    const otherRows = PACKAGE_DOC_TYPES.filter((type) => type !== "expulsion_order").map((type) => ({
      ...docxRow, id: `doc-${type}`, doc_type: type, name: `Документ ${type}`, file_path: `org-1/group-1/${type}.docx`,
    }));
    expect(otherRows).toHaveLength(8);
    mockDocuments([
      { ...docxRow, id: "expulsion", doc_type: "expulsion_order", name: "Приказ об отчислении" },
      ...otherRows,
    ]);
    renderFolder();

    expect(screen.getAllByRole("note", { name: "Распределение в приказе об отчислении" })).toHaveLength(1);
    for (const row of otherRows) {
      fireEvent.click(screen.getByRole("button", { name: `Скачать Word ${row.name}` }));
      await waitFor(() => expect(mocks.downloadPrivateFile).toHaveBeenCalledWith(
        "billing-documents", row.file_path, `${row.name}.docx`,
      ));
    }
    expect(mocks.downloadPrivateFile).toHaveBeenCalledTimes(8);
  });

  it("не меняет DOCX другой организации и HTML-приказ ГОРЭЛТЕХ", async () => {
    const row = { ...docxRow, doc_type: "expulsion_order", name: "Приказ об отчислении" };
    const genericContext = goreltechContext();
    genericContext.organization.id = "other-org";
    mockDocuments([row]);
    const view = renderFolder(genericContext);
    expect(screen.queryByRole("note", { name: "Распределение в приказе об отчислении" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Скачать Word ${row.name}` }));
    await waitFor(() => expect(mocks.downloadPrivateFile).toHaveBeenCalledWith(
      "billing-documents", row.file_path, `${row.name}.docx`,
    ));
    view.unmount();

    const htmlRow = { ...row, layout_format: "legacy_html", html: "<p>Сохранённый HTML</p>", file_path: null };
    mockDocuments([htmlRow]);
    renderFolder();
    expect(screen.queryByRole("note", { name: "Распределение в приказе об отчислении" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Открыть ${row.name}` })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: `Скачать ${row.name}` }));
    expect(mocks.downloadHtml).toHaveBeenCalledWith(expect.objectContaining({ id: row.id, html: htmlRow.html }));
  });

  it("не помечает файл без сохранённых замечаний и не превращает текст причины в HTML", () => {
    mockDocuments([docxRow]);
    const view = renderFolder();
    expect(screen.queryByText("Требует проверки")).not.toBeInTheDocument();
    view.unmount();

    const reason = "<b>Проверьте образование</b>";
    mockDocuments([{ ...docxRow, variables_snapshot: { fact_issues: [{ message: reason }] } }]);
    renderFolder();
    const text = screen.getByText(reason);
    expect(text.querySelector("b")).toBeNull();
    expect(screen.queryByText(/Источник данных не подтверждён/)).not.toBeInTheDocument();
  });

  it("удаляет документ только после явного подтверждения", async () => {
    mockDocuments([docxRow]);
    renderFolder();

    fireEvent.click(screen.getByRole("button", { name: `Удалить ${docxRow.name}` }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: `Удалить ${docxRow.name}` }));
    fireEvent.click(await screen.findByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(docxRow.id));
    expect(mocks.onDataChanged).toHaveBeenCalledTimes(1);
  });
});
