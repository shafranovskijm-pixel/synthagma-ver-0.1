import {readFileSync} from 'node:fs';
import {createUcEnrollmentDeleteFixture} from './uc-enrollment-delete.fixture';
const read=(p:string)=>readFileSync(p,'utf8').replace(/\r\n/g,'\n');
export const identificationMigration=read('supabase/migrations/20261019114000_uc_identification_private_review.sql');
export const identificationBaseline=JSON.parse(read('supabase/tests/fixtures/uc-identification-private-review-baseline.json'));
export async function createUcIdentificationFixture(apply=true){
 const db=await createUcEnrollmentDeleteFixture(true);
 const prior=JSON.parse(read('docs/releases/sintagma-production/uc-enrollment-delete-20261019/release-manifest.json'));
 for(const m of prior.migrations)await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES($1,$2,$3)',[m.version,m.name,[read('supabase/migrations/'+m.file)]]);
 const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
 await db.exec(`ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS name text;ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS file_size_limit bigint;ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS allowed_mime_types text[];
 ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS owner uuid;ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS owner_id text;
 ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT clock_timestamp();ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT clock_timestamp();
 CREATE UNIQUE INDEX IF NOT EXISTS uc114_fixture_storage_name ON storage.objects(bucket_id,name);
 GRANT ALL ON storage.objects TO service_role;
 `);
 const existing=new Set((await db.query<any>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='video_identifications'")).rows.map(r=>r.column_name));
 for(const c of identificationBaseline.videoColumns){
  if(!existing.has(c.column))await db.exec(`ALTER TABLE video_identifications ADD COLUMN ${quote(c.column)} ${c.type}`);
  if(c.default)await db.exec(`ALTER TABLE video_identifications ALTER COLUMN ${quote(c.column)} SET DEFAULT ${c.default}`);
  if(c.nullable==='NO')await db.exec(`ALTER TABLE video_identifications ALTER COLUMN ${quote(c.column)} SET NOT NULL`);
 }
 await db.exec("ALTER TABLE video_identifications ADD CONSTRAINT video_identifications_status_check CHECK(status IN('pending','verified','rejected','expired'));CREATE INDEX idx_video_identifications_user_org_status ON video_identifications(user_id,organization_id,status);ALTER TABLE video_identifications ENABLE ROW LEVEL SECURITY;GRANT SELECT,INSERT,UPDATE,DELETE ON video_identifications TO authenticated,anon,service_role;");
 // Install fresh captured deployed bodies and grants, never authority stubs.
 for(const f of identificationBaseline.functions.filter((f:any)=>f.signature.startsWith('account_deletion_'))){
  await db.exec(f.definition);await db.exec(`REVOKE ALL ON FUNCTION ${f.signature} FROM PUBLIC,anon,authenticated,service_role`);
  for(const role of ['anon','authenticated','service_role'])if(f.acl?.includes(role+'=X/'))await db.exec(`GRANT EXECUTE ON FUNCTION ${f.signature} TO ${role}`);
 }
 for(const p of identificationBaseline.videoPolicies){
  await db.exec(`CREATE POLICY ${quote(p.policyname)} ON video_identifications AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(quote).join(',')}${p.qual?' USING('+p.qual+')':''}${p.with_check?' WITH CHECK('+p.with_check+')':''}`);
 }
 await db.exec("INSERT INTO storage.buckets(id,name,public)VALUES('avatars','avatars',true) ON CONFLICT(id)DO NOTHING");
 for(const p of identificationBaseline.legacyAvatarPolicies)await db.exec(`CREATE POLICY ${quote(p.policyname)} ON storage.objects AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(quote).join(',')}${p.qual?' USING('+p.qual+')':''}${p.with_check?' WITH CHECK('+p.with_check+')':''}`);
 for(const t of identificationBaseline.videoTriggers)await db.exec(t.definition);
 const storageFence=identificationBaseline.storageTriggers.find((t:any)=>t.name==='account_deletion_reject_revoked_upload');
 await db.exec(storageFence.definition);
 // Extend minimal earlier fixtures only where the captured erasure graph needs
 // a relation/UUID attribution column. This is test setup, not a product schema.
 const pairs=new Map<string,Set<string>>();
 for(const f of identificationBaseline.functions.filter((f:any)=>f.signature.startsWith('account_deletion_'))){
  for(const block of f.definition.matchAll(/FOR r IN SELECT \* FROM \(VALUES([\s\S]*?)\) x\(t,c\)/g))for(const m of block[1].matchAll(/\('([a-z_]+)','([a-z_]+)'\)/g)){
   if(!pairs.has(m[1]))pairs.set(m[1],new Set());pairs.get(m[1])!.add(m[2]);
  }
 }
 for(const[t,columns]of pairs){await db.exec(`CREATE TABLE IF NOT EXISTS ${quote(t)}(uc114_fixture_placeholder boolean)`);for(const c of columns)await db.exec(`ALTER TABLE ${quote(t)} ADD COLUMN IF NOT EXISTS ${quote(c)} uuid`);}
 await db.exec(`ALTER TABLE homework_submissions ADD COLUMN IF NOT EXISTS course_id uuid;ALTER TABLE organization_offer_acceptances ADD COLUMN IF NOT EXISTS organization_id uuid;
 ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_id uuid;ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_name text;ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id text;ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type text;ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address text;ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent text;
 ALTER TABLE role_audit_log ADD COLUMN IF NOT EXISTS performed_by uuid;ALTER TABLE role_audit_log ADD COLUMN IF NOT EXISTS performed_by_name text;ALTER TABLE role_audit_log ADD COLUMN IF NOT EXISTS details jsonb;
 ALTER TABLE student_deletion_log ADD COLUMN IF NOT EXISTS deleted_by uuid;ALTER TABLE student_deletion_log ADD COLUMN IF NOT EXISTS deleted_by_name text;ALTER TABLE student_deletion_log ADD COLUMN IF NOT EXISTS deleted_by_email text;
 ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS conversation_id uuid;ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS id uuid;
 ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
 ALTER TABLE test_attempt_sessions ADD COLUMN IF NOT EXISTS lesson_id uuid;ALTER TABLE test_attempt_start_requests ADD COLUMN IF NOT EXISTS lesson_id uuid;
 `);
 if(apply)await db.exec(identificationMigration);
 return db;
}
