import { supabase } from "@/integrations/supabase/client";
export interface GroupClassJournalMark {
  id: string; organization_id: string; group_id: string; user_id: string; slot: number;
  course_id: string | null; source_date: string; mark: string; revision: number; updated_at: string; updated_by: string;
}
export interface GroupClassJournalMarksContext {
  group: { id: string; organization_id: string; course_id: string | null; name: string; training_dates: string[] };
  students: { user_id: string; full_name: string }[];
  marks: GroupClassJournalMark[];
}
type Scope = { organizationId: string; groupId: string };
type Reply = { data: unknown; error: unknown; count?: number | null };
interface Query extends PromiseLike<Reply> {
  select(columns: string, options?: { count: "exact" }): Query;
  eq(column: string, value: string): Query; is(column: "archived_at", value: null): Query;
  order(column: string): Query; range(from: number, to: number): Query; maybeSingle(): PromiseLike<Reply>;
}
export interface GroupClassJournalMarksClient {
  from(table: "student_groups" | "profiles" | "group_class_journal_marks"): Query;
  rpc(name: "save_group_class_journal_mark", args: { p_organization_id: string; p_group_id: string; p_expected_course_id: string | null; p_user_id: string; p_slot: number; p_expected_date: string; p_expected_revision: number | null; p_mark: string }): PromiseLike<Reply>;
}
const defaultClient = supabase as unknown as GroupClassJournalMarksClient;
export class GroupClassJournalMarksError extends Error {
  constructor(message: string, readonly requiresReload = false) { super(message); this.name = "GroupClassJournalMarksError"; }
}
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const nullable = (v: unknown): v is string | null => v === null || str(v);
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
function fail(): never { throw new GroupClassJournalMarksError("Не удалось подтвердить данные журнала группы. Обновите данные."); }
function checkError(error: unknown): void {
  if (!error) return;
  if (object(error) && ["42P01", "42883", "PGRST202", "PGRST205"].includes(String(error.code))) throw new GroupClassJournalMarksError("Бета: журнал отметок пока недоступен — обновление базы не установлено.");
  fail();
}
function validMark(v: unknown): v is string {
  return typeof v === "string" && [...v].length <= 12 && [...v].every(c => { const n = c.codePointAt(0)!; return n === 9 || n === 10 || n === 13 || n >= 32 && n <= 0xd7ff || n >= 0xe000 && n <= 0xfffd || n >= 0x10000 && n <= 0x10ffff; });
}
function parseMark(v: unknown, scope: Scope): GroupClassJournalMark {
  if (!object(v) || !str(v.id) || v.organization_id !== scope.organizationId || v.group_id !== scope.groupId || !str(v.user_id)
    || !Number.isInteger(v.slot) || Number(v.slot) < 1 || Number(v.slot) > 4 || !nullable(v.course_id) || !date(v.source_date)
    || !validMark(v.mark) || !Number.isSafeInteger(v.revision) || Number(v.revision) < 1 || !str(v.updated_by)
    || !str(v.updated_at) || !Number.isFinite(Date.parse(v.updated_at))) fail();
  return v as unknown as GroupClassJournalMark;
}
async function pages(query: () => Query): Promise<unknown[]> {
  const rows: unknown[] = []; let expected: number | undefined;
  for (let from = 0; ; from += 100) {
    const r = await query().range(from, from + 99); checkError(r.error);
    if (!Array.isArray(r.data) || !Number.isSafeInteger(r.count) || Number(r.count) < 0) fail();
    if (expected === undefined) expected = Number(r.count);
    if (r.count !== expected || r.data.length !== Math.min(100, Math.max(0, expected - from))) fail();
    rows.push(...r.data); if (rows.length === expected) return rows;
  }
}
export async function fetchGroupClassJournalMarks(scope: Scope, client: GroupClassJournalMarksClient = defaultClient): Promise<GroupClassJournalMarksContext> {
  if (!scope.organizationId || !scope.groupId) fail();
  const g = await client.from("student_groups").select("id,organization_id,course_id,name,training_dates").eq("organization_id", scope.organizationId).eq("id", scope.groupId).maybeSingle(); checkError(g.error);
  const group = g.data;
  if (!object(group) || group.id !== scope.groupId || group.organization_id !== scope.organizationId || !nullable(group.course_id) || typeof group.name !== "string"
    || !Array.isArray(group.training_dates) || !group.training_dates.every(date)) fail();
  const profiles = await pages(() => client.from("profiles").select("user_id,full_name,organization_id,student_group_id,archived_at", { count: "exact" }).eq("organization_id", scope.organizationId).eq("student_group_id", scope.groupId).is("archived_at", null).order("user_id"));
  const seen = new Set<string>();
  const students = profiles.map(p => {
    if (!object(p) || !str(p.user_id) || seen.has(p.user_id) || p.organization_id !== scope.organizationId || p.student_group_id !== scope.groupId || p.archived_at !== null || !(p.full_name === null || typeof p.full_name === "string")) fail();
    seen.add(p.user_id); return { user_id: p.user_id, full_name: typeof p.full_name === "string" ? p.full_name : "" };
  });
  const raw = await pages(() => client.from("group_class_journal_marks").select("id,organization_id,group_id,user_id,slot,course_id,source_date,mark,revision,updated_at,updated_by", { count: "exact" }).eq("organization_id", scope.organizationId).eq("group_id", scope.groupId).order("id"));
  const keys = new Set<string>(), ids = new Set<string>();
  const marks = raw.map(v => { const m = parseMark(v, scope); const key = `${m.user_id}:${m.slot}`; if (keys.has(key) || ids.has(m.id)) fail(); keys.add(key); ids.add(m.id); return m; });
  return { group: group as unknown as GroupClassJournalMarksContext["group"], students, marks };
}
/** Stale saved values remain inspectable but must not populate a current editable cell. */
export function isCurrentGroupClassJournalMark(mark: GroupClassJournalMark, context: GroupClassJournalMarksContext): boolean {
  return mark.organization_id === context.group.organization_id && mark.group_id === context.group.id && mark.course_id === context.group.course_id && mark.source_date === context.group.training_dates[mark.slot - 1] && context.students.some(s => s.user_id === mark.user_id);
}
export async function saveGroupClassJournalMark(input: Scope & { context: GroupClassJournalMarksContext; userId: string; slot: number; mark: string }, client: GroupClassJournalMarksClient = defaultClient): Promise<GroupClassJournalMarksContext> {
  const { context, slot, userId } = input;
  if (context.group.id !== input.groupId || context.group.organization_id !== input.organizationId || !context.students.some(s => s.user_id === userId) || !Number.isInteger(slot) || slot < 1 || slot > 4 || !date(context.group.training_dates[slot - 1]) || !validMark(input.mark)) fail();
  const prior = context.marks.filter(m => m.user_id === userId && m.slot === slot); if (prior.length > 1) fail();
  try {
    const r = await client.rpc("save_group_class_journal_mark", { p_organization_id: input.organizationId, p_group_id: input.groupId, p_expected_course_id: context.group.course_id, p_user_id: userId, p_slot: slot, p_expected_date: context.group.training_dates[slot - 1], p_expected_revision: prior[0]?.revision ?? null, p_mark: input.mark }); checkError(r.error);
    const saved = parseMark(r.data, input);
    if (saved.user_id !== userId || saved.slot !== slot || saved.mark !== input.mark || (prior[0] && saved.id !== prior[0].id) || saved.revision !== (prior[0]?.revision ?? 0) + 1 || !isCurrentGroupClassJournalMark(saved, context)) fail();
    const fresh = await fetchGroupClassJournalMarks(input, client);
    const confirmed = fresh.marks.find(m => m.id === saved.id);
    if (!confirmed || !isCurrentGroupClassJournalMark(confirmed, fresh) || fresh.group.course_id !== context.group.course_id || JSON.stringify(fresh.group.training_dates) !== JSON.stringify(context.group.training_dates)
      || confirmed.user_id !== userId || confirmed.slot !== slot || confirmed.course_id !== saved.course_id || confirmed.source_date !== saved.source_date || confirmed.revision !== saved.revision || confirmed.mark !== saved.mark || confirmed.updated_at !== saved.updated_at || confirmed.updated_by !== saved.updated_by) fail();
    return fresh;
  } catch (e) { throw new GroupClassJournalMarksError(e instanceof GroupClassJournalMarksError ? `${e.message} Сохранение могло произойти; перечитайте журнал перед повтором.` : "Сохранение не подтверждено. Обновите журнал перед повтором.", true); }
}
