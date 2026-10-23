import {supabase} from '@/integrations/supabase/client';
import {captureOfflineContext,isOfflineActorCurrent} from '@/utils/courseCache';
import * as c from './contract';
import type * as t from './types';
import {AUTHENTICATED_RPC_ABI} from './types';
import {assertEventPage,assertPage,SignatureEvidenceError,sameEvidenceValue,verifyAgreement,verifyConsent,verifyEvent,verifyLiteral,verifyManifest,verifyPolicy,verifySignatureContext} from './validation';

export {SignatureEvidenceError};
export interface SignatureAssuranceScope{actorId:string;accessRevision:number;organizationId:string;current?:()=>boolean}
export const signatureEvidenceMessages:Record<t.ErrorCode,string>={
 ACCESS_DENIED:'Доступ к выбранным сведениям не подтверждён.',INVALID_INPUT:'Проверьте заполненные поля.',NOT_FOUND:'Запись не найдена или больше недоступна.',
 REVISION_CONFLICT:'Сведения изменились. Обновите их перед подтверждением.',REQUEST_CONFLICT:'Этот запрос уже использован с другими данными.',
 CLASSIFICATION_REQUIRED:'Укажите вид документа и сторону, для которой выбираются правила.',POLICY_REQUIRED:'Выберите правила для этого документа.',
 POLICY_NOT_ACCEPTED:'Правила ещё не приняты ответственным лицом организации.',POLICY_CHANGED:'Принята другая редакция правил. Ознакомьтесь с ней перед подтверждением.',
 IDENTITY_REQUIRED:'Для этого способа нужно войти в свою учётную запись.',IDENTITY_MISMATCH:'Учётная запись не совпадает с получателем документа.',
 AUTHORITY_REQUIRED:'Укажите основание полномочий для выбранного действия.',AGREEMENT_REQUIRED:'Сначала ознакомьтесь с точным текстом соглашения и подтвердите его.',
 AGREEMENT_CHANGED:'Текст соглашения или согласия изменился. Откройте его повторно.',METHOD_UNSUPPORTED:'Проверка этого способа подписи пока не реализована.',
 SOURCE_UNAVAILABLE:'Исходный документ или его подтверждённая версия сейчас недоступны.',SOURCE_CHANGED:'Исходная версия изменилась. Обновите сведения.',
 CLOSED:'Для этой записи действие уже закрыто.',EXPIRED:'Срок действия приглашения истёк.',LIMIT_EXCEEDED:'Объём превышает допустимый предел. Данные не были сокращены.',
 DEPENDENCY_UNAVAILABLE:'Результат пока не подтверждён. Сохранённый запрос можно повторить.',
};
export function captureSignatureAssuranceScope(organizationId:string,current?:()=>boolean):SignatureAssuranceScope{
 const actor=captureOfflineContext();if(!actor||!c.uuid.safeParse(organizationId).success)throw new SignatureEvidenceError('ACCESS_DENIED');
 return {actorId:actor.actorId,accessRevision:actor.revision,organizationId,current};
}
export const signatureAssuranceScopeCurrent=(scope:SignatureAssuranceScope)=>isOfflineActorCurrent(scope.actorId,scope.accessRevision)&&(!scope.current||scope.current());
function requireCurrent(scope:SignatureAssuranceScope){if(!signatureAssuranceScopeCurrent(scope))throw new SignatureEvidenceError('ACCESS_DENIED');}
function invalid():never{throw new SignatureEvidenceError();}
export function normalizeSignatureEvidenceError(error:unknown):SignatureEvidenceError{
 if(error instanceof SignatureEvidenceError)return error;
 const raw=error as {code?:unknown;message?:unknown;status?:number}|null;
 if(raw?.code==='42501'||raw?.status===401||raw?.status===403)return new SignatureEvidenceError('ACCESS_DENIED');
 const match=typeof raw?.message==='string'?raw.message.match(/SIGNATURE_EVIDENCE_([A-Z_]+)(?:\b|$)/)?.[1]:raw?.code;
 const parsed=c.errorCode.safeParse(match);if(parsed.success)return new SignatureEvidenceError(parsed.data);
 if(raw?.code==='40001'||raw?.code==='PT409')return new SignatureEvidenceError('REVISION_CONFLICT');
 return new SignatureEvidenceError();
}
async function call(scope:SignatureAssuranceScope,name:string,args:Record<string,unknown>|t.ApplyRequest):Promise<unknown>{
 requireCurrent(scope);const session=await supabase.auth.getSession();requireCurrent(scope);
 if(session.error||session.data.session?.user.id!==scope.actorId||!session.data.session.access_token)throw new SignatureEvidenceError('ACCESS_DENIED');
 const result=await supabase.rpc(name as never,args as never).setHeader('Authorization','Bearer '+session.data.session.access_token);requireCurrent(scope);
 if(result.status===401||result.status===403)throw new SignatureEvidenceError('ACCESS_DENIED');
 if(result.error)throw normalizeSignatureEvidenceError(result.error);
 const failure=c.failure.safeParse(result.data);if(failure.success)throw new SignatureEvidenceError(failure.data.code);
 return result.data;
}
function scopeMatches(scope:SignatureAssuranceScope,value:t.ReadSuccess|t.ApplySuccess){
 if(value.scope.actor_user_id!==scope.actorId||value.scope.organization_id!==scope.organizationId||!value.capabilities.can_read)invalid();
}
function inOrganization(scope:SignatureAssuranceScope,value:{organization_id:string}){if(value.organization_id!==scope.organizationId)invalid();}
async function verifyReadResult(scope:SignatureAssuranceScope,query:t.ReadQuery,result:t.ReadResult):Promise<void>{
 const current=()=>signatureAssuranceScopeCurrent(scope);
 if(query.kind!==result.kind)invalid();
 if(query.kind==='policy_list'&&result.kind==='policy_list'){
  assertPage(result.policies,value=>value.id,query.after_id,result.next_after_id,query.limit);
  for(const policy of result.policies){inOrganization(scope,policy);await verifyPolicy(policy,current);}
 }else if(query.kind==='policy_choices'&&result.kind==='policy_choices'){
  if(result.signature_id!==query.signature_id||result.party_role!==query.party_role||result.purpose!==query.purpose)invalid();
  assertPage(result.choices,value=>value.id,query.after_id,result.next_after_id,query.limit);
  for(const choice of result.choices){inOrganization(scope,choice);if(query.purpose==='signature'&&(choice.classification.party_role==='sender')!==(query.party_role==='sender'))invalid();}
 }else if(query.kind==='policy'&&result.kind==='policy'){
  if(result.policy.id!==query.policy_version_id)invalid();inOrganization(scope,result.policy);await verifyPolicy(result.policy,current);
 }else if(query.kind==='signature'&&result.kind==='signature'){
  if(result.context.signature_id!==query.signature_id||result.context.chosen_party!==query.party_role)invalid();inOrganization(scope,result.context);await verifySignatureContext(result.context,current);
 }else if(query.kind==='events'&&result.kind==='events'){
  assertEventPage(result.page,query);
  for(const event of result.page.events){inOrganization(scope,event);await verifyEvent(event,current);}
 }else if(query.kind==='receipt'&&result.kind==='receipt'){
  await verifyManifest(result.manifest,scope.organizationId,query.signature_id,query.receipt_id,current);
 }else if(query.kind==='subject'&&result.kind==='subject'){
  if(result.subject_user_id!==query.subject_user_id||result.agreement_stream_id===result.consent_stream_id)invalid();
  const combined=[...result.agreements,...result.consents].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  assertPage(combined,value=>value.id,query.after_id,result.next_after_id,query.limit);
  for(const agreement of result.agreements){
   if(agreement.subject_user_id!==query.subject_user_id)invalid();
   if(agreement.kind==='account_acceptance')inOrganization(scope,agreement);
   else if(agreement.organization_id!==scope.organizationId&&!(agreement.organization_id===null&&agreement.subject_user_id===scope.actorId))invalid();
   await verifyAgreement(agreement,current);
  }
  for(const consent of result.consents){if(consent.subject_user_id!==query.subject_user_id)invalid();inOrganization(scope,consent);await verifyConsent(consent,current);}
 }else if(query.kind==='terms'&&result.kind==='terms'){
  if(result.policy_version_id!==query.policy_version_id||result.subject_user_id!==scope.actorId||result.terms.kind!==query.terms_kind||result.declared_full_name!==query.declared_full_name)invalid();
  await verifyLiteral(result.terms.text,result.terms.sha256,65536,current);await verifyLiteral(result.rendered_text,result.rendered_text_sha256,65536,current);
 }else invalid();
 requireCurrent(scope);
}
export async function readSignatureAssurance(scope:SignatureAssuranceScope,query:t.ReadQuery):Promise<t.ReadSuccess>{
 requireCurrent(scope);const parsedQuery=c.readQuery.safeParse(structuredClone(query));if(!parsedQuery.success)throw new SignatureEvidenceError('INVALID_INPUT');
 const parsed=c.readSuccess.safeParse(await call(scope,AUTHENTICATED_RPC_ABI.read,{p_organization_id:scope.organizationId,p_query:parsedQuery.data}));
 if(!parsed.success)invalid();const value=parsed.data as t.ReadSuccess;scopeMatches(scope,value);
 if(value.result.kind==='signature'&&!sameEvidenceValue(value.capabilities,value.result.context.capabilities))invalid();
 await verifyReadResult(scope,parsedQuery.data as t.ReadQuery,value.result);requireCurrent(scope);return value;
}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function resultKind(action:t.ApplyAction):t.ApplyResult['kind']{
 if(action.action==='save_policy_draft'||action.action==='record_policy_decision')return'policy';
 if(action.action==='accept_agreement')return'agreement';
 if(action.action==='confirm_consent'||action.action==='withdraw_consent')return'consent';
 return action.action==='capture_receipt'?'receipt':'signature';
}
async function verifyAppliedResult(scope:SignatureAssuranceScope,action:t.ApplyAction,value:t.ApplySuccess,expected:number):Promise<void>{
 const result=value.result,receipt=value.receipt,current=()=>signatureAssuranceScopeCurrent(scope);
 if(result.kind!==resultKind(action)||receipt.action!==action.action)invalid();
 if('party_role'in action){
  if(receipt.party_role!==action.party_role)invalid();
  if('binding_id'in action&&receipt.binding_id!==action.binding_id)invalid();
 }else if(receipt.party_role!==null||receipt.binding_id!==null)invalid();
 if(action.action==='capture_receipt'){
  if(receipt.event_id!==null||receipt.binding_id!==null||receipt.revision_applied!==expected||action.through_revision!==expected||result.kind!=='receipt'||result.manifest.body.context.chosen_party!==action.party_role)invalid();
  await verifyManifest(result.manifest,scope.organizationId,action.signature_id,receipt.entity_id,current);return;
 }
 if(receipt.event_id===null||receipt.revision_applied!==expected+1)invalid();
 if(result.kind==='policy'){
  inOrganization(scope,result.policy);if(receipt.entity_id!==result.policy.id||result.policy.decision.revision<receipt.revision_applied)invalid();
  if(action.action==='record_policy_decision'&&result.policy.id!==action.policy_version_id)invalid();
  if(action.action==='save_policy_draft'&&action.family_id!==null&&result.policy.family_id!==action.family_id)invalid();
  if(receipt.outcome==='applied'&&action.action==='record_policy_decision'&&result.policy.decision.state!==action.decision)invalid();
  await verifyPolicy(result.policy,current);
 }else if(result.kind==='agreement'){
  if(action.action!=='accept_agreement'||receipt.entity_id!==result.agreement.id||result.agreement.subject_user_id!==scope.actorId
   ||result.agreement.policy_version_id!==action.policy_version_id||result.agreement.terms.sha256!==action.terms_sha256||result.agreement.rendered_text_sha256!==action.rendered_text_sha256
   ||result.agreement.actor.declared_full_name!==action.declared_full_name)invalid();
  inOrganization(scope,result.agreement);await verifyAgreement(result.agreement,current);
 }else if(result.kind==='consent'){
  if(receipt.entity_id!==result.consent.id||result.consent.subject_user_id!==scope.actorId||result.consent.revision!==receipt.revision_applied)invalid();
  if(action.action==='confirm_consent'&&(result.consent.state!=='confirmed'||result.consent.policy_version_id!==action.policy_version_id||result.consent.consent_terms?.sha256!==action.terms_sha256
   ||result.consent.rendered_text_sha256!==action.rendered_text_sha256||result.consent.agreement_event_id!==action.agreement_event_id||result.consent.actor.declared_full_name!==action.declared_full_name))invalid();
  if(action.action==='withdraw_consent'&&(result.consent.state!=='withdrawn'||result.consent.id===action.consent_snapshot_id))invalid();
  inOrganization(scope,result.consent);await verifyConsent(result.consent,current);
 }else if(result.kind==='signature'){
  if(!('signature_id'in action)||!('party_role'in action)||result.context.signature_id!==action.signature_id||result.context.chosen_party!==action.party_role||receipt.entity_id!==action.signature_id||result.context.latest_event_revision<receipt.revision_applied||!sameEvidenceValue(value.capabilities,result.context.capabilities))invalid();
  inOrganization(scope,result.context);await verifySignatureContext(result.context,current);
  if(receipt.outcome==='applied'&&action.action==='bind_signature'){
   const bound=result.context.parties[action.party_role].binding;
   if(!bound||bound.id!==receipt.binding_id||bound.revision!==receipt.revision_applied||bound.party_role!==action.party_role||bound.policy_version_id!==action.policy_version_id||bound.document_revision_id!==action.document_revision_id||bound.document_html_sha256!==action.document_html_sha256||!sameEvidenceValue(bound.classification,action.classification))invalid();
  }
 }else invalid();
 requireCurrent(scope);
}
export function prepareSignatureAssuranceMutation(scope:SignatureAssuranceScope,expectedRevision:number,action:t.ApplyAction,requestId:string=crypto.randomUUID()){
 requireCurrent(scope);const parsed=c.applyRequest.safeParse({p_organization_id:scope.organizationId,p_request_id:requestId,p_expected_revision:expectedRevision,p_action:structuredClone(action)});
 if(!parsed.success)throw new SignatureEvidenceError('INVALID_INPUT');const args=freeze(parsed.data as t.ApplyRequest),saved=args.p_action;
 let acceptedReceipt:Omit<t.MutationReceipt,'outcome'>|null=null;
 return {requestId,run:async():Promise<t.ApplySuccess>=>{
  requireCurrent(scope);const response=c.applySuccess.safeParse(await call(scope,AUTHENTICATED_RPC_ABI.apply,args));if(!response.success)invalid();const value=response.data as t.ApplySuccess;
  scopeMatches(scope,value);if(value.receipt.request_id!==requestId)invalid();await verifyAppliedResult(scope,saved,value,expectedRevision);
  const {outcome:_,...immutableReceipt}=value.receipt;
  if(acceptedReceipt&&!sameEvidenceValue(acceptedReceipt,immutableReceipt))invalid();
  requireCurrent(scope);acceptedReceipt=freeze(structuredClone(immutableReceipt));return value;
 }};
}
