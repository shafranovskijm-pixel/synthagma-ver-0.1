import type { DocType } from "./schema";

export interface GroupDocumentSignatory {
  position: string;
  name: string;
}

export type GroupDocumentSignatories = Partial<
  Record<DocType, GroupDocumentSignatory>
>;

export const SIGNABLE_GROUP_DOCUMENTS: ReadonlyArray<{
  type: DocType;
  title: string;
}> = [
  { type: "enrollment_order", title: "Приказ об открытии курса и зачислении" },
  { type: "expulsion_order", title: "Приказ о закрытии курса и отчислении" },
  { type: "student_list", title: "Список обучающихся" },
  { type: "class_journal", title: "Журнал учёта занятий" },
  { type: "schedule", title: "Расписание" },
  { type: "attestation_sheet", title: "Ведомость итоговой аттестации" },
  { type: "pass", title: "Пропуск" },
] as const;

export function defaultGroupDocumentSignatories(
  defaultSignatory: GroupDocumentSignatory | null,
): GroupDocumentSignatories {
  if (!defaultSignatory) return {};
  return Object.fromEntries(
    SIGNABLE_GROUP_DOCUMENTS.map(({ type }) => [type, { ...defaultSignatory }]),
  ) as GroupDocumentSignatories;
}

/**
 * Стартовые подписанты строго по оригинальным Word-файлам ГОРЭЛТЕХ.
 *
 * В приказах исходник оставляет ФИО пустым, а в пропуске вообще нет
 * подтверждённой строки подписанта. Эти поля намеренно не заполняются:
 * менеджер должен либо выбрать подписанта, либо явно подтвердить пустое место.
 */
export function defaultGoreltechGroupDocumentSignatories(
  manager: GroupDocumentSignatory,
): GroupDocumentSignatories {
  const position = manager.position;
  const namedManager = { position, name: manager.name };
  return {
    enrollment_order: { position, name: "" },
    expulsion_order: { position, name: "" },
    student_list: { ...namedManager },
    class_journal: { ...namedManager },
    schedule: { ...namedManager },
    attestation_sheet: { ...namedManager },
    pass: { position: "", name: "" },
  };
}

/**
 * Per-document fields are passed through the existing immutable generation
 * snapshot. Empty strings are intentional: the organization may leave a
 * signature line for manual completion instead of inventing a signer.
 */
export function signatoriesToGenerationExtras(
  signatories: GroupDocumentSignatories,
): Record<string, string> {
  const extras: Record<string, string> = {};
  for (const { type } of SIGNABLE_GROUP_DOCUMENTS) {
    const signatory = signatories[type];
    if (!signatory) continue;
    extras[`signatory_position_${type}`] = signatory.position;
    extras[`signatory_name_${type}`] = signatory.name;
  }
  return extras;
}

/** Пустая строка допустима, но перед генерацией пользователь должен её подтвердить. */
export function hasBlankGroupDocumentSignatory(
  signatories: GroupDocumentSignatories,
): boolean {
  return SIGNABLE_GROUP_DOCUMENTS.some(({ type }) => {
    const signatory = signatories[type];
    return !signatory?.position.trim() || !signatory?.name.trim();
  });
}
