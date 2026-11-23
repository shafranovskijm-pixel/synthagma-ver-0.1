import {z} from 'zod';
import {supabase} from '@/integrations/supabase/client';
import {isOfflineActorCurrent} from '@/utils/courseCache';
const uuid=z.string().uuid();
const instant=z.string().datetime({offset:true});
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const bounded=(max:number)=>z.string().max(max);
export const documentInboxCursor=z.object({created_at:instant,id:uuid}).strict();
export type DocumentInboxCursor=z.infer<typeof documentInboxCursor>;
export const documentInboxItem=z.object({
  id:uuid,organization_id:uuid,document_title:bounded(2000),document_type:bounded(120),legacy_status:bounded(120),
  sender_name:bounded(2000).nullable(),expires_at:instant.nullable(),signature_token:z.string().min(1).max(200),
  created_at:instant,signed_at:instant.nullable(),viewed_at:instant.nullable(),signed_document_path:bounded(2000).nullable(),
  state:z.enum(['pending','confirmed','signed','rejected','expired','revoked','source_changed','source_unavailable','closed']),pending:z.boolean(),
  assurance:z.object({binding_id:uuid.nullable(),binding_revision:count.nullable(),document_revision_id:uuid.nullable(),
    document_html_sha256:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    conclusion:z.enum(['not_confirmed','factual_confirmation','policy_eligible_account_confirmation','scan_received','graphic_prepared','legacy_unknown']),
    event_id:uuid.nullable(),event_revision:count.nullable(),confirmed_at:instant.nullable(),source_current:z.boolean()}).strict(),
}).strict().superRefine((value,ctx)=>{
  if(value.pending!==(value.state==='pending'))ctx.addIssue({code:'custom',message:'Inconsistent pending state'});
  if(value.state==='confirmed'&&(!value.assurance.source_current||!value.assurance.binding_id||!value.assurance.binding_revision
    ||!value.assurance.document_html_sha256||!value.assurance.event_id||!value.assurance.event_revision||!value.assurance.confirmed_at
    ||!['factual_confirmation','policy_eligible_account_confirmation','scan_received'].includes(value.assurance.conclusion)))ctx.addIssue({code:'custom',message:'Missing exact confirmation evidence'});
});
export type DocumentInboxItem=z.infer<typeof documentInboxItem>;
const page=z.object({version:z.literal(1),ok:z.literal(true),organization_id:uuid,recipient_user_id:uuid,observed_at:instant,
  items:z.array(documentInboxItem).max(50),pending_count:count,total_count:count,next_cursor:documentInboxCursor.nullable()}).strict();
const failure=z.object({version:z.literal(1),ok:z.literal(false),code:z.enum(['ACCESS_DENIED','INVALID_INPUT','DEPENDENCY_UNAVAILABLE'])}).strict();
export type DocumentInboxPage=z.infer<typeof page>;
// Preserve sub-millisecond ordering of PostgreSQL timestamps without rounding
// distinct keyset entries into an invented UUID tie.
function compareInstant(a:string,b:string) {
  const milliseconds=Date.parse(a)-Date.parse(b);if(milliseconds)return milliseconds;
  const tail=(value:string)=>Number((value.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1]??'').slice(3).padEnd(6,'0'));
  return tail(a)-tail(b);
}
function compareCursor(a:DocumentInboxCursor,b:DocumentInboxCursor) {return compareInstant(a.created_at,b.created_at)||(a.id<b.id?-1:a.id>b.id?1:0);}
export function parseDocumentInboxPage(raw:unknown,organizationId:string,userId:string,after:DocumentInboxCursor|null=null):DocumentInboxPage {
  const result=z.union([page,failure]).parse(raw);
  if(result.ok===false)throw new Error(result.code);
  if(result.organization_id!==organizationId||result.recipient_user_id!==userId||result.items.some(item=>item.organization_id!==organizationId)
    ||new Set(result.items.map(item=>item.id)).size!==result.items.length||result.total_count<result.items.length||result.pending_count>result.total_count
    ||result.pending_count<result.items.filter(item=>item.pending).length)throw new Error('ACCESS_DENIED');
  for(let i=0;i<result.items.length;i++)if((i&&compareCursor(result.items[i-1],result.items[i])<=0)||(after&&compareCursor(result.items[i],after)>=0))throw new Error('INVALID_INPUT');
  if(result.next_cursor&&(!result.items.length||compareCursor(result.next_cursor,result.items[result.items.length-1])!==0))throw new Error('INVALID_INPUT');
  return result;
}
export async function readStudentDocumentInbox(organizationId:string,userId:string,actorRevision:number,cursor:DocumentInboxCursor|null,signal?:AbortSignal) {
  uuid.parse(organizationId);uuid.parse(userId);if(cursor)documentInboxCursor.parse(cursor);
  const assertCurrent=()=>{if(!isOfflineActorCurrent(userId,actorRevision))throw new Error('ACCESS_DENIED');};assertCurrent();
  const query=(supabase.rpc as any)('read_student_document_inbox',{p_organization_id:organizationId,p_after_created_at:cursor?.created_at??null,p_after_id:cursor?.id??null,p_limit:50});
  const {data,error}=await(signal?query.abortSignal(signal):query);assertCurrent();
  if(error)throw new Error('DEPENDENCY_UNAVAILABLE');return parseDocumentInboxPage(data,organizationId,userId,cursor);
}
export const studentDocumentsPath=(signatureId?:string)=>'/student?'+new URLSearchParams({tab:'profile',section:'documents',...(signatureId?{documentRequest:uuid.parse(signatureId)}:{})}).toString();
export const documentSigningPath=(item:DocumentInboxItem)=>'/sign/'+encodeURIComponent(item.signature_token);
export function inboxStateLabel(item:DocumentInboxItem):string {
  switch(item.state){
    case 'pending':return 'Требуется ваше подтверждение';
    case 'confirmed':return item.assurance.conclusion==='policy_eligible_account_confirmation'?'Подтверждено учётной записью по соглашению ПЭП':item.assurance.conclusion==='scan_received'?'Скан получен':'Подтверждение сохранено';
    case 'signed':return 'Подписан — прежняя запись';case 'rejected':return 'Отклонён';case 'expired':return 'Срок приглашения истёк';case 'revoked':return 'Приглашение отозвано';
    case 'source_changed':return 'Документ изменился — требуется проверка организации';case 'source_unavailable':return 'Версия документа недоступна';default:return 'Приглашение закрыто';
  }
}
