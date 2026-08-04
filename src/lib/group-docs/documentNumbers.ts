import type { DocType } from "./schema";

/**
 * Нумерация документов группы.
 *
 * Никаких клиентских счётчиков: номер всегда выдаёт атомарный серверный RPC
 * get_next_document_number(org, doc_type, year). После reload номера не
 * дублируются, потому что состояние хранится в document_number_sequences.
 */

/** Типы, для которых номер юридически обязателен. */
export const NUMBERED_DOC_TYPES: DocType[] = ["contract", "enrollment_order", "expulsion_order"];

export function requiresDocumentNumber(docType: DocType): boolean {
  return NUMBERED_DOC_TYPES.includes(docType);
}

/** Ключ последовательности: doc_type + year (год передаётся отдельным аргументом RPC). */
export function docNumberSequenceKey(docType: DocType): string {
  if (docType === "contract") return "group_contract";
  return "group_order";
}

/** Формат клиента ГОРЭЛТЕХ: приказы — УЦ-N/YYYY, договоры — YYYY-NNN. */
export function formatGroupDocumentNumber(docType: DocType, n: number, year: number): string {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Серверная нумерация вернула некорректный номер");
  }
  if (docType === "contract") return `${year}-${String(n).padStart(3, "0")}`;
  return `УЦ-${n}/${year}`;
}

export type ReserveNumberFn = (seqKey: string, year: number) => Promise<number>;

/**
 * Резервирует номера ДО генерации. При любой ошибке нумерации бросает —
 * вызывающий код не сохраняет и не выдаёт документы как final.
 */
export async function reserveGroupDocumentNumbers(
  types: DocType[],
  year: number,
  reserve: ReserveNumberFn,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of types) {
    if (!requiresDocumentNumber(t)) continue;
    const n = await reserve(docNumberSequenceKey(t), year);
    out[t] = formatGroupDocumentNumber(t, Number(n), year);
  }
  return out;
}
