import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase", "migrations");
const migrationFile = "20260822122207_5934a82f-c1a3-48c8-aa22-c1451e40bbe7.sql";
const migration = readFileSync(join(migrationsDirectory, migrationFile), "utf8");

describe("organization UPDATE policy migration contract", () => {
  it("ends the legacy broad policy history with an explicit drop", () => {
    const statements = readdirSync(migrationsDirectory)
      .filter((fileName) => fileName.endsWith(".sql"))
      .sort()
      .flatMap((fileName) => {
        const sql = readFileSync(join(migrationsDirectory, fileName), "utf8");
        return sql
          .split(/\r?\n/)
          .filter((line) =>
            /^(CREATE|DROP) POLICY/i.test(line.trim())
            && line.includes("Org users can update their organization"),
          )
          .map((line) => ({ fileName, line: line.trim() }));
      });

    expect(statements.at(-1)).toEqual({
      fileName: migrationFile,
      line: 'DROP POLICY IF EXISTS "Org users can update their organization" ON public.organizations;',
    });
  });

  it("keeps one canonical settings.write definition and replaces it only when stale", () => {
    expect(migration).toContain("FROM pg_policies");
    expect(migration).toContain("IF NOT COALESCE(v_policy_is_canonical, false) THEN");
    expect(migration).toMatch(/END;\s*\$migration\$;/);
    expect(migration).toContain("permissive = 'PERMISSIVE'");
    expect(migration).toContain("roles = ARRAY['authenticated']::name[]");
    expect(migration).not.toContain("roles @>");
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Org staff can update organization" ON public.organizations',
    );
    expect(migration.match(/CREATE POLICY "Org staff can update organization"/g)).toHaveLength(1);
    expect(migration).toMatch(
      /CREATE POLICY "Org staff can update organization"[\s\S]*?FOR UPDATE[\s\S]*?TO authenticated[\s\S]*?USING \(public\.can_access_organization\(id, 'settings\.write'\)\)[\s\S]*?WITH CHECK \(public\.can_access_organization\(id, 'settings\.write'\)\)/,
    );
    expect(migration).not.toMatch(/CREATE POLICY "Org users can update their organization"/);
  });
});
