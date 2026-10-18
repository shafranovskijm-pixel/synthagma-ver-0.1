// @vitest-environment node
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {describe,expect,it,vi} from 'vitest';
import * as access from './privileged-access';
import {requireDocumentWrite} from './document-operation-access';
import * as programFacts from './program-facts';
import {numberStudents} from './docx-ooxml/compile';
import {formatMoneyRu,moneyToWordsRu} from './docx-ooxml/money';
import {sha256CanonicalJson} from './docx-ooxml/idempotency';
const actor='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002',group='00000000-0000-4000-8000-000000000003',company='00000000-0000-4000-8000-000000000004';
const revision='uc-permissions-20261018-v2',serviceKey='synthetic-private-service-key';
type Options={invalid?:boolean;revoked?:boolean;allowed?:boolean;rpcError?:boolean;serviceEnvMissing?:boolean;programError?:boolean;programResponse?:unknown;legacyRecord?:unknown};
function actualHandler(name:string,options:Options={}){
 const sources:string[]=[];
 const effects={upload:vi.fn(),remove:vi.fn(),insert:vi.fn(),update:vi.fn(),smtp:vi.fn(),zipLoad:vi.fn(),zipConstructor:vi.fn(),roster:vi.fn(async()=>({data:[],error:null}))};
 const rpc=vi.fn(async(name:string)=>({data:name==='get_group_program_facts'?(options.programResponse??{state:'unconfirmed',reason:'no_confirmed_group_binding',group_id:group,course_id:null,enrollment_id:null,revision:0,binding:null,snapshot:null,enrollments:[]}):options.allowed===true,error:options.rpcError||name==='get_group_program_facts'&&options.programError?{message:'RPC unavailable'}:null}));
 const from=vi.fn((table:string)=>{
  if(table!=='account_deletion_revocations')sources.push(table);
  const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='account_deletion_revocations'&&options.revoked?{user_id:actor}:table==='org_contracts'?options.legacyRecord??null:null,error:null}),insert:effects.insert,update:effects.update};return q;
 });
 const db={auth:{getUser:vi.fn(async()=>({data:{user:options.invalid?null:{id:actor}},error:null}))},from,rpc,storage:{from:()=>({upload:effects.upload,remove:effects.remove})}};
 const createClient=vi.fn(()=>db);let handler:(req:Request)=>Promise<Response>;const serve=(fn:typeof handler)=>{handler=fn;};
 const source=readFileSync(`supabase/functions/${name}/index.ts`,'utf8');const ast=ts.createSourceFile('handler.ts',source,ts.ScriptTarget.Latest,true);
 const ranges=ast.statements.flatMap(s=>ts.isImportDeclaration(s)?[{start:s.getFullStart(),end:s.end}]:ts.canHaveModifiers(s)?(ts.getModifiers(s)||[]).filter(m=>m.kind===ts.SyntaxKind.ExportKeyword).map(m=>({start:m.getStart(ast),end:m.end})):[]);
 const stripped=ranges.sort((a,b)=>b.start-a.start).reduce((s,r)=>s.slice(0,r.start)+s.slice(r.end),source);
 const executable=ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const deps={...access,...programFacts,requireDocumentWrite,z,createClient,serve,numberStudents,formatMoneyRu,moneyToWordsRu,sha256CanonicalJson,readEffectiveGroupProfiles:effects.roster,JSZip:Object.assign(effects.zipConstructor,{loadAsync:effects.zipLoad}),sendPlatformEmail:effects.smtp,
  corsHeaders:{'Access-Control-Allow-Origin':'*'},console:{log(){},warn(){},error(){}},Deno:{serve,env:{get:(key:string)=>key==='SUPABASE_SERVICE_ROLE_KEY'?(options.serviceEnvMissing?undefined:serviceKey):key==='SUPABASE_ANON_KEY'?'synthetic-public-key':'https://synthetic.invalid'}}};
 if(name==='process-document-expiry-reminders')delete (deps as any).corsHeaders;
 new Function(...Object.keys(deps),executable)(...Object.values(deps));
 return {handler:handler!,db,createClient,effects,sources};
}
function req(name:string,token:string|null='verified-user',method='POST',overrides:Record<string,unknown>={}){
 const body=name==='compile-docx-contract'?{templateKey:'synthetic-template',organizationId:org,groupId:group,companyId:company,studentUserIds:[],contractName:'Synthetic contract',contractNumber:'draft',contractDate:'2026-10-18',totalAmount:10,taxClauseExplicit:true,scalars:{},programs:[{}],students:[{}]}:{organizationId:org,groupId:group,studentUserIds:[]};
 return new Request('https://synthetic.invalid/function',{method,headers:token?{Authorization:`Bearer ${token}`}:{},...(method==='POST'?{body:JSON.stringify({...body,...overrides})}:{})});
}

