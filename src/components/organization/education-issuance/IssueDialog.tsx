import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { studentDetailsPath } from '@/lib/groups/groupContext';
import { issuanceUtcDateIso } from "@/lib/educationIssuance/date";
import { sameCopyValue } from "@/lib/copyRegistry/value";
import { useEducationIssuanceScope } from "@/hooks/useEducationIssuance";
import { artifactFinalRef, EducationIssuanceError, issuanceScopeCurrent, normalizeIssuanceError, prepareEducationIssuanceMutation, readEducationIssuance, type EducationIssuanceScope, type PreparedIssuanceMutation } from "@/lib/educationIssuance/client";
import type { IssuanceCandidate, IssuancePreparation, IssuancePreview } from "@/lib/educationIssuance/types";
import { IssuanceArtifactPreparation, IssuancePreparationRecovery, type IssuancePlanDraft } from "./ArtifactPreparation";

interface Props {
  open:boolean;onOpenChange:(value:boolean)=>void;organizationId:string;groupId?:string|null;
  courses:{id:string;title:string}[];courseId?:string|null;focusEnrollmentId?:string|null;
  documentTypeFilter?:"certificate"|"diploma"|"qualification";onIssued:()=>void;onOpenRecord:(id:string)=>void;
}
function matchesPreview(preparation:IssuancePreparation,preview:IssuancePreview) {
  const plan=preparation.plan;if(plan.kind!=="original"||!preview.ready||!sameCopyValue(plan.intent,preview.intent)||plan.preview_hash!==preview.preview_hash)return false;
  return plan.items.length===preview.candidates.length&&plan.items.every(item=>sameCopyValue(item.expected_eligibility_ref,preview.candidates.find(row=>row.enrollment_id===item.enrollment_id)?.eligibility_ref));
}
export function IssueEducationDialog(props:Props){
  const capture=useEducationIssuanceScope(props.organizationId,props.groupId,JSON.stringify([props.open,props.courseId,props.focusEnrollmentId])),navigate=useNavigate();
  const [scope,setScope]=useState<EducationIssuanceScope|null>(null),[courseId,setCourseId]=useState(props.courseId??"");
  const [candidates,setCandidates]=useState<IssuanceCandidate[]>([]),[after,setAfter]=useState<string|null>(null);
  const [selected,setSelected]=useState<Set<string>>(new Set()),[preview,setPreview]=useState<IssuancePreview|null>(null),[preparation,setPreparation]=useState<IssuancePreparation|null>(null);
  const [date,setDate]=useState(issuanceUtcDateIso()),[series,setSeries]=useState(""),[reason,setReason]=useState("");
  const [busy,setBusy]=useState(false),[artifactBusy,setArtifactBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const flight=useRef(false),epoch=useRef(0),operation=useRef<PreparedIssuanceMutation|null>(null);
  useEffect(()=>{
    ++epoch.current;flight.current=false;operation.current=null;setPreview(null);setPreparation(null);setCandidates([]);setAfter(null);setBusy(false);setArtifactBusy(false);setError(null);setDate(issuanceUtcDateIso());setSeries("");setReason("");
    setCourseId(props.courseId??"");setSelected(new Set(props.focusEnrollmentId&&props.courseId?[props.focusEnrollmentId]:[]));
    if(!props.open){setScope(null);return;}try{setScope(capture());}catch(cause){setScope(null);setError(normalizeIssuanceError(cause).message);}
  },[props.open,props.organizationId,props.groupId,props.courseId,props.focusEnrollmentId,capture]);
  const current=!!scope&&issuanceScopeCurrent(scope),locked=busy||artifactBusy||!!operation.current;
  const load=async(append=false)=>{
    if(!scope||!current||!courseId||flight.current)return;const run=epoch.current;flight.current=true;setBusy(true);setError(null);
    try{
      const value=await readEducationIssuance(scope,{kind:"candidates",course_id:courseId,after_enrollment_id:append?after:null,limit:100,filter:"all"});
      if(run!==epoch.current||!issuanceScopeCurrent(scope)||value.kind!=="candidates")return;
      setCandidates(previous=>append?[...previous,...value.items]:value.items);setAfter(value.next_after_enrollment_id);
      if(props.focusEnrollmentId&&value.items.some(row=>row.enrollment_id===props.focusEnrollmentId))setSelected(previous=>new Set([...previous,props.focusEnrollmentId!]));
    }catch(cause){if(run===epoch.current&&issuanceScopeCurrent(scope))setError(normalizeIssuanceError(cause).message);}
    finally{if(run===epoch.current){flight.current=false;setBusy(false);}}
  };
  useEffect(()=>{
    if(preparation?.plan.kind==="original"&&preparation.plan.intent.course_id===courseId)return;
    setCandidates([]);setAfter(null);setPreview(null);if(scope&&courseId)void load();
  },[scope,courseId]);
  const check=async()=>{
    if(!scope||!current||flight.current||!courseId||!selected.size)return;const run=epoch.current;flight.current=true;setBusy(true);setError(null);
    try{const value=await readEducationIssuance(scope,{kind:"preview_issue",intent:{course_id:courseId,enrollment_ids:[...selected],issue_date:date,document_series:series.trim()||null}});
      if(run===epoch.current&&issuanceScopeCurrent(scope)&&value.kind==="preview_issue"){setPreview(value.preview);setPreparation(null);}}
    catch(cause){if(run===epoch.current&&issuanceScopeCurrent(scope))setError(normalizeIssuanceError(cause).message);}
    finally{if(run===epoch.current){flight.current=false;setBusy(false);}}
  };
  const recover=async(value:IssuancePreparation)=>{
    if(!scope||!current||value.plan.kind!=="original"||props.courseId&&value.plan.intent.course_id!==props.courseId)throw new EducationIssuanceError("INVALID_INPUT");
    const plan=value.plan,result=await readEducationIssuance(scope,{kind:"preview_issue",intent:plan.intent});
    if(!issuanceScopeCurrent(scope))return;
    if(result.kind!=="preview_issue"||!matchesPreview(value,result.preview))throw new EducationIssuanceError("SOURCE_CHANGED");
    if(props.documentTypeFilter&&result.preview.candidates.some(row=>row.document_type!==props.documentTypeFilter))throw new EducationIssuanceError("INVALID_INPUT");
    setCourseId(plan.intent.course_id);setDate(plan.intent.issue_date);setSeries(plan.intent.document_series??"");setReason(plan.reason);setSelected(new Set(plan.intent.enrollment_ids));
    setCandidates(result.preview.candidates);setPreview(result.preview);setPreparation(value);setError(null);
  };
  const draft:IssuancePlanDraft|null=preview?.ready&&reason.trim()?{kind:"original",intent:preview.intent,preview_hash:preview.preview_hash,items:preview.candidates.map(row=>({enrollment_id:row.enrollment_id,expected_eligibility_ref:row.eligibility_ref!})),reason:reason.trim()}:null;
  const allApproved=!!preparation&&preparation.items.every(item=>item.status==="approved_unissued"&&!!item.artifact?.output_review);
  const confirm=async()=>{
    if(!scope||!current||flight.current||artifactBusy||!preview?.ready||!preparation||!reason.trim())return;
    const run=epoch.current;flight.current=true;setBusy(true);setError(null);
    try{
      if(!operation.current){
        const refreshed=await readEducationIssuance(scope,{kind:"preparation",preparation_id:preparation.id});
        if(run!==epoch.current||!issuanceScopeCurrent(scope))return;
        if(refreshed.kind!=="preparation"||!sameCopyValue(refreshed.preparation.plan,preparation.plan))throw new EducationIssuanceError("SOURCE_CHANGED");
        const fresh=refreshed.preparation,plan=fresh.plan;if(plan.kind!=="original")throw new EducationIssuanceError("INVALID_INPUT");
        const checked=await readEducationIssuance(scope,{kind:"preview_issue",intent:plan.intent});
        if(run!==epoch.current||!issuanceScopeCurrent(scope))return;
        if(checked.kind!=="preview_issue"||!matchesPreview(fresh,checked.preview))throw new EducationIssuanceError("SOURCE_CHANGED");
        operation.current=prepareEducationIssuanceMutation(scope,{action:"issue_batch",intent:plan.intent,preview_hash:checked.preview.preview_hash,
          items:checked.preview.candidates.map(row=>({enrollment_id:row.enrollment_id,expected_eligibility_ref:row.eligibility_ref!,artifact:artifactFinalRef(fresh,fresh.items.find(item=>item.enrollment_id===row.enrollment_id)!.id)})),reason:plan.reason});
      }
      if(run!==epoch.current||!issuanceScopeCurrent(scope))return;
      const value=await operation.current.run();if(run!==epoch.current||!issuanceScopeCurrent(scope))return;
      operation.current=null;toast.success("Выдано документов: "+value.records.length+". Сохранённые PDF закреплены; вручение оформляется отдельно.");props.onIssued();props.onOpenChange(false);
    }catch(cause){if(run===epoch.current&&issuanceScopeCurrent(scope)){const failure=normalizeIssuanceError(cause);setError(failure.message);
      if(failure.code!=="DEPENDENCY_UNAVAILABLE"){operation.current=null;if(["SOURCE_CHANGED","NUMBER_PLAN_STALE","REVISION_CONFLICT","PREREQUISITE_MISSING"].includes(failure.code)){setPreparation(null);setPreview(null);}}}}
    finally{if(run===epoch.current){flight.current=false;setBusy(false);}}
  };
  const rows=current?preview?.candidates??candidates:[];
  const changed=()=>{setPreview(null);setPreparation(null);};
  return <Dialog open={props.open} onOpenChange={value=>{if(!locked)props.onOpenChange(value);}}><DialogContent className="max-w-4xl rounded-2xl max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>Проверяемая выдача документов</DialogTitle><DialogDescription>Сервер проверяет фактическую программу, итог аттестации, условия приёма и полномочия. После этого нужно сформировать и утвердить точный итоговый PDF и отдельно подтвердить выдачу. Прогресс 100% сам по себе права на документ не даёт.</DialogDescription></DialogHeader>
    {current&&scope&&<IssuancePreparationRecovery scope={scope} kind="original" disabled={locked||!!preparation} onRecover={recover} onOpenRecord={id=>{props.onOpenChange(false);props.onOpenRecord(id);}}/>}
    <fieldset disabled={!current||locked||!!preparation} className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3"><div className="space-y-2 sm:col-span-2"><Label>Точный курс</Label><Select value={courseId} onValueChange={id=>{setCourseId(id);setSelected(new Set());changed();}} disabled={!!props.courseId}><SelectTrigger aria-label="Точный курс"><SelectValue placeholder="Выберите курс"/></SelectTrigger><SelectContent>{props.courses.map(course=><SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Дата выдачи</Label><Input aria-label="Дата выдачи" type="date" max={issuanceUtcDateIso()} value={date} onChange={event=>{setDate(event.target.value);changed();}}/><p className="text-xs text-muted-foreground">Дата выдачи проверяется по UTC. Сегодня: {issuanceUtcDateIso()}.</p></div></div>
      <div className="grid sm:grid-cols-2 gap-3"><div className="space-y-2"><Label>Серия, если применяется</Label><Input aria-label="Серия, если применяется" value={series} maxLength={120} onChange={event=>{setSeries(event.target.value);changed();}}/></div><div className="space-y-2"><Label>Основание решения сотрудника</Label><Textarea aria-label="Основание решения сотрудника" value={reason} maxLength={2000} onChange={event=>{setReason(event.target.value);setPreparation(null);}}/></div></div>
    </fieldset>
    <div className="space-y-2">{rows.map(row=><div key={row.enrollment_id} className="rounded-xl border p-3 space-y-2"><div className="flex gap-3 items-start">
      {!preview&&<Checkbox aria-label={"Выбрать "+row.learner_label} checked={selected.has(row.enrollment_id)} disabled={locked||!current||row.existing_original_record_id!==null||!!props.documentTypeFilter&&row.document_type!==props.documentTypeFilter} onCheckedChange={checked=>setSelected(previous=>{const next=new Set(previous);checked?next.add(row.enrollment_id):next.delete(row.enrollment_id);return next;})}/>}
      <div className="flex-1"><p className="font-medium">{row.learner_label}</p><p className="text-xs text-muted-foreground">Техническое состояние: {row.technical_status} · {row.technical_progress}%{row.withdrawn?" · обучение прекращено":""}</p></div>
      {row.existing_original_record_id&&<Button variant="outline" size="sm" disabled={locked} onClick={()=>{props.onOpenChange(false);props.onOpenRecord(row.existing_original_record_id!);}}>Открыть документ</Button>}</div>
      {row.blockers.length>0?<ul className="text-sm text-muted-foreground space-y-1">{row.blockers.map((blocker,index)=><li key={index}>{blocker.label}</li>)}</ul>:<p className="text-sm text-green-700">Предварительные условия выдачи подтверждены текущими источниками.</p>}
      {row.blockers.some(blocker=>["open_admission","review_final_education","open_outcome","review_registration"].includes(blocker.next_action))&&<Button size="sm" variant="outline" disabled={locked} onClick={()=>{props.onOpenChange(false);navigate(studentDetailsPath(row.user_id,{groupId:props.groupId}));}}>Открыть карточку ученика: приём и результаты</Button>}
    </div>)}</div>
    {current&&after&&!preview&&<Button variant="outline" disabled={busy} onClick={()=>void load(true)}>Ещё зачисления</Button>}
    {current&&courseId&&!rows.length&&!busy&&<p className="text-sm text-muted-foreground">Для выбранного курса зачисления не найдены с текущими правами.</p>}
    {preview&&!preview.ready&&<p className="text-sm font-medium">Выдача не выполнялась. Устраните причины и повторите проверку.</p>}
    {current&&scope&&draft&&<IssuanceArtifactPreparation scope={scope} draft={draft} preparation={preparation} onChange={setPreparation} onLockChange={setArtifactBusy} disabled={busy||!!operation.current} learnerLabels={Object.fromEntries(rows.map(row=>[row.enrollment_id,row.learner_label]))} onOpenRecord={id=>{props.onOpenChange(false);props.onOpenRecord(id);}}/>}
    {preview?.ready&&!reason.trim()&&<p className="text-sm text-muted-foreground">Укажите основание решения сотрудника, затем подготовьте итоговые файлы.</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={locked} onClick={()=>props.onOpenChange(false)}>Закрыть</Button>{preview?<><Button variant="outline" disabled={locked} onClick={()=>{setPreview(null);setPreparation(null);}}>Изменить выбор</Button><Button disabled={!current||busy||artifactBusy||!preview.ready||!reason.trim()||!allApproved&&!operation.current} onClick={()=>void confirm()}>{busy?"Сохранение…":operation.current?"Повторить тот же запрос":"Подтвердить выдачу"}</Button></>:<Button disabled={!current||busy||!selected.size||selected.size>100||!date||!courseId} onClick={()=>void check()}>{busy?"Проверка…":"Проверить выбранных ("+selected.size+")"}</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}
