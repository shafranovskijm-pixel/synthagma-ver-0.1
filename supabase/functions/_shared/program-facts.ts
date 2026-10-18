// Shared by browser draft generators and Edge compilers. Only the original
// caller's authoritative RPC response supplies confirmed programme facts.
// Keep this module free of Deno, npm and application imports.
export class ProgramFactsError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export const UNCONFIRMED_PROGRAM_NOTICE = "Черновик: утверждённая программа и её связь с обучением не подтверждены";
export type ProgramFields = { program_title: string; program_hours: number; program_form: string };
export type ProgramGroupFields = { name: string; start_date: string; end_date: string; training_dates: string[]; schedule_text: string; instructor_name: string };
export type ProgramGroupSnapshot = { name: string | null; start_date: string | null; end_date: string | null; training_dates: string[] | null; schedule_text: string | null; instructor_name: string | null };
export type ProgramFactsProof = {
  schema_version: 1; state: "confirmed" | "unconfirmed";
  organization_id: string; group_id: string; course_id: string | null;
  reason?: string; program_id?: string; version_id?: string; file_document_id?: string;
  file_version_id?: string; file_review_id?: string; facts_hash?: string;
  binding_id?: string; binding_revision?: number; binding_snapshot_hash?: string;
  enrollment_snapshot_ids?: string[];
  facts_snapshot?: Record<string, unknown>; group_snapshot?: ProgramGroupSnapshot;
};
export type ProgramGeneration = {
  state: "confirmed" | "unconfirmed"; reason: string | null;
  fields: ProgramFields | null; groupFields: ProgramGroupFields | null; facts: Record<string, unknown> | null; provenance: ProgramFactsProof;
};
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const fail = (): never => { throw new ProgramFactsError(409, "Не удалось подтвердить неизменяемую программу и зачисления группы. Обновите данные программы."); };
const forms: Record<string, string> = { full_time: "Очная", part_time: "Заочная", mixed: "Очно-заочная" };

export function parseGroupProgramGeneration(raw: unknown, organizationId: string, groupId: string, studentUserIds: string[]): ProgramGeneration {
  if (!uuid(organizationId) || !uuid(groupId) || !Array.isArray(studentUserIds)
    || studentUserIds.some(v => !uuid(v)) || new Set(studentUserIds).size !== studentUserIds.length
    || !object(raw) || raw.group_id !== groupId || raw.enrollment_id !== null
    || !Number.isSafeInteger(raw.revision) || raw.revision < 0 || !Array.isArray(raw.enrollments)
    || raw.course_id !== null && !uuid(raw.course_id)) fail();
  const envelope = raw as Record<string, any>;
  if (envelope.binding === null && envelope.state === "unconfirmed") {
    if (typeof envelope.reason !== "string" || !envelope.reason.trim()) fail();
    return { state: "unconfirmed", reason: envelope.reason, fields: null, groupFields: null, facts: null,
      provenance: { schema_version: 1, state: "unconfirmed", organization_id: organizationId,
        group_id: groupId, course_id: envelope.course_id, reason: envelope.reason } };
  }
  const b = envelope.binding, v = b?.program_snapshot, f = v?.facts, calendar = b?.group_snapshot;
  if (envelope.state !== "confirmed" || !object(b) || !object(v) || !object(f)
    || !uuid(b.id) || b.organization_id !== organizationId || b.group_id !== groupId
    || b.course_id !== envelope.course_id || !uuid(b.course_id) || b.revision !== envelope.revision
    || !hash(b.snapshot_hash) || !uuid(b.version_id) || !uuid(b.program_id)
    || v.id !== b.version_id || v.program_id !== b.program_id || v.organization_id !== organizationId
    || v.state !== "approved" || !uuid(v.approved_by) || typeof v.approved_at !== "string" || !Number.isFinite(Date.parse(v.approved_at))
    || !uuid(v.file_document_id) || !uuid(v.file_version_id) || !uuid(v.file_review_id) || !hash(v.facts_hash)
    || !object(v.file_approval) || typeof v.file_approval.number !== "string" || !v.file_approval.number.trim()
    || !/^\d{4}-\d{2}-\d{2}$/.test(v.file_approval.date) || !uuid(v.file_approval.recorded_by)
    || f.schema_version !== 1 || typeof f.full_title !== "string" || !f.full_title.trim()
    || !Number.isSafeInteger(f.academic_hours) || f.academic_hours < 1 || f.academic_hours > 999999
    || !Object.prototype.hasOwnProperty.call(forms, f.training_form)
    || !["dpo_upskilling", "dpo_retraining", "professional_training", "internal_nonformal"].includes(f.program_type)
    || ["duration_calendar", "attestation_form", "attestation_criteria"].some(k => typeof f[k] !== "string" || !f[k].trim())
    || !object(calendar) || ["name", "start_date", "end_date", "schedule_text", "instructor_name"].some(k => calendar[k] !== null && typeof calendar[k] !== "string")
    || ["start_date", "end_date"].some(k => calendar[k] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(calendar[k]))
    || calendar.training_dates !== null && (!Array.isArray(calendar.training_dates) || calendar.training_dates.some((d: unknown) => typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)))) fail();
  const byUser = new Map<string, Record<string, any>>(), enrollmentIds = new Set<string>(), snapshotIds = new Set<string>();
  for (const e of envelope.enrollments) {
    if (!object(e) || !uuid(e.user_id) || !uuid(e.enrollment_id) || byUser.has(e.user_id) || enrollmentIds.has(e.enrollment_id)
      || !["confirmed", "unconfirmed"].includes(e.state) || e.state === "confirmed" && !uuid(e.snapshot_id)
      || e.snapshot_id !== null && !uuid(e.snapshot_id) || e.snapshot_id !== null && snapshotIds.has(e.snapshot_id)) fail();
    byUser.set(e.user_id, e); enrollmentIds.add(e.enrollment_id); if (e.snapshot_id !== null) snapshotIds.add(e.snapshot_id);
  }
  const selected = studentUserIds.map(id => byUser.get(id));
  if (selected.some(e => !e || e.state !== "confirmed" || !uuid(e.snapshot_id))) fail();
  return { state: "confirmed", reason: null,
    fields: { program_title: f.full_title, program_hours: f.academic_hours, program_form: forms[f.training_form] },
    groupFields: { name: calendar.name ?? "", start_date: calendar.start_date ?? "", end_date: calendar.end_date ?? "",
      training_dates: [...(calendar.training_dates ?? [])], schedule_text: calendar.schedule_text ?? "", instructor_name: calendar.instructor_name ?? "" },
    facts: { ...f },
    provenance: { schema_version: 1, state: "confirmed", organization_id: organizationId, group_id: groupId, course_id: b.course_id,
      program_id: b.program_id, version_id: v.id, file_document_id: v.file_document_id, file_version_id: v.file_version_id,
      file_review_id: v.file_review_id, facts_hash: v.facts_hash, binding_id: b.id, binding_revision: b.revision,
      binding_snapshot_hash: b.snapshot_hash, enrollment_snapshot_ids: selected.map(e => e!.snapshot_id as string).sort(),
      facts_snapshot: { ...f }, group_snapshot: { ...calendar, training_dates: calendar.training_dates === null ? null : [...calendar.training_dates] } } };
}

