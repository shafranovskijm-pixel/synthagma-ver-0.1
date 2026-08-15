/**
 * Чистые resolver'ы фактических данных группы.
 *
 * Вынесены отдельно, чтобы журнал итоговой аттестации (useAutoFinalAttestation)
 * и пакет документов группы (useGroupFactualData) считали одно и то же:
 * финальный урок курса = последний по order_index урок с type='test',
 * результат ученика = лучшая попытка ИМЕННО этого урока.
 */

import type { AttestationFact, RegistrationFact } from "./factualData";

export interface LessonLike {
  id: string;
  course_id?: string | null;
  type?: string | null;
  order_index?: number | null;
}

export interface AttemptLike {
  user_id: string;
  lesson_id: string;
  score: number | string | null;
  max_score: number | string | null;
  completed_at?: string | null;
}

/**
 * Финальный тест курса: последний по order_index урок с type='test'.
 * Тот же критерий, что в useAutoFinalAttestation.
 */
export function resolveFinalTestLessonId(lessons: LessonLike[], courseId: string): string | null {
  const candidates = lessons
    .filter((l) => (l.course_id ?? courseId) === courseId && (l.type || "") === "test")
    .sort((a, b) => (Number(b.order_index) || 0) - (Number(a.order_index) || 0));
  return candidates[0]?.id ?? null;
}

/**
 * Лучшая попытка финального теста по каждому ученику.
 * Попытки других уроков игнорируются полностью.
 */
export function resolveFinalAttestationFacts(
  attempts: AttemptLike[],
  finalLessonId: string | null,
  userIds: string[],
): AttestationFact[] {
  if (!finalLessonId) return [];
  const allowed = new Set(userIds);
  const best = new Map<string, AttestationFact>();
  for (const a of attempts) {
    if (a.lesson_id !== finalLessonId) continue;
    if (!allowed.has(a.user_id)) continue;
    const score = Number(a.score) || 0;
    const max = Number(a.max_score) || 0;
    if (max <= 0) continue;
    const prev = best.get(a.user_id);
    if (!prev || score > prev.score) {
      best.set(a.user_id, {
        user_id: a.user_id,
        score,
        max_score: max,
        date: a.completed_at ? String(a.completed_at).slice(0, 10) : null,
      });
    }
  }
  return [...best.values()];
}

export interface FrdoLikeRow {
  last_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  citizenship?: string | null;
  passport_series?: string | null;
  passport_number?: string | null;
}

export interface IdentityDocLikeRow {
  document_type?: string | null;
  series?: string | null;
  number?: string | null;
}

export function normalizeGender(value?: string | null): string {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (v.startsWith("м")) return "М";
  if (v.startsWith("ж")) return "Ж";
  if (v === "male") return "М";
  if (v === "female") return "Ж";
  return "";
}

/**
 * Детерминированный выбор удостоверения личности: строго документ типа
 * passport/паспорт (без учёта регистра и языка). Если таких несколько —
 * берётся первый по стабильной сортировке (series, number), а не произвольная
 * строка из ответа БД. Иные типы документов (СНИЛС, ВУ и т.п.) не подходят.
 */
export function pickPassportIdentityDoc<T extends IdentityDocLikeRow>(
  rows: T[] | null | undefined,
): T | null {
  const passports = (rows || []).filter((r) => {
    const t = String(r.document_type || "").trim().toLowerCase();
    return t === "passport" || t.startsWith("паспорт") || t.includes("passport");
  });
  if (passports.length === 0) return null;
  return passports
    .slice()
    .sort((a, b) =>
      `${a.series || ""}|${a.number || ""}`.localeCompare(`${b.series || ""}|${b.number || ""}`),
    )[0];
}

export function normalizePassport(
  frdo?: FrdoLikeRow | null,
  identity?: IdentityDocLikeRow | null,
): string {
  const fromFrdo = [frdo?.passport_series, frdo?.passport_number].filter(Boolean).join(" ").trim();
  if (fromFrdo) return fromFrdo;
  const fromIdentity = [identity?.series, identity?.number].filter(Boolean).join(" ").trim();
  return fromIdentity;
}


