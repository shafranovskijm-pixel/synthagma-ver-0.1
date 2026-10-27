import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { issuanceUtcDateIso } from '@/lib/educationIssuance/date';
import { useEducationIssuanceScope } from '@/hooks/useEducationIssuance';
import { artifactFinalRef, EducationIssuanceError, issuanceScopeCurrent, normalizeIssuanceError, prepareEducationIssuanceMutation, readEducationIssuance, type EducationIssuanceScope, type PreparedIssuanceMutation } from '@/lib/educationIssuance/client';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import { IssuanceArtifactPreparation, IssuancePreparationRecovery, type IssuancePlanDraft } from './ArtifactPreparation';
import { downloadIssuedPdf } from '@/lib/educationIssuance/artifactDownload';
import { eventLabels, handoverStatus, proofStatus, recordStatus } from '@/lib/educationIssuance/presentation';
import type { ChangePreview, IssuanceChange, IssuanceChangeIntent, IssuancePreparation, IssuanceEvent, IssuanceHandover, IssuanceRecord, IssuanceSource } from '@/lib/educationIssuance/types';
import { IssuanceSourcePicker } from './SourcePicker';
import { IssuanceProvenanceDetails } from './IssuanceProvenanceDetails';
import { RecordedProgramFileDownload } from './RecordedProgramFileDownload';

