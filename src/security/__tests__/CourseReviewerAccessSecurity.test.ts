import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260913130000_course_scoped_reviewer_access.sql",
), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/api/courseReviewer.ts"), "utf8");
const hook = readFileSync(resolve(process.cwd(), "src/hooks/useReviewerCoursePreview.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/CourseReviewer.tsx"), "utf8");
const grantActionPath = resolve(process.cwd(), "scripts/grant-license-edu-course-review.mjs");
const grantAction = readFileSync(grantActionPath, "utf8");

function functionBody(name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = migration.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${escaped}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
  ));
  expect(match, `missing SQL function ${name}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("course reviewer database security contract", () => {
  it("keeps grants private and exact to a user, course, expiry and revocation state", () => {
    expect(migration).toContain("PRIMARY KEY (course_id, user_id)");
    expect(migration).toContain("ALTER TABLE public.course_review_grants ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.course_review_grants FROM PUBLIC, anon, authenticated");
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?course_review_grants/i);

    const body = functionBody("can_review_course");
    expect(body).toContain("grant_row.course_id = p_course_id");
    expect(body).toContain("grant_row.user_id = auth.uid()");
    expect(body).toContain("grant_row.revoked_at IS NULL");
    expect(body).toContain("grant_row.expires_at > now()");
    expect(body).toContain("course_row.is_published IS FALSE");
  });

  it("exposes only authenticated SECURITY DEFINER read RPCs", () => {
    for (const name of ["get_course_review_snapshot", "get_course_review_lesson"]) {
      const declaration = migration.slice(
        migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`),
        migration.indexOf("$function$;", migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)) + 11,
      );
      expect(declaration).toContain("STABLE");
      expect(declaration).toContain("SECURITY DEFINER");
      expect(declaration).toContain("SET search_path = public");
      expect(declaration).toContain("Course review is unavailable");
      expect(functionBody(name)).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|UPSERT|MERGE)\b/i);
    }
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_course_review_snapshot(uuid) FROM PUBLIC, anon",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.get_course_review_lesson(uuid, uuid) FROM PUBLIC, anon",
    );
  });

  it("removes relational and embedded answer keys before delivery", () => {
    const lessonBody = functionBody("get_course_review_lesson");
    const safeOptions = functionBody("course_review_safe_options");
    const safeContent = functionBody("course_review_safe_lesson_content");

    expect(lessonBody).toContain("public.course_review_safe_options(question_row.options)");
    expect(lessonBody).toContain("public.course_review_safe_lesson_content(v_lesson.content)");
    expect(lessonBody).not.toContain("question_row.correct_answer");
    expect(lessonBody).not.toContain("question_row.explanation");
    expect(safeOptions).toContain("to_jsonb(");
    expect(safeOptions).toContain("jsonb_agg(");
    expect(safeOptions).not.toContain("isCorrect");
    expect(safeContent).toContain("Rebuild every supported content block from an explicit field allowlist");
    expect(safeContent).toContain("jsonb_strip_nulls(jsonb_build_object(");
    expect(safeContent).toContain("public.course_review_json_string(block_row.value->'content')");
    expect(safeContent).toContain("public.course_review_safe_table_rows(block_row.value->'tableRows')");
    expect(safeContent).toContain("public.course_review_safe_slider_slides(block_row.value->'sliderSlides')");
    expect(safeContent).not.toContain("'isCorrect'");
    expect(safeContent).not.toContain("'quizExplanation'");
    expect(safeContent).not.toContain("'correctAnswer'");
    expect(safeContent).not.toContain("'pendingAI'");

    const safeTableRows = functionBody("course_review_safe_table_rows");
    expect(safeTableRows).toContain("jsonb_typeof(row_item.value) = 'array'");
    expect(safeTableRows).toContain("jsonb_typeof(cell_item.value) = 'string'");

    const safeSlides = functionBody("course_review_safe_slider_slides");
    expect(safeSlides).toContain("public.course_review_json_string(slide_item.value->'content')");
  });

  it("orders the traversal by module and then by lesson, with unassigned elements last", () => {
    const snapshotBody = functionBody("get_course_review_snapshot");
    expect(snapshotBody).toContain("LEFT JOIN public.course_modules lesson_module");
    expect(snapshotBody).toContain("(lesson_module.id IS NULL)");
    expect(snapshotBody).toContain("lesson_module.order_index");
    expect(snapshotBody).toContain("lesson_row.order_index");
  });

  it("shows only library records that are both learner-visible and active", () => {
    const snapshotBody = functionBody("get_course_review_snapshot");
    expect(snapshotBody).toContain("course_document.visible_to_students IS TRUE");
    expect(snapshotBody).toContain("library_document.library_status = 'active'");
  });

  it("resolves an existing reviewer identifier only inside an admin-only grant action", () => {
    const grantBody = functionBody("admin_upsert_course_review_grant");
    expect(grantBody).toContain("public.has_role('admin'::public.app_role, v_actor)");
    expect(grantBody).toContain("lower(COALESCE(profile_row.login, '')) = v_identifier");
    expect(grantBody).toContain("v_candidate_count <> 1");
    expect(grantBody).toContain("ON CONFLICT (course_id, user_id) DO UPDATE");
    expect(grantBody).toContain("p_expires_at > now() + interval '30 days'");
  });

  it("prepares an exact idempotent license_edu action without guessing a uid", () => {
    expect(grantAction).toContain('TARGET_COURSE_ID = "7630559a-6caf-42e7-97f9-1cd0e4598c39"');
    expect(grantAction).toContain('TARGET_USER_IDENTIFIER = "license_edu"');
    expect(grantAction).toContain("admin_upsert_course_review_grant");
    expect(grantAction).toContain('process.argv.includes("--execute")');
    expect(grantAction).not.toMatch(/\bp_user_id\s*:/);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const dryRun = JSON.parse(execFileSync(
      process.execPath,
      [grantActionPath, `--expires-at=${expiresAt}`],
      { encoding: "utf8" },
    ));
    expect(dryRun).toMatchObject({
      status: "DRY_RUN_ONLY",
      action: "admin_upsert_course_review_grant",
      request: {
        p_course_id: "7630559a-6caf-42e7-97f9-1cd0e4598c39",
        p_user_identifier: "license_edu",
      },
    });

    const revokeDryRun = JSON.parse(execFileSync(
      process.execPath,
      [grantActionPath, "--revoke"],
      { encoding: "utf8" },
    ));
    expect(revokeDryRun).toEqual({
      status: "DRY_RUN_ONLY",
      action: "admin_revoke_course_review_grant",
      request: {
        p_course_id: "7630559a-6caf-42e7-97f9-1cd0e4598c39",
        p_user_identifier: "license_edu",
      },
      note: expect.any(String),
    });

    const nullResponsePreload = `data:text/javascript,${encodeURIComponent(
      'globalThis.fetch=async()=>({ok:true,status:200,text:async()=>"null"})',
    )}`;
    const rejectedNullResponse = spawnSync(
      process.execPath,
      [
        "--import",
        nullResponsePreload,
        grantActionPath,
        `--expires-at=${expiresAt}`,
        "--execute",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SINTAGMA_SUPABASE_URL: "https://atxwvjxbqjgkbjlhsdch.supabase.co",
          SINTAGMA_SUPABASE_ANON_KEY: "test-public-key",
          SINTAGMA_ADMIN_ACCESS_TOKEN: "test-admin-token",
        },
      },
    );
    expect(rejectedNullResponse.status).toBe(1);
    expect(rejectedNullResponse.stderr).toContain(
      "Reviewer access RPC must return one non-null JSON object",
    );

    const noFetchPreload = `data:text/javascript,${encodeURIComponent(
      'globalThis.fetch=async()=>{throw new Error("FETCH_CALLED")}',
    )}`;
    const rejectedHost = spawnSync(
      process.execPath,
      [
        "--import",
        noFetchPreload,
        grantActionPath,
        `--expires-at=${expiresAt}`,
        "--execute",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SINTAGMA_SUPABASE_URL: "http://attacker.example/supabase",
          SINTAGMA_SUPABASE_ANON_KEY: "test-public-key",
          SINTAGMA_ADMIN_ACCESS_TOKEN: "test-admin-token",
        },
      },
    );
    expect(rejectedHost.status).toBe(1);
    expect(rejectedHost.stderr).toContain(
      "SINTAGMA_SUPABASE_URL must be exactly https://atxwvjxbqjgkbjlhsdch.supabase.co",
    );
    expect(rejectedHost.stderr).not.toContain("FETCH_CALLED");
  });
});

describe("course reviewer frontend security contract", () => {
  it("uses a narrowed RPC-only data layer with user/course separated caches", () => {
    expect(api).toContain("const reviewerRpc = supabase as unknown as CourseReviewerRpcClient");
    expect(api).toContain('reviewerRpc.rpc("get_course_review_snapshot"');
    expect(api).toContain('reviewerRpc.rpc("get_course_review_lesson"');
    expect(api).not.toMatch(/\.from\(|\.storage\b|\.functions\b/);
    expect(hook).toContain('["reviewer-course", userId, courseId]');
    expect(hook).toContain('["reviewer-lesson", userId, courseId, lessonId]');
  });

  it("contains no learner, authoring or submission data operation", () => {
    const reviewerFrontend = `${api}\n${hook}\n${page}`;
    expect(reviewerFrontend).not.toMatch(/start_test_attempt|submit_test_attempt|homework_submissions|lesson_progress|enrollments/i);
    expect(reviewerFrontend).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|useMutation\s*\(/);
    expect(page).not.toContain("CoursePreviewView");
    expect(page).not.toContain("FilePreviewDialog");
  });
});
