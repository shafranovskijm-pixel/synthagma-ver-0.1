import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260904134000_group_class_journal_marks.sql", "utf8");

describe("group class journal marks migration source contract (not Live verification)", () => {
  it("adds only an explicit four-column cell store without legacy backfill", () => {
    expect(sql).toContain("UNIQUE (group_id, user_id, slot)");
    expect(sql).toContain("slot BETWEEN 1 AND 4");
    expect(sql).toContain("length(mark) <= 12");
    expect(sql).toContain("user_id uuid NOT NULL,");
    expect(sql).not.toMatch(/REFERENCES public\.profiles|UPDATE public\.(student_groups|profiles)|(?:FROM|INTO) public\.(lesson_progress|journal_entries)/);
  });
  it("keeps authenticated reads tenant checked and writes RPC-only", () => {
    expect(sql).toContain("REVOKE ALL ON public.group_class_journal_marks FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT SELECT ON public.group_class_journal_marks TO authenticated");
    expect(sql).toContain("public.can_access_organization(organization_id, 'documents.read')");
    expect(sql).toContain("public.can_access_organization(organization_id, 'documents.write')");
    expect(sql).toContain("g.organization_id = group_class_journal_marks.organization_id");
    expect(sql).toContain("NOT COALESCE(public.can_access_organization(p_organization_id, 'documents.write'), false)");
    expect(sql).toContain("SECURITY DEFINER SET search_path = public");
  });
  it("serializes and verifies group, course, real date and current active learner", () => {
    expect(sql).toContain("WHERE id = p_group_id FOR UPDATE");
    expect(sql).toContain("v_group.course_id IS DISTINCT FROM p_expected_course_id");
    expect(sql).toContain("to_char(v_group.training_dates[p_slot], 'YYYY-MM-DD') IS DISTINCT FROM p_expected_date");
    expect(sql).toContain("v_group.training_dates[p_slot] IS NULL");
    expect(sql).toContain("datetime_field_overflow OR invalid_datetime_format");
    expect(sql).toContain("p.organization_id = p_organization_id");
    expect(sql).toContain("p.student_group_id = p_group_id");
    expect(sql).toContain("p.archived_at IS NULL");
    expect(sql).toContain("FOR SHARE OF p");
  });
  it("requires CAS, keeps clear as text and forbids XML-invalid controls", () => {
    expect(sql).toContain("p_expected_revision IS NULL OR v_saved.revision <> p_expected_revision");
    expect(sql).toContain("IF p_expected_revision IS NOT NULL THEN");
    expect(sql).toContain("revision = revision + 1, updated_at = clock_timestamp(), updated_by = v_uid");
    expect(sql).toContain("mark = p_mark");
    expect(sql).not.toMatch(/trim\(p_mark\)|length\(p_mark\)\s*[<=>]+\s*0/);
    expect(sql).toContain("IN (11, 12, 65534, 65535)");
    expect(sql).toContain("RETURN to_jsonb(v_saved)");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