interface Props { organizationId: string; groupId?: string | null; recordId: string | null; onClose: () => void; onChanged: () => void; onOpenRecord?: (id: string) => void }
type Mode = 'view' | IssuanceChange['action'];
export function EducationIssuanceRecordDialog(props: Props) {
  const capture = useEducationIssuanceScope(props.organizationId, props.groupId, props.recordId ?? '');
  const [scope, setScope] = useState<EducationIssuanceScope | null>(null), [record, setRecord] = useState<IssuanceRecord | null>(null);
  const [history, setHistory] = useState<IssuanceEvent[]>([]), [ceiling, setCeiling] = useState<number | null>(null), [before, setBefore] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('view'), [notes, setNotes] = useState(''), [reason, setReason] = useState(''), [provision, setProvision] = useState('');
  const [source, setSource] = useState<IssuanceSource | null>(null), [authorization, setAuthorization] = useState<IssuanceSource | null>(null);
  const [handoverKind, setHandoverKind] = useState<IssuanceHandover['kind']>('personal'), [occurredAt, setOccurredAt] = useState('');
  const [representative, setRepresentative] = useState(''), [carrier, setCarrier] = useState(''), [tracking, setTracking] = useState(''), [address, setAddress] = useState(''), [eventId, setEventId] = useState('');
  const [duplicateKind, setDuplicateKind] = useState<'lost' | 'damaged' | 'correction_replacement'>('lost'), [issueDate, setIssueDate] = useState(issuanceUtcDateIso()), [series, setSeries] = useState('');
  const [preview, setPreview] = useState<ChangePreview | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [preparation,setPreparation]=useState<IssuancePreparation|null>(null),[artifactBusy,setArtifactBusy]=useState(false),[correctionCompared,setCorrectionCompared]=useState(false);
  const correctionKey=JSON.stringify([props.recordId,preview?.preview_hash,preparation?.id,preparation?.items.map(item=>[item.id,item.input_revision,item.artifact?.source.version_id,item.artifact?.output_review])]);
  useEffect(()=>setCorrectionCompared(false),[correctionKey]);
  const epoch = useRef(0), flight = useRef(false), operation = useRef<PreparedIssuanceMutation | null>(null);
  const load = async (captured: EducationIssuanceScope, id: string) => {
    const run = epoch.current; setBusy(true); setError(null);
    try {
      const result = await readEducationIssuance(captured, { kind: 'record', record_id: id });
      if (run !== epoch.current || !issuanceScopeCurrent(captured) || result.kind !== 'record') return;
      setRecord(result.record); setNotes(result.record.notes);
      const events = await readEducationIssuance(captured, { kind: 'history', record_id: id, ceiling_revision: result.record.revision, before_revision: null, limit: 100 });
      if (run !== epoch.current || !issuanceScopeCurrent(captured) || events.kind !== 'history') return;
      setHistory(events.items); setCeiling(events.ceiling_revision); setBefore(events.next_before_revision);
    } catch (error) { if (run === epoch.current && issuanceScopeCurrent(captured)) setError(normalizeIssuanceError(error).message); }
    finally { if (run === epoch.current) setBusy(false); }
  };
  useEffect(() => {
    ++epoch.current; flight.current = false; operation.current = null; setRecord(null); setHistory([]); setPreview(null); setBefore(null); setCeiling(null); setError(null); setBusy(false); setMode('view'); setPreparation(null); setArtifactBusy(false); setReason(''); setSource(null); setAuthorization(null); setProvision(''); setOccurredAt(''); setEventId('');
    if (!props.recordId) { setScope(null); return; }
    try { const captured = capture(); setScope(captured); void load(captured, props.recordId); }
    catch (error) { setScope(null); setError(normalizeIssuanceError(error).message); }
  }, [props.recordId, props.organizationId, props.groupId, capture]);
  const current = !!scope && issuanceScopeCurrent(scope), locked = busy || artifactBusy || !!operation.current;
  const visible = current ? record : null;
  const moreHistory = async () => {
    if (!scope || !current || !props.recordId || before === null || busy || flight.current) return;
    const run = epoch.current; flight.current=true; setBusy(true);
    try { const result = await readEducationIssuance(scope, { kind: 'history', record_id: props.recordId, ceiling_revision: ceiling, before_revision: before, limit: 100 }); if (run === epoch.current && issuanceScopeCurrent(scope) && result.kind === 'history') { setHistory(previous => [...previous, ...result.items]); setBefore(result.next_before_revision); } }
    catch (error) { if (run === epoch.current && issuanceScopeCurrent(scope)) setError(normalizeIssuanceError(error).message); }
    finally { if (run === epoch.current) { flight.current=false; setBusy(false); } }
  };
  const buildChange = (): IssuanceChangeIntent => {
    if (!record || mode === 'view') throw new Error('Выберите действие.');
    const common = { record_id: record.official.id, expected_revision: record.revision, expected_state_hash: record.state_hash, reason: reason.trim() };
    if (mode === 'correct_metadata') return { ...common, action: mode, patch: { notes } };
    if (mode === 'void_handover') return { ...common, action: mode, event_id: eventId };
    if (!source) throw new Error('Выберите точную версию подтверждающего документа.');
    const basis = { source, provision: provision.trim(), reason: reason.trim() };
    if (mode === 'annul') return { ...common, action: mode, basis };
    if (mode === 'issue_duplicate') return { ...common, action: mode, issue_date: issueDate, document_series: series.trim() || null, basis: { kind: duplicateKind, basis } };
    if (!occurredAt || !Number.isFinite(new Date(occurredAt).getTime())) throw new Error('Укажите фактическое время события.');
    const occurred_at = new Date(occurredAt).toISOString();
    let handover: IssuanceHandover;
    if (handoverKind === 'personal') handover = { kind: 'personal', occurred_at, recipient: { kind: 'learner' }, evidence: source };
    else if (handoverKind === 'representative') { if (!authorization) throw new Error('Выберите документ полномочий представителя.'); handover = { kind: handoverKind, occurred_at, recipient: { kind: 'representative', full_name: representative.trim() }, authorization, evidence: source }; }
    else if (handoverKind === 'postal_dispatched') handover = { kind: handoverKind, occurred_at, carrier: carrier.trim(), tracking_number: tracking.trim(), recipient: { kind: 'learner', postal_address: address.trim() }, evidence: source };
    else handover = { kind: handoverKind, occurred_at, dispatch_event_id: eventId, evidence: source };
    return { ...common, action: 'record_handover', handover };
  };
  const prepare = async () => {
    if (!scope || !current || flight.current) return; flight.current = true; setBusy(true); setError(null); const run = epoch.current;
    try { const change = buildChange(); const result = await readEducationIssuance(scope, { kind: 'preview_change', change }); if (run === epoch.current && issuanceScopeCurrent(scope) && result.kind === 'preview_change') setPreview(result.preview); }
    catch (error) { if (run === epoch.current && issuanceScopeCurrent(scope)) setError(error instanceof Error && error.name !== 'EducationIssuanceError' ? error.message : normalizeIssuanceError(error).message); }
    finally { if (run === epoch.current) { flight.current = false; setBusy(false); } }
  };
  const apply = async () => {
    if (!scope || !current || flight.current || artifactBusy || !preview?.ready || !operation.current && preview.change.action==='issue_duplicate' && preview.change.basis.kind==='correction_replacement' && !correctionCompared) return; flight.current = true; setBusy(true); setError(null); const run = epoch.current;
    try {
      if(!operation.current){
        let change:IssuanceChange;
        let previewHash=preview.preview_hash;
        if(preview.change.action==='issue_duplicate'){
          if(!preparation)throw new EducationIssuanceError('ARTIFACT_REVIEW_REQUIRED');
          const refreshed=await readEducationIssuance(scope,{kind:'preparation',preparation_id:preparation.id});
          if(run!==epoch.current||!issuanceScopeCurrent(scope))return;
          if(refreshed.kind!=='preparation'||refreshed.preparation.plan.kind!=='duplicate'||!sameCopyValue(refreshed.preparation.plan,preparation.plan))throw new EducationIssuanceError('SOURCE_CHANGED');
          const fresh=refreshed.preparation,plan=fresh.plan;
          if(plan.kind!=='duplicate'||plan.change.record_id!==props.recordId)throw new EducationIssuanceError('SOURCE_CHANGED');
          const checked=await readEducationIssuance(scope,{kind:'preview_change',change:plan.change});
          if(run!==epoch.current||!issuanceScopeCurrent(scope))return;
          if(checked.kind!=='preview_change'||!checked.preview.ready||checked.preview.preview_hash!==plan.preview_hash||!sameCopyValue(checked.preview.change,plan.change))throw new EducationIssuanceError('SOURCE_CHANGED');
          change={...plan.change,artifact:artifactFinalRef(fresh,fresh.items[0].id)};previewHash=checked.preview.preview_hash;
        }
        else change=preview.change;
        operation.current=prepareEducationIssuanceMutation(scope,{action:'apply_change',preview_hash:previewHash,change});
      }
      if(run!==epoch.current||!issuanceScopeCurrent(scope))return;
      await operation.current.run();
      if (run !== epoch.current || !issuanceScopeCurrent(scope)) return;
      operation.current = null; setPreview(null); setPreparation(null); setMode('view'); setSource(null); setAuthorization(null); setReason(''); props.onChanged(); toast.success('Действие сохранено в истории.'); await load(scope, props.recordId!);
    } catch (error) { if (run === epoch.current && issuanceScopeCurrent(scope)) { const failure = normalizeIssuanceError(error); setError(failure.message); if (failure.code !== 'DEPENDENCY_UNAVAILABLE') { operation.current = null; setPreview(null); setPreparation(null); } } }
    finally { if (run === epoch.current) { flight.current = false; setBusy(false); } }
  };
  const events = current ? history : [];
  const voided = new Set(events.filter(event => event.payload.kind === 'handover_voided').map(event => event.payload.kind === 'handover_voided' ? event.payload.event_id : ''));
  const handoverEvents = events.filter(event => event.payload.kind === 'handover_recorded' && !voided.has(event.id));
  const dispatches = handoverEvents.filter(event => event.payload.kind === 'handover_recorded' && event.payload.handover.kind === 'postal_dispatched');
  const openPdf=async()=>{if(!scope||!current||flight.current||!record)return;const run=epoch.current;flight.current=true;setBusy(true);setError(null);
    try{await downloadIssuedPdf(scope,record.official.id);}catch(cause){if(run===epoch.current&&issuanceScopeCurrent(scope))setError(normalizeIssuanceError(cause).message);}
    finally{if(run===epoch.current){flight.current=false;setBusy(false);}}};
  const edited = () => { if (!operation.current) { setPreview(null); setPreparation(null); } };
  const duplicateDraft:IssuancePlanDraft|null=preview?.ready&&preview.change.action==='issue_duplicate'?{kind:'duplicate',change:preview.change,preview_hash:preview.preview_hash}:null;
  const duplicateApproved=!!preparation&&preparation.items.every(item=>item.status==='approved_unissued'&&!!item.artifact?.output_review);
  const recover=async(value:IssuancePreparation)=>{
    if(!scope||!current||value.plan.kind!=='duplicate'||value.plan.change.record_id!==props.recordId)throw new EducationIssuanceError('INVALID_INPUT');
    const plan=value.plan,result=await readEducationIssuance(scope,{kind:'preview_change',change:plan.change});
    if(!issuanceScopeCurrent(scope))return;
    if(result.kind!=='preview_change'||!result.preview.ready||result.preview.preview_hash!==plan.preview_hash||!sameCopyValue(result.preview.change,plan.change))throw new EducationIssuanceError('SOURCE_CHANGED');
    setMode('issue_duplicate');setRecord(result.preview.record);setDuplicateKind(plan.change.basis.kind);setIssueDate(plan.change.issue_date);setSeries(plan.change.document_series??'');
    setReason(plan.change.reason);setSource(plan.change.basis.basis.source);setProvision(plan.change.basis.basis.provision);setPreview(result.preview);setPreparation(value);setError(null);
  };
  return <Dialog open={!!props.recordId} onOpenChange={open => { if (!open && !locked) props.onClose(); }}><DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>Документ и история действий</DialogTitle><DialogDescription>Официальные реквизиты сохраняются. Печать и скачивание не означают вручение; аннулирование и дубликат оформляются отдельными событиями.</DialogDescription></DialogHeader>
    {visible && <><div className="rounded-xl border p-4 space-y-2"><div className="flex gap-2 flex-wrap"><Badge variant="outline">{recordStatus(visible)}</Badge><Badge variant="secondary">{proofStatus(visible)}</Badge></div><p className="font-medium">{visible.official.full_name}</p><p className="text-sm">№ {visible.official.document_number} · рег. {visible.official.reg_number} · {visible.official.issue_date}</p><p className="text-sm text-muted-foreground">{visible.official.specialty_name}</p><p className="text-sm">{handoverStatus(visible)}</p>{visible.original_record_id && <p className="text-xs text-muted-foreground">Связан с исходным документом; исходная запись и номер сохранены.</p>}{visible.notes && <p className="text-sm whitespace-pre-wrap">Примечание: {visible.notes}</p>}<Button size="sm" variant="outline" disabled={locked||visible.artifact.availability!=='available'} onClick={()=>void openPdf()}>Скачать закреплённый PDF</Button>{visible.artifact.availability!=='available'&&<p className="text-xs text-muted-foreground">Файл не закреплён или недоступен с текущими правами. Исторический оригинал повторно не создаётся.</p>}</div>
      <IssuanceProvenanceDetails record={visible} />
      {scope && <RecordedProgramFileDownload record={visible} scope={scope} />}
      {current&&scope&&visible.capabilities.can_issue_duplicate&&<IssuancePreparationRecovery scope={scope} kind="duplicate" disabled={locked||!!preparation} onRecover={recover} onOpenRecord={props.onOpenRecord}/>}
      <fieldset className="space-y-4" disabled={locked||!!preparation}>
        <div className="space-y-2"><Label>Действие</Label><Select value={mode} onValueChange={value => { setMode(value as Mode); setPreview(null); setPreparation(null); setSource(null); setAuthorization(null); setReason(''); setEventId(''); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">Просмотр истории</SelectItem>{visible.capabilities.can_write_metadata && <SelectItem value="correct_metadata">Исправить примечание</SelectItem>}{visible.capabilities.can_record_handover && <><SelectItem value="record_handover">Зафиксировать вручение / почту</SelectItem><SelectItem value="void_handover">Отменить ошибочный факт вручения</SelectItem></>}{visible.capabilities.can_issue_duplicate && <SelectItem value="issue_duplicate">Выдать связанный дубликат</SelectItem>}{visible.capabilities.can_annul && <SelectItem value="annul">Аннулировать документ</SelectItem>}</SelectContent></Select></div>
        {mode === 'correct_metadata' && <div className="space-y-2"><Label>Примечание</Label><Textarea aria-label="Примечание" value={notes} maxLength={4000} onChange={e => { setNotes(e.target.value); edited(); }} /><p className="text-xs text-muted-foreground">ФИО, номера, программа и результат здесь не изменяются. Для исправления официального документа требуется отдельный обоснованный дубликат.</p></div>}
        {mode === 'record_handover' && <><div className="space-y-2"><Label>Фактическое событие</Label><Select value={handoverKind} onValueChange={value => { setHandoverKind(value as IssuanceHandover['kind']); setEventId(''); edited(); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">Лично ученику</SelectItem><SelectItem value="representative">Представителю</SelectItem><SelectItem value="postal_dispatched">Передано почтовому перевозчику</SelectItem><SelectItem value="postal_delivered">Доставлено после отправки</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Когда это произошло</Label><Input aria-label="Когда это произошло" type="datetime-local" value={occurredAt} onChange={e => { setOccurredAt(e.target.value); edited(); }} /></div>{handoverKind === 'representative' && <><div className="space-y-2"><Label>ФИО представителя по документу полномочий</Label><Input aria-label="ФИО представителя по документу полномочий" value={representative} maxLength={300} onChange={e => { setRepresentative(e.target.value); edited(); }} /></div><IssuanceSourcePicker label="Документ полномочий: точная версия" scope={scope} value={authorization} onChange={value => { setAuthorization(value); edited(); }} disabled={locked} /></>}{handoverKind === 'postal_dispatched' && <div className="grid sm:grid-cols-2 gap-3"><div><Label>Перевозчик</Label><Input aria-label="Перевозчик" value={carrier} maxLength={200} onChange={e => { setCarrier(e.target.value); edited(); }} /></div><div><Label>Номер отправления</Label><Input aria-label="Номер отправления" value={tracking} maxLength={200} onChange={e => { setTracking(e.target.value); edited(); }} /></div><div className="sm:col-span-2"><Label>Адрес ученика для этого отправления</Label><Input aria-label="Адрес ученика для этого отправления" value={address} maxLength={1000} onChange={e => { setAddress(e.target.value); edited(); }} /></div></div>}</>}
        {(mode === 'void_handover' || mode === 'record_handover' && handoverKind === 'postal_delivered') && <div className="space-y-2"><Label>{mode === 'void_handover' ? 'Какой факт отменить' : 'Точное ранее зарегистрированное отправление'}</Label><Select value={eventId} onValueChange={value => { setEventId(value); edited(); }}><SelectTrigger><SelectValue placeholder="Выберите событие из истории" /></SelectTrigger><SelectContent>{(mode === 'void_handover' ? handoverEvents : dispatches).map(event => <SelectItem key={event.id} value={event.id}>{new Date(event.recorded_at).toLocaleString()} · {eventLabels[event.kind]}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Если нужное событие старше, загрузите следующую часть истории.</p></div>}
        {mode === 'issue_duplicate' && <><div><Label>Причина дубликата</Label><Select value={duplicateKind} onValueChange={value => { setDuplicateKind(value as typeof duplicateKind); edited(); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="lost">Утрата</SelectItem><SelectItem value="damaged">Повреждение</SelectItem><SelectItem value="correction_replacement">Замена для исправления</SelectItem></SelectContent></Select></div><div className="grid sm:grid-cols-2 gap-3"><div><Label>Дата выдачи дубликата</Label><Input aria-label="Дата выдачи дубликата" type="date" max={issuanceUtcDateIso()} value={issueDate} onChange={e => { setIssueDate(e.target.value); edited(); }} /><p className="text-xs text-muted-foreground">Дата выдачи проверяется по UTC. Сегодня: {issuanceUtcDateIso()}.</p></div><div><Label>Серия, если применяется</Label><Input aria-label="Серия, если применяется" value={series} maxLength={120} onChange={e => { setSeries(e.target.value); edited(); }} /></div></div><p className="text-xs text-muted-foreground">Дубликат получает новый номер и связь с оригиналом. При замене для исправления сервер берёт текущие сведения того же ученика, сохраняя прежние официальные факты.</p></>}
        {['record_handover', 'annul', 'issue_duplicate'].includes(mode) && <IssuanceSourcePicker scope={scope} value={source} onChange={value => { setSource(value); edited(); }} disabled={locked} />}
        {['annul', 'issue_duplicate'].includes(mode) && <div><Label>Пункт или реквизиты основания</Label><Input aria-label="Пункт или реквизиты основания" value={provision} maxLength={1000} onChange={e => { setProvision(e.target.value); edited(); }} /></div>}
        {mode !== 'view' && <div><Label>Причина / пояснение ответственного сотрудника</Label><Textarea aria-label="Причина / пояснение ответственного сотрудника" value={reason} maxLength={2000} onChange={e => { setReason(e.target.value); edited(); }} /></div>}
      </fieldset>
      {current && preview && <div className="rounded-xl border p-3"><p className="font-medium">{preview.ready ? 'Серверная проверка выполнена. Подтвердите действие.' : 'Действие заблокировано; данные не изменены.'}</p>{preview.blockers.map((blocker, index) => <p key={index} className="text-sm text-muted-foreground">{blocker.label}</p>)}</div>}
      {current&&scope&&duplicateDraft&&<IssuanceArtifactPreparation scope={scope} draft={duplicateDraft} preparation={preparation} onChange={setPreparation} onLockChange={setArtifactBusy} disabled={busy||!!operation.current} learnerLabels={record?.official.enrollment_id?{[record.official.enrollment_id]:record.official.full_name}:{}} onOpenRecord={props.onOpenRecord}/>}
      {current&&duplicateDraft?.kind==='duplicate'&&duplicateDraft.change.basis.kind==='correction_replacement'&&<div className="space-y-3 rounded-xl border p-3"><p className="font-medium">Сверка замены для исправления</p><p className="text-sm">Прежний документ: {visible.official.full_name} · дата рождения {visible.official.birth_date??'не зафиксирована'} · №{visible.official.document_number}, рег. {visible.official.reg_number} от {visible.official.issue_date}.</p><p className="text-sm text-muted-foreground">Новые сведения показаны в сохранённом PDF и его внутреннем утверждении выше. Сверьте прежние реквизиты с точным новым файлом. Исходная запись сохраняется; её аннулирование, если необходимо, оформляется отдельно.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={correctionCompared} disabled={locked} onChange={event=>setCorrectionCompared(event.target.checked)}/><span>Сверил прежние сведения с новым PDF и подтверждаю исправление по выбранному основанию.</span></label></div>}
      <div className="space-y-3"><h3 className="font-medium">История · версия записи {visible.revision}</h3>{events.length === 0 && !busy && <p className="text-sm text-muted-foreground">В новой истории событий пока нет. Прежняя запись сохраняется без придуманного основания выдачи.</p>}{events.map(event => <div key={event.id} className="rounded-xl border p-3 space-y-1"><p className="text-sm font-medium">{eventLabels[event.kind]} · {new Date(event.recorded_at).toLocaleString()}</p><p className="text-sm whitespace-pre-wrap">{event.reason}</p>{event.payload.kind === 'issued' && <p className="text-xs text-muted-foreground">{event.payload.proof_availability === 'captured' ? 'Проверяемое основание выдачи сохранено.' : 'Основание недоступно с текущими правами.'}</p>}{event.payload.kind === 'duplicate_issued'&&props.onOpenRecord&&<Button size="sm" variant="outline" disabled={locked} onClick={()=>props.onOpenRecord!(event.payload.kind==='duplicate_issued'?event.payload.duplicate_record_id:'')}>Открыть связанный дубликат</Button>}{event.payload.kind === 'metadata_corrected' && <p className="text-sm whitespace-pre-wrap">{event.payload.after_notes}</p>}{event.payload.kind === 'handover_recorded' && <p className="text-sm">{({ personal: 'Лично ученику', representative: 'Представителю', postal_dispatched: 'Почтовая отправка', postal_delivered: 'Почтовая доставка' })[event.payload.handover.kind]} · фактически {new Date(event.payload.handover.occurred_at).toLocaleString()} · {event.payload.handover.evidence.availability === 'available' ? 'Подтверждающая версия доступна' : 'Подтверждающая версия недоступна с текущими правами'}</p>}{event.payload.kind === 'annulled' && <p className="text-sm">{event.payload.basis.provision} · {event.payload.basis.source_availability === 'available' ? 'Версия основания доступна' : 'Версия основания недоступна с текущими правами'}</p>}</div>)}{before !== null && <Button variant="outline" disabled={locked} onClick={() => void moreHistory()}>Ещё историю</Button>}</div>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={locked} onClick={props.onClose}>Закрыть</Button>{visible && mode !== 'view' && (preview ? <><Button variant="outline" disabled={locked} onClick={() => { setPreview(null); setPreparation(null); }}>Изменить решение</Button><Button variant={mode === 'annul' ? 'destructive' : 'default'} disabled={!current || busy || artifactBusy || !preview.ready || mode === 'issue_duplicate' && !operation.current && (!duplicateApproved || duplicateKind==='correction_replacement'&&!correctionCompared)} onClick={() => void apply()}>{busy ? 'Сохранение...' : operation.current ? 'Повторить тот же запрос' : 'Подтвердить действие'}</Button></> : <Button disabled={!current || busy || !reason.trim()} onClick={() => void prepare()}>{busy ? 'Проверка...' : 'Проверить на сервере'}</Button>)}</DialogFooter>
  </DialogContent></Dialog>;
}
