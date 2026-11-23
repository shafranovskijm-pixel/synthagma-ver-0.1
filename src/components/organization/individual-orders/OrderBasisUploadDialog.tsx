import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OrgDocumentWorkflowPanel } from '@/components/organization/documents/OrgDocumentWorkflowPanel';
import { OrgDocumentVersionsDialog } from '@/components/organization/OrgDocumentVersionsDialog';
import { individualOrderScopeCurrent, normalizeIndividualOrderError, type IndividualOrderScope } from '@/lib/individualEducationOrders/client';
import { OrderBasisCatalogueDocument, OrderBasisInputError, orderBasisTransport, prepareOrderBasisUpload, readSavedOrderBasis, type SavedOrderBasis } from '@/lib/individualEducationOrders/basisUpload';

const control = 'min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm';
const button = 'h-auto min-h-11 max-w-full whitespace-normal rounded-xl';
interface Props { open: boolean; onOpenChange(open: boolean): void; scope: IndividualOrderScope; canWrite: boolean; roleLabel: string;
  documentId?: string | null; onReturn(saved: SavedOrderBasis): Promise<void> }
export function OrderBasisUploadDialog(props: Props) {
  const owner = [props.scope.actorId, props.scope.accessRevision, props.scope.organizationId, props.scope.enrollmentId, props.scope.subjectUserId, props.scope.courseId].join(':');
  const active = useRef(props); active.current = props;
  const mounted = useRef(true), epoch = useRef(0), flight = useRef(false);
  const operation = useRef<Awaited<ReturnType<typeof prepareOrderBasisUpload>> | null>(null);
  const [name, setName] = useState(''), [file, setFile] = useState<File | null>(null), [issueDate, setIssueDate] = useState(''), [expiresAt, setExpiresAt] = useState(''), [responsible, setResponsible] = useState('');
  const [saved, setSaved] = useState<SavedOrderBasis | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [versions, setVersions] = useState(false), [catalogue, setCatalogue] = useState(false), [dataOwner, setDataOwner] = useState(owner);
  const current = () => mounted.current && active.current.open && active.current.canWrite && active.current.scope === props.scope && individualOrderScopeCurrent(props.scope);
  const transport = useMemo(() => orderBasisTransport(props.scope, current), [props.scope]);
  const live = (ticket: number) => ticket === epoch.current && current();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++epoch.current; }; }, []);
  useEffect(() => { ++epoch.current; operation.current = null; setDataOwner(owner); setSaved(null); setName(''); setFile(null); setIssueDate(''); setExpiresAt(''); setResponsible(''); setVersions(false); setCatalogue(false); setError(''); flight.current = false; setBusy(false); }, [owner]);
  const fail = (cause: unknown) => cause instanceof OrderBasisInputError ? cause.message : normalizeIndividualOrderError(cause).message;
  const refresh = async (documentId?: string) => {
    if (!current() || flight.current) return;
    const id = documentId || saved?.id || props.documentId; if (!id) return;
    const ticket = ++epoch.current; flight.current = true; setBusy(true); setError(''); setCatalogue(false);
    try { const value = await readSavedOrderBasis(props.scope, transport, id); if (live(ticket)) setSaved(value); }
    catch (cause) { if (live(ticket)) { if (cause instanceof OrderBasisCatalogueDocument) setCatalogue(true); else setError(fail(cause)); } }
    finally { if (live(ticket)) { flight.current = false; setBusy(false); } }
  };
  useEffect(() => { if (!props.open) { ++epoch.current; flight.current = false; setBusy(false); return; } if (props.documentId && !operation.current) { setSaved(null); void refresh(props.documentId); } }, [props.open, props.documentId, props.scope]);
  const save = async () => {
    if (!current() || dataOwner !== owner || flight.current || saved) return;
    const ticket = ++epoch.current; flight.current = true; setBusy(true); setError('');
    try {
      const prepared = operation.current ?? await prepareOrderBasisUpload(props.scope, transport, { name, file: file!, issueDate, expiresAt, responsible });
      if (!live(ticket)) return; operation.current = prepared;
      const value = await prepared.run(); if (live(ticket)) setSaved(value);
    } catch (cause) { if (live(ticket)) setError(fail(cause)); }
    finally { if (live(ticket)) { flight.current = false; setBusy(false); } }
  };
  const back = async () => {
    if (!saved || !current() || flight.current) return;
    const ticket = ++epoch.current; flight.current = true; setBusy(true); setError('');
    try { const fresh = await readSavedOrderBasis(props.scope, transport, saved.id); if (!live(ticket)) return; await props.onReturn(fresh); if (live(ticket)) { operation.current = null; setSaved(null); setName(''); setFile(null); setIssueDate(''); setExpiresAt(''); setResponsible(''); props.onOpenChange(false); } }
    catch (cause) { if (live(ticket)) setError(fail(cause)); }
    finally { if (live(ticket)) { flight.current = false; setBusy(false); } }
  };
  const available = props.open && props.canWrite && dataOwner === owner && individualOrderScopeCurrent(props.scope);
  return <><Dialog open={props.open && !versions} onOpenChange={props.onOpenChange}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-2xl">
    <DialogHeader><DialogTitle>Основание приказа</DialogTitle><DialogDescription>{props.roleLabel}. Отдельный документ организации с сохранением исходного файла и истории версий. Загрузка не означает утверждение или подписание.</DialogDescription></DialogHeader>
    {!available ? <p role="alert" className="text-sm text-destructive">Текущий доступ к загрузке основания не подтверждён.</p> : <div className="space-y-4">
      {!saved && !props.documentId && <fieldset disabled={busy || !!operation.current} className="min-w-0 space-y-3 rounded-xl border p-3">
        <label className="block space-y-1 text-sm"><span>Название документа</span><input className={control} maxLength={200} placeholder={props.roleLabel + ' · ФИО или назначение'} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block space-y-1 text-sm"><span>Исходный PDF до 20 МБ</span><input className={control} type="file" accept=".pdf,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="block space-y-1 text-sm"><span>Дата документа · при наличии</span><input className={control} type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></label><label className="block space-y-1 text-sm"><span>Действует до · если срок ограничен</span><input className={control} type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></label></div>
        <label className="block space-y-1 text-sm"><span>Ответственный · для списка документов</span><input className={control} maxLength={200} value={responsible} onChange={e => setResponsible(e.target.value)} /></label>
      </fieldset>}
      {!saved && !props.documentId && <><Button className={button} disabled={busy || !operation.current && (!name.trim() || !file)} onClick={() => void save()}>{busy ? 'Сохраняем исходный файл…' : operation.current ? 'Повторить то же сохранение' : 'Сохранить новое основание'}</Button>{operation.current && <p className="text-xs text-muted-foreground">Файл и данные этого запроса зафиксированы. Повтор не создаёт новый документ. Прежние документы не заменяются.</p>}</>}
      {saved && <div className="space-y-3 rounded-xl border p-3"><p className="break-words text-sm font-medium">{saved.name}</p><p className="text-sm text-muted-foreground">Сначала выберите действующих участников и пройдите внутреннее рассмотрение этой версии. Основание приказа станет доступно после явного утверждения.</p>
        <Button className={button} variant="outline" disabled={busy} onClick={() => setVersions(true)}>Файлы и версии основания</Button>
        <OrgDocumentWorkflowPanel key={saved.id + ':' + saved.current_version_id} transport={transport} sourceOpenMode="download" sourceDownloadAssertCurrent={transport.assertCurrent} organizationId={props.scope.organizationId} documentId={saved.id} currentVersionId={saved.current_version_id} />
        <Button className={button} variant="outline" disabled={busy} onClick={() => void back()}>Вернуться и обновить выбор основания</Button>
      </div>}
      {props.documentId && !saved && <><p className="text-sm text-muted-foreground">{catalogue ? 'Этот документ относится к другому разделу. Его файл и прежние версии сохранены; проверка выполняется в документах организации.' : 'Здесь открываются самостоятельные основания. Документы из других разделов проверяются в документах организации.'}</p><a className="inline-flex min-h-11 items-center text-sm underline" href="/organization?tab=documents">Открыть документы организации</a>{!catalogue && <Button className={button} variant="outline" disabled={busy} onClick={() => void refresh()}>Обновить документ</Button>}</>}
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </DialogContent></Dialog>
  {saved && versions && available && <OrgDocumentVersionsDialog open onOpenChange={open => { setVersions(open); if (!open) void refresh(); }} documentId={saved.id} documentName={saved.name} organizationId={props.scope.organizationId} canWrite={props.canWrite} transport={transport} sourceOpenMode="download" sourceDownloadAssertCurrent={transport.assertCurrent} onRestored={() => void refresh()} />}
  </>;
}
