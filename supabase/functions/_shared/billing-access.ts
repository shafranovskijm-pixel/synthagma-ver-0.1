/** Call only for an Auth-verified actor or an exactly verified login-token subject. */
export interface BillingAccessDb {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
const json=(status:number,headers:Record<string,string>)=>new Response(JSON.stringify({error:status===403?'Доступ временно приостановлен. Обратитесь к администратору СИНТАГМЫ.':'Не удалось проверить доступ. Повторите попытку.'}),{status,headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function billingHoldResponse(db:BillingAccessDb,verifiedUserId:string,headers:Record<string,string>):Promise<Response|null>{
  try{const {data,error}=await db.rpc('is_user_blocked',{_user_id:verifiedUserId});
    if(error||typeof data!=='boolean')return json(503,headers);
    return data?json(403,headers):null;
  }catch{return json(503,headers);}
}
/** Service-only target gate for registration: never accept a caller-supplied allow flag. */
export async function organizationBillingHoldResponse(db:BillingAccessDb,organizationId:string,headers:Record<string,string>):Promise<Response|null>{
  try{const {data,error}=await db.rpc('organization_billing_access_allowed',{p_organization_id:organizationId});
    if(error||typeof data!=='boolean')return json(503,headers);
    return data?null:json(403,headers);
  }catch{return json(503,headers);}
}
