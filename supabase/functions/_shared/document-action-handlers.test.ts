// @vitest-environment node
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it,vi,describe} from 'vitest';
import * as access from './privileged-access';
import {signatureSha256} from './signature-finalizer';
const actor='00000000-0000-4000-8000-000000000001',org='00000000-0000-4000-8000-000000000002',sig='00000000-0000-4000-8000-000000000003',rev='00000000-0000-4000-8000-000000000004';
const serviceKey='synthetic-private-service-key',revision='uc-permissions-20261018-v2';
function fixture({allow=false,missing=false,revoked=false,invalid=false}={}){
 const effects={smtp:vi.fn(async()=>({ok:true})),download:vi.fn(async()=>({data:'Existing original artifact',error:null})),upload:vi.fn(),createUser:vi.fn(),upsert:vi.fn()};
 const business: string[]=[];
 const db={auth:{getUser:vi.fn(async()=>({data:{user:invalid?null:{id:actor}},error:null})),admin:{createUser:effects.createUser,deleteUser:vi.fn()}},
  rpc:vi.fn(async(name:string)=>({data:name==='get_decrypted_org_smtp'?[{host:'synthetic.invalid',port:465,username:'synthetic',password:'synthetic',from_email:'synthetic@example.invalid'}]:name==='claim_org_email_quota'?{allowed:true}:allow,error:missing&&['uc_document_commercial_creation_allowed','uc_signature_actor_allowed','validate_org_staff_document_assignment'].includes(name)?{message:'RPC absent'}:null})),
  from:vi.fn((table:string)=>{
   if(table!=='account_deletion_revocations')business.push(table);
   let write=false;
   const data=()=> table==='account_deletion_revocations'?(revoked?{user_id:actor}:null):table==='profiles'?{user_id:actor,organization_id:org,full_name:'Synthetic Sender'}:table==='organizations'?{name:'Synthetic organization'}:table==='signature_revisions'?{id:rev}:{id:sig,organization_id:org,recipient_user_id:actor,deleted_at:null,document_title:'Synthetic',recipient_email:'synthetic@example.invalid',recipient_name:'Recipient',signature_token:'synthetic-token',email_open_token:'synthetic-open',expires_at:'2099-01-01',status:'signed',signed_document_path:`${org}/certificates/${sig}.html`};
   const result=()=>({data:data(),error:null});
   const q:any={select:()=>q,eq:()=>q,in:()=>q,is:()=>q,insert:()=>{write=true;return q;},update:()=>{write=true;return q;},upsert:(...args:any[])=>{effects.upsert(...args);return q;},single:async()=>result(),maybeSingle:async()=>result(),then:(yes:any,no:any)=>Promise.resolve(result()).then(yes,no)};
   return q;
  }),storage:{from:vi.fn(()=>({download:effects.download,upload:effects.upload}))}};
 return{db,effects,business};
}
function handler(name:string,f:ReturnType<typeof fixture>){
 const source=readFileSync(`supabase/functions/${name}/index.ts`,'utf8');
 const ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
 const stripped=ast.statements.filter(ts.isImportDeclaration).reverse().reduce((s,n)=>s.slice(0,n.getFullStart())+s.slice(n.end),source);
 const executable=ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 let fn:(r:Request)=>Promise<Response>;const serve=(h:typeof fn)=>{fn=h;};
 const deps={...access,signatureSha256,createClient:()=>f.db,sendSmtpEmail:f.effects.smtp,sendPlatformEmail:f.effects.smtp,serve,console:{log(){},error(){}},Deno:{env:{get:(key:string)=>key==='SUPABASE_SERVICE_ROLE_KEY'?serviceKey:'https://synthetic.invalid'}}};
 new Function(...Object.keys(deps),executable)(...Object.values(deps));return fn!;
}
const names=['org-create-contract-signature','generate-signature-certificate','send-signing-email','create-org-staff'];
function request(name:string,token:string|null='verified-user-token',method='POST'){
 const body=name==='org-create-contract-signature'?{organization_id:org,document_title:'Synthetic',document_html:'HTML',recipient_email:'synthetic@example.invalid',recipient_name:'Synthetic'}:name==='create-org-staff'?{email:'synthetic@example.invalid',password:'synthetic-test-password',organizationId:org,role:'admin'}:{signatureId:sig};
 return new Request('https://synthetic.invalid/function',{method,headers:token?{Authorization:`Bearer ${token}`}: {},...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
describe.each(names)('actual %s document action boundary',name=>{
 it.each([{options:{allow:false},status:403},{options:{allow:true,missing:true},status:503},{options:{allow:true,revoked:true},status:403},{options:{allow:true,invalid:true},status:401}])('denies before private reads or writes: $options',async({options,status})=>{
  const f=fixture(options);const res=await handler(name,f)(request(name));expect(res.status).toBe(status);expect(res.headers.get('X-Sintagma-Function-Revision')).toBe(revision);
  expect(f.business).toEqual([]);for(const e of Object.values(f.effects))expect(e).not.toHaveBeenCalled();
 });
 it('rejects no auth and answers preflight without private reads',async()=>{
  const f=fixture();for(const [method,status]of[['POST',401],['OPTIONS',200]]as const){const res=await handler(name,f)(request(name,null,method));expect(res.status).toBe(status);expect(res.headers.get('X-Sintagma-Function-Revision')).toBe(revision);}expect(f.business).toEqual([]);
 });
});
it('authorized commercial contract passes canonical action gate before insert, revision linking and SMTP',async()=>{
 const f=fixture({allow:true});const res=await handler(names[0],f)(request(names[0]));expect(res.status).toBe(200);expect((await res.json()).signature_id).toBe(sig);expect(f.effects.smtp).toHaveBeenCalledOnce();
 expect(f.db.rpc).toHaveBeenCalledWith('uc_document_commercial_creation_allowed',{p_org:org});
 expect(f.db.rpc.mock.invocationCallOrder[1]).toBeLessThan(f.db.from.mock.invocationCallOrder[1]);
});
it('authorized personal recipient/read-only actor downloads the original artifact unchanged',async()=>{
 const f=fixture({allow:true});const res=await handler(names[1],f)(request(names[1]));expect(res.status).toBe(200);expect(await res.text()).toBe('Existing original artifact');
 expect(f.db.rpc).toHaveBeenCalledWith('uc_signature_actor_allowed',{p_signature_id:sig,p_write:false,p_recipient:true});expect(f.effects.upload).not.toHaveBeenCalled();
});
it('authorized sender has write action checked before email and recipient never receives send bypass',async()=>{
 const f=fixture({allow:true}); // Pending state needed for the actual mail sender.
 const original=f.db.from;f.db.from=vi.fn((table:string)=>{const q=original(table);if(table==='document_signatures'){const before=q.maybeSingle;q.maybeSingle=async()=>{const r=await before();r.data.status='sent';return r;};}return q;});
 const res=await handler(names[2],f)(request(names[2]));expect(res.status).toBe(200);expect(f.effects.smtp).toHaveBeenCalledOnce();expect(f.db.rpc).toHaveBeenCalledWith('uc_signature_actor_allowed',{p_signature_id:sig,p_write:true,p_recipient:false});
});
it('authorized staff creator checks requested effective role and commits as original caller without credential changes',async()=>{
 const f=fixture({allow:true});const res=await handler(names[3],f)(request(names[3]));expect(res.status).toBe(200);expect(f.effects.upsert).not.toHaveBeenCalled();expect(f.effects.createUser).not.toHaveBeenCalled();expect(f.db.rpc).toHaveBeenCalledWith('validate_org_staff_document_assignment',{p_org:org,p_role:'admin',p_sections_access:[]});
 expect(f.db.rpc).toHaveBeenCalledWith('commit_org_staff_document_assignment',{p_org:org,p_user:actor,p_role:'admin',p_display_name:'synthetic@example.invalid',p_visibility:'all',p_can_receive_crm_tasks:false});
});
it('a denied staff commit never deletes or changes credentials of the existing account',async()=>{
 const f=fixture({allow:true});const original=f.db.rpc;f.db.rpc=vi.fn(async(name:string)=>name==='commit_org_staff_document_assignment'?{data:false,error:null}:original(name));
 const res=await handler(names[3],f)(request(names[3]));expect(res.status).toBe(400);expect(f.effects.createUser).not.toHaveBeenCalled();expect(f.effects.upsert).not.toHaveBeenCalled();expect(f.db.auth.admin.deleteUser).not.toHaveBeenCalled();
 expect(f.business).toEqual(['profiles']);
});
