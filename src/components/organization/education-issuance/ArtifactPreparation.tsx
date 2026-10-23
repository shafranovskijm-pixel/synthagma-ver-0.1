import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrgDocumentWorkflowPanel } from "@/components/organization/documents/OrgDocumentWorkflowPanel";
import { issuanceScopeCurrent, requireIssuanceScope, normalizeIssuanceError, prepareEducationIssuanceArtifacts, readEducationIssuance, type EducationIssuanceScope, type PreparedArtifactPreparation } from "@/lib/educationIssuance/client";
import { createScopedOrgDocumentTransport } from '@/lib/programFiles';
import { useDocumentActionPermissions } from '@/hooks/useDocumentActionPermissions';
import { IssuanceTemplateDialog } from './TemplateCreateDialog';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import { prepareArtifactRender, type PreparedArtifactRender } from "@/lib/educationIssuance/artifactWorker";
import type { IssuancePreparation, IssuancePreparationPlan, IssuanceTemplateRef } from "@/lib/educationIssuance/types";

type WithoutTemplate<T>=T extends unknown?Omit<T,"template">:never;
export type IssuancePlanDraft=WithoutTemplate<IssuancePreparationPlan>;
const labels={prepared:"Ещё не сформирован",rendered_unissued:"PDF сохранён, выдачи нет",approved_unissued:"Версия утверждена, выдачи нет",consumed:"Выдача зарегистрирована",stale:"Нужна новая подготовка"} as const;

