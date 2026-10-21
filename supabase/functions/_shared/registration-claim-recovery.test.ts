// @vitest-environment node
import {readFileSync}from'node:fs';
import {describe,expect,it,vi}from'vitest';
import ts from'typescript';
import {claimStudentCapacity,confirmStudentCapacityClaim}from'./student-capacity-claim';
import {isEnrollmentAccessExpired}from'./enrollment-access';
import {hasStudentRegistrationDetails,normalizeStudentRegistrationDetails,resolveRegistrationProfile}from'./student-registration-details';
import {persistStudentJobPosition}from'./student-job-position';
import {isStudentAssignmentQuotaError,studentAssignmentQuotaFailure}from'./course-quota-error';
import {formatTelegramUtm,telegramHtmlValue}from'./telegram-html';

const ids={actor:'a1160000-0000-4000-8000-000000000001',student:'a1160000-0000-4000-8000-000000000002',org:'a1160000-0000-4000-8000-000000000003',foreign:'a1160000-0000-4000-8000-000000000004',course:'a1160000-0000-4000-8000-000000000005',enrollment:'a1160000-0000-4000-8000-000000000006'};
type Step='success'|'rollback'|'lost_committed'|'lost'|'throw'|'quota'|'malformed'|'empty';
type Options={steps?:Step[];readBack?:'error'|'foreign'|'throw';existing?:boolean;publicToken?:boolean};

/** Executes the unmodified served handlers with synthetic SDK responses. It
 * does not create real Auth accounts or prove native SQL concurrency. */
