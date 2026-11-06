import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { describe,expect,it,vi } from 'vitest';
import * as billing from '../../functions/_shared/billing-access';

const actor='10000000-0000-4000-8000-000000000001';
const target='20000000-0000-4000-8000-000000000001';
const endpoints=['ai-avatar-generate-image','livekit-ai-tutor-start','livekit-copy-recording','livekit-create-room',
  'livekit-end-room','livekit-issue-token','livekit-moderate','livekit-start-recording','livekit-stop-recording',
  'send-platform-proposal','notify-enrollment-request','notify-course-completion','apply-review-finding',
  'accept-staff-invitation','send-staff-invitation','send-student-login-link','notify-support-request','kinescope-migrate-videos',
  'transfer-org-ownership'];

/** Execute the actual TypeScript entrypoint with synthetic Auth and denied
 * billing lookup. External imports are inert; any service data, provider,
 * email or Auth write reached before the denial fails this boundary test. */
function load(name:string,failed:boolean,organizationGate=false){
  let handler!:(request:Request)=>Promise<Response>;
  const serve=(fn:any)=>{handler=fn;};
  const dataRead=vi.fn((table:string)=>{
    if(organizationGate&&name==='accept-staff-invitation'&&table==='staff_invitations'){
      const query:any={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{id:target,organization_id:target,invitation_type:'organization'},error:null})};
      return query;
    }
    throw Error('unexpected_service_data');
  });
  const external=vi.fn(()=>{throw Error('unexpected_external_operation');});
  const rpc=vi.fn(async(n:string,args:any)=>{
    if(n==='is_user_blocked'&&args._user_id===actor){
      if(organizationGate)return{data:false,error:null};
      return failed?{data:null,error:{message:'private-failure'}}:{data:true,error:null};
    }
    if(organizationGate&&n==='organization_billing_access_allowed'&&args.p_organization_id===target){
      return failed?{data:null,error:{message:'private-failure'}}:{data:false,error:null};
    }
    throw Error('unexpected_rpc');
  });
  const auth={getUser:async()=>({data:{user:{id:actor,email:'fixture@example.invalid'}},error:null}),
    admin:new Proxy({},{get:()=>external})};
  const db={rpc,from:dataRead,auth,storage:new Proxy({},{get:()=>external})};
  const source=readFileSync(resolve('supabase/functions',name,'index.ts'),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const env={get:(key:string)=>key==='LIVEKIT_WS_URL'?'wss://livekit.example.invalid':'synthetic-config'};
  vm.runInNewContext(js,{require:(id:string)=>{
    if(id.includes('supabase-js'))return{createClient:()=>db};
    if(id.includes('billing-access'))return billing;
    if(id.includes('http/server'))return{serve};
    return new Proxy({},{get:()=>external});
  },Deno:{serve,env},exports:{},Request,Response,Headers,URL,crypto:webcrypto,fetch:external,
  console:{log:()=>{},error:()=>{},warn:()=>{}},setTimeout,clearTimeout,TextDecoder,TextEncoder,atob,btoa},
  {filename:name+'.js'});
  if(!handler)throw Error('Entrypoint did not register a handler');
  return{handler,rpc,dataRead,external};
}
describe('actual Edge entrypoint billing denial boundary',()=>{
  it.each(endpoints)('%s refuses a held authenticated actor before service/provider side effects',async name=>{
    const fixture=load(name,false);
    const response=await fixture.handler(new Request('https://example.invalid/'+name,{method:'POST',headers:{authorization:'Bearer synthetic'},
      body:JSON.stringify({webinarId:target,course_id:target,user_id:actor,enrollment_id:target,
        template_proposal_id:target,recipient_email:'recipient@example.invalid',company_name:'Synthetic'})}));
    expect(response.status).toBe(403);expect(fixture.rpc).toHaveBeenCalledOnce();
    expect(fixture.dataRead).not.toHaveBeenCalled();expect(fixture.external).not.toHaveBeenCalled();
  });
  it.each(endpoints)('%s stops on unavailable billing status without exposing raw errors',async name=>{
    const fixture=load(name,true);
    const response=await fixture.handler(new Request('https://example.invalid/'+name,{method:'POST',headers:{authorization:'Bearer synthetic'},
      body:JSON.stringify({webinarId:target,course_id:target,user_id:actor,enrollment_id:target,
        template_proposal_id:target,recipient_email:'recipient@example.invalid',company_name:'Synthetic'})}));
    expect(response.status).toBe(503);expect(await response.text()).not.toContain('private-failure');
    expect(fixture.dataRead).not.toHaveBeenCalled();expect(fixture.external).not.toHaveBeenCalled();
  });
});

