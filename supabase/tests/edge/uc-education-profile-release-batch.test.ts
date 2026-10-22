// @vitest-environment node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {afterEach,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {createUcEducationProfileFixture} from '../../functions/_shared/uc-education-profile.fixture';
import {installSignatureFilesPrerequisites} from '../../functions/_shared/uc-signature-files.fixture';
const folder=new URL('../../../docs/releases/sintagma-production/uc-education-profile-20261018/',import.meta.url);
const norm=(s:string)=>s.replaceAll('\r\n','\n');
const read=async(name:string)=>norm(await readFile(new URL(name,folder),'utf8'));
const hash=(s:string,a='sha256')=>createHash(a).update(norm(s)).digest('hex');
let db:PGlite;
const one=async(sql:string)=>(await db.query<any>(sql)).rows[0];
async function setup(){
 db=await createUcEducationProfileFixture(false);
 await installSignatureFilesPrerequisites(db);
 // The release depends on installed100-107. Reuse their actual sources, without re-running either old scheduler.
 await db.exec(norm(await readFile(new URL('../../migrations/20261018106000_uc_gorel_draft_caller.sql',import.meta.url),'utf8')));
 const manifest=JSON.parse(await read('release-manifest.json'));
 for(const m of manifest.priorMigrations)await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES($1,$2,$3)',
  [m.version,m.name,[norm(await readFile(new URL('../../migrations/'+m.file,import.meta.url),'utf8'))]]);
}
async function rolledBack(expectedPrior=8){
 await db.exec('ROLLBACK');
 expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:expectedPrior});
 expect(await one("SELECT to_regclass('organization_education_profiles') IS NULL absent")).toEqual({absent:true});
 expect(await one("SELECT to_regclass('uc_signature_file_requests') IS NULL absent")).toEqual({absent:true});
 expect(await one("SELECT to_regprocedure('uc_signature_file_context(text,text,uuid)') IS NULL absent")).toEqual({absent:true});
 expect(await one('SELECT last_number FROM document_number_sequences')).toEqual({last_number:73});
 expect(await one('SELECT document_html,document_hash FROM document_signatures')).toEqual({document_html:'Original signed HTML',document_hash:'original-preserved-hash'});
}
afterEach(async()=>db?.close());
it('executes exact108-109 as one atomic transaction, preserves released data/functions/cron and rejects a replay',async()=>{
 await setup();const manifest=JSON.parse(await read('release-manifest.json')),batch=await read('release-transaction.sql');
 expect(hash(batch)).toBe(manifest.batchSha256);expect(manifest.migrationCount).toBe(2);
 expect(Object.values(await one(await read('preflight.sql'))).every(v=>v===true)).toBe(true);
 await db.exec(batch);
 expect(Object.values(await one(await read('postcheck.sql'))).every(v=>v===true)).toBe(true);
 expect(await one('SELECT count(*)::int n FROM supabase_migrations.schema_migrations')).toEqual({n:10});
 for(const m of manifest.migrations){
  const source=norm(await readFile(new URL('../../migrations/'+m.file,import.meta.url),'utf8'));
  expect(hash(source)).toBe(m.sourceSha256);
  expect((await one("SELECT statements[1] source FROM supabase_migrations.schema_migrations WHERE version='"+m.version+"'")).source).toBe(source);
 }
 for(const f of [...manifest.frontendFiles,...manifest.edgeFiles,manifest.config])expect(hash(await readFile(new URL('../../../'+f.path,import.meta.url),'utf8'))).toBe(f.sourceSha256);
 await expect(db.exec(batch)).rejects.toThrow(/preflight failed/);await db.exec('ROLLBACK');
 expect(await one('SELECT count(*)::int n FROM organization_education_profiles')).toEqual({n:0});
},30000);
it('late migration-ledger failure rolls back every new object without disturbing eight installed migrations',async()=>{
 await setup();await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CHECK(version<>'20261018109000')");
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/check constraint/);await rolledBack();
},30000);
it('rejects modified embedded source before executing it',async()=>{
 await setup();await expect(db.exec((await read('release-transaction.sql')).replace('Explicit organization declarations, not official verification','Tampered declaration'))).rejects.toThrow(/Source hash mismatch/);await rolledBack();
},30000);
it('fails closed on a changed authorization implementation',async()=>{
 await setup();await db.exec("CREATE OR REPLACE FUNCTION uc_document_action_allowed(p_org uuid,p_action text,p_group uuid DEFAULT NULL,p_enrollment uuid DEFAULT NULL)RETURNS boolean LANGUAGE sql AS $$SELECT true$$");
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_access_dependencies/);await rolledBack();
},30000);
it('fails closed before DDL when a required released migration ledger entry is missing',async()=>{
 await setup();await db.exec("DELETE FROM supabase_migrations.schema_migrations WHERE version='20261018105000'");
 await expect(db.exec(await read('release-transaction.sql'))).rejects.toThrow(/exact_prior_ledger/);await rolledBack(7);
},30000);
it('checks schema/function fingerprints after apply and keeps postcheck valid after legitimate declarations',async()=>{
 await setup();await db.exec(await read('release-transaction.sql'));
 await db.exec(`INSERT INTO organizations(id,name)VALUES('81000000-0000-4000-8000-000000000001','Synthetic acceptance');
 SELECT set_config('request.jwt.claim.sub','',false);
 SELECT set_config('request.jwt.claim.role','service_role',false);
 INSERT INTO user_roles VALUES('81000000-0000-4000-8000-000000000002','admin');
 SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',false);
 SELECT set_config('request.jwt.claim.role','authenticated',false);
 SET ROLE authenticated;`);
 const profile={schemaVersion:1,legalForm:null,providerKind:null,educationalActivity:null,programTypes:null,usesElearning:null,usesDistanceLearning:null,paidEducation:null,hasEmployees:null,hiresTeachers:null,hasPracticalTraining:null,usesNetworkForm:null,servesMinors:null,servesDisabilities:null,specialAreas:null,license:{status:null,registryNumber:null,authority:null,sourceUrl:null,checkedOn:null,exemptionReason:null,licensedActivities:null,evidenceDocumentId:null,evidenceVersionId:null}};
 await db.query('SELECT save_organization_education_profile($1,0,$2,$3)',['81000000-0000-4000-8000-000000000001',JSON.stringify(profile),'81000000-0000-4000-8000-000000000003']);
 await db.exec('RESET ROLE');expect(Object.values(await one(await read('postcheck.sql'))).every(v=>v===true)).toBe(true);
 await db.exec('ALTER TABLE organization_education_profiles ADD COLUMN unexpected text');
 expect((await one(await read('postcheck.sql'))).exact_new_schema).toBe(false);
},30000);
it('canonical PG17/18 fingerprint still detects removal of NOT NULL in every new table',async()=>{
 await setup();await db.exec(await read('release-transaction.sql'));await db.exec('BEGIN');
 for(const [table,column] of [
  ['organization_education_profiles','profile'],['organization_education_profile_history','profile'],
  ['organization_document_applicability_decisions','reason'],['organization_document_applicability_history','reason'],
  ['uc_signature_file_requests','request_hash'],
 ]){
  await db.exec('SAVEPOINT not_null_drift');
  await db.exec('ALTER TABLE '+table+' ALTER COLUMN '+column+' DROP NOT NULL');
  expect((await one(await read('postcheck.sql'))).exact_new_schema).toBe(false);
  await db.exec('ROLLBACK TO not_null_drift');
  expect((await one(await read('postcheck.sql'))).exact_new_schema).toBe(true);
 }
 await db.exec('ROLLBACK');
},30000);

