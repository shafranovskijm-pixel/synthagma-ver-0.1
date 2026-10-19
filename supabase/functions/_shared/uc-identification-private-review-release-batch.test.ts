// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {afterEach,it,expect} from 'vitest';
import {createUcIdentificationFixture} from './uc-identification-private-review.fixture';
const folder=new URL('../../../docs/releases/sintagma-production/uc-identification-private-review-20261019/',import.meta.url);
const read=async(p:string)=>(await readFile(new URL(p,folder),'utf8')).replace(/\r\n/g,'\n');
const sha=(s:string)=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
let db:any;
const one=async(sql:string,args:any[]=[]) => (await db.query(sql,args)).rows[0];
async function setup(){db=await createUcIdentificationFixture(false);await db.exec("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false);INSERT INTO video_identifications(id,user_id,organization_id,status,photo_url,verified_by,verified_at)VALUES('e0000000-0000-4000-8000-000000000881','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000100','verified','https://invalid.example/retained-legacy.jpg','00000000-0000-4000-8000-000000000001','2020-01-01T00:00:00Z')");}
async function rolledBack(){
 await db.exec('ROLLBACK');expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:14});
 expect(await one("SELECT to_regclass('uc_identification_records') IS NULL absent,to_regprocedure('prepare_own_identification_photo(uuid,uuid,uuid)') IS NULL helper_absent")).toEqual({absent:true,helper_absent:true});
 expect(await one("SELECT count(*)::int n FROM storage.buckets WHERE id='student-identification-media'")).toEqual({n:0});
 expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
 expect(await one("SELECT status,photo_url FROM video_identifications WHERE id='e0000000-0000-4000-8000-000000000881'")).toEqual({status:'verified',photo_url:'https://invalid.example/retained-legacy.jpg'});
 expect(await one("SELECT md5(pg_get_functiondef('save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)'::regprocedure)) hash")).toEqual({hash:'ef4299140c264616b0854e95fea0af2a'});
 expect(await one("SELECT md5(pg_get_functiondef('account_deletion_erase_data(uuid,text)'::regprocedure)) hash")).toEqual({hash:'d0279bdfbfc4d97a1f0b32c47cc475ab'});
}
async function late(body:string){await db.exec(`CREATE FUNCTION fixture_late_114()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.version='20261019114000' THEN ${body} END IF;RETURN NEW;END$$;CREATE TRIGGER fixture_late_114 AFTER INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION fixture_late_114();`);}
afterEach(async()=>db?.close());
it('whole atomic114 preserves all66 old relation metadata/rows/ACLs, ledger, counters and signatures',async()=>{
 await setup();const m=JSON.parse(await read('manifest.json'));const batch=await read('production-batch.sql');expect(sha(batch)).toBe(m.batchSha256);expect(m.priorMigrations).toHaveLength(14);expect(m.preservedTables).toHaveLength(66);expect(m.expectedChangedFunctions).toHaveLength(5);expect(m.expectedPolicies).toHaveLength(12);
 expect(Object.values(await one(await read('preflight.sql'))).every(v=>v===true)).toBe(true);await db.exec(batch);expect(Object.values(await one(await read('postcheck.sql'))).every(v=>v===true)).toBe(true);
 expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:15});
 expect(await one('SELECT document_html,document_hash FROM document_signatures')).toEqual({document_html:'Original signed HTML',document_hash:'original-preserved-hash'});
 expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
 for(const table of ['uc_identification_records','uc_identification_sources','uc_identification_events','uc_identification_requests','uc_identification_write_contexts'])expect(await one(`SELECT count(*)::int n FROM ${table}`)).toEqual({n:0});
 for(const item of m.migrations){const source=(await readFile(new URL('../../migrations/'+item.file,import.meta.url),'utf8')).replace(/\r\n/g,'\n');expect(sha(source)).toBe(item.sourceSha256);expect((await one('SELECT statements[1] source FROM supabase_migrations.schema_migrations WHERE version=$1',[item.version])).source).toBe(source);}
 expect(sha(await readFile(new URL('../../../'+m.previousReleaseManifest.path,import.meta.url),'utf8'))).toBe(m.previousReleaseManifest.sourceSha256);
 await expect(db.exec(batch)).rejects.toThrow(/preflight failed/);await db.exec('ROLLBACK');
},30000);
it('rejected final ledger insertion rolls back private bucket, five tables, guards and five old bodies',async()=>{await setup();await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CHECK(version<>'20261019114000')");await expect(db.exec(await read('production-batch.sql'))).rejects.toThrow(/check constraint/);await rolledBack();},30000);
it('altered embedded source is rejected before DDL',async()=>{await setup();await expect(db.exec((await read('production-batch.sql')).replace('Prospective private identification photographs','Forged private identification photographs'))).rejects.toThrow(/Source hash mismatch/);await rolledBack();},30000);
it('missing113 ledger or altered current authority rejects before DDL',async()=>{
 await setup();await db.exec("DELETE FROM supabase_migrations.schema_migrations WHERE version='20261018113000'");await expect(db.exec(await read('production-batch.sql'))).rejects.toThrow(/exact_prior_ledger|exact_previous_release/);await db.exec('ROLLBACK');expect((await one("SELECT to_regclass('uc_identification_records') IS NULL absent")).absent).toBe(true);
},30000);
it('altered underlying canonical target helper is rejected before any private bucket or table DDL',async()=>{
 await setup();await db.exec('CREATE OR REPLACE FUNCTION is_student_profile(_target_user_id uuid,_org_id uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT true$$');
 await expect(db.exec(await read('production-batch.sql'))).rejects.toThrow(/exact_access_and_issuance_dependencies/);await rolledBack();
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
 ['old bucket',"UPDATE storage.buckets SET public=false WHERE id='avatars'",/Historical data/],
 ['extra bucket',"INSERT INTO storage.buckets(id,name,public)VALUES('forged','forged',false)",/Historical data/],
 ['private bucket',"UPDATE storage.buckets SET public=true WHERE id='student-identification-media'",/postcheck failed/],
 ['private column ACL',"GRANT SELECT(user_id) ON uc_identification_records TO authenticated",/postcheck failed/],
 ['extra policy',"CREATE POLICY fixture_unreviewed ON video_identifications FOR SELECT TO anon USING(true)",/Unreviewed additional policy/],
 ['private backfill',"INSERT INTO uc_identification_records(user_id,organization_id,scope_kind,projection_owned,origin,source_kind,status)VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000100','subject',true,'prospective','manual_staff_claim','verified')",/Unexpected prospective identification backfill/],
 ['unchanged function ACL',"REVOKE EXECUTE ON FUNCTION save_student_frdo_data(uuid,uuid,jsonb) FROM authenticated",/Unreviewed existing function or ACL/],
 ['reviewed function ACL',"REVOKE EXECUTE ON FUNCTION save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean) FROM service_role",/Unreviewed existing function or ACL/],
 ['reviewed body',"CREATE OR REPLACE FUNCTION account_deletion_files(p_user_id uuid)RETURNS jsonb LANGUAGE sql AS $late$SELECT '[]'::jsonb$late$",/postcheck failed/],
 ['underlying authority body',"CREATE OR REPLACE FUNCTION is_student_profile(_target_user_id uuid,_org_id uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $late$SELECT true$late$",/postcheck failed/],
 ['extra old trigger',"CREATE TRIGGER fixture_unreviewed BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION fixture_late_114()",/Unreviewed additional trigger/],
 ['extra function',"CREATE FUNCTION public.fixture_unreviewed()RETURNS integer LANGUAGE sql SECURITY DEFINER AS $late$SELECT 1$late$",/Unreviewed additional function/],
] as const)('late %s drift rolls back the entire114 release',async(_label,sql,match)=>{await setup();await late(sql+';');await expect(db.exec(await read('production-batch.sql'))).rejects.toThrow(match);await rolledBack();},30000);
