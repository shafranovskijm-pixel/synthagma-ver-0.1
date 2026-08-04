/**
 * Общий (pure) контекст группы для журналов организации.
 *
 * Приватность: если журнал открыт в контексте группы, он ОБЯЗАН показывать только
 * строки участников этой группы (и, где применимо, только по привязанному курсу).
 * До завершения загрузки состава группы и при ошибке — НИКОГДА не показывать данные
 * всей организации.
 */

export type GroupContextStatus = "loading" | "ready" | "error";

export interface GroupJournalContext {
  groupId: string;
  /** Курс, к которому привязана группа (может отсутствовать). */
  courseId?: string | null;
  /** Точный список user_id участников группы. null — состав ещё не загружен. */
  memberUserIds: string[] | null;
  status: GroupContextStatus;
  errorMessage?: string | null;
}

export type GroupGateState = "none" | "loading" | "error" | "unsupported" | "ready";

/** Журналы, строки которых надёжно связаны с user_id (и курсом). */
export const GROUP_SUPPORTED_JOURNALS = new Set([
  "attendance",
  "current_control",
  "final_attestation",
  "document_registration",
  "education_documents",
  "identification",
]);

/**
 * Журналы, которые нельзя надёжно связать с конкретным учеником:
 * ручные/локальные реестры без user_id. В контексте группы они блокируются.
 */
export const GROUP_UNSUPPORTED_JOURNAL_REASONS: Record<string, string> = {
  copies_duplicates:
    "Записи журнала копий/дубликатов заполняются вручную и не связаны с учётной записью ученика, поэтому их нельзя ограничить составом группы.",
  strict_forms:
    "Журнал бланков строгой отчётности ведётся по организации и не связан с конкретными учениками.",
  entry_control:
    "Журнал входного контроля ведётся вручную и не связан с учётными записями учеников.",
  individual_plans:
    "Реестр индивидуальных учебных планов ведётся вручную и не связан с учётными записями учеников.",
  internship:
    "Журнал стажировки/практики ведётся вручную и не связан с учётными записями учеников.",
  safety_instructions:
    "Журнал инструктажей ведётся вручную и не связан с учётными записями учеников.",
};

export function isGroupSupportedJournal(journalType: string): boolean {
  return GROUP_SUPPORTED_JOURNALS.has(journalType);
}

export function groupUnsupportedReason(journalType: string): string {
  return (
    GROUP_UNSUPPORTED_JOURNAL_REASONS[journalType] ??
    "Этот журнал заполняется вручную и не связан с учётными записями учеников, поэтому его нельзя ограничить составом группы."
  );
}

/** Состояние «шлюза» для рендера журнала. */
export function resolveGroupGateState(
  journalType: string,
  ctx?: GroupJournalContext | null
): GroupGateState {
  if (!ctx || !ctx.groupId) return "none";
  if (!isGroupSupportedJournal(journalType)) return "unsupported";
  if (ctx.status === "error") return "error";
  if (ctx.status === "loading" || ctx.memberUserIds === null) return "loading";
  return "ready";
}

export interface GroupRowSelectors<T> {
  userId: (row: T) => string | null | undefined;
  /** Необязателен: если задан и в контексте есть courseId — фильтр строгий. */
  courseId?: (row: T) => string | null | undefined;
}

/**
 * Строгая фильтрация строк по контексту группы.
 * - без контекста → строки без изменений;
 * - loading/error → пустой массив (никогда не данные всей организации);
 * - ready → только участники группы; строки без user_id отбрасываются;
 *   при заданном courseId — только этот курс, строки без course_id отбрасываются.
 */
export function filterByGroupContext<T>(
  rows: T[],
  ctx: GroupJournalContext | null | undefined,
  selectors: GroupRowSelectors<T>
): T[] {
  const state = ctx ? resolveGroupGateState("attendance", { ...ctx, groupId: ctx.groupId }) : "none";
  if (!ctx || !ctx.groupId) return rows;
  if (state === "loading" || state === "error") return [];
  const members = new Set(ctx.memberUserIds ?? []);
  const courseId = ctx.courseId || null;
  return rows.filter((row) => {
    const uid = selectors.userId(row);
    if (!uid || !members.has(uid)) return false;
    if (courseId && selectors.courseId) {
      const cid = selectors.courseId(row);
      if (!cid || cid !== courseId) return false;
    }
    return true;
  });
}

/** Сколько строк отброшено как «не связанные с учеником» (для честного предупреждения в UI). */
export function countUnlinkedRows<T>(
  rows: T[],
  ctx: GroupJournalContext | null | undefined,
  userId: (row: T) => string | null | undefined
): number {
  if (!ctx || !ctx.groupId || ctx.status !== "ready") return 0;
  return rows.filter((r) => !userId(r)).length;
}
