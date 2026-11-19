import { useAuth } from '@/hooks/useAuth';
import { useUrlQueryState } from '@/hooks/useUrlNavigation';
import { Button } from '@/components/ui/button';
import { EducationJournalWorkspace } from '@/components/organization/journals/EducationJournalWorkspace';
import { journalTypeSchema, journalUuid, type EducationJournalType } from '@/lib/educationJournalWorkspace/contract';

/** Own-only projection: no staff route, configuration controls or peer roster. */
export function StudentEducationJournals({ organizationId, userId }: { organizationId: string; userId: string }) {
  const { user, loading } = useAuth();
  const [selected, setSelected] = useUrlQueryState<string>('ownJournal', 'all');
  if (loading || user?.id !== userId || !journalUuid.safeParse(organizationId).success || !journalUuid.safeParse(userId).success) return null;
  const parsed = selected === 'all' ? null : journalTypeSchema.safeParse(selected);
  if (parsed && !parsed.success) return <section role="alert" className="rounded-2xl border border-border bg-card p-4"><p>Не удалось определить выбранный журнал.</p><Button variant="outline" className="mt-3 rounded-xl" onClick={() => setSelected('all')}>К моим журналам</Button></section>;
  const journalType = parsed?.success ? parsed.data : null;
  return <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Мои журналы и приказы">
    <EducationJournalWorkspace organizationId={organizationId} scope={{ kind: 'student', student_user_id: userId, enrollment_id: null, group_id: null }} journalType={journalType} origin={{ kind: 'student', studentId: userId }} ownViewer={{ onSelect: (type: EducationJournalType) => setSelected(type), onBack: () => setSelected('all') }} />
  </section>;
}
