// Isolated PostgreSQL fixture, real helper/migration bodies, synthetic rows only.
// Never connects to hosted databases. The whole fixture is rolled back.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const read = file => readFile(path.join(repo, file), 'utf8');
const modulePath = process.env.PGLITE_MODULE_PATH || 'D:/Codex/workspaces/2026-09-28/new-chat/work/crm-lovable-documents-api/node_modules/@electric-sql/pglite/dist/index.js';
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const folder = 'docs/releases/sintagma-production/staff-workspace-20261012/';
const migration = 'supabase/migrations/20261012110000_staff_workspace_access.sql';
const documentMigration = 'supabase/migrations/20261012111000_staff_documents_journals_access.sql';
const extractFunction = async (file, name) => {
  const sql = await read('supabase/migrations/' + file);
  const source = sql.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name + '\\([\\s\\S]*?AS\\s+(\\$[^$]*\\$)[\\s\\S]*?\\1;', 'i'))?.[0];
  assert.ok(source, 'real source for ' + name);
  return source;
};
try {
  await db.exec('BEGIN');
  await db.exec(await read(folder + 'synthetic-fixture.sql'));
  const helpers = [
    ['20260422090402_7a17f4ca-e3ae-47cb-866e-670fd82dc4ec.sql', 'org_role_default_permissions'],
    ['20260422090332_1856ddfd-409c-45c8-8ee1-2acc959c793e.sql', 'get_org_staff_permissions'],
    ['20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql', 'normalize_org_staff_permission'],
    ['20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql', 'has_org_staff_permission'],
    ['20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql', 'current_organization_id'],
    ['20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql', 'is_org_owner'],
    ['20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql', 'can_access_organization'],
    ['20260429062356_4bc82abe-08ee-4620-bc1b-64c431a97698.sql', 'get_organization_core'],
    ['20260219051413_1b5a63f5-89f0-43bc-ae83-621c48bffceb.sql', 'current_company_id'],
  ];
  for (const [file, name] of helpers) await db.exec(await extractFunction(file, name));
  // Use the exact checked-in deletion guard body, too; no weakened fixture substitute.
  const deletionSql = await read('supabase/migrations/20261007160000_self_account_deletion.sql');
  const deletionHelper = deletionSql.match(/CREATE FUNCTION public\.account_deletion_access_allowed\(\)[\s\S]*?\$fn\$;/)?.[0];
  assert.ok(deletionHelper, 'real account-deletion helper');
  await db.exec(deletionHelper.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'));
  await db.exec(await read(folder + 'synthetic-documents-journals.sql'));
  for (const name of ['get_documents_kpi','list_recycle_bin','soft_delete_document','restore_document']) {
    await db.exec(await extractFunction('20260422080042_4b7d798a-9e85-4f57-8c3e-505add69a86c.sql',name));
  }
  const journalSource = await read('supabase/migrations/20260113063325_ff9a2e81-42b3-4ec9-92f1-f294589e54bc.sql');
  for (const policy of journalSource.matchAll(/CREATE POLICY[\s\S]*?;/g)) await db.exec(policy[0]);
  // Reproduce the original EXECUTE/FOUND bug before changing the real bodies.
  await db.exec("SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'");
  assert.equal((await db.query("SELECT soft_delete_document('org_documents','00000000-0000-0000-0000-000000000601') AS result")).rows[0].result,false,'baseline delete incorrectly returns false');
  await db.exec('RESET ROLE');
  assert.equal((await db.query("SELECT deleted_at IS NOT NULL AS changed FROM org_documents WHERE id='00000000-0000-0000-0000-000000000601'")).rows[0].changed,true,'baseline false delete actually changes row');
  await db.exec('SET LOCAL ROLE authenticated');
  assert.equal((await db.query("SELECT restore_document('org_documents','00000000-0000-0000-0000-000000000601') AS result")).rows[0].result,false,'baseline restore incorrectly returns false');
  await db.exec('RESET ROLE');
  assert.equal((await db.query("SELECT deleted_at IS NULL AS restored FROM org_documents WHERE id='00000000-0000-0000-0000-000000000601'")).rows[0].restored,true,'baseline false restore actually changes row');
  await db.exec('SET LOCAL ROLE authenticated; SAVEPOINT ambiguous_recycle_bin');
  await assert.rejects(() => db.query("SELECT * FROM list_recycle_bin('00000000-0000-0000-0000-000000000100')"),
    error => error.code === '42702' && error.message.includes('display_name'));
  await db.exec('ROLLBACK TO SAVEPOINT ambiguous_recycle_bin; RELEASE SAVEPOINT ambiguous_recycle_bin; RESET ROLE');
  const companySource = await read('supabase/migrations/20260111070409_bfd6d9ac-0f35-4d5e-80d2-dae9c3d59107.sql');
  for (const policy of companySource.matchAll(/CREATE POLICY[\s\S]*?;/g)) await db.exec(policy[0]);
  await db.exec(await read('supabase/migrations/20260412031147_79eeb953-fc24-4bce-9e26-a1088d60e0d6.sql'));
  await db.exec(`
    CREATE POLICY "Companies can view own record" ON companies FOR SELECT TO authenticated USING(id=current_company_id());
    CREATE POLICY "Companies can update own record" ON companies FOR UPDATE TO authenticated USING(id=current_company_id());
  `);
  const beforeOrg = (await db.query("SELECT pg_get_functiondef('public.current_organization_id()'::regprocedure) AS body")).rows[0].body;
  const retained = (await db.query(`SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
    WHERE schemaname='public' AND (policyname='account_deletion_no_revoked_access' OR policyname LIKE 'Companies can % own record')
    ORDER BY tablename,policyname`)).rows;
  // Also parse/run the read-only release artifacts against the fixture schema.
  const migrationSql = await read(migration);
  await db.exec(await read(folder + 'preflight.sql'));
  await db.exec(await read(folder + 'backup-definitions.sql'));
  // Prove the migration cannot silently apply against an old/permissive live
  // helper. Even this deliberately weakened fixture body is rolled back first.
  await db.exec(`SAVEPOINT unreviewed_helper;
    CREATE OR REPLACE FUNCTION public.can_access_organization(_organization_id uuid,_permission text DEFAULT 'settings.read')
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT true $$;`);
  await assert.rejects(() => db.exec(migrationSql), /Unreviewed staff access helper/);
  await db.exec('ROLLBACK TO SAVEPOINT unreviewed_helper; RELEASE SAVEPOINT unreviewed_helper');
  await db.exec(migrationSql);
  const postcheck = await db.exec(await read(folder + 'postcheck.sql'));
  let postflightChecks = 0;
  for (const result of postcheck) for (const row of result.rows || []) {
    if (Object.prototype.hasOwnProperty.call(row, 'ok')) {
      assert.equal(row.ok, true, 'postflight: ' + row.check_name);
      postflightChecks++;
    }
  }
  await db.exec(await read(folder + 'preflight-documents-journals.sql'));
  await db.exec(await read(folder + 'backup-documents-journals.sql'));
  await db.exec(await read(documentMigration));
  const documentPostcheck = await db.exec(await read(folder + 'postcheck-documents-journals.sql'));
  for (const result of documentPostcheck) for (const row of result.rows || []) {
    if (Object.prototype.hasOwnProperty.call(row,'ok')) {
      assert.equal(row.ok,true,'document postflight: '+row.check_name);
      postflightChecks++;
    }
  }
  assert.equal((await db.query("SELECT pg_get_functiondef('public.current_organization_id()'::regprocedure) AS body")).rows[0].body, beforeOrg, 'current organization helper untouched');
  assert.deepEqual((await db.query(`SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
    WHERE schemaname='public' AND (policyname='account_deletion_no_revoked_access' OR policyname LIKE 'Companies can % own record')
    ORDER BY tablename,policyname`)).rows, retained, 'company owner and restrictive policies untouched');
  // Compare all six actual frontend arrays, not a duplicate expected matrix.
  const frontend = await read('src/constants/rolePermissions.ts');
  let matrixChecks = 0;
  for (const role of ['owner', 'admin', 'school_editor', 'course_editor', 'teacher', 'sales_manager']) {
    const body = frontend.match(new RegExp('const ORG_' + role.toUpperCase() + ': Permission\\[\\] = \\[([\\s\\S]*?)\\];'))?.[1];
    assert.ok(body, 'frontend defaults ' + role);
    const expected = [...body.matchAll(/'([a-z_]+\.(?:read|write))'/g)].map(match => match[1]).sort();
    const actual = (await db.query('SELECT org_role_default_permissions($1) AS permissions', [role])).rows[0].permissions.sort();
    assert.deepEqual(actual, expected, role + ' SQL and UI matrix');
    matrixChecks++;
  }
  await db.exec(await read(folder + 'regression-rollback.sql'));
  await db.exec(await read(folder + 'regression-documents-journals.sql'));
  const checks = (await db.query("SELECT current_setting('sintagma.staff_assertions',true)::int AS count")).rows[0].count;
  await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT to_regclass('public.org_staff') AS table_name")).rows[0].table_name, null, 'entire fixture rolled back');
  console.log(JSON.stringify({ passed: true, sqlAssertions: checks, matrixChecks, postflightChecks, preservedDefinitionChecks: 2, baselineDocumentFalseResultsReproduced: 2, baselineRecycleAmbiguityReproduced: true, unreviewedHelperDenied: true, rolledBack: true,
    limitation: 'Isolated synthetic PostgreSQL only. No hosted definitions, live roles, browser outcomes, or concurrent database sessions verified.' }));
} catch (error) {
  console.error(JSON.stringify({ passed: false, code: error.code, message: error.message,
    where: typeof error.where === 'string' ? error.where.slice(0,800) : undefined }));
  process.exitCode = 1;
} finally {
  await db.close();
}
