import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

export const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
export const read=(file:string)=>readFile(new URL(`../../../../${file}`,import.meta.url),'utf8');
export const migrationPath='supabase/migrations/20261020150000_uc_server_custom_journals.sql';
export const releasePath='docs/releases/sintagma-production/uc-server-custom-journals-20261020/';
type SourceFunction={signature:string;definition:string;source_md5:string};
export type Fixture={authority:SourceFunction[];urgent_rpc:{definition:string;expected_definition_md5:string};urgent_migration:string;uc014_migration:string;erasure:Array<{signature:string;definition:string;definition_md5:string}>;platform_action:string;program_hash:string;uc014_table_ddl:string[];uc014_private_functions:string[]};
export async function createCustomJournalLab(install=true):Promise<PGlite>{
 const db=new PGlite();
 try{
  await db.exec(await read('supabase/tests/fixtures/uc-custom-journals.synthetic.sql'));
  const f:Fixture=JSON.parse(await read('supabase/tests/fixtures/uc-custom-journals-source-baseline.json'));
  const order=['has_role(uuid,app_role)','has_role(app_role,uuid)','org_role_default_permissions(text)','normalize_org_staff_permission(text)','get_org_staff_permissions(uuid,uuid)','has_org_staff_permission(uuid,uuid,text)','is_org_owner(uuid,uuid)','can_access_organization(uuid,text)','account_deletion_access_allowed()','uc_document_teacher_limited(uuid)','uc_document_scope_allowed(uuid,uuid,uuid)','uc_document_student_scope_allowed(uuid,uuid)'];
  for(const signature of order){
   const fn=f.authority.find(x=>x.signature===signature);if(!fn)throw Error('Missing actual dependency '+signature);
   if(createHash('md5').update(fn.definition).digest('hex')!==fn.source_md5)throw Error('Captured source drift');
   await db.exec(fn.definition);
  }
  await db.exec(f.platform_action);await db.exec(f.program_hash);
  for(const ddl of f.uc014_table_ddl)await db.exec(ddl);
  for(const fn of f.uc014_private_functions)await db.exec(fn);
  await db.exec('REVOKE ALL ON FUNCTION public.uc_learning_error(text),public.uc_learning_personal_counts(uuid),public.uc_learning_erase_user(uuid)FROM PUBLIC,anon,authenticated,service_role,uc015_default_bystander');
  // Exact old definitions; unrelated old job/snapshot execution is NOT modeled.
  for(const fn of f.erasure)await db.exec(fn.definition);
  await db.exec(f.urgent_rpc.definition);
  const urgent=(await db.query<{md5:string}>("SELECT md5(pg_get_functiondef('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure))")).rows[0].md5;
  if(urgent!==f.urgent_rpc.expected_definition_md5)throw Error('Actual urgent RPC source did not reproduce');
  await db.query("INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback)VALUES('20261019120000','synthetic_prior_uc013_ledger',ARRAY['Native UC013 acceptance is deliberately outside this reduced fixture'],'synthetic-owner','synthetic-key','synthetic-rollback'),('20261020140000','uc_learning_outcome_foundation',ARRAY[$1],NULL,NULL,NULL),('20261020050000','students_page_scope_evaluation',ARRAY[$2],'synthetic-author','urgent-key','urgent-rollback')",[f.uc014_migration,f.urgent_migration]);
  await db.exec("CREATE TEMP TABLE uc015_fixture_oldmeta AS SELECT p.oid,p.oid::regprocedure::text signature,to_jsonb(p)-ARRAY['prosrc','probin'] metadata,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'");
  if(install)await db.exec(await read(migrationPath));
  return db;
 }catch(e){await db.close();throw e;}
}
export async function actor(db:PGlite,n:number|null,role='authenticated'){
 await db.exec('RESET ROLE');
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[n===null?'':id(n),role]);
 await db.exec(`SET ROLE ${n===null?'anon':role}`);
}
export async function result(db:PGlite,sql:string,args:unknown[]=[]):Promise<any>{return(await db.query<{result:any}>(sql,args)).rows[0].result;}
export const apply=(db:PGlite,action:unknown,revision=0,request=900,org=100)=>result(db,'SELECT public.apply_custom_journal_action($1,$2,$3,$4::jsonb)AS result',[id(org),revision,id(request),JSON.stringify(action)]);
export const query=(db:PGlite,value:unknown,org=100)=>result(db,'SELECT public.read_custom_journals($1,$2::jsonb)AS result',[id(org),JSON.stringify(value)]);
export const fields=[{id:'full_name',label:'ФИО',type:'text',semantic:'full_name'},{id:'grade',label:'Оценка',type:'decimal',semantic:'grade'},{id:'doc_date',label:'Дата',type:'date',semantic:'doc_date'}];
export const create=(db:PGlite,request=900)=>apply(db,{action:'create',title:'Synthetic typed journal',description:'Synthetic structure',fields},0,request);
export const save=(db:PGlite,journal:any,values:Record<string,unknown>={full_name:'Synthetic subject',grade:'4'},options:{recordId?:string;revision?:number;request?:number;subject?:number;reason?:string;schemaId?:string}={})=>apply(db,{action:'save_record',journal_id:journal.id,record_id:options.recordId??null,schema_version_id:options.schemaId??journal.current_schema_id,subject_user_id:id(options.subject??8),values,reason:options.reason??''},options.revision??0,options.request??901);
