import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const courseLimitMigration = read(
  "supabase/migrations/20260822163000_system_welcome_course_marker.sql",
);
const importRpcMigration = read(
  "supabase/migrations/20260822161000_enforce_course_insert_limit.sql",
);
const latestAccessHelperMigration = read(
  "supabase/migrations/20260822120000_drop_legacy_courses_manage_policy.sql",
);
const importEdge = read("supabase/functions/import-course/index.ts");
const importPage = read("src/pages/CourseImport.tsx");
const learningPage = read("src/pages/CourseLearning.tsx");
const lessonItem = read("src/components/course-editor/LessonItem.tsx");

function sqlFunctionBody(functionName: string): string {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = courseLimitMigration.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${escapedName}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
  ));
  expect(match, `missing SQL body for ${functionName}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("secure course import migration contract", () => {
  it("matches every canonical plan maxCourses value", () => {
    const sqlLimits = Object.fromEntries(
      [...courseLimitMigration.matchAll(/WHEN '([^']+)' THEN (-?\d+)/g)]
        .map((match) => [match[1], Number(match[2])]),
    );

    const canonicalLimits = Object.fromEntries(
      Object.entries(SUBSCRIPTION_PLANS)
        .map(([planId, plan]) => [planId, plan.limits.maxCourses]),
    );

    expect(sqlLimits).toEqual(canonicalLimits);
    expect(courseLimitMigration).toMatch(
      /v_max_courses := COALESCE\(\s*v_custom_max,\s*CASE v_plan/,
    );
    expect(courseLimitMigration).toContain("IF v_max_courses <> -1 THEN");
    expect(courseLimitMigration).toContain(
      "v_current_courses >= GREATEST(v_max_courses, 0)",
    );
  });

  it("calls the current authorization helper with its actual signature", () => {
    expect(latestAccessHelperMigration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.can_access_organization\(\s*_organization_id uuid,\s*_permission text DEFAULT/,
    );
    expect(importRpcMigration).toContain(
      "public.can_access_organization(p_organization_id, 'courses.write')",
    );
  });

  it("counts normal courses from every caller but excludes the marked system course", () => {
    const body = sqlFunctionBody("enforce_course_insert_limit");

    expect(body).not.toContain("auth.role() = 'service_role'");
    expect(body).not.toContain("service_role bypass");
    expect(body).toMatch(
      /FROM public\.courses\s+WHERE organization_id = NEW\.organization_id\s+AND system_key IS NULL/,
    );
    expect(body).toContain("IF NEW.system_key IS NOT NULL THEN");
  });
});

describe("course import runtime security contract", () => {
  it("authorizes the explicit tenant with canonical courses.write permissions", () => {
    expect(importPage).toContain(
      "formData.append('organization_id', scopeState.scope.organizationId)",
    );
    expect(importEdge).toContain("formData.get('organization_id')");
    expect(importEdge).toContain("'can_access_organization'");
    expect(importEdge).toContain("_permission: 'courses.write'");
    expect(importEdge).not.toContain("roleData.role !== 'organization'");
  });

  it("sanitizes imported HTML before persistence and at raw lesson renderers", () => {
    expect(importPage).toContain("content: sanitizeCourseHtml(lesson.content)");
    expect(learningPage).toContain(
      "dangerouslySetInnerHTML={{ __html: sanitizeCourseHtml(",
    );
    expect(lessonItem).toContain(
      "dangerouslySetInnerHTML={{ __html: sanitizeCourseHtml(",
    );
  });
});
