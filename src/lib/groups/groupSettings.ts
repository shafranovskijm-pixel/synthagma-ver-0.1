/**
 * Чистая логика настроек группы: сборка patch для серверной функции
 * update_student_group_settings и значения по умолчанию.
 * Вынесено из GroupSettingsDialog, чтобы покрыть тестами.
 */

export interface GroupSettingsFormValues {
  name: string;
  color: string | null;
  start_date: string | null;
  end_date: string | null;
  group_number: string | null;
  program_title: string | null;
  program_hours: number | null;
  program_form: string | null;
  default_price: number | null;
  training_address: string | null;
  schedule_text: string | null;
  instructor_name: string | null;
  training_dates: string[];
  course_id: string | null;
  max_seats: number | null;
  strict_order: boolean | null;
  limit_access_time: boolean | null;
  schedule_access: boolean | null;
  block_resubmit: boolean | null;
  show_locked_lessons: boolean | null;
  enable_channel: boolean | null;
  enable_group_chat: boolean | null;
  block_student_dialogs: boolean | null;
}

/** Значения по умолчанию для формы, если строка группы неполная. */
export function groupSettingsDefaults(row: Partial<GroupSettingsFormValues> | null | undefined): GroupSettingsFormValues {
  return {
    name: row?.name ?? "",
    color: row?.color ?? "#6366f1",
    start_date: row?.start_date ?? null,
    end_date: row?.end_date ?? null,
    group_number: row?.group_number ?? null,
    program_title: row?.program_title ?? null,
    program_hours: row?.program_hours ?? null,
    program_form: row?.program_form ?? null,
    default_price: row?.default_price ?? null,
    training_address: row?.training_address ?? null,
    schedule_text: row?.schedule_text ?? null,
    instructor_name: row?.instructor_name ?? null,
    training_dates: Array.isArray(row?.training_dates) ? row.training_dates.filter(Boolean) : [],
    course_id: row?.course_id ?? null,
    max_seats: row?.max_seats ?? null,
    strict_order: row?.strict_order ?? false,
    limit_access_time: row?.limit_access_time ?? false,
    schedule_access: row?.schedule_access ?? false,
    block_resubmit: row?.block_resubmit ?? false,
    show_locked_lessons: row?.show_locked_lessons ?? false,
    enable_channel: row?.enable_channel ?? false,
    enable_group_chat: row?.enable_group_chat ?? false,
    block_student_dialogs: row?.block_student_dialogs ?? false,
  };
}

/**
 * Patch для RPC: пустые строки означают «очистить поле»,
 * числа приводятся к строкам (jsonb), лимит мест зависит от тумблера.
 */
export function buildGroupSettingsPatch(
  s: GroupSettingsFormValues,
  seatLimitEnabled: boolean,
): Record<string, string | boolean | null | string[]> {
  const str = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? "" : String(v).trim());
  return {
    name: s.name.trim(),
    color: str(s.color) || "#6366f1",
    start_date: str(s.start_date),
    end_date: str(s.end_date),
    group_number: str(s.group_number),
    program_title: str(s.program_title),
    program_hours: str(s.program_hours),
    program_form: str(s.program_form),
    default_price: str(s.default_price),
    training_address: str(s.training_address),
    schedule_text: str(s.schedule_text),
    instructor_name: str(s.instructor_name),
    training_dates: (s.training_dates || []).map(str).filter(Boolean),
    course_id: str(s.course_id),
    max_seats: seatLimitEnabled ? String(s.max_seats || 30) : "",
    strict_order: !!s.strict_order,
    limit_access_time: !!s.limit_access_time,
    schedule_access: !!s.schedule_access,
    block_resubmit: !!s.block_resubmit,
    show_locked_lessons: !!s.show_locked_lessons,
    enable_channel: !!s.enable_channel,
    enable_group_chat: !!s.enable_group_chat,
    block_student_dialogs: !!s.block_student_dialogs,
  };
}

/** Проверка, что сервер реально сохранил ключевые поля документов. */
export function verifySavedSettings(
  patch: Record<string, string | boolean | null | string[]>,
  saved: Partial<GroupSettingsFormValues> | null,
): string[] {
  if (!saved) return ["строка группы не возвращена сервером"];
  const checks: Array<[keyof GroupSettingsFormValues, unknown]> = [
    ["course_id", saved.course_id],
    ["start_date", saved.start_date],
    ["end_date", saved.end_date],
    ["group_number", saved.group_number],
    ["program_title", saved.program_title],
    ["program_hours", saved.program_hours],
    ["program_form", saved.program_form],
    ["default_price", saved.default_price],
    ["training_address", saved.training_address],
    ["schedule_text", saved.schedule_text],
    ["instructor_name", saved.instructor_name],
    ["training_dates", saved.training_dates],
  ];
  const bad: string[] = [];
  for (const [key, value] of checks) {
    const expected = patch[key];
    if (expected === undefined) continue;
    const expectedValue = expected === "" ? null : expected;
    const actualValue = value === "" || value === undefined ? null : value;
    const numeric = key === "program_hours" || key === "default_price";
    const array = key === "training_dates";
    const equal = array
      ? JSON.stringify(expectedValue || []) === JSON.stringify(actualValue || [])
      : numeric && expectedValue !== null && actualValue !== null
      ? Number(expectedValue) === Number(actualValue)
      : String(actualValue ?? "") === String(expectedValue ?? "");
    if (!equal) bad.push(String(key));
  }
  return bad;
}