describe('actual DOCX compiler legacy artifact replay',()=>{
 const submissionKey='00000000-0000-4000-8000-000000000006';
 const overrides={submissionKey,studentUserIds:[actor],studentsMeta:[{user_id:actor,full_name:'QA learner'}]};
 async function fixture(){
  const body=await req('compile-docx-contract','verified-user','POST',overrides).json();
  const snapshot={scalars:{PRICE_NUM:formatMoneyRu(body.totalAmount),PRICE_WORDS:moneyToWordsRu(body.totalAmount),DOC_NO:body.contractNumber},programs:body.programs,students:numberStudents(body.students),curricula:[],totalAmount:body.totalAmount,taxClauseExplicit:true};
  const template={templateKey:body.templateKey,templateVersionLabel:'legacy-v1',templateSha256:'a'.repeat(64)};
  const digest=await sha256CanonicalJson({...template,organizationId:org,groupId:group,companyId:company,studentUserIds:body.studentUserIds,studentsMeta:body.studentsMeta,contractName:body.contractName,contractNumber:body.contractNumber,contractDate:body.contractDate,snapshot});
  return {id:'existing-qa-artifact',student_group_id:group,company_id:company,counterparty_type:'legal',template_format:'docx_ooxml',template_registry_key:template.templateKey,template_version_label:template.templateVersionLabel,template_sha256:template.templateSha256,docx_path:'existing-qa-original.docx',docx_sha256:'b'.repeat(64),students:body.studentsMeta,submission_snapshot_sha256:digest,variables_snapshot:{scalars:snapshot.scalars,programs:snapshot.programs,students:snapshot.students,curricula:[],total_amount:10,kept_curricula:[]}};
 }
 it('returns exact stored legacy bytes without generating files or inventing programme proof',async()=>{
  const prior=await fixture();const f=actualHandler('compile-docx-contract',{allowed:true,legacyRecord:prior,programError:true});
  const res=await f.handler(req('compile-docx-contract','verified-user','POST',overrides));expect(res.status).toBe(200);expect(await res.json()).toMatchObject({idempotent_replay:true,contract:{id:prior.id,docx_path:prior.docx_path}});
  for(const effect of Object.values(f.effects))expect(effect).not.toHaveBeenCalled();expect(prior.variables_snapshot).not.toHaveProperty('program_facts');
  expect(f.db.rpc).not.toHaveBeenCalledWith('get_group_program_facts',expect.anything());
 },20000);
 it.each(['foreign-group','foreign-company','changed-student-identity','changed-body','missing-original-identity'])('denies %s instead of adapting historical facts',async variant=>{
  const prior=await fixture();if(variant==='foreign-group')prior.student_group_id=company;if(variant==='missing-original-identity')prior.template_sha256='';
  if(variant==='foreign-company')prior.company_id=group;if(variant==='changed-student-identity')prior.students=[];
  const f=actualHandler('compile-docx-contract',{allowed:true,legacyRecord:prior});const res=await f.handler(req('compile-docx-contract','verified-user','POST',{...overrides,...(variant==='changed-body'?{totalAmount:11}:{})}));expect(res.status).toBe(409);
  for(const effect of Object.values(f.effects))expect(effect).not.toHaveBeenCalled();
 });
 it('checks current group write authority before returning a historical artifact',async()=>{
  const prior=await fixture();const f=actualHandler('compile-docx-contract',{allowed:false,legacyRecord:prior});
  expect((await f.handler(req('compile-docx-contract','verified-user','POST',overrides))).status).toBe(403);
  expect(f.sources).toEqual([]);for(const effect of Object.values(f.effects))expect(effect).not.toHaveBeenCalled();
 });
});
describe.each(['compile-docx-contract','compile-group-class-journal'])('actual %s caller authorization',name=>{
 it.each([
  {label:'missing programme RPC',options:{programError:true},status:503},
  {label:'malformed confirmation',options:{programResponse:{state:'confirmed'}},status:409},
  {label:'foreign group response',options:{programResponse:{state:'unconfirmed',reason:'no_confirmed_group_binding',group_id:company,course_id:null,enrollment_id:null,revision:0,binding:null,enrollments:[]}},status:409},
 ])('rejects $label before source reads, rendering or uploads',async({options,status})=>{
  const f=actualHandler(name,{allowed:true,...options});const res=await f.handler(req(name));expect(res.status).toBe(status);
  expect(f.sources).toEqual([]);for(const effect of Object.values(f.effects))expect(effect).not.toHaveBeenCalled();
  expect(f.db.rpc).toHaveBeenCalledWith('get_group_program_facts',{p_organization_id:org,p_group_id:group,p_enrollment_id:null});
 });
 it.each([
  {label:'missing authentication',token:null,options:{},status:401},
  {label:'invalid token',token:'invalid-public-key',options:{invalid:true},status:401},
  {label:'revoked account',token:'verified-user',options:{revoked:true},status:403},
  {label:'outside assigned group',token:'verified-user',options:{allowed:false},status:403},
  {label:'read-only platform staff',token:'verified-viewer',options:{allowed:false},status:403},
  {label:'missing authoritative RPC',token:'verified-user',options:{rpcError:true},status:503},
 ])('denies $label before private source reads or compiler effects',async({token,options,status})=>{
  const f=actualHandler(name,options);const res=await f.handler(req(name,token));expect(res.status).toBe(status);expect(res.headers.get('X-Sintagma-Function-Revision')).toBe('uc-program-facts-20261018-v1');
  expect(f.sources).toEqual([]);for(const effect of Object.values(f.effects))expect(effect).not.toHaveBeenCalled();
 });
 it('binds the verified writer to exact org/group before it reaches source lookup',async()=>{
  const f=actualHandler(name,{allowed:true});const res=await f.handler(req(name));expect(res.status).toBe(name==='compile-docx-contract'?404:409);
  expect(f.db.rpc).toHaveBeenCalledTimes(2);expect(f.db.rpc).toHaveBeenCalledWith('uc_document_action_allowed',{p_org:org,p_action:'write',p_group:group,p_enrollment:null});
  expect(f.db.rpc).toHaveBeenCalledWith('get_group_program_facts',{p_organization_id:org,p_group_id:group,p_enrollment_id:null});
  const sourceCall=f.db.from.mock.calls.findIndex(([table])=>table!=='account_deletion_revocations');expect(sourceCall).toBeGreaterThanOrEqual(0);
  expect(f.db.rpc.mock.invocationCallOrder[0]).toBeLessThan(f.db.from.mock.invocationCallOrder[sourceCall]);
  expect(f.sources).toEqual(name==='compile-docx-contract'?['organizations']:['student_groups','organizations']);
  if(name==='compile-group-class-journal')expect(f.effects.roster).toHaveBeenCalledWith(expect.anything(),org,group,expect.any(String));
  for(const [key,effect]of Object.entries(f.effects))if(key!=='roster')expect(effect).not.toHaveBeenCalled();
 });
 it.each([['OPTIONS',200],['GET',405]] as const)('answers %s before client creation',async(method,status)=>{
  const f=actualHandler(name);const res=await f.handler(req(name,null,method));expect(res.status).toBe(status);expect(res.headers.get('X-Sintagma-Function-Revision')).toBe('uc-program-facts-20261018-v1');expect(f.createClient).not.toHaveBeenCalled();for(const effect of Object.values(f.effects))expect(effect).not.toHaveBeenCalled();
 });
});
describe('actual expiry reminder service-only boundary',()=>{
 it.each([
  {method:'OPTIONS',token:null,options:{},status:200},
  {method:'GET',token:null,options:{},status:405},
  {method:'POST',token:null,options:{},status:401},
  {method:'POST',token:'synthetic-public-anon-jwt',options:{},status:401},
  {method:'POST',token:serviceKey,options:{serviceEnvMissing:true},status:401},
 ])('rejects $method / $token without constructing a database or sending mail',async({method,token,options,status})=>{
  const f=actualHandler('process-document-expiry-reminders',options);const res=await f.handler(req('process-document-expiry-reminders',token,method));expect(res.status).toBe(status);expect(res.headers.get('X-Sintagma-Function-Revision')).toBe(revision);expect(f.createClient).not.toHaveBeenCalled();expect(f.sources).toEqual([]);for(const effect of Object.values(f.effects))expect(effect).not.toHaveBeenCalled();
 });
});
