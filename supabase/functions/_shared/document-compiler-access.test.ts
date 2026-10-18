// @vitest-environment node
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import {describe,expect,it,vi} from 'vitest';
import * as access from './privileged-access';
import {requireDocumentWrite} from './document-operation-access';
const actor='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002',group='00000000-0000-4000-8000-000000000003',company='00000000-0000-4000-8000-000000000004';
const revision='uc-permissions-20261018-v2',serviceKey='synthetic-private-service-key';
type Options={invalid?:boolean;revoked?:boolean;allowed?:boolean;rpcError?:boolean;serviceEnvMissing?:boolean};
function actualHandler(name:string,options:Options={}){
 const sources:string[]=[];
 const effects={upload:vi.fn(),remove:vi.fn(),insert:vi.fn(),update:vi.fn(),smtp:vi.fn(),zipLoad:vi.fn(),zipConstructor:vi.fn(),roster:vi.fn(async()=>({data:[],error:null}))};
 const rpc=vi.fn(async()=>({data:options.allowed===true,error:options.rpcError?{message:'RPC unavailable'}:null}));
 const from=vi.fn((table:string)=>{
  if(table!=='account_deletion_revocations')sources.push(table);
  const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='account_deletion_revocations'&&options.revoked?{user_id:actor}:null,error:null}),insert:effects.insert,update:effects.update};return q;
 });
 const db={auth:{getUser:vi.fn(async()=>({data:{user:options.invalid?null:{id:actor}},error:null}))},from,rpc,storage:{from:()=>({upload:effects.upload,remove:effects.remove})}};
 const createClient=vi.fn(()=>db);let handler:(req:Request)=>Promise<Response>;const serve=(fn:typeof handler)=>{handler=fn;};
 const source=readFileSync(`supabase/functions/${name}/index.ts`,'utf8');const ast=ts.createSourceFile('handler.ts',source,ts.ScriptTarget.Latest,true);
 const ranges=ast.statements.flatMap(s=>ts.isImportDeclaration(s)?[{start:s.getFullStart(),end:s.end}]:ts.canHaveModifiers(s)?(ts.getModifiers(s)||[]).filter(m=>m.kind===ts.SyntaxKind.ExportKeyword).map(m=>({start:m.getStart(ast),end:m.end})):[]);
 const stripped=ranges.sort((a,b)=>b.start-a.start).reduce((s,r)=>s.slice(0,r.start)+s.slice(r.end),source);
 const executable=ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const deps={...access,requireDocumentWrite,z,createClient,serve,readEffectiveGroupProfiles:effects.roster,JSZip:Object.assign(effects.zipConstructor,{loadAsync:effects.zipLoad}),sendPlatformEmail:effects.smtp,
  corsHeaders:{'Access-Control-Allow-Origin':'*'},console:{log(){},warn(){},error(){}},Deno:{serve,env:{get:(key:string)=>key==='SUPABASE_SERVICE_ROLE_KEY'?(options.serviceEnvMissing?undefined:serviceKey):key==='SUPABASE_ANON_KEY'?'synthetic-public-key':'https://synthetic.invalid'}}};
 if(name==='process-document-expiry-reminders')delete (deps as any).corsHeaders;
 new Function(...Object.keys(deps),executable)(...Object.values(deps));
 return {handler:handler!,db,createClient,effects,sources};
}
function req(name:string,token:string|null='verified-user',method='POST'){
 const body=name==='compile-docx-contract'?{templateKey:'synthetic-template',organizationId:org,groupId:group,companyId:company,studentUserIds:[],contractName:'Synthetic contract',contractNumber:'draft',contractDate:'2026-10-18',totalAmount:10,taxClauseExplicit:true,scalars:{},programs:[{}],students:[{}]}:{organizationId:org,groupId:group,studentUserIds:[]};
 return new Request('https://synthetic.invalid/function',{method,headers:token?{Authorization:`Bearer ${token}`}:{},...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
describe.each(['compile-docx-contract','compile-group-class-journal'])('actual %s caller authorization',name=>{
 it.each([
  {label:'missing authentication',token:null,options:{},status:401},
  {label:'invalid token',token:'invalid-public-key',options:{invalid:true},status:401},
  {label:'revoked account',token:'verified-user',options:{revoked:true},status:403},
  {label:'outside assigned group',token:'verified-user',options:{allowed:false},status:403},
  {label:'read-only platform staff',token:'verified-viewer',options:{allowed:false},status:403},
  {label:'missing authoritative RPC',token:'verified-user',options:{rpcError:true},status:503},
 ])('denies $label before private source reads or compiler effects',async({token,options,status})=>{
  const f=actualHandler(name,options);const res=await f.handler(req(name,token));expect(res.status).toBe(status);expect(res.headers.get('X-Sintagma-Function-Revision')).toBe(revision);
  expect(f.sources).toEqual([]);for(const effect of Object.values(f.effects))expect(effect).not.toHaveBeenCalled();
 });
 it('binds the verified writer to exact org/group before it reaches source lookup',async()=>{
  const f=actualHandler(name,{allowed:true});const res=await f.handler(req(name));expect(res.status).toBe(name==='compile-docx-contract'?404:409);
  expect(f.db.rpc).toHaveBeenCalledOnce();expect(f.db.rpc).toHaveBeenCalledWith('uc_document_action_allowed',{p_org:org,p_action:'write',p_group:group,p_enrollment:null});
  const sourceCall=f.db.from.mock.calls.findIndex(([table])=>table!=='account_deletion_revocations');expect(sourceCall).toBeGreaterThanOrEqual(0);
  expect(f.db.rpc.mock.invocationCallOrder[0]).toBeLessThan(f.db.from.mock.invocationCallOrder[sourceCall]);
  expect(f.sources).toEqual(name==='compile-docx-contract'?['organizations']:['student_groups','organizations']);
  if(name==='compile-group-class-journal')expect(f.effects.roster).toHaveBeenCalledWith(expect.anything(),org,group,expect.any(String));
  for(const [key,effect]of Object.entries(f.effects))if(key!=='roster')expect(effect).not.toHaveBeenCalled();
 });
 it.each([['OPTIONS',200],['GET',405]] as const)('answers %s before client creation',async(method,status)=>{
  const f=actualHandler(name);const res=await f.handler(req(name,null,method));expect(res.status).toBe(status);expect(res.headers.get('X-Sintagma-Function-Revision')).toBe(revision);expect(f.createClient).not.toHaveBeenCalled();for(const effect of Object.values(f.effects))expect(effect).not.toHaveBeenCalled();
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
