/** Explicit group schedule only: neither course content nor access unlock dates are a timetable. */
export interface GroupScheduleFactRow {
  group_id: string;
  organization_id: string;
  course_id: string | null;
  slots: unknown;
  revision: number;
  updated_by: string | null;
  updated_at: string;
}

export interface GroupScheduleFactsSnapshot {
  organization: { id: string };
  group: {
    id: string; organization_id: string; course_id: string | null;
    start_date: string | null; end_date: string | null;
  };
  schedule: GroupScheduleFactRow | null;
}

export interface GroupScheduleFactsResult {
  docType: "schedule";
  rows: Array<Record<string, string>>;
  rowSources: Array<{ userId: string }>;
  scalars: Record<string, string>;
  scheduleSource: {
    groupId: string; organizationId: string; courseId: string | null;
    revision: number; updatedBy: string | null; updatedAt: string;
  } | null;
  issues: Array<{
    docType: "schedule"; code: string; field: string;
    message: string; severity: "warning" | "error";
  }>;
}

interface ScheduleSlot {
  slot: number; date?: string; time_from?: string; time_to?: string; topic?: string;
}

const slotKeys = new Set(["slot", "date", "time_from", "time_to", "topic"]);
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const validTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

function validXmlText(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (!(code === 0x09 || code === 0x0a || code === 0x0d
      || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd)
      || (code >= 0x10000 && code <= 0x10ffff))) return false;
  }
  return true;
}

function validSlots(value: unknown): value is ScheduleSlot[] {
  if (!Array.isArray(value) || value.length > 4) return false;
  const seen = new Set<number>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const slot = raw as Record<string, unknown>;
    if (!Number.isInteger(slot.slot) || Number(slot.slot) < 1 || Number(slot.slot) > 4 || seen.has(Number(slot.slot))) return false;
    if (Object.keys(slot).some(key => !slotKeys.has(key))) return false;
    if (["date", "time_from", "time_to", "topic"].some(key => key in slot && typeof slot[key] !== "string")) return false;
    seen.add(Number(slot.slot));
  }
  return true;
}

/** A malformed source never becomes a partly plausible schedule or a silently truncated document. */
export function buildGroupScheduleFacts(input: {
  snapshot: GroupScheduleFactsSnapshot; fillMode: "data" | "blank";
}): GroupScheduleFactsResult {
  const { organization, group, schedule } = input.snapshot;
  const result: GroupScheduleFactsResult = {
    docType: "schedule", rows: [], rowSources: [], scalars: {}, scheduleSource: null, issues: [],
  };
  for (let slot = 1; slot <= 4; slot++) {
    for (const field of ["DATE", "TIME", "TOPIC"]) result.scalars[`SCHEDULE_${field}_${slot}`] = "";
  }
  const issue = (code: string, field: string, message: string) => {
    result.issues.push({ docType: "schedule", code, field, message, severity: "warning" });
  };
  if (!organization.id || !group.id || group.organization_id !== organization.id) {
    issue("group_scope_mismatch", "group", "Группа расписания не подтверждена в выбранной организации; расписание оставлено пустым.");
    return result;
  }
  // Manual blank documents do not depend on schedule availability or completeness.
  if (input.fillMode === "blank") return result;
  if (!schedule) {
    issue("schedule_not_available", "schedule", "Сохранённое расписание недоступно или ещё не заполнено; оставлен рабочий бланк.");
    return result;
  }
  if (schedule.organization_id !== organization.id || schedule.group_id !== group.id || schedule.course_id !== group.course_id) {
    issue("schedule_scope_mismatch", "schedule", "Расписание не соответствует организации, группе или её текущему курсу; данные не использованы.");
    return result;
  }
  if (!Number.isSafeInteger(schedule.revision) || schedule.revision < 1
    || typeof schedule.updated_at !== "string" || !schedule.updated_at.trim()
    || (schedule.updated_by !== null && typeof schedule.updated_by !== "string")) {
    issue("schedule_metadata_invalid", "schedule.revision", "Версия или сведения об источнике расписания некорректны; данные не использованы.");
    return result;
  }
  if (!validSlots(schedule.slots)) {
    issue("schedule_slots_invalid", "schedule.slots", "Структура расписания некорректна: допустимы до четырёх неповторяющихся номеров блоков с датой, временем и темой. Данные не обрезаны и не использованы.");
    return result;
  }
  if (schedule.slots.some(item => !validXmlText(item.topic || ""))) {
    issue("schedule_topic_invalid_xml", "schedule.slots.topic", "Тема содержит символ, недопустимый для Word/XML. Расписание не использовано; исправьте исходный текст, символы автоматически не удаляются.");
    return result;
  }
  result.scheduleSource = {
    groupId: schedule.group_id, organizationId: schedule.organization_id, courseId: schedule.course_id,
    revision: schedule.revision, updatedBy: schedule.updated_by, updatedAt: schedule.updated_at,
  };
  if (schedule.slots.length === 0) {
    issue("schedule_empty", "schedule.slots", "В сохранённом расписании нет занятий; оставлен рабочий бланк.");
    return result;
  }
  const start = group.start_date || "", end = group.end_date || "";
  const invalidPeriod = Boolean((start && !validDate(start)) || (end && !validDate(end)) || (start && end && start > end));
  if (invalidPeriod) {
    issue("invalid_group_period", "group.start_date/end_date", "Период группы некорректен; даты расписания оставлены пустыми до исправления периода.");
  } else if (!start || !end) {
    issue("group_period_incomplete", "group.start_date/end_date", "Период группы заполнен не полностью; соответствие дат всему периоду пока не подтверждено.");
  }
  for (const item of schedule.slots) {
    const path = `schedule.slots[${item.slot}]`;
    const date = item.date || "", from = item.time_from || "", to = item.time_to || "", topic = item.topic || "";
    if (!date || !validDate(date)) {
      issue("schedule_date_missing_or_invalid", `${path}.date`, `Блок ${item.slot}: дата не заполнена или некорректна; дата оставлена пустой.`);
    } else if (!invalidPeriod) {
      if ((start && date < start) || (end && date > end)) {
        issue("schedule_date_outside_period", `${path}.date`, `Блок ${item.slot}: дата выходит за период группы и не подставлена.`);
      } else result.scalars[`SCHEDULE_DATE_${item.slot}`] = date.split("-").reverse().join(".");
    }
    if (!from || !to) {
      issue("schedule_time_incomplete", `${path}.time_from/time_to`, `Блок ${item.slot}: укажите начало и окончание занятия; неполное время не подставляется.`);
    } else if (!validTime(from) || !validTime(to) || from >= to) {
      issue("schedule_time_invalid", `${path}.time_from/time_to`, `Блок ${item.slot}: время должно быть в формате ЧЧ:ММ, окончание позже начала; время оставлено пустым.`);
    } else result.scalars[`SCHEDULE_TIME_${item.slot}`] = `${from}–${to}`;
    if (!topic.trim() || [...topic].length > 2000) {
      issue("schedule_topic_missing_or_invalid", `${path}.topic`, `Блок ${item.slot}: тема не заполнена или длиннее 2000 символов; тема оставлена пустой.`);
    } else result.scalars[`SCHEDULE_TOPIC_${item.slot}`] = topic;
  }
  return result;
}
