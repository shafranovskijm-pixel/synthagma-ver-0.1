import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { useAuth } from '@/hooks/useAuth';
import { useEducationJournalWorkspace } from '@/hooks/useEducationJournalWorkspace';
import { useUrlQueryState } from '@/hooks/useUrlNavigation';
import { journalUuid, type EducationJournalScope } from '@/lib/educationJournalWorkspace/contract';
import { educationJournalWorkspacePath, type JournalOrigin } from '@/lib/educationJournalWorkspace/navigation';
import { AdmissionDocumentSettingsPanel } from '@/components/organization/documents/AdmissionDocumentSettingsPanel';

export interface StudentJournalEnrollment { id: string; course_id: string; course_title: string; started_at?: string }
interface Props { organizationId: string; studentUserId: string; enrollments?: StudentJournalEnrollment[]; enrollmentsLoading?: boolean; enrollmentsError?: string | null }
export function StudentJournalLinks({ organizationId, studentUserId, enrollments = [], enrollmentsLoading = false, enrollmentsError = null }: Props) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const p = useStaffPermissions(), { user } = useAuth();
  const [selection, setSelection] = useUrlQueryState<string>('studentJournalEnrollmentId', 'all');
  const invalid = selection !== 'all' && !journalUuid.safeParse(selection).success;
  const enrollmentId = selection !== 'all' && !invalid ? selection : null;
  const returnGroup = params.get('returnToGroupId');
  const groupId = journalUuid.safeParse(returnGroup).success ? returnGroup : null;
  const target: EducationJournalScope = { kind: 'student', student_user_id: studentUserId, enrollment_id: enrollmentId, group_id: groupId };
  const allowed = !p.loading && !p.error && p.can('journals.read') && p.can('students.read') && p.can('documents.read');
  const model = useEducationJournalWorkspace(organizationId, target, null, allowed && !invalid, JSON.stringify([user?.id, p.organizationId, p.orgRole, p.adminRole, p.isOrgOwner, allowed]));
  const origin: JournalOrigin = { kind: 'student', studentId: studentUserId, enrollmentId, groupId: params.get('returnToGroupId'), department: params.get('returnDepartment'), participantSearch: params.get('returnParticipantSearch') };
  if (!p.loading && !allowed) return null;
  return <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-labelledby="student-journals-title" data-testid="student-journal-links">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="student-journals-title" className="font-display text-lg font-semibold">Журналы и приказы</h3><p className="mt-1 text-sm text-muted-foreground">Записи этого ученика из обучения и документооборота. Выписка содержит только его сведения.</p></div><Button variant="outline" className="h-auto min-h-10 max-w-full whitespace-normal rounded-xl text-left" disabled={model.loading || !!model.error || invalid || !model.summary} onClick={() => navigate(educationJournalWorkspacePath(target, null, origin))}><ClipboardList className="mr-2 h-4 w-4 shrink-0" />Открыть журналы ученика</Button></div>
    {model.summary?.context.group && !model.loading && !model.error && <p className="mt-3 break-words text-sm text-muted-foreground">Группа: {model.summary.context.group.label}</p>}<div className="mt-4 space-y-2"><label htmlFor="student-journal-enrollment" className="text-sm font-medium">Обучение</label><select id="student-journal-enrollment" className="min-h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" value={selection} disabled={enrollmentsLoading} onChange={event => setSelection(event.target.value)}><option value="all">{groupId ? 'Все обучения в этой группе' : 'Все обучения'}</option>{enrollments.map(row => <option key={row.id} value={row.id}>{row.course_title}{row.started_at ? ` · ${new Date(row.started_at).toLocaleDateString('ru-RU')}` : ''}</option>)}</select>{enrollmentsError && <p role="status" className="text-sm text-muted-foreground">Список обучений пока не подтверждён. Уже выбранная область не заменяется другой.</p>}</div>
    {invalid && <p role="alert" className="mt-3 text-sm text-destructive">Не удалось определить выбранное обучение. Выберите его из списка.</p>}
    {(p.loading || model.loading) && <div role="status" className="mt-4 flex items-center gap-2 text-sm"><SigmaSpinner />Загрузка журналов ученика…</div>}
    {model.error && <div role="alert" className="mt-4 rounded-xl border border-destructive/30 p-4 text-sm"><p>{model.error}</p><Button variant="outline" className="mt-3 rounded-xl" onClick={model.refresh}><RefreshCw className="mr-2 h-4 w-4" />Повторить загрузку</Button></div>}
    {model.exportError && <p role="alert" className="mt-3 text-sm text-destructive">{model.exportError}</p>}
    {model.summary && !model.loading && !model.error && <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      {model.summary.journals.map(journal => <div key={journal.journal_type} className="flex min-w-0 flex-col rounded-xl border border-border p-3"><div className="flex items-start justify-between gap-2"><h4 className="text-sm font-medium">{journal.title}</h4><Badge variant="secondary" className="shrink-0">{journal.state === 'available' ? journal.record_count : '—'}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{journal.state === 'available' ? journal.source_label : journal.reason || 'Источник пока недоступен'}</p>{journal.state === 'available' && journal.reason && <p className="mt-2 text-xs text-muted-foreground">{journal.reason}</p>}<div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal rounded-xl text-left" disabled={journal.state !== 'available'} onClick={() => navigate(educationJournalWorkspacePath(target, journal.journal_type, origin))}>Открыть записи</Button><Button size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal rounded-xl text-left" disabled={journal.state !== 'available' || !journal.exportable || !model.summary?.capabilities.can_export || model.exportBusy} onClick={() => void model.exportExtract(journal.journal_type)}><Download className="mr-2 h-4 w-4 shrink-0" />{model.exportBusy ? 'Подготовка…' : 'Выписка HTML'}</Button></div></div>)}
    </div>}
    {enrollmentId && model.summary?.context.enrollment?.id === enrollmentId ? <div className="mt-4"><AdmissionDocumentSettingsPanel key={`${organizationId}:${enrollmentId}:${model.summary.context.group?.id || ''}`} organizationId={organizationId} scope={{ kind: 'enrollment', enrollmentId, groupId: model.summary.context.group?.id ?? null }} onChanged={model.refresh} /></div> : <p className="mt-4 text-xs text-muted-foreground">Чтобы настроить дату приказа о зачислении, выберите конкретное обучение.</p>}
  </section>;
}
