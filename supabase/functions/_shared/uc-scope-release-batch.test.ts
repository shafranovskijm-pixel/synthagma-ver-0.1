// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {afterEach,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {createUcGorelDraftFixture} from './uc-gorel-draft.fixture';
const folder=new URL('../../../docs/releases/sintagma-production/uc-document-scope-20261018/',import.meta.url);
const read=async(name:string)=>(await readFile(new URL(name,folder),'utf8')).replaceAll('\r\n','\n');
const digest=(s:string,a='sha256')=>createHash(a).update(s.replaceAll('\r\n','\n')).digest('hex');
const productionHash='2d7b7e801492efbdf6bfac7f29731273';
const syntheticCommand="SELECT 'https://fixture.invalid/functions/v1/process-document-expiry-reminders synthetic-no-credential'";
let db:PGlite;
const one=async(sql:string)=>(await db.query<any>(sql)).rows[0];
const fixtureSql=async(sql:string)=>{
 const manifest=JSON.parse(await read('release-manifest.json')),scheduler=manifest.migrations.find((m:any)=>m.version==='20261018107000');
 const original=await readFile(new URL(`../../migrations/${scheduler.file}`,import.meta.url),'utf8');
 const source=original.replaceAll(productionHash,digest(syntheticCommand,'md5'));
 const executable=source.replace(/^BEGIN ISOLATION LEVEL REPEATABLE READ;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');
 return sql.replaceAll(productionHash,digest(syntheticCommand,'md5')).replaceAll(scheduler.sourceMd5,digest(source,'md5')).replaceAll(scheduler.executableMd5,digest(executable,'md5'));
};
async function setup(){
 db=await createUcGorelDraftFixture(false,false);
 const foundation=JSON.parse(await readFile(new URL('../../../docs/releases/sintagma-production/uc-document-foundation-20261018/release-manifest.json',import.meta.url),'utf8'));
 for(const m of foundation.migrations)await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES($1,$2,$3)',[m.version,m.name,[await readFile(new URL('../../migrations/'+m.file,import.meta.url),'utf8')]]);
 await db.exec("UPDATE cron.job SET active=false WHERE jobname='purge-recycle-bin-storage-daily'");
 await db.query('INSERT INTO cron.job(jobid,jobname,schedule,command,active)VALUES(3,$1,$2,$3,true)',['process-document-expiry-reminders-daily','0 6 * * *',syntheticCommand]);
}
async function rolledBack(){
 await db.exec('ROLLBACK');expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:4});
 expect(await one("SELECT to_regclass('org_staff_document_groups') IS NULL assignments_absent,to_regclass('uc_goreltech_document_stages') IS NULL stages_absent")).toEqual({assignments_absent:true,stages_absent:true});
 expect(await one("SELECT active FROM cron.job WHERE jobname='process-document-expiry-reminders-daily'")).toEqual({active:true});
 expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
 expect(await one('SELECT document_html,document_hash FROM document_signatures')).toEqual({document_html:'Original signed HTML',document_hash:'original-preserved-hash'});
}
afterEach(async()=>db?.close());
it('runs the complete actual104–107 batch and verifies exact sources/dependencies/preservation/replay denial',async()=>{
 await setup();const manifest=JSON.parse(await read('release-manifest.json')),batch=await read('release-transaction.sql');
 expect(digest(batch)).toBe(manifest.batchSha256);expect(manifest.migrationCount).toBe(4);
 expect(Object.values((await db.query(await fixtureSql(await read('preflight.sql')))).rows[0]).every(v=>v===true)).toBe(true);
 await db.exec(await fixtureSql(batch));
 expect(Object.values((await db.query(await fixtureSql(await read('postcheck.sql')))).rows[0]).every(v=>v===true)).toBe(true);
 for(const m of manifest.migrations){const source=(await readFile(new URL('../../migrations/'+m.file,import.meta.url),'utf8')).replaceAll('\r\n','\n');expect(digest(source)).toBe(m.sourceSha256);
  expect((await db.query<any>('SELECT statements[1] source FROM supabase_migrations.schema_migrations WHERE version=$1',[m.version])).rows[0].source).toBe(m.version==='20261018107000'?source.replaceAll(productionHash,digest(syntheticCommand,'md5')):source);}
 // This installed release retains its frozen dependency/config attestation.
 // Later release suites attest the evolving runtime graph and config instead.
 expect(digest(await read('release-manifest.json'))).toBe('b86e277a1deb38dad7fb140508685c2d56459d1b5a0b297eef6bc651eb4b43c8');
 expect(await one('SELECT count(*)::int n FROM org_staff_document_groups')).toEqual({n:0});
 expect(await one('SELECT file_url,document_revision FROM org_documents')).toEqual({file_url:'legacy/original.pdf',document_revision:0});
 expect(await one("SELECT active FROM cron.job WHERE jobname='unrelated-job'")).toEqual({active:true});
 await expect(db.exec(await fixtureSql(batch))).rejects.toThrow(/preflight failed/);await db.exec('ROLLBACK');
 expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:8});
},30000);
it('rolls back all four migrations and cron pause on the final ledger insert failure',async()=>{
 await setup();await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CHECK(version<>'20261018107000')");
 await expect(db.exec(await fixtureSql(await read('release-transaction.sql')))).rejects.toThrow(/check constraint/);await rolledBack();
},30000);
it('rejects a security-definer effective membership view before any DDL',async()=>{
 await setup();await db.exec('ALTER VIEW student_group_profiles_effective SET(security_invoker=false)');
 await expect(db.exec(await fixtureSql(await read('release-transaction.sql')))).rejects.toThrow(/membership_views_invoker/);await rolledBack();
},30000);
it('rolls back on unreviewed org_contracts policy drift',async()=>{
 await setup();await db.exec('CREATE POLICY unknown_contract_bypass ON org_contracts FOR SELECT USING(true)');
 await expect(db.exec(await fixtureSql(await read('release-transaction.sql')))).rejects.toThrow(/unreviewed org contracts/);await rolledBack();
},30000);
it('rejects the production cron hash in the synthetic fixture and rejects modified embedded SQL',async()=>{
 await setup();await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/reminder_job_reviewed/);await rolledBack();
 const tampered=(await read('release-transaction.sql')).replace('No existing documents, receipts, or stored permissions are rewritten.','Tampered migration comment.');
 await expect(db.exec(await fixtureSql(tampered))).rejects.toThrow(/Source hash mismatch/);await rolledBack();
},30000);
it('uses only the supported cron API with a non-superuser deployment role and SELECT-only cron table',async()=>{
 await setup();await db.exec(`CREATE ROLE uc_scope_deployer;GRANT USAGE,CREATE ON SCHEMA public,storage,auth,supabase_migrations TO uc_scope_deployer;
 DO $$DECLARE r record;BEGIN FOR r IN SELECT c.oid::regclass obj,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage','supabase_migrations') AND c.relkind IN('r','v','S') LOOP
 EXECUTE format('ALTER %s %s OWNER TO uc_scope_deployer',CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,r.obj);END LOOP;
 FOR r IN SELECT p.oid::regprocedure obj FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','storage') LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO uc_scope_deployer',r.obj);END LOOP;END$$;
 GRANT USAGE ON SCHEMA cron TO uc_scope_deployer;GRANT SELECT ON cron.job TO uc_scope_deployer;
 UPDATE cron.job SET username='uc_scope_deployer' WHERE jobname='process-document-expiry-reminders-daily';SET ROLE uc_scope_deployer;`);
 expect(await one("SELECT has_table_privilege(current_user,'cron.job','UPDATE') allowed")).toEqual({allowed:false});
 await db.exec(await fixtureSql(await read('release-transaction.sql')));
 expect(Object.values((await db.query(await fixtureSql(await read('postcheck.sql')))).rows[0]).every(v=>v===true)).toBe(true);
},30000);
