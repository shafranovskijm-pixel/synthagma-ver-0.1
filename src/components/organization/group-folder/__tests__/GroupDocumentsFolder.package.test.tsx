import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GroupDocumentsFolder } from "../GroupDocumentsFolder";
import { SAMPLE_CONTEXT } from "@/lib/group-docs/sampleContext";
import { emptyFactualData } from "@/lib/group-docs/factualData";
import { PACKAGE_DOC_TYPES } from "@/lib/group-docs/packageTypes";
import { GORELTECH_ORGANIZATION_ID } from "@/lib/group-docs/clientProfile";

const mocks = vi.hoisted(() => ({
  useGroupDocuments: vi.fn(),
  useGroupFactualData: vi.fn(),
  generatePackage: vi.fn(),
  generateDocument: vi.fn(),
  generateClassJournalDocx: vi.fn(),
  refreshDocuments: vi.fn(),
  saveGenerated: vi.fn(),
  onDataChanged: vi.fn(),
  docxSave: vi.fn(),
  individualSave: vi.fn(),
  legalSave: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  openPrivateFile: vi.fn(),
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
  openPrivateFile: mocks.openPrivateFile,
  downloadPrivateFile: mocks.downloadPrivateFile,
}));

vi.mock("@/hooks/useGroupFactualData", () => ({
  useGroupFactualData: mocks.useGroupFactualData,
}));

vi.mock("@/lib/group-docs/generate", () => ({
  generateDocument: mocks.generateDocument,
  generatePackage: mocks.generatePackage,
  downloadHtml: vi.fn(),
}));

vi.mock("@/lib/group-docs/docxJournal", () => ({
  generateClassJournalDocx: mocks.generateClassJournalDocx,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: vi.fn(),
    warning: vi.fn(),
    info: mocks.toastInfo,
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

function mockDocuments(documents: Array<typeof docxRow>) {
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

describe("GroupDocumentsFolder package contract routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dialogState.docxProps = null;
    mocks.dialogState.individualProps = null;
    mocks.dialogState.legalProps = null;
    mocks.toastError.mockReset();
    mocks.toastInfo.mockReset();
    mocks.openPrivateFile.mockReset();
    mocks.openPrivateFile.mockResolvedValue(true);
    mocks.downloadPrivateFile.mockReset();
    mocks.downloadPrivateFile.mockResolvedValue(true);
    mocks.remove.mockReset();
    mocks.remove.mockResolvedValue(true);
    mocks.refreshDocuments.mockResolvedValue(undefined);
    mocks.saveGenerated.mockResolvedValue({ version: 1 });
    mocks.generatePackage.mockReturnValue(legacyDocs);
    mocks.generateClassJournalDocx.mockResolvedValue({ version: 1 });
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
        extras: expect.objectContaining({ contract_basis: "Договор № 2026-001" }),
      }),
      PACKAGE_DOC_TYPES.filter((type) => type !== "class_journal"),
      expect.any(Object),
    );
  });

  it("не считает два юрлица-договора успешным пакетом компании", async () => {
    renderFolder();
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
      .mockResolvedValueOnce({ version: 2 });
    renderFolder();

    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (Word клиента)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Сохранить договор Word" }));

    const retry = await screen.findByRole("button", { name: "Повторить 9 документов" });
    expect(screen.getByRole("button", { name: "Пакет компании (Word клиента)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Пакет физлица" })).toBeDisabled();

    fireEvent.click(retry);

    await waitFor(() => expect(mocks.generateClassJournalDocx).toHaveBeenCalledTimes(2));
    expect(mocks.docxSave).toHaveBeenCalledTimes(1);
    expect(mocks.individualSave).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Повторить 9 документов" })).not.toBeInTheDocument();
    });
  });

  it("сохраняет универсальный HTML-мастер только для пакета физлиц", async () => {
    renderFolder();

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

  it("оставляет заблокированные package-кнопки кликабельными и объясняет причину", () => {
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

    fireEvent.click(company);

    expect(mocks.toastError).toHaveBeenCalledWith(
      "Заполните обязательные данные группы",
      { description: "должность руководителя учебного центра" },
    );
    expect(mocks.dialogState.docxProps).toBeNull();
    expect(mocks.dialogState.legalProps).toBeNull();
    expect(mocks.generateClassJournalDocx).not.toHaveBeenCalled();
  });

  it("открывает DOCX в новой вкладке, а скачивает отдельной временной ссылкой", async () => {
    mockDocuments([docxRow]);
    renderFolder();

    fireEvent.click(screen.getByRole("button", { name: `Открыть ${docxRow.name}` }));
    await waitFor(() => {
      expect(mocks.openPrivateFile).toHaveBeenCalledWith("billing-documents", docxRow.file_path);
    });
    expect(mocks.downloadPrivateFile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: `Скачать ${docxRow.name}` }));
    await waitFor(() => {
      expect(mocks.downloadPrivateFile).toHaveBeenCalledWith(
        "billing-documents",
        docxRow.file_path,
        `${docxRow.name}.docx`,
      );
    });
    expect(mocks.openPrivateFile).toHaveBeenCalledTimes(1);
  });

  it("показывает ошибку, если вкладка или временная ссылка недоступны", async () => {
    mocks.openPrivateFile.mockResolvedValue(false);
    mocks.downloadPrivateFile.mockResolvedValue(false);
    mockDocuments([docxRow]);
    renderFolder();

    fireEvent.click(screen.getByRole("button", { name: `Открыть ${docxRow.name}` }));
    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Не удалось открыть файл Word",
        expect.objectContaining({ description: expect.stringContaining("новую вкладку") }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: `Скачать ${docxRow.name}` }));
    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Не удалось скачать файл Word",
        expect.objectContaining({ description: expect.stringContaining("временную ссылку") }),
      );
    });
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
