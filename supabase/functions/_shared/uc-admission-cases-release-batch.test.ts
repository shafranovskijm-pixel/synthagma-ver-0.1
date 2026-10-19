// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {afterEach,it,expect} from 'vitest';
import {createUcAdmissionFixture,admissionBaseline} from './uc-admission-cases.fixture';
const folder=new URL('../../../docs/releases/sintagma-production/uc-admission-cases-20261019/',import.meta.url);
const read=async(p:string)=>(await readFile(new URL(p,folder),'utf8')).replace(/\r\n/g,'\n');
const sha=(s:string)=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
const oldRecord='e0000000-0000-4000-8000-000000000881',oldVideo='e0000000-0000-4000-8000-000000000882';
const tables=['uc_admission_cases','uc_admission_rule_sets','uc_admission_case_events','uc_admission_case_evidence','uc_admission_evidence_reservations','uc_admission_case_requests'];
let db:any,defaultAclBefore:string;
const defaultAclHashSql="SELECT md5(coalesce(jsonb_agg(to_jsonb(d)ORDER BY d.oid),'[]')::text)hash FROM pg_default_acl d";
const one=async(sql:string,args:any[]=[]) => (await db.query(sql,args)).rows[0];
async function setup(){
 db=await createUcAdmissionFixture(false);
 // Owner-only fixture seed is deliberately nonempty in the last114 private
 // registry and its legacy projection; no production or API authority is used.
 await db.exec("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false);ALTER TABLE video_identifications DISABLE TRIGGER uc_identification_projection_guard;INSERT INTO video_identifications(id,user_id,organization_id,status,photo_url,verified_by,verified_at)VALUES('"+oldVideo+"','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000100','verified','https://invalid.example/retained-legacy.jpg','00000000-0000-4000-8000-000000000001','2020-01-01T00:00:00Z');ALTER TABLE video_identifications ENABLE TRIGGER uc_identification_projection_guard;INSERT INTO uc_identification_records(id,user_id,organization_id,scope_kind,projection_owned,origin,source_kind,status)VALUES('"+oldRecord+"','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000100','subject',false,'prospective','manual_staff_claim','verified');CREATE ROLE fixture_bystander;");
 defaultAclBefore=(await one(defaultAclHashSql)).hash;
}
async function rolledBack(){
 await db.exec('ROLLBACK');expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:15});
 expect((await one(defaultAclHashSql)).hash).toBe(defaultAclBefore);
 for(const table of tables)expect(await one(`SELECT to_regclass('public.${table}') IS NULL absent`)).toEqual({absent:true});
 expect(await one("SELECT to_regprocedure('uc_admission_evidence_context(uuid,uuid,bigint,uuid)') IS NULL absent")).toEqual({absent:true});
 expect(await one("SELECT count(*)::int n FROM storage.buckets WHERE id='admission-case-evidence'")).toEqual({n:0});
 expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
 expect(await one('SELECT status,photo_url FROM video_identifications WHERE id=$1',[oldVideo])).toEqual({status:'verified',photo_url:'https://invalid.example/retained-legacy.jpg'});
 expect(await one('SELECT status,revision::int revision FROM uc_identification_records WHERE id=$1',[oldRecord])).toEqual({status:'verified',revision:1});
 for(const f of admissionBaseline.metadata.functions.filter((f:any)=>f.signature.startsWith('account_deletion_')))expect(await one('SELECT md5(pg_get_functiondef(to_regprocedure($1))) hash',[f.signature])).toEqual({hash:f.md5});
}
async function late(body:string){await db.exec(`CREATE FUNCTION fixture_late_115()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.version='20261019115000' THEN ${body} END IF;RETURN NEW;END$$;CREATE TRIGGER fixture_late_115 AFTER INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION fixture_late_115();`);}
afterEach(async()=>db?.close());
it('whole atomic115 preserves all71 prior relations including nonempty114 registry and signatures, exact15 ledger and five reviewed bodies',async()=>{
 await setup();const m=JSON.parse(await read('manifest.json')),batch=await read('production-batch.sql');expect(sha(batch)).toBe(m.batchSha256);expect(m.priorMigrations).toHaveLength(15);expect(m.preservedTables).toHaveLength(71);expect(m.dependencies).toHaveLength(15);expect(m.expectedChangedFunctions).toHaveLength(5);expect(m.expectedTables).toHaveLength(6);expect(m.expectedPolicies).toHaveLength(6);
 expect(Object.values(await one(await read('preflight.sql'))).every(v=>v===true)).toBe(true);await db.exec(batch);expect(Object.values(await one(await read('postcheck.sql'))).every(v=>v===true)).toBe(true);
 expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:16});
 expect(await one('SELECT document_html,document_hash FROM document_signatures')).toEqual({document_html:'Original signed HTML',document_hash:'original-preserved-hash'});
 expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
 expect(await one('SELECT status,revision::int revision FROM uc_identification_records WHERE id=$1',[oldRecord])).toEqual({status:'verified',revision:1});
 expect(await one('SELECT status,photo_url FROM video_identifications WHERE id=$1',[oldVideo])).toEqual({status:'verified',photo_url:'https://invalid.example/retained-legacy.jpg'});
 for(const table of tables)expect(await one(`SELECT count(*)::int n FROM ${table}`)).toEqual({n:0});
 for(const item of m.migrations){const source=(await readFile(new URL('../../migrations/'+item.file,import.meta.url),'utf8')).replace(/\r\n/g,'\n');expect(sha(source)).toBe(item.sourceSha256);expect((await one('SELECT statements[1] source FROM supabase_migrations.schema_migrations WHERE version=$1',[item.version])).source).toBe(source);}
 expect(sha(await readFile(new URL('../../../'+m.previousReleaseManifest.path,import.meta.url),'utf8'))).toBe(m.previousReleaseManifest.sourceSha256);
 expect(sha(await readFile(new URL('../../../'+m.sourceAnchors.path,import.meta.url),'utf8'))).toBe(m.sourceAnchors.sourceSha256);
 expect(m.previousReleaseCompatibility.reviewedChanges).toHaveLength(5);
 await expect(db.exec(batch)).rejects.toThrow(/preflight failed/);await db.exec('ROLLBACK');
},30000);
it('whole115 normalizes arbitrary pre-DDL default grants only on the new6/49 and preserves global defaults plus old table/function grants',async()=>{
 await setup();await db.exec(`CREATE ROLE fixture_default_grantee NOLOGIN;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT ON TABLES TO fixture_default_grantee;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO fixture_default_grantee;
 GRANT SELECT(user_id) ON profiles TO fixture_default_grantee;
 GRANT EXECUTE ON FUNCTION uc_identification_actor_allowed(uuid,boolean) TO fixture_default_grantee;`);
 const defaultQuery=defaultAclHashSql;
 const oldQuery="SELECT jsonb_build_object('table_owner',pg_get_userbyid(c.relowner),'table_acl',c.relacl::text,'column_acl',a.attacl::text,'function_owner',pg_get_userbyid(p.proowner),'function_acl',p.proacl::text)proof FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='user_id' CROSS JOIN pg_proc p WHERE c.oid='profiles'::regclass AND p.oid='uc_identification_actor_allowed(uuid,boolean)'::regprocedure";
 const defaultsBefore=await one(defaultQuery),oldBefore=await one(oldQuery);
 expect((await one("SELECT has_any_column_privilege('fixture_default_grantee','profiles','SELECT')ok")).ok).toBe(true);
 expect(Object.values(await one(await read('preflight.sql'))).every(v=>v===true)).toBe(true);
 await db.exec(await read('production-batch.sql'));
 expect(Object.values(await one(await read('postcheck.sql'))).every(v=>v===true)).toBe(true);
 expect(await one(defaultQuery)).toEqual(defaultsBefore);expect(await one(oldQuery)).toEqual(oldBefore);
 for(const table of tables)expect(await one(`SELECT has_table_privilege('fixture_default_grantee','public.${table}','SELECT,INSERT,UPDATE,DELETE')allowed,has_any_column_privilege('fixture_default_grantee','public.${table}','SELECT,INSERT,UPDATE')column_allowed`)).toEqual({allowed:false,column_allowed:false});
 const manifest=JSON.parse(await read('manifest.json'));expect(manifest.expectedFunctions).toHaveLength(49);
 for(const f of manifest.expectedFunctions)expect((await one("SELECT has_function_privilege('fixture_default_grantee',to_regprocedure($1),'EXECUTE')allowed",['public.'+f.signature])).allowed).toBe(false);
 expect((await one("SELECT has_function_privilege('fixture_default_grantee','uc_identification_actor_allowed(uuid,boolean)','EXECUTE')allowed")).allowed).toBe(true);
 expect((await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).n).toBe(16);
},30000);
it('rejected final ledger insertion rolls back six tables, private bucket, guards and all five old account bodies',async()=>{await setup();await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CHECK(version<>'20261019115000')");await expect(db.exec(await read('production-batch.sql'))).rejects.toThrow(/check constraint/);await rolledBack();},30000);
it('altered embedded115 source is rejected before DDL',async()=>{await setup();await expect(db.exec((await read('production-batch.sql')).replace('-- UC012: exact bound personal case.','-- FORGED115: exact bound personal case.'))).rejects.toThrow(/Source hash mismatch/);await rolledBack();},30000);
it('missing114 ledger rejects before private DDL',async()=>{
 await setup();await db.exec("DELETE FROM supabase_migrations.schema_migrations WHERE version='20261019114000'");await expect(db.exec(await read('production-batch.sql'))).rejects.toThrow(/exact_prior_ledger|exact_previous_release/);await db.exec('ROLLBACK');for(const table of tables)expect((await one(`SELECT to_regclass('public.${table}') IS NULL absent`)).absent).toBe(true);
},30000);
it('altered real canonical actor dependency is rejected before private bucket/table DDL',async()=>{
 await setup();await db.exec('CREATE OR REPLACE FUNCTION uc_identification_actor_allowed(p_actor uuid,p_write boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT true$$');
 await expect(db.exec(await read('production-batch.sql'))).rejects.toThrow(/exact_authority_and_erasure_dependencies/);await rolledBack();
},30000);
it.each([
 ['column',"ALTER TABLE video_identifications ADD COLUMN forged_metadata text",/Historical relation metadata/],
 ['table ACL',"REVOKE UPDATE ON video_identifications FROM authenticated",/Historical relation metadata/],
 ['column ACL',"GRANT SELECT(photo_url) ON video_identifications TO anon",/Historical relation metadata/],
 ['NOT NULL',"ALTER TABLE video_identifications ALTER COLUMN user_id DROP NOT NULL",/Historical relation metadata/],
 ['index',"CREATE INDEX fixture_forged_identity_index ON video_identifications(photo_url)",/Historical relation metadata/],
 ['owner',"ALTER TABLE video_identifications OWNER TO anon",/Historical relation metadata/],
 ['RLS',"ALTER TABLE video_identifications DISABLE ROW LEVEL SECURITY",/Historical relation metadata/],
 ['default',"ALTER TABLE video_identifications ALTER COLUMN status SET DEFAULT 'verified'",/Historical relation metadata/],
 ['historical row',"UPDATE organizations SET name='forged'",/Historical data/],
 ['legacy identity row',"ALTER TABLE video_identifications DISABLE TRIGGER uc_identification_projection_guard;UPDATE video_identifications SET photo_url='https://invalid.example/forged';ALTER TABLE video_identifications ENABLE TRIGGER uc_identification_projection_guard",/Historical data/],
 ['prior114 registry row',"UPDATE uc_identification_records SET status='rejected'",/Historical data/],
 ['old bucket',"UPDATE storage.buckets SET public=false WHERE id='avatars'",/Historical data/],
 ['extra bucket',"INSERT INTO storage.buckets(id,name,public)VALUES('forged','forged',false)",/Historical data/],
 ['private bucket',"UPDATE storage.buckets SET public=true WHERE id='admission-case-evidence'",/postcheck failed/],
 ['private bucket MIME',"UPDATE storage.buckets SET allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png','text/html'] WHERE id='admission-case-evidence'",/postcheck failed/],
 ['private column ACL',"GRANT SELECT(user_id) ON uc_admission_cases TO authenticated",/postcheck failed/],
 ['private table owner',"ALTER TABLE uc_admission_cases OWNER TO fixture_bystander",/postcheck failed/],
 ['extra relation',"CREATE TABLE public.fixture_unreviewed_relation(id uuid)",/Unreviewed additional relation/],
 ['extra policy',"CREATE POLICY fixture_unreviewed ON video_identifications FOR SELECT TO anon USING(true)",/Unreviewed additional policy/],
 ['private backfill',"INSERT INTO uc_admission_cases(organization_id,user_id,group_id,enrollment_id,course_id,program_ref,program_title,program_type,revision)VALUES('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000883','e0000000-0000-4000-8000-000000000884','e0000000-0000-4000-8000-000000000885','{}','Forged case','dpo_upskilling',1)",/Unexpected prospective admission backfill/],
 ['unchanged function ACL',"REVOKE EXECUTE ON FUNCTION save_student_frdo_data(uuid,uuid,jsonb) FROM authenticated",/Unreviewed existing function or ACL/],
 ['reviewed function ACL',"REVOKE EXECUTE ON FUNCTION account_deletion_files(uuid) FROM service_role",/Unreviewed existing function or ACL/],
 ['reviewed body',"CREATE OR REPLACE FUNCTION account_deletion_files(p_user_id uuid)RETURNS jsonb LANGUAGE sql AS $late$SELECT '[]'::jsonb$late$",/postcheck failed/],
 ['underlying authority body',"CREATE OR REPLACE FUNCTION uc_identification_actor_allowed(p_actor uuid,p_write boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $late$SELECT true$late$",/postcheck failed/],
 ['new function ACL other role',"GRANT EXECUTE ON FUNCTION uc_admission_error(text) TO fixture_bystander",/postcheck failed/],
 ['new function owner',"ALTER FUNCTION uc_admission_error(text) OWNER TO fixture_bystander",/postcheck failed/],
 ['cron',"UPDATE cron.job SET active=false WHERE jobid=2",/Cron metadata changed/],
 ['default ACL',"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO fixture_bystander",/Default ACL metadata changed/],
 ['extra old trigger',"CREATE TRIGGER fixture_unreviewed BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION fixture_late_115()",/Unreviewed additional trigger/],
 ['extra function',"CREATE FUNCTION public.fixture_unreviewed()RETURNS integer LANGUAGE sql SECURITY DEFINER AS $late$SELECT 1$late$",/Unreviewed additional function/],
] as const)('late %s drift rolls back the entire115 release',async(_label,sql,match)=>{await setup();await late(sql+';');await expect(db.exec(await read('production-batch.sql'))).rejects.toThrow(match);await rolledBack();},30000);
