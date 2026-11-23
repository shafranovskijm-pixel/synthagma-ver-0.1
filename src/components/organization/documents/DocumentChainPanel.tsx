import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SigmaSpinner } from '@/components/ui/SigmaSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { useDocumentChain } from '@/hooks/useDocumentChain';
import { captureOfflineActor } from '@/utils/courseCache';
import type { ChainScope } from '@/lib/documentChain/contract';
import { clearDocumentChainSourceParams, documentChainActionPath, readDocumentChainSourceRoute } from '@/lib/documentChain/navigation';
import { educationJournalWorkspacePath } from '@/lib/educationJournalWorkspace/navigation';
import { DocumentChainRows } from './DocumentChainRows';
import { DocumentChainSourceDialog } from './DocumentChainSourceDialog';

interface Props { organizationId: string; scope: Extract<ChainScope, { kind: 'organization' | 'group' }>; title?: string }
export function DocumentChainPanel({ organizationId, scope, title = 'Документы по обучению' }: Props) {
  const p = useStaffPermissions(), { user } = useAuth(), navigate = useNavigate(), [params, setParams] = useSearchParams();
  const allowed = !p.loading && !p.error && p.can('documents.read') && p.can('students.read');
  const accessKey = JSON.stringify([user?.id, captureOfflineActor(user?.id), p.organizationId, p.orgRole, p.adminRole, p.isOrgOwner, allowed]);
  const model = useDocumentChain(organizationId, scope, allowed, accessKey), source = readDocumentChainSourceRoute(params);
  if (!p.loading && !allowed) return null;
  return <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label={title} data-testid="document-chain-panel">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display text-lg font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">Те же приказы и документы, что в карточке ученика. Проекты и оформленные документы показаны отдельно.</p></div><Button variant="outline" size="sm" className="min-h-10 rounded-xl" disabled={model.loading} onClick={model.refresh}><RefreshCw className="mr-2 h-4 w-4" />Обновить</Button></div>
    {(p.loading || model.loading) && <div role="status" className="flex items-center gap-2 py-5 text-sm"><SigmaSpinner size="sm" />Проверяем документы…</div>}
    {model.error && <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-3"><p className="text-sm">{model.error}</p><Button variant="outline" size="sm" className="min-h-10 rounded-xl" onClick={model.refresh}>Повторить загрузку</Button></div>}
    {model.data?.availability === 'unavailable' && <p role="alert" className="text-sm text-muted-foreground">{model.data.why || 'Документы пока не подтверждены.'}</p>}
    {!model.loading && !model.error && model.data?.availability === 'available' && !model.rows.length && <p className="text-sm text-muted-foreground">В выбранной области пока нет подтверждённых зачислений с текущими правами.</p>}
    {!model.loading && <DocumentChainRows individualOrders={allowed && p.can('documents.write') ? { organizationId, enabled: true, accessKey, onChanged: model.refresh } : undefined} rows={model.rows} showStudent canOpenJournals={model.data?.capabilities.can_open_journals === true} onAction={(row, action) => navigate(documentChainActionPath(params, row, action))}
      onConfigureAdmission={row => navigate(documentChainActionPath(params, row, { kind: 'review_admission_draft', enrollment_id: row.enrollment_id, group_id: row.group_id }))}
      onOpenJournals={row => navigate(educationJournalWorkspacePath({ kind: 'student', student_user_id: row.student_user_id, enrollment_id: row.enrollment_id, group_id: row.group_id }, null, scope.kind === 'group' ? { kind: 'group', groupId: scope.group_id, department: params.get('department'), participantSearch: params.get('participantSearch') } : { kind: 'organization' }))} />}
    {model.data?.kind === 'list' && model.data.next_after_enrollment_id && <Button variant="outline" className="min-h-10 rounded-xl" disabled={model.loadingMore} onClick={() => void model.loadMore()}>{model.loadingMore ? 'Загрузка…' : 'Ещё обучения'}</Button>}
    <DocumentChainSourceDialog organizationId={organizationId} target={scope} query={source.state === 'ready' ? source.query : null} invalid={source.state === 'invalid'} enabled={allowed} accessKey={accessKey} onClose={() => setParams(clearDocumentChainSourceParams(params), { replace: true })} />
  </section>;
}
