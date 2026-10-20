import {readFile}from'node:fs/promises';
import {createHash}from'node:crypto';
import {PGlite}from'@electric-sql/pglite';
export const id=(n:number)=>`c0610000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const read=(p:string)=>readFile(new URL(`../../../../${p}`,import.meta.url),'utf8');
type Col={name:string;type:string;not_null:boolean;default:string|null};
type Policy={name:string;command:string;permissive:boolean;roles:string[];using:string|null;with_check:string|null};
type Relation={nspname:string;relname:string;columns:Col[];policies:Policy[];triggers:Array<{definition:string}>;constraints:Array<{name:string;type:string;definition:string}>};
type Fn={signature:string;definition:string;definition_md5:string};
export type Capture={functions:Fn[];relations:Relation[];additional_closure:{functions:Fn[];roles:Array<{oid:string;name:string}>;enums:Array<{type:string;labels:string[]}>;extra_columns:Array<Col&{table:string}>}};
export const capturePath='supabase/tests/fixtures/lesson-write-guard-live-metadata.json';
export const migrationPath='supabase/migrations/20261020090000_lesson_write_permission_guard.sql';
const quote=(s:string)=>'"'+s.replace(/"/g,'""')+'"';
const literal=(s:string)=>"'"+s.split("'").join("''")+"'";
export async function createLessonWriteLab():Promise<{db:PGlite;capture:Capture;paidAnchor:string}>{
 const db=new PGlite();
 try{
  const capture:Capture=JSON.parse(await read(capturePath));
  await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role BYPASSRLS;CREATE ROLE sandbox_exec_atxwvjxbqjgkbjlhsdch;CREATE ROLE sandbox_exec;CREATE ROLE lesson_fixture_default_grantee;CREATE SCHEMA auth;`);
  for(const e of capture.additional_closure.enums)await db.exec(`CREATE TYPE public.${quote(e.type)}AS ENUM(${e.labels.map(literal).join(',')})`);
  const reduced:Record<string,string[]>={users:['id','deleted_at','banned_until'],profiles:['id','user_id','organization_id','full_name','blocked_at'],user_roles:['id','user_id','role'],org_staff:['id','organization_id','user_id','role','sections_access','expires_at','created_at'],admin_staff:['id','user_id','role','full_name','expires_at'],account_deletion_revocations:['user_id'],enrollments:['id','user_id','course_id','status','expires_at'],marketplace_orders:['id','marketplace_course_id','buyer_type','status','paid_at','buyer_organization_id','price'],marketplace_courses:['id','course_id','organization_id','is_validated']};
  await db.exec('CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text);CREATE TABLE public.course_categories(id uuid PRIMARY KEY);');
  const tableOrder=['users','profiles','user_roles','org_staff','admin_staff','account_deletion_revocations','marketplace_orders','marketplace_courses','courses','enrollments','lessons'];
  for(const name of tableOrder){
   const table=capture.relations.find(r=>r.relname===name);if(!table)throw Error('Missing captured relation '+name);
   const cols=reduced[name]?table.columns.filter(c=>reduced[name].includes(c.name)):table.columns;
   if(reduced[name]&&cols.length!==reduced[name].length)throw Error('Incomplete actual helper table closure '+name);
   const declarations=cols.map(c=>`${quote(c.name)} ${c.type}${c.default===null?'':' DEFAULT '+c.default}${c.not_null?' NOT NULL':''}`);
   const pk=cols.some(c=>c.name==='id')?'id':name==='account_deletion_revocations'?'user_id':null;
   if(pk)declarations.push(`PRIMARY KEY(${quote(pk)})`);
   if(name==='courses'||name==='lessons')for(const c of table.constraints.filter(c=>c.type==='c'||c.type==='u'))declarations.push(`CONSTRAINT ${quote(c.name)} ${c.definition}`);
   await db.exec(`CREATE TABLE ${quote(table.nspname)}.${quote(name)}(${declarations.join(',')})`);
  }
  for(const name of ['companies','course_modules']){
   const cols=capture.additional_closure.extra_columns.filter(c=>c.table===name&&['id','user_id','organization_id','course_id'].includes(c.name));
   await db.exec(`CREATE TABLE public.${quote(name)}(${cols.map(c=>quote(c.name)+' '+c.type).join(',')},PRIMARY KEY(id))`);
  }
  // Preserve lesson FKs used by the tested mutations, not unrelated organization
  // provisioning triggers/ancillary FK graphs. All course/lesson columns and
  // CHECK/UNIQUE constraints above are captured, not invented.
  const lessons=capture.relations.find(r=>r.relname==='lessons')!;
  for(const c of lessons.constraints.filter(c=>c.type==='f'))await db.exec(`ALTER TABLE public.lessons ADD CONSTRAINT ${quote(c.name)} ${c.definition}`);
  const functions=[...capture.functions,...capture.additional_closure.functions];
  const order=['auth.uid()','auth.role()','auth.jwt()','has_role(uuid,app_role)','has_role(app_role,uuid)','org_role_default_permissions(text)','normalize_org_staff_permission(text)','get_org_staff_permissions(uuid,uuid)','has_org_staff_permission(uuid,uuid,text)','is_org_owner(uuid,uuid)','account_deletion_access_allowed()','can_access_organization(uuid,text)','can_access_course(uuid,text)','current_organization_id()','current_company_id()','can_access_course_as_learner(uuid)','_paid_20260922_original_ids()','_paid_20260922_course_scope(uuid)','_paid_20260922_course_read(uuid,boolean)','uc_platform_document_action_allowed(uuid,text)','update_updated_at_column()','invalidate_marketplace_course_validation()','csz_guard_lesson_metadata()','csz_guard_protected_truncate()'];
  for(const signature of order){const f=functions.find(f=>f.signature===signature);if(!f)throw Error('Missing actual helper '+signature);if(createHash('md5').update(f.definition).digest('hex')!==f.definition_md5)throw Error('Captured body hash drift');await db.exec(f.definition);}
  const paidDefinition=functions.find(f=>f.signature==='_paid_20260922_original_ids()')!.definition;
  const paidAnchor=paidDefinition.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/)?.[0];if(!paidAnchor)throw Error('Actual paid anchor source missing');
  await seed(db,paidAnchor);
  for(const table of capture.relations.filter(r=>r.relname==='courses'||r.relname==='lessons')){
   await db.exec(`ALTER TABLE public.${quote(table.relname)} ENABLE ROW LEVEL SECURITY`);
   for(const p of table.policies){const roleNames=p.roles.map(oid=>oid==='0'?'PUBLIC':quote(capture.additional_closure.roles.find(r=>r.oid===oid)!.name));const command:Record<string,string>={'*':'ALL','r':'SELECT','a':'INSERT','w':'UPDATE','d':'DELETE'};
    await db.exec(`CREATE POLICY ${quote(p.name)}ON public.${quote(table.relname)}AS ${p.permissive?'PERMISSIVE':'RESTRICTIVE'} FOR ${command[p.command]} TO ${roleNames.join(',')}${p.using===null?'':' USING('+p.using+')'}${p.with_check===null?'':' WITH CHECK('+p.with_check+')'}`);
   }
   await db.exec(`GRANT ALL ON public.${quote(table.relname)}TO anon,authenticated,service_role;GRANT SELECT,INSERT ON public.${quote(table.relname)}TO sandbox_exec_atxwvjxbqjgkbjlhsdch,sandbox_exec`);
  }
  await db.exec('GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role,lesson_fixture_default_grantee;GRANT SELECT ON profiles,user_roles,org_staff,admin_staff,companies,enrollments TO authenticated,anon');
  for(const t of lessons.triggers)await db.exec(t.definition);
  // Only the NEW predicate sees this intentionally unexpected default grant.
  await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO lesson_fixture_default_grantee');
  return{db,capture,paidAnchor};
 }catch(e){await db.close();throw e;}
}
async function seed(db:PGlite,paidAnchor:string){
 await db.exec(`INSERT INTO public.organizations VALUES('${id(100)}','Synthetic A'),('${id(200)}','Synthetic B'),('4ac2c05a-d8b5-4e72-ba31-f2c743091d95','Synthetic paid anchor owner');`);
 for(let n=1;n<=18;n++){
  await db.query('INSERT INTO auth.users(id)VALUES($1)',[id(n)]);
  await db.query('INSERT INTO public.profiles(user_id,organization_id,full_name)VALUES($1,$2,$3)',[id(n),id([2,3,6,7,10,11,18].includes(n)?200:100),'Synthetic '+n]);
  await db.query('INSERT INTO public.user_roles(user_id,role)VALUES($1,$2)',[id(n),[1,7].includes(n)?'organization':[2,10,11,18].includes(n)?'admin':'student']);
 }
 for(const n of [3,5,8,9,12,13,14,15,16,17])await db.query("INSERT INTO org_staff(user_id,organization_id,role,sections_access,expires_at)VALUES($1,$2,$3,$4::jsonb,$5)",[id(n),id(100),[9].includes(n)?'viewer':[15,17].includes(n)?'teacher':'admin',JSON.stringify(n===15?['courses.read','courses.write']:n===9?['courses.read']:[]),[5,17].includes(n)?'2000-01-01T00:00:00Z':null]);
 for(const n of [2,10,11,18])await db.query('INSERT INTO admin_staff(user_id,role,expires_at)VALUES($1,$2,$3)',[id(n),n===10?'viewer':n===18?'sales_manager':'admin',n===11?'2000-01-01T00:00:00Z':null]);
 await db.query('INSERT INTO account_deletion_revocations(user_id)VALUES($1)',[id(8)]);
 await db.query("UPDATE auth.users SET banned_until='2099-01-01'WHERE id=$1",[id(12)]);await db.query('UPDATE auth.users SET deleted_at=now()WHERE id=$1',[id(13)]);await db.query('UPDATE profiles SET blocked_at=now()WHERE user_id=$1',[id(14)]);
 for(const [n,org,published]of [[301,100,true],[302,100,false],[303,200,true],[304,200,false]]as const)await db.query('INSERT INTO courses(id,organization_id,title,is_published,landing_content)VALUES($1,$2,$3,$4,$5::jsonb)',[id(n),id(org),'Synthetic course '+n,published,'{}']);
 await db.query('INSERT INTO courses(id,organization_id,title,is_published)VALUES($1,$2,$3,true)',[paidAnchor,'4ac2c05a-d8b5-4e72-ba31-f2c743091d95','Synthetic paid anchor']);
 for(const n of [301,302,303,304])await db.query('INSERT INTO lessons(id,course_id,title,content,order_index)VALUES($1,$2,$3,$4,0)',[id(n+400),id(n),'Synthetic lesson '+n,'Original synthetic content']);
 await db.query('INSERT INTO lessons(id,course_id,title,content,order_index)VALUES($1,$2,$3,$4,0)',[id(799),paidAnchor,'Synthetic paid lesson','Private synthetic paid content']);
 await db.query('INSERT INTO marketplace_courses(id,course_id,is_validated)VALUES($1,$2,true)',[id(801),id(301)]);
}
export type LabRole='authenticated'|'anon'|'service_role'|'lesson_fixture_default_grantee';
export async function actor(db:PGlite,n:number|null,databaseRole?:LabRole){const selectedRole=databaseRole??(n===null?'anon':'authenticated');const jwtRole=selectedRole==='anon'?'anon':selectedRole==='service_role'?'service_role':'authenticated';await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.jwt.claims',$3,false)",[n===null?'':id(n),jwtRole,JSON.stringify(n===null?{role:jwtRole}:{sub:id(n),role:jwtRole})]);await db.exec('SET ROLE '+selectedRole);}
export const scalar=async<T>(db:PGlite,sql:string,args:unknown[]=[])=> (await db.query<{value:T}>(sql,args)).rows[0].value;
