import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEducationIssuanceScope } from "@/hooks/useEducationIssuance";
import { issuanceScopeCurrent, normalizeIssuanceError, type EducationIssuanceScope } from "@/lib/educationIssuance/client";
import { downloadIssuanceExport, loadIssuanceExport } from "@/lib/educationIssuance/export";
import { proofStatus, recordStatus } from "@/lib/educationIssuance/presentation";
import { EnrollmentGroupScopePicker } from './EnrollmentGroupScopePicker';
import type { IssuanceRecord } from "@/lib/educationIssuance/types";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; organizationId: string; groupId?: string | null;
  assignments: { enrollmentId: string; courseId: string }[]; documentType?: "dpo" | "po"; }
export function ExistingIssuanceExportDialog(props: Props) {
  const [scope,setScope] = useState<EducationIssuanceScope|null>(null), [records,setRecords] = useState<IssuanceRecord[]>([]);
  const [missing,setMissing] = useState<{enrollment_id:string;code:string}[]>([]), [selected,setSelected] = useState<string[]>([]);
  const [busy,setBusy] = useState(false), [error,setError] = useState<string|null>(null);
  const contextKey=JSON.stringify([props.open,props.organizationId,props.groupId,props.assignments,props.documentType]);
  const [groupChoice,setGroupChoice]=useState<{key:string;id:string|null}|null>(null);
  const effectiveGroupId=props.groupId??(groupChoice?.key===contextKey?groupChoice.id:null);
  const capture = useEducationIssuanceScope(props.organizationId,effectiveGroupId,contextKey);
  const epoch = useRef(0), flight=useRef(false);
  const selectionKey=JSON.stringify(props.assignments), current=!!scope&&issuanceScopeCurrent(scope);
  useEffect(() => {
    const run=++epoch.current;setRecords([]);setMissing([]);setSelected([]);setError(null);setScope(null);flight.current=false;setBusy(false);
    if(!props.open)return;
    let captured:EducationIssuanceScope;try{captured=capture();}catch(cause){setError(normalizeIssuanceError(cause).message);return;}
    setScope(captured);flight.current=true;setBusy(true);
    void (async()=>{
      const byCourse=new Map<string,string[]>();
      for(const row of props.assignments){const ids=byCourse.get(row.courseId)??[];if(!ids.includes(row.enrollmentId))ids.push(row.enrollmentId);byCourse.set(row.courseId,ids);}
      if(!props.assignments.length||props.assignments.length>1000||byCourse.size>50)throw Error("Выберите от 1 до 1000 точных назначений, до 50 курсов.");
      const rows:IssuanceRecord[]=[], absent:{enrollment_id:string;code:string}[]=[];
      for(const [courseId,enrollmentIds] of byCourse){
        const {snapshot}=await loadIssuanceExport(captured,{kind:"export",selection:{kind:"enrollments",course_id:courseId,enrollment_ids:enrollmentIds},format:"canonical_snapshot"});
        rows.push(...snapshot.records);absent.push(...snapshot.missing);
      }
      if(run===epoch.current&&issuanceScopeCurrent(captured)){setRecords([...new Map(rows.map(row=>[row.official.id,row])).values()]);setMissing(absent);}
    })().catch(cause=>{if(run===epoch.current&&issuanceScopeCurrent(captured))setError(cause instanceof Error && !("code" in cause)?cause.message:normalizeIssuanceError(cause).message);})
      .finally(()=>{if(run===epoch.current){flight.current=false;setBusy(false);}});
    return()=>{++epoch.current;};
  },[props.open,props.organizationId,props.groupId,selectionKey,capture]);
  const exportSelected=async(format:"json"|"html")=>{
    if(!scope||!current||flight.current||!selected.length)return;
    flight.current=true;setBusy(true);setError(null);const run=epoch.current;
    try{await downloadIssuanceExport(scope,{kind:"export",selection:{kind:"records",record_ids:selected},format:"canonical_snapshot"},format);}
    catch(cause){if(run===epoch.current&&issuanceScopeCurrent(scope))setError(normalizeIssuanceError(cause).message);}
    finally{if(run===epoch.current){flight.current=false;setBusy(false);}}
  };
  const visible=current?records.filter(row=>!props.documentType||(props.documentType==="po"?row.official.document_type==="qualification":row.official.document_type!=="qualification")):[];
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}><DialogContent className="rounded-2xl max-w-3xl max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>Исходные факты для подготовки ФРДО</DialogTitle><DialogDescription>Выберите уже зарегистрированные документы. Выгрузка не выдаёт документ, не резервирует номер и не подтверждает отправку сведений в ФРДО.</DialogDescription></DialogHeader>
    <p className="text-sm text-muted-foreground">JSON содержит снимок фактов и историю, HTML — его читаемую версию. Формат официальной загрузки в ФРДО проверяется отдельно. При наличии оригинала и дубликата нужные записи выбираются явно.</p>
    {!props.groupId&&<EnrollmentGroupScopePicker organizationId={props.organizationId} enrollmentIds={props.assignments.map(row=>row.enrollmentId)} value={effectiveGroupId} disabled={busy} onChange={id=>setGroupChoice({key:contextKey,id})}/>}
    {current&&missing.length>0&&<div className="rounded-xl border p-3 text-sm space-y-1">{missing.map(row=><p key={row.enrollment_id}>{row.enrollment_id.slice(0,8)}: {row.code==="NOT_ISSUED"?"Документ ещё не выдан":"Есть только аннулированные документы"}. Новая выдача оформляется отдельно в журнале.</p>)}</div>}
    {current&&visible.map(record=><label key={record.official.id} className="flex items-start gap-3 rounded-xl border p-3 text-sm">
      <input type="checkbox" disabled={busy} checked={selected.includes(record.official.id)} onChange={event=>setSelected(previous=>event.target.checked?[...previous,record.official.id]:previous.filter(id=>id!==record.official.id))}/>
      <span><span className="font-medium">{record.official.full_name} · {record.official.document_number}</span><span className="block text-muted-foreground">{record.official.specialty_name} · {record.official.issue_date}</span><Badge variant="outline">{recordStatus(record)}</Badge><span className="block text-xs text-muted-foreground">{proofStatus(record)}</span></span>
    </label>)}
    {current&&!busy&&!visible.length&&<p className="text-sm text-muted-foreground">Соответствующих зарегистрированных документов нет. Номер при экспорте не создаётся.</p>}
    {busy&&<p role="status" className="text-sm text-muted-foreground">Проверяем текущие факты и доступ…</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {scope&&!current&&<p role="alert" className="text-sm text-destructive">Доступ изменился. Откройте окно заново.</p>}
    <DialogFooter><Button variant="outline" onClick={()=>props.onOpenChange(false)}>Закрыть</Button><Button disabled={!current||busy||!selected.length} onClick={()=>void exportSelected("json")}>Скачать JSON ({selected.length})</Button><Button variant="outline" disabled={!current||busy||!selected.length} onClick={()=>void exportSelected("html")}>Скачать HTML</Button></DialogFooter>
  </DialogContent></Dialog>;
}
