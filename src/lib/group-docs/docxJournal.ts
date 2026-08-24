import type { GeneratedDocument } from "./schema";
import { safeInvoke } from "@/utils/safeInvoke";

export interface GenerateClassJournalParams {
  organizationId: string;
  groupId: string;
  /** Снимок активного состава группы, использованный для всех документов пакета. */
  studentUserIds: string[];
  /** Одна локальная дата документа для всех девяти файлов пакета. */
  documentDate: string;
  fillMode: "blank" | "data";
  includeJournal?: boolean;
  otherDocuments: GeneratedDocument[];
  journalSignatory?: {
    position: string;
    name: string;
  };
}

export interface GenerateClassJournalResult {
  batchId: string | null;
  version: number | null;
  insertedCount: number;
  filePath: string;
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
  const { data, error } = await safeInvoke<any>("compile-group-class-journal", {
    body: {
      organizationId: params.organizationId,
      groupId: params.groupId,
      studentUserIds: params.studentUserIds,
      documentDate: params.documentDate,
      fillMode: params.fillMode,
      includeJournal: params.includeJournal ?? true,
      journalSignatory: params.journalSignatory,
      otherDocuments: params.otherDocuments.map(legacyPayload),
    },
  });
  if (error) throw new Error(error.message || "Не удалось сформировать журнал Word");
  const payload = data;
  if (payload?.error) throw new Error(payload.error);
  const batch = payload?.batch || {};
  return {
    batchId: batch.batch_id || null,
    version: Number(batch.batch_version) || null,
    insertedCount:
      Number(batch.inserted_count)
      || params.otherDocuments.length + (params.includeJournal === false ? 0 : 1),
    filePath: String(payload?.document?.file_path || ""),
  };
}
