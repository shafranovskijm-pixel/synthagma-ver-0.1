import { resolveGroupGateState, type GroupJournalContext } from "./groupJournalContext";

/**
 * Write-safety в контексте группы.
 *
 * Ручное «Добавить» создаёт запись без enrollment_id/user_id/course_id — она
 * сразу скрывается групповым фильтром: оператор думает, что запись пропала,
 * а в БД появляется несвязанный документ. Поэтому в контексте группы ручное
 * создание блокируется: создавать можно только сценарием, который явно
 * выбирает участника этой группы и её курс.
 */
export interface ManualWriteGuard {
  /** true — ручное создание запрещено (нужен scoped-сценарий). */
  blocked: boolean;
  /** Пояснение для оператора (тексты — единственный источник в UI). */
  reason: string | null;
}

export const MANUAL_ADD_BLOCKED_REASON =
  "В контексте группы ручное добавление недоступно: запись без привязки к участнику и курсу группы " +
  "не отобразится в журнале. Используйте создание по выпускникам этой группы или откройте журнал без контекста группы.";

export function resolveManualWriteGuard(
  journalType: string,
  groupContext?: GroupJournalContext | null,
): ManualWriteGuard {
  if (!groupContext?.groupId) return { blocked: false, reason: null };
  // Любой групповой контекст (loading/error/ready) блокирует несвязанную запись.
  const state = resolveGroupGateState(journalType, groupContext);
  if (state === "none") return { blocked: false, reason: null };
  return { blocked: true, reason: MANUAL_ADD_BLOCKED_REASON };
}

/** Разрешена ли запись/правка конкретной строки: она должна быть в scoped-наборе. */
export function isRowWriteAllowed<T extends { id: string }>(
  rowId: string | null | undefined,
  scopedRows: T[],
  groupContext?: GroupJournalContext | null,
): boolean {
  if (!rowId) return false;
  if (!groupContext?.groupId) return true;
  return scopedRows.some((r) => r.id === rowId);
}