function fixture(name:'register-student'|'landing-self-enroll',options:Options={}){
 const events:string[]=[];let claims=0;
 const profiles:any[]=[{user_id:ids.actor,organization_id:ids.org,login:'actor'},...(options.existing?[{user_id:ids.student,organization_id:ids.org,email:'synthetic@example.invalid',login:'synthetic_student',archived_at:null,blocked_at:null,full_name:'Synthetic student'}]:[])];
 const enrollments:any[]=[];
 const createUser=vi.fn(async(input:any)=>{events.push('auth.create');profiles.push({user_id:ids.student,organization_id:null,login:input.email.split('@')[0],archived_at:null});return{data:{user:{id:ids.student}},error:null};});
 const deleteUser=vi.fn(async()=>{events.push('auth.delete');return{error:null};});
 const notify=vi.fn(async()=>{events.push('notify');return{data:{},error:null};});
 const rpc=vi.fn(async(name:string,args:any)=>{
  if(name==='is_org_owner'||name==='is_student_profile')return{data:true,error:null};
  if(name==='has_org_staff_permission')return{data:false,error:null};
  if(name==='get_organization_student_capacity')return{data:{is_unlimited:true,can_add:true},error:null};
  if(name!=='create_student_profile_with_capacity')throw Error('Unexpected synthetic RPC '+name);
  const step=options.steps?.[claims++]??'success';events.push('claim:'+step);
  if(step==='throw')throw Error('Synthetic private transport detail');
  if(step==='success'||step==='lost_committed'){
   const p=profiles.find(p=>p.user_id===args.p_user_id);if(!p)throw Error('Synthetic Auth skeleton missing');Object.assign(p,{organization_id:ids.org,full_name:args.p_full_name,email:args.p_email,login:args.p_login});
   if(step==='success')return{data:{success:true,is_existing:!!options.existing},error:null};
  }
  if(step==='quota')return{data:{success:false,code:'STUDENT_LIMIT_EXCEEDED',message:'Synthetic quota',current_students:10,max_students:10,is_unlimited:false,limit_source:'plan'},error:null};
  if(step==='malformed')return{data:{success:'true'},error:null};
  if(step==='empty')return{data:null,error:null};
  return{data:null,error:{code:step==='rollback'?'40001':'TRANSPORT',message:'Synthetic private transport detail'}};
 });
 const client:any={rpc,functions:{invoke:notify},auth:{getUser:async()=>({data:{user:{id:ids.actor}},error:null}),admin:{createUser,deleteUser,getUserById:async()=>({data:{user:{id:ids.student}},error:null})}},from(table:string){
  let rows:any[]=table==='profiles'?profiles:table==='user_roles'?[{user_id:ids.actor,role:'organization'}]:table==='courses'?[{id:ids.course,organization_id:ids.org,is_published:true,default_access_days:null,landing_content:{enrollment:{mode:'instant',send_credentials_email:false,notify_telegram:false}}}]:table==='organizations'?[{id:ids.org,name:'Synthetic centre',telegram_notify_enabled:false}]:table==='enrollments'?enrollments:table==='registration_links'?[{token:'synthetic-token',organization_id:ids.org,course_id:ids.course,used_count:0}]:[];
  let inserted=false;
  const result=()=>{
   if(table==='profiles'&&claims>0&&options.readBack==='error')return{data:null,error:{message:'Synthetic private read error'}};
   if(table==='profiles'&&claims>0&&options.readBack==='foreign'&&rows.some(p=>p.user_id===ids.student))return{data:rows.map(p=>p.user_id===ids.student?{...p,organization_id:ids.foreign}:p),error:null};
   return{data:rows,error:null};
  };
  const single=async()=>{if(table==='profiles'&&claims>0&&options.readBack==='throw')throw Error('Synthetic private read rejection');const r=result();return{...r,data:Array.isArray(r.data)?r.data[0]??null:r.data};};
  const chain:any={select:()=>chain,eq:(k:string,v:unknown)=>{rows=rows.filter(r=>r[k]===v);return chain;},is:(k:string,v:unknown)=>{rows=rows.filter(r=>(r[k]??null)===v);return chain;},in:(k:string,v:unknown[])=>{rows=rows.filter(r=>v.includes(r[k]));return chain;},limit:()=>chain,maybeSingle:single,single,insert:(values:any)=>{events.push('insert:'+table);inserted=true;const row={id:ids.enrollment,...values};if(table==='enrollments')enrollments.push(row);rows=[row];return chain;},update:()=>chain,upsert:()=>chain,delete:()=>{events.push('delete:'+table);return chain;},then:(resolve:any)=>Promise.resolve(result()).then(resolve)};
  return chain;
 }};
 let handler!:(request:Request)=>Promise<Response>;
 const source=readFileSync('supabase/functions/'+name+'/index.ts','utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 new Function('serve','createClient','Deno','claimStudentCapacity','confirmStudentCapacityClaim','isEnrollmentAccessExpired','hasStudentRegistrationDetails','normalizeStudentRegistrationDetails','resolveRegistrationProfile','persistStudentJobPosition','checkRateLimit','rateLimitResponse','formatTelegramUtm','telegramHtmlValue','isStudentAssignmentQuotaError','studentAssignmentQuotaFailure',compiled)(
  (callback:typeof handler)=>handler=callback,()=>client,{env:{get:()=> 'synthetic-key'}},claimStudentCapacity,confirmStudentCapacityClaim,isEnrollmentAccessExpired,hasStudentRegistrationDetails,normalizeStudentRegistrationDetails,resolveRegistrationProfile,persistStudentJobPosition,()=>({allowed:true}),()=>new Response(null,{status:429}),formatTelegramUtm,telegramHtmlValue,isStudentAssignmentQuotaError,studentAssignmentQuotaFailure,
 );
 return{events,createUser,deleteUser,notify,rpc,profiles,enrollments,call:async()=>{
  const body=name==='landing-self-enroll'?{course_id:ids.course,full_name:'Synthetic Student',email:'synthetic@example.invalid',consent:true}:{organization_id:ids.org,course_id:ids.course,full_name:'Synthetic Student',email:'synthetic@example.invalid',custom_login:'synthetic_student',...(options.publicToken?{registration_token:'synthetic-token'}:{})};
  const response=await handler(new Request('https://synthetic.invalid/'+name,{method:'POST',headers:{authorization:'Bearer synthetic-caller','content-type':'application/json'},body:JSON.stringify(body)}));
  return{status:response.status,headers:response.headers,body:await response.json()};
 }};
}
function claimCalls(f:ReturnType<typeof fixture>){return f.rpc.mock.calls.filter(c=>c[0]==='create_student_profile_with_capacity');}
function expectRecovery(f:ReturnType<typeof fixture>,result:any,publicResponse:boolean){
 expect(result.body.recovery_required).toBe(true);expect(result.body.enrollment_confirmed).toBe(false);expect(f.deleteUser).not.toHaveBeenCalled();expect(f.events.some(e=>e.startsWith('delete:'))).toBe(false);expect(f.enrollments).toHaveLength(0);expect(f.notify).not.toHaveBeenCalled();
 if(publicResponse){expect(JSON.stringify(result.body)).not.toContain(ids.student);expect(result.body.login).toBeUndefined();expect(result.body.password).toBeUndefined();}
 expect(JSON.stringify(result.body)).not.toContain('Synthetic private');
}

