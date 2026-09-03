import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeOrgPermissions } from "@/constants/rolePermissions";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260904090000_labor_safety_enrollment_protocols.sql"), "utf8");

describe("labor-safety protocol migration contract", () => {
  it("uses permissions already granted by the canonical organization matrix", () => {
    const owner = computeOrgPermissions("owner", null);
    expect(owner.has("labor_safety.read")).toBe(true);
    expect(owner.has("labor_safety.write")).toBe(true);
    expect(migration).toContain("public.can_access_organization(p_organization_id, 'labor_safety.write')");
    expect(migration).toContain("public.can_access_organization(organization_id, 'labor_safety.read')");
  });

  it("denies direct client writes and validates the exact tenant/enrollment in the RPC", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.labor_safety_enrollment_protocols FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT SELECT ON TABLE public.labor_safety_enrollment_protocols TO authenticated");
    expect(migration).toContain("v_user_id IS NULL");
    expect(migration).toContain("c.organization_id = p_organization_id");
    expect(migration).toContain("p.organization_id = p_organization_id");
    expect(migration).toContain("e.id = p_enrollment_id");
    expect(migration).toContain("cat.organization_id = p_organization_id");
    expect(migration).toContain("translate(cat.name, 'ОХРАНТУД', 'охрантуд') LIKE '%охрана труда%'");
    expect(migration).toContain("FOR SHARE OF e, c, p, cat");
    expect(migration).toContain("SET search_path = public");
  });

  it("requires explicit date/result and never creates an education document or backfills a pass", () => {
    expect(migration).toContain("knowledge_check_date date NOT NULL");
    expect(migration).toContain("is_passed boolean NOT NULL,");
    expect(migration).not.toMatch(/is_passed\s+boolean[^\n]*DEFAULT/i);
    expect(migration).not.toContain("education_document_records");
    expect(migration).not.toContain("completed_at");
    expect(migration).not.toContain("SET is_passed = true");
  });

  it("guards both concurrent creation and stale updates", () => {
    expect(migration).toContain("UNIQUE (organization_id, source_enrollment_id)");
    expect(migration).toContain("ON CONFLICT (organization_id, source_enrollment_id) DO NOTHING");
    expect(migration).toContain("AND version = p_expected_version");
    expect(migration).toContain("version = version + 1");
    expect(migration).toContain("ERRCODE = '40001'");
  });

  it("retains immutable source identity and server snapshots after unenrollment", () => {
    expect(migration).toContain("enrollment_id uuid REFERENCES public.enrollments(id) ON DELETE SET NULL");
    expect(migration).toContain("source_enrollment_id uuid NOT NULL");
    expect(migration).toContain("NEW.source_enrollment_id IS DISTINCT FROM OLD.source_enrollment_id");
    expect(migration).toContain("NEW.learner_name_snapshot IS DISTINCT FROM OLD.learner_name_snapshot");
    expect(migration).toContain("v_source.course_id, v_source.full_name, v_source.title");
  });
});
