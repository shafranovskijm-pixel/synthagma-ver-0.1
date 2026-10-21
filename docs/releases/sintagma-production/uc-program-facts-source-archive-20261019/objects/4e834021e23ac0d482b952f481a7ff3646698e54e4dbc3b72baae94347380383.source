import { z } from "zod";

const id = z.string().uuid();
const revision = z.number().int().nonnegative();
const nullableText = z.string().max(4000).nullable();
export const programFactStates = ["draft", "in_review", "rejected", "approved", "cancelled"] as const;
export const programFactStateLabels: Record<typeof programFactStates[number], string> = {
  draft: "Черновик фактов", in_review: "Факты на проверке", rejected: "Нужна новая редакция", approved: "Факты утверждены", cancelled: "Редакция отменена",
};
export const programTypeLabels = {
  dpo_upskilling: "Повышение квалификации", dpo_retraining: "Профессиональная переподготовка",
  professional_training: "Профессиональное обучение", internal_nonformal: "Внутреннее обучение вне образовательных программ",
} as const;
export const trainingFormLabels = { full_time: "Очная", part_time: "Заочная", mixed: "Очно-заочная" } as const;
export const programFactsSchema = z.object({
  schema_version: z.literal(1), full_title: nullableText,
  program_type: z.enum(["dpo_upskilling", "dpo_retraining", "professional_training", "internal_nonformal"]).nullable(),
  academic_hours: z.number().int().positive().max(999999).nullable(),
  training_form: z.enum(["full_time", "part_time", "mixed"]).nullable(),
  uses_elearning: z.boolean().nullable(), uses_distance_learning: z.boolean().nullable(),
  duration_calendar: nullableText, attestation_form: nullableText, attestation_criteria: nullableText,
  qualification: nullableText, profession: nullableText,
}).strict();
export type ProgramFacts = z.infer<typeof programFactsSchema>;
export const emptyProgramFacts = (): ProgramFacts => ({ schema_version: 1, full_title: null, program_type: null,
  academic_hours: null, training_form: null, uses_elearning: null, uses_distance_learning: null,
  duration_calendar: null, attestation_form: null, attestation_criteria: null, qualification: null, profession: null });
const approval = z.object({ number: z.string().min(1), date: z.string(), recorded_at: z.string(), recorded_by: id });
export const programVersionSchema = z.object({
  id, organization_id: id, program_id: id, version_number: z.number().int().positive(), revision,
  state: z.enum(programFactStates), file_document_id: id, file_version_id: id, file_review_id: id,
  file_approval: approval, facts: programFactsSchema, facts_hash: z.string().min(1),
  reviewer_user_id: id, reviewer_name: z.string(), created_by: id, created_by_name: z.string(), created_at: z.string(),
  approved_at: z.string().nullable(), approved_by: id.nullable(), note: nullableText,
}).superRefine((v, ctx) => {
  if (v.state === "approved" && (!v.approved_at || !v.approved_by)) ctx.addIssue({ code: "custom", message: "Нет записи об утверждении фактов" });
  if (v.state === "approved" && (!programFactsReady(v.facts) || v.approved_by !== v.reviewer_user_id)) ctx.addIssue({ code: "custom", message: "Не подтверждены факты или назначенный проверяющий" });
});
export type ProgramVersion = z.infer<typeof programVersionSchema>;
export const programEnvelopeSchema = z.object({
  program: z.object({ id, organization_id: id, name: z.string(), description: nullableText, revision }),
  current_version: programVersionSchema.nullable(), versions: z.array(programVersionSchema),
  capabilities: z.object({ can_create_version: z.boolean(), can_submit: z.boolean(), can_approve: z.boolean(), can_reject: z.boolean(), can_cancel: z.boolean() }),
});
export type ProgramEnvelope = z.infer<typeof programEnvelopeSchema>;
export const programCandidatesSchema = z.object({
  files: z.array(z.object({ document_id: id, version_id: id, review_id: id, document_name: z.string(), version_number: z.number().int().positive(), approval })),
  reviewers: z.array(z.object({ user_id: id, display_name: z.string() })),
  courses: z.array(z.object({ id, title: z.string() })), groups: z.array(z.object({ id, name: z.string(), course_id: id.nullable() })),
});
export type ProgramCandidates = z.infer<typeof programCandidatesSchema>;
export const courseBindingSchema = z.object({ course_id: id, organization_id: id, revision, version_id: id, program_id: id, recorded_at: z.string(), recorded_by: id });
export type CourseProgramBinding = z.infer<typeof courseBindingSchema>;
export const groupSnapshotSchema = z.object({ name: z.string(), start_date: z.string().nullable(), end_date: z.string().nullable(),
  training_dates: z.unknown().nullable(), schedule_text: z.string().nullable(), instructor_name: z.string().nullable() });
export const groupBindingSchema = z.object({ id, group_id: id, course_id: id, organization_id: id, revision, version_id: id, program_id: id,
  program_snapshot: programVersionSchema, group_snapshot: groupSnapshotSchema, snapshot_hash: z.string().min(1), recorded_at: z.string(), recorded_by: id });
