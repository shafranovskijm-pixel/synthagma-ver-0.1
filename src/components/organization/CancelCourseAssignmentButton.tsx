import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { useEducationIssuanceScope } from "@/hooks/useEducationIssuance";
import { issuanceScopeCurrent } from "@/lib/educationIssuance/client";
import { AssignmentRemovalError, prepareAssignmentRemoval, readAssignmentRemoval, type AssignmentRemovalState } from "@/api/erroneousCourseAssignment";
import { WithdrawalDialog } from "./education-issuance/WithdrawalDialog";
import { toast } from "sonner";
interface Props {
 enrollmentId:string;organizationId:string;groupId?:string|null;courseTitle:string;
 studentName?:string;progress?:number;timeSpent?:number;status?:string|null;completedAt?:string|null;hasTestAttempts?:boolean;onCancelled:()=>void;
}
/** An erroneous unstarted assignment has a technical cancellation. Actual study keeps the retained withdrawal flow. */
export function CancelCourseAssignmentButton(props:Props){
 const {can,loading}=useStaffPermissions();const capture=useEducationIssuanceScope(props.organizationId,props.groupId);
 const [state,setState]=useState<AssignmentRemovalState|null>(null),[checkError,setCheckError]=useState(false),[checking,setChecking]=useState(false);
 const [removeOpen,setRemoveOpen]=useState(false),[withdrawOpen,setWithdrawOpen]=useState(false),[busy,setBusy]=useState(false),[saveError,setSaveError]=useState<AssignmentRemovalError|null>(null);
 const operation=useRef<ReturnType<typeof prepareAssignmentRemoval>|null>(null),epoch=useRef(0);
 useEffect(()=>{
  ++epoch.current;setState(null);setCheckError(false);setChecking(false);setRemoveOpen(false);setWithdrawOpen(false);setSaveError(null);setBusy(false);operation.current=null;
  return()=>{++epoch.current;};
 },[capture,props.enrollmentId,loading,can]);
 const preflight=async()=>{
  if(checking||busy||loading||!can("students.write"))return;const run=epoch.current;let scope:ReturnType<typeof capture>;
  try{scope=capture();if(!issuanceScopeCurrent(scope))return;}catch{setCheckError(true);return;}
  setChecking(true);setCheckError(false);setSaveError(null);operation.current=null;
  try{const value=await readAssignmentRemoval(scope,props.enrollmentId);if(run!==epoch.current||!issuanceScopeCurrent(scope))return;setState(value);
   if(value.can_remove)setRemoveOpen(true);else if(value.can_withdraw)setWithdrawOpen(true);
  }catch{if(run===epoch.current&&issuanceScopeCurrent(scope))setCheckError(true);}
  finally{if(run===epoch.current)setChecking(false);}
 };
 const remove=async()=>{
  if(busy||!state?.can_remove)return;const run=epoch.current;let scope:ReturnType<typeof capture>;
  try{scope=capture();if(!issuanceScopeCurrent(scope))return;}catch{return;}
  setBusy(true);setSaveError(null);
  try{
   const prepared=operation.current??prepareAssignmentRemoval(scope,state);operation.current=prepared;
   await prepared.run();if(run!==epoch.current||!issuanceScopeCurrent(scope))return;
   setState({...state,state:"removed",can_remove:false,can_withdraw:false,reason:"ALREADY_REMOVED"});setRemoveOpen(false);operation.current=null;toast.success("Курс удалён из назначенных");props.onCancelled();
  }catch(error){if(run!==epoch.current||!issuanceScopeCurrent(scope))return;const value=error instanceof AssignmentRemovalError?error:new AssignmentRemovalError("DEPENDENCY_UNAVAILABLE",true);setSaveError(value);if(!value.retryable)operation.current=null;}
  finally{if(run===epoch.current)setBusy(false);}
 };
 if(loading||!can("students.write")||!props.enrollmentId||!props.organizationId)return null;
 if(state?.state==="removed")return <Badge variant="secondary">Назначение удалено · история сохранена</Badge>;
 if(state?.state==="withdrawn")return <Badge variant="secondary">Обучение прекращено · история сохранена</Badge>;
 const visualStarted=(props.progress??0)>0||(props.timeSpent??0)>0||props.status==="completed"||!!props.completedAt||!!props.hasTestAttempts;
 const buttonLabel=checking?"Проверяем назначение…":checkError?"Проверить назначение":state?.can_remove?"Удалить курс":state?.can_withdraw?"Прекратить обучение":visualStarted?"Прекратить обучение":"Удалить курс";
 return <>
  <Button type="button" size="sm" variant="outline" className="rounded-lg gap-2" disabled={checking||busy} onClick={()=>void preflight()}><X className="w-4 h-4"/>{buttonLabel}</Button>
  <AlertDialog open={removeOpen} onOpenChange={value=>{if(!busy)setRemoveOpen(value);}}>
   <AlertDialogContent className="rounded-2xl"><AlertDialogHeader><AlertDialogTitle>Удалить назначение курса?</AlertDialogTitle><AlertDialogDescription>Курс «{props.courseTitle}» будет удалён из назначенных{props.studentName?" для "+props.studentName:""}. Личное дело ученика и история назначения сохранятся. Сервер ещё раз проверит, что обучение не началось.</AlertDialogDescription></AlertDialogHeader>
    {saveError&&<p role="alert" className="text-sm text-destructive">{saveError.message}</p>}
    <AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
     {saveError&&!saveError.retryable?<Button variant="outline" onClick={()=>{setRemoveOpen(false);void preflight();}}>Проверить заново</Button>:<AlertDialogAction disabled={busy} onClick={event=>{event.preventDefault();void remove();}}>{busy?"Удаляем…":saveError?"Повторить тот же запрос":"Удалить назначение"}</AlertDialogAction>}
    </AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog>
  <WithdrawalDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} organizationId={props.organizationId} groupId={props.groupId} enrollmentIds={[props.enrollmentId]} labels={[props.studentName?props.studentName+" · "+props.courseTitle:props.courseTitle]} onWithdrawn={()=>{setState({...state!,state:"withdrawn",can_remove:false,can_withdraw:false,reason:"FORMALLY_WITHDRAWN"});props.onCancelled();}}/>
 </>;
}
