// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {afterEach,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {createUcReleaseFixture,syntheticCleanupCommand} from '../../functions/_shared/uc-release.fixture';
const folder=new URL('../../../docs/releases/sintagma-production/uc-document-foundation-20261018/',import.meta.url);
const read=(name:string)=>readFile(new URL(name,folder),'utf8');
const digest=(s:string)=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
const md5=(s:string)=>createHash('md5').update(s.replaceAll('\r\n','\n')).digest('hex');
const productionCommandHash='954edfdd26f6b685ed3d0977f26bf5e7';
// The production command contains a credential and is never read into tests.
// Only its opaque environment hash is substituted; all executable SQL is kept.
const fixtureSql=async(sql:string)=>{
 const manifest=JSON.parse(await read('release-manifest.json'));
 const scheduler=manifest.migrations.find((m:any)=>m.version==='20261018103000');
 const original=await readFile(new URL(`../../migrations/${scheduler.file}`,import.meta.url),'utf8');
 const source=original.replaceAll(productionCommandHash,md5(syntheticCleanupCommand));
 const executable=source.replace(/^BEGIN ISOLATION LEVEL REPEATABLE READ;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');
 return sql.replaceAll(productionCommandHash,md5(syntheticCleanupCommand)).replaceAll(scheduler.sourceMd5,md5(source)).replaceAll(scheduler.executableMd5,md5(executable));
};
let db:PGlite;
afterEach(async()=>{await db?.close();});
const one=async(sql:string)=>(await db.query<any>(sql)).rows[0];
async function rolledBack(){
 await db.exec('ROLLBACK');
 expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:0});
 expect(await one("SELECT to_regclass('public.org_document_write_tokens') IS NULL absent")).toEqual({absent:true});
 expect(await one("SELECT to_regprocedure('public.uc_document_org_access(uuid,boolean)') IS NULL absent")).toEqual({absent:true});
 expect(await one("SELECT to_regprocedure('public.uc_finalize_signature(text,text,jsonb,text,uuid,boolean,text,text,text,text,text,text,text)') IS NULL absent")).toEqual({absent:true});
 expect(await one("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND column_name IN('signed_source_hash','document_revision')")).toEqual({n:0});
 expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
 expect(await one('SELECT document_html,document_hash FROM document_signatures')).toEqual({document_html:'Original signed HTML',document_hash:'original-preserved-hash'});
 expect(await one("SELECT active FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily'")).toEqual({active:true});
}
describe('UC four-migration release; only opaque cron command hash adapted for synthetic environment',()=>{
 it('applies the actual full batch, preserves history, records exact sources, and refuses replay',async()=>{
  db=await createUcReleaseFixture();
  const manifest=JSON.parse(await read('release-manifest.json')),batch=await read('release-transaction.sql');
  expect(digest(batch)).toBe(manifest.batchSha256);expect(manifest.migrationCount).toBe(4);
  const before=await db.query(await fixtureSql(await read('preflight.sql')));expect(Object.values(before.rows[0]).every(v=>v===true)).toBe(true);
  await db.exec(await fixtureSql(batch));
  expect(Object.values((await db.query(await fixtureSql(await read('postcheck.sql')))).rows[0]).every(v=>v===true)).toBe(true);
  for(const item of manifest.migrations){
   const source=await readFile(new URL(`../../migrations/${item.file}`,import.meta.url),'utf8');
   expect(digest(source)).toBe(item.sourceSha256);
   expect((await db.query<any>('SELECT statements[1] source FROM supabase_migrations.schema_migrations WHERE version=$1',[item.version])).rows[0].source).toBe(item.version==='20261018103000'?source.replaceAll(productionCommandHash,md5(syntheticCleanupCommand)):source);
  }
  // This already-deployed release is immutable. Its companion Edge/config may
  // evolve in later releases, whose own suites attest the current source graph.
  expect(digest(await read('release-manifest.json'))).toBe('7d44b53d832d5c0631b9b036b9724eed4b6b8f53dd3e3aaf5cac648f0cc95074');
  expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
  expect(await one('SELECT file_url,document_revision,current_version_id FROM org_documents')).toEqual({file_url:'legacy/original.pdf',document_revision:0,current_version_id:null});
  expect(await one('SELECT count(*)::int n FROM org_document_versions')).toEqual({n:0});
  expect(await one("SELECT active,command FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily'")).toEqual({active:false,command:syntheticCleanupCommand});
  expect(await one("SELECT active,command FROM cron.job WHERE jobname='unrelated-job'")).toEqual({active:true,command:'SELECT 1'});
  await expect(db.exec(await fixtureSql(batch))).rejects.toThrow(/UC release preflight failed/);await db.exec('ROLLBACK');
  expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:4});
 },30000);
 it('rolls back all four migrations, cleanup pause and ledger rows when the final ledger insert fails',async()=>{
  db=await createUcReleaseFixture();await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CHECK(version<>'20261018103000')");
  await expect(db.exec(await fixtureSql(await read('release-transaction.sql')))).rejects.toThrow(/check constraint/);await rolledBack();
 },30000);
 it('rejects unreviewed signature policy drift before changes',async()=>{
  db=await createUcReleaseFixture();await db.exec('CREATE POLICY unknown_bypass ON document_signatures FOR ALL USING(true) WITH CHECK(true)');
  await expect(db.exec(await fixtureSql(await read('release-transaction.sql')))).rejects.toThrow(/UC release preflight failed/);await rolledBack();
 },30000);
 it('rejects modified embedded source without touching rows',async()=>{
  db=await createUcReleaseFixture();const batch=(await read('release-transaction.sql')).replace('Permissions only; no document rows','Tampered source; no document rows');
  await expect(db.exec(await fixtureSql(batch))).rejects.toThrow(/Source hash mismatch/);await rolledBack();
 },30000);
 it('rejects the unmodified production hash in a synthetic environment without exposing any command',async()=>{
  db=await createUcReleaseFixture();await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/cleanup_job_reviewed/);await rolledBack();
 },30000);
});
