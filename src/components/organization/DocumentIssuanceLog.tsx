import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { isCurrentOrganizationAccess } from "@/hooks/useDocumentActionPermissions";
import { useEducationIssuanceScope } from "@/hooks/useEducationIssuance";
import { issuanceScopeCurrent, normalizeIssuanceError, requireIssuanceScope, type EducationIssuanceScope } from "@/lib/educationIssuance/client";
import { supabase } from "@/integrations/supabase/client";
import { EducationDocumentsJournal } from "./EducationDocumentsJournal";

interface LegacyRow { id:string; user_name:string; document_type:string; document_name:string; reg_number:string|null; issued_at:string; send_method:string|null; send_number:string|null; }
export function DocumentIssuanceLog({organizationId}:{organizationId:string}) {
  const permissions=useStaffPermissions(), capture=useEducationIssuanceScope(organizationId);
  const [legacy,setLegacy]=useState<{scope:EducationIssuanceScope;rows:LegacyRow[];next:string|null}|null>(null);
  const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
  const epoch=useRef(0),flight=useRef(false);
  const ready=isCurrentOrganizationAccess(permissions,organizationId)&&permissions.can("documents.read");
  const current=ready&&!!legacy&&issuanceScopeCurrent(legacy.scope)&&legacy.scope.organizationId===organizationId;
  useEffect(()=>{++epoch.current;setLegacy(null);setError(null);flight.current=false;setBusy(false);},[organizationId,ready]);
  const load=async(more=false)=>{
    if(!ready||flight.current)return;const run=epoch.current;let scope:EducationIssuanceScope;
    try{scope=capture();}catch(cause){setError(normalizeIssuanceError(cause).message);return;}
    flight.current=true;setBusy(true);setError(null);
    try{
      const session=await supabase.auth.getSession();requireIssuanceScope(scope);
      if(session.error||session.data.session?.user.id!==scope.actorId||!session.data.session.access_token)throw Error("Текущий доступ не подтверждён.");
      let query=supabase.from("document_issuance_log").select("id,user_name,document_type,document_name,reg_number,issued_at,send_method,send_number")
        .eq("organization_id",organizationId).order("id").limit(100);
      const after=more&&current?legacy.next:null;if(after)query=query.gt("id",after);
      const response=await query.setHeader("Authorization","Bearer "+session.data.session.access_token);
      requireIssuanceScope(scope);if(response.error)throw response.error;
      const rows=response.data??[];
      if(run===epoch.current)setLegacy({scope,rows:more&&current?[...legacy.rows,...rows]:rows,next:rows.length===100?rows[rows.length-1].id:null});
    }catch(cause){if(run===epoch.current&&issuanceScopeCurrent(scope))setError(normalizeIssuanceError(cause).message);}
    finally{if(run===epoch.current){flight.current=false;setBusy(false);}}
  };
  return <div className="space-y-6">
    <EducationDocumentsJournal organizationId={organizationId} onClose={()=>undefined}/>
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">Прежний ручной журнал выдачи</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted-foreground">Исходные записи сохранены для сверки. Введённые вручную номера и отметки отправки не подтверждают контролируемую выдачу или вручение. Новые действия оформляются в журнале выше.</p>
        <Button variant="outline" disabled={!ready||busy} onClick={()=>void load()}>Загрузить прежние записи</Button>
        {current&&<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">ФИО</th><th className="p-2">Документ</th><th className="p-2">Прежний номер</th><th className="p-2">Дата</th><th className="p-2">Прежняя отметка отправки</th></tr></thead><tbody>{legacy.rows.map(row=><tr key={row.id} className="border-b last:border-0"><td className="p-2">{row.user_name}</td><td className="p-2">{row.document_name} · {row.document_type}</td><td className="p-2">{row.reg_number??"Не указан"}</td><td className="p-2">{new Date(row.issued_at).toLocaleDateString("ru-RU")}</td><td className="p-2">{row.send_method??"Нет отметки"} {row.send_number}</td></tr>)}</tbody></table>
          {!legacy.rows.length&&<p className="py-3 text-muted-foreground">Прежних записей нет.</p>}</div>}
        {current&&legacy.next&&<Button variant="outline" disabled={busy} onClick={()=>void load(true)}>Ещё записи</Button>}
        {busy&&<p role="status" className="text-sm text-muted-foreground">Загружаем записи…</p>}
        {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </details>
  </div>;
}
