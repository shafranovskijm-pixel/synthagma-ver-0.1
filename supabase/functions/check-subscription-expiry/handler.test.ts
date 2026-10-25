// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe,it,expect,vi } from 'vitest';
import { isPaidSubscriptionPlan,subscriptionMonthlyAmount } from '../_shared/subscription-pricing.ts';
const source=ts.transpile(readFileSync('supabase/functions/check-subscription-expiry/index.ts','utf8').replace(/^import .*;\r?\n/gm,''),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
function fixture(options:{valid?:boolean;authError?:boolean;postpaid?:boolean;orgs?:boolean}={}){
  let handler:(req:Request)=>Promise<Response>;
  const writes:any[]=[];
  const rpc=vi.fn(async(name:string)=>{
    if(name==='verify_billing_cron_secret')return{data:options.valid===true,error:options.authError?{message:'unavailable'}:null};
    if(name==='prepare_due_postpaid_statements')return{data:{created:1,failed:0},error:null};
    if(name==='has_active_postpaid_agreement')return{data:options.postpaid===true,error:null};
    throw Error('Unexpected RPC');
  });
  const from=vi.fn((table:string)=>{
    const q:any={select:()=>q,not:()=>q,gte:()=>q,lte:()=>q,eq:()=>q,
      neq:async()=>({data:options.orgs?[{id:'org',subscription_plan:'start',paid_until:'2026-11-01',custom_price:null,custom_discount:null}]:[],error:null}),
      limit:async()=>({data:[],error:null}),
      insert:(data:any)=>{writes.push({table,data});return q},single:async()=>({data:{id:'invoice'},error:null})};
    return q;
  });
  new Function('serve','createClient','Deno','isPaidSubscriptionPlan','subscriptionMonthlyAmount',source)(
    (fn:any)=>{handler=fn},()=>({rpc,from}),{env:{get:(key:string)=>key==='SUPABASE_SERVICE_ROLE_KEY'?'fixture-service':'https://fixture.invalid'}},isPaidSubscriptionPlan,subscriptionMonthlyAmount);
  const send=(headers:Record<string,string>={},method='POST')=>handler(new Request('https://fixture.invalid',{method,headers}));
  return{send,rpc,from,writes};
}
describe('actual billing scheduler authorization and routing',()=>{
  it('rejects the public gateway token without the private scheduler proof',async()=>{
    const f=fixture();expect((await f.send({Authorization:'Bearer anon'})).status).toBe(401);
    expect(f.rpc).not.toHaveBeenCalled();expect(f.from).not.toHaveBeenCalled();
  });
  it('allows the exact service credential and only prepares closed-period drafts',async()=>{
    const f=fixture();expect((await f.send({Authorization:'Bearer fixture-service'})).status).toBe(200);
    expect(f.rpc.mock.calls.map(x=>x[0])).toEqual(['prepare_due_postpaid_statements']);expect(f.writes).toEqual([]);
  });
  it('requires server verification of the Vault scheduler secret',async()=>{
    const f=fixture({valid:true});expect((await f.send({'x-billing-cron-secret':'a'.repeat(64)})).status).toBe(200);
    expect(f.rpc.mock.calls.map(x=>x[0])).toEqual(['verify_billing_cron_secret','prepare_due_postpaid_statements']);
  });
  it.each([{valid:false,status:401},{authError:true,status:503}])('denies invalid or unavailable scheduler proof: %j',async o=>{
    const f=fixture(o);expect((await f.send({'x-billing-cron-secret':'a'.repeat(64)})).status).toBe(o.status);
    expect(f.rpc).toHaveBeenCalledTimes(1);expect(f.from).not.toHaveBeenCalled();
  });
  it('never creates an advance invoice for an active postpaid organization',async()=>{
    const f=fixture({orgs:true,postpaid:true});expect((await f.send({Authorization:'Bearer fixture-service'})).status).toBe(200);
    expect(f.writes).toEqual([]);
  });
  it('does not allow GET to run billing',async()=>{
    const f=fixture();expect((await f.send({Authorization:'Bearer fixture-service'},'GET')).status).toBe(405);expect(f.rpc).not.toHaveBeenCalled();
  });
});
