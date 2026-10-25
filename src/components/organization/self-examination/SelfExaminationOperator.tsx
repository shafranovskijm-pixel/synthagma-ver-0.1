import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSelfExaminationDraft } from '@/hooks/useSelfExaminationDraft';
import { readSelfExaminationHistory } from '@/lib/selfExamination/draft';
import { parseSelfExaminationCapture } from '../../../../supabase/functions/_shared/self-examination-projector';
import { safeInvoke } from '@/utils/safeInvoke';
import { SelfExaminationHistory } from './SelfExaminationHistory';
import { OrgDocumentVersionsDialog } from '../OrgDocumentVersionsDialog';
import { captureProgramFileScope, createScopedOrgDocumentTransport } from '@/lib/programFiles';
import type { GenerationCommand } from '../../../../supabase/functions/_shared/self-examination-generation';
type Order={id:string;organization_id:string;service_id:string;status:string;notes:string|null;service_price:string|null;created_at:string};
type Props={organizationId:string;documents:{id:string;name:string;type:string;deleted_at?:string|null}[];onDocumentsChange:()=>void};
export function SelfExaminationOperator(props:Props){
 const auth=useAuth(),[open,setOpen]=useState(false);
 if(auth.loading||!auth.user?.id||auth.userRole!=='admin')return null;
 return <div className="rounded-xl border border-border p-4 space-y-3"><Button variant="outline" onClick={()=>setOpen(!open)}>Самообследование: исполнение услуги</Button>{open&&<Operator key={props.organizationId+':'+auth.user?.id} {...props} actorId={auth.user!.id}/>}</div>;
}
function Operator({organizationId,documents,onDocumentsChange,actorId}:Props&{actorId:string}){
 const[year,setYear]=useState(new Date().getUTCFullYear()-1),[orderId,setOrderId]=useState('none'),[target,setTarget]=useState('new'),[orders,setOrders]=useState<Order[]>([]),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState<{key:string;text:string}|null>(null),[recover,setRecover]=useState<GenerationCommand|null>(null);
 const model=useSelfExaminationDraft(organizationId,year),operation=useRef<GenerationCommand|null>(null),alive=useRef(true),ticket=useRef(0);const context=useRef(model.contextKey);context.current=model.contextKey;
 const [versionsOpen,setVersionsOpen]=useState(false);
 const artifact=model.current&&!model.denied&&model.draft?.organization_id===organizationId&&model.draft.reporting_year===year?model.draft.latest_artifact:null;
 const fileKey=artifact?model.contextKey+'|'+artifact.source.document_id+'|'+artifact.source.version_id:null,activeFile=useRef(fileKey);activeFile.current=fileKey;
 const fileTransport=useMemo(()=>{if(!artifact||!fileKey)return undefined;const source=artifact.source,key=model.contextKey;try{
  const scope=captureProgramFileScope(organizationId,fileKey,()=>alive.current&&context.current===key&&activeFile.current===fileKey);if(scope.actorId!==actorId)return undefined;
  const base=createScopedOrgDocumentTransport(scope);
  return {...base,async readDocument(id:string){if(id!==source.document_id)throw Error('SELF_EXAMINATION_FILE_SCOPE_CHANGED');const result=await base.readDocument(id);const row=result.data as {type?:string;deleted_at?:string|null}|null;if(!result.error&&(!row||row.type!=='self_examination_report'||row.deleted_at))throw Error('SELF_EXAMINATION_FILE_UNAVAILABLE');return result;},
   async readVersions(id:string){if(id!==source.document_id)throw Error('SELF_EXAMINATION_FILE_SCOPE_CHANGED');const result=await base.readVersions(id);if(result.error)return result;const rows=Array.isArray(result.data)?result.data.filter(row=>row.id===source.version_id):[];if(rows.length!==1)throw Error('SELF_EXAMINATION_FILE_UNAVAILABLE');return {...result,data:rows};}};
 }catch{return undefined;}},[actorId,organizationId,fileKey]);
 useEffect(()=>{setMessage(null);setVersionsOpen(false);},[model.contextKey]);
 useEffect(()=>{setVersionsOpen(false);},[fileKey]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;++ticket.current;};},[]);
 useEffect(()=>{const run=++ticket.current,key=model.contextKey;setOrders([]);setRecover(null);setError(null);operation.current=null;setUncertain(false);void(async()=>{try{
  const r=await supabase.from('service_orders').select('id,organization_id,service_id,status,notes,service_price,created_at').eq('organization_id',organizationId).in('service_id',['self_examination_report','self_examination_report_auto']).order('created_at',{ascending:false}).limit(50);if(r.error)throw r.error;if(!alive.current||run!==ticket.current||context.current!==key)return;setOrders(r.data??[]);
  if(model.draft){const h=await readSelfExaminationHistory(organizationId,year);if(!alive.current||run!==ticket.current||context.current!==key)return;for(const e of h.history){if(e.action!=='prepare_generation'||e.actor_id!==actorId)continue;try{const c=parseSelfExaminationCapture(e.snapshot.generation_capture);if(c.fact_hash!==model.draft.fact_hash||c.prepared_by!==actorId)continue;setRecover({organizationId,reportingYear:year,draftId:model.draft.id,expectedFactHash:c.fact_hash,expectedRevision:e.revision-1,requestId:e.receipt.request_id,documentId:c.document_id,expectedDocumentRevision:c.expected_document_revision,orderId:c.order_id});break;}catch{/* Not a generation snapshot. */}}}
 }catch{if(alive.current&&run===ticket.current&&context.current===key)setError('Не удалось загрузить заказы или историю. Повторите открытие панели.');}})();},[model.contextKey,model.draft?.revision]);
 const matching=orders.filter(order=>{try{const ref=JSON.parse(order.notes??'');return ref.kind==='self_examination_draft'&&ref.organization_id===organizationId&&ref.reporting_year===year&&ref.draft_id===model.draft?.id;}catch{return false;}});
 const run=async(recovery?:GenerationCommand)=>{
  if(busy||!model.current||model.loading||model.denied||!model.draft)return;const key=model.contextKey;setBusy(true);setError(null);setMessage(null);
  try{
   if(recovery)operation.current=recovery;
   if(!operation.current){let documentId:string=crypto.randomUUID(),revision=0;if(target!=='new'){const d=await supabase.from('org_documents').select('id,organization_id,type,document_revision,deleted_at').eq('id',target).eq('organization_id',organizationId).single();if(d.error||!d.data||d.data.deleted_at||d.data.type!=='self_examination_report')throw Error('TARGET_UNAVAILABLE');documentId=d.data.id;revision=d.data.document_revision;}if(!alive.current||context.current!==key)return;
    operation.current={organizationId,reportingYear:year,draftId:model.draft.id,expectedFactHash:model.draft.fact_hash,expectedRevision:model.draft.revision,requestId:crypto.randomUUID(),documentId,expectedDocumentRevision:revision,orderId:orderId==='none'?null:orderId};}
   setUncertain(true);const response=await safeInvoke<any>('generate-self-examination-report',{body:{...operation.current,useCurrentDraft:true}});if(!alive.current||context.current!==key)return;if(response.error)throw response.error;
   const value=response.data;if(!value?.success||value.requestId!==operation.current.requestId||value.documentId!==operation.current.documentId||value.reportingYear!==year||value.status!=='draft_requires_centre_review')throw Error('UNCONFIRMED_RESPONSE');
   operation.current=null;setUncertain(false);setMessage({key,text:'Черновик сохранён в версиях документа. Исполнение услуги отделено от утверждения центром.'});onDocumentsChange();await model.reload();
  }catch{if(alive.current&&context.current===key)setError('Формирование не подтверждено. Повторите тот же запрос; прежние версии и заказы не удаляются. При изменении источников выберите текущее задание заново после проверки истории.');}finally{if(alive.current&&context.current===key)setBusy(false);}
 };
 const disabled=busy||uncertain;
 return <div className="space-y-3"><p className="text-xs text-muted-foreground">Оператор подготавливает черновик из подтверждённых фактов. Пустые сведения будут явно перечислены. Покупка, утверждение и размещение этим действием не выполняются.</p>
 <Label htmlFor="self-op-year">Отчётный год</Label><select id="self-op-year" className="w-full rounded-xl border bg-background p-2" value={year} disabled={disabled} onChange={e=>setYear(Number(e.target.value))}>{Array.from({length:new Date().getUTCFullYear()-1999},(_,i)=>new Date().getUTCFullYear()-i).map(y=><option key={y}>{y}</option>)}</select>
 <p className="text-sm">{model.loading?'Загрузка...':model.draft?'Текущий черновик: версия '+model.draft.revision+'. Требуют подтверждения: '+model.draft.missing_fact_keys.length:'Сохранённого черновика за этот год нет. Центр должен заполнить анкету.'}</p>
 <Label htmlFor="self-op-order">Задание на подготовку</Label><select id="self-op-order" className="w-full rounded-xl border bg-background p-2" value={orderId} disabled={disabled} onChange={e=>setOrderId(e.target.value)}><option value="none">Явное ручное задание администратора, без исполнения заказа</option>{matching.map(o=><option key={o.id} value={o.id}>{new Date(o.created_at).toLocaleDateString('ru-RU')} — {o.status} — {o.service_price??'Цена в старом заказе не указана'}</option>)}</select>
 <Label htmlFor="self-op-target">Документ для новой неизменяемой версии</Label><select id="self-op-target" className="w-full rounded-xl border bg-background p-2" value={target} disabled={disabled} onChange={e=>setTarget(e.target.value)}><option value="new">Новый годовой документ</option>{documents.filter(d=>d.type==='self_examination_report'&&!d.deleted_at).map(d=><option key={d.id} value={d.id}>{d.name} — добавить версию</option>)}</select>
 <p className="text-xs text-muted-foreground">Выбирая существующий документ, вы добавляете версию; прежние файлы и их годовая привязка остаются в истории. Текущая сохранённая версия фактов будет захвачена явно.</p>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{model.error&&<p role="alert" className="text-sm text-destructive">{model.error}</p>}{message?.key===model.contextKey&&<p role="status" className="text-sm">{message.text}</p>}
 {artifact&&<div className="rounded-xl border border-border p-3 space-y-2 text-sm"><p className="font-medium">Сохранённый черновик самообследования за {year} год</p><p className="text-xs text-muted-foreground">Файл сохранён {new Date(artifact.recorded_at).toLocaleString('ru-RU')}. Это точная неизменяемая версия, а не утверждённый итог центра.</p>{!model.draft?.artifact_current&&<p className="text-xs text-muted-foreground">Факты изменились после подготовки. Прежний файл сохранён в истории; для текущих сведений нужен новый черновик.</p>}<Button variant="outline" disabled={model.loading||!fileTransport} onClick={()=>setVersionsOpen(true)}>Открыть сохранённую версию</Button>{fileTransport&&<OrgDocumentVersionsDialog key={fileKey!} open={versionsOpen} onOpenChange={setVersionsOpen} documentId={artifact.source.document_id} documentName={'Самообследование '+year+' — сохранённая версия'} organizationId={organizationId} canWrite={false} transport={fileTransport} sourceOpenMode="download" sourceDownloadAssertCurrent={fileTransport.assertCurrent}/>}</div>}
 {model.current&&!model.denied&&model.draft&&<SelfExaminationHistory organizationId={organizationId} year={year} contextKey={model.contextKey} revision={model.draft.revision}/>}
 <Button disabled={busy||model.loading||!model.current||!model.draft||model.denied} onClick={()=>run()}>{busy?'Подготовка...':uncertain?'Повторить тот же запрос':'Подтвердить задание и подготовить черновик'}</Button>
 {!uncertain&&recover&&<Button variant="outline" disabled={busy||model.loading} onClick={()=>run(recover)}>Восстановить последний запрос из истории</Button>}
 <details className="text-xs text-muted-foreground"><summary>Сохранённые заказы этой организации (до 50)</summary>{orders.map(o=><p key={o.id}>{new Date(o.created_at).toLocaleDateString('ru-RU')} · {o.status} · {o.service_price??'Не указано'}. {matching.some(m=>m.id===o.id)?'Связан с выбранным черновиком.':'Исторический заказ: связь с выбранным годовым черновиком не подтверждена, не исполняется автоматически.'}</p>)}</details></div>;
}
