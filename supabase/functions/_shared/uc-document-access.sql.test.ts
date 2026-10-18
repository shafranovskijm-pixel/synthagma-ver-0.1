// @vitest-environment node
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const repo=process.cwd();
const baseline=JSON.parse(readFileSync(path.join(repo,'supabase/tests/fixtures/uc-document-access-baseline.json'),'utf8'));
const billing=JSON.parse(readFileSync(path.join(repo,'supabase/tests/fixtures/uc-billing-storage-baseline.json'),'utf8'));
const migration=readFileSync(path.join(repo,'supabase/migrations/20261018100000_uc_document_access_boundaries.sql'),'utf8');
const uid=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const org=uid(100),otherOrg=uid(200),owner=uid(1),admin=uid(2),writer=uid(3),reader=uid(4),expired=uid(5),learner=uid(8),revoked=uid(9),otherLearner=uid(12),companyUser=uid(7),orphan=uid(13);
const company=uid(301),otherCompany=uid(302),course=uid(401),otherCourse=uid(402),enrollment=uid(501),otherEnrollment=uid(502),group=uid(601),doc=uid(701);
let db:PGlite;
const q=(s:string)=>`"${s.replaceAll('"','""')}"`;
const policy=(p:any)=>`CREATE POLICY ${q(p.policyname)} ON ${q(p.schemaname)}.${q(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(q).join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''}`;
const row=async(sql:string,args:any[]=[]) => (await db.query(sql,args)).rows[0] as any;
const as=async(user:string|null,role='authenticated')=>db.exec(`RESET ROLE;SELECT set_config('request.jwt.claim.sub','${user||''}',false);SET ROLE ${role};`);
const runIssue=()=>db.query('SELECT * FROM issue_education_document_batch($1,$2,$3,$4::jsonb)',[org,null,course,JSON.stringify([{user_id:learner,enrollment_id:enrollment,document_type:'certificate',issue_date:'2026-10-18',full_name:'Synthetic learner',specialty_name:'Synthetic course'}])]);
const count=async(table:string)=>(await row(`SELECT count(*)::int AS n FROM ${table}`)).n;

beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;
 CREATE SCHEMA auth;CREATE SCHEMA storage;
 CREATE FUNCTION auth.uid()RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TYPE app_role AS ENUM('admin','organization','student','company','sales_manager');
 CREATE TABLE organizations(id uuid PRIMARY KEY);
 CREATE TABLE profiles(id uuid DEFAULT gen_random_uuid(),user_id uuid PRIMARY KEY,organization_id uuid,full_name text,email text,student_group_id uuid);
 CREATE TABLE user_roles(user_id uuid,role app_role);
 CREATE TABLE org_staff(user_id uuid,organization_id uuid,role text,sections_access jsonb DEFAULT '[]',expires_at timestamptz,created_at timestamptz DEFAULT now());
 CREATE TABLE account_deletion_revocations(user_id uuid PRIMARY KEY);
 CREATE TABLE companies(id uuid PRIMARY KEY,organization_id uuid,user_id uuid,name text);
 CREATE TABLE courses(id uuid PRIMARY KEY,organization_id uuid,title text);
 CREATE TABLE enrollments(id uuid PRIMARY KEY,user_id uuid,course_id uuid,status text);
 CREATE TABLE student_groups(id uuid PRIMARY KEY,organization_id uuid,course_id uuid);
 CREATE TABLE student_group_memberships_effective(organization_id uuid,user_id uuid,group_id uuid);
 CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean);
 INSERT INTO storage.buckets VALUES('student-documents',false),('company-documents',false),('billing-documents',false),('unrelated-public',true);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text,name text,metadata jsonb);
 CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT string_to_array($1,'/')$$;
 CREATE FUNCTION csz_signed_intake_can_insert(text,jsonb)RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION csz_signed_intake_is_admin()RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION can_upload_final_test_photo(text)RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION can_read_final_test_photo(text)RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION can_delete_orphan_library_file_object(text)RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION can_manage_library_file_object(text)RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE FUNCTION can_read_library_file_object(text)RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE TABLE program_categories(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,organization_id uuid,name text);
 CREATE TABLE company_documents(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,company_id uuid,name text,file_url text,file_path text,deleted_at timestamptz);
 GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon,service_role;`);
 const generated=[...baseline.tables.filter((t:string)=>!['company_documents','program_categories'].includes(t)),'document_number_sequences'];
 for(const table of generated){
  const columns=baseline.schema.columns.filter((c:any)=>c.table===table).map((c:any)=>`${q(c.column)} ${c.type}${c.default?` DEFAULT ${c.default}`:''}${c.nullable==='NO'?' NOT NULL':''}`);
  await db.exec(`CREATE TABLE public.${q(table)}(${columns.join(',')})`);
 }
 // Exact education/numbering uniqueness; these are the data invariants used by the actual RPC.
 for(const c of baseline.schema.constraints.filter((c:any)=>['education_document_records','document_number_sequences'].includes(c.table)&&c.type!=='f'))await db.exec(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
 for(const i of baseline.schema.indexes.filter((i:any)=>i.tablename==='education_document_records'&&i.indexname.startsWith('uq_')))await db.exec(i.indexdef);
 for(const name of ['has_role','org_role_default_permissions','get_org_staff_permissions','normalize_org_staff_permission','has_org_staff_permission','can_access_organization','is_org_owner','current_organization_id','current_company_id','storage_try_uuid','account_deletion_access_allowed','get_next_document_number','issue_education_document_batch','create_group_document_batch'])
  for(const f of baseline.functions.filter((f:any)=>f.name===name))await db.exec(f.definition);
 for(const table of baseline.tables)await db.exec(`ALTER TABLE ${q(table)} ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON ${q(table)} TO authenticated,anon;`);
 await db.exec('ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT ALL ON storage.objects TO authenticated,anon;GRANT SELECT ON profiles,companies,enrollments,courses,user_roles TO authenticated,anon;');
 for(const p of [...baseline.policies,...billing.policies])await db.exec(policy(p));
 const before=(await db.query("SELECT schemaname,tablename,policyname,qual,with_check FROM pg_policies WHERE permissive='RESTRICTIVE' ORDER BY 1,2,3")).rows;
 const functionProperties=(await db.query("SELECT proname,proowner,prosecdef,proconfig FROM pg_proc WHERE proname IN('issue_education_document_batch','get_next_document_number','create_group_document_batch') ORDER BY proname")).rows;
 await db.exec(`INSERT INTO organizations VALUES('${org}');
 INSERT INTO org_documents(id,organization_id,name,type,file_url)VALUES('${doc}','${org}','Preserved historical document','license','legacy/path.pdf');
 INSERT INTO document_number_sequences(organization_id,doc_type,year,last_number)VALUES('${org}','contract',2026,73);
 INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('company-documents','unresolved/historical.pdf','{"preserve":true}');`);
 const preserved=async()=>(await db.query(`SELECT jsonb_build_object('documents',(SELECT jsonb_agg(to_jsonb(d)) FROM org_documents d),'sequences',(SELECT jsonb_agg(to_jsonb(s)) FROM document_number_sequences s),'objects',(SELECT jsonb_agg(to_jsonb(o)) FROM storage.objects o)) AS data`)).rows;
 const oldRows=await preserved();
 const catalog=async()=>(await db.query(`SELECT jsonb_build_object(
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p),
  'functions',(SELECT jsonb_agg(jsonb_build_object('name',proname,'body',pg_get_functiondef(oid),'acl',proacl) ORDER BY proname) FROM pg_proc WHERE proname IN('get_next_document_number','issue_education_document_batch','create_group_document_batch') OR proname LIKE 'uc_document_%')) AS data`)).rows;
 const oldCatalog=await catalog();
 // Execute the actual whole migration, fail after its postcheck, then verify rollback.
 await expect(db.exec(migration.replace('COMMIT;',`DO $injected$ BEGIN RAISE EXCEPTION 'synthetic late release failure'; END $injected$; COMMIT;`))).rejects.toThrow(/synthetic late release failure/);
 await db.exec('ROLLBACK');
 expect(await catalog()).toEqual(oldCatalog);expect(await preserved()).toEqual(oldRows);
 await db.exec(migration);
 expect(await preserved()).toEqual(oldRows);
 expect((await db.query("SELECT schemaname,tablename,policyname,qual,with_check FROM pg_policies WHERE permissive='RESTRICTIVE' AND policyname NOT LIKE 'uc_document_objects_%' AND policyname<>'uc_billing_document_upload_guard' ORDER BY 1,2,3")).rows).toEqual(before);
 expect((await db.query("SELECT proname,proowner,prosecdef,proconfig FROM pg_proc WHERE proname IN('issue_education_document_batch','get_next_document_number','create_group_document_batch') ORDER BY proname")).rows).toEqual(functionProperties);
 expect((await db.query("SELECT * FROM pg_policies WHERE schemaname='storage' AND policyname=ANY($1::text[]) ORDER BY policyname",[billing.policies.filter((p:any)=>p.cmd!=='INSERT').map((p:any)=>p.policyname)])).rows).toEqual(billing.policies.filter((p:any)=>p.cmd!=='INSERT'));
},30000);

beforeEach(async()=>{
 await db.exec(`RESET ROLE;TRUNCATE ${[...baseline.tables,'document_number_sequences','storage.objects','profiles','user_roles','org_staff','account_deletion_revocations','organizations','companies','courses','enrollments','student_groups','student_group_memberships_effective'].map((t:string)=>t.includes('.')?t:q(t)).join(',')} CASCADE;
 INSERT INTO organizations VALUES('${org}'),('${otherOrg}');
 INSERT INTO profiles(user_id,organization_id)VALUES('${owner}','${org}'),('${admin}','${otherOrg}'),('${writer}','${otherOrg}'),('${reader}','${otherOrg}'),('${expired}','${org}'),('${learner}','${org}'),('${revoked}','${org}'),('${otherLearner}','${otherOrg}'),('${companyUser}','${otherOrg}');
 INSERT INTO user_roles VALUES('${owner}','organization'),('${admin}','admin'),('${learner}','student'),('${otherLearner}','student'),('${companyUser}','company');
 INSERT INTO org_staff(user_id,organization_id,role,sections_access,expires_at)VALUES
 ('${writer}','${org}','custom','["documents.read","documents.write"]',NULL),('${reader}','${org}','custom','["documents.read"]',NULL),('${expired}','${org}','custom','["documents.read","documents.write"]',now()-interval '1 day'),('${revoked}','${org}','custom','["documents.read","documents.write"]',NULL);
 INSERT INTO account_deletion_revocations VALUES('${revoked}');
 INSERT INTO companies VALUES('${company}','${org}',NULL,'Synthetic A'),('${otherCompany}','${otherOrg}','${companyUser}','Synthetic B');
 INSERT INTO courses VALUES('${course}','${org}','Synthetic A'),('${otherCourse}','${otherOrg}','Synthetic B');
 INSERT INTO enrollments VALUES('${enrollment}','${learner}','${course}','active'),('${otherEnrollment}','${otherLearner}','${otherCourse}','active');
 INSERT INTO student_groups VALUES('${group}','${org}','${course}');
 INSERT INTO org_documents(id,organization_id,name,type)VALUES('${doc}','${org}','Synthetic license','license');
 INSERT INTO student_identity_documents(user_id,organization_id,type,name,file_path,file_url)VALUES('${learner}','${org}','passport','Synthetic','${learner}/passport.pdf','${learner}/passport.pdf'),('${orphan}','${org}','passport','Legacy orphan','${orphan}/legacy.pdf','${orphan}/legacy.pdf');
 INSERT INTO student_documents(enrollment_id,name,type,file_url)VALUES('${enrollment}','Issued student document','certificate','students/${enrollment}/issued.pdf');
 INSERT INTO company_documents(company_id,name)VALUES('${company}','A'),('${otherCompany}','B');
 INSERT INTO storage.objects(bucket_id,name)VALUES('student-documents','${learner}/passport.pdf'),('student-documents','${otherLearner}/passport.pdf'),('student-documents','${orphan}/legacy.pdf'),('company-documents','${company}/contract.pdf'),('company-documents','${otherCompany}/contract.pdf'),('company-documents','${uid(999)}/orphan.pdf'),('unrelated-public','visible.txt');`);
 await as(owner);
});
afterAll(async()=>db?.close());

describe('UC document table permissions, actual production helpers and RPCs',()=>{
 it.each([owner,writer,admin])('allows authorized document writers %s and preserves numbering/issuance idempotency',async user=>{
  await as(user);expect((await db.query(`UPDATE org_documents SET name='Updated' WHERE id='${doc}' RETURNING id`)).rows).toHaveLength(1);
  const first=(await runIssue()).rows[0] as any;expect(first.document_number).toBe('2026/000001');expect((await runIssue()).rows[0]).toEqual(first);
  expect((await row('SELECT get_next_document_number($1,$2,$3) AS n',[org,'contract',2026])).n).toBe(1);
  expect((await row('SELECT get_next_document_number($1,$2,$3) AS n',[org,'contract',2026])).n).toBe(2);
 });
 it.each([learner,reader,expired,revoked,otherLearner])('denies direct writes and issuer/number RPC for %s',async user=>{
  await as(user);expect((await db.query(`UPDATE org_documents SET name='Denied' WHERE id='${doc}' RETURNING id`)).rows).toHaveLength(0);
  expect((await db.query(`DELETE FROM org_documents WHERE id='${doc}' RETURNING id`)).rows).toHaveLength(0);
  await expect(db.query(`INSERT INTO org_documents(organization_id,name,type)VALUES('${org}','Denied','license')`)).rejects.toThrow(/row-level security/);
  await expect(runIssue()).rejects.toThrow(/not authorized/);
  await expect(db.query('SELECT get_next_document_number($1,$2,$3)',[org,'contract',2026])).rejects.toThrow(/not authorized/);
  await db.exec('RESET ROLE');expect(await count('document_number_sequences')).toBe(0);expect(await count('education_document_records')).toBe(0);
 });
 it('keeps read-only staff reads and learner own educational records separate',async()=>{
  await runIssue();await as(reader);expect(await count('org_documents')).toBe(1);expect(await count('education_document_records')).toBe(1);
  await as(learner);expect(await count('org_documents')).toBe(0);expect(await count('education_document_records')).toBe(1);expect(await count('student_documents')).toBe(1);
  await as(otherLearner);expect(await count('education_document_records')).toBe(0);expect(await count('student_documents')).toBe(0);
 });
 it('allows learner own identity uploads but rejects forged organization links',async()=>{
  await as(learner);await db.query(`INSERT INTO student_identity_documents(user_id,organization_id,type,name)VALUES('${learner}','${org}','snils','Own')`);
  await expect(db.query(`INSERT INTO student_identity_documents(user_id,organization_id,type,name)VALUES('${learner}','${otherOrg}','snils','Forged')`)).rejects.toThrow(/row-level security/);
  await expect(db.query(`INSERT INTO student_identity_documents(user_id,organization_id,type,name)VALUES('${otherLearner}','${org}','snils','Forged')`)).rejects.toThrow(/row-level security/);
 });
 it('keeps company owner read-only',async()=>{
  await as(companyUser);expect((await db.query('SELECT company_id FROM company_documents')).rows).toEqual([{company_id:otherCompany}]);
  expect((await db.query("DELETE FROM company_documents RETURNING id")).rows).toHaveLength(0);
 });
 it('denies anonymous and NULL-user authenticated numbering without sequence writes',async()=>{
  await as(null,'anon');await expect(db.query('SELECT get_next_document_number($1,$2,$3)',[org,'contract',2026])).rejects.toThrow(/permission denied/);
  await as(null);await expect(db.query('SELECT get_next_document_number($1,$2,$3)',[org,'contract',2026])).rejects.toThrow(/not authorized/);
  await db.exec('RESET ROLE');expect(await count('document_number_sequences')).toBe(0);
 });
 it('adds active document gate to group batch before writes',async()=>{
  const args=[org,group,JSON.stringify([{doc_type:'student_list',name:'Synthetic draft',doc_status:'draft'}])];
  await as(writer);expect((await db.query('SELECT * FROM create_group_document_batch($1,$2,$3::jsonb)',args)).rows).toHaveLength(1);
  await as(reader);await expect(db.query('SELECT * FROM create_group_document_batch($1,$2,$3::jsonb)',args)).rejects.toThrow(/Document write permission/);
  expect((await db.query('DELETE FROM group_documents RETURNING id')).rows).toHaveLength(0);
  await as(revoked);await expect(db.query('SELECT * FROM create_group_document_batch($1,$2,$3::jsonb)',args)).rejects.toThrow(/Document write permission/);
 });
 it('rolls back the whole issuance batch and both number counters after a later invalid enrollment',async()=>{
  const item={user_id:learner,enrollment_id:enrollment,document_type:'certificate',issue_date:'2026-10-18',full_name:'Synthetic',specialty_name:'Synthetic'};
  await as(writer);
  await expect(db.query('SELECT * FROM issue_education_document_batch($1,$2,$3,$4::jsonb)',[org,null,course,JSON.stringify([item,{...item,enrollment_id:otherEnrollment}])])).rejects.toThrow(/does not belong to student/);
  await db.exec('RESET ROLE');expect(await count('education_document_records')).toBe(0);expect(await count('document_number_sequences')).toBe(0);
  await as(writer);expect(((await runIssue()).rows[0] as any).document_number).toBe('2026/000001');
 });
 it('keeps exact tenant/course/group checks after the new writer gate',async()=>{
  const item={user_id:learner,enrollment_id:enrollment,document_type:'certificate',issue_date:'2026-10-18'};
  await as(writer);
  await expect(db.query('SELECT * FROM issue_education_document_batch($1,$2,$3,$4::jsonb)',[org,null,otherCourse,JSON.stringify([item])])).rejects.toThrow(/does not belong to organization/);
  await expect(db.query('SELECT * FROM issue_education_document_batch($1,$2,$3,$4::jsonb)',[org,group,course,JSON.stringify([item])])).rejects.toThrow(/not a member/);
  await db.exec('RESET ROLE');expect(await count('education_document_records')).toBe(0);expect(await count('document_number_sequences')).toBe(0);
 });
 it.each([learner,reader,expired,revoked,otherLearner])('blocks direct ledger insert/update/delete bypass for %s',async user=>{
  const issued=(await runIssue()).rows[0] as any;
  await as(user);
  await expect(db.query(`INSERT INTO education_document_records(organization_id,user_id,reg_number,document_number,full_name,document_type,issue_date,specialty_name)VALUES($1,$2,'FORGED','FORGED','Synthetic','certificate','2026-10-18','Synthetic')`,[org,learner])).rejects.toThrow(/row-level security/);
  await expect(db.query(`INSERT INTO document_issuance_log(organization_id,user_id,user_name,document_type,document_name)VALUES($1,$2,'Synthetic','certificate','Forged')`,[org,learner])).rejects.toThrow(/row-level security/);
  expect((await db.query("UPDATE education_document_records SET document_number='FORGED' WHERE id=$1 RETURNING id",[issued.id])).rows).toHaveLength(0);
  expect((await db.query('DELETE FROM education_document_records WHERE id=$1 RETURNING id',[issued.id])).rows).toHaveLength(0);
  await db.exec('RESET ROLE');expect(await count('education_document_records')).toBe(1);expect(await count('document_issuance_log')).toBe(0);
 });
});

describe('UC storage ownership including all existing restrictive policies',()=>{
 it.each([owner,writer])('allows own-org scoped writer %s without exposing tenant B',async user=>{
  await as(user);expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id='student-documents' ORDER BY name")).rows).toEqual([{name:`${learner}/passport.pdf`},{name:`${orphan}/legacy.pdf`}]);
  expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id='company-documents'")).rows).toEqual([{name:`${company}/contract.pdf`}]);
  expect((await db.query(`UPDATE storage.objects SET metadata='{"ok":true}' WHERE name='${learner}/passport.pdf' RETURNING id`)).rows).toHaveLength(1);
  expect((await db.query(`DELETE FROM storage.objects WHERE name='${otherLearner}/passport.pdf' RETURNING id`)).rows).toHaveLength(0);
  await expect(db.query(`INSERT INTO storage.objects(bucket_id,name)VALUES('student-documents','${otherLearner}/new.pdf')`)).rejects.toThrow(/row-level security/);
 });
 it('keeps read-only staff read and denies mutation, expired/revoked staff see none',async()=>{
  await as(reader);expect(await count('storage.objects')).toBe(3);expect((await db.query('DELETE FROM storage.objects RETURNING id')).rows).toHaveLength(0);
  for(const user of [expired,revoked]){await as(user);expect(await count('storage.objects')).toBe(0);}
 });
 it('allows learner only own personal, avatar and support paths',async()=>{
  await as(learner);expect((await db.query('SELECT name FROM storage.objects')).rows).toEqual([{name:`${learner}/passport.pdf`}]);
  for(const name of [`${learner}/new.pdf`,`avatars/${learner}.png`,`support/${learner}/screen.png`])await db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['student-documents',name]);
  await expect(db.query(`INSERT INTO storage.objects(bucket_id,name)VALUES('student-documents','${otherLearner}/new.pdf')`)).rejects.toThrow(/row-level security/);
  await expect(db.query(`INSERT INTO storage.objects(bucket_id,name)VALUES('student-documents','students/${enrollment}/issued.pdf')`)).rejects.toThrow(/row-level security/);
 });
 it('lets own student read official enrollment path but only document writer upload it',async()=>{
  await db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['student-documents',`students/${enrollment}/issued.pdf`]);
  await as(learner);expect((await db.query('SELECT name FROM storage.objects WHERE name LIKE $1',[`students/${enrollment}/%`])).rows).toHaveLength(1);
  expect((await db.query('DELETE FROM storage.objects WHERE name LIKE $1 RETURNING id',[`students/${enrollment}/%`])).rows).toHaveLength(0);
 });
 it('keeps company recipient read-only and orphans admin-only',async()=>{
  await as(companyUser);expect((await db.query('SELECT name FROM storage.objects')).rows).toEqual([{name:`${otherCompany}/contract.pdf`}]);
  expect((await db.query('DELETE FROM storage.objects RETURNING id')).rows).toHaveLength(0);
  await as(admin);expect((await db.query('SELECT name FROM storage.objects WHERE name=$1',[`${uid(999)}/orphan.pdf`])).rows).toHaveLength(1);
 });
 it('fails closed for conflicting exact legacy mappings without changing objects',async()=>{
  await db.exec('RESET ROLE');await db.query(`INSERT INTO student_identity_documents(user_id,organization_id,type,name,file_path)VALUES($1,$2,'passport','Conflicting',$3)`,[learner,otherOrg,`${learner}/passport.pdf`]);
  await as(owner);expect((await db.query('SELECT name FROM storage.objects WHERE name=$1',[`${learner}/passport.pdf`])).rows).toHaveLength(0);
  await as(admin);expect((await db.query('SELECT name FROM storage.objects WHERE name=$1',[`${learner}/passport.pdf`])).rows).toHaveLength(1);
 });
 it('cannot be widened by a future permissive storage policy; unrelated anon bucket still works',async()=>{
  await db.exec('RESET ROLE;CREATE POLICY audit_broad_permissive ON storage.objects FOR ALL TO public USING(true) WITH CHECK(true)');
  try{
   await as(learner);expect((await db.query('SELECT name FROM storage.objects WHERE name=$1',[`${otherLearner}/passport.pdf`])).rows).toHaveLength(0);
   await as(null,'anon');expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id='student-documents'")).rows).toHaveLength(0);
   expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id='unrelated-public'")).rows).toEqual([{name:'visible.txt'}]);
  }finally{await db.exec('RESET ROLE;DROP POLICY audit_broad_permissive ON storage.objects');}
 });
 it.each(['../escape','avatars/not-a-uuid.png',`${learner}/../other.pdf`,`${learner}/%2fother.pdf`,`${learner}/file?token=anything`])('rejects malformed storage path %s',async name=>{
  await as(learner);await expect(db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['student-documents',name])).rejects.toThrow(/row-level security/);
 });
});

describe('billing upload uses canonical document-write permission without widening other commands',()=>{
 it.each([owner,writer,admin])('allows authorized writer %s in both supported path layouts',async user=>{
  await as(user);
  for(const name of [`${org}/groups/contract.pdf`,`organizations/${org}/contracts/doc.docx`])await db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['billing-documents',name]);
  await db.exec('RESET ROLE');expect((await db.query("SELECT name FROM storage.objects WHERE bucket_id='billing-documents'")).rows).toHaveLength(2);
 });
 it.each([learner,reader,expired,revoked,otherLearner])('denies billing uploads from %s even when profile has that organization',async user=>{
  await as(user);
  for(const name of [`${org}/file.pdf`,`organizations/${org}/file.docx`])await expect(db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['billing-documents',name])).rejects.toThrow(/row-level security/);
 });
 it('does not allow arbitrary admin paths or writes to another tenant; special issued bucket stays sealed',async()=>{
  await as(writer);await expect(db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['billing-documents',`${otherOrg}/file.pdf`])).rejects.toThrow(/row-level security/);
  await as(admin);
  for(const name of ['unscoped.pdf',`${org}/../bad.pdf`,`organizations/${uid(999)}/missing.pdf`])await expect(db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['billing-documents',name])).rejects.toThrow(/row-level security/);
  await db.exec('RESET ROLE;CREATE POLICY audit_broad_insert ON storage.objects FOR INSERT TO public WITH CHECK(true)');
  try{
   await as(admin);await expect(db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['goreltech-issued-documents',`${org}/file.pdf`])).rejects.toThrow(/row-level security/);
   await as(learner);await expect(db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['billing-documents',`${org}/file.pdf`])).rejects.toThrow(/row-level security/);
   await as(null,'anon');await expect(db.query('INSERT INTO storage.objects(bucket_id,name)VALUES($1,$2)',['billing-documents',`${org}/file.pdf`])).rejects.toThrow(/row-level security/);
  }finally{await db.exec('RESET ROLE;DROP POLICY audit_broad_insert ON storage.objects');}
 });
});
