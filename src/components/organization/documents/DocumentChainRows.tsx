import type { ReactNode } from 'react';
import { ClipboardList, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { chainActionLabel, chainSlotLabels, chainStateLabels } from '@/lib/documentChain/presentation';
import type { ChainAction, ChainRow, ChainSlot } from '@/lib/documentChain/contract';

interface Props { rows: ChainRow[]; showStudent?: boolean; ownViewer?: boolean; canOpenJournals: boolean; onAction: (row: ChainRow, action: ChainAction) => void; onOpenJournals: (row: ChainRow) => void; onConfigureAdmission?: (row: ChainRow) => void; details?: (row: ChainRow) => ReactNode }
const displayDate = (value: string) => `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`;
function primaryAction(slot: ChainSlot): ChainAction | null {
  if (slot.next_action && (slot.next_action.kind === 'open_source' ? slot.capabilities.can_open : slot.capabilities.can_continue)) return slot.next_action;
  return slot.source && slot.capabilities.can_open ? { kind: 'open_source', source: slot.source } : null;
}
/** The same three source-bound slots are used in the student, group and organization. */
export function DocumentChainRows({ rows, showStudent = false, ownViewer = false, canOpenJournals, onAction, onOpenJournals, onConfigureAdmission, details }: Props) {
  return <>{rows.map(row => <div key={row.enrollment_id} className="min-w-0 space-y-3 rounded-xl border border-border p-3 sm:p-4">
    <div>{showStudent && <p className="font-medium">{row.student_label}</p>}<h4 className="break-words font-medium">{row.course_label}</h4>{row.group_label && <p className="text-xs text-muted-foreground">{row.group_label}</p>}{row.association_why && <p className="mt-1 text-sm text-muted-foreground">{row.association_why}</p>}</div>
    {[row.admission_order, row.completion_order, row.education_document].map(slot => {
      const candidate = primaryAction(slot);
      const action = ownViewer && candidate?.kind !== 'open_source' ? null : candidate;
      return <div key={slot.kind} className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl bg-muted/30 p-3">
        <div className="min-w-0 flex-1 basis-52"><p className="flex items-start gap-2 text-sm font-medium"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{chainSlotLabels[slot.kind]}</p><Badge variant="secondary" className="mt-2 max-w-full whitespace-normal text-left">{chainStateLabels[slot.state]}</Badge>{(slot.number || slot.document_date) && <p className="mt-1 break-words text-xs text-muted-foreground">{slot.number ? `№ ${slot.number}` : ''}{slot.number && slot.document_date ? ' · ' : ''}{slot.document_date ? displayDate(slot.document_date) : ''}</p>}{slot.why && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{slot.why}</p>}</div>
        {action && <Button variant="outline" size="sm" className="h-auto min-h-10 max-w-full whitespace-normal rounded-xl text-left" onClick={() => onAction(row, action)}>{chainActionLabel(action, slot)}</Button>}
      </div>;
    })}
    <div className="flex flex-wrap gap-2">{!ownViewer && onConfigureAdmission && !['registered', 'legacy_unverified', 'annulled', 'unavailable', 'not_applicable'].includes(row.admission_order.state) && <Button variant="outline" size="sm" className="h-auto min-h-10 max-w-full whitespace-normal rounded-xl text-left" onClick={() => onConfigureAdmission(row)}>Настройки зачисления</Button>}
    {row.journals_available && canOpenJournals && <Button variant="outline" size="sm" className="h-auto min-h-10 max-w-full whitespace-normal rounded-xl text-left" onClick={() => onOpenJournals(row)}><ClipboardList className="mr-2 h-4 w-4 shrink-0" />{ownViewer ? 'Мои журналы и выписка' : 'Журналы ученика и выписка'}</Button>}</div>
    {details?.(row)}
  </div>)}</>;
}
