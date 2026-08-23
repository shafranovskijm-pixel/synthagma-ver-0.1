import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/utils/safeInvoke";
import { generateClassJournalDocx } from "../docxJournal";

vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn() }));

const invokeMock = vi.mocked(safeInvoke);

describe("generateClassJournalDocx", () => {
  beforeEach(() => invokeMock.mockReset());

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
      fillMode: "data",
      otherDocuments: [],
    })).resolves.toEqual({
      batchId: "batch-1",
      version: 3,
      insertedCount: 9,
      filePath: "journals/group-1.docx",
    });
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
      fillMode: "blank",
      journalSignatory: {
        position: "Руководитель учебного центра",
        name: "Ляпко Дарья Константиновна",
      },
      otherDocuments: [],
    });

    expect(invokeMock).toHaveBeenCalledWith("compile-group-class-journal", {
      body: expect.objectContaining({
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
        otherDocuments: [expect.objectContaining({
          signatory: {
            position: "Руководитель учебного центра",
            name: "Ляпко Дарья Константиновна",
          },
        })],
      }),
    });
  });
});
