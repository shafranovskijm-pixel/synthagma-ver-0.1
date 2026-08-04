/**
 * Единый resolver готовности данных ФИС ФРДО.
 *
 * Используется и в FRDOManager (таблица «Заполнено / Не хватает / Пусто»),
 * и в рабочем пространстве группы (бейдж «Готово / Не полностью / Нет данных»),
 * чтобы статус не расходился между экранами.
 */

export type FrdoReadinessStatus = "complete" | "incomplete" | "empty";

export interface FrdoRequiredField {
  key: string;
  label: string;
}

/** Минимально обязательные поля для выгрузки в ФИС ФРДО. */
export const FRDO_REQUIRED_FIELDS: FrdoRequiredField[] = [
  { key: "last_name", label: "Фамилия" },
  { key: "first_name", label: "Имя" },
  { key: "birth_date", label: "Дата рождения" },
  { key: "gender", label: "Пол" },
  { key: "snils", label: "СНИЛС" },
];

export interface FrdoReadinessResult {
  status: FrdoReadinessStatus;
  missingFields: string[];
}

export interface FrdoLikeRecord {
  [key: string]: unknown;
}

function isFilled(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

/**
 * Готовность одной записи ФРДО.
 * `fullNameFallback` — ФИО из профиля: закрывает Фамилию/Имя, если в student_frdo_data
 * они ещё не продублированы, но НЕ закрывает дату рождения, пол и СНИЛС.
 */
export function resolveFrdoReadiness(
  data: FrdoLikeRecord | null | undefined,
  fullNameFallback?: string | null,
): FrdoReadinessResult {
  if (!data) {
    return { status: "empty", missingFields: FRDO_REQUIRED_FIELDS.map((f) => f.label) };
  }
  const nameParts = (fullNameFallback || "").trim().split(/\s+/).filter(Boolean);
  const fallback: Record<string, string | undefined> = {
    last_name: nameParts[0],
    first_name: nameParts[1],
  };

  const missing: string[] = [];
  for (const field of FRDO_REQUIRED_FIELDS) {
    if (!isFilled(data[field.key]) && !isFilled(fallback[field.key])) {
      missing.push(field.label);
    }
  }
  return missing.length === 0
    ? { status: "complete", missingFields: [] }
    : { status: "incomplete", missingFields: missing };
}

/** Человеческая подпись бейджа для рабочего пространства группы. */
export function frdoReadinessLabel(status: FrdoReadinessStatus): string {
  if (status === "complete") return "Готово";
  if (status === "incomplete") return "Не полностью";
  return "Нет данных";
}
