import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Hold { organization_id: string; active: boolean; hold_id: string | null; reason: string | null; held_at: string | null }
export function OrganizationBillingHoldPanel({organizationId}:{organizationId:string}) {
  const [state,setState]=useState<{org:string;hold:Hold}|null>(null);
  const [reason,setReason]=useState('Неоплата. Доступ приостановлен до оплаты.');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  const mounted=useRef(false);const org=useRef(organizationId);org.current=organizationId;
  const running=useRef(false);
  const operation=useRef<{org:string;action:string;expected:string|null;reason:string;id:string}|null>(null);
  const current=()=>mounted.current&&org.current===organizationId;
  const read=async()=>{
    setError(false);
    try {
      const {data,error:failed}=await supabase.rpc('get_organization_billing_hold' as any,{p_organization_id:organizationId});
      if(!current())return;
      const hold=data as unknown as Hold;
      if(failed||hold?.organization_id!==organizationId||typeof hold.active!=='boolean'||(hold.active&&!hold.hold_id))throw Error();
      setState({org:organizationId,hold});
    }catch{if(current())setError(true);}
  };
  useEffect(()=>{mounted.current=true;setState(null);operation.current=null;void read();return()=>{mounted.current=false;};},[organizationId]);
  const hold=state?.org===organizationId?state.hold:null;
  const change=async()=>{
    if(!hold||running.current||(!hold.active&&!reason.trim()))return;
    const action=hold.active?'release':'hold';
    const expected=hold.active?hold.hold_id:null;
    const text=hold.active?'Доступ восстановлен администратором':reason.trim();
    if(!operation.current||operation.current.org!==organizationId||operation.current.action!==action||operation.current.expected!==expected||operation.current.reason!==text){
      operation.current={org:organizationId,action,expected,reason:text,id:crypto.randomUUID()};
    }
    const op=operation.current;running.current=true;setBusy(true);setError(false);
    try {
      const {data,error:failed}=await supabase.rpc('set_organization_billing_hold' as any,{
        p_organization_id:organizationId,p_request_id:op.id,p_action:action,p_expected_hold_id:expected,p_reason:text,
      });
      if(!current())return;
      const saved=data as unknown as Hold;
      if(failed||saved?.organization_id!==organizationId||saved.active!==(action==='hold')||(saved.active&&!saved.hold_id))throw Error();
      setState({org:organizationId,hold:saved});operation.current=null;
    }catch{if(current())setError(true);}
    finally{running.current=false;if(current())setBusy(false);}
  };
  return <Card>
    <CardHeader><CardTitle>Доступ до оплаты</CardTitle><CardDescription>Временная приостановка сохраняет курсы, учеников и результаты. После подтверждения оплаты администратор может восстановить доступ.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {!hold&&!error&&<p role="status">Проверяем доступ организации…</p>}
      {hold&&<><p role="status">{hold.active?'Доступ организации приостановлен':'Доступ организации не приостановлен'}</p>
        {hold.active?<p className="text-sm text-muted-foreground">{hold.reason}</p>:<Textarea aria-label="Причина приостановки" value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/>}
        <Button variant={hold.active?'outline':'destructive'} disabled={busy||(!hold.active&&!reason.trim())} onClick={()=>void change()}>{busy?'Сохраняем…':hold.active?'Восстановить доступ после оплаты':'Приостановить доступ до оплаты'}</Button>
      </>}
      {error&&<div role="alert"><p>Изменение доступа не подтверждено. Проверьте состояние перед повтором.</p><Button variant="outline" disabled={busy} onClick={()=>void read()}>Проверить состояние</Button></div>}
    </CardContent>
  </Card>;
}
