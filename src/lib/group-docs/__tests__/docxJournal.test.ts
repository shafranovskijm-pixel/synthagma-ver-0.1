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

  it("показывает точную серверную причину вместо non-2xx", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error("Шаблон журнала не найден") });

    await expect(generateClassJournalDocx({
      organizationId: "org-1",
      groupId: "group-1",
      fillMode: "data",
      otherDocuments: [],
    })).rejects.toThrow("Шаблон журнала не найден");
  });
});
