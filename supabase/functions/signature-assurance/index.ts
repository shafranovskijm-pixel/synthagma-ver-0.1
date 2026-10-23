import {createClient} from 'npm:@supabase/supabase-js@2.90.1';
import {createInvitationHttpHandler} from './http.ts';
import {AssuranceError,canonicalSignatureStorageReader} from './worker.ts';
import {errorCode} from './contract.ts';
const projectUrl=Deno.env.get('SUPABASE_URL')!,publicKey=Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
Deno.serve(createInvitationHttpHandler(originalJwt=>{
 if(!projectUrl||!publicKey||!serviceKey)throw new AssuranceError('DEPENDENCY_UNAVAILABLE');const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},service=createClient(projectUrl,serviceKey,{auth});
 const invoke=async(name:string,input:Record<string,unknown>,signal:AbortSignal)=>{const{data,error}=await service.rpc(name,input).abortSignal(signal);if(error){const match=/^SIGNATURE_EVIDENCE_([A-Z_]+)$/.exec(error.message??''),code=errorCode.safeParse(match?.[1]);throw new AssuranceError(code.success?code.data:'DEPENDENCY_UNAVAILABLE');}return data;};
 return{
  async observeOriginalActor(signal){if(!originalJwt)return null;if(signal.aborted)throw new AssuranceError('ACCESS_DENIED');const caller=createClient(projectUrl,publicKey,{auth,global:{headers:{Authorization:'Bearer '+originalJwt},fetch:(url,init)=>fetch(url,{...init,signal})}});const{data,error}=await caller.auth.getUser(originalJwt);if(signal.aborted||error||!data.user?.id)throw new AssuranceError('ACCESS_DENIED');return data.user.id;},
  service:(input,signal)=>invoke('uc_signature_assurance_service',input,signal),
  verifyFile:(input,signal)=>invoke('uc_signature_assurance_verify_invitation_file_service',input,signal),
  readCanonicalObject:canonicalSignatureStorageReader(projectUrl,serviceKey),
 };
},publicKey));
