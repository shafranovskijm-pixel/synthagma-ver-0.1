import { z } from 'zod';
import { journalRowSchema, journalScopeSchema, journalTypeSchema, journalUuid, type EducationJournalRow, type EducationJournalScope, type EducationJournalType } from './contract';
import { educationJournalWorkspacePath, readEducationJournalWorkspaceRoute, type JournalOrigin } from './navigation';

export const STUDENT_JOURNAL_RETURN = 'studentJournalReturn';
const originSchema = z.object({
  kind: z.enum(['organization', 'group', 'student']),
  studentId: journalUuid.nullable().optional(), groupId: journalUuid.nullable().optional(),
  studentGroupId: journalUuid.nullable().optional(), enrollmentId: journalUuid.nullable().optional(),
  department: z.string().max(300).nullable().optional(), participantSearch: z.string().max(1000).nullable().optional(),
}).strict();
const returnSchema = z.object({
  schema_version: z.literal(1), organization_id: journalUuid,
  student_user_id: journalUuid, enrollment_id: journalUuid, course_id: journalUuid,
  scope: journalScopeSchema, journal_type: journalTypeSchema, origin: originSchema,
}).strict();
function rowInScope(row: Pick<EducationJournalRow, 'student_user_id' | 'enrollment_id' | 'group_id'>, scope: EducationJournalScope): boolean {
  if (scope.kind === 'organization') return true;
  if (scope.kind === 'group') return row.group_id === scope.group_id;
  return row.student_user_id === scope.student_user_id
    && (scope.enrollment_id === null || row.enrollment_id === scope.enrollment_id)
    && (scope.group_id === null || row.group_id === scope.group_id);
}

/** A registry row has no document-artifact witness. Open its exact learning
 * documents through the existing authorized read model, never guess a file ID. */
export function journalStudentDocumentsPath(organizationId: string, scope: EducationJournalScope,
  journalType: EducationJournalType | null, origin: JournalOrigin, row: EducationJournalRow): string | null {
  const parsedRow = journalRowSchema.safeParse(row), parsedScope = journalScopeSchema.safeParse(scope);
  if (!parsedRow.success || !parsedScope.success || journalType !== 'document_registration'
    || row.journal_type !== journalType || !rowInScope(row, scope)
    || !journalUuid.safeParse(row.student_user_id).success || !journalUuid.safeParse(row.enrollment_id).success
    || !journalUuid.safeParse(row.course_id).success) return null;
  try {
    const workspace = readEducationJournalWorkspaceRoute(new URLSearchParams(educationJournalWorkspacePath(scope, journalType, origin).split('?')[1]));
    if (workspace.state !== 'ready') return null;
    const context = returnSchema.parse({ schema_version: 1, organization_id: organizationId,
      student_user_id: row.student_user_id, enrollment_id: row.enrollment_id, course_id: row.course_id,
      scope: workspace.scope, journal_type: workspace.journalType, origin: workspace.origin });
    const params = new URLSearchParams({ tab: 'student-details', studentId: context.student_user_id,
      studentSection: 'documents', studentJournalEnrollmentId: context.enrollment_id,
      [STUDENT_JOURNAL_RETURN]: JSON.stringify(context) });
    if (row.group_id) params.set('studentJournalGroupId', row.group_id);
    const returnGroup = scope.kind === 'group' ? scope.group_id : origin.groupId;
    if (returnGroup && journalUuid.safeParse(returnGroup).success) params.set('returnToGroupId', returnGroup);
    if (origin.department) params.set('returnDepartment', origin.department);
    if (origin.participantSearch) params.set('returnParticipantSearch', origin.participantSearch);
    return '/organization?' + params.toString();
  } catch { return null; }
}

/** Reload-safe, same-organization return with validated fields, never a raw URL.
 * Changing learner or learning selection invalidates the retained intention. */
export function studentDocumentJournalReturnPath(params: URLSearchParams, organizationId: string | null | undefined): string | null {
  const raw = params.get(STUDENT_JOURNAL_RETURN);
  if (!raw || raw.length > 8000 || params.get('tab') !== 'student-details') return null;
  try {
    const parsed = returnSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const value = parsed.data;
    if (value.organization_id !== organizationId || value.student_user_id !== params.get('studentId')
      || value.enrollment_id !== params.get('studentJournalEnrollmentId')) return null;
    const path = educationJournalWorkspacePath(value.scope, value.journal_type, { ...value.origin, kind: value.origin.kind });
    const route = readEducationJournalWorkspaceRoute(new URLSearchParams(path.split('?')[1]));
    if (route.state !== 'ready' || !rowInScope({ student_user_id: value.student_user_id,
      enrollment_id: value.enrollment_id, group_id: params.get('studentJournalGroupId') }, route.scope)) return null;
    return path;
  } catch { return null; }
}
