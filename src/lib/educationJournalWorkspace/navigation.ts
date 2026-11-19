import { journalScopeSchema, journalTypeSchema, journalUuid, type EducationJournalScope, type EducationJournalType } from './contract';

export interface JournalOrigin { kind: 'organization' | 'group' | 'student'; studentId?: string | null; groupId?: string | null; enrollmentId?: string | null; department?: string | null; participantSearch?: string | null }
const uuid = (value: string | null | undefined) => value && journalUuid.safeParse(value).success ? value : null;
const KEYS = ['journalScope', 'journalStudentId', 'journalEnrollmentId', 'journalOrigin', 'journalReturnStudentId', 'journalReturnGroupId', 'journalReturnEnrollmentId', 'journalReturnDepartment', 'journalReturnSearch'] as const;
export function clearEducationJournalWorkspaceParams(params: URLSearchParams) {
  const next = new URLSearchParams(params); KEYS.forEach(key => next.delete(key)); return next;
}
export function educationJournalWorkspacePath(scope: EducationJournalScope, journalType?: EducationJournalType | null, origin: JournalOrigin = { kind: 'organization' }): string {
  const target = journalScopeSchema.parse(scope);
  const params = new URLSearchParams({ tab: 'journals', journalView: 'workspace', journalScope: target.kind, journalOrigin: origin.kind });
  if (target.kind === 'group') params.set('groupId', target.group_id);
  if (target.kind === 'student') {
    params.set('journalStudentId', target.student_user_id);
    if (target.enrollment_id) params.set('journalEnrollmentId', target.enrollment_id);
    if (target.group_id) params.set('groupId', target.group_id);
  }
  if (journalType) params.set('journalType', journalTypeSchema.parse(journalType));
  if (uuid(origin.studentId)) params.set('journalReturnStudentId', origin.studentId!);
  if (uuid(origin.groupId)) params.set('journalReturnGroupId', origin.groupId!);
  if (uuid(origin.enrollmentId)) params.set('journalReturnEnrollmentId', origin.enrollmentId!);
  if (origin.department) params.set('journalReturnDepartment', origin.department);
  if (origin.participantSearch) params.set('journalReturnSearch', origin.participantSearch);
  return '/organization?' + params.toString();
}
export type WorkspaceRoute = { state: 'none' } | { state: 'invalid' } | { state: 'ready'; scope: EducationJournalScope; journalType: EducationJournalType | null; origin: JournalOrigin };
export function readEducationJournalWorkspaceRoute(params: URLSearchParams): WorkspaceRoute {
  if (params.get('journalView') !== 'workspace') return { state: 'none' };
  const kind = params.get('journalScope');
  const group = params.get('groupId');
  const target = kind === 'organization' ? { kind }
    : kind === 'group' ? { kind, group_id: group }
      : kind === 'student' ? { kind, student_user_id: params.get('journalStudentId'), enrollment_id: params.get('journalEnrollmentId'), group_id: group } : null;
  const parsed = journalScopeSchema.safeParse(target);
  if (kind === 'organization' && (params.has('groupId') || params.has('journalStudentId') || params.has('journalEnrollmentId'))
    || kind === 'group' && (params.has('journalStudentId') || params.has('journalEnrollmentId'))) return { state: 'invalid' };
  const rawType = params.get('journalType');
  const type = rawType === null ? null : journalTypeSchema.safeParse(rawType);
  const originKind = params.get('journalOrigin') ?? 'organization';
  if (!parsed.success || type && !type.success || !['organization', 'group', 'student'].includes(originKind)) return { state: 'invalid' };
  const student = params.get('journalReturnStudentId'), backGroup = params.get('journalReturnGroupId');
  const enrollment = params.get('journalReturnEnrollmentId');
  if (student && !uuid(student) || backGroup && !uuid(backGroup) || originKind === 'student' && (!uuid(student) || parsed.data.kind === 'student' && student !== parsed.data.student_user_id)
    || originKind === 'group' && !uuid(backGroup) || enrollment && !uuid(enrollment)) return { state: 'invalid' };
  return { state: 'ready', scope: parsed.data, journalType: type?.success ? type.data : null,
    origin: { kind: originKind as JournalOrigin['kind'], studentId: student, groupId: backGroup, enrollmentId: enrollment, department: params.get('journalReturnDepartment'), participantSearch: params.get('journalReturnSearch') } };
}
export function educationJournalReturnPath(origin: JournalOrigin): string {
  if (origin.kind === 'student' && uuid(origin.studentId)) {
    const params = new URLSearchParams({ tab: 'student-details', studentId: origin.studentId!, studentSection: 'documents' });
    if (uuid(origin.groupId)) params.set('returnToGroupId', origin.groupId!);
    if (uuid(origin.enrollmentId)) params.set('studentJournalEnrollmentId', origin.enrollmentId!);
    if (origin.department) params.set('returnDepartment', origin.department);
    if (origin.participantSearch) params.set('returnParticipantSearch', origin.participantSearch);
    return '/organization?' + params.toString();
  }
  if (origin.kind === 'group' && uuid(origin.groupId)) {
    const params = new URLSearchParams({ tab: 'group-folder', studentsView: 'groups', groupId: origin.groupId! });
    if (origin.department) params.set('department', origin.department);
    if (origin.participantSearch) params.set('participantSearch', origin.participantSearch);
    return '/organization?' + params.toString();
  }
  return '/organization?tab=documents&documentView=journals';
}
