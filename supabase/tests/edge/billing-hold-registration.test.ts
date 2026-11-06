import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe,expect,it,vi } from 'vitest';
import * as billing from '../../functions/_shared/billing-access';
const actor='10000000-0000-4000-8000-000000000001',org='20000000-0000-4000-8000-000000000001';
type Mode='actor'|'auto-link'|'registration-link'|'landing';
function fixture(endpoint:string,mode:Mode,unavailable:boolean){
  let handler!:(req:Request)=>Promise<Response>;
  const external=vi.fn(()=>{throw Error('unexpected_external_side_effect');});
  const reads:string[]=[];
  const rpc=vi.fn(async(name:string,args:any)=>{
    expect(args).toEqual(mode==='registration-link'||mode==='landing'?{p_organization_id:org}:{_user_id:actor});
    expect(name).toBe(mode==='registration-link'||mode==='landing'?'organization_billing_access_allowed':'is_user_blocked');
    return unavailable?{data:null,error:{message:'private-trace'}}:{data:mode==='registration-link'||mode==='landing'?false:true,error:null};
  });
  const db={rpc,auth:{getUser:async()=>({data:{user:{id:actor}},error:null}),admin:new Proxy({},{get:()=>external})},
    from:(table:string)=>{
      reads.push(table);
      const row=table==='student_login_tokens'&&mode==='auto-link'?{id:'known-token',user_id:actor,organization_id:org,revoked_at:null}
        :table==='registration_links'&&mode==='registration-link'?{id:'verified-link',organization_id:org,expires_at:null}
        :table==='courses'&&mode==='landing'?{id:'course',organization_id:org,is_published:true}:null;
      if(!row)throw Error('unexpected_service_data_read:'+table);
      const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:row,error:null})};return q;
    }};
  const serve=(fn:any)=>{handler=fn;};
  const js=ts.transpileModule(readFileSync(resolve('supabase/functions',endpoint,'index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{require:(name:string)=>{
    if(name.includes('supabase-js'))return{createClient:()=>db};
    if(name.includes('billing-access'))return billing;
    if(name.includes('http/server'))return{serve};
    if(name.includes('rate-limit'))return{checkRateLimit:()=>({allowed:true}),rateLimitResponse:external};
    return new Proxy({},{get:()=>external});
  },Deno:{serve,env:{get:()=> 'synthetic-config'}},exports:{},Request,Response,Headers,URL,fetch:external,
    console:{error:()=>{},log:()=>{},warn:()=>{}},setTimeout,clearTimeout,TextEncoder,TextDecoder});
  return{handler,rpc,external,reads};
}
describe('actual entrypoints stop before Auth creation and provider effects',()=>{
  const cases:Array<[string,Mode,Record<string,unknown>]>= [
    ['student-chat','actor',{messages:[]}],['suggest-template-variables','actor',{}],['create-company-user','actor',{}],
    ['register-student','actor',{}],['student-auto-login','auto-link',{token:'verified-token'}],
    ['register-student','registration-link',{registration_token:'verified-link',full_name:'Synthetic learner',organization_id:'spoofed-other-org'}],
    ['landing-self-enroll','landing',{course_id:'course',full_name:'Synthetic learner',email:'fixture@example.invalid',consent:true}],
  ];
  it.each(cases)('%s denies a held subject/target from %s before mutation',async(endpoint,mode,body)=>{
    const f=fixture(endpoint,mode,false);const result=await f.handler(new Request('https://example.invalid/'+endpoint,{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify(body)}));
    expect(result.status).toBe(403);expect(f.rpc).toHaveBeenCalledTimes(1);expect(f.external).not.toHaveBeenCalled();
    expect(f.reads).toEqual(mode==='actor'?[]:mode==='auto-link'?['student_login_tokens']:mode==='registration-link'?['registration_links']:['courses']);
  });
  it.each(cases)('%s fails closed on inaccessible billing check for %s',async(endpoint,mode,body)=>{
    const f=fixture(endpoint,mode,true);const result=await f.handler(new Request('https://example.invalid/'+endpoint,{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify(body)}));
    expect(result.status).toBe(503);expect(await result.text()).not.toContain('private-trace');expect(f.external).not.toHaveBeenCalled();
  });
});
