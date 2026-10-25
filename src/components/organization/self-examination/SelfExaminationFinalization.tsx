import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RegistrySourceField } from '../RegistrySourceField';
import { OrgDocumentVersionsDialog } from '../OrgDocumentVersionsDialog';
import { useDocumentRegistry } from '@/hooks/useDocumentRegistry';
import type { RegistrySourceChoice } from '@/lib/documentRegistry/contract';
import { supabase } from '@/integrations/supabase/client';
import { parseWorkflowEnvelope } from '@/lib/orgDocumentWorkflow';
import type { SelfExaminationAction, SelfExaminationDraft } from '@/lib/selfExamination/draft';
const scope={kind:'organization' as const};
type Props={draft:SelfExaminationDraft;disabled:boolean;mutate:(a:SelfExaminationAction)=>Promise<boolean>};
export function SelfExaminationFinalization(props:Props){const[open,setOpen]=useState(false);return <details className="rounded-xl border border-border p-4" onToggle={e=>setOpen(e.currentTarget.open)}><summary className="cursor-pointer font-medium">Итог центра и размещение</summary>{open&&<Finalization key={props.draft.id+':'+props.draft.revision} {...props}/>}</details>;}
function Finalization({draft,disabled,mutate}:Props){
 const registry=useDocumentRegistry(draft.organization_id,scope);
 const initial=draft.centre_final?.source??draft.latest_artifact?.source;
 const[source,setSource]=useState<RegistrySourceChoice|null>(initial?{source:initial,label:draft.centre_final?'Сохранённый итог этого года':'Сформированный черновик этого года'}:null),[sourceBusy,setSourceBusy]=useState(false),[busy,setBusy]=useState(false),[versions,setVersions]=useState(false),[note,setNote]=useState(''),[url,setUrl]=useState(''),[declaration,setDeclaration]=useState(''),[error,setError]=useState<string|null>(null);
 const record=async()=>{if(!source||source.source.kind!=='org_document_version'||!registry.scopeCurrent())return;const selected=source.source;setBusy(true);setError(null);try{
  const response=await(supabase.rpc as any)('get_org_document_workflow',{p_document_id:selected.document_id});if(!registry.scopeCurrent())return;if(response.error)throw response.error;
  const current=parseWorkflowEnvelope(response.data,selected.document_id,draft.organization_id),review=current.workflow;
  if(!review||review.state!=='approved'||review.version_id!==selected.version_id||!review.approval){setError('Утвердите именно выбранную версию в существующем согласовании документа, затем повторите действие.');return;}
  await mutate({kind:'record_centre_final',expected_fact_hash:draft.fact_hash,source:selected,review_id:review.id,verification_note:note.trim()});
 }catch{if(registry.scopeCurrent())setError('Не удалось подтвердить текущее согласование выбранной версии. Обновите документ и проверьте права.');}finally{if(registry.scopeCurrent())setBusy(false);}};
 const locked=disabled||busy||sourceBusy;
 return <div className="space-y-3 mt-4"><p className="text-sm">{draft.centre_final_current?'Центр зафиксировал проверенный итог для этого набора фактов.':'Черновик требует проверки и отдельного утверждения центром.'}</p>
 <p className="text-xs text-muted-foreground">Подготовка файла и исполнение услуги не утверждают отчёт. Подписание руководителем, рассмотрение компетентным органом и фактическое размещение центр выполняет отдельно. Здесь сохраняется его решение по конкретной версии.</p>
 <RegistrySourceField model={registry} title={'Итог самообследования '+draft.reporting_year} value={source} disabled={locked} onBusy={setSourceBusy} onChange={choice=>{if(choice&&choice.source.kind!=='org_document_version'){setError('Выберите документ организации.');return;}setSource(choice);}}/>
 {source&&<><Button variant="outline" disabled={locked} onClick={()=>setVersions(true)}>Файл, версии и согласование</Button><OrgDocumentVersionsDialog open={versions} onOpenChange={setVersions} documentId={source.source.document_id} documentName={'Самообследование '+draft.reporting_year} organizationId={draft.organization_id} canWrite={draft.can_write}/></>}
 <Label htmlFor="self-final-note">Как центр проверил итог и основание утверждения</Label><Textarea id="self-final-note" value={note} maxLength={4000} disabled={locked} onChange={e=>setNote(e.target.value)}/>
 <Button variant="outline" disabled={locked||!source||!note.trim()||draft.missing_fact_keys.length>0||draft.reporting_year>=new Date().getUTCFullYear()} onClick={record}>Зафиксировать проверенный итог центра</Button>
 {draft.missing_fact_keys.length>0&&<p className="text-xs text-muted-foreground">Не подтверждены обязательные сведения: {draft.missing_fact_keys.length}. Для неприменимых разделов нужно обоснование с источником.</p>}
 {draft.reporting_year>=new Date().getUTCFullYear()&&<p className="text-xs text-muted-foreground">Текущий календарный год ещё не завершён; доступен только черновик.</p>}
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 {draft.centre_final_current&&<div className="border-t pt-4 space-y-3"><Label htmlFor="self-public-url">Ссылка, где центр самостоятельно разместил утверждённый отчёт</Label><Input id="self-public-url" type="url" value={url} maxLength={2000} disabled={locked} onChange={e=>setUrl(e.target.value)} placeholder="https://..."/><Label htmlFor="self-public-declaration">Подтверждение размещения центром</Label><Textarea id="self-public-declaration" value={declaration} maxLength={4000} disabled={locked} onChange={e=>setDeclaration(e.target.value)}/><Button variant="outline" disabled={locked||!url.trim()||!declaration.trim()} onClick={()=>mutate({kind:'record_publication',expected_fact_hash:draft.fact_hash,public_url:url.trim(),declaration:declaration.trim()})}>Сохранить заявление центра о размещении</Button><p className="text-xs text-muted-foreground">Сервис не публикует файл и не подтверждает доступность внешнего сайта автоматически.</p></div>}
 {draft.publication&&<p className="text-xs text-muted-foreground">Центр заявил о размещении: {draft.publication.public_url}. {draft.centre_final_current?'':'Текущие факты или источники требуют повторной проверки.'}</p>}
 </div>;
}
