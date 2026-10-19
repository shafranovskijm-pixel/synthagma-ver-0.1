import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, Upload, Eye } from 'lucide-react';
import { useAdmissionEvidenceFile, type AdmissionCaseController } from '@/hooks/useAdmissionCase';
import * as c from '@/lib/admissionCases/contract';

const fieldClass = 'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm';
const versionLabel = (item:c.AdmissionEvidence) => `${new Date(item.captured_at).toLocaleString('ru-RU')} · ${item.byte_sha256.slice(0,12)}`;
const reviewLabels = {unreviewed:'Не проверено',accepted:'Принято при проверке',rejected:'Не принято'};
export function AdmissionEvidenceSection({controller:h,state,requirement}:{controller:AdmissionCaseController;state:c.AdmissionStaffCase;requirement:c.AdmissionRequirement}) {
  const [preview,setPreview] = useState<c.AdmissionEvidence|null>(null);
  const [supersedes,setSupersedes] = useState<string>('');
  const [kind,setKind] = useState<'identity_document'|'enrollment_document'|'contract_artifact'|'organization_document_version'>('identity_document');
  const [sources,setSources] = useState<c.AdmissionCandidates|null>(null);
  const disabled = h.busy || h.pending;
  const evidence = state.evidence.filter(item => item.requirement_id === requirement.id);
  const loadSources = async (more=false) => {const result = await h.candidates(kind,more ? sources?.next_after_id || null : null);if (result) setSources({...result,items:more && sources ? [...sources.items,...result.items] : result.items});};
  return <div className="space-y-3">
    {state.capabilities.can_prepare_evidence && <div className="space-y-2 rounded-lg bg-muted/30 p-3">
      {evidence.length > 0 && <select aria-label={`Способ добавления: ${requirement.label}`} value={supersedes} className={fieldClass} disabled={disabled} onChange={event => setSupersedes(event.target.value)}><option value="">Отдельное доказательство</option>{evidence.map(item => <option value={item.id} key={item.id}>Новая версия: {versionLabel(item)}</option>)}</select>}
      <label className="block space-y-2 text-xs"><span className="flex items-center gap-2"><Upload className="w-4 h-4"/>Добавить читаемую индивидуальную копию: PDF, JPEG или PNG, до20МиБ</span>
        <Input type="file" aria-label={`Файл: ${requirement.label}`} accept="application/pdf,image/jpeg,image/png" disabled={disabled} onChange={event => {const file = event.target.files?.[0];event.target.value='';if(file) void h.capture(requirement.id,file,supersedes || null);}}/></label>
      <div className="flex flex-wrap items-center gap-2"><select aria-label={`Тип существующего источника: ${requirement.label}`} className={`${fieldClass} flex-1`} value={kind} disabled={disabled} onChange={event => {setKind(event.target.value as typeof kind);setSources(null);}}>
        <option value="identity_document">Загруженные личные документы</option><option value="enrollment_document">Документы зачисления</option><option value="contract_artifact">Договоры с доказанной привязкой</option><option value="organization_document_version">Версии документов организации</option></select>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => void loadSources()}>Выбрать существующий источник</Button></div>
      {sources && <div className="space-y-2">{sources.items.map(item => <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border bg-background p-2 text-xs"><span>{item.label}{item.availability !== 'capturable' && <span className="block text-muted-foreground">Нужна читаемая индивидуальная копия; привязка или файл не подтверждены.</span>}</span>
        <Button size="sm" variant="outline" disabled={disabled || item.availability !== 'capturable'} onClick={() => void h.capture(requirement.id,{kind:'existing',requirement_id:requirement.id,supersedes_id:supersedes || null,candidate:{kind:item.kind,id:item.id,version_id:item.version_id,fingerprint:item.fingerprint}})}>Сохранить версию</Button></div>)}
        {!sources.items.length && <p className="text-xs text-muted-foreground">Подходящих доступных источников нет. Загрузите индивидуальную копию.</p>}
        {sources.has_more && <Button variant="outline" size="sm" onClick={() => void loadSources(true)}>Ещё источники</Button>}</div>}
    </div>}
    {evidence.map(item => <EvidenceReview key={item.id} controller={h} state={state} requirement={requirement} evidence={item} onOpen={() => setPreview(item)}/>)}
    {!evidence.length && <p className="text-xs text-muted-foreground">Сохранённых доказательств для этого вопроса пока нет.</p>}
    <AdmissionEvidenceDialog controller={h} state={state} evidence={preview ? state.evidence.find(item => item.id === preview.id) || null : null} onClose={() => setPreview(null)}/>
  </div>;
}
function EvidenceReview({controller:h,state,requirement,evidence,onOpen}:{controller:AdmissionCaseController;state:c.AdmissionStaffCase;requirement:c.AdmissionRequirement;evidence:c.AdmissionEvidence;onOpen:()=>void}) {
  const [outcome,setOutcome] = useState<'accepted'|'rejected'>('accepted'); const [reason,setReason] = useState('');
  return <div className="space-y-2 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-xs"><FileText className="h-4 w-4"/>{versionLabel(evidence)}</p><Badge variant="outline">{reviewLabels[evidence.review]}</Badge></div>
    <p className="text-xs text-muted-foreground">{Math.ceil(evidence.byte_size/1024)}КиБ · {evidence.mime_type}{evidence.availability !== 'available' && ' · источник требует проверки'}</p>
    <Button size="sm" variant="outline" className="gap-2" disabled={!evidence.can_read_bytes} onClick={onOpen}><Eye className="h-3.5 w-3.5"/>Открыть защищённую версию</Button>
    {state.capabilities.can_review && <div className="space-y-2"><select aria-label={`Проверка версии ${evidence.id}`} className={fieldClass} value={outcome} disabled={h.busy || h.pending} onChange={event => setOutcome(event.target.value as typeof outcome)}><option value="accepted">Принять эту версию при проверке</option><option value="rejected">Не принять эту версию</option></select>
      <Textarea aria-label={`Основание проверки версии ${evidence.id}`} placeholder="Что проверено в этой точной версии и почему она подходит или не подходит" maxLength={4000} value={reason} disabled={h.busy || h.pending} onChange={event => setReason(event.target.value)}/>
      <Button size="sm" variant="outline" disabled={h.busy || h.pending || !reason.trim() || outcome === 'accepted' && evidence.availability !== 'available'} onClick={() => void h.mutate({action:'review_evidence',case_id:state.id,expected_revision:state.revision,expected_program_ref:state.program_ref,requirement_id:requirement.id,expected_requirement_revision:requirement.revision,evidence_version_id:evidence.id,byte_sha256:evidence.byte_sha256,outcome,reason:reason.trim()})}>Записать проверку версии</Button></div>}
  </div>;
}
export function AdmissionEvidenceDialog({controller:h,state,evidence,onClose,historyEvent=null}:{controller:AdmissionCaseController;state:c.AdmissionStaffCase;evidence:c.AdmissionEvidence|null;onClose:()=>void;historyEvent?:c.AdmissionHistory['items'][number]|null}) {
  const file = useAdmissionEvidenceFile(evidence ? h.scope : null,evidence ? state : null,evidence,historyEvent,h.denyAccess);
  const extension = evidence?.mime_type === 'application/pdf' ? 'pdf' : evidence?.mime_type === 'image/png' ? 'png' : 'jpg';
  return <Dialog open={!!evidence} onOpenChange={open => {if(!open) onClose();}}><DialogContent className="max-w-4xl max-h-[90vh] rounded-2xl"><DialogHeader><DialogTitle>Защищённая версия документа</DialogTitle></DialogHeader>
    {file.loading && <p className="text-sm text-muted-foreground">Проверяем доступ и целостность файла…</p>}
    {file.error && <p role="alert" className="text-sm text-destructive">Не удалось подтвердить доступ или целостность этой версии. Закройте окно и повторите проверку.</p>}
    {file.url && <div className="space-y-3">{evidence?.mime_type === 'application/pdf' ? <iframe title="Защищённая версия PDF" src={file.url} sandbox="" className="w-full h-[60vh] rounded-xl"/> : <img src={file.url} alt="Защищённая версия документа" className="max-w-full max-h-[60vh] rounded-xl object-contain mx-auto"/>}
      <Button asChild size="sm" variant="outline"><a href={file.url} download={`document-${evidence!.id}.${extension}`}>Скачать проверенную версию</a></Button></div>}
  </DialogContent></Dialog>;
}
export function AdmissionEvidenceHistory({controller:h,state,events}:{controller:AdmissionCaseController;state:c.AdmissionStaffCase;events:c.AdmissionHistory['items']}) {
  const [selected,setSelected] = useState<{evidence:c.AdmissionEvidence;event:c.AdmissionHistory['items'][number]}|null>(null);
  const oldVersions = new Map<string,{evidence:c.AdmissionEvidence;event:c.AdmissionHistory['items'][number]}>();
  for (const event of events) for(const evidence of event.payload.evidence) if(!state.evidence.some(item => item.id===evidence.id) && !oldVersions.has(evidence.id)) oldVersions.set(evidence.id,{evidence,event});
  if (!oldVersions.size) return null;
  return <div className="space-y-2"><p className="text-sm font-medium">Сохранённые предыдущие версии</p>{[...oldVersions.values()].map(item => <div key={item.evidence.id} className="flex items-center justify-between gap-2 text-xs"><span>{versionLabel(item.evidence)} · {reviewLabels[item.evidence.review]}</span><Button size="sm" variant="outline" disabled={!item.evidence.can_read_bytes} onClick={() => setSelected(item)}>Открыть версию</Button></div>)}
    <AdmissionEvidenceDialog controller={h} state={state} evidence={selected?.evidence || null} historyEvent={selected?.event || null} onClose={() => setSelected(null)}/></div>;
}