describe.each(['register-student','landing-self-enroll']as const)('%s actual served claim handling',name=>{
 it('retries a confirmed rollback once with one Auth UID and identical frozen RPC inputs',async()=>{
  const f=fixture(name,{steps:['rollback','success']});const r=await f.call();expect(r.status,JSON.stringify(r.body)).toBe(200);expect(name==='register-student'?r.body.success:r.body.ok,JSON.stringify(r.body)).toBe(true);
  expect(f.createUser).toHaveBeenCalledOnce();const calls=claimCalls(f);expect(calls).toHaveLength(2);expect(calls[0][1]).toBe(calls[1][1]);expect(calls[0][1].p_user_id).toBe(ids.student);expect(f.enrollments).toHaveLength(1);expect(f.deleteUser).not.toHaveBeenCalled();
 });
 it('reconciles a lost committed reply without retrying the claim',async()=>{
  const f=fixture(name,{steps:['lost_committed']});const r=await f.call();expect(name==='register-student'?r.body.success:r.body.ok,JSON.stringify(r.body)).toBe(true);expect(claimCalls(f)).toHaveLength(1);expect(f.enrollments).toHaveLength(1);expect(f.deleteUser).not.toHaveBeenCalled();
 });
 it.each<Step>(['lost','throw','empty','malformed'])('retains a new identity on unknown %s and stops before enrollment/notifications',async step=>{
  const f=fixture(name,{steps:[step]});const r=await f.call();expectRecovery(f,r,name==='landing-self-enroll');expect(f.createUser).toHaveBeenCalledOnce();expect(claimCalls(f)).toHaveLength(1);
 });
 it.each(['error','foreign','throw']as const)('does not use a %s readback as same-tenant proof',async readBack=>{
  const f=fixture(name,{steps:['lost'],readBack});expectRecovery(f,await f.call(),name==='landing-self-enroll');
 });
 it('stops after two rollbacks without deleting the identity',async()=>{
  const f=fixture(name,{steps:['rollback','rollback']});const r=await f.call();expectRecovery(f,r,name==='landing-self-enroll');expect(claimCalls(f)).toHaveLength(2);expect(f.createUser).toHaveBeenCalledOnce();
 });
 it('preserves the definitive quota HTTP409 and an explicit recovery state',async()=>{
  const f=fixture(name,{steps:['quota']});const r=await f.call();expect(r.status).toBe(409);expect(r.body.code).toBe('STUDENT_LIMIT_EXCEEDED');expectRecovery(f,r,name==='landing-self-enroll');
 });
 it('never creates or deletes another identity for an existing account',async()=>{
  const f=fixture(name,{existing:true});const r=await f.call();expect(name==='register-student'?r.body.success:r.body.ok,JSON.stringify(r.body)).toBe(true);expect(f.createUser).not.toHaveBeenCalled();expect(f.deleteUser).not.toHaveBeenCalled();
 });
});
it('does not expose internal identity or credentials in public-token recovery',async()=>{
 const f=fixture('register-student',{publicToken:true,steps:['lost']});expectRecovery(f,await f.call(),true);
});
