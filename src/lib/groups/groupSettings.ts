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
  const checks: Array<[string, unknown]> = [
    ["group_number", saved.group_number],
    ["program_title", saved.program_title],
    ["program_hours", saved.program_hours],
    ["program_form", saved.program_form],
    ["default_price", saved.default_price],
    ["course_id", saved.course_id],
  ];
  const bad: string[] = [];
  for (const [key, value] of checks) {
    const expected = patch[key];
    if (typeof expected !== "string" || expected === "") continue;
    if (value === null || value === undefined || String(value).trim() === "") bad.push(key);
  }
  return bad;
}
