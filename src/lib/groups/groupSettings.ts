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
): Record<string, string | boolean | null> {
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
  patch: Record<string, string | boolean | null>,
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
  ];
  const bad: string[] = [];
  for (const [key, value] of checks) {
    const expected = patch[key];
    if (expected === undefined) continue;
    const expectedValue = expected === "" ? null : expected;
    const actualValue = value === "" || value === undefined ? null : value;
    const numeric = key === "program_hours" || key === "default_price";
    const equal = numeric && expectedValue !== null && actualValue !== null
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

  const rawHours = course.frdo_duration_hours ?? course.duration;
  const match = rawHours == null ? null : String(rawHours).replace(",", ".").match(/\d+(?:\.\d+)?/);
  const parsedHours = match ? Math.round(Number(match[0])) : 0;

  return {
    course_id: course.id,
    program_title: course.title?.trim() || null,
    program_hours: Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : null,
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
