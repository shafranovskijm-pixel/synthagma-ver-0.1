import{createClient}from'npm:@supabase/supabase-js@2.90.1';
import{archiveRuleSourceRequest,type ArchiveRuleRuntime}from'./http.ts';
import{admissionFetch}from'../_shared/admission-case-access.ts';
const create=(key:string,authorization:string,signal:AbortSignal)=>{const client=createClient(Deno.env.get('SUPABASE_URL')!,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:authorization},fetch:admissionFetch(fetch,signal)}});return{auth:client.auth,storage:client.storage,rpc:(name:string,args:Record<string,unknown>)=>client.rpc(name,args).setHeader('Authorization',authorization)};};
Deno.serve(request=>archiveRuleSourceRequest(request,{
 configured:!!Deno.env.get('SUPABASE_URL')&&!!Deno.env.get('SUPABASE_ANON_KEY')&&!!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
 createCaller:(authorization,signal)=>create(Deno.env.get('SUPABASE_ANON_KEY')!,authorization,signal),
 createService:signal=>{const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;return create(key,'Bearer '+key,signal);},
}as unknown as ArchiveRuleRuntime));
