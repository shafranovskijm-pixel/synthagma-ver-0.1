// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {afterEach,it,expect} from 'vitest';
import {createUcStudentFrdoWriteFixture} from './uc-student-frdo-write.fixture';
const folder=new URL('../../../docs/releases/sintagma-production/uc-student-frdo-write-20261019/',import.meta.url);
const read=async(p:string)=>(await readFile(new URL(p,folder),'utf8')).replace(/\r\n/g,'\n');
const sha=(s:string)=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
let db:any;
const one=async(sql:string,args:any[]=[]) => (await db.query(sql,args)).rows[0];
async function setup(){
 db=await createUcStudentFrdoWriteFixture(false);
 await db.exec("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false);INSERT INTO student_frdo_data(user_id,organization_id,last_name,passport_number)VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000100','Historical synthetic name','legacy-synthetic-passport');");
}
async function rolledBack(){
 await db.exec('ROLLBACK');expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:12});
 expect(await one("SELECT to_regclass('uc_student_frdo_write_contexts') IS NULL absent,to_regprocedure('can_write_student_frdo_data(uuid,uuid)') IS NULL helper_absent")).toEqual({absent:true,helper_absent:true});
 expect(await one('SELECT last_name,passport_number FROM student_frdo_data')).toEqual({last_name:'Historical synthetic name',passport_number:'legacy-synthetic-passport'});
 expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
 expect(await one("SELECT md5(pg_get_functiondef('auto_create_education_document()'::regprocedure)) hash")).toEqual({hash:'2d8d598ea6a1b372292c04a688f52221'});
}
async function late(body:string){await db.exec(`CREATE FUNCTION fixture_late_112()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.version='20261018112000' THEN ${body} END IF;RETURN NEW;END$$;CREATE TRIGGER fixture_late_112 AFTER INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION fixture_late_112();`);}
afterEach(async()=>db?.close());
it('applies exact112 after100–111 and preserves populated legacy FRDO, signatures, all63 old relation witnesses and counters',async()=>{
 await setup();const manifest=JSON.parse(await read('release-manifest.json'));const batch=await read('release-transaction.sql');expect(sha(batch)).toBe(manifest.batchSha256);expect(manifest.priorMigrations).toHaveLength(12);expect(manifest.preservedTables).toHaveLength(63);
 expect(Object.values(await one(await read('preflight.sql'))).every(v=>v===true)).toBe(true);await db.exec(batch);expect(Object.values(await one(await read('postcheck.sql'))).every(v=>v===true)).toBe(true);
 expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:13});expect(await one('SELECT last_name,passport_number FROM student_frdo_data')).toEqual({last_name:'Historical synthetic name',passport_number:'legacy-synthetic-passport'});
 expect(await one('SELECT document_html,document_hash FROM document_signatures')).toEqual({document_html:'Original signed HTML',document_hash:'original-preserved-hash'});
 expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});expect(await one('SELECT count(*)::int n FROM uc_student_frdo_write_contexts')).toEqual({n:0});
 for(const m of manifest.migrations){const source=await readFile(new URL('../../migrations/'+m.file,import.meta.url),'utf8');expect(sha(source)).toBe(m.sourceSha256);expect((await one('SELECT statements[1] source FROM supabase_migrations.schema_migrations WHERE version=$1',[m.version])).source).toBe(source.replace(/\r\n/g,'\n'));}
 expect(sha(await readFile(new URL('../../../'+manifest.previousReleaseManifest.path,import.meta.url),'utf8'))).toBe(manifest.previousReleaseManifest.sourceSha256);
 await expect(db.exec(batch)).rejects.toThrow(/preflight failed/);await db.exec('ROLLBACK');
},30000);
it('rolls back every112 object when the final ledger entry is rejected',async()=>{await setup();await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CHECK(version<>'20261018112000')");await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/check constraint/);await rolledBack();},30000);
it('rejects altered embedded source before execution',async()=>{await setup();await expect(db.exec((await read('release-transaction.sql')).replace('FRDO write authority is separate','FRDO forged authority is separate'))).rejects.toThrow(/Source hash mismatch/);await rolledBack();},30000);
it('refuses an unreviewed FRDO approval column before DDL',async()=>{await setup();await db.exec('ALTER TABLE student_frdo_data ADD COLUMN identity_verified boolean DEFAULT false');await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_frdo_columns/);await rolledBack();},30000);
it('rejects altered current111 auto body and missing prior ledger before DDL',async()=>{
 await setup();await db.exec('CREATE OR REPLACE FUNCTION auto_create_education_document()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$');await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_access_and_issuance_dependencies/);await db.exec('ROLLBACK');
 await db.exec("DELETE FROM supabase_migrations.schema_migrations WHERE version='20261018111000'");await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_prior_ledger/);await db.exec('ROLLBACK');expect(await one("SELECT to_regclass('uc_student_frdo_write_contexts') IS NULL absent")).toEqual({absent:true});
},30000);
it.each([
 ['column',"ALTER TABLE student_frdo_data ADD COLUMN forged_metadata text",/Historical relation metadata/],
 ['table ACL',"REVOKE UPDATE ON student_frdo_data FROM authenticated",/Historical relation metadata/],
 ['column ACL',"GRANT SELECT(last_name) ON student_frdo_data TO anon",/Historical relation metadata/],
 ['NOT NULL',"ALTER TABLE student_frdo_data ALTER COLUMN user_id DROP NOT NULL",/Historical relation metadata/],
 ['index',"CREATE INDEX fixture_forged_frdo_index ON student_frdo_data(snils)",/Historical relation metadata/],
 ['owner',"ALTER TABLE student_frdo_data OWNER TO anon",/Historical relation metadata/],
 ['RLS',"ALTER TABLE student_frdo_data DISABLE ROW LEVEL SECURITY",/Historical relation metadata/],
 ['default',"ALTER TABLE student_frdo_data ALTER COLUMN first_name SET DEFAULT 'forged'",/Historical relation metadata/],
 ['historical row',"UPDATE organizations SET name='forged'",/Historical data/],
 ['private column ACL',"GRANT SELECT(kind) ON uc_student_frdo_write_contexts TO authenticated",/postcheck failed/],
 ['extra policy',"CREATE POLICY fixture_unreviewed ON student_frdo_data FOR SELECT TO anon USING(true)",/Unreviewed additional policy/],
 ['context backfill',"INSERT INTO uc_student_frdo_write_contexts(kind,organization_id,user_id)VALUES('profile_name_sync','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000001')",/Unexpected FRDO context backfill/],
 ['existing function ACL',"REVOKE EXECUTE ON FUNCTION save_student_frdo_data(uuid,uuid,jsonb) FROM authenticated",/Unreviewed existing function or ACL/],
 ['extra old-table trigger',"CREATE TRIGGER fixture_unreviewed BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION fixture_late_112()",/Unreviewed additional trigger/],
 ['extra definer function',"CREATE FUNCTION public.fixture_unreviewed()RETURNS integer LANGUAGE sql SECURITY DEFINER AS $late$SELECT 1$late$",/Unreviewed additional function/],
] as const)('rolls back late %s drift after ledger insertion',async(_label,sql,match)=>{await setup();await late(sql+';');await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(match);await rolledBack();},30000);
