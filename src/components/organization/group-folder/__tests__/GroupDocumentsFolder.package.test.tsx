import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GroupDocumentsFolder } from "../GroupDocumentsFolder";
import { SAMPLE_CONTEXT } from "@/lib/group-docs/sampleContext";
import { emptyFactualData } from "@/lib/group-docs/factualData";
import { PACKAGE_DOC_TYPES } from "@/lib/group-docs/packageTypes";
import { GORELTECH_ORGANIZATION_ID } from "@/lib/group-docs/clientProfile";
import {compatibleArtifactSnapshot,envelope,id} from '@/lib/groupEducationFacts/__tests__/fixtures';
vi.mock('@/hooks/useGroupEducationFacts',()=>({useGroupEducationFacts:()=>mocks.education}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:mocks.actor},loading:false})}));
vi.mock('@/utils/courseCache',()=>({captureOfflineActor:()=>mocks.accessRevision}));
vi.mock('@/lib/groupEducationFacts/client',async original=>({...await original<typeof import('@/lib/groupEducationFacts/client')>(),captureEducationScope:vi.fn((organizationId,groupId,current)=>({organizationId,groupId,current,actorId:mocks.actor,accessRevision:mocks.accessRevision})),educationBearer:()=>mocks.bearer(),educationScopeCurrent:(s:any)=>s.actorId===mocks.actor&&s.accessRevision===mocks.accessRevision&&s.current(),saveEducationDocuments:(...args:any[])=>mocks.saveEducation(...args)}));

const mocks = vi.hoisted(() => ({
  actor:'',accessRevision:1,
  education:{} as any,
  bearer:vi.fn(),
  saveEducation:vi.fn(),
  useGroupDocuments: vi.fn(),
  resolveProgram: vi.fn(),
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
  toastSuccess: vi.fn(),
  downloadPrivateFile: vi.fn(),
  remove: vi.fn(),
  dialogState: {
    docxProps: null as any,
    individualProps: null as any,
    legalProps: null as any,
  },
}));

vi.mock("../../../../../supabase/functions/_shared/program-facts", async importOriginal => ({
  ...await importOriginal<typeof import("../../../../../supabase/functions/_shared/program-facts")>(),
  resolveGroupProgramGeneration: mocks.resolveProgram,
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
  downloadHtml: vi.fn(),
}));

