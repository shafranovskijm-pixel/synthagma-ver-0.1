import { supabase } from "@/integrations/supabase/client";

export interface GroupDocumentScheduleSlot {
  slot: 1 | 2 | 3 | 4;
  date: string;
  time_from: string;
  time_to: string;
  topic: string;
}

export interface GroupDocumentScheduleRow {
  group_id: string;
  organization_id: string;
  course_id: string | null;
  slots: GroupDocumentScheduleSlot[];
  revision: number;
  updated_at: string;
  updated_by: string;
}

export interface GroupDocumentScheduleContext {
  group: { id: string; organization_id: string; course_id: string | null; start_date: string | null; end_date: string | null };
  schedule: GroupDocumentScheduleRow | null;
}

type Scope = { organizationId: string; groupId: string };
type QueryResult = { data: unknown; error: unknown };
interface ScheduleQuery {
  select(columns: string): ScheduleQuery;
  eq(column: string, value: string): ScheduleQuery;
  maybeSingle(): PromiseLike<QueryResult>;
}
export interface GroupDocumentScheduleClient {
  from(table: string): ScheduleQuery;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<QueryResult>;
}
const defaultClient = supabase as unknown as GroupDocumentScheduleClient;
const SCHEDULE_COLUMNS = "group_id,organization_id,course_id,slots,revision,updated_at,updated_by";
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isNullableString = (value: unknown): value is string | null => value === null || (typeof value === "string" && value.length > 0);

export class GroupDocumentScheduleError extends Error {
  constructor(message: string, readonly requiresReload = false) { super(message); this.name = "GroupDocumentScheduleError"; }
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Exact persisted values, not a best-effort conversion of malformed backend data. */
export function parseGroupDocumentScheduleSlots(value: unknown): GroupDocumentScheduleSlot[] {
  if (!Array.isArray(value) || value.length > 4) throw new GroupDocumentScheduleError("Расписание должно содержать не более четырёх блоков.");
  const seen = new Set<number>();
  return value.map((entry): GroupDocumentScheduleSlot => {
    if (!isObject(entry) || Object.keys(entry).sort().join(",") !== "date,slot,time_from,time_to,topic"
      || !Number.isInteger(entry.slot) || Number(entry.slot) < 1 || Number(entry.slot) > 4 || seen.has(Number(entry.slot))
      || ["date", "time_from", "time_to", "topic"].some(key => typeof entry[key] !== "string")) {
      throw new GroupDocumentScheduleError("База вернула неподтверждённую структуру расписания. Обновите данные.");
    }
    const row = entry as unknown as GroupDocumentScheduleSlot;
    seen.add(row.slot);
    if (row.date && !validDate(row.date)) throw new GroupDocumentScheduleError(`Блок ${row.slot}: укажите корректную дату.`);
    for (const key of ["time_from", "time_to"] as const) {
      if (row[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(row[key])) throw new GroupDocumentScheduleError(`Блок ${row.slot}: время должно быть в формате ЧЧ:ММ.`);
    }
    if (row.time_from && row.time_to && row.time_from >= row.time_to) throw new GroupDocumentScheduleError(`Блок ${row.slot}: окончание должно быть позже начала.`);
    if ([...row.topic].length > 2000) throw new GroupDocumentScheduleError(`Блок ${row.slot}: тема не должна превышать 2000 символов.`);
    for (const character of row.topic) {
      const code = character.codePointAt(0)!;
      if (!(code === 9 || code === 10 || code === 13 || (code >= 0x20 && code <= 0xd7ff)
        || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff))) {
        throw new GroupDocumentScheduleError(`Блок ${row.slot}: тема содержит недопустимый для XML символ U+${code.toString(16).toUpperCase().padStart(4, "0")}. Исправьте текст; автоматически он не изменяется.`);
      }
    }
    return { slot: row.slot, date: row.date, time_from: row.time_from, time_to: row.time_to, topic: row.topic };
  }).sort((a, b) => a.slot - b.slot);
}

export function compactGroupDocumentScheduleSlots(slots: GroupDocumentScheduleSlot[]): GroupDocumentScheduleSlot[] {
  return parseGroupDocumentScheduleSlots(slots).filter(slot => slot.date !== "" || slot.time_from !== "" || slot.time_to !== "" || slot.topic !== "");
}

export function expandGroupDocumentScheduleSlots(slots: GroupDocumentScheduleSlot[]): GroupDocumentScheduleSlot[] {
  const parsed = parseGroupDocumentScheduleSlots(slots);
  return ([1, 2, 3, 4] as const).map(slot => parsed.find(entry => entry.slot === slot)
    ?? { slot, date: "", time_from: "", time_to: "", topic: "" });
}

export function sameGroupDocumentScheduleSlots(left: GroupDocumentScheduleSlot[], right: GroupDocumentScheduleSlot[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireScope(scope: Scope): void {
  if (!scope.organizationId || !scope.groupId) throw new GroupDocumentScheduleError("Не указана группа или организация.");
}

function readFailure(error: unknown): GroupDocumentScheduleError {
  const code = isObject(error) ? error.code : undefined;
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(String(code))) {
    return new GroupDocumentScheduleError("Расписание документов пока недоступно: обновление базы не установлено. Можно повторить загрузку после обновления.");
  }
  return new GroupDocumentScheduleError("Не удалось загрузить расписание. Проверьте доступ и повторите загрузку.");
}

function parseScheduleRow(value: unknown, scope: Scope): GroupDocumentScheduleRow {
  if (!isObject(value) || value.group_id !== scope.groupId || value.organization_id !== scope.organizationId
    || !isNullableString(value.course_id) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
    || typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at))
    || typeof value.updated_by !== "string" || !value.updated_by) {
    throw new GroupDocumentScheduleError("База вернула неподтверждённые данные расписания. Обновите данные.");
  }
  return {
    group_id: scope.groupId, organization_id: scope.organizationId, course_id: value.course_id,
    slots: parseGroupDocumentScheduleSlots(value.slots), revision: Number(value.revision),
    updated_at: value.updated_at, updated_by: value.updated_by,
  };
}

