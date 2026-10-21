// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe,expect,it,vi } from 'vitest';
import * as access from './privileged-access';
import * as ocr from './ocr-access';

const ids={actor:'e1700000-0000-4000-8000-000000000001',org:'e1700000-0000-4000-8000-000000000002',
 otherOrg:'e1700000-0000-4000-8000-000000000003',student:'e1700000-0000-4000-8000-000000000004',
 otherStudent:'e1700000-0000-4000-8000-000000000005',document:'e1700000-0000-4000-8000-000000000006'};
const filePath=ids.student+'/identity/synthetic-snils.pdf';
const input={documentId:ids.document,organizationId:ids.org,studentUserId:ids.student,doc_type:'snils'};
const confirmedGrant=()=>({organization_id:ids.org,active:true,entitlements:{all_platform_features:true}});
interface Scenario {
 plan?:string;grant?:unknown;grantError?:boolean;deniedPermission?:string;missingDocument?:boolean;
 downloadError?:boolean;bytes?:Uint8Array;announcedSize?:number;sourceChangesAfterDownload?:boolean;revokedAtCheck?:number;
}
function fixture(options:Scenario={}){
 const events:string[]=[];let authChecks=0,downloaded=false;
 const bytes=options.bytes??new TextEncoder().encode('%PDF-1.7\nSynthetic nonpersonal document');
 const readBytes=vi.fn(async()=>{events.push('private.bytes');return bytes.slice().buffer;});
 const download=vi.fn(async(path:string)=>{events.push('private.download');downloaded=true;return {
  data:options.downloadError?null:{size:options.announcedSize??bytes.length,arrayBuffer:readBytes},error:options.downloadError?new Error('RLS denies private file'):null};});
 const grant=options.grant===undefined?confirmedGrant():options.grant;
 const userRpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  if(name==='get_postpaid_access_profile'){events.push('grant');return {data:grant,error:options.grantError?new Error('grant unavailable'):null};}
  if(!['uc_document_has_action','can_access_organization','uc_document_student_scope_allowed'].includes(name))throw new Error('Unexpected caller RPC:'+name);
  events.push('permission:'+name);return {data:name!==options.deniedPermission,error:null};
 });
 const userFrom=vi.fn((table:string)=>{
  if(!['student_identity_documents','organizations'].includes(table))throw new Error('Unexpected caller table:'+table);
  const filters:Record<string,unknown>={};
  const q={select:vi.fn(()=>q),eq:vi.fn((key:string,value:unknown)=>{filters[key]=value;return q;}),
   limit:vi.fn(async()=>{
    events.push('source');const row={id:ids.document,organization_id:ids.org,user_id:ids.student,type:'snils',
     file_path:options.sourceChangesAfterDownload&&downloaded?ids.student+'/identity/replaced.pdf':filePath};
    return {data:options.missingDocument||Object.entries(filters).some(([key,value])=>row[key as keyof typeof row]!==value)?[]:[row],error:null};
   }),
   maybeSingle:vi.fn(async()=>{if(table!=='organizations')throw new Error('Unexpected singleton');events.push('plan');
    return {data:filters.id===ids.org?{subscription_plan:options.plan??'start'}:null,error:null};}),
  };return q;
 });
 const adminFrom=vi.fn((table:string)=>{
  if(table!=='account_deletion_revocations')throw new Error('Service client attempted business source read:'+table);
  const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),maybeSingle:vi.fn(async()=>({data:authChecks>=(options.revokedAtCheck??Infinity)?{user_id:ids.actor}:null,error:null}))};return q;
 });
 const adminRpc=vi.fn(async()=>{throw new Error('Service RPC cannot supply caller authority');});
 const adminStorage=vi.fn(()=>{throw new Error('Service storage cannot bypass private-file policy');});
 const admin={auth:{getUser:vi.fn(async(token:string)=>{events.push('auth');authChecks++;return {data:{user:token==='original-actor'?{id:ids.actor}:null},error:null};})},from:adminFrom,rpc:adminRpc,storage:{from:adminStorage}};
 const userStorage=vi.fn((bucket:string)=>{expect(bucket).toBe('student-documents');return {download};});
 const user={from:userFrom,rpc:userRpc,storage:{from:userStorage}};
 const createClient=vi.fn((_url:string,key:string,_config?:unknown)=>key==='synthetic-service'?admin:user);
 const callAI=vi.fn(async(_url:string,_init:unknown)=>{events.push('ai');return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({snils:'12345678901',birth_date:'1990-01-01',confidence:0.9})}}]}),{status:200});});
 return {options,events,readBytes,download,userRpc,userFrom,userStorage,adminFrom,adminRpc,adminStorage,createClient,callAI};
}
function actualHandler(f:ReturnType<typeof fixture>){
 // Existing document-operation-access.test.ts served-handler pattern, with real authorization helpers.
 const source=readFileSync(resolve(process.cwd(),'supabase/functions/ocr-snils/index.ts'),'utf8');
 const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 const stripped=[...ast.statements.filter(ts.isImportDeclaration)].reverse().reduce((text,statement)=>text.slice(0,statement.getFullStart())+text.slice(statement.end),source);
 const executable=ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 let handler!:(request:Request)=>Promise<Response>;
 const serve=(fn:typeof handler)=>{handler=fn;};
 const env:Record<string,string>={SUPABASE_URL:'https://synthetic.supabase.invalid',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',LOVABLE_API_KEY:'synthetic-ai-key'};
 const dependencies={...access,...ocr,createClient:f.createClient,fetch:f.callAI,Deno:{serve,env:{get:(key:string)=>env[key]}},console:{error(){},log(){}}};
 new Function(...Object.keys(dependencies),executable)(...Object.values(dependencies));return handler;
}
function request(overrides:Record<string,unknown>={}){return new Request('https://synthetic.invalid/ocr-snils',{method:'POST',headers:{Authorization:'Bearer original-actor','Content-Type':'application/json'},body:JSON.stringify({...input,...overrides})});}
function noPrivateOrAI(f:ReturnType<typeof fixture>){expect(f.download).not.toHaveBeenCalled();expect(f.callAI).not.toHaveBeenCalled();expect(f.adminStorage).not.toHaveBeenCalled();}

describe('OCR all-platform grant boundary in the actual served handler',()=>{
 it('allows a low plan only with the original caller exact server-confirmed active grant, then rechecks source around AI',async()=>{
  const f=fixture();const response=await actualHandler(f)(request());
  expect(response.status).toBe(200);expect(response.headers.get('X-Sintagma-Function-Revision')).toBe('uc-ocr-scope-feature-grant-20261021-v2');
  expect(await response.json()).toMatchObject({documentId:ids.document,doc_type:'snils',snils:'123-456-789 01',birth_date:'1990-01-01'});
  expect(f.createClient).toHaveBeenCalledWith('https://synthetic.supabase.invalid','synthetic-anon',{global:{headers:{Authorization:'Bearer original-actor'}}});
  expect(f.userRpc).toHaveBeenCalledWith('get_postpaid_access_profile',{p_organization_id:ids.org});
  expect(f.userRpc).toHaveBeenCalledWith('uc_document_has_action',{p_org:ids.org,p_action:'write'});
  expect(f.userRpc).toHaveBeenCalledWith('can_access_organization',{_organization_id:ids.org,_permission:'students.write'});
  expect(f.userRpc).toHaveBeenCalledWith('uc_document_student_scope_allowed',{p_org:ids.org,p_user:ids.student});
  expect(f.adminRpc).not.toHaveBeenCalled();expect(f.download).toHaveBeenCalledExactlyOnceWith(filePath);expect(f.callAI).toHaveBeenCalledTimes(1);
  const grantAt=f.events.indexOf('grant'),downloadAt=f.events.indexOf('private.download'),aiAt=f.events.indexOf('ai');
  expect(f.events.indexOf('source')).toBeLessThan(grantAt);expect(grantAt).toBeLessThan(downloadAt);
  expect(downloadAt).toBeLessThan(f.events.indexOf('private.bytes'));expect(f.events.indexOf('private.bytes')).toBeLessThan(aiAt);
  expect(f.events.slice(downloadAt+1,aiAt)).toContain('source');expect(f.events.slice(aiAt+1)).toContain('source');
 });
 it.each(['professional','maximum'])('preserves the existing %s plan path with source checks and private download',async plan=>{
  const f=fixture({plan,grant:null});expect((await actualHandler(f)(request())).status).toBe(200);
  expect(f.userRpc.mock.calls.some(([name])=>name==='get_postpaid_access_profile')).toBe(false);
  expect(f.download).toHaveBeenCalledExactlyOnceWith(filePath);expect(f.callAI).toHaveBeenCalledTimes(1);expect(f.adminRpc).not.toHaveBeenCalled();
 });
 it.each([
  {name:'missing',grant:null},{name:'false feature',grant:{...confirmedGrant(),entitlements:{all_platform_features:false}}},
  {name:'inactive',grant:{...confirmedGrant(),active:false}},{name:'foreign organization',grant:{...confirmedGrant(),organization_id:ids.otherOrg}},
  {name:'missing feature',grant:{...confirmedGrant(),entitlements:{}}},{name:'string instead of true',grant:{...confirmedGrant(),entitlements:{all_platform_features:'true'}}},
 ])('denies $name grant before private download or AI',async({grant})=>{
  const f=fixture({grant});const response=await actualHandler(f)(request());expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({code:'plan_required'});noPrivateOrAI(f);
 });
 it('fails closed on grant lookup error even with otherwise valid entitlement data',async()=>{
  const f=fixture({grantError:true});expect((await actualHandler(f)(request())).status).toBe(503);noPrivateOrAI(f);
 });
 it.each(['uc_document_has_action','can_access_organization','uc_document_student_scope_allowed'])('grant never bypasses source/action permission %s',async deniedPermission=>{
  const f=fixture({deniedPermission});expect((await actualHandler(f)(request())).status).toBe(403);
  expect(f.userRpc.mock.calls.some(([name])=>name==='get_postpaid_access_profile')).toBe(false);noPrivateOrAI(f);
 });
 it.each([{organizationId:ids.otherOrg},{studentUserId:ids.otherStudent},{doc_type:'passport'}])('denies a mismatched requested source %j before grant or AI',async override=>{
  const f=fixture();expect((await actualHandler(f)(request(override))).status).toBe(409);noPrivateOrAI(f);
  expect(f.userRpc).not.toHaveBeenCalled();
 });
 it('does not accept a caller-supplied feature grant in the request',async()=>{
  const f=fixture({grant:null});expect((await actualHandler(f)(request({all_platform_features:true}))).status).toBe(400);noPrivateOrAI(f);expect(f.userRpc).not.toHaveBeenCalled();
 });
 it('keeps a document hidden by original-caller RLS unavailable',async()=>{
  const f=fixture({missingDocument:true});expect((await actualHandler(f)(request())).status).toBe(404);noPrivateOrAI(f);
 });
 it('never falls back to service storage or AI when private-file download is denied',async()=>{
  const f=fixture({downloadError:true});expect((await actualHandler(f)(request())).status).toBe(422);
  expect(f.download).toHaveBeenCalledExactlyOnceWith(filePath);expect(f.callAI).not.toHaveBeenCalled();expect(f.adminStorage).not.toHaveBeenCalled();
 });
 it.each([{bytes:new TextEncoder().encode('<html>not a document</html>')},{announcedSize:ocr.MAX_OCR_BYTES+1}])('validates private document bytes and size before AI: %j',async options=>{
  const f=fixture(options);expect((await actualHandler(f)(request())).status).toBe(422);expect(f.callAI).not.toHaveBeenCalled();
 });
 it('rejects source replacement detected after private download before transmitting to AI',async()=>{
  const f=fixture({sourceChangesAfterDownload:true});expect((await actualHandler(f)(request())).status).toBe(409);
  expect(f.download).toHaveBeenCalledTimes(1);expect(f.callAI).not.toHaveBeenCalled();
 });
 it('rejects actor revocation detected after private download before transmitting to AI',async()=>{
  const f=fixture({revokedAtCheck:2});expect((await actualHandler(f)(request())).status).toBe(403);
  expect(f.download).toHaveBeenCalledTimes(1);expect(f.callAI).not.toHaveBeenCalled();
 });
});