export async function resolveGroupProgramGeneration(db: RpcClient, organizationId: string, groupId: string, studentUserIds: string[]): Promise<ProgramGeneration> {
  const { data, error } = await db.rpc("get_group_program_facts", {
    p_organization_id: organizationId, p_group_id: groupId, p_enrollment_id: null,
  });
  if (error) throw new ProgramFactsError(503, "Не удалось проверить версию программы. Документы не сохранены.");
  return parseGroupProgramGeneration(data, organizationId, groupId, studentUserIds);
}

export function withProgramGeneration<T extends { group: ProgramFields }>(context: T, result: ProgramGeneration): T {
  return { ...context, group: { ...context.group, ...(result.groupFields || {}), ...(result.fields || {}) } };
}

export const programDate = (value: string): string => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}` : "";
const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const programDateRu = (value: string): string => programDate(value)
  ? `«${value.slice(8, 10)}» ${months[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)} г.` : "";
export function programTrainingPeriod(result: ProgramGeneration): string {
  return result.groupFields ? [programDate(result.groupFields.start_date), programDate(result.groupFields.end_date)].filter(Boolean).join(" — ") : "";
}
export function programGroupLabel(result: ProgramGeneration): string {
  if (!result.fields || !result.groupFields) return "";
  const period = programTrainingPeriod(result);
  return [`Программа «${result.fields.program_title}»`, result.groupFields.name ? `группа «${result.groupFields.name}»` : "",
    period ? `срок обучения ${period}` : ""].filter(Boolean).join("; ");
}
/** Canonical placeholders shared by Edge and browser previews. Null stays unknown. */
export function programGenerationScalars(result: ProgramGeneration): Record<string, string> {
  if (!result.groupFields || !result.facts) return {};
  return { GROUP_NAME: result.groupFields.name, START_DATE: result.groupFields.start_date, END_DATE: result.groupFields.end_date,
    START_DATE_RU: programDateRu(result.groupFields.start_date), END_DATE_RU: programDateRu(result.groupFields.end_date),
    ...Object.fromEntries([0, 1, 2, 3].map(index => [`DAY${index + 1}_DATE`, programDate(result.groupFields!.training_dates[index] || "")])),
    SERVICE_START_DATE: result.groupFields.start_date, SERVICE_END_DATE: result.groupFields.end_date,
    SCHEDULE: result.groupFields.schedule_text, STUDENT_DATES: programTrainingPeriod(result),
    PROGRAM_DURATION_CALENDAR: String(result.facts.duration_calendar ?? ""), ATTESTATION_FORM: String(result.facts.attestation_form ?? ""),
    ATTESTATION_CRITERIA: String(result.facts.attestation_criteria ?? ""), QUALIFICATION: String(result.facts.qualification ?? ""), PROFESSION: String(result.facts.profession ?? "") };
}
