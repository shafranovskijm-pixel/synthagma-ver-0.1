import { z } from 'zod';
import { admissionProgramRefSchema } from '@/lib/admissionCases/contract';

export const uuid = z.string().uuid();
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const documentDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const time = z.string().datetime({ offset: true });
export const wireScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('organization') }).strict(),
  z.object({ kind: z.literal('group'), group_id: uuid }).strict(),
  z.object({ kind: z.literal('enrollment'), enrollment_id: uuid, group_id: uuid.nullable() }).strict(),
]);
export type WireScope = z.infer<typeof wireScopeSchema>;
export type AdmissionDocumentScope = { kind: 'organization' } | { kind: 'group'; groupId: string }
  | { kind: 'enrollment'; enrollmentId: string; groupId?: string | null };
export function wireScope(scope: AdmissionDocumentScope): WireScope {
  return wireScopeSchema.parse(scope.kind === 'organization' ? { kind: scope.kind }
    : scope.kind === 'group' ? { kind: scope.kind, group_id: scope.groupId }
      : { kind: scope.kind, enrollment_id: scope.enrollmentId, group_id: scope.groupId ?? null });
}
export const preferencesSchema = z.object({ enabled: z.boolean().nullable(), document_date: documentDate.nullable(),
  effective_admission_date: documentDate.nullable(), timezone: z.string().min(1).max(128).nullable() }).strict();
export type AdmissionDocumentPreferences = z.infer<typeof preferencesSchema>;
export const policyRevisionsSchema = z.object({ organization: revision, group: revision, enrollment: revision }).strict();
export const effectiveSchema = z.object({ enabled: z.boolean(), document_date: documentDate.nullable(), effective_admission_date: documentDate.nullable(),
  timezone: z.string().min(1).max(128), sources: z.object({ enabled: z.enum(['organization','group','enrollment','default']),
    document_date: z.enum(['group','enrollment','enrollment_event']), effective_admission_date: z.enum(['group','enrollment','enrollment_event']) }).strict(),
  policy_revisions: policyRevisionsSchema }).strict();
export const missingFactSchema = z.enum(['ambiguous_group','group_not_selected','group_course_not_bound','program_not_confirmed','enrollment_cancelled','student_archived']);
export const draftSchema = z.object({ id: uuid, organization_id: uuid, enrollment_id: uuid, course_id: uuid, user_id: uuid,
  observed_group_id: uuid.nullable(), group_id: uuid.nullable(), revision: revision.refine(value => value > 0),
  document_date: documentDate, effective_admission_date: documentDate, recorded_at: time, updated_at: time,
  status: z.enum(['prepared','needs_information','disabled']), preparation_mode: z.enum(['automatic','manual']),
  missing_facts: z.array(missingFactSchema), source_revision: revision, program_ref: admissionProgramRefSchema.nullable(),
  policy_revisions: policyRevisionsSchema, stale: z.boolean(), registered_locked: z.boolean(), live_missing_facts: z.array(missingFactSchema) }).strict();
export type AutomaticAdmissionDraft = z.infer<typeof draftSchema>;
export const settingsSchema = z.object({ schema_version: z.literal(1), organization_id: uuid, scope: wireScopeSchema, revision,
  preferences: preferencesSchema, effective: effectiveSchema, groups: z.array(z.object({ id: uuid, name: z.string().max(4000) }).strict()),
  draft: draftSchema.nullable(), individual_date_overrides: z.number().int().nonnegative().nullable(), capabilities: z.object({ can_read: z.literal(true), can_write: z.boolean(), can_prepare: z.boolean(), can_apply_current: z.boolean() }).strict() }).strict();
export type AdmissionDocumentSettings = z.infer<typeof settingsSchema>;
export const commandSchema = z.discriminatedUnion('action', [
  preferencesSchema.extend({ action: z.literal('save'), reason: z.literal('manual_settings') }).strict(),
  z.object({ action: z.literal('reset'), reason: z.literal('inherit_reset') }).strict(),
  z.object({ action: z.literal('prepare_existing'), reason: z.literal('prepare_existing') }).strict(),
  z.object({ action: z.literal('apply_current'), reason: z.literal('apply_to_pending'), after_enrollment_id: uuid.nullable() }).strict(),
]);
export type AdmissionDocumentCommand = z.infer<typeof commandSchema>;
export const mutationSchema = z.object({ schema_version: z.literal(1), request_id: uuid, replayed: z.boolean(), processed: z.number().int().min(0).max(100),
  next_after_enrollment_id: uuid.nullable(), state: settingsSchema }).strict();
export type AdmissionDocumentMutation = z.infer<typeof mutationSchema>;
export const exportSchema = z.object({ schema_version: z.literal(1), organization_id: uuid, enrollment_id: uuid, draft_id: uuid, revision,
  document_date: documentDate, effective_admission_date: documentDate, recorded_at: time, status: z.enum(['prepared','needs_information']),
  missing_facts: z.array(missingFactSchema), organization_name: z.string().max(4000), student_name: z.string().max(4000), course_title: z.string().max(4000),
  group_name: z.string().max(4000).nullable(), program_title: z.string().max(4000).nullable() }).strict();
export type AdmissionDraftExport = z.infer<typeof exportSchema>;
export const missingFactLabels: Record<z.infer<typeof missingFactSchema>, string> = {
  ambiguous_group: 'Выберите группу для этого обучения', group_not_selected: 'Добавьте ученика в подходящую группу',
  group_course_not_bound: 'Укажите курс в настройках группы', program_not_confirmed: 'Подтвердите программу обучения',
  enrollment_cancelled: 'Зачисление отменено', student_archived: 'Ученик находится в архиве',
};
