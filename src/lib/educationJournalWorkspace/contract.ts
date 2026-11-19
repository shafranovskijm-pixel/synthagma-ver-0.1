import { z } from 'zod';

export const journalUuid = z.string().uuid();
const text = z.string().max(2000);
const instant = z.string().max(64).datetime({ offset: true });
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const journalTypes = ['activity', 'current_control', 'final_tests', 'attestation_decisions', 'conducted_sessions', 'admission_orders', 'education_documents', 'document_registration', 'copies_duplicates'] as const;
export const journalTypeSchema = z.enum(journalTypes);
export type EducationJournalType = z.infer<typeof journalTypeSchema>;
export const journalLabels: Record<EducationJournalType, string> = {
  activity: 'Завершённые онлайн-уроки', current_control: 'Текущий контроль', final_tests: 'Итоговые тесты',
  attestation_decisions: 'Решения об аттестации', conducted_sessions: 'Проведённые занятия',
  admission_orders: 'Приказы о зачислении', education_documents: 'Выданные документы об обучении',
  document_registration: 'Регистрация документов', copies_duplicates: 'Копии и дубликаты документов',
};
export const journalScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('organization') }).strict(),
  z.object({ kind: z.literal('group'), group_id: journalUuid }).strict(),
  z.object({ kind: z.literal('student'), student_user_id: journalUuid, enrollment_id: journalUuid.nullable(), group_id: journalUuid.nullable() }).strict(),
]);
export type EducationJournalScope = z.infer<typeof journalScopeSchema>;
export const scopeKey = (scope: EducationJournalScope) => JSON.stringify(journalScopeSchema.parse(scope));
export const sameScope = (a: EducationJournalScope, b: EducationJournalScope) => scopeKey(a) === scopeKey(b);
export const journalQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('summary') }).strict(),
  z.object({ kind: z.literal('rows'), journal_type: journalTypeSchema, after: z.string().max(4096).nullable(), limit: z.number().int().min(1).max(100), snapshot_key: z.string().min(1).max(128).nullable() }).strict(),
]);
export type EducationJournalQuery = z.infer<typeof journalQuerySchema>;
export const journalRowSchema = z.object({
  id: z.string().min(1).max(240), journal_type: journalTypeSchema,
  student_user_id: journalUuid.nullable(), student_label: text,
  enrollment_id: journalUuid.nullable(), course_id: journalUuid.nullable(), course_label: text.nullable(),
  group_id: journalUuid.nullable(), group_label: text.nullable(), event_at: instant.nullable(),
  title: text, result: text.nullable(), source_label: text, source_id: z.string().min(1).max(240), source_revision: count.nullable(),
}).strict();
export type EducationJournalRow = z.infer<typeof journalRowSchema>;
export const journalSummarySchema = z.object({
  journal_type: journalTypeSchema, title: text, record_count: count.nullable(), source_label: text,
  automatic: z.boolean(), exportable: z.boolean(), state: z.enum(['available', 'not_applicable', 'unavailable']), reason: text.nullable(),
}).strict().refine(value => value.state === 'available' ? value.record_count !== null : value.record_count === null);
export type EducationJournalSummary = z.infer<typeof journalSummarySchema>;
const base = {
  schema_version: z.literal(1), organization_id: journalUuid, scope: journalScopeSchema,
  observed_at: instant, snapshot_key: z.string().min(1).max(128),
  capabilities: z.object({ can_read: z.boolean(), can_export: z.boolean() }).strict(),
  context: z.object({
    organization: z.object({ id: journalUuid, label: text }).strict(),
    student: z.object({ user_id: journalUuid, label: text }).strict().nullable(),
    group: z.object({ id: journalUuid, label: text }).strict().nullable(),
    enrollment: z.object({ id: journalUuid, course_id: journalUuid, course_label: text }).strict().nullable(),
  }).strict(),
};
export const journalSummaryReadSchema = z.object({ ...base, kind: z.literal('summary'), journals: z.array(journalSummarySchema).max(30) }).strict();
export const journalRowsReadSchema = z.object({ ...base, kind: z.literal('rows'), journal_type: journalTypeSchema, rows: z.array(journalRowSchema).max(100), next_cursor: z.string().max(4096).nullable(), total_count: count }).strict();
export const journalReadSchema = z.discriminatedUnion('kind', [journalSummaryReadSchema, journalRowsReadSchema]);
export type EducationJournalRead = z.infer<typeof journalReadSchema>;
export type EducationJournalSummaryRead = z.infer<typeof journalSummaryReadSchema>;
export type EducationJournalRowsRead = z.infer<typeof journalRowsReadSchema>;
export const journalErrorCode = z.enum(['ACCESS_DENIED', 'INVALID_INPUT', 'SOURCE_CHANGED', 'NOT_FOUND', 'DEPENDENCY_UNAVAILABLE', 'LIMIT_EXCEEDED']);
export type EducationJournalErrorCode = z.infer<typeof journalErrorCode>;
