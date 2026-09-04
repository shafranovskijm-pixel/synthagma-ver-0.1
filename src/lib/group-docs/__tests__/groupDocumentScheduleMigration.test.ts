import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20260904095000_group_document_schedules.sql", "utf8");
describe("explicit group schedule migration source contract (not a live PostgreSQL test)", () => {
  it("stores one versioned snapshot per group without changing legacy sources", () => {
    expect(sql).toMatch(/group_id uuid PRIMARY KEY REFERENCES public.student_groups\(id\) ON DELETE CASCADE/);
    expect(sql).toContain("revision integer NOT NULL DEFAULT 1");
    expect(sql).not.toMatch(/UPDATE public.student_groups|training_dates|schedule_text/);
    expect(sql).toContain("RETURN to_jsonb(v_saved)");
  });
  it("uses authenticated explicit document privileges and no profile-membership gate", () => {
    expect(sql).toContain("v_uid IS NULL");
    expect(sql).toContain("public.can_access_organization(p_organization_id, 'documents.write')");
    expect(sql).toContain("public.can_access_organization(organization_id, 'documents.read')");
    expect(sql).toContain("public.can_access_organization(organization_id, 'documents.write')");
    expect(sql).toContain("IF NOT COALESCE((");
    expect(sql).not.toContain("public.has_org_staff_permission(");
    expect(sql).not.toMatch(/FROM public.profiles/);
    expect(sql).toContain("REVOKE ALL ON public.group_document_schedules FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT SELECT ON public.group_document_schedules TO authenticated");
    expect(sql).toContain("SECURITY DEFINER SET search_path = public");
  });
  it("serializes with group lock and checks course and revision before writing", () => {
    expect(sql).toContain("WHERE id = p_group_id FOR UPDATE");
    expect(sql).toContain("v_group.organization_id IS DISTINCT FROM p_organization_id");
    expect(sql).toContain("v_group.course_id IS DISTINCT FROM p_expected_course_id");
    expect(sql).toContain("p_expected_revision IS NULL OR v_saved.revision <> p_expected_revision");
    expect(sql).toContain("IF p_expected_revision IS NOT NULL THEN RAISE EXCEPTION 'schedule_revision_conflict'");
    expect(sql).toContain("revision = revision + 1");
    expect(sql).toContain("updated_at = clock_timestamp(), updated_by = v_uid");
  });
  it("validates exact slots, duplicates, date bounds and times; empty array clears", () => {
    expect(sql).toContain("jsonb_array_length(p_slots) > 4");
    expect(sql).not.toContain("jsonb_array_length(p_slots) = 0");
    expect(sql).toContain("jsonb_object_keys(v_slot)");
    expect(sql).toContain("jsonb_typeof(v_slot->'topic') <> 'string'");
    expect(sql).toContain("length(v_slot->>'topic') > 2000");
    expect(sql).toContain("v_number = ANY(v_seen)");
    expect(sql).toContain("v_date < v_group.start_date");
    expect(sql).toContain("v_date > v_group.end_date");
    expect(sql).toContain("datetime_field_overflow OR invalid_datetime_format");
    expect(sql).toContain("v_slot->>'time_to' <= v_slot->>'time_from'");
    expect(sql).toContain("'invalid_xml_text'");
    expect(sql).toContain("IN (11, 12, 65534, 65535)");
  });
});
