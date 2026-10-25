import {AccessError,checked,requirePlatformSales,requireUuid,type AccessDb} from './privileged-access.ts';
import {requireProviderOperationActor,type LookupActor} from './provider-operation-access.ts';
/** Existing global sales credentials are available only to their authorized operators. */
export async function requireTelephonyActor(req:Request,admin:AccessDb,callerFactory:(header:string)=>AccessDb,platformOperation:boolean):Promise<LookupActor>{
 try {
  const actor=await requireProviderOperationActor(req,admin,callerFactory);
  if(platformOperation)await requirePlatformSales(admin,{userId:actor.userId,service:false});
  return actor;
 } catch(error) {
  if(error instanceof AccessError)throw error;
  throw new AccessError(503,'Не удалось подтвердить доступ к телефонии. Повторите позже.');
 }
}
export async function requireVisibleTelephonyLead(actor:LookupActor,value:unknown):Promise<{id:string;org_name:string;inn:string|null}|null>{
 if(value==null)return null;
 const id=requireUuid(value,'идентификатор обращения');
 const lead=checked<{id:string;org_name:string;inn:string|null}|null>(await actor.caller.from('sales_leads').select('id,org_name,inn').eq('id',id).maybeSingle());
 if(!lead)throw new AccessError(403,'Нет доступа к выбранному обращению.');
 return lead;
}
export const telephonyProviderMessage=(_error:unknown):string=>'Провайдер телефонии временно недоступен. Проверьте настройки и повторите позже.';
export function telephonyProviderDetails(_error:unknown):Record<string,unknown>{return {code:'telephony_provider_failed'};}
