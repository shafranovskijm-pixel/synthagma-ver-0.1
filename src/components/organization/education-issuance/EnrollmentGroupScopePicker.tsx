import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEducationIssuanceScope } from '@/hooks/useEducationIssuance';
import { issuanceScopeCurrent, normalizeIssuanceError, type EducationIssuanceScope } from '@/lib/educationIssuance/client';
import { readEnrollmentGroupChoices, type EnrollmentGroupChoice } from '@/lib/educationIssuance/groupScope';

export function EnrollmentGroupScopePicker(props:{organizationId:string;enrollmentIds:string[];value:string|null;onChange:(id:string|null)=>void;disabled?:boolean}){
  const selectionKey=[...props.enrollmentIds].sort().join(',');
  const capture=useEducationIssuanceScope(props.organizationId,null,selectionKey), epoch=useRef(0);
  const [choiceScope,setChoiceScope]=useState<EducationIssuanceScope|null>(null);
  const [choices,setChoices]=useState<EnrollmentGroupChoice[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[loaded,setLoaded]=useState(false);
  useEffect(()=>{++epoch.current;setChoices([]);setChoiceScope(null);setLoaded(false);setBusy(false);setError(null);return()=>{++epoch.current;};},[capture]);
  const load=async()=>{
    if(busy||props.disabled)return;const run=epoch.current;setBusy(true);setError(null);
    try{const scope=capture(),rows=await readEnrollmentGroupChoices(scope,props.enrollmentIds);if(run===epoch.current&&issuanceScopeCurrent(scope)){setChoices(rows);setChoiceScope(scope);setLoaded(true);}}
    catch(cause){if(run===epoch.current)setError(normalizeIssuanceError(cause).message);}
    finally{if(run===epoch.current)setBusy(false);}
  };
  const visible=choiceScope&&issuanceScopeCurrent(choiceScope)?choices:[];
  return <div className="space-y-2 rounded-xl border p-3"><Label>Область действия</Label>
    <p className="text-xs text-muted-foreground">По организации можно работать только с соответствующим правом. Для сотрудника группы выберите фактическую общую группу назначений. Выбор не расширяет разрешения.</p>
    <div className="flex flex-wrap gap-2"><Select value={props.value??'organization'} onValueChange={id=>props.onChange(id==='organization'?null:id)} disabled={props.disabled||busy}><SelectTrigger aria-label="Область действия" className="flex-1 min-w-56"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="organization">Организация · включая назначения без группы</SelectItem>{visible.map(group=><SelectItem value={group.id} key={group.id}>{group.label}</SelectItem>)}</SelectContent></Select>
    <Button type="button" variant="outline" disabled={props.disabled||busy} onClick={()=>void load()}>{busy?'Проверка групп…':loaded?'Обновить группы':'Выбрать учебную группу'}</Button></div>
    {loaded&&!visible.length&&<p className="text-xs text-muted-foreground">Общей доступной группы с тем же курсом для всех выбранных назначений нет. Разделите выбор по группам или используйте разрешённую область организации.</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
