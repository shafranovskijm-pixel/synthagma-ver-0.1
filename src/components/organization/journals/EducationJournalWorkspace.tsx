import { useId, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Download, RefreshCw, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { useAuth } from '@/hooks/useAuth';
import { useEducationJournalWorkspace } from '@/hooks/useEducationJournalWorkspace';
import { journalLabels, type EducationJournalScope, type EducationJournalType } from '@/lib/educationJournalWorkspace/contract';
import { educationJournalReturnPath, educationJournalWorkspacePath, type JournalOrigin } from '@/lib/educationJournalWorkspace/navigation';
import { AdmissionDocumentSettingsPanel } from '@/components/organization/documents/AdmissionDocumentSettingsPanel';
import { DocumentChainSourceDialog } from '@/components/organization/documents/DocumentChainSourceDialog';
import { clearDocumentChainSourceParams, documentChainJournalSourcePath, readDocumentChainSourceRoute } from '@/lib/documentChain/navigation';

interface OwnViewer { onSelect: (type: EducationJournalType) => void; onBack: () => void }
interface Props { organizationId: string; scope: EducationJournalScope; journalType: EducationJournalType | null; origin: JournalOrigin; ownViewer?: OwnViewer }
export function EducationJournalWorkspace({ organizationId, scope, journalType, origin, ownViewer }: Props) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectorId = useId();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const p = useStaffPermissions();
  const { user, loading: authLoading } = useAuth();
  const enabled = ownViewer ? !authLoading && scope.kind === 'student' && user?.id === scope.student_user_id
    : !p.loading && !p.error && p.can('journals.read') && p.can('students.read') && p.can('documents.read');
  const access = JSON.stringify([user?.id, p.organizationId, p.orgRole, p.adminRole, p.isOrgOwner, enabled]);
  const model = useEducationJournalWorkspace(organizationId, scope, journalType, enabled, access);
  const sourceRoute = readDocumentChainSourceRoute(params);
  const closeSource = () => setParams(clearDocumentChainSourceParams(params), { replace: true });
  const summary = model.summary;
  const selected = summary?.journals.find(row => row.journal_type === journalType);
  const backLabel = ownViewer ? 'К моим журналам' : origin.kind === 'student' ? 'К документам ученика' : origin.kind === 'group' ? 'К группе' : 'К журналам';
  const context = summary?.context;
  const onBack = () => ownViewer ? ownViewer.onBack() : navigate(educationJournalReturnPath(origin));
  const selectJournal = (type: EducationJournalType) => ownViewer ? ownViewer.onSelect(type) : navigate(educationJournalWorkspacePath(scope, type, origin));
  return <div className="space-y-5" data-testid="education-journal-workspace">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-2">{(!ownViewer || journalType) && <Button variant="ghost" className="h-auto min-h-9 whitespace-normal rounded-xl text-left" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4 shrink-0" />{backLabel}</Button>}
        <h2 className="font-display text-2xl font-semibold">{journalType ? journalLabels[journalType] : 'Журналы и приказы'}</h2>
        <p className="text-sm text-muted-foreground">Фактические записи из обучения и документооборота. Сведения разных источников не подменяют друг друга.</p>
      </div>
      <div className="flex max-w-full flex-wrap gap-2">{enabled && <Button variant="outline" className="h-auto min-h-10 max-w-full whitespace-normal rounded-xl text-left" disabled={model.loading || model.exportBusy} onClick={model.refresh}><RefreshCw className="mr-2 h-4 w-4 shrink-0" />Обновить записи</Button>}{journalType && <Button variant="outline" className="h-auto min-h-10 max-w-full whitespace-normal rounded-xl text-left" disabled={model.loading || !!model.error || model.exportBusy || selected?.state !== 'available' || !selected.exportable || !summary?.capabilities.can_export} onClick={() => void model.exportExtract()}><Download className="mr-2 h-4 w-4 shrink-0" />{model.exportBusy ? 'Подготовка выписки…' : 'Скачать выписку HTML'}</Button>}</div>
    </div>
    {context && <div className="rounded-2xl border border-border bg-card p-4" data-testid="journal-scope-banner"><p className="flex items-center gap-2 font-medium">{scope.kind === 'student' ? <UserRound className="h-4 w-4 shrink-0" /> : <Users className="h-4 w-4 shrink-0" />}{context.student?.label || context.group?.label || context.organization.label}</p><p className="mt-1 break-words text-sm text-muted-foreground">{context.enrollment?.course_label || 'Все обучения'}{context.group ? ` · ${context.group.label}` : ''} · сохранённые сведения</p><p className="mt-1 text-xs text-muted-foreground">Новые завершения уроков сохраняются в хронологии; прежние отметки показывают текущее состояние. Попытки тестов и решения об аттестации — отдельно.</p>{context.group && <p className="mt-1 text-xs text-muted-foreground">Цифровая активность без исторической привязки к группе отбирается по её текущему составу и помечена в источнике.</p>}</div>}
    {!enabled && !(ownViewer ? authLoading : p.loading) && <div role="alert" className="rounded-xl border border-border p-5"><p>Доступ к журналам не подтверждён. Обратитесь к администратору центра.</p></div>}
    {((ownViewer ? authLoading : p.loading) || model.loading) && <div role="status" className="flex items-center justify-center gap-3 py-12"><SigmaSpinner /><span>Загрузка записей…</span></div>}
    {model.error && <div role="alert" className="rounded-2xl border border-destructive/30 p-5"><p>{model.error}</p><Button variant="outline" className="mt-3 rounded-xl" onClick={model.refresh}><RefreshCw className="mr-2 h-4 w-4" />Повторить загрузку</Button></div>}
    {model.exportError && <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">{model.exportError}</p>}
    {summary && !model.loading && !model.error && <>
      {!journalType && !ownViewer && scope.kind === 'organization' && p.can('settings.read') && <div><Button variant="outline" className="h-auto min-h-10 whitespace-normal rounded-xl text-left" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(value => !value)}>Настройки приказов</Button>{settingsOpen && <div className="mt-3"><AdmissionDocumentSettingsPanel key={organizationId} organizationId={organizationId} scope={{ kind: 'organization' }} onChanged={model.refresh} /></div>}</div>}
      {journalType ? <div className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="journal-selector">
        <div className="space-y-2"><label htmlFor={selectorId} className="text-sm font-medium">Журнал</label><select id={selectorId} className="min-h-10 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm" value={journalType} onChange={event => selectJournal(event.target.value as EducationJournalType)}>
          {!selected && <option value={journalType}>{journalLabels[journalType]} · статус не подтверждён</option>}
          {summary.journals.map(journal => <option key={journal.journal_type} value={journal.journal_type}>{journal.title} · {journal.state === 'available' ? `записей: ${journal.record_count}` : journal.state === 'not_applicable' ? 'не применяется' : 'недоступно'}</option>)}
        </select></div>
        {selected ? <div className="space-y-1 text-xs text-muted-foreground"><p>{selected.source_label}</p><p>{selected.state === 'available' ? `Записей: ${selected.record_count}` : selected.state === 'not_applicable' ? 'Для этой области не применяется' : 'Источник пока недоступен'}</p>{selected.reason && <p role="status">{selected.reason}</p>}</div> : <p role="status" className="text-xs text-muted-foreground">Статус этого журнала пока не подтверждён в выбранной области.</p>}
      </div> : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="journal-overview">
        {summary.journals.map(journal => <div key={journal.journal_type} className={`flex min-w-0 flex-col rounded-2xl border bg-card p-4 ${journalType === journal.journal_type ? 'border-primary/50' : 'border-border'}`}>
          <div className="flex items-start justify-between gap-2"><h3 className="min-w-0 break-words font-medium">{journal.title}</h3><Badge variant="secondary" className="shrink-0">{journal.state === 'available' ? journal.record_count : '—'}</Badge></div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{journal.source_label}</p>
          <p className="mt-2 text-xs text-muted-foreground">{journal.state === 'available' ? journal.automatic ? 'Записи обновляются автоматически' : 'Подтверждённые ручные записи' : journal.reason || (journal.state === 'not_applicable' ? 'Для этой области не применяется' : 'Источник пока недоступен')}</p>
          {journal.state === 'available' && journal.reason && <p className="mt-2 text-xs text-muted-foreground">{journal.reason}</p>}
          <Button variant="outline" size="sm" className="mt-3 h-auto min-h-9 max-w-full self-start whitespace-normal rounded-xl text-left" disabled={journal.state !== 'available'} onClick={() => selectJournal(journal.journal_type)}><ClipboardList className="mr-2 h-4 w-4 shrink-0" />Открыть записи</Button>
        </div>)}
      </div>}
      {model.page && <div className="rounded-2xl border border-border bg-card">
        {model.page.rows.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Дата события</TableHead>{scope.kind !== 'student' && <TableHead>Ученик</TableHead>}<TableHead>Обучение</TableHead><TableHead>Запись</TableHead><TableHead>Результат</TableHead><TableHead>Источник</TableHead></TableRow></TableHeader><TableBody>{model.page.rows.map(row => <TableRow key={row.id}><TableCell className="whitespace-nowrap">{row.event_at ? new Date(row.event_at).toLocaleString('ru-RU') : 'Не указана'}</TableCell>{scope.kind !== 'student' && <TableCell>{row.student_user_id ? <button type="button" className="text-left text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" onClick={() => navigate('/organization?' + new URLSearchParams({ tab: 'student-details', studentId: row.student_user_id!, studentSection: 'documents', ...(row.enrollment_id ? { studentJournalEnrollmentId: row.enrollment_id } : {}), ...(scope.kind === 'group' ? { returnToGroupId: scope.group_id, studentJournalGroupId: scope.group_id, ...(origin.department ? { returnDepartment: origin.department } : {}), ...(origin.participantSearch ? { returnParticipantSearch: origin.participantSearch } : {}) } : {}) }).toString())}>{row.student_label}</button> : row.student_label}</TableCell>}<TableCell>{row.course_label || 'Не указано'}{row.group_label && <p className="text-xs text-muted-foreground">{row.group_label}</p>}</TableCell><TableCell><p>{row.title}</p>{!ownViewer && ['admission_orders', 'education_documents', 'document_registration'].includes(row.journal_type) && <Button size="sm" variant="outline" className="mt-2 h-auto min-h-9 whitespace-normal rounded-xl text-left" onClick={() => navigate(documentChainJournalSourcePath(params, { kind: 'journal_source', journal_type: row.journal_type, row_id: row.id, source_id: row.source_id, source_revision: row.source_revision, enrollment_id: row.enrollment_id, group_id: row.group_id }))}>Открыть документ</Button>}</TableCell><TableCell>{row.result || 'Не указан'}</TableCell><TableCell><span className="text-sm">{row.source_label}</span>{row.source_revision !== null && <p className="text-xs text-muted-foreground">Версия {row.source_revision}</p>}</TableCell></TableRow>)}</TableBody></Table></div> : <p role="status" className="p-6 text-sm text-muted-foreground">Записей по выбранному обучению пока нет.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"><p className="text-xs text-muted-foreground">Загружено {model.page.rows.length} из {model.page.total_count}. Выписка включает всю выборку.</p>{model.page.next_cursor && <Button variant="outline" className="rounded-xl" onClick={() => void model.loadMore()}>Загрузить ещё</Button>}</div>
      </div>}
    </>}
    {!ownViewer && <DocumentChainSourceDialog organizationId={organizationId} target={scope} query={sourceRoute.state === 'ready' ? sourceRoute.query : null} invalid={sourceRoute.state === 'invalid'} enabled={enabled} accessKey={access} onClose={closeSource} />}
  </div>;
}
