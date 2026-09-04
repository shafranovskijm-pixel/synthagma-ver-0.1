import type { GeneratedDocument } from "./schema";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";

export const GORELTECH_DRY_RUN_COMPILER_REVISION = "goreltech-group-package-server-facts-v24";
const validOperationId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Read-only receipt lookup. Unknown is not proof that a save did not happen. */
export async function readClassJournalOperation(input: { organizationId: string; groupId: string; operationId: string }): Promise<GenerateClassJournalResult | null> {
  if (!input.organizationId || !input.groupId || !validOperationId(input.operationId)) throw new Error("Некорректный контекст операции");
  await assertCompilerCapability();
  const { data: payload, error } = await safeInvoke<any>("compile-group-class-journal", {
    retry: true, body: { action: "operation-status", ...input },
    headers: { "X-Sintagma-Required-Compiler-Revision": GORELTECH_DRY_RUN_COMPILER_REVISION },
  });
  if (error) throw error;
  if (!payload || payload.error || payload.compilerRevision !== GORELTECH_DRY_RUN_COMPILER_REVISION || payload.operationId !== input.operationId || payload.writesPerformed !== false) throw new Error("Статус операции не подтверждён");
  if (payload.operationStatus === "unknown") {
    if (payload.receipt != null) throw new Error("Противоречивый статус операции");
    return null;
  }
  const receipt = payload.receipt;
  const batch = receipt?.batch;
  const journal = receipt?.document;
  if (payload.operationStatus !== "completed" || receipt?.operationId !== input.operationId
    || typeof batch?.batch_id !== "string" || !batch.batch_id.trim() || !Number.isSafeInteger(batch.batch_version) || batch.batch_version < 1 || batch.inserted_count !== 9
    || journal?.doc_type !== "class_journal" || typeof journal.name !== "string" || !journal.name.trim()
    || typeof journal.file_path !== "string" || !journal.file_path.trim() || typeof journal.docx_sha256 !== "string" || !/^[A-F0-9]{64}$/.test(journal.docx_sha256)) throw new Error("Квитанция полного пакета не подтверждена");
  return { operationId: input.operationId, dryRun: false, writesPerformed: false, batchId: batch.batch_id, version: batch.batch_version, insertedCount: batch.inserted_count, filePath: journal.file_path,
    warnings: Array.isArray(receipt.warnings) ? receipt.warnings.map(String).filter(Boolean) : [], documents: [] };
}

async function readCompilerRevision(error: unknown): Promise<string> {
  if (!error || typeof error !== "object" || !("context" in error)) return "";
  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== "object") return "";

  const headers = "headers" in context
    ? (context as { headers?: { get?: (name: string) => string | null } }).headers
    : undefined;
  const headerRevision = headers?.get?.("X-Sintagma-Compiler-Revision") || "";
  if (headerRevision) return headerRevision;

  // Старый Nginx production физически передаёт revision, но не открывает
  // custom response header браузерному CORS. Edge дублирует revision в JSON.
  // Читаем только копию error-response и принимаем точную текущую ревизию:
  // документы и связанный договор используют проверенные серверные источники.
  const response = context as Partial<Response>;
  if (typeof response.clone !== "function") return "";
  try {
    const payload = await response.clone().json() as { compilerRevision?: unknown };
    return typeof payload?.compilerRevision === "string" ? payload.compilerRevision : "";
  } catch {
    return "";
  }
}

async function assertCompilerCapability(): Promise<void> {
  const { error } = await supabase.functions.invoke("compile-group-class-journal", {
    // Намеренно невалидный обезличенный payload: обе версии завершают запрос до
    // чтения tenant-данных, а заголовок ответа позволяет fail-closed проверить
    // развёрнутую ревизию до отправки настоящего состава группы.
    body: { capabilityProbe: true },
  });
  const revision = await readCompilerRevision(error);
  if (revision !== GORELTECH_DRY_RUN_COMPILER_REVISION) {
    throw new Error(
      "Безопасная серверная проверка ещё не развёрнута. Документы не отправлены и не сохранены",
    );
  }
}

export interface GenerateClassJournalParams {
  operationId?: string;
  organizationId: string;
  groupId: string;
  /** Снимок активного состава группы, использованный для всех документов пакета. */
  studentUserIds: string[];
  /** IDs of saved contracts selected for this operation; never browser numbers. */
  contractIds?: readonly string[];
  /** Отдельная дата журнала; даты остальных документов передаются в самих документах. */
  journalDocumentDate?: string;
  /** @deprecated Общая дата старого клиента: только fallback для черновика. */
  documentDate?: string;
  fillMode: "blank" | "data";
  /** Собрать и проверить полный пакет на сервере, ничего не сохраняя. */
  dryRun?: boolean;
  includeJournal?: boolean;
  otherDocuments: GeneratedDocument[];
  journalSignatory?: {
    position: string;
    name: string;
  };
}

export interface GenerateClassJournalResult {
  operationId: string | null;
  dryRun: boolean;
  writesPerformed: boolean;
  batchId: string | null;
  version: number | null;
  insertedCount: number;
  filePath: string;
  warnings: string[];
  documents: Array<{
    docType: string;
    name: string;
    docxSha256: string;
  }>;
}

