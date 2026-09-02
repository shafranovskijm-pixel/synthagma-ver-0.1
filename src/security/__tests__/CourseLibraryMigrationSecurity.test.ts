import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260903100000_csz_electronic_library_schema.sql",
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
  it("keeps the existing bucket private without losing resolvable legacy paths", () => {
    expect(migration).toContain("/storage/v1/object/(?:public|sign)/library-files/([^?]+)");
    expect(migration).toContain("Some legacy library-files URLs could not be converted");
    expect(migration).toMatch(/UPDATE storage\.buckets\s+SET public = false\s+WHERE id = 'library-files'/);
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_library_documents_storage_path");
  });

  it("allows learners only through a published, current explicit enrollment", () => {
    const body = sqlFunctionBody("can_access_course_as_learner");

    expect(body).toContain("JOIN public.courses c ON c.id = e.course_id");
    expect(body).toContain("c.is_published = true");
    expect(body).toContain("e.status IN ('active', 'completed')");
    expect(body).toContain("e.expires_at IS NULL");
    expect(body).toContain("e.expires_at > now()");
    expect(body).not.toContain("student_groups");
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
    expect(migration.match(/AS RESTRICTIVE/g)).toHaveLength(4);
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
