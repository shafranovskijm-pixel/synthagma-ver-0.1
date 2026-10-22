// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {afterEach,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {createUcDocumentReviewReleaseFixture} from '../../functions/_shared/uc-document-review-release.fixture';
const folder=new URL('../../../docs/releases/sintagma-production/uc-document-review-20261018/',import.meta.url);
const norm=(s:string)=>s.replaceAll('\r\n','\n'),hash=(s:string,a='sha256')=>createHash(a).update(norm(s)).digest('hex');
const read=async(name:string)=>norm(await readFile(new URL(name,folder),'utf8'));
let db:PGlite;
const one=async(sql:string,args:any[]=[]) => (await db.query<any>(sql,args)).rows[0];
const org='00000000-0000-4000-8000-000000000100',owner='00000000-0000-4000-8000-000000000001';
async function setup(){
 db=await createUcDocumentReviewReleaseFixture();
 // Real previous public RPCs populate current/history tables before the new release.
 const profile=(await one('SELECT uc_empty_education_profile() p')).p;
 await db.exec("SELECT set_config('request.jwt.claim.sub','"+owner+"',false),set_config('request.jwt.claim.role','authenticated',false);SET ROLE authenticated");
 await db.query('SELECT save_organization_education_profile($1,0,$2,$3)',[org,JSON.stringify(profile),'b0000000-0000-4000-8000-000000000001']);
 await db.query('SELECT save_organization_document_applicability_decision($1,$2,0,1,$3,$4,$5,$6)',
  [org,'license','uc-requirements-2026-10-18-v1','applicable','Synthetic existing declaration','b0000000-0000-4000-8000-000000000002']);
 await db.exec("RESET ROLE;SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)");
 // A private historical receipt witness: no signature mutation or public grant.
 await db.exec("INSERT INTO uc_signature_file_requests(request_id,request_kind,signature_id,actor_id,request_hash,revision_id)VALUES('b0000000-0000-4000-8000-000000000003','create','00000000-0000-4000-8000-000000000010','"+owner+"',repeat('a',64),'b0000000-0000-4000-8000-000000000004')");
}
async function rolledBack(priorCount=10){
 await db.exec('ROLLBACK');
 expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:priorCount});
 expect(await one("SELECT to_regclass('org_document_reviews') IS NULL absent")).toEqual({absent:true});
 expect(await one("SELECT to_regprocedure('get_org_document_workflow(uuid)') IS NULL absent")).toEqual({absent:true});
 expect(await one('SELECT count(*)::int n FROM organization_education_profile_history')).toEqual({n:1});
 expect(await one('SELECT count(*)::int n FROM organization_document_applicability_history')).toEqual({n:1});
 expect(await one('SELECT count(*)::int n FROM uc_signature_file_requests')).toEqual({n:1});
 expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
 expect(await one('SELECT document_html,document_hash FROM document_signatures')).toEqual({document_html:'Original signed HTML',document_hash:'original-preserved-hash'});
}
afterEach(async()=>db?.close());
it('runs exact single110 atomically after100-109 and preserves populated predecessor state',async()=>{
 await setup();const manifest=JSON.parse(await read('release-manifest.json')),batch=await read('release-transaction.sql');
 expect(hash(batch)).toBe(manifest.batchSha256);expect(manifest.migrationCount).toBe(1);expect(manifest.priorMigrations).toHaveLength(10);
 expect(Object.values(await one(await read('preflight.sql'))).every(v=>v===true)).toBe(true);
 await db.exec(batch);
 expect(Object.values(await one(await read('postcheck.sql'))).every(v=>v===true)).toBe(true);
 expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:11});
 for(const m of manifest.migrations){
  const source=norm(await readFile(new URL('../../migrations/'+m.file,import.meta.url),'utf8'));
  expect(hash(source)).toBe(m.sourceSha256);
  expect((await one("SELECT statements[1] source FROM supabase_migrations.schema_migrations WHERE version='"+m.version+"'")).source).toBe(source);
 }
 // This immutable manifest attests the UI shipped with110. Later reviewed
 // releases may change those same files; their current behaviour is verified
 // by the latest UI suite and release manifest, not against historical bytes.
 expect(hash(await read('release-manifest.json'))).toBe('5f3a2a129006f775de843aa9be4c1be553cb1f5dca47fb59a19eb666413f2568');
 expect(manifest.frontendFiles).toHaveLength(7);
 expect(new Set(manifest.frontendFiles.map((f:any)=>f.path)).size).toBe(7);
 for(const f of manifest.frontendFiles){
  expect(f.path).toMatch(/^src\//);expect(f.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
 }
 const prior=manifest.previousReleaseManifest;
 expect(hash(await readFile(new URL('../../../'+prior.path,import.meta.url),'utf8'))).toBe(prior.sourceSha256);
 await expect(db.exec(batch)).rejects.toThrow(/preflight failed/);await db.exec('ROLLBACK');
 expect(await one('SELECT count(*)::int n FROM org_document_reviews')).toEqual({n:0});
},30000);
it('late ledger error rolls back110 DDL without touching ten installed migrations or existing declarations',async()=>{
 await setup();await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CHECK(version<>'20261018110000')");
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/check constraint/);await rolledBack();
},30000);
it('rejects tampered embedded source before any migration executes',async()=>{
 await setup();const source=(await read('release-transaction.sql')).replace('No legal signature, issuance, external messages','Tampered legal signature, issuance, external messages');
 await expect(db.exec(source)).rejects.toThrow(/Source hash mismatch/);await rolledBack();
},30000);
it('rejects changed authorization implementation before DDL',async()=>{
 await setup();await db.exec("CREATE OR REPLACE FUNCTION uc_document_action_allowed(p_org uuid,p_action text,p_group uuid DEFAULT NULL,p_enrollment uuid DEFAULT NULL)RETURNS boolean LANGUAGE sql AS $$SELECT true$$");
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_access_dependencies/);await rolledBack();
},30000);
it('requires every exact predecessor ledger entry and refuses a partially installed release',async()=>{
 await setup();await db.exec("DELETE FROM supabase_migrations.schema_migrations WHERE version='20261018109000'");
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_prior_ledger/);await rolledBack(9);
},30000);
it('fails closed if an existing immutable file policy was removed',async()=>{
 await setup();await db.exec('DROP POLICY uc_org_document_blob_no_delete ON storage.objects');
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_immutable_storage_boundary/);await rolledBack();
},30000);
it('preservation rejects a late trigger side effect and rolls it back with the new release',async()=>{
 await setup();
 await db.exec("CREATE FUNCTION synthetic_ledger_side_effect()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.version='20261018110000' THEN UPDATE profiles SET full_name='Unexpected changed history';END IF;RETURN NEW;END$$;CREATE TRIGGER synthetic_late AFTER INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION synthetic_ledger_side_effect()");
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/Historical data changed in public.profiles/);await rolledBack();
 expect(await one('SELECT full_name FROM profiles WHERE user_id=$1',[owner])).toEqual({full_name:'Synthetic Owner'});
},30000);
it('postcheck detects actual NOT NULL, CHECK and grant drift while remaining valid after a real review',async()=>{
 await setup();await db.exec(await read('release-transaction.sql'));
 // Exact current file created by the actual version RPC under an authorized caller.
 const doc='b0000000-0000-4000-8000-000000000010',request='b0000000-0000-4000-8000-000000000011';
 const path=org+'/versions/'+doc+'/'+request+'.pdf';
 await db.query("INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('org-documents',$1,'{\"size\":42}')",[path]);
 await db.exec("SELECT set_config('request.jwt.claim.sub','"+owner+"',false),set_config('request.jwt.claim.role','authenticated',false);SET ROLE authenticated");
 await db.query("INSERT INTO org_documents(id,organization_id,name,type,status)VALUES($1,$2,'Synthetic review','license','active')",[doc,org]);
 const version=(await one('SELECT commit_org_document_version($1,$2,$3,0,$4,NULL,$5) d',
  [doc,org,request,JSON.stringify({file_path:path,file_size:42,file_name:'Source.pdf'}),JSON.stringify({status:'active'})])).d.version_id;
 await db.query('SELECT save_org_document_review_draft($1,$2,1,0,$3,$3,$4,$5)',[doc,version,owner,'[]','b0000000-0000-4000-8000-000000000012']);
 await db.exec('RESET ROLE');expect(Object.values(await one(await read('postcheck.sql'))).every(v=>v===true)).toBe(true);
 await db.exec('BEGIN');
 for(const [table,column] of [['org_document_reviews','responsible_name'],['org_document_review_comments','comment_text'],['org_document_review_events','action'],['org_document_review_requests','payload']]){
  await db.exec('SAVEPOINT drift;ALTER TABLE '+table+' ALTER COLUMN '+column+' DROP NOT NULL');
  expect((await one(await read('postcheck.sql'))).exact_new_schema).toBe(false);
  await db.exec('ROLLBACK TO drift');expect((await one(await read('postcheck.sql'))).exact_new_schema).toBe(true);
 }
 await db.exec('SAVEPOINT drift;ALTER TABLE org_document_reviews DROP CONSTRAINT org_document_reviews_state_check');
 expect((await one(await read('postcheck.sql'))).exact_new_schema).toBe(false);await db.exec('ROLLBACK TO drift');
 await db.exec('GRANT INSERT ON org_document_reviews TO authenticated');
 expect((await one(await read('postcheck.sql'))).rpc_only_writes).toBe(false);await db.exec('ROLLBACK');
},30000);