const legacyPayload = (document: GeneratedDocument) => ({
  doc_type: document.doc_type,
  name: document.name,
  document_number: document.document_number ?? null,
  document_date: document.document_date ?? null,
  variables: document.variables,
  html: document.html,
  doc_status: document.doc_status,
  fill_mode: document.fill_mode,
  layout_format: "legacy_html" as const,
  source_note: document.source_note ?? null,
  signatory: {
    position: document.variables.signatory_position ?? "",
    name: document.variables.signatory_name ?? "",
  },
});

/** Сервер перечитывает группу/учеников и сохраняет всю партию одной транзакцией. */
export async function generateClassJournalDocx(
  params: GenerateClassJournalParams,
): Promise<GenerateClassJournalResult> {
  if (!params.dryRun && !validOperationId(params.operationId)) throw new Error("Нужен корректный идентификатор операции сохранения");
  const contractIds = [...new Set(params.contractIds ?? [])];
  if (contractIds.length > 5000 || contractIds.some(id => !validOperationId(id))) throw new Error("Некорректные идентификаторы связанных договоров");
  // Both preview and save must negotiate the server-only facts revision before
  // any real roster/document payload is sent (including a rolling deployment).
  await assertCompilerCapability();
  const { data, error } = await safeInvoke<any>("compile-group-class-journal", {
    // A lost save response does not prove the RPC rolled back. Retrying could
    // create another complete package; only the read-only dry-run may retry.
    retry: params.dryRun === true,
    body: {
      organizationId: params.organizationId,
      ...(!params.dryRun ? { operationId: params.operationId } : {}),
      groupId: params.groupId,
      studentUserIds: params.studentUserIds,
      contractIds,
      journalDocumentDate: params.journalDocumentDate,
      ...(params.documentDate ? { documentDate: params.documentDate } : {}),
      fillMode: params.fillMode,
      dryRun: params.dryRun ?? false,
      includeJournal: params.includeJournal ?? true,
      journalSignatory: params.journalSignatory,
      otherDocuments: params.otherDocuments.map(legacyPayload),
    },
    headers: {
      "X-Sintagma-Required-Compiler-Revision": GORELTECH_DRY_RUN_COMPILER_REVISION,
    },
  }).catch((error: unknown) => ({
    data: null,
    error: error instanceof Error ? error : new Error(String(error)),
  }));
  const failureMessage = (message: string) => params.dryRun
    ? message
    : `${message}. Сохранение могло произойти; перед повтором проверьте список документов.`;
  if (error) throw new Error(failureMessage(error.message || "Не удалось сформировать журнал Word"));
  const payload = data;
  if (payload?.error) throw new Error(failureMessage(String(payload.error)));
  if (payload?.compilerRevision !== GORELTECH_DRY_RUN_COMPILER_REVISION) {
    throw new Error(params.dryRun
      ? "Сервер не подтвердил точную версию безопасной проверки Word-пакета"
      : "Версия ответа сервера не подтверждена. Сохранение могло произойти; обновите список документов перед повторной попыткой");
  }
  const batch = payload?.batch || {};
  const documents = Array.isArray(payload?.documents)
    ? payload.documents.map((document: Record<string, unknown>) => ({
        docType: String(document.doc_type || ""),
        name: String(document.name || ""),
        docxSha256: String(document.docx_sha256 || ""),
      }))
    : [];
  if (params.dryRun) {
    const expectedCount = params.otherDocuments.length + (params.includeJournal === false ? 0 : 1);
    const validHashes = documents.every((document) => /^[A-F0-9]{64}$/.test(document.docxSha256));
    if (
      payload?.dryRun !== true
      || payload?.writesPerformed !== false
      || Number(payload?.documentCount) !== expectedCount
      || documents.length !== expectedCount
      || !validHashes
    ) {
      throw new Error("Сервер не подтвердил безопасную проверку Word-пакета без сохранения");
    }
  } else {
    const expectedCount = params.otherDocuments.length + (params.includeJournal === false ? 0 : 1);
    const journal = payload?.document;
    // The save endpoint currently returns batch metadata and the journal only,
    // not the dry-run documents array. Validate what it actually acknowledges.
    const validJournal = params.includeJournal === false ? journal === null
      : journal?.doc_type === "class_journal"
        && typeof journal.name === "string" && journal.name.trim().length > 0
        && typeof journal.file_path === "string" && journal.file_path.trim().length > 0
        && typeof journal.docx_sha256 === "string" && /^[A-F0-9]{64}$/.test(journal.docx_sha256);
    if (payload?.operationId !== params.operationId || payload?.dryRun === true || payload?.writesPerformed === false
      || typeof batch.batch_id !== "string" || !batch.batch_id.trim()
      || !Number.isSafeInteger(batch.batch_version) || batch.batch_version < 1
      || !Number.isSafeInteger(batch.inserted_count) || batch.inserted_count !== expectedCount
      || !validJournal) {
      throw new Error(failureMessage("Ответ сервера не подтвердил сохранение полной партии документов"));
    }
  }
  return {
    operationId: params.dryRun ? null : params.operationId!,
    dryRun: payload?.dryRun === true,
    writesPerformed: payload?.writesPerformed !== false && payload?.dryRun !== true,
    batchId: batch.batch_id || null,
    version: Number(batch.batch_version) || null,
    insertedCount: params.dryRun ? Number(payload.documentCount) : batch.inserted_count,
    filePath: String(payload?.document?.file_path || ""),
    warnings: Array.isArray(payload?.warnings)
      ? payload.warnings.map((warning: unknown) => String(warning)).filter(Boolean)
      : [],
    documents,
  };
}