export async function fetchGroupDocumentSchedule(scope: Scope, client: GroupDocumentScheduleClient = defaultClient): Promise<GroupDocumentScheduleContext> {
  requireScope(scope);
  let groupResult: QueryResult;
  let scheduleResult: QueryResult;
  try {
    [groupResult, scheduleResult] = await Promise.all([
      client.from("student_groups").select("id,organization_id,course_id,start_date,end_date").eq("organization_id", scope.organizationId).eq("id", scope.groupId).maybeSingle(),
      client.from("group_document_schedules").select(SCHEDULE_COLUMNS).eq("organization_id", scope.organizationId).eq("group_id", scope.groupId).maybeSingle(),
    ]);
  } catch (error) { throw readFailure(error); }
  if (groupResult.error || scheduleResult.error) throw readFailure(groupResult.error || scheduleResult.error);
  const group = groupResult.data;
  if (!isObject(group) || group.id !== scope.groupId || group.organization_id !== scope.organizationId
    || !isNullableString(group.course_id)
    || !(group.start_date === null || (typeof group.start_date === "string" && validDate(group.start_date)))
    || !(group.end_date === null || (typeof group.end_date === "string" && validDate(group.end_date)))) {
    throw new GroupDocumentScheduleError("Не удалось подтвердить сохранённые курс и даты этой группы. Сначала проверьте настройки группы.");
  }
  return {
    group: { id: group.id as string, organization_id: group.organization_id as string, course_id: group.course_id, start_date: group.start_date as string | null, end_date: group.end_date as string | null },
    schedule: scheduleResult.data === null ? null : parseScheduleRow(scheduleResult.data, scope),
  };
}

export async function saveGroupDocumentSchedule(input: Scope & {
  context: GroupDocumentScheduleContext;
  slots: GroupDocumentScheduleSlot[];
  reviewedCourseChange?: boolean;
}, client: GroupDocumentScheduleClient = defaultClient): Promise<GroupDocumentScheduleContext> {
  requireScope(input);
  const { group, schedule } = input.context;
  if (group.id !== input.groupId || group.organization_id !== input.organizationId
    || (schedule && (schedule.group_id !== input.groupId || schedule.organization_id !== input.organizationId))) {
    throw new GroupDocumentScheduleError("Обновите расписание выбранной группы.");
  }
  if (schedule && schedule.course_id !== group.course_id && !input.reviewedCourseChange) {
    throw new GroupDocumentScheduleError("Курс группы изменился. Проверьте каждый блок и подтвердите перенос расписания на сохранённый курс.");
  }
  const slots = compactGroupDocumentScheduleSlots(input.slots);
  for (const slot of slots) {
    if (slot.date && ((group.start_date && slot.date < group.start_date) || (group.end_date && slot.date > group.end_date))) {
      throw new GroupDocumentScheduleError(`Блок ${slot.slot}: дата выходит за сохранённый период группы. Сначала исправьте дату или сохраните новый период группы.`);
    }
  }
  // One mutation, no automatic retry. Any uncertain result requires a fresh read.
  try {
    const { data, error } = await client.rpc("save_group_document_schedule", {
      p_organization_id: input.organizationId, p_group_id: input.groupId,
      p_expected_course_id: group.course_id, p_expected_revision: schedule?.revision ?? null, p_slots: slots,
    });
    if (error) {
      const message = isObject(error) ? error.message : "";
      if (message === "group_course_changed" || message === "schedule_revision_conflict") {
        throw new GroupDocumentScheduleError("Курс или расписание изменились в другой вкладке. Обновите данные перед повторным сохранением.", true);
      }
      throw error;
    }
    const saved = parseScheduleRow(data, input);
    if (saved.course_id !== group.course_id || saved.revision !== (schedule?.revision ?? 0) + 1 || !sameGroupDocumentScheduleSlots(saved.slots, slots)) throw new Error("save_response_mismatch");
    const confirmed = await fetchGroupDocumentSchedule(input, client);
    if (confirmed.group.course_id !== group.course_id || !confirmed.schedule
      || confirmed.schedule.course_id !== saved.course_id || confirmed.schedule.revision !== saved.revision
      || confirmed.schedule.updated_at !== saved.updated_at || confirmed.schedule.updated_by !== saved.updated_by
      || !sameGroupDocumentScheduleSlots(confirmed.schedule.slots, saved.slots)) throw new Error("save_readback_mismatch");
    if (slots.some(slot => slot.date && ((confirmed.group.start_date && slot.date < confirmed.group.start_date)
      || (confirmed.group.end_date && slot.date > confirmed.group.end_date)))) throw new Error("group_period_changed");
    return confirmed;
  } catch (error) {
    if (error instanceof GroupDocumentScheduleError && error.requiresReload) throw error;
    throw new GroupDocumentScheduleError("Сохранение расписания не подтверждено. Оно могло произойти: обновите данные перед повторной попыткой.", true);
  }
}
