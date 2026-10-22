/** UC023. Display/preview only: the RPC calculates and stores the control date. */
export const DSR_RULE_VERSION = "152fz-dsr-2026-10-22-v1";
export const DSR_CALENDAR_ID = "rf-five-day-2026";
export const DSR_DEADLINE_HELP = "Срок зависит от требования: доступ и прекращение обработки — 10 рабочих дней, исправление — 7 рабочих дней после подтверждающих сведений, отзыв согласия — 30 календарных дней. Для удаления и специальных требований к распространению данных нужно определить отдельное основание; обычные сроки не заменяют немедленное прекращение или срок суда. Продление до 5 рабочих дней предусмотрено только для доступа и прекращения обработки при мотивированном уведомлении.";

export const DSR_BASES = {
  access: { label: "Доступ / мотивированный ответ — ст. 20 ч. 1–2", days: 10, unit: "working", types: ["access"], extensible: true },
  correction: { label: "Исправление после подтверждающих сведений — ст. 20 ч. 3, ст. 21 ч. 2", days: 7, unit: "working", types: ["correction"], extensible: false },
  cessation: { label: "Прекращение обработки — ст. 21 ч. 5.1", days: 10, unit: "working", types: ["cessation"], extensible: true },
  withdrawal: { label: "Отзыв согласия — ст. 21 ч. 5", days: 30, unit: "calendar", types: ["withdrawal", "deletion"], extensible: false },
  erasure_evidence: { label: "Незаконно полученные / ненужные данные: сведения — ст. 20 ч. 3", days: 7, unit: "working", types: ["deletion"], extensible: false },
  unlawful_processing: { label: "Выявлена неправомерная обработка — ст. 21 ч. 3", days: 3, unit: "working", types: ["cessation", "deletion"], extensible: false },
  purpose_achieved: { label: "Достижение цели — ст. 21 ч. 4", days: 30, unit: "calendar", types: ["deletion"], extensible: false },
  manual: { label: "Иное основание: распространение / суд / особый календарь — ручная проверка", days: 0, unit: "manual", types: ["access", "correction", "cessation", "withdrawal", "deletion"], extensible: false },
} as const;
export type DSRBasis = keyof typeof DSR_BASES;
export interface DSRDeadlineDetails {
  state: "needs_review" | "calculated" | "manual_review" | "unsupported_calendar";
  rule_version: string;
  basis?: DSRBasis;
  trigger_on?: string;
  time_zone?: string;
  calendar_id?: string;
  base_due_on?: string | null;
  control_due_on?: string | null;
  destruction_due_on?: string | null;
  extension_days?: number;
  notice_on?: string;
  notice_reference?: string;
  reason?: string;
  legal_basis?: string;
  decision?: "processing" | "completed" | "retention" | "refusal" | "blocked_destruction";
  decision_basis?: string;
  decision_reason?: string;
  blocked_on?: string;
  destruction_review_on?: string;
}
export interface DSRDeadlineEvent {
  id: string;
  revision: number;
  action: string;
  actor_id: string | null;
  created_at: string;
  reason: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown>;
}

const HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09",
  "2026-02-23", "2026-03-09", "2026-05-01", "2026-05-11", "2026-06-12", "2026-11-04", "2026-12-31",
]);
function dateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
export function isFederalWorkingDay2026(value: string): boolean | null {
  const date = dateOnly(value);
  if (!date || date.getUTCFullYear() !== 2026) return null;
  return date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !HOLIDAYS_2026.has(value);
}
export function previewDSRDeadline(basis: DSRBasis, trigger: string, extension = 0): string | null {
  const rule = DSR_BASES[basis];
  const date = dateOnly(trigger);
  if (!date || rule.unit === "manual" || date.getUTCFullYear() !== 2026 || !Number.isInteger(extension) || extension < 0 || extension > 5 || (extension > 0 && !rule.extensible)) return null;
  let remaining = rule.days + extension;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const value = date.toISOString().slice(0, 10);
    if (date.getUTCFullYear() !== 2026) return null;
    if (rule.unit === "calendar" || isFederalWorkingDay2026(value)) remaining--;
  }
  return date.toISOString().slice(0, 10);
}
export function dsrDeadlineLabel(details: DSRDeadlineDetails | null | undefined): string {
  if (!details) return "Исторический срок: требуется проверка основания";
  if (details.state === "needs_review") return "Требуется определить основание и дату получения";
  if (details.state === "unsupported_calendar") return "Календарь не поддерживается: ручная проверка срока";
  if (details.state === "manual_review") return "Ручной контроль: требуется правовая проверка";
  return "Контрольный срок по подтверждённым оператором сведениям";
}
export function localToday(timeZone?: string, now = new Date()): string | null {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (type: string) => parts.find(p => p.type === type)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch { return null; }
}
export function dsrIsOverdue(request: { status: string; due_date: string | null; deadline_details?: DSRDeadlineDetails | null }, now = new Date()): boolean {
  if (["resolved", "rejected"].includes(request.status) || !request.due_date) return false;
  const today = localToday(request.deadline_details?.time_zone, now);
  return !!today && request.due_date < today;
}

export const DSR_SUPPORT_CONTEXT = DSR_DEADLINE_HELP + " Не обещай всем обращающимся 30 дней. При выявлении неправомерной обработки по ст. 21 ч. 3 — прекращение за 3 рабочих дня, а при невозможности обеспечить правомерность — уничтожение за 10 рабочих дней от выявления. Ст.21 ч. 6 предусматривает блокирование при невозможности уничтожения и отдельный срок не более 6 месяцев, а не обычное продление. Дата зависит от фактического события, основания и подтверждённого оператором календаря. Исторические сроки не пересчитываются молча. Иной год/региональный календарь — ручная проверка. Сохранение обязательных документов, мотивированный отказ и блокирование требуют конкретной нормы и записи решения. Платформа не уничтожает данные этим действием и не удостоверяет законность решения автоматически. Правило " + DSR_RULE_VERSION;