export function frdoFullName(frdo?: FrdoLikeRow | null): string {
  return [frdo?.last_name, frdo?.first_name, frdo?.middle_name]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Строка книги регистрации: только факты выданного документа + нормализованные
 * персональные данные из student_frdo_data / student_identity_documents.
 * Ничего не придумывается: нет источника — поле остаётся пустым.
 */
export function normalizeRegistrationFact(
  record: {
    user_id?: string | null;
    full_name?: string | null;
    document_type?: string | null;
    document_series?: string | null;
    document_number?: string | null;
    reg_number?: string | null;
    issue_date?: string | null;
    order_number?: string | null;
    order_date?: string | null;
    specialty_name?: string | null;
    birth_date?: string | null;
  },
  frdo?: FrdoLikeRow | null,
  identity?: IdentityDocLikeRow | null,
): RegistrationFact {
  const documentTypeLabels: Record<string, string> = {
    certificate: "Удостоверение о повышении квалификации",
    diploma: "Диплом о профессиональной переподготовке",
    qualification: "Свидетельство о квалификации",
  };
  const rawDocumentType = String(record.document_type || "").trim();

  return {
    user_id: record.user_id ?? null,
    full_name: frdoFullName(frdo) || record.full_name || "",
    document_type:
      documentTypeLabels[rawDocumentType.toLowerCase()] || rawDocumentType,
    document_series: record.document_series || "",
    document_number: record.document_number || "",
    reg_number: record.reg_number || "",
    issue_date: record.issue_date || "",
    order_number: record.order_number || "",
    order_date: record.order_date || "",
    birth_date: frdo?.birth_date || record.birth_date || undefined,
    gender: normalizeGender(frdo?.gender) || undefined,
    citizenship: frdo?.citizenship || undefined,
    passport: normalizePassport(frdo, identity) || undefined,
    program: record.specialty_name || undefined,
  };
}

/** Партия документов группы для UI-группировки. */
export interface BatchRowLike {
  package_batch_id?: string | null;
  package_version?: number | null;
  is_current?: boolean | null;
  created_at: string;
  created_by?: string | null;
}

export interface DocumentBatchGroup<T extends BatchRowLike> {
  batchId: string | null;
  version: number | null;
  createdAt: string;
  createdBy: string | null;
  isCurrent: boolean;
  legacy: boolean;
  label: string;
  rows: T[];
}

export const LEGACY_BATCH_LABEL = "До версионирования · предыдущие";

/**
 * Группировка документов по package_batch_id.
 * Записи без batch_id — legacy, ВСЕГДА «до версионирования», независимо от
 * значения is_current по умолчанию, и никогда не помечаются текущими.
 */
export function groupDocumentBatches<T extends BatchRowLike>(rows: T[]): DocumentBatchGroup<T>[] {
  const map = new Map<string, DocumentBatchGroup<T>>();
  for (const row of rows) {
    const batchId = row.package_batch_id || null;
    const key = batchId ?? "__legacy__";
    let entry = map.get(key);
    if (!entry) {
      entry = {
        batchId,
        version: batchId ? (row.package_version ?? null) : null,
        createdAt: row.created_at,
        createdBy: row.created_by ?? null,
        isCurrent: batchId ? row.is_current !== false : false,
        legacy: !batchId,
        label: batchId ? `Версия ${row.package_version ?? "—"}` : LEGACY_BATCH_LABEL,
        rows: [],
      };
      map.set(key, entry);
    }
    if (row.created_at > entry.createdAt) entry.createdAt = row.created_at;
    entry.rows.push(row);
  }
  const groups = [...map.values()];
  groups.sort((a, b) => {
    if (a.legacy !== b.legacy) return a.legacy ? 1 : -1;
    return (b.version ?? 0) - (a.version ?? 0);
  });
  return groups;
}

export function batchStatusLabel<T extends BatchRowLike>(g: DocumentBatchGroup<T>): string {
  if (g.legacy) return LEGACY_BATCH_LABEL;
  return g.isCurrent ? "Текущая" : "Предыдущая";
}
