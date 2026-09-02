import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dryRun = readFileSync(resolve(
  process.cwd(),
  "supabase/tests/course_library_migration_dry_run.sql",
), "utf8");
const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260903100000_csz_electronic_library_schema.sql",
), "utf8");
const stagingWrapper = readFileSync(resolve(
  process.cwd(),
  "scripts/run-course-library-migration-dry-run.ps1",
), "utf8");
const localWrapper = readFileSync(resolve(
  process.cwd(),
  "scripts/run-course-library-local-postgres.ps1",
), "utf8");
const localBaseFixture = readFileSync(resolve(
  process.cwd(),
  "supabase/tests/fixtures/course_library_local_base.sql",
), "utf8");
const localRlsContract = readFileSync(resolve(
  process.cwd(),
  "supabase/tests/course_library_local_rls_contract.sql",
), "utf8");

function stripSqlCommentsAndQuotedContent(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/'(?:''|[^'])*'/g, " ");
}

describe("electronic library migration dry-run contract", () => {
  it("applies the migration only inside an explicit rolled-back transaction", () => {
    const begin = dryRun.indexOf("BEGIN;");
    const include = dryRun.indexOf(
      "\\ir ../migrations/20260903100000_csz_electronic_library_schema.sql",
    );
    const rollback = dryRun.lastIndexOf("ROLLBACK;");
    const pass = dryRun.lastIndexOf("PASS - migration verified");

    expect(begin).toBeGreaterThan(-1);
    expect(include).toBeGreaterThan(begin);
    expect(rollback).toBeGreaterThan(include);
    expect(pass).toBeGreaterThan(rollback);
  });

  it("requires an externally provisioned clone-only guard token", () => {
    expect(dryRun).toContain("staging_guard_token is required; refusing to run");
    expect(dryRun).toContain("public.sintagma_staging_guard");
    expect(dryRun).toContain("staging guard token does not match");
    expect(dryRun).not.toMatch(/\\set\s+protected_course_id\s+['"]/);
    expect(dryRun).not.toMatch(/CREATE\s+TABLE\s+public\.sintagma_staging_guard/i);
    expect(dryRun).not.toMatch(/INSERT\s+INTO\s+public\.sintagma_staging_guard/i);
    expect(stagingWrapper).not.toMatch(
      /CREATE\s+TABLE\s+public\.sintagma_staging_guard/i,
    );
    expect(stagingWrapper).not.toMatch(
      /INSERT\s+INTO\s+public\.sintagma_staging_guard/i,
    );
    expect(dryRun.match(/\\quit 3/g)).toHaveLength(2);
  });

  it("rejects production and validates explicit staging allowlists before psql", () => {
    const hostGuard = stagingWrapper.indexOf(
      "$DatabaseHost -notin $AllowedStagingHosts",
    );
    const productionGuard = stagingWrapper.indexOf(
      "$DetectedProjectRef -eq $ProductionProjectRef",
    );
    const refAllowlistGuard = stagingWrapper.indexOf(
      "$DetectedProjectRef -notin $AllowedStagingProjectRefs",
    );
    const firstPsqlInvocation = stagingWrapper.indexOf("& $ResolvedPsql.Source");
    const sentinelProbe = stagingWrapper.indexOf(
      "FROM public.sintagma_staging_guard",
    );
    const dryRunInvocation = stagingWrapper.lastIndexOf("& $ResolvedPsql.Source");

    expect(stagingWrapper).toContain("atxwvjxbqjgkbjlhsdch");
    expect(stagingWrapper).toContain("SINTAGMA_ALLOWED_STAGING_PROJECT_REFS");
    expect(stagingWrapper).toContain("SINTAGMA_ALLOWED_STAGING_HOSTS");
    expect(stagingWrapper).toContain("Could not derive a Supabase project ref");
    expect(hostGuard).toBeGreaterThan(-1);
    expect(productionGuard).toBeGreaterThan(hostGuard);
    expect(refAllowlistGuard).toBeGreaterThan(productionGuard);
    expect(firstPsqlInvocation).toBeGreaterThan(refAllowlistGuard);
    expect(sentinelProbe).toBeGreaterThan(refAllowlistGuard);
    expect(dryRunInvocation).toBeGreaterThan(firstPsqlInvocation);
  });

  it("rejects transaction-breaking edits in the included migration", () => {
    const executableSql = stripSqlCommentsAndQuotedContent(migration);

    expect(executableSql).not.toMatch(
      /^\s*(?:BEGIN|COMMIT|ROLLBACK|END|START\s+TRANSACTION)\s*;/gim,
    );
    expect(executableSql).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/gi);
    expect(executableSql).not.toMatch(/^\s*\\(?:connect|c|gexec|include|i|ir|quit|q)\b/gim);
  });

  it("fails before migration when the protected course or required infrastructure is missing", () => {
    expect(dryRun).toContain("protected_course_id");
    expect(dryRun).toContain("is_published = true");
    expect(dryRun).toContain("Required SINTAGMA or Supabase tables are missing");
    expect(dryRun).toContain(
      "public.courses.landing_content jsonb feature gate is missing",
    );
    expect(dryRun).toContain("Required library-files bucket is missing");
    expect(dryRun).toContain("Required permission helpers are missing");
  });

  it("compares protected course, legacy library and storage fingerprints", () => {
    for (const fingerprint of [
      "course_hash",
      "modules_hash",
      "lessons_hash",
      "test_questions_hash",
      "protected_course_documents_hash",
      "legacy_library_core_hash",
      "library_folders_hash",
      "library_storage_objects_hash",
    ]) {
      expect(dryRun).toContain(fingerprint);
    }

    expect(dryRun).toContain("Protected published course changed during migration dry-run");
    expect(dryRun).toContain("Legacy library identity/content changed or disappeared");
    expect(dryRun).toContain("Legacy library folders changed during migration dry-run");
    expect(dryRun).toContain("library-files objects changed during migration dry-run");
  });

  it("checks the schema, RLS, policies, triggers, constraints and indexes after migration", () => {
    for (const contractMarker of [
      "RLS is not enabled on every protected relation",
      "One or more table RLS policies are missing",
      "One or more private Storage policies are missing",
      "All four Storage commands require restrictive PUBLIC guards",
      "Electronic-library column ownership/type/nullability/default contract drifted",
      "Electronic-library constraint ownership or pg_get_constraintdef contract drifted",
      "Electronic-library trigger ownership or pg_get_triggerdef contract drifted",
      "Electronic-library index ownership/uniqueness/predicate/pg_get_indexdef contract drifted",
    ]) {
      expect(dryRun).toContain(contractMarker);
    }

    for (const catalogPrimitive of [
      "format_type(attribute.atttypid, attribute.atttypmod)",
      "pg_get_expr(",
      "constraint_row.conrelid = relation.oid",
      "pg_get_constraintdef(constraint_row.oid, true)",
      "trigger_row.tgrelid = relation.oid",
      "pg_get_triggerdef(trigger_row.oid, true)",
      "index_row.indrelid = relation.oid",
      "index_row.indisunique",
      "index_row.indpred",
      "pg_get_indexdef(index_row.indexrelid)",
    ]) {
      expect(dryRun).toContain(catalogPrimitive);
    }
  });

  it("keeps psql variables outside PL/pgSQL dollar-quoted blocks", () => {
    const taggedBlocks = [...dryRun.matchAll(
      /\$([A-Za-z_][A-Za-z0-9_]*)\$([\s\S]*?)\$\1\$/g,
    )].map((match) => match[2]);
    const untaggedBlocks = [...dryRun.matchAll(/\$\$([\s\S]*?)\$\$/g)]
      .map((match) => match[1]);
    const dollarQuotedBlocks = [...taggedBlocks, ...untaggedBlocks];

    expect(dollarQuotedBlocks.length).toBeGreaterThan(0);
    for (const block of dollarQuotedBlocks) {
      expect(block).not.toContain(":'protected_course_id'");
      expect(block).not.toContain(":'staging_guard_token'");
    }
  });

  it("keeps the reproducible local harness isolated on D: and loopback", () => {
    expect(localWrapper).toContain("GetPathRoot($fullPath) -ne 'D:\\'");
    expect(localWrapper).toContain("[Net.IPAddress]::Loopback");
    expect(localWrapper).toContain("-h 127.0.0.1 -p $Port");
    expect(localWrapper).toContain("PostgreSQL\\) 17\\.");
    expect(localWrapper).toContain("$ServerStarted = $false");
    expect(localWrapper).toContain("} finally {");
    expect(localWrapper).toContain("'pg_ctl stop'");
    expect(localWrapper).toContain("--no-psqlrc");
    expect(localWrapper).toContain("--no-password");
    expect(localWrapper).not.toContain("SINTAGMA_STAGING_DATABASE_URL");
    expect(localWrapper).not.toContain("atxwvjxbqjgkbjlhsdch");
    expect(localWrapper).not.toMatch(/postgres(?:ql)?:\/\//i);
  });

  it("runs the catalog rollback before disposable migration and RLS checks", () => {
    const baseIndex = localWrapper.indexOf("'base fixture'");
    const dryRunIndex = localWrapper.indexOf("'migration catalog dry-run'");
    const migrationIndex = localWrapper.indexOf("'apply migration to disposable database'");
    const rlsIndex = localWrapper.indexOf("'local RLS contract'");

    expect(baseIndex).toBeGreaterThan(-1);
    expect(dryRunIndex).toBeGreaterThan(baseIndex);
    expect(migrationIndex).toBeGreaterThan(dryRunIndex);
    expect(rlsIndex).toBeGreaterThan(migrationIndex);
    expect(localBaseFixture).toContain("local-isolated-course-library");
    expect(localBaseFixture).toContain("'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'");
    expect(localRlsContract).toContain(
      "PASS - local PostgreSQL parser, catalog and RLS contract verified",
    );
    expect(localRlsContract.match(/ROLLBACK;/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