export interface GroupCourseDefaultsSource {
  id: string;
  title?: string | null;
  duration?: string | number | null;
  frdo_duration_hours?: string | number | null;
  training_form?: string | null;
}

/** Канонический объём программы берётся из настроек ФРДО курса, затем из duration. */
export function canonicalCourseHours(course: GroupCourseDefaultsSource | null | undefined): number | null {
  if (!course) return null;
  const rawHours = course.frdo_duration_hours ?? course.duration;
  const match = rawHours == null ? null : String(rawHours).replace(",", ".").match(/\d+(?:\.\d+)?/);
  const parsedHours = match ? Math.round(Number(match[0])) : 0;
  return Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : null;
}

export function programHoursMismatch(
  groupHours: string | number | null | undefined,
  course: GroupCourseDefaultsSource | null | undefined,
): boolean {
  const courseHours = canonicalCourseHours(course);
  if (courseHours === null || groupHours === null || groupHours === undefined || groupHours === "") return false;
  return Number(groupHours) !== courseHours;
}

export function normalizeIsoDate(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? text
    : "";
}

/**
 * Берёт реальные значения из видимых date-полей, а состояние формы использует
 * как резерв. Это защищает от браузеров, где нативный date изменился визуально,
 * но React change-событие не было доставлено.
 */
export function collectTrainingDates(
  visibleValues: Array<string | null | undefined>,
  stateValues: Array<string | null | undefined> = [],
): string[] {
  return Array.from({ length: 4 }, (_, index) =>
    normalizeIsoDate(visibleValues[index]) || normalizeIsoDate(stateValues[index]),
  ).filter(Boolean);
}

/** Равномерно предлагает до четырёх дат внутри периода группы. */
export function suggestTrainingDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  count = 4,
): string[] {
  const start = normalizeIsoDate(startDate);
  const end = normalizeIsoDate(endDate);
  if (!start || !end || count < 1) return [];
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (endMs < startMs) return [];
  const dayMs = 86_400_000;
  const daySpan = Math.round((endMs - startMs) / dayMs);
  const resultCount = Math.min(count, daySpan + 1);
  if (resultCount === 1) return [start];
  const dates = Array.from({ length: resultCount }, (_, index) => {
    const offset = Math.round((daySpan * index) / (resultCount - 1));
    return new Date(startMs + offset * dayMs).toISOString().slice(0, 10);
  });
  return Array.from(new Set(dates));
}

/** Поля группы, которые безопасно предзаполнить при выборе курса в момент создания. */
export function groupCourseDefaults(course: GroupCourseDefaultsSource | null | undefined) {
  if (!course) {
    return {
      course_id: null,
      program_title: null,
      program_hours: null,
      program_form: null,
    };
  }

  return {
    course_id: course.id,
    program_title: course.title?.trim() || null,
    program_hours: canonicalCourseHours(course),
    program_form: course.training_form?.trim() || null,
  };
}

export interface EnrollmentCourseLink {
  user_id: string;
  course_id: string | null;
}

/**
 * Резервная привязка допустима только если у каждого ученика группы есть один
 * и тот же курс и такой общий курс ровно один. «Самый частый» курс использовать
 * нельзя: он может принадлежать лишь части группы и попасть в документы ошибочно.
 */
export function resolveUniqueCommonCourseId(
  enrollments: EnrollmentCourseLink[],
  groupUserIds: string[],
): string | null {
  const requiredUsers = new Set(groupUserIds.filter(Boolean));
  if (requiredUsers.size === 0) return null;

  const usersByCourse = new Map<string, Set<string>>();
  for (const row of enrollments) {
    if (!row.course_id || !requiredUsers.has(row.user_id)) continue;
    const users = usersByCourse.get(row.course_id) ?? new Set<string>();
    users.add(row.user_id);
    usersByCourse.set(row.course_id, users);
  }

  const common = [...usersByCourse.entries()]
    .filter(([, users]) => users.size === requiredUsers.size)
    .map(([courseId]) => courseId);

  return common.length === 1 ? common[0] : null;
}
