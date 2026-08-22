import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const limitMigration = read(
  "supabase/migrations/20260822123030_eb38356e-5837-4f86-8959-7599ff9adae5.sql",
);
const importMigration = read(
  "supabase/migrations/20260822122237_1b5eab34-c7ad-4eab-911f-ecb7ce86d63a.sql",
);

function functionBody(functionName: string, sql = limitMigration): string {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${escapedName}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
    ),
  );

  expect(match, `missing SQL body for ${functionName}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("universal course limit gate", () => {
  it("installs an unconditional INSERT, organization move and marker-change trigger", () => {
    expect(limitMigration).toMatch(
      /CREATE TRIGGER enforce_course_insert_limit\s+BEFORE INSERT OR UPDATE OF organization_id, system_key ON public\.courses\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.enforce_course_insert_limit\(\);/,
    );
    expect(limitMigration).not.toMatch(
      /CREATE TRIGGER enforce_course_insert_limit[\s\S]*?\bWHEN\s*\(/,
    );
  });

  it("keeps the canonical tariff values and gives custom_max_courses priority", () => {
    const triggerBody = functionBody("enforce_course_insert_limit");
    const sqlLimits = Object.fromEntries(
      [...triggerBody.matchAll(/WHEN '([^']+)' THEN (-?\d+)/g)]
        .map((match) => [match[1], Number(match[2])]),
    );
    const canonicalLimits = Object.fromEntries(
      Object.entries(SUBSCRIPTION_PLANS)
        .map(([planId, plan]) => [planId, plan.limits.maxCourses]),
    );

    expect(sqlLimits).toEqual(canonicalLimits);
    expect(triggerBody).toMatch(
      /v_max_courses := COALESCE\(\s*v_custom_max,\s*CASE v_plan/,
    );
    expect(triggerBody).toContain("IF v_max_courses <> -1 THEN");
    expect(triggerBody).toContain("ELSE 3");
  });

  it("locks the tariff row before serializing the tenant-scoped count", () => {
    const triggerBody = functionBody("enforce_course_insert_limit");
    const lockAt = triggerBody.indexOf("pg_advisory_xact_lock");
    const tariffAt = triggerBody.indexOf("FROM public.organizations");
    const countAt = triggerBody.indexOf("FROM public.courses");
    const rejectionAt = triggerBody.indexOf("maximum course limit reached");

    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(tariffAt).toBeLessThan(lockAt);
    expect(lockAt).toBeLessThan(countAt);
    expect(countAt).toBeLessThan(rejectionAt);
    expect(triggerBody).toContain(
      "hashtextextended('course-limit:' || NEW.organization_id::text, 0)",
    );
    expect(triggerBody).toMatch(
      /FROM public\.courses\s+WHERE organization_id = NEW\.organization_id\s+AND system_key IS NULL/,
    );
    expect(triggerBody).toContain("FOR SHARE");
  });

  it("does not replace RLS authorization or special-case privileged inserts", () => {
    const triggerBody = functionBody("enforce_course_insert_limit");

    expect(triggerBody).not.toContain("auth.uid()");
    expect(triggerBody).not.toContain("service_role");
    expect(triggerBody).not.toContain("can_access_organization");
    expect(limitMigration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.enforce_course_insert_limit\(\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public, pg_temp/,
    );
    expect(limitMigration).toContain(
      "REVOKE ALL ON FUNCTION public.enforce_course_insert_limit() FROM PUBLIC",
    );
  });

  it("keeps import authorization but delegates its limit decision to the trigger", () => {
    const importBody = functionBody("create_imported_course", importMigration);

    expect(importBody).toContain("auth.uid()");
    expect(importBody).toContain(
      "public.can_access_organization(p_organization_id, 'courses.write')",
    );
    expect(importBody).toContain("INSERT INTO public.courses");
    expect(importBody).not.toContain("pg_advisory_xact_lock");
    expect(importBody).not.toContain("custom_max_courses");
    expect(importBody).not.toContain("count(*)");
  });
});
