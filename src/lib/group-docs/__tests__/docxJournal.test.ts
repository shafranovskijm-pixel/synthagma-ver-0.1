import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/utils/safeInvoke";
import { generateClassJournalDocx } from "../docxJournal";
import { generatePackage } from "../generate";
import { SAMPLE_CONTEXT } from "../sampleContext";

const supabaseInvokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: supabaseInvokeMock } },
}));

const invokeMock = vi.mocked(safeInvoke);

describe("generateClassJournalDocx", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    supabaseInvokeMock.mockReset();
    supabaseInvokeMock.mockResolvedValue({
      data: null,
      error: {
        context: {
          headers: new Headers({
            "X-Sintagma-Compiler-Revision": "goreltech-group-package-dry-run-v14",
          }),
        },
      },
    });
  });

  it("возвращает данные атомарной партии", async () => {
    invokeMock.mockResolvedValue({
      data: {
        batch: { batch_id: "batch-1", batch_version: 3, inserted_count: 9 },
        document: { file_path: "journals/group-1.docx" },
      },
      error: null,
    });

    await expect(generateClassJournalDocx({
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      journalDocumentDate: "2026-08-25",
      fillMode: "data",
      otherDocuments: [],
    })).resolves.toEqual({
      dryRun: false,
      writesPerformed: true,
      batchId: "batch-1",
      version: 3,
      insertedCount: 9,
      filePath: "journals/group-1.docx",
      warnings: [],
      documents: [],
    });
  });

  it("проверяет полный пакет на сервере без Storage/DB-записи", async () => {
    const hash = "A".repeat(64);
    invokeMock.mockResolvedValue({
      data: {
        dryRun: true,
        writesPerformed: false,
        documentCount: 2,
        documents: [
          { doc_type: "enrollment_order", name: "Приказ", docx_sha256: hash },
          { doc_type: "class_journal", name: "Журнал", docx_sha256: hash },
        ],
        warnings: ["Черновик"],
      },
      error: null,
    });

    const result = await generateClassJournalDocx({
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      fillMode: "blank",
      dryRun: true,
      otherDocuments: [{
        id: "doc-1",
        status: "draft",
        created_at: "2026-08-15T00:00:00.000Z",
        layout_format: "legacy_html",
        doc_type: "enrollment_order",
        name: "Приказ",
        document_number: null,
        document_date: "2026-08-15",
        variables: {},
        html: "<html></html>",
        doc_status: "draft",
        fill_mode: "blank",
        source_note: "",
      }],
    });

    expect(invokeMock).toHaveBeenCalledWith("compile-group-class-journal", {
      body: expect.objectContaining({ dryRun: true }),
      headers: {
        "X-Sintagma-Required-Compiler-Revision": "goreltech-group-package-dry-run-v14",
      },
    });
    expect(supabaseInvokeMock).toHaveBeenCalledWith("compile-group-class-journal", {
      body: { capabilityProbe: true },
    });
    expect(result).toEqual(expect.objectContaining({
      dryRun: true,
      writesPerformed: false,
      insertedCount: 2,
      filePath: "",
      documents: [
        { docType: "enrollment_order", name: "Приказ", docxSha256: hash },
        { docType: "class_journal", name: "Журнал", docxSha256: hash },
      ],
    }));
  });

  it("не отправляет данные группы в старый Edge до подтверждения v14", async () => {
    supabaseInvokeMock.mockResolvedValue({
      data: null,
      error: {
        context: {
          headers: new Headers({
            "X-Sintagma-Compiler-Revision": "goreltech-group-package-fail-closed-v13",
          }),
        },
      },
    });

    await expect(generateClassJournalDocx({
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      fillMode: "blank",
      dryRun: true,
      otherDocuments: [],
    })).rejects.toThrow("Безопасная серверная проверка ещё не развёрнута");

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("отклоняет dry-run, если сервер не доказал отсутствие записи", async () => {
    invokeMock.mockResolvedValue({
      data: {
        dryRun: true,
        writesPerformed: true,
        documentCount: 1,
        documents: [{
          doc_type: "class_journal",
          name: "Журнал",
          docx_sha256: "A".repeat(64),
        }],
      },
      error: null,
    });

    await expect(generateClassJournalDocx({
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      fillMode: "blank",
      dryRun: true,
      otherDocuments: [],
    })).rejects.toThrow("Сервер не подтвердил безопасную проверку Word-пакета без сохранения");
  });

  it("передаёт выбранного подписанта журнала без подмены должности", async () => {
    invokeMock.mockResolvedValue({
      data: {
        batch: { batch_id: "batch-1", batch_version: 1, inserted_count: 1 },
        document: { file_path: "journals/group-1.docx" },
      },
      error: null,
    });

    await generateClassJournalDocx({
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      journalDocumentDate: "2026-08-25",
      fillMode: "blank",
      journalSignatory: {
        position: "Руководитель учебного центра",
        name: "Ляпко Дарья Константиновна",
      },
      otherDocuments: [],
    });

    expect(invokeMock).toHaveBeenCalledWith("compile-group-class-journal", {
      body: expect.objectContaining({
        studentUserIds: ["student-1"],
        journalDocumentDate: "2026-08-25",
        journalSignatory: {
          position: "Руководитель учебного центра",
          name: "Ляпко Дарья Константиновна",
        },
      }),
    });
  });

  it("показывает точную серверную причину вместо non-2xx", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error("Шаблон журнала не найден") });

    await expect(generateClassJournalDocx({
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      journalDocumentDate: "2026-08-25",
      fillMode: "data",
      otherDocuments: [],
    })).rejects.toThrow("Шаблон журнала не найден");
  });

  it("умеет собрать отдельный точный документ без лишнего журнала", async () => {
    invokeMock.mockResolvedValue({
      data: {
        batch: { batch_id: "batch-2", batch_version: 4, inserted_count: 1 },
        document: null,
      },
      error: null,
    });

    await generateClassJournalDocx({
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      journalDocumentDate: "2026-08-25",
      fillMode: "blank",
      includeJournal: false,
      otherDocuments: [{
        id: "doc-1",
        status: "draft",
        created_at: "2026-08-15T00:00:00.000Z",
        layout_format: "legacy_html",
        doc_type: "enrollment_order",
        name: "Приказ",
        document_number: null,
        document_date: "2026-08-15",
        variables: {
          signatory_position: "Руководитель учебного центра",
          signatory_name: "Ляпко Дарья Константиновна",
        },
        html: "<html></html>",
        doc_status: "draft",
        fill_mode: "blank",
        source_note: "",
      }],
    });

    expect(invokeMock).toHaveBeenCalledWith("compile-group-class-journal", {
      body: expect.objectContaining({
        includeJournal: false,
        journalDocumentDate: "2026-08-25",
        otherDocuments: [expect.objectContaining({
          document_date: "2026-08-15",
          signatory: {
            position: "Руководитель учебного центра",
            name: "Ляпко Дарья Константиновна",
          },
        })],
      }),
    });
  });

  it("сохраняет разные даты зачисления и завершения до compile payload", async () => {
    invokeMock.mockResolvedValue({
      data: {
        batch: { batch_id: "batch-dates", batch_version: 1, inserted_count: 3 },
        document: { file_path: "journals/group-dates.docx" },
      },
      error: null,
    });
    const documents = generatePackage(
      SAMPLE_CONTEXT,
      ["enrollment_order", "expulsion_order"],
      {
        mode: "blank",
        requestedStatus: "draft",
        // Старый общий параметр пакета не должен подменять отдельные даты.
        documentDate: "2026-08-25",
      },
    );

    expect(documents[0].document_date).toBe(SAMPLE_CONTEXT.group.start_date);
    expect(documents[1].document_date).toBe(SAMPLE_CONTEXT.group.end_date);
    expect(documents[0].document_date).not.toBe(documents[1].document_date);

    const journalDraftDate = "2026-08-25";
    await generateClassJournalDocx({
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      journalDocumentDate: journalDraftDate,
      fillMode: "blank",
      otherDocuments: documents,
    });

    expect(invokeMock).toHaveBeenCalledWith("compile-group-class-journal", {
      body: expect.objectContaining({
        journalDocumentDate: journalDraftDate,
        otherDocuments: [
          expect.objectContaining({
            doc_type: "enrollment_order",
            document_date: SAMPLE_CONTEXT.group.start_date,
          }),
          expect.objectContaining({
            doc_type: "expulsion_order",
            document_date: SAMPLE_CONTEXT.group.end_date,
          }),
        ],
      }),
    });
    const compileBody = invokeMock.mock.calls.at(-1)?.[1]?.body as Record<string, any>;
    expect(compileBody).not.toHaveProperty("documentDate");
    expect(compileBody.journalDocumentDate).not.toBe(documents[0].document_date);
    expect(compileBody.journalDocumentDate).not.toBe(documents[1].document_date);
  });
});
