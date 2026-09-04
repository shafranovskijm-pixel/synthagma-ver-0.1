import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260903100000_csz_electronic_library_schema.sql",
), "utf8");
const libraryApi = readFileSync(resolve(process.cwd(), "src/api/courseLibrary.ts"), "utf8");
const learningFacade = readFileSync(resolve(
  process.cwd(),
  "src/hooks/course-learning/useCourseLearningFacade.ts",
), "utf8");
const studentDashboard = readFileSync(resolve(process.cwd(), "src/pages/StudentDashboard.tsx"), "utf8");
const studentDashboardHook = readFileSync(resolve(
  process.cwd(),
  "src/hooks/useStudentDashboard.ts",
), "utf8");

function sqlFunctionBody(functionName: string): string {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = migration.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${escapedName}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
  ));
  expect(match, `missing SQL body for ${functionName}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("electronic library migration security contract", () => {
  it("fails closed unless managed Storage RLS is already enabled without altering its table", () => {
    const guard = migration.match(/DO \$csz_storage_rls_guard\$([\s\S]*?)\$csz_storage_rls_guard\$;/)?.[1];

    expect(guard).toBeDefined();
    expect(guard).toContain("to_regclass('storage.objects') IS NULL");
    expect(guard).toMatch(/OR NOT EXISTS\s*\(\s*SELECT 1\s+FROM pg_class\s+WHERE oid = to_regclass\('storage\.objects'\)\s+AND relrowsecurity IS TRUE\s*\)/);
    expect(guard).toContain("RAISE EXCEPTION 'Managed storage.objects must already have row level security enabled'");
    expect(guard).not.toMatch(/EXCEPTION WHEN|SET ROLE|GRANT|OWNER TO/i);
    expect(migration).not.toMatch(/ALTER TABLE\s+storage\.objects\s+(?:ENABLE|DISABLE|FORCE|NO FORCE)\s+ROW LEVEL SECURITY/i);
  });

  it("keeps the existing bucket private without losing resolvable legacy paths", () => {
    expect(migration).toContain("/storage/v1/object/(?:public|sign)/library-files/([^?]+)");
    expect(migration).toContain("Some legacy library-files URLs could not be converted");
    expect(migration).toMatch(/UPDATE storage\.buckets\s+SET public = false\s+WHERE id = 'library-files'/);
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_library_documents_storage_path");
  });

  it("allows learners through a current, tenant-bound explicit enrollment", () => {
    const body = sqlFunctionBody("can_access_course_as_learner");

    expect(body).toContain("JOIN public.courses c ON c.id = e.course_id");
    expect(body).toContain("JOIN public.profiles p");
    expect(body).toContain("p.organization_id = c.organization_id");
    expect(body).not.toContain("c.is_published = true");
    expect(body).toContain("e.status IN ('active', 'completed')");
    expect(body).toContain("e.expires_at IS NULL");
    expect(body).toContain("e.expires_at > now()");
    expect(body).not.toContain("student_groups");
  });

  it("returns an unpublished library shell only through a column-limited RPC", () => {
    const body = sqlFunctionBody("get_course_electronic_library_shell");
    const returnedPayload = body.slice(body.indexOf("RETURN jsonb_build_object"));

    expect(body).toContain("c.landing_content @> '{\"electronic_library\":{\"enabled\":true}}'::jsonb");
    expect(body).toContain("can_access_course(p_course_id, 'courses.read')");
    expect(body).toContain("can_access_course_as_learner(p_course_id)");
    expect(body).toContain("'course_id', v_course.id");
    expect(body).toContain("'title', v_course.title");
    expect(body).toContain("'library_only', NOT v_course.is_published");
    expect(body).toContain("'id', cm.id");
    expect(body).toContain("'title', cm.title");
    expect(body).toContain("'order_index', cm.order_index");
    expect(returnedPayload).not.toContain("description");
    expect(returnedPayload).not.toContain("landing_content");
    expect(migration).not.toContain("CREATE POLICY course_library_enrolled_course_select");
    expect(migration).not.toContain("CREATE POLICY course_library_enrolled_module_select");
    expect(migration).not.toContain("course_library_enrolled_lesson_select");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_course_electronic_library_shell(uuid) FROM PUBLIC, anon",
    );

    const guard = migration.match(
      /CREATE POLICY course_library_unpublished_course_guard[\s\S]*?\n\);/,
    )?.[0] ?? "";
    expect(guard).toContain("AS RESTRICTIVE");
    expect(guard).toContain("can_access_course(id, 'courses.read')");
    expect(guard).not.toContain("can_access_course_as_learner(id)");

    const moduleGuard = migration.match(
      /CREATE POLICY course_library_unpublished_module_guard[\s\S]*?\n\);/,
    )?.[0] ?? "";
    expect(moduleGuard).toContain("AS RESTRICTIVE");
    expect(moduleGuard).toContain("visible_course.id = course_modules.course_id");
    expect(moduleGuard).toContain("can_access_course(visible_course.id, 'courses.read')");
    expect(moduleGuard).not.toContain("can_access_course_as_learner");
  });

  it("redacts unpublished library metadata from the SECURITY DEFINER dashboard snapshot", () => {
    const body = sqlFunctionBody("get_student_dashboard_snapshot");

    expect(body).toContain("NOT c.is_published");
    expect(body).toContain("AS library_only");
    expect(body).toContain(
      "CASE WHEN course_flags.library_only THEN NULL ELSE c.description END",
    );
    expect(body).toContain(
      "CASE WHEN course_flags.library_only THEN NULL ELSE c.duration END",
    );
    expect(body).toContain(
      "CASE WHEN course_flags.library_only THEN NULL ELSE c.cover_image_url END",
    );
    expect(body).toMatch(
      /WHEN course_flags\.library_only THEN 0[\s\S]*?AS total_lessons/,
    );
    expect(body).toMatch(
      /WHEN course_flags\.library_only THEN 0[\s\S]*?AS completed_lessons/,
    );
    expect(body).toContain("en.status IN ('active', 'completed')");
    expect(body).toContain("en.expires_at > now()");
    expect(body).toContain("learner_profile.user_id = p_user_id");
    expect(body).toContain("learner_profile.organization_id = c.organization_id");
    expect(body).toContain("public.can_access_course(c.id, 'courses.read')");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_student_dashboard_snapshot(uuid) FROM PUBLIC, anon",
    );
  });

  it("routes an unpublished enrollment to the library without fetching lessons or full course rows", () => {
    expect(libraryApi).toContain("rpc(\"get_course_electronic_library_shell\"");
    expect(libraryApi).not.toContain('.from("course_modules")');

    const branchStart = learningFacade.indexOf("if (requestedLibraryOnly)");
    const branchReturn = learningFacade.indexOf("return;", branchStart);
    const normalCourseFetch = learningFacade.indexOf("const [courseResult", branchStart);
    const branch = learningFacade.slice(branchStart, branchReturn);
    expect(branchStart).toBeGreaterThan(-1);
    expect(branch).toContain("fetchCourseLibraryShell");
    expect(branch).not.toContain(".from('courses')");
    expect(branch).not.toContain(".from('lessons')");
    expect(branchReturn).toBeLessThan(normalCourseFetch);

    const dashboardHandler = studentDashboard.slice(
      studentDashboard.indexOf("const handleCourseClick"),
      studentDashboard.indexOf("// Bottom navigation items"),
    );
    expect(dashboardHandler).toContain("fetchCourseLibraryShell(courseId)");
    expect(dashboardHandler).toContain("shell.libraryOnly");
    expect(dashboardHandler).toContain("/learn?view=library");
    expect(dashboardHandler.indexOf("shell.libraryOnly"))
      .toBeLessThan(dashboardHandler.indexOf("needsVerification"));

    expect(studentDashboardHook).toContain("const hiddenCourseEnrollments = enrollments.filter(e => !e.courses)");
    expect(studentDashboardHook).toContain("fetchCourseLibraryShell(enrollment.course_id)");
    expect(studentDashboardHook).toContain("!result.value.shell.libraryOnly");
    expect(studentDashboardHook).toContain("id: shell.courseId");
  });

  it("shows drafts only to library writers while read-only teachers use the active course path", () => {
    const body = sqlFunctionBody("can_read_electronic_library_document");

    expect(body).toContain("can_access_organization(ld.organization_id, 'library.write')");
    expect(body).toContain("ld.library_status = 'active'");
    expect(body).toContain("cd.visible_to_students");
    expect(body).toContain("JOIN public.courses c ON c.id = cd.course_id");
    expect(body).toContain("c.landing_content @> '{\"electronic_library\":{\"enabled\":true}}'::jsonb");
    expect(body).toContain("can_access_course(cd.course_id, 'courses.read')");
  });

  it("rejects library assignments unless the target course explicitly enables the feature", () => {
    const body = sqlFunctionBody("validate_course_library_assignment_scope");

    expect(body).toContain("v_course_electronic_library_enabled");
    expect(body).toContain("c.landing_content @> '{\"electronic_library\":{\"enabled\":true}}'::jsonb");
    expect(body).toContain("electronic library is not explicitly enabled for course %");
  });

  it("authorizes files by exact canonical path and never overwrites referenced evidence", () => {
    const readBody = sqlFunctionBody("can_read_library_file_object");
    const orphanBody = sqlFunctionBody("can_delete_orphan_library_file_object");

    expect(readBody).toContain("ld.storage_path = _object_name");
    expect(orphanBody).toContain("can_manage_library_file_object(_object_name)");
    expect(orphanBody).toContain("WHERE ld.storage_path = _object_name");
    expect(migration).toMatch(
      /CREATE POLICY library_files_private_update[\s\S]*can_delete_orphan_library_file_object\(name\)/,
    );
    expect(migration).toMatch(
      /CREATE POLICY library_files_private_delete[\s\S]*can_delete_orphan_library_file_object\(name\)/,
    );
  });

  it("adds restrictive storage guards so an unknown permissive policy cannot bypass the private bucket", () => {
    for (const command of ["select", "insert", "update", "delete"]) {
      expect(migration).toContain(`CREATE POLICY library_files_restrictive_${command}`);
    }
    expect(migration.match(
      /CREATE POLICY library_files_restrictive_(?:select|insert|update|delete)[\s\S]*?AS RESTRICTIVE/g,
    )).toHaveLength(4);
    expect(migration).toContain("bucket_id <> 'library-files'");
  });

  it("requires both course and library write access for a library-backed assignment", () => {
    expect(migration).toMatch(
      /CREATE POLICY course_documents_insert[\s\S]*can_access_course\(course_id, 'courses.write'\)[\s\S]*'library.write'/,
    );
    expect(migration).toMatch(
      /CREATE POLICY course_documents_update[\s\S]*can_access_course\(course_id, 'courses.write'\)[\s\S]*'library.write'/,
    );
  });

  it("does not expose legacy direct documents from an unpublished course", () => {
    expect(migration).toMatch(
      /library_document_id IS NULL[\s\S]*learner_course\.is_published = true/,
    );
  });

  it("keeps audit identity server controlled and invalidates stale checks when a source changes", () => {
    const body = sqlFunctionBody("validate_library_document_scope");

    expect(body).toContain("NEW.created_by := OLD.created_by");
    expect(body).toContain("NEW.last_checked_at := NULL");
    expect(body).toContain("NEW.library_status := 'needs_review'");
    expect(body).toContain("NEW.archived_at := now()");
    expect(body).toContain("NEW.archived_by := auth.uid()");
    expect(body).toContain("last_checked_at cannot be in the future");
  });
});
