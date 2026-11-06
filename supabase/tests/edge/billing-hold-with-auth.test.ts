import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as billing from '../../functions/_shared/billing-access';

const actor='10000000-0000-4000-8000-000000000001';
const claims={sub:actor,email:'fixture@example.invalid',role:'authenticated'};
const consumers=['generate-achievements','generate-explanation','generate-image-alt','generate-seo','get-test-results','grade-test'];
type State='held'|'unavailable'|'allowed'|'unverified';

/** Execute the actual shared wrapper and, optionally, actual consuming index.
 * Only the SDK Auth/billing responses are synthetic; provider/RPC/AI callbacks
 * are tripwires and must remain unreachable after denial. */
function load(state:State,consumer?:string){
  let handler!:(request:Request)=>Promise<Response>;
  const external=vi.fn(()=>{throw Error('unexpected_provider_or_test_rpc');});
  const getClaims=vi.fn(async()=>state==='unverified'?{data:null,error:Error('invalid-jwt')}:{data:{claims},error:null});
  const rpc=vi.fn(async(name:string,args:any)=>{
    if(name!=='is_user_blocked'||args._user_id!==actor)throw Error('unexpected_rpc');
    return state==='unavailable'?{data:null,error:{message:'private-failure'}}:{data:state==='held',error:null};
  });
  const callbacks=vi.fn(async(context:any)=>({subject:context.user.sub,body:context.body}));
  const sharedExports:any={};
  const evaluate=(file:string,exports:any,require:(name:string)=>any)=>{
    const source=readFileSync(resolve('supabase/functions',file),'utf8');
    const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(js,{exports,require,Deno:{serve:(fn:any)=>{handler=fn;},env:{get:()=> 'synthetic-config'}},
      Request,Response,Headers,URL,TextEncoder,TextDecoder,fetch:external,
      console:{log:()=>{},error:()=>{},warn:()=>{}}},{filename:file});
  };
  evaluate('_shared/handler.ts',sharedExports,(id:string)=>{
    if(id.includes('supabase-js'))return{createClient:()=>({auth:{getClaims},rpc})};
    if(id.includes('billing-access'))return billing;
    throw Error('unexpected_shared_import');
  });
  if(consumer){
    evaluate(consumer+'/index.ts',{},(id:string)=>id.includes('_shared/handler.ts')?sharedExports:new Proxy({},{get:()=>external}));
  }else handler=sharedExports.withAuth(callbacks);
  if(!handler)throw Error('No actual handler');
  return{handler,callbacks,getClaims,rpc,external};
}
const request=()=>new Request('https://example.invalid/action',{method:'POST',headers:{authorization:'Bearer sdk-verified-token'},
  body:JSON.stringify({theme:'Synthetic',question:'Synthetic',imageUrl:'https://example.invalid/image.png',courseTitle:'Synthetic',lesson_id:actor,attempt_id:actor})});

describe('actual withAuth claims-to-billing boundary',()=>{
  it('denies a held SDK-verified subject before reading the body or calling the consumer',async()=>{
    const fixture=load('held'),req=request(),bodyRead=vi.spyOn(req,'text');
    const response=await fixture.handler(req);
    expect(response.status).toBe(403);expect(fixture.getClaims).toHaveBeenCalledWith('sdk-verified-token');
    expect(fixture.rpc).toHaveBeenCalledWith('is_user_blocked',{_user_id:actor});
    expect(bodyRead).not.toHaveBeenCalled();expect(fixture.callbacks).not.toHaveBeenCalled();expect(fixture.external).not.toHaveBeenCalled();
  });
  it('fails closed on unavailable billing status without provider work or leaking database details',async()=>{
    const fixture=load('unavailable'),response=await fixture.handler(request());
    expect(response.status).toBe(503);expect(await response.text()).not.toContain('private-failure');
    expect(fixture.callbacks).not.toHaveBeenCalled();expect(fixture.external).not.toHaveBeenCalled();
  });
  it('passes the original verified claims and parsed body to the consumer when allowed',async()=>{
    const fixture=load('allowed'),response=await fixture.handler(request());
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({subject:actor,body:{theme:'Synthetic'}});
    expect(fixture.callbacks).toHaveBeenCalledOnce();expect(fixture.callbacks.mock.calls[0][0].user).toBe(claims);
    expect(fixture.external).not.toHaveBeenCalled();
  });
  it('does not use unverified claims or execute the billing RPC on invalid Auth',async()=>{
    const fixture=load('unverified'),response=await fixture.handler(request());
    expect(response.status).toBe(401);expect(fixture.rpc).not.toHaveBeenCalled();
    expect(fixture.callbacks).not.toHaveBeenCalled();expect(fixture.external).not.toHaveBeenCalled();
  });
  it.each(consumers)('%s actual consumer cannot call AI/provider/test RPC for a held actor',async consumer=>{
    const fixture=load('held',consumer),response=await fixture.handler(request());
    expect(response.status).toBe(403);expect(fixture.external).not.toHaveBeenCalled();expect(fixture.rpc).toHaveBeenCalledOnce();
  });
  it.each(consumers)('%s actual consumer fails closed while billing status is unavailable',async consumer=>{
    const fixture=load('unavailable',consumer),response=await fixture.handler(request());
    expect(response.status).toBe(503);expect(fixture.external).not.toHaveBeenCalled();expect(await response.text()).not.toContain('private-failure');
  });
});
