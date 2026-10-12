// Disposable in-memory PostgreSQL, actual checked-in helpers, synthetic actors only.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=p=>readFile(root+p,'utf8');
const folder='docs/releases/sintagma-production/staff-custom-roles-20261012/';
const source=await read('supabase/migrations/20261012123000_org_custom_roles_staff_permissions.sql');
const bundle=await read(folder+'release-transaction.sql');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE_PATH||'D:/Codex/workspaces/2026-09-28/new-chat/work/crm-lovable-documents-api/node_modules/@electric-sql/pglite/dist/index.js').href);
const db=new PGlite(); let assertions=0;
const equal=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
const extract=async(file,name)=>{
 const s=await read('supabase/migrations/'+file);
 const f=s.match(new RegExp('CREATE (?:OR REPLACE )?FUNCTION public\\.'+name+'\\([\\s\\S]*?AS\\s+(\\$[^$]*\\$)[\\s\\S]*?\\1;','i'))?.[0];
 assert.ok(f,'actual helper '+name); return f.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
};
const uid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const actor=async n=>db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub='${uid(n)}'`);
const count=async()=>Number((await db.query('SELECT count(*) n FROM org_custom_roles')).rows[0].n);
const fail=async(sql,regex=/row-level security/)=>{
 await assert.rejects(()=>db.exec(sql),e=>regex.test(e.message)); assertions++;
};
const security=async()=>((await db.exec(await read(folder+'backup-definitions.sql')))[0].rows[0].custom_roles_backup);
const insert=(id,org=100)=>`INSERT INTO org_custom_roles(id,organization_id,name) VALUES('${uid(id)}','${uid(org)}','Synthetic ${id}')`;
const result={isolatedInMemory:true,liveApplied:false};
try{
 await db.exec('BEGIN');
 await db.exec(await read('docs/releases/sintagma-production/staff-workspace-20261012/synthetic-fixture.sql'));
 await db.exec('DROP FUNCTION public.has_role(uuid,app_role); DROP FUNCTION public.has_role(app_role,uuid); SET LOCAL check_function_bodies=off');
 for(const [file,name] of [
  ['20260110234906_159335d2-99b0-4002-b8c0-e8dc0e87993b.sql','has_role'],
  ['20260429060323_9023b604-40d6-4551-bf02-4fc5315bdf0e.sql','has_role'],
  ['20261012110000_staff_workspace_access.sql','org_role_default_permissions'],
  ['20260422090332_1856ddfd-409c-45c8-8ee1-2acc959c793e.sql','get_org_staff_permissions'],
  ['20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql','normalize_org_staff_permission'],
  ['20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql','has_org_staff_permission'],
  ['20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql','can_access_organization'],
  ['20261007160000_self_account_deletion.sql','account_deletion_access_allowed'],
  ['20260422091245_ce2144ac-5980-4b9c-ab51-0713361004b0.sql','touch_updated_at']
 ]) await db.exec(await extract(file,name));
 const old=await read('supabase/migrations/20260422091245_ce2144ac-5980-4b9c-ab51-0713361004b0.sql');
 await db.exec(old.match(/CREATE TABLE IF NOT EXISTS public\.org_custom_roles[\s\S]*?\n\);/)[0]);
 await db.exec('ALTER TABLE org_custom_roles ENABLE ROW LEVEL SECURITY');
 for(const policy of old.matchAll(/CREATE POLICY "Org (?:owners manage|staff read) custom roles"[\s\S]*?;/g)) await db.exec(policy[0]);
 await db.exec(`CREATE POLICY account_deletion_no_revoked_access ON org_custom_roles AS RESTRICTIVE FOR ALL TO authenticated
 USING((SELECT account_deletion_access_allowed())) WITH CHECK((SELECT account_deletion_access_allowed()));
 CREATE TRIGGER trg_org_custom_roles_updated BEFORE UPDATE ON org_custom_roles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
 GRANT ALL ON org_custom_roles TO authenticated,anon,service_role;
 UPDATE org_staff SET sections_access='["staff.write"]' WHERE user_id='${uid(3)}';
 UPDATE org_staff SET sections_access='["staff.read"]' WHERE user_id='${uid(10)}';
 INSERT INTO org_staff(user_id,organization_id,role) VALUES('${uid(12)}','${uid(100)}','admin');
 ${insert(901)}; ${insert(902,200)};
 CREATE SCHEMA supabase_migrations;
 CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text,
 created_by text,idempotency_key text UNIQUE,rollback text[]);
 COMMIT;`);
 // Baseline: effective writer cannot write; expired membership can still read.
 await actor(3); await fail(insert(903));
 await actor(5); equal(await count(),1,'baseline expired member can read');
 await actor(4); equal(await count(),1,'baseline teacher without staff.read can read');
 await db.exec('RESET ROLE');
 const before=await security();
 await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT synthetic_ledger_failure CHECK(version<>'20261012123000')");
 await fail(bundle,/synthetic_ledger_failure/); await db.exec('ROLLBACK');
 equal(await security(),before,'ledger failure rolls back policy DDL and all security');
 equal((await db.query('SELECT count(*) n FROM supabase_migrations.schema_migrations')).rows[0].n,0,'failed release records no ledger row');
 await db.exec('ALTER TABLE supabase_migrations.schema_migrations DROP CONSTRAINT synthetic_ledger_failure');
 await db.exec('CREATE POLICY synthetic_drift ON org_custom_roles FOR SELECT USING(true)');
 await fail(bundle,/Unreviewed custom-role policy inventory/); await db.exec('ROLLBACK');
 await db.exec('DROP POLICY synthetic_drift ON org_custom_roles');
 await db.exec("CREATE OR REPLACE FUNCTION public.can_access_organization(_organization_id uuid,_permission text DEFAULT 'settings.read') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT true $$");
 await fail(bundle,/Unreviewed custom-role access helper/); await db.exec('ROLLBACK');
 await db.exec(await extract('20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql','can_access_organization'));
 const applied=await db.exec(bundle);
 const release=applied.flatMap(r=>r.rows||[]).find(r=>r.release_result)?.release_result;
 equal(release?.committed,true,'exact bundle commits'); equal(release?.checks_passed,7,'seven catalog postchecks');
 const after=await security();const preserved=x=>{const y={...x};delete y.policies;return y;};
 equal(preserved(after),preserved(before),'table ACL/owner/RLS/triggers and helper bodies/ACL remain unchanged');
 equal((await db.query("SELECT statements FROM supabase_migrations.schema_migrations WHERE version='20261012123000'")).rows[0].statements,[source],'exact source ledger');
 await fail(bundle,/replay refused/); await db.exec('ROLLBACK'); equal(await security(),after,'replay changes nothing');
 await db.exec('BEGIN');
 await actor(3); equal(await count(),1,'writer sees only assigned tenant despite old profile');
 await db.exec(insert(903)); equal(await count(),2,'writer inserts own role');
 equal((await db.query(`UPDATE org_custom_roles SET name='Edited',permissions='["courses.read"]' WHERE id='${uid(903)}' RETURNING id`)).rows.length,1,'writer updates own role');
 await db.exec('SAVEPOINT cross_tenant'); await fail(`UPDATE org_custom_roles SET organization_id='${uid(200)}' WHERE id='${uid(903)}'`);
 await db.exec('ROLLBACK TO SAVEPOINT cross_tenant');
 await db.exec('SAVEPOINT foreign_insert'); await fail(insert(904,200)); await db.exec('ROLLBACK TO SAVEPOINT foreign_insert');
 equal((await db.query(`UPDATE org_custom_roles SET name='Forbidden' WHERE id='${uid(902)}' RETURNING id`)).rows.length,0,'foreign update hidden');
 equal((await db.query(`DELETE FROM org_custom_roles WHERE id='${uid(902)}' RETURNING id`)).rows.length,0,'foreign delete hidden');
 equal((await db.query(`DELETE FROM org_custom_roles WHERE id='${uid(903)}' RETURNING id`)).rows.length,1,'writer deletes own role');
 for(const n of [12,10]){
  await actor(n); equal(await count(),1,'staff.read read-only actor '+n);
  equal((await db.query(`UPDATE org_custom_roles SET name='Forbidden' WHERE id='${uid(901)}' RETURNING id`)).rows.length,0,'read-only cannot update '+n);
  equal((await db.query(`DELETE FROM org_custom_roles WHERE id='${uid(901)}' RETURNING id`)).rows.length,0,'read-only cannot delete '+n);
  await db.exec('SAVEPOINT denied'); await fail(insert(905)); await db.exec('ROLLBACK TO SAVEPOINT denied');
 }
 for(const n of [4,5,8,9]){
  await actor(n); equal(await count(),0,'teacher/expired/student/revoked denied '+n);
  await db.exec('SAVEPOINT denied'); await fail(insert(905)); await db.exec('ROLLBACK TO SAVEPOINT denied');
 }
 for(const n of [1,2]){
  await actor(n); equal(await count(),n===1?1:2,'owner/global admin read preserved '+n);
  await db.exec(insert(910+n));
  equal((await db.query(`DELETE FROM org_custom_roles WHERE id='${uid(910+n)}' RETURNING id`)).rows.length,1,'owner/global admin writes preserved '+n);
 }
 await db.exec("RESET ROLE; SET ROLE anon; SET request.jwt.claim.sub=''");
 equal(await count(),0,'anonymous reads denied');
 await db.exec('SAVEPOINT denied'); await fail(insert(905)); await db.exec('ROLLBACK TO SAVEPOINT denied');
 await db.exec('RESET ROLE; ROLLBACK');
 equal(await count(),2,'synthetic business changes fully rolled back');
 result.passed=true;result.assertions=assertions;result.postchecks=7;
 result.exactBundleCommit=true;result.exactLedgerSource=true;result.replayRefused=true;
 result.policyDriftRefused=true;result.helperDriftRefused=true;result.ledgerFailureRollsBackDDL=true;
 result.bundleSha256=createHash('sha256').update(bundle).digest('hex');
 result.limitation='In-memory PostgreSQL only. Does not prove hosted apply, concurrent locks, API schema reload or browser workflow.';
 await writeFile(root+folder+'validation.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({...result,assertions,code:error.code,message:error.message,where:error.where}));process.exitCode=1;}
finally{await db.close();}
