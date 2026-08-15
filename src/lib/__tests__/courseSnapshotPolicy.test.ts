import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSnapshotOrganizationId } from "../courseSnapshotPolicy";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260815010000_harden_course_snapshots.sql",
);
const COURSE_BUILDER_PATH = resolve(process.cwd(), "src/pages/CourseBuilder.tsx");
const SNAPSHOT_HOOK_PATH = resolve(process.cwd(), "src/hooks/useCourseSnapshots.ts");

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

describe("course snapshot tenant policy", () => {
  it("uses only the organization stored on the course and fails closed", () => {
    expect(resolveSnapshotOrganizationId("course-org")).toBe("course-org");
    expect(resolveSnapshotOrganizationId("  course-org  ")).toBe("course-org");
    expect(resolveSnapshotOrganizationId("  ")).toBeNull();
    expect(resolveSnapshotOrganizationId(null)).toBeNull();
  });

  it("allows only admins, organization owners and permitted org staff", () => {
    const sql = compact(readFileSync(MIGRATION_PATH, "utf8"));

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.can_access_course_snapshots");
    expect(sql).toContain("public.has_role(auth.uid(), 'organization'::public.app_role)");
    expect(sql).toContain("platform_staff.role IN ('admin', 'super_admin')");
    expect(sql).toContain("platform_staff.expires_at IS NULL OR platform_staff.expires_at > now()");
    expect(sql).toContain("p.user_id = auth.uid() AND p.organization_id = c.organization_id");
    expect(sql).toContain("public.has_org_staff_permission( auth.uid(), c.organization_id, _permission )");
    expect(sql).not.toContain("public.has_admin_staff_role(auth.uid()");
    expect(sql).not.toContain("public.can_access_course(course_id, 'courses.write')");
    expect(sql).toContain("public.can_access_course_snapshots(course_id, 'courses.read')");
    expect(sql.match(/public\.can_access_course_snapshots\(course_id, 'courses\.write'\)/g)).toHaveLength(2);
    expect(sql.match(/c\.organization_id = course_snapshots\.organization_id/g)).toHaveLength(3);
  });

  it("fails a cross-tenant or missing snapshot before any restore mutation", () => {
    const sql = compact(readFileSync(MIGRATION_PATH, "utf8"));
    const restoreSql = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.restore_course_snapshot"),
    );
    const authorizedLookup = restoreSql.indexOf(
      "WHERE cs.id = _snapshot_id AND public.can_access_course_snapshots(cs.course_id, 'courses.write')",
    );
    const missingGuard = restoreSql.indexOf("IF NOT FOUND OR v_course_id IS NULL");
    const firstSnapshotInsert = restoreSql.indexOf("INSERT INTO public.course_snapshots");

    expect(authorizedLookup).toBeGreaterThan(-1);
    expect(missingGuard).toBeGreaterThan(authorizedLookup);
    expect(firstSnapshotInsert).toBeGreaterThan(missingGuard);
    expect(restoreSql).toContain("v_snapshot_org_id IS DISTINCT FROM v_course_org_id");
    expect(restoreSql).toContain(
      "v_payload->'course'->>'organization_id', '')::uuid IS DISTINCT FROM v_course_org_id",
    );
    expect(restoreSql).toContain("v_course_id, v_course_org_id, auth.uid()");
  });

  it("keeps restore atomic instead of swallowing partial document failures", () => {
    const sql = compact(readFileSync(MIGRATION_PATH, "utf8"));

    expect(sql).not.toContain("EXCEPTION WHEN OTHERS THEN NULL");
    expect(sql).toContain("Snapshot question references a lesson outside the snapshot");
    expect(sql).toContain("Snapshot lesson references a module outside the snapshot");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.restore_course_snapshot(uuid) FROM PUBLIC");
  });

  it("snapshots modules and rejects cross-course or missing module references", () => {
    const sql = compact(readFileSync(MIGRATION_PATH, "utf8"));
    const hook = compact(readFileSync(SNAPSHOT_HOOK_PATH, "utf8"));

    expect(hook).toContain('supabase.rpc("create_course_snapshot"');
    expect(hook).not.toContain("buildSnapshotPayload");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.create_course_snapshot");
    expect(sql).toContain("'course_modules', COALESCE");
    expect(sql).toContain("Snapshot module id belongs to another course");
    expect(sql).toContain("Snapshot lesson references a module outside the snapshot");
    expect(sql).toContain("Legacy snapshot lesson module is no longer available");
    expect(sql).toContain("Restore blocked: module is referenced by another course");
  });

  it("preserves lesson ids and fails before deleting FK-dependent extra lessons", () => {
    const sql = compact(readFileSync(MIGRATION_PATH, "utf8"));
    const restoreSql = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.restore_course_snapshot"),
    );
    const moduleRowLock = restoreSql.indexOf(
      "PERFORM cm.id FROM public.course_modules cm WHERE cm.course_id = v_course_id ORDER BY cm.id FOR UPDATE",
    );
    const lessonRowLock = restoreSql.indexOf(
      "PERFORM l.id FROM public.lessons l WHERE l.course_id = v_course_id ORDER BY l.id FOR UPDATE",
    );
    const dependencyGuard = restoreSql.indexOf("Restore blocked: lessons have dependent data in %.%");
    const lessonUpsert = restoreSql.indexOf("INSERT INTO public.lessons");
    const extraLessonDelete = restoreSql.indexOf("DELETE FROM public.lessons l WHERE l.id = ANY(v_extra_lesson_ids)");

    expect(restoreSql).not.toContain("DELETE FROM public.lessons WHERE course_id = v_course_id");
    expect(restoreSql).not.toContain("new_lesson_id := gen_random_uuid()");
    expect(restoreSql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(restoreSql).toContain("v_lesson_id, v_course_id");
    expect(restoreSql).toContain("con.confrelid = 'public.lessons'::regclass");
    expect(restoreSql).toContain("rel.relname = 'test_questions'");
    expect(moduleRowLock).toBeGreaterThan(-1);
    expect(lessonRowLock).toBeGreaterThan(-1);
    expect(lessonRowLock).toBeGreaterThan(moduleRowLock);
    expect(dependencyGuard).toBeGreaterThan(lessonRowLock);
    expect(dependencyGuard).toBeGreaterThan(-1);
    expect(lessonUpsert).toBeGreaterThan(dependencyGuard);
    expect(extraLessonDelete).toBeGreaterThan(lessonUpsert);
  });

  it("locks legacy modules before repeating their tenant check", () => {
    const sql = compact(readFileSync(MIGRATION_PATH, "utf8"));
    const restoreSql = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.restore_course_snapshot"),
    );
    const moduleLock = restoreSql.indexOf(
      "PERFORM cm.id FROM public.course_modules cm WHERE cm.course_id = v_course_id ORDER BY cm.id FOR UPDATE",
    );
    const lockedRecheck = restoreSql.indexOf(
      "Legacy snapshot lesson module is no longer available",
      moduleLock,
    );
    const firstRestoreMutation = restoreSql.indexOf("INSERT INTO public.course_snapshots", moduleLock);

    expect(moduleLock).toBeGreaterThan(-1);
    expect(lockedRecheck).toBeGreaterThan(moduleLock);
    expect(firstRestoreMutation).toBeGreaterThan(lockedRecheck);
  });

  it("fails closed before changing questions referenced by test attempts", () => {
    const sql = compact(readFileSync(MIGRATION_PATH, "utf8"));
    const restoreSql = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.restore_course_snapshot"),
    );
    const questionLock = restoreSql.indexOf(
      "PERFORM tq.id FROM public.test_questions tq JOIN public.lessons l ON l.id = tq.lesson_id WHERE l.course_id = v_course_id ORDER BY tq.id FOR UPDATE OF tq",
    );
    const attemptGuard = restoreSql.indexOf(
      "Restore blocked: test attempts depend on a different question version",
    );
    const questionDelete = restoreSql.indexOf("DELETE FROM public.test_questions tq");

    expect(questionLock).toBeGreaterThan(-1);
    expect(restoreSql).toContain("FROM public.test_attempts ta WHERE ta.lesson_id = ANY(v_snapshot_lesson_ids)");
    expect(restoreSql).toContain("jsonb_agg(to_jsonb(tq) ORDER BY tq.lesson_id, tq.order_index, tq.id)");
    expect(attemptGuard).toBeGreaterThan(questionLock);
    expect(questionDelete).toBeGreaterThan(attemptGuard);
  });

  it("creates one coherent server-side snapshot under deterministic row locks", () => {
    const sql = compact(readFileSync(MIGRATION_PATH, "utf8"));
    const hook = compact(readFileSync(SNAPSHOT_HOOK_PATH, "utf8"));
    const createSql = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.create_course_snapshot"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.restore_course_snapshot"),
    );
    const moduleLock = createSql.indexOf("PERFORM cm.id FROM public.course_modules cm");
    const lessonLock = createSql.indexOf("PERFORM l.id FROM public.lessons l");
    const questionLock = createSql.indexOf("PERFORM tq.id FROM public.test_questions tq");
    const documentLock = createSql.indexOf("PERFORM d.id FROM public.course_documents d");
    const snapshotInsert = createSql.indexOf("INSERT INTO public.course_snapshots");

    expect(createSql).toContain("public.can_access_course_snapshots(c.id, 'courses.write')");
    expect(moduleLock).toBeGreaterThan(-1);
    expect(lessonLock).toBeGreaterThan(moduleLock);
    expect(questionLock).toBeGreaterThan(lessonLock);
    expect(documentLock).toBeGreaterThan(questionLock);
    expect(snapshotInsert).toBeGreaterThan(documentLock);
    expect(createSql).toContain("'course_modules', COALESCE");
    expect(hook).toContain('supabase.rpc("create_course_snapshot"');
    expect(hook).not.toContain("Promise.all");
  });

  it("keeps question conflict updates tenant-scoped", () => {
    const sql = compact(readFileSync(MIGRATION_PATH, "utf8"));

    expect(sql).toContain("INSERT INTO public.test_questions AS existing_question");
    expect(sql).toContain("existing_owner.id = existing_question.lesson_id");
    expect(sql).toContain("existing_owner.course_id = v_course_id");
    expect(sql).toContain("IF NOT FOUND THEN RAISE EXCEPTION 'Snapshot question id belongs to another course'");
  });

  it("uses the real course_documents schema during restore", () => {
    const sql = compact(readFileSync(MIGRATION_PATH, "utf8"));

    expect(sql).toContain("id, course_id, name, type, description, file_url, created_at, updated_at");
    expect(sql).not.toContain("title, file_url, file_type, file_size");
    expect(sql).not.toContain("locked_until");
  });

  it("does not start AI review when the required safety snapshot is null", () => {
    const source = compact(readFileSync(COURSE_BUILDER_PATH, "utf8"));

    expect(source).toMatch(
      /const safetySnapshot = await createSnapshot\("before_ai_review", [^)]+\); if \(!safetySnapshot\) return; setShowReviewDialog\(true\); await startReview\(resolvedCourseId\);/,
    );
  });
});
