import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessError, accessErrorResponse, readObject, requireActiveUser, requireUuid } from "../_shared/privileged-access.ts";
import { requireSelfExaminationOrder, completeSelfExaminationOrder } from "../_shared/document-operation-access.ts";
import { generateSelfExaminationDraft, type GenerationCommand } from "../_shared/self-examination-generation.ts";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version","X-Sintagma-Function-Revision":"uc025-source-backed-draft-v1","Cache-Control":"no-store"};
serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:corsHeaders});
 try{
  const url=Deno.env.get('SUPABASE_URL')!,service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),actor=await requireActiveUser(req,service),body=await readObject(req);
  const allowed=['organizationId','reportingYear','draftId','expectedFactHash','expectedRevision','requestId','documentId','expectedDocumentRevision','orderId','useCurrentDraft'];
  if(Object.keys(body).some(key=>!allowed.includes(key))||!Number.isSafeInteger(body.reportingYear)||!Number.isSafeInteger(body.expectedRevision)||!Number.isSafeInteger(body.expectedDocumentRevision)||!(/^[a-f0-9]{64}$/).test(body.expectedFactHash)||body.useCurrentDraft!==true)throw new AccessError(400,'Подтвердите выбранный сохранённый год, текущую версию фактов и целевой документ.');
  const command:GenerationCommand={organizationId:requireUuid(body.organizationId,'организация'),reportingYear:body.reportingYear,draftId:requireUuid(body.draftId,'черновик'),expectedFactHash:body.expectedFactHash,expectedRevision:body.expectedRevision,requestId:requireUuid(body.requestId,'запрос'),documentId:requireUuid(body.documentId,'документ'),expectedDocumentRevision:body.expectedDocumentRevision,orderId:body.orderId==null?null:requireUuid(body.orderId,'заказ')};
  let order=await requireSelfExaminationOrder(service,actor,command.organizationId,command.orderId);
  if(order){let ref:any;try{ref=JSON.parse(order.notes??'');}catch{/* Historical notes remain intact. */}
   if(!ref||ref.schema_version!==1||ref.kind!=='self_examination_draft'||ref.organization_id!==command.organizationId||ref.reporting_year!==command.reportingYear||ref.draft_id!==command.draftId)throw new AccessError(409,'У старого заказа нет подтверждённой связи с сохранённым годовым черновиком. Исторические ответы сохранены; выберите новое согласованное задание.');
  }
  const original=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')!}},auth:{persistSession:false,autoRefreshToken:false}});
  const ensureActor=async()=>{const current=await requireActiveUser(req,service);if(current.userId!==actor.userId||current.service)throw new AccessError(403,'Сессия изменилась.');order=await requireSelfExaminationOrder(service,current,command.organizationId,command.orderId);};
  const result=await generateSelfExaminationDraft(original,command,actor.userId!,ensureActor,()=>completeSelfExaminationOrder(service,order));
  return new Response(JSON.stringify(result),{headers:{...corsHeaders,'Content-Type':'application/json'}});
 }catch(error){return accessErrorResponse(error,corsHeaders);}
});
