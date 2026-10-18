import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const repo=process.cwd();
const fixture=(name:string)=>JSON.parse(readFileSync(path.join(repo,'supabase/tests/fixtures/',name),'utf8').replace(/^\uFEFF/,''));
const baseline=fixture('uc-document-access-baseline.json'),billing=fixture('uc-billing-storage-baseline.json');
const release=fixture('uc-release-baseline.json'),signature=fixture('uc-signature-schema-20261018.json');
export const syntheticCleanupCommand="SELECT 'https://fixture.invalid/functions/v1/purge-recycle-bin-storage Authorization Bearer eyJ.synthetic.payload'";
const q=(s:string)=>`"${s.replaceAll('"','""')}"`;
const policy=(p:any)=>`CREATE POLICY ${q(p.policyname)} ON ${q(p.schemaname)}.${q(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(q).join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''}`;
export async function createUcReleaseFixture(){
 const db=new PGlite();
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
 await db.exec(`CREATE SCHEMA supabase_migrations;
 CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text,created_by text,idempotency_key text UNIQUE,rollback text[]);
 CREATE FUNCTION auth.role()RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
 CREATE FUNCTION auth.jwt()RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('iss','https://fixture.supabase.co/auth/v1')$$;
 ALTER TABLE organizations ADD COLUMN name text,ADD COLUMN inn text;
 ALTER TABLE org_staff ADD COLUMN display_name text;
 ALTER TABLE org_documents ADD PRIMARY KEY(id);
 CREATE TABLE commercial_proposals(id uuid PRIMARY KEY);
 CREATE TABLE org_contract_template_versions(id uuid PRIMARY KEY);
 INSERT INTO storage.buckets VALUES('org-documents',false),('signed-documents',false),('external-contracts',false);
 `);
 await db.exec(`CREATE SCHEMA cron;
 CREATE TABLE cron.job(jobid bigint PRIMARY KEY,jobname text,schedule text,command text,active boolean,username text DEFAULT current_user,database text DEFAULT current_database());
 CREATE FUNCTION cron.alter_job(job_id bigint,schedule text DEFAULT NULL,command text DEFAULT NULL,database text DEFAULT NULL,username text DEFAULT NULL,active boolean DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN UPDATE cron.job SET active=coalesce($6,cron.job.active) WHERE jobid=$1;END$$;
 `);
 await db.query('INSERT INTO cron.job(jobid,jobname,schedule,command,active)VALUES(1,$1,$2,$3,true),(2,$4,$5,$6,true)',['purge-recycle-bin-storage-daily','0 3 * * *',syntheticCleanupCommand,'unrelated-job','0 7 * * *','SELECT 1']);
 for(const f of signature.functions.filter((f:any)=>['account_deletion_subject_write_guard','validate_signature_method'].includes(f.name)))await db.exec(f.definition);
 for(const table of ['pep_agreements','document_signatures','signature_revisions','signature_comments','org_document_versions']){
  const source=['document_signatures','signature_revisions'].includes(table)?signature:release;
  const cols=source.columns.filter((c:any)=>c.table===table).map((c:any)=>`${q(c.column)} ${c.type}${c.default?` DEFAULT ${c.default}`:''}${c.nullable==='NO'?' NOT NULL':''}`);
  await db.exec(`CREATE TABLE ${q(table)}(${cols.join(',')});ALTER TABLE ${q(table)} ENABLE ROW LEVEL SECURITY;`);
  for(const c of source.constraints.filter((c:any)=>c.table===table))await db.exec(`ALTER TABLE ${q(table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
 }
 for(const p of release.policies)await db.exec(policy(p));
 for(const t of signature.triggers)await db.exec(t.definition);
 for(const f of release.functions)await db.exec(f.definition);
 await db.exec(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,storage TO authenticated;
 INSERT INTO organizations(id,name,inn)VALUES('00000000-0000-4000-8000-000000000100','Synthetic original organization','synthetic');
 INSERT INTO profiles(user_id,organization_id,full_name)VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000100','Synthetic Owner');
 INSERT INTO user_roles VALUES('00000000-0000-4000-8000-000000000001','organization');
 INSERT INTO org_documents(id,organization_id,name,type,file_url)VALUES('00000000-0000-4000-8000-000000000900','00000000-0000-4000-8000-000000000100','Legacy document','license','legacy/original.pdf');
 INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('org-documents','legacy/original.pdf','{"size":10}'),('company-documents','unresolved/original.pdf','{"size":12}');
 INSERT INTO document_number_sequences(organization_id,doc_type,year,last_number)VALUES('00000000-0000-4000-8000-000000000100','contract',2026,73);
 INSERT INTO document_signatures(id,organization_id,sender_user_id,document_type,document_title,recipient_type,recipient_email,recipient_name,status,document_html,document_hash,signed_at)
 VALUES('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001','contract','Legacy evidence','student','synthetic@example.invalid','Synthetic Recipient','signed','Original signed HTML','original-preserved-hash','2026-10-01');
 `);
 return db;
}
