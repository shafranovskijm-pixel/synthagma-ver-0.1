import {readFileSync} from 'node:fs';
import {createUcStudentFrdoWriteFixture} from './uc-student-frdo-write.fixture';
const read=(p:string)=>readFileSync(p,'utf8').replace(/\r\n/g,'\n');
export const enrollmentDeleteMigration=read('supabase/migrations/20261018113000_uc_enrollment_delete_boundaries.sql');
export async function createUcEnrollmentDeleteFixture(apply=true){
 const db=await createUcStudentFrdoWriteFixture(true);
 const manifest=JSON.parse(read('docs/releases/sintagma-production/uc-student-frdo-write-20261019/release-manifest.json'));
 for(const m of manifest.migrations)await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES($1,$2,$3)',[m.version,m.name,[read('supabase/migrations/'+m.file)]]);
 const b=JSON.parse(read('supabase/tests/fixtures/uc-enrollment-delete-baseline.json'));
 // Install captured deployed deletion functions, not authorization stubs.
 // These row types are needed to compile the untouched service erase function;
 // the full destructive workflow is never invoked by this fixture.
 await db.exec('CREATE TABLE IF NOT EXISTS account_deletion_jobs(id uuid,receipt_hash text,consent_version text,state text,user_id uuid,snapshot jsonb,files jsonb,data_erased boolean);');
 for(const f of b.functions){await db.exec(f.definition);await db.exec(`REVOKE ALL ON FUNCTION ${f.signature} FROM PUBLIC,anon,authenticated,service_role`);
  if(f.proacl.includes('=X/')){const publicGrant=/[{,]=X\//.test(f.proacl);if(publicGrant)await db.exec(`GRANT EXECUTE ON FUNCTION ${f.signature} TO PUBLIC`);}
  for(const role of ['anon','authenticated','service_role'])if(f.proacl.includes(role+'=X/'))await db.exec(`GRANT EXECUTE ON FUNCTION ${f.signature} TO ${role}`);
 }
 await db.exec(`CREATE TABLE IF NOT EXISTS marketplace_courses(id uuid,organization_id uuid);CREATE TABLE IF NOT EXISTS marketplace_orders(buyer_organization_id uuid,marketplace_course_id uuid);CREATE TABLE IF NOT EXISTS marketplace_course_comments(marketplace_course_id uuid);CREATE TABLE IF NOT EXISTS course_reminders(course_id uuid);CREATE TABLE IF NOT EXISTS course_documents(course_id uuid);CREATE TABLE IF NOT EXISTS course_access_log(course_id uuid,user_id uuid);CREATE TABLE IF NOT EXISTS training_plans(organization_id uuid,company_id uuid);CREATE TABLE IF NOT EXISTS ai_usage_log(organization_id uuid);`);
 for(const t of b.enrollmentTriggers.filter((t:any)=>t.function_signature==='csz_guard_enrollment()')){await db.exec(t.function_definition);await db.exec(t.trigger_definition);}
 const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
 for(const p of b.parentPolicies){
  await db.exec(`DROP POLICY IF EXISTS ${quote(p.policyname)} ON ${quote(p.tablename)}`);
  const roles=Array.isArray(p.roles)?p.roles:p.roles.slice(1,-1).split(',');
  await db.exec(`CREATE POLICY ${quote(p.policyname)} ON ${quote(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${roles.map(quote).join(',')}${p.qual?' USING('+p.qual+')':''}${p.with_check?' WITH CHECK('+p.with_check+')':''}`);
 }
 // Faithful live cascade relations are essential: old fixtures intentionally
 // omitted these FKs and cannot prove parent-deletion visibility behavior.
 for(const f of b.constraints.filter((c:any)=>['enrollments_course_id_fkey','courses_organization_id_fkey','profiles_organization_id_fkey'].includes(c.name)))await db.exec(`ALTER TABLE ${f.table} ADD CONSTRAINT ${quote(f.name)} ${f.definition}`);
 await db.exec('CREATE UNIQUE INDEX uc113_fixture_course_tenant ON courses(id,organization_id)');
 for(const f of b.parentExtraForeignKeys)await db.exec(`ALTER TABLE ${f.table_name} ADD CONSTRAINT ${quote(f.conname)} ${f.definition}`);
 await db.exec('ALTER TABLE video_identifications ADD COLUMN enrollment_id uuid REFERENCES enrollments(id) ON DELETE CASCADE;');
 await db.exec('ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON organizations,courses,enrollments TO authenticated;GRANT ALL ON courses,enrollments,organizations TO service_role;');
 if(apply)await db.exec(enrollmentDeleteMigration);
 return db;
}
