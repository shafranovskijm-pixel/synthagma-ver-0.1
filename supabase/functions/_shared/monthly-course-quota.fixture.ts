import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const quotaMigration = new URL('../../migrations/20261021120000_monthly_course_assignment_quota.sql',import.meta.url);
const local = (name:string)=>new URL('./__tests__/fixtures/'+name,import.meta.url);
export const quotaId=(n:number)=>'c0710000-0000-4000-8000-'+String(n).padStart(12,'0');
const q=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const literal=(s:string)=>"'"+s.replaceAll("'","''")+"'";
export type QuotaConnection={exec:(sql:string)=>Promise<unknown>;query:<T=any>(sql:string,args?:any[])=>Promise<{rows:T[]}>};
export type QuotaDb=QuotaConnection&{close:()=>Promise<unknown>;native?:{connect:(label:string)=>QuotaConnection;record:unknown}};
export const asQuotaActor=async(db:QuotaConnection,user:string|null,role='authenticated')=>{
 await db.exec('RESET ROLE');
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[user??'',role]);
 await db.exec('SET ROLE '+q(role));
};
export const quotaRow=async<T=any>(db:QuotaConnection,sql:string,args:any[]=[]) => (await db.query<T>(sql,args)).rows[0];
export async function quotaMigrationBody(){
 const raw=await readFile(quotaMigration,'utf8');
 if(createHash('sha256').update(raw).digest('hex')!=='79dab4f4c684a69e76ba09da386a77fbf15000bb8a587d216a7c568c2348269e')throw Error('Reviewed quota migration raw bytes changed');
 if((raw.match(/^BEGIN;$/gm)??[]).length!==1||!raw.endsWith('\nCOMMIT;\n'))throw Error('Quota transaction framing changed');
 const body=raw.replace(/^BEGIN;\n/m,'').replace(/\nCOMMIT;\n$/,'\n');
 if(createHash('sha256').update(body).digest('hex')!=='3f3b2de4613c072888c6ff64b6fd5129bbd23aaeb3e2f31bdbaa5dd8909b87ee')throw Error('Reviewed quota migration body bytes changed');
 return body;
}
export async function installQuotaMigration(db:QuotaConnection){
 const body=await quotaMigrationBody();await db.exec('BEGIN');
 try{await db.exec(body);await db.exec('COMMIT');}catch(error){await db.exec('ROLLBACK');throw error;}
}
export async function createMonthlyQuotaFixture(install=true):Promise<QuotaDb>{
 // The reviewed native profile replaces ONLY this constructor seam. It does
 // not edit SQL, role switches, guards, dates or assertions.
 const factory=(globalThis as any).__lessonCreateNativeFixture;
 const db:QuotaDb=factory?factory():new PGlite() as unknown as QuotaDb;
 try{
  const metadata=JSON.parse(await readFile(local('monthly-course-quota-live-metadata.json'),'utf8'));
  const captured=JSON.parse(await readFile(local('monthly-course-quota-live-functions.json'),'utf8'));
  const fences=JSON.parse(await readFile(local('monthly-course-quota-live-fences.json'),'utf8'));
  captured.push(...fences.functions);
  const lesson=JSON.parse(await readFile(new URL('../../tests/fixtures/lesson-write-guard-live-metadata.json',import.meta.url),'utf8'));
  await db.exec('CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role BYPASSRLS;CREATE ROLE sandbox_exec_atxwvjxbqjgkbjlhsdch;CREATE ROLE sandbox_exec;CREATE ROLE lesson_fixture_default_grantee;CREATE SCHEMA auth;CREATE SCHEMA storage');
  for(const e of metadata.enums.filter((e:any)=>['app_role','company_staff_role'].includes(e.name)))await db.exec('CREATE TYPE public.'+q(e.name)+' AS ENUM('+e.labels.map(literal).join(',')+')');
  const relations=[...metadata.relations,{...lesson.relations.find((r:any)=>r.relname==='courses'),name:'courses'},{...lesson.relations.find((r:any)=>r.relname==='account_deletion_revocations'),name:'account_deletion_revocations'}];
  for(const r of relations){
   const auth=r.name==='users';
   // Auth is only the real referenced id/status closure; generated Auth-only
   // columns and external Auth service behavior are outside these DB checks.
   const columns=auth?r.columns.filter((c:any)=>['id','deleted_at','banned_until'].includes(c.name)):r.columns;
   const defs=columns.map((c:any)=>q(c.name)+' '+c.type+(c.default===null?'':' DEFAULT '+c.default)+(c.not_null?' NOT NULL':''));
   for(const c of (r.constraints??[]).filter((c:any)=>c.type!=='f'&&(!auth||c.type==='p')))defs.push('CONSTRAINT '+q(c.name)+' '+c.definition);
   await db.exec('CREATE TABLE '+(auth?'auth':'public')+'.'+q(r.name)+'('+defs.join(',')+')');
  }
  // These actual registration composite unique indexes back the captured FKs.
  await db.exec('CREATE UNIQUE INDEX ON public.courses(id,organization_id);CREATE UNIQUE INDEX ON public.student_groups(id,organization_id)');
  const names=new Set(relations.map((r:any)=>r.name));
  for(const r of relations)for(const c of (r.constraints??[]).filter((c:any)=>c.type==='f')){
   const target=/REFERENCES (?:auth[.])?([a-z_]+)/.exec(c.definition)?.[1];
   if(target&&names.has(target))await db.exec('ALTER TABLE '+(r.name==='users'?'auth':'public')+'.'+q(r.name)+' ADD CONSTRAINT '+q(c.name)+' '+c.definition);
  }
  for(const f of [...lesson.functions,...lesson.additional_closure.functions].filter((f:any)=>['auth.uid()','auth.role()','auth.jwt()'].includes(f.signature))){
   if(createHash('md5').update(f.definition).digest('hex')!==f.definition_md5)throw Error('Auth capture hash drift');await db.exec(f.definition);
  }
  for(const name of ['has_role(uuid,app_role)','has_role(app_role,uuid)','org_role_default_permissions(text)','normalize_org_staff_permission(text)','get_org_staff_permissions(uuid,uuid)','has_org_staff_permission(uuid,uuid,text)','has_company_access(uuid,uuid,company_staff_role)']){
   const f=metadata.functions.find((f:any)=>f.signature===name);if(!f||createHash('md5').update(f.definition).digest('hex')!==f.definition_md5)throw Error('Actual permission helper drift '+name);await db.exec(f.definition);
  }
  for(const name of ['account_deletion_access_allowed()','can_access_organization(uuid,text)']){
   const f=[...lesson.functions,...lesson.additional_closure.functions].find((f:any)=>f.signature===name);
   if(!f||createHash('md5').update(f.definition).digest('hex')!==f.definition_md5)throw Error('Actual tenant helper drift '+name);await db.exec(f.definition);
  }
  for(const f of captured){
   await db.exec(f.definition);
   const row=await quotaRow(db,'SELECT md5(prosrc) AS hash FROM pg_proc WHERE oid=to_regprocedure($1)',['public.'+f.signature]);
   if(row.hash!==f.source_md5)throw Error('Actual function source pin drift '+f.signature);
  }
  // Preserve the exact public-RPC ACLs, including the auxiliary tool role. The
  // new private objects are deliberately created with a broad default ACL to
  // prove the migration removes it instead of relying on project defaults.
  for(const f of captured.filter((f:any)=>f.proacl)){
   await db.exec('REVOKE ALL ON FUNCTION public.'+f.signature+' FROM PUBLIC,anon,authenticated,service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch');
   for(const role of ['anon','authenticated','service_role','sandbox_exec_atxwvjxbqjgkbjlhsdch'])if(f.proacl.includes(role+'=X/'))await db.exec('GRANT EXECUTE ON FUNCTION public.'+f.signature+' TO '+q(role));
   if(f.proacl.includes('=X/')&&f.proacl.startsWith('{=X/'))await db.exec('GRANT EXECUTE ON FUNCTION public.'+f.signature+' TO PUBLIC');
  }
  await db.exec(    "GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch;"+
    "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;"+
    "ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO authenticated,service_role,lesson_fixture_default_grantee;"+
    "ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO authenticated,service_role,lesson_fixture_default_grantee;");
  for(const t of fences.triggers)await db.exec(t.definition);
  if(install)await installQuotaMigration(db);
  return db;
 }catch(error){await db.close();throw error;}
}
export async function seedQuotaOrganization(db:QuotaConnection,org=quotaId(1),studentLimit:number|null=2,trainingLimit:number|null=2){
 await db.exec('RESET ROLE');
 await db.query("INSERT INTO organizations(id,name,email,subscription_plan,custom_max_students,custom_max_trained_per_month)VALUES($1,'Synthetic quota organization','synthetic@example.invalid','start',$2,$3)",[org,studentLimit,trainingLimit]);
 for(const n of [10,11,12,13,14,15,16,17,18,19]){
  await db.query('INSERT INTO auth.users(id)VALUES($1)',[quotaId(n)]);
  await db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic learner')",[quotaId(n),org]);
  await db.query("INSERT INTO user_roles(user_id,role)VALUES($1,'student')",[quotaId(n)]);
 }
 await db.query("INSERT INTO auth.users(id)VALUES($1),($2),($3)",[quotaId(20),quotaId(21),quotaId(22)]);
 await db.query("INSERT INTO profiles(user_id,organization_id,full_name)VALUES($1,$2,'Synthetic owner')",[quotaId(20),org]);
 await db.query("INSERT INTO user_roles(user_id,role)VALUES($1,'organization')",[quotaId(20)]);
 for(const n of [30,31,32])await db.query("INSERT INTO courses(id,organization_id,title)VALUES($1,$2,'Synthetic quota course')",[quotaId(n),org]);
 await asQuotaActor(db,quotaId(20),'authenticated');
}
