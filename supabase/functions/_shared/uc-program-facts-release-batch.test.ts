// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {afterEach,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {createUcProgramFactsReleaseFixture} from './uc-program-facts-release.fixture';
const folder=new URL('../../../docs/releases/sintagma-production/uc-program-facts-20261018/',import.meta.url);
const norm=(s:string)=>s.replaceAll('\r\n','\n'),hash=(s:string,a='sha256')=>createHash(a).update(norm(s)).digest('hex');
const read=async(name:string)=>norm(await readFile(new URL(name,folder),'utf8'));
let db:PGlite;
const one=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
const org='00000000-0000-4000-8000-000000000100',owner='00000000-0000-4000-8000-000000000001';
const id=(n:number)=>'c0000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function setup(){
 db=await createUcProgramFactsReleaseFixture();
 const profile=(await one('SELECT uc_empty_education_profile() p')).p;
 await db.exec("SELECT set_config('request.jwt.claim.sub','"+owner+"',false),set_config('request.jwt.claim.role','authenticated',false);SET ROLE authenticated");
 await db.query('SELECT save_organization_education_profile($1,0,$2,$3)',[org,JSON.stringify(profile),id(1)]);
 await db.query("INSERT INTO program_documents(id,organization_id,name,description,file_url)VALUES($1,$2,'Legacy programme','Historical declaration','legacy/unaltered.pdf')",[id(2),org]);
 const doc=id(3),request=id(4),path=org+'/versions/'+doc+'/'+request+'.pdf';
 await db.exec('RESET ROLE');await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('org-documents',$1,'{\"size\":42,\"etag\":\"immutable-witness\",\"mimetype\":\"application/pdf\"}')",[path]);
 await db.exec('SET ROLE authenticated');await db.query("INSERT INTO org_documents(id,organization_id,name,type,status)VALUES($1,$2,'Prior review file','program_approval','active')",[doc,org]);
 const version=(await one('SELECT commit_org_document_version($1,$2,$3,0,$4,NULL,$5) d',[doc,org,request,JSON.stringify({file_path:path,file_size:42,file_name:'Previous.pdf'}),JSON.stringify({status:'active'})])).d.version_id;
 await db.query('SELECT save_org_document_review_draft($1,$2,1,0,$3,$3,$4,$5)',[doc,version,owner,'[]',id(5)]);
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");
}
async function rolledBack(priorCount=11){
 await db.exec('ROLLBACK');expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:priorCount});
 expect(await one("SELECT to_regclass('program_fact_versions') IS NULL absent,to_regclass('education_document_program_sources') IS NULL issuance_absent")).toEqual({absent:true,issuance_absent:true});
 expect(await one("SELECT to_regprocedure('get_program_facts(uuid,uuid)') IS NULL absent")).toEqual({absent:true});
 expect(await one('SELECT count(*)::int n FROM organization_education_profile_history')).toEqual({n:1});expect(await one('SELECT count(*)::int n FROM org_document_reviews')).toEqual({n:1});
 expect(await one('SELECT name,description,file_url FROM program_documents WHERE id=$1',[id(2)])).toEqual({name:'Legacy programme',description:'Historical declaration',file_url:'legacy/unaltered.pdf'});
 expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
 expect(await one('SELECT document_html,document_hash FROM document_signatures')).toEqual({document_html:'Original signed HTML',document_hash:'original-preserved-hash'});
}
afterEach(async()=>db?.close());
it('runs one exact111 transaction after100-110 while preserving populated profiles, reviews and legacy programme metadata',async()=>{
 await setup();const manifest=JSON.parse(await read('release-manifest.json')),batch=await read('release-transaction.sql');expect(hash(batch)).toBe(manifest.batchSha256);expect(manifest.priorMigrations).toHaveLength(11);
 expect(Object.values(await one(await read('preflight.sql'))).every(v=>v===true)).toBe(true);await db.exec(batch);
 expect(Object.values(await one(await read('postcheck.sql'))).every(v=>v===true)).toBe(true);expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:12});
 for(const m of manifest.migrations){const source=norm(await readFile(new URL('../../migrations/'+m.file,import.meta.url),'utf8'));expect(hash(source)).toBe(m.sourceSha256);expect((await one('SELECT statements[1] source FROM supabase_migrations.schema_migrations WHERE version=$1',[m.version])).source).toBe(source);}
 for(const f of [...manifest.productFiles,manifest.previousReleaseManifest])expect(hash(await readFile(new URL('../../../'+f.path,import.meta.url),'utf8'))).toBe(f.sourceSha256);
 for(const t of manifest.expectedTables)expect(await one('SELECT count(*)::int n FROM '+t.table)).toEqual({n:0});
 expect(await one('SELECT count(*)::int n FROM org_document_review_events')).toEqual({n:1});expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
 await expect(db.exec(batch)).rejects.toThrow(/preflight failed/);await db.exec('ROLLBACK');
},30000);
it('a late ledger constraint failure rolls back all111 objects and retains eleven installed migrations',async()=>{
 await setup();await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CHECK(version<>'20261018111000')");await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/check constraint/);await rolledBack();
},30000);
it('rejects a changed embedded source before it can execute',async()=>{
 await setup();const batch=(await read('release-transaction.sql')).replace('separately reviewed programme facts','tampered programme facts');await expect(db.exec(batch)).rejects.toThrow(/Source hash mismatch/);await rolledBack();
},30000);
it('requires exact authority, original autoissuance body and every prior ledger entry before DDL',async()=>{
 await setup();await db.exec('CREATE OR REPLACE FUNCTION auto_create_education_document()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$');await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_access_and_issuance_dependencies/);await rolledBack();
 await db.exec("DELETE FROM supabase_migrations.schema_migrations WHERE version='20261018110000'");await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_prior_ledger/);await rolledBack(10);
},30000);
it('does not accept a changed immutable-storage boundary or unexpectedly public legacy programme bucket',async()=>{
 await setup();await db.exec("UPDATE storage.buckets SET public=true WHERE id='program-files'");await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_program_bucket_baseline/);await rolledBack();
 await db.exec("UPDATE storage.buckets SET public=false WHERE id='program-files';DROP POLICY uc_org_document_blob_no_delete ON storage.objects");await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_immutable_storage_boundary/);await rolledBack();
},30000);
it('rolls back late existing-row or scheduler side effects with the entire release',async()=>{
 await setup();await db.exec("CREATE FUNCTION synthetic_program_side_effect()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.version='20261018111000' THEN UPDATE program_documents SET description='Unexpected rewrite';END IF;RETURN NEW;END$$;CREATE TRIGGER synthetic_late_program AFTER INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION synthetic_program_side_effect()");
 await db.exec("SELECT set_config('request.jwt.claim.sub','"+owner+"',false),set_config('request.jwt.claim.role','authenticated',false)");
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/Historical data changed in public.program_documents/);await rolledBack();
 await db.exec("CREATE OR REPLACE FUNCTION synthetic_program_side_effect()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.version='20261018111000' THEN UPDATE cron.job SET active=NOT active WHERE jobid=2;END IF;RETURN NEW;END$$");await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/Cron metadata changed/);await rolledBack();
},30000);
it('only permits the two exact reviewed issuance replacements and preserves every prior function ACL',async()=>{
 await setup();await db.exec("CREATE FUNCTION synthetic_program_acl_side_effect()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.version='20261018111000' THEN GRANT EXECUTE ON FUNCTION auto_create_education_document() TO anon;END IF;RETURN NEW;END$$;CREATE TRIGGER synthetic_late_program_acl AFTER INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION synthetic_program_acl_side_effect()");
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/Unreviewed existing function or ACL changed/);await rolledBack();
},30000);
it.each([
 ['column/default',"ALTER TABLE public.program_documents ADD COLUMN unexpected_release_column text DEFAULT 'unreviewed'"],
 ['table grant','GRANT TRIGGER ON public.program_documents TO anon'],
 ['column grant','GRANT UPDATE(name) ON public.program_documents TO anon'],
 ['RLS','ALTER TABLE public.program_documents FORCE ROW LEVEL SECURITY'],
 ['index','CREATE INDEX synthetic_unreviewed_program_name ON public.program_documents(name)'],
 ['constraint',"ALTER TABLE public.program_documents ADD CONSTRAINT synthetic_unreviewed_name CHECK(length(name)<9999)"],
 ['owner','ALTER TABLE public.program_documents OWNER TO anon'],
 ['NOT NULL',"DO $drift$ BEGIN IF(SELECT attnotnull FROM pg_attribute WHERE attrelid='public.program_documents'::regclass AND attname='name') THEN ALTER TABLE public.program_documents ALTER COLUMN name DROP NOT NULL;ELSE ALTER TABLE public.program_documents ALTER COLUMN name SET NOT NULL;END IF;END $drift$"]
])('rolls back a late old-relation %s metadata change',async(_name,ddl)=>{
 await setup();await db.exec("CREATE FUNCTION synthetic_program_metadata_side_effect()RETURNS trigger LANGUAGE plpgsql AS $fn$BEGIN IF NEW.version='20261018111000' THEN EXECUTE '"+ddl.replaceAll("'","''")+"';END IF;RETURN NEW;END $fn$;CREATE TRIGGER synthetic_late_program_metadata AFTER INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION synthetic_program_metadata_side_effect()");
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/Historical relation metadata changed in public.program_documents/);await rolledBack();
},30000);
it.each([
 ['policy','CREATE POLICY synthetic_unreviewed_policy ON public.program_documents FOR SELECT TO anon USING(true)',/Unreviewed additional policy/],
 ['trigger','CREATE TRIGGER synthetic_unreviewed_trigger BEFORE UPDATE ON public.program_documents FOR EACH ROW EXECUTE FUNCTION uc_guard_program_navigation()',/Unreviewed additional trigger/]
])('rejects an additional unreviewed %s outside the exact new boundary',async(_name,ddl,error)=>{
 await setup();await db.exec("CREATE FUNCTION synthetic_program_boundary_side_effect()RETURNS trigger LANGUAGE plpgsql AS $fn$BEGIN IF NEW.version='20261018111000' THEN EXECUTE '"+String(ddl).replaceAll("'","''")+"';END IF;RETURN NEW;END $fn$;CREATE TRIGGER synthetic_late_program_boundary AFTER INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION synthetic_program_boundary_side_effect()");
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(error as RegExp);await rolledBack();
},30000);
it('portable postcheck detects NOT NULL, constraint, policy, function and trigger/grant drift',async()=>{
 await setup();await db.exec(await read('release-transaction.sql'));const post=await read('postcheck.sql');await db.exec('BEGIN');
 for(const [t,c] of [['program_fact_states','revision'],['program_fact_versions','facts'],['course_program_bindings','program_id'],['group_program_bindings','snapshot_hash'],['group_program_enrollment_snapshots','user_id'],['program_fact_events','action'],['program_fact_requests','payload'],['education_document_program_sources','snapshot']]){
  await db.exec('SAVEPOINT drift;ALTER TABLE '+t+' ALTER COLUMN '+c+' DROP NOT NULL');expect((await one(post)).exact_new_schema).toBe(false);await db.exec('ROLLBACK TO drift');expect((await one(post)).exact_new_schema).toBe(true);
 }
 await db.exec('SAVEPOINT drift;ALTER TABLE program_fact_versions DROP CONSTRAINT program_fact_versions_state_check');expect((await one(post)).exact_new_schema).toBe(false);await db.exec('ROLLBACK TO drift');
 await db.exec('SAVEPOINT drift;GRANT SELECT ON program_fact_requests TO authenticated');expect((await one(post)).private_rpc_state).toBe(false);await db.exec('ROLLBACK TO drift');
 await db.exec('SAVEPOINT drift;GRANT SELECT(payload) ON program_fact_requests TO authenticated');expect((await one(post)).private_rpc_state).toBe(false);expect((await one(post)).exact_new_schema).toBe(false);await db.exec('ROLLBACK TO drift');
 await db.exec('SAVEPOINT drift;DROP POLICY uc_program_legacy_no_update ON storage.objects');expect((await one(post)).exact_legacy_file_boundaries).toBe(false);await db.exec('ROLLBACK TO drift');
 await db.exec('SAVEPOINT drift;ALTER TABLE education_document_records DISABLE TRIGGER uc_program_issuance_guard');expect((await one(post)).exact_provenance_triggers).toBe(false);await db.exec('ROLLBACK TO drift');
 await db.exec('CREATE OR REPLACE FUNCTION auto_create_education_document()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$');expect((await one(post)).exact_issuance_functions).toBe(false);await db.exec('ROLLBACK');
},30000);
