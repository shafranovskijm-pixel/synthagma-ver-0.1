import type { AccessDb } from '../../../functions/_shared/privileged-access.ts';
import { createDadataCompanyHandler } from '../../../functions/dadata-company/handler.ts';
import { createCourseInvitationHandler } from '../../../functions/send-course-invitation/handler.ts';
export const ACTOR='10000000-0000-4000-8000-000000000001', ORG='20000000-0000-4000-8000-000000000002', OTHER='30000000-0000-4000-8000-000000000003', COURSE='40000000-0000-4000-8000-000000000004', STUDENT='50000000-0000-4000-8000-000000000005';
export const SENTINEL='PRIVATE_PROVIDER_BODY_QA_SENTINEL';
export function fixture(kind: 'dadata'|'invitation', overrides: Record<string, any> = {}) {
 const cfg: any = {authenticated:true, accountActive:true, profile:true, blocked:false, profileOrg:ORG, revoked:false, admin:false, globalSales:false, permission:(p:string,o:string)=>o===ORG&&['settings.write','students.write'].includes(p), rate:true, key:'QA_PROVIDER_KEY_NOT_REAL', course:true, courseOrg:ORG, secondCourseOrg:ORG, student:true, studentOrg:ORG, studentBlocked:false, studentRevoked:false, enrollment:true, enrollmentCourse:COURSE, enrollmentUser:STUDENT, enrollmentStatus:'active', organization:true, providerStatus:200, ...overrides};
 const trace: any[] = [], networkCalls: any[] = [], keyCalls: string[] = [], logs: string[] = [], callerHeaders: string[] = []; let courseReads=0;
 const fail = (at:string) => { if(cfg.throwAt===at)throw new Error(SENTINEL); };
 const db: AccessDb = {auth:{getUser:async token=>{trace.push({action:'auth',token});fail('auth');return{data:{user:cfg.authenticated&&token==='qa-actor-token'?{id:ACTOR}:null},error:null};}},from:(table:string)=>{
  let columns='', filters: Record<string, unknown>={};const q:any={select:(c:string)=>{columns=c;return q;},eq:(k:string,v:unknown)=>{filters[k]=v;return q;},maybeSingle:async()=>{
   trace.push({action:'query',table,columns,filters:{...filters}});fail('query:'+table);let row:any;
   if(table==='account_deletion_revocations')row=(filters.user_id===ACTOR?cfg.revoked:cfg.studentRevoked)?{user_id:filters.user_id}:null;
   else if(table==='profiles'&&filters.user_id===ACTOR)row=cfg.profile?{organization_id:cfg.profileOrg,blocked_at:cfg.blocked?'2026-10-26':null}:null;
   else if(table==='user_roles')row=cfg.admin?{role:'admin'}:null;
   else if(table==='courses'){courseReads++;row=cfg.course?{id:COURSE,title:'DB <course> & title',organization_id:courseReads===1?cfg.courseOrg:cfg.secondCourseOrg}:null;}
   else if(table==='profiles'){if(filters.organization_id!==ORG||filters.email!=='student@example.invalid')throw new Error('UNSCOPED_RECIPIENT_QUERY');row=cfg.student?{user_id:STUDENT,email:'student@example.invalid',organization_id:cfg.studentOrg,blocked_at:cfg.studentBlocked?'2026-10-26':null}:null;}
   else if(table==='enrollments'){if(filters.course_id!==COURSE||filters.user_id!==STUDENT)throw new Error('UNSCOPED_ENROLLMENT_QUERY');row=cfg.enrollment?{id:'60000000-0000-4000-8000-000000000006',course_id:cfg.enrollmentCourse,user_id:cfg.enrollmentUser,status:cfg.enrollmentStatus}:null;}
   else if(table==='organizations')row=cfg.organization?{name:'DB <org> & title'}:null;
   else throw new Error('UNEXPECTED_QUERY:'+table);
   if(cfg.queryError===table)return{data:null,error:new Error(SENTINEL)};
   // Real select projection: course title must not be exposed by the metadata query.
   return{data:row?Object.fromEntries(columns.split(',').map(k=>[k,row[k]])):null,error:null};
  }};return q;
 },rpc:async(name,args)=>{trace.push({action:'adminRPC',name,args});fail('adminRPC:'+name);if(name!=='is_platform_sales_manager')throw new Error('UNEXPECTED_ADMIN_RPC');return{data:cfg.globalSales,error:null};}};
 const caller:AccessDb={...db,rpc:async(name,args)=>{trace.push({action:'callerRPC',name,args});fail('callerRPC:'+name);if(cfg.rpcError===name)return{data:null,error:new Error(SENTINEL)};if(name==='account_deletion_access_allowed')return{data:cfg.accountActive,error:null};if(name==='can_access_organization')return{data:cfg.permission(args!._permission,args!._organization_id),error:null};throw new Error('UNEXPECTED_CALLER_RPC');}};
 const deps={admin:db,caller:(header:string)=>{callerHeaders.push(header);return caller;},apiKey:()=>{keyCalls.push('key');return cfg.key;},rate:(key:string)=>{trace.push({action:'rate',key});return{allowed:cfg.rate};},log:(event:any)=>{logs.push(event);if(cfg.throwLog)throw new Error(SENTINEL);},network:(async(input:any,init:any)=>{trace.push({action:'network'});networkCalls.push({url:String(input),init,body:JSON.parse(init.body)});fail('network');if(cfg.response)return cfg.response();const data=kind==='dadata'?{suggestions:[{value:'DB Company',data:{name:{full_with_opf:'DB Full',short_with_opf:'DB Short'},inn:'7707083893',kpp:'770701001',ogrn:'1027700132195',address:{unrestricted_value:'DB Address'},management:{name:'DB Person',post:'Director'},state:{status:'ACTIVE'},type:'LEGAL',opf:{short:'ООО'},founders:[],licenses:[]}}]}:{id:SENTINEL};return new Response(JSON.stringify(data),{status:cfg.providerStatus});}) as typeof fetch};
 const handler=kind==='dadata'?createDadataCompanyHandler(deps):createCourseInvitationHandler(deps);
 const request=(body:any=kind==='dadata'?{inn:'7707083893'}:{courseId:COURSE,email:'student@example.invalid'},opts:any={})=>handler(new Request('https://local.test/'+kind,{method:opts.method||'POST',headers:{'content-type':'application/json',...(opts.auth===null?{}:{authorization:opts.auth||'Bearer qa-actor-token'}),...(opts.origin?{origin:opts.origin}:{}),...(opts.headers||{})},body:['GET','HEAD'].includes(opts.method)?undefined:(opts.raw??JSON.stringify(body))}));
 return{cfg,trace,networkCalls,keyCalls,logs,callerHeaders,request};
}
export async function closed(result: Response, sentinel=SENTINEL) { const text=await result.text();if(text.includes(sentinel))throw new Error('RAW_SENTINEL_ESCAPED');return{text,data:JSON.parse(text)}; }
