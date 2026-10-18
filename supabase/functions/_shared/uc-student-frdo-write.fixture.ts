import {readFileSync} from 'node:fs';
import {createUcProgramFactsReleaseFixture} from './uc-program-facts-release.fixture';
const read=(p:string)=>readFileSync(p,'utf8').replace(/\r\n/g,'\n');
export const studentFrdoWriteMigration=read('supabase/migrations/20261018112000_uc_student_frdo_write_boundaries.sql');
export async function createUcStudentFrdoWriteFixture(apply=true){
 const db=await createUcProgramFactsReleaseFixture(true);
 const prior=JSON.parse(read('docs/releases/sintagma-production/uc-program-facts-20261018/release-manifest.json'));
 for(const m of prior.migrations)await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES($1,$2,$3)',[m.version,m.name,[read('supabase/migrations/'+m.file)]]);
 const b=JSON.parse(read('supabase/tests/fixtures/uc-student-frdo-write-baseline.json'));
 const existing=new Set((await db.query<any>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='student_frdo_data'")).rows.map(r=>r.column_name));
 for(const c of b.columns)if(!existing.has(c.column_name))await db.exec(`ALTER TABLE student_frdo_data ADD COLUMN ${c.column_name} ${c.udt_name}${c.column_default?' DEFAULT '+c.column_default:''}${c.is_nullable==='NO'?' NOT NULL':''}`);
 await db.exec(`ALTER TABLE student_frdo_data ALTER COLUMN user_id SET NOT NULL;ALTER TABLE student_frdo_data ALTER COLUMN organization_id SET NOT NULL;
 ALTER TABLE student_frdo_data ADD PRIMARY KEY(id);ALTER TABLE student_frdo_data ADD CONSTRAINT unique_user_org_frdo UNIQUE(user_id,organization_id);
 ALTER TABLE profiles ADD COLUMN department text;
 CREATE TABLE video_identifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,status text,verified_by uuid,verified_at timestamptz,rejection_reason text,created_at timestamptz DEFAULT now());
 ALTER ROLE service_role BYPASSRLS;GRANT ALL ON student_frdo_data,profiles TO service_role;
 `);
 // Install captured deployed authority implementations, never a permission stub.
 for(const f of b.helpers)await db.exec(f.definition);
 for(const f of b.serverWriters)await db.exec(f.definition);
 await db.exec(b.timestampWriter.definition);
 for(const f of b.serverWriters){
  await db.exec(`REVOKE ALL ON FUNCTION ${f.signature} FROM PUBLIC,anon,authenticated,service_role`);
  for(const role of ['authenticated','service_role'])if(f.proacl.includes(role+'=X/'))await db.exec(`GRANT EXECUTE ON FUNCTION ${f.signature} TO ${role}`);
 }
 const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
 for(const p of b.policies.filter((p:any)=>p.tablename==='student_frdo_data')){
  await db.exec(`DROP POLICY IF EXISTS ${quote(p.policyname)} ON student_frdo_data`);
  const roles=Array.isArray(p.roles)?p.roles:p.roles.slice(1,-1).split(',');
  await db.exec(`CREATE POLICY ${quote(p.policyname)} ON student_frdo_data AS ${p.permissive} FOR ${p.cmd} TO ${roles.map(quote).join(',')}${p.qual?' USING('+p.qual+')':''}${p.with_check?' WITH CHECK('+p.with_check+')':''}`);
 }
 for(const t of [...b.triggers.filter((t:any)=>t.table_name==='student_frdo_data'&&t.tgname==='account_deletion_subject_fence'),...b.profileTrigger])await db.exec(t.definition);
 for(const t of b.triggers.filter((t:any)=>t.table_name==='student_frdo_data'&&t.tgname==='update_student_frdo_data_updated_at'))await db.exec(t.definition);
 if(apply)await db.exec(studentFrdoWriteMigration);
 return db;
}
