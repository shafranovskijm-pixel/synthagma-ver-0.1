import { useSearchParams, useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { useDocumentChain } from '@/hooks/useDocumentChain';
import { captureOfflineActor } from '@/utils/courseCache';
import { chainUuid, type ChainScope } from '@/lib/documentChain/contract';
import { clearDocumentChainSourceParams, documentChainActionPath, documentChainSourcePath, readDocumentChainSourceRoute } from '@/lib/documentChain/navigation';
import { educationJournalWorkspacePath } from '@/lib/educationJournalWorkspace/navigation';
import { AdmissionDocumentSettingsPanel } from '@/components/organization/documents/AdmissionDocumentSettingsPanel';
import { DocumentChainSourceDialog } from '@/components/organization/documents/DocumentChainSourceDialog';
import { DocumentChainRows } from '@/components/organization/documents/DocumentChainRows';
import type { StudentJournalEnrollment } from './StudentJournalLinks';

interface Props { organizationId: string; studentUserId: string; enrollments?: StudentJournalEnrollment[]; enrollmentsLoading?: boolean; enrollmentsError?: string | null; ownViewer?: boolean }
export function StudentDocumentChain({ organizationId, studentUserId, enrollments = [], enrollmentsLoading = false, enrollmentsError = null, ownViewer = false }: Props) {
  const p = useStaffPermissions(), { user, loading: authLoading } = useAuth(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selection = params.get('studentJournalEnrollmentId') || 'all';
  const selectEnrollment = (value: string) => {
    const next = clearDocumentChainSourceParams(params);
    if (value === 'all') next.delete('studentJournalEnrollmentId'); else next.set('studentJournalEnrollmentId', value);
    next.delete('studentJournalGroupId'); next.delete('documentChainFocus'); setParams(next);
  };
  const groupValue = params.get('studentJournalGroupId');
  const invalid = selection !== 'all' && !chainUuid.safeParse(selection).success || groupValue !== null && !chainUuid.safeParse(groupValue).success;
  const enrollmentId = selection !== 'all' && !invalid ? selection : null, groupId = groupValue && !invalid ? groupValue : null;
  const target: ChainScope = { kind: 'student', student_user_id: studentUserId, enrollment_id: enrollmentId, group_id: groupId };
  const allowed = ownViewer ? !authLoading && user?.id === studentUserId : !p.loading && !p.error && p.can('documents.read') && p.can('students.read');
  const accessKey = JSON.stringify([user?.id, captureOfflineActor(user?.id), p.organizationId, p.orgRole, p.adminRole, p.isOrgOwner, allowed]);
  const model = useDocumentChain(organizationId, target, allowed && !invalid, accessKey, ownViewer);
  const enrollmentChoices = enrollments.length ? enrollments : model.rows.map(row => ({ id: row.enrollment_id, course_id: row.course_id, course_title: row.course_label }));
  const source = readDocumentChainSourceRoute(params);
  const closeSource = () => setParams(clearDocumentChainSourceParams(params), { replace: true });
  const reviewing = params.get('documentChainFocus') === 'admission_settings';
  if (!(ownViewer ? authLoading : p.loading) && !allowed) return null;
  return <section aria-labelledby="student-document-chain-title" className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5" data-testid="student-document-chain">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="student-document-chain-title" className="font-display text-lg font-semibold">{ownViewer ? 'Мои документы по обучению' : 'Документы по обучению'}</h3><p className="mt-1 text-sm text-muted-foreground">{ownViewer ? 'Ваши приказы, документы об обучении и персональные записи.' : 'Приказы, выданные документы и записи выбранного ученика.'}</p></div><Button variant="outline" size="sm" className="min-h-10 rounded-xl" disabled={model.loading} onClick={model.refresh}><RefreshCw className="mr-2 h-4 w-4" />Обновить</Button></div>
    <label className="block space-y-1.5 text-sm"><span>Обучение</span><select aria-label="Обучение для документов" value={selection} disabled={enrollmentsLoading} className="min-h-10 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm" onChange={event => selectEnrollment(event.target.value)}><option value="all">{ownViewer ? 'Все мои обучения' : 'Все обучения ученика'}</option>{selection !== 'all' && !enrollmentChoices.some(row => row.id === selection) && <option value={selection}>Выбранное обучение</option>}{enrollmentChoices.map(row => <option key={row.id} value={row.id}>{row.course_title}</option>)}</select></label>
    {enrollmentsError && <p role="status" className="text-sm text-muted-foreground">Список обучений не подтверждён. Выбранная область сохранена.</p>}
    {invalid && <p role="alert" className="text-sm text-destructive">Не удалось определить обучение или группу. Выберите обучение из списка.</p>}
    {((ownViewer ? authLoading : p.loading) || model.loading) && <div role="status" className="flex items-center gap-2 py-5 text-sm"><SigmaSpinner size="sm" />Проверяем документы ученика…</div>}
    {model.error && <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-3"><p className="text-sm">{model.error}</p><Button variant="outline" size="sm" className="min-h-10 rounded-xl" onClick={model.refresh}>Повторить загрузку</Button></div>}
    {model.data?.availability === 'unavailable' && <p role="alert" className="text-sm text-muted-foreground">{model.data.why || 'Документы пока не подтверждены.'}</p>}
    {!model.loading && !model.error && model.data?.availability === 'available' && model.rows.length === 0 && <p className="text-sm text-muted-foreground">Для этого ученика пока нет подтверждённых зачислений с текущими правами.</p>}
    {!model.loading && <DocumentChainRows individualOrders={!ownViewer && allowed && p.can('documents.write') ? { organizationId, enabled: true, accessKey, onChanged: model.refresh } : undefined} rows={model.rows} ownViewer={ownViewer} canOpenJournals={model.data?.capabilities.can_open_journals === true} onAction={(row, action) => { if (ownViewer) { if (action.kind === 'open_source') navigate(documentChainSourcePath(params, row, action.source, '/student')); } else navigate(documentChainActionPath(params, row, action)); }}
      onConfigureAdmission={ownViewer ? undefined : row => navigate(documentChainActionPath(params, row, { kind: 'review_admission_draft', enrollment_id: row.enrollment_id, group_id: row.group_id }))}
      onOpenJournals={row => { if (ownViewer) { const next = clearDocumentChainSourceParams(params); next.set('ownJournalEnrollmentId', row.enrollment_id); if (row.group_id) next.set('ownJournalGroupId', row.group_id); else next.delete('ownJournalGroupId'); next.delete('ownJournal'); setParams(next); document.getElementById('own-education-journals')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; } navigate(educationJournalWorkspacePath({ kind: 'student', student_user_id: studentUserId, enrollment_id: row.enrollment_id, group_id: row.group_id }, null, { kind: 'student', studentId: studentUserId, enrollmentId: row.enrollment_id, groupId: params.get('returnToGroupId'), studentGroupId: row.group_id, department: params.get('returnDepartment'), participantSearch: params.get('returnParticipantSearch') })); }}
      details={row => !ownViewer && reviewing && enrollmentId === row.enrollment_id ? <div className="space-y-2 border-t border-border pt-3"><div className="flex justify-end"><Button variant="ghost" size="sm" className="min-h-10 rounded-xl" onClick={() => { const next = new URLSearchParams(params); next.delete('documentChainFocus'); setParams(next, { replace: true }); }}>Закрыть настройки</Button></div><AdmissionDocumentSettingsPanel organizationId={organizationId} scope={{ kind: 'enrollment', enrollmentId: row.enrollment_id, groupId: row.group_id }} onChanged={model.refresh} /></div> : null} />}
    {model.data?.kind === 'list' && model.data.next_after_enrollment_id && <Button variant="outline" className="min-h-10 rounded-xl" disabled={model.loadingMore} onClick={() => void model.loadMore()}>{model.loadingMore ? 'Загрузка…' : 'Ещё обучения'}</Button>}
    <DocumentChainSourceDialog organizationId={organizationId} target={target} query={source.state === 'ready' ? source.query : null} invalid={source.state === 'invalid'} enabled={allowed && !invalid} accessKey={accessKey} ownViewer={ownViewer} onClose={closeSource} />
  </section>;
}
