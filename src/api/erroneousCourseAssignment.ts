import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { issuanceScopeCurrent, type EducationIssuanceScope } from '@/lib/educationIssuance/client';
const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),hash=z.string().regex(/^[a-f0-9]{64}$/);
const refSchema=z.object({organization_id:uuid,group_id:uuid.nullable(),enrollment_id:uuid,user_id:uuid,course_id:uuid,state_hash:hash}).strict();
const stateSchema=z.object({schema_version:z.literal(1),ref:refSchema,state:z.enum(['active','removed','withdrawn']),can_remove:z.boolean(),can_withdraw:z.boolean(),reason:z.enum(['ALREADY_REMOVED','FORMALLY_WITHDRAWN','LEARNING_STARTED']).nullable()}).strict().superRefine((state,ctx)=>{
 if(state.can_remove&&(state.state!=='active'||state.reason!==null)||state.state!=='active'&&state.can_withdraw)ctx.addIssue({code:'custom',message:'Conflicting removal eligibility'});
});
const receiptSchema=z.object({schema_version:z.literal(1),cancelled:z.literal(true),retained:z.literal(true),organization_id:uuid,group_id:uuid.nullable(),enrollment_id:uuid,user_id:uuid,course_id:uuid,event_id:uuid,actor_id:uuid,request_id:uuid,replayed:z.boolean()}).strict();
export type AssignmentRemovalState=z.infer<typeof stateSchema>;
export type AssignmentRemovalReceipt=z.infer<typeof receiptSchema>;
export type AssignmentRemovalCode='ACCESS_DENIED'|'SOURCE_CHANGED'|'LEARNING_STARTED'|'DEPENDENCY_UNAVAILABLE';
const messages:Record<AssignmentRemovalCode,string>={ACCESS_DENIED:'Нет доступа к изменению назначения.',SOURCE_CHANGED:'Назначение изменилось. Проверьте его ещё раз.',LEARNING_STARTED:'Обучение уже началось или есть результаты. Используйте «Прекратить обучение».',DEPENDENCY_UNAVAILABLE:'Не удалось подтвердить отмену назначения. Повторите тот же запрос.'};
export class AssignmentRemovalError extends Error{constructor(readonly code:AssignmentRemovalCode,readonly retryable=false){super(messages[code]);this.name='AssignmentRemovalError';}}
function current(scope:EducationIssuanceScope){if(!issuanceScopeCurrent(scope))throw new AssignmentRemovalError('ACCESS_DENIED');}
function sameScope(scope:EducationIssuanceScope,ref:AssignmentRemovalState['ref']){if(ref.organization_id!==scope.organizationId||ref.group_id!==(scope.issuanceScope.kind==='group'?scope.issuanceScope.group_id:null))throw new AssignmentRemovalError('SOURCE_CHANGED');}
function normalized(error:unknown):AssignmentRemovalError{
 if(error instanceof AssignmentRemovalError)return error;
 const value=error as{status?:number;code?:string;message?:string}|null;
 if(value?.status===401||value?.status===403||value?.code==='42501'||value?.code==='PT403')return new AssignmentRemovalError('ACCESS_DENIED');
 if(value?.code==='23514'&&value.message==='assignment_has_learning_history')return new AssignmentRemovalError('LEARNING_STARTED');
 if(value?.code==='PT409'||value?.code==='40001'||value?.code==='55P03'||value?.code==='40P01')return new AssignmentRemovalError('SOURCE_CHANGED');
 return new AssignmentRemovalError('DEPENDENCY_UNAVAILABLE',true);
}
async function call(scope:EducationIssuanceScope,name:string,args:Record<string,unknown>){
 current(scope);const {data,error}=await supabase.auth.getSession();current(scope);
 if(error||data.session?.user.id!==scope.actorId||!data.session.access_token)throw new AssignmentRemovalError('ACCESS_DENIED');
 try{const result=await supabase.rpc(name as never,args as never).setHeader('Authorization','Bearer '+data.session.access_token);current(scope);
  if(result.status===401||result.status===403)throw new AssignmentRemovalError('ACCESS_DENIED');if(result.error)throw normalized(result.error);return result.data;
 }catch(error){current(scope);throw normalized(error);}
}
export async function readAssignmentRemoval(scope:EducationIssuanceScope,enrollmentId:string):Promise<AssignmentRemovalState>{
 if(!uuid.safeParse(enrollmentId).success)throw new AssignmentRemovalError('SOURCE_CHANGED');
 const raw=await call(scope,'read_course_assignment_removal',{p_organization_id:scope.organizationId,p_group_id:scope.issuanceScope.kind==='group'?scope.issuanceScope.group_id:null,p_enrollment_id:enrollmentId});
 const parsed=stateSchema.safeParse(raw);if(!parsed.success)throw new AssignmentRemovalError('DEPENDENCY_UNAVAILABLE',true);sameScope(scope,parsed.data.ref);
 if(parsed.data.ref.enrollment_id!==enrollmentId)throw new AssignmentRemovalError('SOURCE_CHANGED');return parsed.data;
}
export function prepareAssignmentRemoval(scope:EducationIssuanceScope,value:AssignmentRemovalState){
 current(scope);const parsed=stateSchema.safeParse(structuredClone(value));if(!parsed.success)throw new AssignmentRemovalError('SOURCE_CHANGED');
 const state=parsed.data;sameScope(scope,state.ref);if(!state.can_remove||state.state!=='active')throw new AssignmentRemovalError('LEARNING_STARTED');
 const ref=Object.freeze({...state.ref});const requestId=crypto.randomUUID();
 return Object.freeze({requestId,async run():Promise<AssignmentRemovalReceipt>{
  const raw=await call(scope,'remove_erroneous_course_assignment',{p_organization_id:ref.organization_id,p_group_id:ref.group_id,p_enrollment_id:ref.enrollment_id,p_expected_hash:ref.state_hash,p_request_id:requestId});
  const result=receiptSchema.safeParse(raw);if(!result.success)throw new AssignmentRemovalError('DEPENDENCY_UNAVAILABLE',true);const r=result.data;
  if(r.organization_id!==ref.organization_id||r.group_id!==ref.group_id||r.enrollment_id!==ref.enrollment_id||r.user_id!==ref.user_id||r.course_id!==ref.course_id||r.actor_id!==scope.actorId||r.request_id!==requestId)throw new AssignmentRemovalError('DEPENDENCY_UNAVAILABLE',true);
  return r;
 }});
}
