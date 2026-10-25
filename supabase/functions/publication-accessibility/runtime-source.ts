import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { createPublicationCheckHandler } from "./http.ts";
import { PublicationWorkerError } from "./worker.ts";
const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
Deno.serve(createPublicationCheckHandler(jwt=>{
 if(!url||!anon||!serviceKey)throw new PublicationWorkerError("UNAVAILABLE");
 const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
 const caller=createClient(url,anon,{auth,global:{headers:{Authorization:"Bearer "+jwt}}}),service=createClient(url,serviceKey,{auth});
 const invoke=async(client:typeof caller,name:string,input:Record<string,unknown>,signal:AbortSignal)=>{const{data,error}=await client.rpc(name,input).abortSignal(signal);if(error){const match=/^PUBLICATION_(ACCESS_DENIED|INVALID_INPUT|SOURCE_CHANGED|REVISION_CONFLICT)$/.exec(error.message??"");throw new PublicationWorkerError((match?.[1]as "ACCESS_DENIED"|"INVALID_INPUT"|"SOURCE_CHANGED"|"REVISION_CONFLICT"|undefined)??"UNAVAILABLE");}return data;};
 return{
  async originalActor(signal){if(signal.aborted)throw new PublicationWorkerError("UNAVAILABLE");const authCaller=createClient(url,anon,{auth,global:{headers:{Authorization:"Bearer "+jwt},fetch:(input,init)=>fetch(input,{...init,signal})}});const{data,error}=await authCaller.auth.getUser(jwt);if(signal.aborted||error||!data.user?.id)throw new PublicationWorkerError("ACCESS_DENIED");return data.user.id;},
  prepare:(input,signal)=>invoke(caller,"prepare_organization_publication_check",input,signal),
  context:(input,signal)=>invoke(service,"uc_publication_check_context",input,signal),
  commit:(input,signal)=>invoke(service,"uc_publication_commit_check",input,signal),
  read:(input,signal)=>invoke(caller,"read_organization_publication",input,signal),
 };
}));