export function IssuancePreparationRecovery({scope,kind,onRecover,onOpenRecord,disabled=false}:{scope:EducationIssuanceScope;kind:"original"|"duplicate";onRecover:(value:IssuancePreparation)=>Promise<void>;onOpenRecord?:(id:string)=>void;disabled?:boolean}){
  const [items,setItems]=useState<Extract<import("@/lib/educationIssuance/types").IssuanceRead,{kind:"preparations"}>["items"]>([]);
  const [next,setNext]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [completed,setCompleted]=useState<string[]>([]);
  const sequence=useRef(0),flight=useRef(false);
  useEffect(()=>{++sequence.current;setItems([]);setNext(null);setLoaded(false);setCompleted([]);setError(null);flight.current=false;setBusy(false);return()=>{++sequence.current;};},[scope]);
  const load=async(more=false)=>{
    if(disabled||flight.current||!issuanceScopeCurrent(scope))return;
    const run=sequence.current;flight.current=true;setBusy(true);setError(null);
    try{const result=await readEducationIssuance(scope,{kind:"preparations",after_id:more?next:null,limit:50,filter:"all"});
      if(run===sequence.current&&issuanceScopeCurrent(scope)&&result.kind==="preparations"){setItems(previous=>more?[...previous,...result.items]:result.items);setNext(result.next_after_id);setLoaded(true);}
    }catch(cause){if(run===sequence.current&&issuanceScopeCurrent(scope))setError(normalizeIssuanceError(cause).message);}
    finally{if(run===sequence.current){flight.current=false;setBusy(false);}}
  };
  const recover=async(id:string)=>{
    if(disabled||flight.current||!issuanceScopeCurrent(scope))return;
    const run=sequence.current;flight.current=true;setBusy(true);setError(null);setCompleted([]);
    try{const value=await readEducationIssuance(scope,{kind:"preparation",preparation_id:id});if(run===sequence.current&&issuanceScopeCurrent(scope)&&value.kind==="preparation"){if(value.preparation.items.every(item=>item.status==="consumed"&&item.final_record_id))setCompleted(value.preparation.items.map(item=>item.final_record_id!));else await onRecover(value.preparation);}}
    catch(cause){if(run===sequence.current&&issuanceScopeCurrent(scope))setError(cause instanceof Error&&cause.name!=="EducationIssuanceError"?cause.message:normalizeIssuanceError(cause).message);}
    finally{if(run===sequence.current){flight.current=false;setBusy(false);}}
  };
  return <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-medium">Продолжить сохранённую подготовку</summary>
    <div className="space-y-2 mt-3"><p className="text-xs text-muted-foreground">Только ваши подготовки в этой организации и выбранной группе. Файлы и основания повторно проверяются по текущим правам.</p>
      <Button variant="outline" size="sm" disabled={disabled||busy} onClick={()=>void load()}>Показать подготовки</Button>
      {items.filter(item=>item.kind===kind).map(item=><div key={item.id} className="flex flex-wrap gap-2 items-center justify-between rounded-lg bg-muted/30 p-2 text-sm">
        <span>{new Date(item.created_at).toLocaleString("ru-RU")} · документов {item.item_count} · утверждено {item.approved_unissued_count} · ещё не сформировано {item.prepared_count} · зарегистрировано {item.consumed_count}</span>
        <Button variant="outline" size="sm" disabled={disabled||busy} onClick={()=>void recover(item.id)}>Продолжить</Button>
      </div>)}
      {loaded&&!items.some(item=>item.kind===kind)&&<p className="text-xs text-muted-foreground">В загруженной части таких подготовок нет.</p>}
      {completed.length>0&&<div className="rounded-lg border p-3 space-y-2"><p className="text-sm">Выдача этой подготовки уже зарегистрирована. Повторная выдача не выполняется.</p>{onOpenRecord&&completed.map(id=><Button key={id} variant="outline" size="sm" disabled={disabled||busy} onClick={()=>onOpenRecord(id)}>Открыть зарегистрированный документ {id.slice(0,8)}</Button>)}</div>}
      {next&&<Button variant="outline" size="sm" disabled={disabled||busy} onClick={()=>void load(true)}>Ещё подготовки</Button>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    </div></details>;
}

interface Props{scope:EducationIssuanceScope;draft:IssuancePlanDraft;preparation:IssuancePreparation|null;onChange:(value:IssuancePreparation|null)=>void;onLockChange:(value:boolean)=>void;disabled?:boolean;learnerLabels?:Record<string,string>;onOpenRecord?:(id:string)=>void;}
export function IssuanceArtifactPreparation(props:Props){
  const templatePermissions=useDocumentActionPermissions(props.scope.organizationId);
  const [templateDialog,setTemplateDialog]=useState(false);
  const draftKey=JSON.stringify(props.draft),active=useRef({key:draftKey,scope:props.scope,revision:0});
  if(active.current.key!==draftKey||active.current.scope!==props.scope)active.current={key:draftKey,scope:props.scope,revision:active.current.revision+1};
  const draftRevision=active.current.revision;
  const mounted=useRef(true);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const scope=useMemo(()=>({...props.scope,current:()=>mounted.current&&active.current.revision===draftRevision&&issuanceScopeCurrent(props.scope)}),[props.scope,draftKey,draftRevision]);
  const [templates,setTemplates]=useState<{label:string;template:IssuanceTemplateRef}[]>([]),[nextTemplate,setNextTemplate]=useState<string|null>(null),[templateId,setTemplateId]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[reviewItem,setReviewItem]=useState<string|null>(null);
  const create=useRef<PreparedArtifactPreparation|null>(null),renderOps=useRef(new Map<string,PreparedArtifactRender>()),flight=useRef(false),epoch=useRef(0);
  const prep=props.preparation;
  const storedDraft=prep?Object.fromEntries(Object.entries(prep.plan).filter(([key])=>key!=="template")):null;
  const matches=!prep||sameCopyValue(storedDraft,props.draft);
  const current=issuanceScopeCurrent(scope)&&matches,locked=busy||!!create.current||templateDialog;
  useEffect(()=>{++epoch.current;flight.current=false;create.current=null;renderOps.current.clear();setBusy(false);setTemplates([]);setNextTemplate(null);setTemplateId("");setReviewItem(null);setError(null);setTemplateDialog(false);props.onLockChange(false);return()=>{++epoch.current;props.onLockChange(false);};},[scope]);
  const setLock=(value:boolean)=>{setBusy(value);props.onLockChange(value||!!create.current||templateDialog);};
  const openTemplateDialog=(value:boolean)=>{setTemplateDialog(value);props.onLockChange(value||busy||!!create.current);};
  const loadTemplates=async(more=false)=>{
    if(!current||flight.current||props.disabled)return;
    const run=epoch.current;flight.current=true;setLock(true);setError(null);
    try{const result=await readEducationIssuance(scope,{kind:"templates",after_version_id:more?nextTemplate:null,limit:100});
      if(run===epoch.current&&issuanceScopeCurrent(scope)&&result.kind==="templates"){setTemplates(previous=>more?[...previous,...result.items]:result.items);setNextTemplate(result.next_after_version_id);}}
    catch(cause){if(run===epoch.current&&issuanceScopeCurrent(scope))setError(normalizeIssuanceError(cause).message);}
    finally{if(run===epoch.current){flight.current=false;setLock(false);}}
  };
  const prepare=async()=>{
    if(!current||flight.current||props.disabled)return;
    const template=templates.find(row=>row.template.source.version_id===templateId)?.template;
    if(!create.current&&!template)return;
    const run=epoch.current;flight.current=true;setLock(true);setError(null);
    try{create.current??=prepareEducationIssuanceArtifacts(scope,{...props.draft,template:template!} as IssuancePreparationPlan);
      const value=await create.current.run();if(run!==epoch.current||!issuanceScopeCurrent(scope))return;
      create.current=null;props.onChange(value.preparation);}
    catch(cause){if(run===epoch.current&&issuanceScopeCurrent(scope)){const failure=normalizeIssuanceError(cause);setError(failure.message);if(failure.code!=="DEPENDENCY_UNAVAILABLE")create.current=null;}}
    finally{if(run===epoch.current){flight.current=false;setLock(false);}}
  };
  const refresh=async()=>{
    if(!prep||!current||flight.current||props.disabled)return;
    const run=epoch.current;flight.current=true;setLock(true);setError(null);
    try{const value=await readEducationIssuance(scope,{kind:"preparation",preparation_id:prep.id});if(run===epoch.current&&issuanceScopeCurrent(scope)&&value.kind==="preparation")props.onChange(value.preparation);}
    catch(cause){if(run===epoch.current&&issuanceScopeCurrent(scope))setError(normalizeIssuanceError(cause).message);}
    finally{if(run===epoch.current){flight.current=false;setLock(false);}}
  };
  const render=async(itemId?:string)=>{
    if(!prep||!current||flight.current||props.disabled)return;
    const run=epoch.current;flight.current=true;setLock(true);setError(null);let value=prep;
    try{
      const ids=itemId?[itemId]:prep.items.filter(item=>item.status==="prepared").map(item=>item.id);
      for(const id of ids){
        if(!issuanceScopeCurrent(scope)||run!==epoch.current)return;
        let operation=renderOps.current.get(id);if(!operation){operation=prepareArtifactRender(scope,value,id);renderOps.current.set(id,operation);}
        value=await operation.run();if(run!==epoch.current||!issuanceScopeCurrent(scope))return;
        props.onChange(value);
      }
    }catch(cause){if(run===epoch.current&&issuanceScopeCurrent(scope))setError(normalizeIssuanceError(cause).message);}
    finally{if(run===epoch.current){flight.current=false;setLock(false);}}
  };
  const reviewedItem=prep?.items.find(item=>item.id===reviewItem),review=reviewedItem?.artifact;
  const reviewAvailable=current&&!props.disabled&&!!review&&reviewedItem?.status!=="consumed"&&
    prep?.organization_id===scope.organizationId&&sameCopyValue(prep.scope,scope.issuanceScope);
  // A new preparation, output, version, permission state or open/close transition
  // permanently invalidates callbacks captured by the previous review surface.
  const reviewKey=JSON.stringify([scope.actorId,scope.organizationId,scope.accessRevision,scope.issuanceScope,draftRevision,
    prep?.id,reviewItem,reviewedItem?.input_revision,reviewedItem?.status,review?.source,reviewAvailable,
    templatePermissions.canIssue,templatePermissions.canSign,templatePermissions.canWrite,templatePermissions.canSalesWrite]);
  const reviewOwner=useRef({key:reviewKey,revision:0});
  if(reviewOwner.current.key!==reviewKey)reviewOwner.current={key:reviewKey,revision:reviewOwner.current.revision+1};
  const reviewRevision=reviewOwner.current.revision;
  const sourceDownload=useMemo(()=>({controller:new AbortController(),assertCurrent:()=>{
    requireIssuanceScope(scope);
    if(reviewOwner.current.revision!==reviewRevision||!reviewAvailable)
      throw new Error('Выбранный итоговый файл изменился. Откройте его проверку заново.');
  }}),[scope,reviewRevision]);
  useLayoutEffect(()=>()=>sourceDownload.controller.abort(),[sourceDownload]);
  const sourceTransport=useMemo(()=>createScopedOrgDocumentTransport({actorId:scope.actorId,organizationId:scope.organizationId,
    accessRevision:scope.accessRevision,key:JSON.stringify(['issuance-output',reviewKey,reviewRevision]),
    current:()=>{sourceDownload.assertCurrent();return true;},
  },false),[scope,reviewKey,reviewRevision,sourceDownload]);
  return <div className="space-y-3 rounded-xl border p-4">
    <h3 className="font-medium">Итоговый файл перед выдачей</h3>
    <p className="text-sm text-muted-foreground">PDF формируется из выбранной утверждённой версии шаблона, сохраняется отдельной неизменяемой версией и проходит обычное внутреннее утверждение. Формирование файла ещё не означает выдачу или вручение.</p>
    {!prep&&<>
      <Button variant="outline" disabled={!current||locked||props.disabled} onClick={()=>void loadTemplates()}>Выбрать утверждённый HTML-шаблон</Button>
      <Button variant="outline" disabled={!current||locked||props.disabled||!templatePermissions.canWrite} onClick={()=>openTemplateDialog(true)}>Новый шаблон</Button>
      {templates.length>0&&<Select value={templateId} onValueChange={setTemplateId} disabled={locked||props.disabled}><SelectTrigger aria-label="Утверждённый шаблон итогового документа"><SelectValue placeholder="Выберите точную версию шаблона"/></SelectTrigger><SelectContent>{templates.map(row=><SelectItem key={row.template.source.version_id} value={row.template.source.version_id}>{row.label}</SelectItem>)}</SelectContent></Select>}
      {nextTemplate&&<Button variant="outline" size="sm" disabled={locked||props.disabled} onClick={()=>void loadTemplates(true)}>Ещё шаблоны</Button>}
      <p className="text-xs text-muted-foreground">Если подходящего шаблона нет, откройте «Новый шаблон», загрузите отдельный HTML-файл и утвердите конкретную версию. Сохранённые, но ещё не утверждённые шаблоны доступны в этом же окне.</p>
      <Button disabled={!current||busy||props.disabled||!templateId&&!create.current} onClick={()=>void prepare()}>{busy?"Подготовка…":create.current?"Повторить ту же подготовку":"Создать подготовку файлов"}</Button>
    </>}
    {current&&prep&&<>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={locked||props.disabled} onClick={()=>void refresh()}>Проверить файлы и утверждение</Button>
        {prep.items.some(item=>item.status==="prepared")&&<Button disabled={locked||props.disabled} onClick={()=>void render()}>Сформировать ожидающие PDF</Button>}
        <Button variant="outline" disabled={locked||props.disabled} onClick={()=>props.onChange(null)}>Новая подготовка</Button></div>
      {prep.items.map(item=><div key={item.id} className="space-y-2 rounded-xl bg-muted/30 p-3 text-sm">
        <p className="font-medium">{props.learnerLabels?.[item.enrollment_id]??"Зачисление "+item.enrollment_id.slice(0,8)}</p><Badge variant="outline">{labels[item.status]}</Badge>
        <p className="text-xs text-muted-foreground">{item.status==="consumed"?"Реквизиты сохранённой выдачи":"Предварительные реквизиты: номера ещё не заняты"}: {item.number_plan.document_series} №{item.number_plan.document_number}, рег. {item.number_plan.reg_number}, дата {item.number_plan.issue_date}</p>
        {item.status==="prepared"&&<Button variant="outline" size="sm" disabled={locked||props.disabled} onClick={()=>void render(item.id)}>{renderOps.current.has(item.id)?"Повторить тот же запрос формирования":"Сформировать PDF"}</Button>}
        {item.artifact&&item.status!=="consumed"&&<Button variant="outline" size="sm" disabled={locked||props.disabled} onClick={()=>setReviewItem(previous=>previous===item.id?null:item.id)}>Открыть файл и внутреннее утверждение</Button>}
        {item.status==="consumed"&&item.final_record_id&&props.onOpenRecord&&<Button variant="outline" size="sm" onClick={()=>props.onOpenRecord!(item.final_record_id!)}>Открыть зарегистрированный документ</Button>}
        {item.status==="stale"&&<p className="text-xs text-muted-foreground">Прежний файл сохранён без новой выдачи. Проверьте источники и создайте новую подготовку.</p>}
      </div>)}
      {reviewAvailable&&review&&<OrgDocumentWorkflowPanel key={sourceTransport.key} organizationId={scope.organizationId} documentId={review.source.document_id} currentVersionId={review.source.version_id}
        transport={sourceTransport} sourceOpenMode="download" sourceDownloadSignal={sourceDownload.controller.signal} sourceDownloadAssertCurrent={sourceDownload.assertCurrent}/>}
      <p className="text-xs text-muted-foreground">После утверждения нажмите «Проверить файлы и утверждение». Регистрация выдачи выполняется отдельным подтверждением.</p>
    </>}
    <IssuanceTemplateDialog open={templateDialog} onOpenChange={openTemplateDialog} scope={scope} canWrite={templatePermissions.canWrite} onReturnToTemplates={()=>void loadTemplates()}/>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {!current&&<p role="alert" className="text-sm text-destructive">Доступ или выбранная подготовка изменились. Откройте проверку заново.</p>}
  </div>;
}
