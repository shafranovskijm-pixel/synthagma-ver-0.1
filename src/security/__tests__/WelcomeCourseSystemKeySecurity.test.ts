import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read(
  "supabase/migrations/20260822123030_eb38356e-5837-4f86-8959-7599ff9adae5.sql",
);
const marketplaceMigration = read(
  "supabase/migrations/20260822122920_1acc140d-c059-4397-a0fb-5a65380137cb.sql",
);
const welcomeSeed = read("supabase/functions/seed-welcome-course/index.ts");
const firstRun = read("src/lib/organization/firstRun.ts");
const coursesApi = read("src/api/courses.ts");
const organizationLoader = read("src/hooks/useOrganizationDataLoader.ts");
const subscriptionLimits = read("src/hooks/useSubscriptionLimits.ts");
const generatedTypes = read("src/integrations/supabase/types.ts");

function sqlFunctionBody(functionName: string, sql = migration): string {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${escapedName}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
  ));
  expect(match, `missing SQL body for ${functionName}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("stable system welcome-course identity", () => {
  it("backfills one deterministic exact-title candidate and enforces one key per tenant", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS system_key text");
    expect(migration).toContain("title = 'Добро пожаловать в СИНТАГМА'");
    expect(migration).toMatch(/row_number\(\)[\s\S]*?PARTITION BY organization_id/);
    expect(migration).toContain("candidate.candidate_rank = 1");
    expect(migration).toContain("CHECK (system_key IS NULL OR system_key = 'welcome')");
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*?\(organization_id, system_key\)[\s\S]*?WHERE system_key IS NOT NULL/,
    );
  });

  it("prevents ordinary course editors from minting or removing a system marker", () => {
    const guardBody = sqlFunctionBody("guard_course_system_key");

    expect(migration).toMatch(
      /CREATE TRIGGER guard_course_system_key\s+BEFORE INSERT OR UPDATE OF system_key, organization_id ON public\.courses/,
    );
    expect(guardBody).toContain("NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id");
    expect(guardBody).toContain("auth.role() = 'service_role'");
    expect(guardBody).toContain(
      "public.has_role('admin'::public.app_role, auth.uid())",
    );
    expect(guardBody).toContain("session_user IN ('postgres', 'supabase_admin')");
    expect(guardBody).toContain("ERRCODE = '42501'");
  });

  it("excludes only marked system rows from the serialized database quota", () => {
    const quotaBody = sqlFunctionBody("enforce_course_insert_limit");
    const organizationAt = quotaBody.indexOf("FROM public.organizations");
    const advisoryAt = quotaBody.indexOf("pg_advisory_xact_lock");
    const countAt = quotaBody.indexOf("FROM public.courses");

    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OF organization_id, system_key ON public\.courses/,
    );
    expect(quotaBody).toContain("IF NEW.system_key IS NOT NULL THEN");
    expect(quotaBody).toMatch(
      /FROM public\.courses\s+WHERE organization_id = NEW\.organization_id\s+AND system_key IS NULL/,
    );
    expect(organizationAt).toBeLessThan(advisoryAt);
    expect(advisoryAt).toBeLessThan(countAt);
  });

  it("seeds and detects welcome content only by the stable marker", () => {
    expect(welcomeSeed).toContain('.eq("system_key", "welcome")');
    expect(welcomeSeed).toMatch(/\.insert\(\{[\s\S]*?system_key:\s*"welcome"/);
    expect(welcomeSeed).toContain('courseErr?.code === "23505"');
    expect(welcomeSeed).toContain("concurrentCourse.id");
    expect(welcomeSeed).not.toContain('.eq("title", "Добро пожаловать в СИНТАГМА")');
    expect(firstRun).toContain('SYSTEM_WELCOME_COURSE_KEY = "welcome"');
    expect(firstRun).toContain("course.system_key === SYSTEM_WELCOME_COURSE_KEY");
    expect(firstRun).not.toContain("course.title");
    expect(coursesApi).toContain("organization_id, system_key, category_id");
    expect(organizationLoader).toContain("created_at, system_key, category_id");
    expect(generatedTypes).toMatch(/courses:\s*\{[\s\S]*?system_key: string \| null/);
  });

  it("does not count the marker in the UI quota and never copies it from marketplace", () => {
    expect(subscriptionLimits).toMatch(
      /\.from\("courses"\)[\s\S]*?\.eq\("organization_id", organizationId\)\s*\.is\("system_key", null\)/,
    );

    const purchaseBody = sqlFunctionBody(
      "purchase_marketplace_course",
      marketplaceMigration,
    );
    const courseInsert = purchaseBody.match(
      /INSERT INTO public\.courses\s*\(([\s\S]*?)\)\s*VALUES/,
    );
    expect(courseInsert).not.toBeNull();
    expect(courseInsert?.[1]).not.toMatch(/\bsystem_key\b/);
  });
});
