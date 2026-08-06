import { supabase } from "@/integrations/supabase/client";
import type { GeneratedDocument } from "./schema";

export interface GenerateClassJournalParams {
  organizationId: string;
  groupId: string;
  fillMode: "blank" | "data";
  otherDocuments: GeneratedDocument[];
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
});

/** Сервер перечитывает группу/учеников и сохраняет всю партию одной транзакцией. */
export async function generateClassJournalDocx(
  params: GenerateClassJournalParams,
): Promise<GenerateClassJournalResult> {
  const { data, error } = await supabase.functions.invoke("compile-group-class-journal", {
    body: {
      organizationId: params.organizationId,
      groupId: params.groupId,
      fillMode: params.fillMode,
      otherDocuments: params.otherDocuments.map(legacyPayload),
    },
  });
  if (error) throw new Error(error.message || "Не удалось сформировать журнал Word");
  const payload = data as any;
  if (payload?.error) throw new Error(payload.error);
  const batch = payload?.batch || {};
  return {
    batchId: batch.batch_id || null,
    version: Number(batch.batch_version) || null,
    insertedCount: Number(batch.inserted_count) || params.otherDocuments.length + 1,
    filePath: String(payload?.document?.file_path || ""),
  };
}
