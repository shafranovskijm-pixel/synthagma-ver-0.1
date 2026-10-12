// Executes the exact generated SQL batch in isolated in-memory PostgreSQL only.
// Uses schema/function/policy metadata, never real business data or a hosted URL.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const [metadataPath,bundlePath,resultPath]=process.argv.slice(2);
assert.ok(metadataPath && bundlePath && resultPath,'Usage: node test-staff-atomic-release.mjs METADATA_JSON BUNDLE_SQL RESULT_JSON');
const read=file=>readFile(path.join(repo,file),'utf8');
const live=JSON.parse(await readFile(metadataPath,'utf8'));
const bundle=await readFile(bundlePath,'utf8');
const folder='docs/releases/sintagma-production/staff-workspace-20261012/';
const modulePath=process.env.PGLITE_MODULE_PATH||'D:/Codex/workspaces/2026-09-28/new-chat/work/crm-lovable-documents-api/node_modules/@electric-sql/pglite/dist/index.js';
const {PGlite}=await import(pathToFileURL(modulePath).href);
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const versions=['20261012110000','20261012111000'];
const setup=async()=>{
 const db=new PGlite();
 await db.exec('BEGIN');
 await db.exec(await read(folder+'synthetic-fixture.sql'));
 await db.exec(await read(folder+'synthetic-documents-journals.sql'));
 await db.exec('DROP FUNCTION public.has_role(uuid,app_role); DROP FUNCTION public.has_role(app_role,uuid); SET LOCAL check_function_bodies=off');
 for(const f of live.functions) await db.exec(f.definition);
 await db.exec('SET LOCAL check_function_bodies=on');
 const companySource=await read('supabase/migrations/20260219051413_1b5a63f5-89f0-43bc-ae83-621c48bffceb.sql');
 const companyHelper=companySource.match(/CREATE OR REPLACE FUNCTION public\.current_company_id\([\s\S]*?AS\s+(\$[^$]*\$)[\s\S]*?\1;/i)?.[0];
 assert.ok(companyHelper); await db.exec(companyHelper);
 for(const p of (await db.query('SELECT schemaname,tablename,policyname FROM pg_policies')).rows)
  await db.exec(`DROP POLICY ${ident(p.policyname)} ON ${ident(p.schemaname)}.${ident(p.tablename)}`);
 for(const p of live.policies) await db.exec(`CREATE POLICY ${ident(p.policyname)} ON public.${ident(p.tablename)} AS ${p.permissive}
  FOR ${p.cmd} TO ${p.roles.map(ident).join(',')} ${p.qual?'USING ('+p.qual+')':''} ${p.with_check?'WITH CHECK ('+p.with_check+')':''}`);
 const roles=new Set((await db.query('SELECT rolname FROM pg_roles')).rows.map(r=>r.rolname));
 for(const f of live.functions) for(const g of f.grants||[]) if(g.grantee!=='PUBLIC' && !roles.has(g.grantee)){
  await db.exec('CREATE ROLE '+ident(g.grantee)); roles.add(g.grantee);
 }
 for(const f of live.functions){
  await db.exec(`REVOKE ALL ON FUNCTION public.${f.signature} FROM PUBLIC,anon,authenticated,service_role`);
  for(const g of f.grants||[]) await db.exec(`GRANT ${g.privilege} ON FUNCTION public.${f.signature} TO ${g.grantee==='PUBLIC'?'PUBLIC':ident(g.grantee)}${g.grantable?' WITH GRANT OPTION':''}`);
 }
 await db.exec(`CREATE SCHEMA supabase_migrations;
 CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text,created_by text,idempotency_key text,rollback text[]);
 COMMIT`);
 return db;
};
const snapshot=async db=>({
 functions:(await db.query(`SELECT proname,pg_get_function_identity_arguments(oid) args,md5(replace(prosrc,chr(13)||chr(10),chr(10))) body_md5,proacl
 FROM pg_proc WHERE oid IN (${live.functions.map(f=>`to_regprocedure('public.${f.signature}')`).join(',')}) ORDER BY proname,args`)).rows,
 policies:(await db.query('SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname')).rows,
 ledger:(await db.query('SELECT * FROM supabase_migrations.schema_migrations ORDER BY version')).rows
});
const result={bundleSha256:createHash('sha256').update(bundle).digest('hex'),liveApplied:false,isolatedInMemory:true};
let db;
try{
 db=await setup();
 const original=await snapshot(db);
 // A failure after both source executions must roll back both DDL and ledger.
 await db.exec("ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT synthetic_fail_second CHECK(version<>'20261012111000')");
 await assert.rejects(()=>db.exec(bundle),e=>e.code==='23514'&&e.message.includes('synthetic_fail_second'));
 await db.exec('ROLLBACK');
 assert.deepEqual(await snapshot(db),original,'all functions, ACLs, policies and ledger rolled back after second ledger error');
 result.failedSecondMigrationFullyRolledBack=true;
 await db.exec('ALTER TABLE supabase_migrations.schema_migrations DROP CONSTRAINT synthetic_fail_second');
 // Drift gate must reject before changing any release object.
 await db.exec("CREATE OR REPLACE FUNCTION public.can_access_organization(_organization_id uuid,_permission text DEFAULT 'settings.read') RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT true $$");
 const drifted=await snapshot(db);
 await assert.rejects(()=>db.exec(bundle),e=>e.message.includes('live function drift/ownership'));
 await db.exec('ROLLBACK');
 assert.deepEqual(await snapshot(db),drifted,'drift denial changed no release objects');
 result.liveDefinitionDriftRefused=true;
 await db.exec(live.functions.find(f=>f.signature==='can_access_organization(uuid,text)').definition);
 const applied=await db.exec(bundle);
 const release=applied.flatMap(r=>r.rows||[]).find(r=>r.release_result)?.release_result;
 assert.equal(release?.committed,true);
 assert.equal(release?.checks_passed,41);
 assert.equal(release?.preserved_functions,10);
 assert.equal(release?.preserved_policies,14);
 assert.equal(release?.preserved_table_security,6);
 assert.equal(release?.ledger_source_checks_passed,2);
 result.exactBundleCommitted=true; result.postchecksPassed=41;
 result.preservedFunctions=10; result.preservedPolicies=14; result.preservedTableSecurity=6;
 for(const v of versions){
  const file=v+(v.endsWith('110000')?'_staff_workspace_access.sql':'_staff_documents_journals_access.sql');
  const expected=await read('supabase/migrations/'+file);
  const row=(await db.query('SELECT statements FROM supabase_migrations.schema_migrations WHERE version=$1',[v])).rows[0];
  assert.deepEqual(row.statements,[expected],'byte-for-byte ledger source '+v);
 }
 result.exactLedgerSources=2;
 const committed=await snapshot(db);
 await assert.rejects(()=>db.exec(bundle),e=>e.message.includes('replay refused'));
 await db.exec('ROLLBACK');
 assert.deepEqual(await snapshot(db),committed,'replay denial preserves committed state');
 result.replayRefused=true;
 // Domain regression uses the actual live policy set, with only the old test's
 // intentionally absent organization SELECT replaced by a preservation proof.
 await db.exec("BEGIN; SET LOCAL sintagma.staff_access_fixture='isolated'; SET LOCAL sintagma.staff_assertions='0'");
 let regression=await read(folder+'regression-rollback.sql');
 const absentSelect="SELECT synthetic_assert((SELECT count(*)=0 FROM organizations),'core does not expand direct organization SELECT');";
 assert.ok(regression.includes(absentSelect));
 regression=regression.replace(absentSelect,"SELECT synthetic_assert((SELECT count(*)=2 FROM organizations),'existing live organization SELECT policies retained without expansion');");
 await db.exec(regression);
 await db.exec(await read(folder+'regression-documents-journals.sql'));
 result.roleRegressionAssertions=(await db.query("SELECT current_setting('sintagma.staff_assertions')::int AS count")).rows[0].count;
 assert.equal(result.roleRegressionAssertions,127);
 await db.exec('ROLLBACK');
 result.syntheticBusinessChangesRolledBack=true;
 result.passed=true;
 result.limitations='Disposable in-memory PostgreSQL using real before-metadata and synthetic rows. Does not prove hosted transport, concurrent locks, PostgREST notification delivery or browser outcome.';
 await writeFile(resultPath,JSON.stringify(result,null,2)+'\n','utf8');
 console.log(JSON.stringify(result));
}catch(error){
 console.error(JSON.stringify({...result,passed:false,code:error.code,message:error.message,where:error.where?.slice(0,700)}));process.exitCode=1;
}finally{if(db)await db.close();}
