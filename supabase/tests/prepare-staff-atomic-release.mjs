// Offline only: reconcile the saved read-only metadata and assemble one SQL batch.
// Does not connect to any database. Output uses the existing S028/S029 ledger workflow.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const [metadataPath, outputDir] = process.argv.slice(2);
assert.ok(metadataPath && outputDir, 'Usage: node prepare-staff-atomic-release.mjs LIVE_METADATA_JSON OUTPUT_DIRECTORY');
const read = file => readFile(path.join(repo, file), 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');
const md5 = text => createHash('md5').update(text.replaceAll('\r\n','\n')).digest('hex');
const quote = text => "'" + String(text).replaceAll("'", "''") + "'";
const folder = 'docs/releases/sintagma-production/staff-workspace-20261012/';
const metadataText = await readFile(metadataPath, 'utf8');
const live = JSON.parse(metadataText);
const migrations = ['20261012110000_staff_workspace_access.sql', '20261012111000_staff_documents_journals_access.sql'];
const preflight = await Promise.all(['preflight.sql', 'preflight-documents-journals.sql'].map(f => read(folder + f)));
const postflight = await Promise.all(['postcheck.sql', 'postcheck-documents-journals.sql'].map(f => read(folder + f)));
const migrationSql = await Promise.all(migrations.map(f => read('supabase/migrations/' + f)));
const ledgerEntries = migrations.map((file,i) => ({version:file.slice(0,14),name:file.slice(15,-4),md5:md5(migrationSql[i])}));
const changedTables = ['companies','labor_safety_groups','labor_safety_records','journal_instances','journal_entries'];
const signatures = live.functions.map(f => 'public.' + f.signature);
const overwritten = ['org_role_default_permissions(text)','get_organization_core(uuid)','get_documents_kpi(uuid)',
  'list_recycle_bin(uuid,text,integer,integer)','soft_delete_document(text,uuid)','restore_document(text,uuid)'];
const functionChecks = [];
for (const match of preflight.join('\n').matchAll(/\('(public\.[^']+)','([a-f0-9]{32})'\)/g)) {
  const [, signature, expected] = match;
  const actual = live.functions.find(f => 'public.' + f.signature === signature);
  assert.equal(actual?.body_md5, expected, 'Live function body: ' + signature);
  functionChecks.push(signature);
}
const requiredColumns = [];
for (const sql of preflight) {
  const body = sql.match(/WITH expected\(table_name,column_name\) AS \(VALUES([\s\S]*?)\)\s*SELECT/i)?.[1];
  assert.ok(body, 'preflight column inventory');
  for (const [, table, column] of body.matchAll(/\('([^']+)','([^']+)'\)/g)) {
    const actual = live.columns.find(c => c.table === table && c.column === column);
    assert.ok(actual, 'Missing live column ' + table + '.' + column);
    requiredColumns.push(actual);
  }
}
const tableChecks = changedTables.map(table => {
  const actual = live.tables.find(t => t.name === table);
  assert.equal(actual?.rls, true, table + ' RLS');
  assert.equal(actual?.can_alter, true, table + ' owner capability');
  for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.ok(live.table_grants.some(g =>
    g.table_name === table && g.grantee === 'authenticated' && g.privilege_type === privilege), table + ' authenticated ' + privilege);
  assert.ok(live.policies.some(p => p.tablename === table && p.policyname === 'account_deletion_no_revoked_access'
    && p.permissive === 'RESTRICTIVE' && p.cmd === 'ALL'), table + ' restrictive deletion fence');
  return { table, rls: true, canAlter: true, authenticatedCrud: true, policies: live.policies.filter(p => p.tablename === table).length };
});
for (const role of ['authenticated','anon','service_role']) assert.ok(live.roles.includes(role), role);
const replaced = [...migrationSql.join('\n').matchAll(/DROP POLICY IF EXISTS "([^"]+)" ON public\.([a-z_]+);/g)]
  .map(([,policyname,tablename]) => ({policyname,tablename}));
assert.equal(replaced.length, 18);
for (const p of replaced) assert.ok(live.policies.some(a => a.tablename === p.tablename && a.policyname === p.policyname),
  'Expected replaced policy: ' + p.tablename + '/' + p.policyname);
const retainedPolicies = live.policies.filter(p => !replaced.some(r => r.tablename === p.tablename && r.policyname === p.policyname));
assert.equal(retainedPolicies.length, 14);
const values = rows => rows.map(row => '(' + row.map(quote).join(',') + ')').join(',\n');
const jsonLiteral = value => quote(JSON.stringify(value)) + '::jsonb';
const policyProjection = 'schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check';
const policyAggregate = `SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname),'[]'::jsonb) FROM
  (SELECT ${policyProjection} FROM pg_policies WHERE schemaname='public'
   AND tablename IN (${[...changedTables,'organizations'].map(quote).join(',')})) p`;
const expectedPolicies = [...live.policies].sort((a,b) => a.tablename.localeCompare(b.tablename) || a.policyname.localeCompare(b.policyname));
// Compare policy sets as JSONB containment in both directions, independent of collation.
const unchangedFunctionQuery = `SELECT 'public.'||f.signature AS signature,pg_get_functiondef(p.oid) AS definition,
  p.proowner,p.proacl,p.prosecdef,p.proconfig FROM (VALUES ${values(live.functions.filter(f => !overwritten.includes(f.signature)).map(f => [f.signature]))}) f(signature)
  JOIN pg_proc p ON p.oid=to_regprocedure('public.'||f.signature)`;
const unchangedPoliciesQuery = `SELECT ${policyProjection} FROM pg_policies p WHERE schemaname='public'
  AND (tablename='organizations' OR (tablename IN (${changedTables.map(quote).join(',')})
   AND (policyname='account_deletion_no_revoked_access' OR policyname IN ('Companies can view own record','Companies can update own record'))))`;
const rows = [];
rows.push(`-- S-047 atomic release. Generated from reviewed local sources and live read-only metadata.
-- Send this COMPLETE file as ONE SQL editor request. Never split BEGIN/COMMIT between requests.
-- Any raised exception aborts the transaction; do not report success from a partial result.
-- No application business rows are written. Exact source is recorded in the migration ledger.
-- Metadata SHA256: ${sha(metadataText)}
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
DECLARE r record; actual_policies jsonb;
BEGIN
  IF NOT has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT') THEN
    RAISE EXCEPTION 'S-047 migration ledger INSERT required'; END IF;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN (${ledgerEntries.map(e => quote(e.version)).join(',')})) THEN
    RAISE EXCEPTION 'S-047 migration ledger already contains a release version; replay refused'; END IF;
  FOR r IN SELECT e.signature FROM (VALUES ${values(live.functions.map(f => ['public.' + f.signature,f.body_md5,JSON.stringify(f.config),String(f.security_definer)]))})
    e(signature,body_md5,config,security_definer) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
    WHERE p.oid IS NULL OR md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))<>e.body_md5
      OR COALESCE(to_jsonb(p.proconfig),'null'::jsonb)<>e.config::jsonb
      OR p.prosecdef<>e.security_definer::boolean OR NOT pg_has_role(current_user,p.proowner,'USAGE')
  LOOP RAISE EXCEPTION 'S-047 live function drift/ownership: %',r.signature; END LOOP;
  FOR r IN SELECT e.table_name,e.column_name FROM (VALUES ${values(requiredColumns.map(c => [c.table,c.column]))}) e(table_name,column_name)
    LEFT JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name
    WHERE c.column_name IS NULL
  LOOP RAISE EXCEPTION 'S-047 missing column: %.%',r.table_name,r.column_name; END LOOP;
  FOR r IN SELECT e.table_name FROM (VALUES ${values(changedTables.map(t => [t]))}) e(table_name)
    LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.table_name)
    WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT pg_has_role(current_user,c.relowner,'USAGE')
      OR EXISTS(SELECT 1 FROM (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE')) g(privilege)
        WHERE NOT has_table_privilege('authenticated',c.oid,g.privilege))
  LOOP RAISE EXCEPTION 'S-047 table RLS/grants/ownership: %',r.table_name; END LOOP;
  SELECT (${policyAggregate}) INTO actual_policies;
  IF NOT(actual_policies @> ${jsonLiteral(expectedPolicies)} AND actual_policies <@ ${jsonLiteral(expectedPolicies)}) THEN
    RAISE EXCEPTION 'S-047 live policy inventory drifted from reviewed before-backup';
  END IF;
END $preflight$;
CREATE TEMP TABLE s047_release_checks(check_name text PRIMARY KEY,ok boolean NOT NULL,details jsonb) ON COMMIT DROP;
CREATE TEMP TABLE s047_release_result(result jsonb NOT NULL) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE s047_preserved_functions ON COMMIT DROP AS ${unchangedFunctionQuery};
CREATE TEMP TABLE s047_preserved_policies ON COMMIT DROP AS ${unchangedPoliciesQuery};
CREATE TEMP TABLE s047_preserved_table_security ON COMMIT DROP AS
 SELECT c.oid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c
 WHERE c.oid IN (${[...changedTables,'organizations'].map(t => `'public.${t}'::regclass`).join(',')});
`);
for (let i = 0; i < migrations.length; i++) {
  assert.ok(!migrationSql[i].includes('$s047_exact_' + i + '$'));
  rows.push(`-- Exact source ${migrations[i]} SHA256 ${sha(migrationSql[i])}
DO $s047_apply_${i}$
DECLARE v_source text := $s047_exact_${i}$${migrationSql[i]}$s047_exact_${i}$;
BEGIN
 IF md5(replace(v_source,chr(13)||chr(10),chr(10)))<>${quote(ledgerEntries[i].md5)} THEN
   RAISE EXCEPTION 'S-047 embedded migration source changed: ${ledgerEntries[i].version}'; END IF;
 EXECUTE v_source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
 VALUES(${quote(ledgerEntries[i].version)},${quote(ledgerEntries[i].name)},ARRAY[v_source]);
END $s047_apply_${i}$;`);
}
let queryCount = 0;
for (let i = 0; i < postflight.length; i++) {
  // These static postcheck files contain SELECT/WITH statements and line comments only.
  const statements = postflight[i].replace(/^\s*--.*$/gm,'').split(';').map(s => s.trim()).filter(Boolean);
  for (const statement of statements) if (/\bAS ok\b/i.test(statement)) {
    rows.push(`DO $postcheck_${queryCount}$ DECLARE r record; BEGIN
 FOR r IN ${statement} LOOP
   IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'S-047 postcheck failed: %',r.check_name; END IF;
   INSERT INTO s047_release_checks VALUES(r.check_name,r.ok,to_jsonb(r));
 END LOOP;
END $postcheck_${queryCount}$;`);
    queryCount++;
  }
}
rows.push(`DO $preserved$
BEGIN
 IF EXISTS((SELECT * FROM s047_preserved_functions EXCEPT ${unchangedFunctionQuery})
   UNION ALL (${unchangedFunctionQuery} EXCEPT SELECT * FROM s047_preserved_functions)) THEN
   RAISE EXCEPTION 'S-047 changed an untouched function definition/ACL'; END IF;
 IF EXISTS((SELECT * FROM s047_preserved_policies EXCEPT ${unchangedPoliciesQuery})
   UNION ALL (${unchangedPoliciesQuery} EXCEPT SELECT * FROM s047_preserved_policies)) THEN
   RAISE EXCEPTION 'S-047 changed a retained organization/company-owner/deletion policy'; END IF;
 IF EXISTS(SELECT 1 FROM s047_preserved_table_security b JOIN pg_class c ON c.oid=b.oid
   WHERE ROW(b.relowner,b.relacl,b.relrowsecurity,b.relforcerowsecurity)
    IS DISTINCT FROM ROW(c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity)) THEN
   RAISE EXCEPTION 'S-047 changed table ownership/grants/RLS'; END IF;
 IF (SELECT count(*) FROM s047_release_checks)<>41 OR EXISTS(SELECT 1 FROM s047_release_checks WHERE ok IS DISTINCT FROM true) THEN
   RAISE EXCEPTION 'S-047 requires exactly 41 successful postchecks'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ${values(ledgerEntries.map(e=>[e.version,e.name,e.md5]))}) e(version,name,source_md5)
   LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version
   WHERE m.version IS NULL OR m.name IS DISTINCT FROM e.name OR cardinality(m.statements) IS DISTINCT FROM 1
    OR md5(replace(m.statements[1],chr(13)||chr(10),chr(10))) IS DISTINCT FROM e.source_md5) THEN
   RAISE EXCEPTION 'S-047 exact migration ledger postcheck failed'; END IF;
END $preserved$;
INSERT INTO s047_release_result SELECT jsonb_build_object(
 'release','S-047 staff workspace','migrations',${jsonLiteral(migrations)},
 'checks_passed',count(*),'all_checks_passed',bool_and(ok),
 'preserved_functions',(SELECT count(*) FROM s047_preserved_functions),
 'preserved_policies',(SELECT count(*) FROM s047_preserved_policies),
 'preserved_table_security',(SELECT count(*) FROM s047_preserved_table_security),
 'checked_at',clock_timestamp(),'application_transaction',txid_current(),
 'migration_ledger_changed',true,'ledger_rows_added',2,'ledger_source_checks_passed',2,'business_rows_changed',false,
 'checks',jsonb_agg(details ORDER BY check_name)) FROM s047_release_checks;
NOTIFY pgrst,'reload schema';
COMMIT;
-- This result is available only after the complete transaction commits successfully.
SELECT result||jsonb_build_object('committed',true) AS release_result FROM s047_release_result;
`);
const bundle = rows.join('\n');
const reconciliation = { passed: true, metadataSha256: sha(metadataText), functionsGuarded: signatures.length,
  reviewedMigrationHelperHashes: new Set(functionChecks).size, requiredColumns: requiredColumns.length,
  replacedPolicies: replaced.length, retainedPolicies: retainedPolicies.length, tableChecks,
  bundleSha256: sha(bundle), bytes: Buffer.byteLength(bundle), postcheckQueries: queryCount,
  sources: migrations.map((file,i) => ({file,sha256:sha(migrationSql[i])})),
  metadataOnly: true, liveApplied: false, plannedLedgerRows: ledgerEntries, ledgerWorkflow: 'existing S028/S029 exact-source transactional workflow' };
await mkdir(outputDir,{recursive:true});
await writeFile(path.join(outputDir,'staff-workspace-atomic-apply.sql'),bundle,'utf8');
await writeFile(path.join(outputDir,'live-preflight-reconciliation.json'),JSON.stringify(reconciliation,null,2)+'\n','utf8');
console.log(JSON.stringify(reconciliation));
