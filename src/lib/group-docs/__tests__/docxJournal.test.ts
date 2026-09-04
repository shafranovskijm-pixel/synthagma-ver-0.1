import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/utils/safeInvoke";
import { generateClassJournalDocx, readClassJournalOperation } from "../docxJournal";
import { generatePackage } from "../generate";
import { SAMPLE_CONTEXT } from "../sampleContext";

const supabaseInvokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: supabaseInvokeMock } },
}));

const OP = "00000000-0000-4000-8000-000000000001";
const invokeMock = vi.mocked(safeInvoke);

describe("generateClassJournalDocx", () => {
  it("requires an operation UUID before capability or mutation", async () => {
    await expect(generateClassJournalDocx({ organizationId: "o", groupId: "g", studentUserIds: [], fillMode: "data", otherDocuments: [] })).rejects.toThrow("идентификатор");
    expect(supabaseInvokeMock).not.toHaveBeenCalled(); expect(invokeMock).not.toHaveBeenCalled();
  });
  it("looks up unknown operations read-only without treating unknown as completion", async () => {
    invokeMock.mockResolvedValue({ data: { compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP, operationStatus: "unknown", writesPerformed: false }, error: null });
    await expect(readClassJournalOperation({ organizationId: "o", groupId: "g", operationId: OP })).resolves.toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("compile-group-class-journal", expect.objectContaining({ retry: true, body: { action: "operation-status", organizationId: "o", groupId: "g", operationId: OP } }));
  });
  it.each(["operation", "revision", "status", "writes", "receipt-operation", "count", "hash", "batch", "type"])("rejects malformed status %s", async kind => {
    const payload = { compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP, operationStatus: "completed", writesPerformed: false,
      receipt: { operationId: OP, batch: { batch_id: "b", batch_version: 1, inserted_count: 9 }, document: { doc_type: "class_journal", name: "Журнал", file_path: "file.docx", docx_sha256: "A".repeat(64) } } };
    if (kind === "operation") payload.operationId = "other";
    if (kind === "revision") payload.compilerRevision = "old";
    if (kind === "status") payload.operationStatus = "pending";
    if (kind === "writes") payload.writesPerformed = true;
    if (kind === "receipt-operation") payload.receipt.operationId = "other";
    if (kind === "count") payload.receipt.batch.inserted_count = 8;
    if (kind === "hash") payload.receipt.document.docx_sha256 = "invalid";
    if (kind === "batch") payload.receipt.batch.batch_version = 0;
    if (kind === "type") payload.receipt.document.doc_type = "pass";
    invokeMock.mockResolvedValue({ data: payload, error: null });
    await expect(readClassJournalOperation({ organizationId: "o", groupId: "g", operationId: OP })).rejects.toThrow();
  });
  it("returns a confirmed nine-document receipt without claiming this lookup wrote", async () => {
    invokeMock.mockResolvedValue({ data: { compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP, operationStatus: "completed", writesPerformed: false,
      receipt: { operationId: OP, batch: { batch_id: "b", batch_version: 1, inserted_count: 9 }, document: { doc_type: "class_journal", name: "Журнал", file_path: "file.docx", docx_sha256: "A".repeat(64) }, warnings: [] } }, error: null });
    await expect(readClassJournalOperation({ organizationId: "o", groupId: "g", operationId: OP })).resolves.toMatchObject({ operationId: OP, writesPerformed: false, insertedCount: 9, batchId: "b" });
  });
  it.each([
    {}, { batch: {} },
    { batch: { batch_id: "b", batch_version: 1, inserted_count: 0 } },
    { batch: { batch_id: "b", batch_version: 1, inserted_count: 2 } },
    { batch: { batch_id: "b", batch_version: "1", inserted_count: 1 } },
    { document: null }, { document: { doc_type: "pass", name: "Wrong", file_path: "a", docx_sha256: "A".repeat(64) } },
    { writesPerformed: false }, { dryRun: true },
  ])("rejects incomplete or contradictory save acknowledgement %# without retry", async patch => {
    invokeMock.mockResolvedValue({ data: {
      compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP,
      ...(Object.keys(patch).length ? { batch: { batch_id: "b", batch_version: 1, inserted_count: 1 }, document: { doc_type: "class_journal", name: "Журнал", file_path: "a.docx", docx_sha256: "A".repeat(64) } } : {}),
      ...patch,
    }, error: null });
    await expect(generateClassJournalDocx({ operationId: OP, organizationId: "o", groupId: "g", studentUserIds: [], fillMode: "data", otherDocuments: [] })).rejects.toThrow("Сохранение могло произойти");
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith("compile-group-class-journal", expect.objectContaining({ retry: false }));
  });
  beforeEach(() => {
    invokeMock.mockReset();
    supabaseInvokeMock.mockReset();
    supabaseInvokeMock.mockResolvedValue({
      data: null,
      error: {
        context: {
          headers: new Headers({
            "X-Sintagma-Compiler-Revision": "goreltech-group-package-server-facts-v23",
          }),
        },
      },
    });
  });

  it("возвращает данные атомарной партии", async () => {
    invokeMock.mockResolvedValue({
      data: {
        compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP,
        batch: { batch_id: "batch-1", batch_version: 3, inserted_count: 1 },
        document: { doc_type: "class_journal", name: "Журнал", file_path: "journals/group-1.docx", docx_sha256: "A".repeat(64) },
      },
      error: null,
    });

    await expect(generateClassJournalDocx({ operationId: OP,
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      journalDocumentDate: "2026-08-25",
      fillMode: "data",
      otherDocuments: [],
    })).resolves.toEqual({
      operationId: OP,
      dryRun: false,
      writesPerformed: true,
      batchId: "batch-1",
      version: 3,
      insertedCount: 1,
      filePath: "journals/group-1.docx",
      warnings: [],
      documents: [],
    });
    expect(supabaseInvokeMock).toHaveBeenCalledWith("compile-group-class-journal", {
      body: { capabilityProbe: true },
    });
    expect(supabaseInvokeMock.mock.invocationCallOrder[0]).toBeLessThan(invokeMock.mock.invocationCallOrder[0]);
    expect(invokeMock).toHaveBeenCalledWith("compile-group-class-journal", {
      retry: false,
      body: expect.objectContaining({ dryRun: false }),
      headers: { "X-Sintagma-Required-Compiler-Revision": "goreltech-group-package-server-facts-v23" },
    });
  });

  it("проверяет полный пакет на сервере без Storage/DB-записи", async () => {
    const hash = "A".repeat(64);
    invokeMock.mockResolvedValue({
      data: {
        compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP,
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

    const result = await generateClassJournalDocx({ operationId: OP,
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
      retry: true,
      body: expect.objectContaining({ dryRun: true }),
      headers: {
        "X-Sintagma-Required-Compiler-Revision": "goreltech-group-package-server-facts-v23",
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

  it.each([
    "goreltech-group-package-fail-closed-v13",
    "goreltech-group-package-dry-run-v14",
    "goreltech-group-package-server-facts-v15",
    "goreltech-group-package-server-facts-v16",
    "goreltech-group-package-server-facts-v18",
    "goreltech-group-package-server-facts-v19",
    "goreltech-group-package-server-facts-v20",
    "goreltech-group-package-server-facts-v21",
    "goreltech-group-package-server-facts-v22",
  ])("не отправляет данные группы при неподтверждённой для v23 ревизии %s", async (revision) => {
    supabaseInvokeMock.mockResolvedValue({
      data: null,
      error: {
        context: {
          headers: new Headers({
            "X-Sintagma-Compiler-Revision": revision,
          }),
        },
      },
    });

    await expect(generateClassJournalDocx({ operationId: OP,
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      fillMode: "blank",
      dryRun: true,
      otherDocuments: [],
    })).rejects.toThrow("Безопасная серверная проверка ещё не развёрнута");

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("подтверждает v23 по JSON, когда Nginx не exposes response header", async () => {
    const probeResponse = new Response(JSON.stringify({
      error: "Некорректные данные",
      compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP,
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
    supabaseInvokeMock.mockResolvedValue({
      data: null,
      error: {
        context: probeResponse,
      },
    });
    invokeMock.mockResolvedValue({
      data: {
        compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP,
        dryRun: true,
        writesPerformed: false,
        documentCount: 1,
        documents: [{
          doc_type: "class_journal",
          name: "Журнал",
          docx_sha256: "A".repeat(64),
        }],
      },
      error: null,
    });

    await expect(generateClassJournalDocx({ operationId: OP,
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      fillMode: "blank",
      dryRun: true,
      otherDocuments: [],
    })).resolves.toEqual(expect.objectContaining({
      dryRun: true,
      writesPerformed: false,
      insertedCount: 1,
    }));

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(probeResponse.bodyUsed).toBe(false);
  });

  it.each([
    "goreltech-group-package-fail-closed-v13",
    "goreltech-group-package-server-facts-v15",
    "goreltech-group-package-server-facts-v21",
    "goreltech-group-package-server-facts-v22",
  ])("не доверяет JSON capability probe со старой revision %s", async (revision) => {
    supabaseInvokeMock.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({
          compilerRevision: revision,
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      },
    });

    await expect(generateClassJournalDocx({ operationId: OP,
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      fillMode: "blank",
      dryRun: true,
      otherDocuments: [],
    })).rejects.toThrow("Безопасная серверная проверка ещё не развёрнута");

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it.each([
    ["без error context", { data: null, error: {} }],
    ["с некорректным JSON", {
      data: null,
      error: {
        context: new Response("{", {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      },
    }],
    ["с нестроковой revision", {
      data: null,
      error: {
        context: new Response(JSON.stringify({ compilerRevision: null }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      },
    }],
    ["с неожиданно успешным probe", {
      data: { compilerRevision: "goreltech-group-package-server-facts-v23" },
      error: null,
    }],
  ])("не отправляет данные группы при capability probe %s", async (_caseName, probeResult) => {
    supabaseInvokeMock.mockResolvedValue(probeResult);

    await expect(generateClassJournalDocx({ operationId: OP,
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      fillMode: "blank",
      dryRun: true,
      otherDocuments: [],
    })).rejects.toThrow("Безопасная серверная проверка ещё не развёрнута");

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("не подменяет явно старый response header новым значением из JSON", async () => {
    supabaseInvokeMock.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({
          compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP,
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "X-Sintagma-Compiler-Revision": "goreltech-group-package-server-facts-v15",
          },
        }),
      },
    });

    await expect(generateClassJournalDocx({ operationId: OP,
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      fillMode: "blank",
      dryRun: true,
      otherDocuments: [],
    })).rejects.toThrow("Безопасная серверная проверка ещё не развёрнута");

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it.each(["blank", "data"] as const)("не передаёт реальный payload обычного сохранения %s старому Edge", async (fillMode) => {
    supabaseInvokeMock.mockResolvedValue({
      data: null,
      error: { context: { headers: new Headers({
        "X-Sintagma-Compiler-Revision": "goreltech-group-package-server-facts-v15",
      }) } },
    });
    await expect(generateClassJournalDocx({ operationId: OP,
      organizationId: "private-org", groupId: "private-group", studentUserIds: ["private-user"],
      fillMode, dryRun: false, otherDocuments: [],
    })).rejects.toThrow("Документы не отправлены и не сохранены");
    expect(invokeMock).not.toHaveBeenCalled();
    expect(supabaseInvokeMock).toHaveBeenCalledTimes(1);
    expect(supabaseInvokeMock).toHaveBeenCalledWith("compile-group-class-journal", { body: { capabilityProbe: true } });
  });

  it.each([undefined, null, 16, "goreltech-group-package-server-facts-v15", "goreltech-group-package-server-facts-v19", "goreltech-group-package-server-facts-v20", "goreltech-group-package-server-facts-v21", "goreltech-group-package-server-facts-v22"])(
    "не объявляет успех/отсутствие записи при неподтверждённой версии ответа сохранения %s", async (compilerRevision) => {
      invokeMock.mockResolvedValue({
        data: {
          compilerRevision,
          batch: { batch_id: "possibly-saved", batch_version: 1, inserted_count: 9 },
          document: { file_path: "possibly-saved.docx" },
        }, error: null,
      });
      await expect(generateClassJournalDocx({ operationId: OP,
        organizationId: "org-1", groupId: "group-1", studentUserIds: ["student-1"],
        fillMode: "data", dryRun: false, otherDocuments: [],
      })).rejects.toThrow("Версия ответа сервера не подтверждена. Сохранение могло произойти; обновите список документов перед повторной попыткой");
      // No retry that could produce a second package after an uncertain write.
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(supabaseInvokeMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["goreltech-group-package-server-facts-v15", "goreltech-group-package-server-facts-v21", "goreltech-group-package-server-facts-v22"])("не принимает dry-run %s после успешного v23 preflight", async (compilerRevision) => {
    invokeMock.mockResolvedValue({
      data: {
        compilerRevision,
        dryRun: true, writesPerformed: false, documentCount: 1,
        documents: [{ doc_type: "class_journal", name: "Журнал", docx_sha256: "A".repeat(64) }],
      }, error: null,
    });
    await expect(generateClassJournalDocx({ operationId: OP,
      organizationId: "org-1", groupId: "group-1", studentUserIds: ["student-1"],
      fillMode: "blank", dryRun: true, otherDocuments: [],
    })).rejects.toThrow("Сервер не подтвердил точную версию безопасной проверки Word-пакета");
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("отклоняет dry-run, если сервер не доказал отсутствие записи", async () => {
    invokeMock.mockResolvedValue({
      data: {
        compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP,
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

    await expect(generateClassJournalDocx({ operationId: OP,
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
        compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP,
        batch: { batch_id: "batch-1", batch_version: 1, inserted_count: 1 },
        document: { doc_type: "class_journal", name: "Журнал", file_path: "journals/group-1.docx", docx_sha256: "A".repeat(64) },
      },
      error: null,
    });

    await generateClassJournalDocx({ operationId: OP,
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
      retry: false,
      headers: { "X-Sintagma-Required-Compiler-Revision": "goreltech-group-package-server-facts-v23" },
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

    await expect(generateClassJournalDocx({ operationId: OP,
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      journalDocumentDate: "2026-08-25",
      fillMode: "data",
      otherDocuments: [],
    })).rejects.toThrow("Шаблон журнала не найден");
  });

  it.each(["returned", "thrown", "payload"] as const)("показывает неопределённость сохранения и не повторяет запрос при %s error", async (kind) => {
    if (kind === "returned") invokeMock.mockResolvedValue({ data: null, error: new TypeError("Failed to fetch") });
    else if (kind === "thrown") invokeMock.mockRejectedValue(new TypeError("Failed to fetch"));
    else invokeMock.mockResolvedValue({ data: { error: "Ответ RPC потерян" }, error: null });
    await expect(generateClassJournalDocx({ operationId: OP,
      organizationId: "org-1", groupId: "group-1", studentUserIds: ["student-1"],
      fillMode: "data", otherDocuments: [],
    })).rejects.toThrow("Сохранение могло произойти; перед повтором проверьте список документов");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0][1]).toMatchObject({ retry: false });
  });

  it("оставляет retry разрешённым только для dry-run и не сообщает о возможном сохранении", async () => {
    invokeMock.mockResolvedValue({ data: null, error: new TypeError("Failed to fetch") });
    await expect(generateClassJournalDocx({ operationId: OP,
      organizationId: "org-1", groupId: "group-1", studentUserIds: ["student-1"],
      fillMode: "blank", dryRun: true, otherDocuments: [],
    })).rejects.toThrow(/^Failed to fetch$/);
    expect(invokeMock.mock.calls[0][1]).toMatchObject({ retry: true });
  });

  it("передаёт параметры отдельного документа без локальной потери полей (не проверка допуска Edge)", async () => {
    invokeMock.mockResolvedValue({
      data: {
        compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP,
        batch: { batch_id: "batch-2", batch_version: 4, inserted_count: 1 },
        document: null,
      },
      error: null,
    });

    await generateClassJournalDocx({ operationId: OP,
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
      retry: false,
      headers: { "X-Sintagma-Required-Compiler-Revision": "goreltech-group-package-server-facts-v23" },
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
        compilerRevision: "goreltech-group-package-server-facts-v23", operationId: OP,
        batch: { batch_id: "batch-dates", batch_version: 1, inserted_count: 3 },
        document: { doc_type: "class_journal", name: "Журнал", file_path: "journals/group-dates.docx", docx_sha256: "A".repeat(64) },
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
    await generateClassJournalDocx({ operationId: OP,
      organizationId: "org-1",
      groupId: "group-1",
      studentUserIds: ["student-1"],
      journalDocumentDate: journalDraftDate,
      fillMode: "blank",
      otherDocuments: documents,
    });

    expect(invokeMock).toHaveBeenCalledWith("compile-group-class-journal", {
      retry: false,
      headers: { "X-Sintagma-Required-Compiler-Revision": "goreltech-group-package-server-facts-v23" },
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
