import { useAuth } from '@/hooks/useAuth';
import { useUrlQueryState } from '@/hooks/useUrlNavigation';
import { Button } from '@/components/ui/button';
import { EducationJournalWorkspace } from '@/components/organization/journals/EducationJournalWorkspace';
import { journalTypeSchema, journalUuid, type EducationJournalType } from '@/lib/educationJournalWorkspace/contract';
import { useSearchParams } from 'react-router-dom';

/** Own-only projection: no staff route, configuration controls or peer roster. */
export function StudentEducationJournals({ organizationId, userId }: { organizationId: string; userId: string }) {
  const { user, loading } = useAuth();
  const [selected, setSelected] = useUrlQueryState<string>('ownJournal', 'all');
  const [params, setParams] = useSearchParams();
  if (loading || user?.id !== userId || !journalUuid.safeParse(organizationId).success || !journalUuid.safeParse(userId).success) return null;
  const enrollmentId = params.get('ownJournalEnrollmentId'), groupId = params.get('ownJournalGroupId');
  const clearScope = () => { const next = new URLSearchParams(params); next.delete('ownJournalEnrollmentId'); next.delete('ownJournalGroupId'); next.delete('ownJournal'); setParams(next); };
  if (enrollmentId !== null && !journalUuid.safeParse(enrollmentId).success || groupId !== null && (!journalUuid.safeParse(groupId).success || enrollmentId === null)) return <section role="alert" className="rounded-2xl border border-border bg-card p-4"><p>Не удалось определить обучение или группу журнала.</p><Button variant="outline" className="mt-3 rounded-xl" onClick={clearScope}>Все мои обучения</Button></section>;
  const parsed = selected === 'all' ? null : journalTypeSchema.safeParse(selected);
  if (parsed && !parsed.success) return <section role="alert" className="rounded-2xl border border-border bg-card p-4"><p>Не удалось определить выбранный журнал.</p><Button variant="outline" className="mt-3 rounded-xl" onClick={() => setSelected('all')}>К моим журналам</Button></section>;
  const journalType = parsed?.success ? parsed.data : null;
  return <section id="own-education-journals" tabIndex={-1} className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Мои журналы и приказы">
    {enrollmentId && <Button variant="outline" size="sm" className="mb-3 min-h-10 rounded-xl" onClick={clearScope}>Все мои обучения</Button>}
    <EducationJournalWorkspace organizationId={organizationId} scope={{ kind: 'student', student_user_id: userId, enrollment_id: enrollmentId, group_id: groupId }} journalType={journalType} origin={{ kind: 'student', studentId: userId }} ownViewer={{ onSelect: (type: EducationJournalType) => setSelected(type), onBack: () => setSelected('all') }} />
  </section>;
}