export type GroupProgramBinding = z.infer<typeof groupBindingSchema>;
export const enrollmentSnapshotSchema = z.object({ id, organization_id: id, group_id: id, enrollment_id: id, user_id: id, course_id: id,
  binding_id: id, binding_revision: revision, version_id: id, program_snapshot: programVersionSchema, group_snapshot: groupSnapshotSchema,
  snapshot_hash: z.string().min(1), source: z.enum(["association_created", "confirmed_existing_association"]), recorded_at: z.string(),
  recorded_by: id.nullable(), legal_enrollment_date: z.null() });
export type ProgramEnrollmentSnapshot = z.infer<typeof enrollmentSnapshotSchema>;
export const groupFactsEnvelopeSchema = z.object({ state: z.enum(["confirmed", "unconfirmed"]), reason: z.string().nullable(),
  group_id: id, course_id: id.nullable(), enrollment_id: id.nullable(), revision, binding: groupBindingSchema.nullable(),
  snapshot: enrollmentSnapshotSchema.nullable(), enrollments: z.array(z.object({ enrollment_id: id, user_id: id, snapshot_id: id.nullable(), state: z.enum(["confirmed", "unconfirmed"]) })),
  capabilities: z.object({ can_bind: z.boolean(), can_confirm_existing: z.boolean() }) });
export type GroupProgramFacts = z.infer<typeof groupFactsEnvelopeSchema>;

const scopeError = () => new Error("Не удалось подтвердить программу и её связь с выбранным обучением");
export function parseProgramEnvelope(value: unknown, organizationId: string, programId?: string): ProgramEnvelope {
  const v = programEnvelopeSchema.parse(value);
  if (v.program.organization_id !== organizationId || programId && v.program.id !== programId
    || new Set(v.versions.map(x => x.id)).size !== v.versions.length
    || v.versions.some(x => x.organization_id !== organizationId || x.program_id !== v.program.id)
    || v.current_version && (v.current_version.organization_id !== organizationId || v.current_version.program_id !== v.program.id
      || !v.versions.some(x => x.id === v.current_version!.id && x.revision === v.current_version!.revision && x.facts_hash === v.current_version!.facts_hash))) throw scopeError();
  return v;
}
export function parseProgramList(value: unknown, organizationId: string): ProgramEnvelope[] {
  if (!Array.isArray(value)) throw scopeError();
  const result = value.map(v => parseProgramEnvelope(v, organizationId));
  if (new Set(result.map(v => v.program.id)).size !== result.length) throw scopeError();
  return result;
}
export function parseCourseBinding(value: unknown, organizationId: string, courseId: string) {
  const v = z.object({ revision, binding: courseBindingSchema.nullable(), version: programVersionSchema.nullable() }).parse(value);
  if (v.binding && (v.binding.organization_id !== organizationId || v.binding.course_id !== courseId || v.binding.revision !== v.revision)
    || !!v.binding !== !!v.version || v.version && (v.version.organization_id !== organizationId || v.version.id !== v.binding!.version_id
      || v.version.program_id !== v.binding!.program_id || v.version.state !== "approved")) throw scopeError();
  return v;
}
export function parseGroupProgramFacts(value: unknown, organizationId: string, groupId: string, enrollmentId: string | null = null): GroupProgramFacts {
  const v = groupFactsEnvelopeSchema.parse(value), b = v.binding, s = v.snapshot;
  if (v.group_id !== groupId || v.enrollment_id !== enrollmentId || b && (b.organization_id !== organizationId || b.group_id !== groupId || b.course_id !== v.course_id
    || b.revision !== v.revision || b.program_snapshot.organization_id !== organizationId || b.program_snapshot.id !== b.version_id || b.program_snapshot.program_id !== b.program_id || b.program_snapshot.state !== "approved")
    || s && (!b || s.organization_id !== organizationId || s.group_id !== groupId || s.enrollment_id !== enrollmentId || s.course_id !== v.course_id
      || s.binding_id !== b.id || s.binding_revision !== b.revision || s.version_id !== b.version_id || s.program_snapshot.id !== s.version_id
      || s.program_snapshot.organization_id !== organizationId || s.program_snapshot.program_id !== b.program_id || s.program_snapshot.state !== "approved" || s.program_snapshot.facts_hash !== b.program_snapshot.facts_hash)
    || v.state === "confirmed" && (!b || enrollmentId !== null && !s)
    || v.enrollments.some(e => e.state === "confirmed" && !e.snapshot_id)
    || new Set(v.enrollments.map(e => e.enrollment_id)).size !== v.enrollments.length
    || s && v.enrollments.some(e => e.enrollment_id === s.enrollment_id && (e.user_id !== s.user_id || e.snapshot_id !== s.id))) throw scopeError();
  return v;
}
export function programFactsReady(facts: ProgramFacts): boolean {
  const v = programFactsSchema.safeParse(facts);
  return v.success && !!v.data.full_title?.trim() && !!v.data.program_type && !!v.data.academic_hours && !!v.data.training_form
    && !!v.data.duration_calendar?.trim() && !!v.data.attestation_form?.trim() && !!v.data.attestation_criteria?.trim();
}
