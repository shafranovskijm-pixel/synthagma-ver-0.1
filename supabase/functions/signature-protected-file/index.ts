import {createClient}from 'npm:@supabase/supabase-js@2.90.1';
import {createProtectedFileHttpHandler}from './http.ts';
import {ProtectedFileError,canonicalSignatureStorageReader,type ProtectedFileFailure}from './worker.ts';
const projectUrl=Deno.env.get('SUPABASE_URL')!,publicKey=Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const errors=new Set<ProtectedFileFailure>(['ACCESS_DENIED','INVALID_INPUT','NOT_FOUND','REVISION_CONFLICT','REQUEST_CONFLICT','SOURCE_UNAVAILABLE','SOURCE_CHANGED','CLOSED','EXPIRED','LIMIT_EXCEEDED','DEPENDENCY_UNAVAILABLE']);
Deno.serve(createProtectedFileHttpHandler(originalJwt=>{
 if(!projectUrl||!publicKey||!serviceKey)throw new ProtectedFileError('DEPENDENCY_UNAVAILABLE');const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},service=createClient(projectUrl,serviceKey,{auth});
 return{
  async observeOriginalActor(signal){if(!originalJwt)return null;if(signal.aborted)throw new ProtectedFileError('ACCESS_DENIED');const caller=createClient(projectUrl,publicKey,{auth,global:{headers:{Authorization:'Bearer '+originalJwt},fetch:(url,init)=>fetch(url,{...init,signal})}});const{data,error}=await caller.auth.getUser(originalJwt);if(signal.aborted||error||!data.user?.id)throw new ProtectedFileError('ACCESS_DENIED');return data.user.id;},
  async service(input,signal){const{data,error}=await service.rpc('uc_signature_assurance_file_read_service',input).abortSignal(signal);if(error){const raw=/^SIGNATURE_EVIDENCE_([A-Z_]+)$/.exec(error.message??'')?.[1]as ProtectedFileFailure|undefined;throw new ProtectedFileError(raw&&errors.has(raw)?raw:'DEPENDENCY_UNAVAILABLE');}return data;},
  readCanonicalObject:canonicalSignatureStorageReader(projectUrl,serviceKey),
 };
},publicKey));
