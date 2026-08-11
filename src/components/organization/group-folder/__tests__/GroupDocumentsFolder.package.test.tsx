import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GroupDocumentsFolder } from "../GroupDocumentsFolder";
import { SAMPLE_CONTEXT } from "@/lib/group-docs/sampleContext";
import { emptyFactualData } from "@/lib/group-docs/factualData";
import { PACKAGE_DOC_TYPES } from "@/lib/group-docs/packageTypes";

const mocks = vi.hoisted(() => ({
  useGroupDocuments: vi.fn(),
  useGroupFactualData: vi.fn(),
  generatePackage: vi.fn(),
  generateDocument: vi.fn(),
  generateClassJournalDocx: vi.fn(),
  refreshDocuments: vi.fn(),
  onDataChanged: vi.fn(),
  docxSave: vi.fn(),
  individualSave: vi.fn(),
  dialogState: {
    docxProps: null as any,
    individualProps: null as any,
  },
}));

vi.mock("@/hooks/useGroupDocuments", () => ({
  useGroupDocuments: mocks.useGroupDocuments,
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
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
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
    mocks.dialogState.individualProps = props;
    return (
      <button
        type="button"
        onClick={async () => {
          mocks.individualSave();
          await props.onGenerated({
            scenario: "individual",
            count: 2,
            contractNumbers: ["2026-101", "2026-102"],
          });
          props.onClose();
        }}
      >
        Сохранить договоры физлиц
      </button>
    );
  },
}));

const legacyDocs = PACKAGE_DOC_TYPES
  .filter((type) => type !== "class_journal")
  .map((type) => ({ doc_type: type }));

function renderFolder() {
  return render(
    <GroupDocumentsFolder
      organizationId="org-1"
      groupId="group-1"
      groupName="Группа 1"
      students={SAMPLE_CONTEXT.students}
      ctx={SAMPLE_CONTEXT}
      onDataChanged={mocks.onDataChanged}
    />,
  );
}

describe("GroupDocumentsFolder package contract routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dialogState.docxProps = null;
    mocks.dialogState.individualProps = null;
    mocks.refreshDocuments.mockResolvedValue(undefined);
    mocks.generatePackage.mockReturnValue(legacyDocs);
    mocks.generateClassJournalDocx.mockResolvedValue({ version: 1 });
    mocks.useGroupDocuments.mockReturnValue({
      documents: [],
      loading: false,
      refresh: mocks.refreshDocuments,
      saveGenerated: vi.fn(),
      remove: vi.fn(),
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
});
