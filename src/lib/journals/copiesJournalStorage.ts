import { isValid, parseISO } from "date-fns";

export interface CopyDuplicateRecord {
  id: string;
  reg_number: string;
  recipient_name: string;
  original_document_type: string;
  original_document_number: string;
  original_issue_date: string;
  copy_type: "copy" | "duplicate";
  issue_date: string;
  issue_reason: string;
  notes: string | null;
}

export const COPIES_STORAGE_ERROR = "Не удалось прочитать журнал в этом браузере. Исходные данные сохранены без изменений. Закройте журнал и откройте снова; не очищайте хранилище браузера.";
export const COPIES_STORAGE_CHANGED = "Журнал в браузере изменился. Сохранение отменено, чтобы не перезаписать записи. Закройте журнал и откройте снова.";

export function copiesJournalKey(organizationId: string) {
  return `copies_duplicates_${organizationId}`;
}

/** Validate readability without normalizing, repairing or dropping legacy fields. */
export function readCopiesJournal(organizationId: string): { raw: string | null; records: CopyDuplicateRecord[] } {
  const raw = localStorage.getItem(copiesJournalKey(organizationId));
  if (raw === null) return { raw, records: [] };
  const value: unknown = JSON.parse(raw);
  const strings = ["id", "reg_number", "recipient_name", "original_document_type", "original_document_number", "original_issue_date", "issue_date", "issue_reason"];
  if (!Array.isArray(value) || !value.every(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    if (!strings.every(key => typeof row[key] === "string")) return false;
    return (row.copy_type === "copy" || row.copy_type === "duplicate")
      && (row.notes === null || typeof row.notes === "string")
      && isValid(parseISO(row.original_issue_date)) && isValid(parseISO(row.issue_date));
  })) throw new Error(COPIES_STORAGE_ERROR);
  return { raw, records: value as CopyDuplicateRecord[] };
}