vi.mock("@/lib/group-docs/docxJournal", () => ({
  generateClassJournalDocx: mocks.generateClassJournalDocx,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor=id(40);mocks.accessRevision=1;
    mocks.education={scopeKey:'actor-a:1',envelope:null,calendarValue:null,snapshotValue:null,busy:false,pending:false,error:null,scopeCurrent:()=>false,calendar:vi.fn(),invalidateAccess:vi.fn()};
    mocks.bearer.mockReset().mockResolvedValue('Bearer original');mocks.saveEducation.mockReset().mockResolvedValue({version:1});
    mocks.dialogState.docxProps = null;
    mocks.dialogState.individualProps = null;
    mocks.dialogState.legalProps = null;
    mocks.toastError.mockReset();
    mocks.resolveProgram.mockReset().mockResolvedValue({state:"unconfirmed",reason:"no_confirmed_group_binding",fields:null,
      provenance:{schema_version:1,state:"unconfirmed",organization_id:"org-1",group_id:"group-1",course_id:null,reason:"no_confirmed_group_binding"}});
    mocks.toastSuccess.mockReset();
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
      .mockResolvedValueOnce({ version: 2 });
    renderFolder();
    await confirmSourceSignatories();

    fireEvent.click(screen.getByRole("button", { name: "Пакет компании (Word клиента)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Сохранить договор Word" }));

    const retry = await screen.findByRole("button", { name: "Повторить 9 документов" });
    expect(screen.getByRole("button", { name: "Пакет компании (Word клиента)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Пакет физлица" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Пересобрать 9 Word-документов" })).toBeDisabled();

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

  it('explicit source selection sends only canonical retained participants, pinned bearer and separate dates',async()=>{
    const source=compatibleArtifactSnapshot(),ctx=structuredClone(SAMPLE_CONTEXT);ctx.organization.id=id(1);ctx.organization.name='ТЕСТОВЫЙ УЦ';ctx.organization.inn='0000000000';ctx.organization.director_position='Директор';ctx.organization.director_name='Учебный руководитель';ctx.group.id=id(2);ctx.group.instructor_name='Текущая подпись';
    mocks.education={...mocks.education,envelope:envelope(),snapshotValue:source,scopeCurrent:()=>true};
    render(<GroupDocumentsFolder organizationId={id(1)} groupId={id(2)} groupName="Учебная группа" students={ctx.students} ctx={ctx}/>);
    fireEvent.click(screen.getByRole('checkbox',{name:'Использовать подтверждённый состав и календарь'}));
    for(const type of PACKAGE_DOC_TYPES)fireEvent.change(screen.getByLabelText(`Дата документа ${type}`),{target:{value:'2026-11-01'}});
    fireEvent.click(screen.getByRole('button',{name:'Пакет компании (универсальный)'}));fireEvent.click(await screen.findByRole('button',{name:'Сохранить универсальный договор компании'}));
    await waitFor(()=>expect(mocks.saveEducation).toHaveBeenCalledTimes(1));
    expect(mocks.resolveProgram).not.toHaveBeenCalled();expect(mocks.saveGenerated).not.toHaveBeenCalled();expect(mocks.bearer).toHaveBeenCalledTimes(1);
    expect(mocks.generatePackage).toHaveBeenCalledWith(expect.objectContaining({students:[expect.objectContaining({user_id:id(20),full_name:'Учебная подпись'})]}),PACKAGE_DOC_TYPES,expect.objectContaining({educationSnapshot:source,requestedStatus:'draft',factual:null,documentDates:expect.objectContaining({class_journal:'2026-11-01'})}));
    expect(mocks.saveEducation.mock.calls[0][2]).toBe('Bearer original');expect(screen.getByLabelText('Момент состава для документов')).toBeDisabled();
  });

  it.each(['actor','access'])('same group %s ABA clears source selection/drafts and suppresses a late compiler continuation',async kind=>{
    const source=compatibleArtifactSnapshot(),ctx=goreltechContext();ctx.group.id=id(2);source.header.scope.organization_id=GORELTECH_ORGANIZATION_ID;source.projection.scope.organization_id=GORELTECH_ORGANIZATION_ID;source.projection.calendar.scope.organization_id=GORELTECH_ORGANIZATION_ID;source.projection.program_facts.organization_id=GORELTECH_ORGANIZATION_ID;
    let finish!:(value:any)=>void;mocks.generateClassJournalDocx.mockImplementationOnce(()=>new Promise(r=>finish=r));mocks.education={...mocks.education,envelope:{...envelope(),organization_id:GORELTECH_ORGANIZATION_ID},snapshotValue:source,scopeCurrent:()=>true};
    const props={organizationId:GORELTECH_ORGANIZATION_ID,groupId:id(2),groupName:'Учебная группа',students:ctx.students,ctx,onDataChanged:mocks.onDataChanged};const view=render(<GroupDocumentsFolder {...props}/>);
    fireEvent.click(screen.getByRole('checkbox',{name:'Использовать подтверждённый состав и календарь'}));fireEvent.change(screen.getByLabelText('Основание фиксации состава'),{target:{value:'PRIVATE-A-SOURCE-REASON'}});for(const type of PACKAGE_DOC_TYPES)fireEvent.change(screen.getByLabelText(`Дата документа ${type}`),{target:{value:'2026-11-01'}});await confirmSourceSignatories();fireEvent.click(screen.getByRole('button',{name:'Пересобрать 9 Word-документов'}));await waitFor(()=>expect(mocks.generateClassJournalDocx).toHaveBeenCalledTimes(1));
    const originalParams=mocks.generateClassJournalDocx.mock.calls[0][0];expect(originalParams.isCurrent()).toBe(true);mocks.accessRevision++;if(kind==='actor')mocks.actor=id(41);mocks.education={...mocks.education,scopeKey:'B:2'};view.rerender(<GroupDocumentsFolder {...props}/>);
    expect(screen.getByRole('checkbox',{name:'Использовать подтверждённый состав и календарь'})).not.toBeChecked();expect(screen.queryByDisplayValue('PRIVATE-A-SOURCE-REASON')).toBeNull();expect(originalParams.isCurrent()).toBe(false);
    fireEvent.click(screen.getByRole('checkbox',{name:'Использовать подтверждённый состав и календарь'}));expect(screen.getByLabelText('Основание фиксации состава')).toHaveValue('');expect(screen.getByLabelText('Дата документа class_journal')).toHaveValue('');mocks.accessRevision++;mocks.actor=id(40);mocks.education={...mocks.education,scopeKey:'A:3'};view.rerender(<GroupDocumentsFolder {...props}/>);expect(screen.getByRole('checkbox',{name:'Использовать подтверждённый состав и календарь'})).not.toBeChecked();
    await act(async()=>finish({dryRun:false,version:7,warnings:[]}));expect(mocks.refreshDocuments).not.toHaveBeenCalled();expect(mocks.saveEducation).not.toHaveBeenCalled();expect(mocks.saveGenerated).not.toHaveBeenCalled();expect(mocks.toastSuccess).not.toHaveBeenCalled();expect(mocks.onDataChanged).not.toHaveBeenCalled();
  });
  it('same actor hook authority epoch masks unsaved source fields synchronously',()=>{mocks.education={...mocks.education,scopeCurrent:()=>true};const props={organizationId:id(1),groupId:id(2),groupName:'Учебная группа',students:SAMPLE_CONTEXT.students,ctx:structuredClone(SAMPLE_CONTEXT)};const view=render(<GroupDocumentsFolder {...props}/>);fireEvent.click(screen.getByRole('checkbox',{name:'Использовать подтверждённый состав и календарь'}));fireEvent.change(screen.getByLabelText('Основание фиксации состава'),{target:{value:'PRIVATE-OLD-EPOCH'}});fireEvent.change(screen.getByLabelText('Дата документа class_journal'),{target:{value:'2026-11-01'}});mocks.education={...mocks.education,scopeKey:'actor-a:new-authority'};view.rerender(<GroupDocumentsFolder {...props}/>);expect(screen.queryByDisplayValue('PRIVATE-OLD-EPOCH')).toBeNull();expect(screen.getByLabelText('Дата документа class_journal')).toHaveValue('');});
});