describe('actual staff invitation target-organization gate',()=>{
  it.each(['accept-staff-invitation','send-staff-invitation'])('%s denies an allowed actor acting on a held organization before assignments or email',async name=>{
    const fixture=load(name,false,true);
    const response=await fixture.handler(new Request('https://example.invalid/'+name,{method:'POST',headers:{authorization:'Bearer synthetic'},
      body:JSON.stringify({token:'synthetic-invitation',email:'recipient@example.invalid',role:'admin',invitation_type:'organization',organization_id:target})}));
    expect(response.status).toBe(403);
    expect(fixture.rpc.mock.calls.map(([name])=>name)).toEqual(['is_user_blocked','organization_billing_access_allowed']);
    expect(fixture.dataRead.mock.calls.map(([table])=>table)).toEqual(name==='accept-staff-invitation'?['staff_invitations']:[]);
    expect(fixture.external).not.toHaveBeenCalled();
  });
  it.each(['accept-staff-invitation','send-staff-invitation'])('%s fails closed on unavailable target status before assignments or email',async name=>{
    const fixture=load(name,true,true);
    const response=await fixture.handler(new Request('https://example.invalid/'+name,{method:'POST',headers:{authorization:'Bearer synthetic'},
      body:JSON.stringify({token:'synthetic-invitation',email:'recipient@example.invalid',role:'admin',invitation_type:'organization',organization_id:target})}));
    expect(response.status).toBe(503);expect(await response.text()).not.toContain('private-failure');
    expect(fixture.rpc.mock.calls.map(([name])=>name)).toEqual(['is_user_blocked','organization_billing_access_allowed']);
    expect(fixture.dataRead.mock.calls.map(([table])=>table)).toEqual(name==='accept-staff-invitation'?['staff_invitations']:[]);
    expect(fixture.external).not.toHaveBeenCalled();
  });
});

const signatureEndpoints=['signature-assurance','signature-protected-file','signature-source-verification','signature-controlled-source-verification'];
function loadSignature(name:string,state:'held'|'unavailable'|'allowed'){
  let createDependencies!:(jwt:string)=>any;
  const external=vi.fn(()=>{throw Error('unexpected_signature_operation');});
  const rpc=vi.fn(async(n:string,args:any)=>{
    if(n!=='is_user_blocked'||args._user_id!==actor)throw Error('unexpected_rpc');
    return state==='unavailable'?{data:null,error:{message:'private-failure'}}:{data:state==='held',error:null};
  });
  class SourceError extends Error {constructor(readonly code:string){super(code);}}
  const db={rpc,auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},from:external};
  const source=readFileSync(resolve('supabase/functions',name,'index.ts'),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{require:(id:string)=>{
    if(id.includes('supabase-js'))return{createClient:()=>db};
    if(id.includes('billing-access'))return billing;
    if(id==='./http.ts')return new Proxy({},{get:()=> (factory:any)=>{createDependencies=factory;return()=>{};}});
    if(id==='./worker.ts')return new Proxy({},{get:(_obj,key)=>String(key).endsWith('Error')?SourceError:()=>external});
    return new Proxy({},{get:()=>external});
  },Deno:{serve:()=>{},env:{get:()=> 'synthetic-config'}},exports:{},Request,Response,Headers,URL,crypto:webcrypto,
  fetch:external,console:{log:()=>{},error:()=>{},warn:()=>{}},setTimeout,clearTimeout,TextDecoder,TextEncoder,atob,btoa},
  {filename:name+'.js'});
  if(!createDependencies)throw Error('No signature dependency factory');
  return{dependencies:createDependencies('synthetic-original-jwt'),rpc,external};
}
describe('actual signature original-actor adapters',()=>{
  it.each(signatureEndpoints)('%s throws ACCESS_DENIED for a held actor, preventing guest downgrade',async name=>{
    const fixture=loadSignature(name,'held');
    await expect(fixture.dependencies.observeOriginalActor(new AbortController().signal)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    expect(fixture.rpc).toHaveBeenCalledOnce();expect(fixture.external).not.toHaveBeenCalled();
  });
  it.each(signatureEndpoints)('%s fails closed when actor billing status is unavailable',async name=>{
    const fixture=loadSignature(name,'unavailable');
    await expect(fixture.dependencies.observeOriginalActor(new AbortController().signal)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
    expect(fixture.external).not.toHaveBeenCalled();
  });
  it.each(signatureEndpoints)('%s preserves an allowed original actor without rewriting Auth claims',async name=>{
    const fixture=loadSignature(name,'allowed');
    expect(await fixture.dependencies.observeOriginalActor(new AbortController().signal)).toBe(actor);
    expect(fixture.external).not.toHaveBeenCalled();
  });
});
