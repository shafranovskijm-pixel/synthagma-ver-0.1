import {readFileSync} from 'node:fs';
import {createUcReleaseFixture} from './uc-release.fixture';
// The release executor uses canonical LF SQL; Windows checkout CRLF must not change literal patch markers.
const read=(p:string)=>readFileSync(p,'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
export const scopeMigration=read('supabase/migrations/20261018104000_uc_document_staff_scope.sql');
export async function createUcDocumentScopeFixture(applyScope=true){
 const db=await createUcReleaseFixture();
 await db.exec(`ALTER TABLE org_staff ADD COLUMN id uuid DEFAULT gen_random_uuid() PRIMARY KEY;
 ALTER TABLE org_staff ADD CONSTRAINT scope_fixture_staff_unique UNIQUE(organization_id,user_id);
 ALTER TABLE student_groups ADD COLUMN name text NOT NULL DEFAULT 'Synthetic group';
 ALTER TABLE student_groups ADD COLUMN training_dates date[] NOT NULL DEFAULT '{}';
 CREATE UNIQUE INDEX student_groups_membership_tenant_key ON student_groups(id,organization_id);
 CREATE TABLE admin_staff(id uuid DEFAULT gen_random_uuid(),user_id uuid UNIQUE,role text,expires_at timestamptz);
 ALTER TABLE profiles ADD COLUMN login text,ADD COLUMN company_id uuid,ADD COLUMN last_visit_at timestamptz,ADD COLUMN archived_at timestamptz;
 ALTER TABLE enrollments ADD COLUMN progress integer,ADD COLUMN started_at timestamptz,ADD COLUMN completed_at timestamptz,ADD COLUMN time_spent integer;
 CREATE TABLE student_group_memberships(organization_id uuid,group_id uuid,user_id uuid);
 DROP TABLE student_group_memberships_effective;
 CREATE VIEW student_group_memberships_effective WITH(security_invoker=true) AS
 SELECT p.organization_id,p.student_group_id AS group_id,p.user_id FROM profiles p JOIN student_groups g ON g.id=p.student_group_id AND g.organization_id=p.organization_id
 UNION SELECT organization_id,group_id,user_id FROM student_group_memberships;
 CREATE VIEW student_group_profiles_effective WITH(security_invoker=true) AS
 SELECT p.*,m.group_id FROM profiles p JOIN student_group_memberships_effective m ON m.user_id=p.user_id AND m.organization_id=p.organization_id;
 CREATE TABLE student_roster_removals(organization_id uuid,user_id uuid);
 CREATE TABLE lessons(id uuid PRIMARY KEY,course_id uuid);
 CREATE TABLE test_attempts(id uuid PRIMARY KEY,user_id uuid,lesson_id uuid,score integer);
 CREATE TABLE lesson_progress(id uuid PRIMARY KEY,user_id uuid,lesson_id uuid,completed boolean);
 CREATE TABLE enrollment_history(id uuid PRIMARY KEY,enrollment_id uuid,user_id uuid,course_id uuid);
 CREATE TABLE journal_instances(id uuid PRIMARY KEY,organization_id uuid,course_id uuid,title text);
 CREATE TABLE journal_entries(id uuid PRIMARY KEY,journal_id uuid,user_id uuid,value text);
 CREATE TABLE group_class_journal_marks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,group_id uuid,user_id uuid,slot integer,course_id uuid,source_date text,mark text,revision integer,updated_at timestamptz,updated_by uuid,UNIQUE(group_id,user_id,slot));
 CREATE TABLE student_frdo_data(user_id uuid,organization_id uuid,last_name text,first_name text,birth_date date,gender text,snils text);
 CREATE FUNCTION can_access_course(uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM courses c WHERE c.id=$1 AND can_access_organization(c.organization_id,$2))$$;
 CREATE FUNCTION can_access_lesson(uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM lessons l WHERE l.id=$1 AND can_access_course(l.course_id,$2))$$;
 CREATE FUNCTION is_student_profile(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
 GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
 `);
 // Captured source policies; course/lesson lookup adapters delegate to the actual organization helper.
 for(const t of ['profiles','enrollments','student_groups','student_group_memberships','journal_instances','journal_entries','test_attempts','lesson_progress','enrollment_history','student_frdo_data','group_class_journal_marks']){
  await db.exec(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;GRANT ALL ON ${t} TO authenticated`);
 }
 const q=(s:string)=>`"${s.replaceAll('"','""')}"`;
 for(const p of JSON.parse(read('supabase/tests/fixtures/uc-document-scope-sources-baseline.json')).policies){
  await db.exec(`CREATE POLICY ${q(p.policyname)} ON ${q(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(q).join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''}`);
 }
 for(const p of JSON.parse(read('supabase/tests/fixtures/uc-document-group-model-baseline.json')).marks_policies)await db.exec(`CREATE POLICY ${q(p.policyname)} ON ${q(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(q).join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''}`);
 const contracts=JSON.parse(read('supabase/tests/fixtures/uc-org-contracts-baseline.json'));
 await db.exec(`CREATE TABLE org_contracts(${contracts.columns.map((c:any)=>`${q(c.column)} ${c.type}${c.default?` DEFAULT ${c.default}`:''}${c.nullable==='NO'?' NOT NULL':''}`).join(',')});ALTER TABLE org_contracts ADD PRIMARY KEY(id);ALTER TABLE org_contracts ENABLE ROW LEVEL SECURITY;GRANT ALL ON org_contracts TO authenticated;`);
 for(const p of contracts.policies)await db.exec(`CREATE POLICY ${q(p.policyname)} ON ${q(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(q).join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''}`);
 for(const f of ['20261018100000_uc_document_access_boundaries.sql','20261018101000_uc_signature_integrity.sql','20261018102000_uc_document_versions.sql'])await db.exec(read('supabase/migrations/'+f));
 for(const file of ['uc-document-scope-rpc-baseline.json','uc-document-scope-sources-baseline.json']){
  const baseline=JSON.parse(read('supabase/tests/fixtures/'+file));
  for(const f of baseline.functions.filter((f:any)=>['get_documents_kpi','get_frdo_export_readiness','list_recycle_bin','get_course_students_page','get_organization_students_page','get_organization_student_group_counts','save_group_class_journal_mark'].includes(f.name)))await db.exec(f.definition);
 }
 if(applyScope)await db.exec(scopeMigration);
 return db;
}
