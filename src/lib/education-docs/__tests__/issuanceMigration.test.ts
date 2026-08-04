import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../supabase/migrations");

function latestIssuanceMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const candidates = files.filter((f) =>
    fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8").includes("issue_education_document_batch"),
  );
  expect(candidates.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, candidates.at(-1)!), "utf8");
}

describe("issue_education_document_batch migration", () => {
  const sql = latestIssuanceMigration();

  it("requires exact course and enrollment before numbering", () => {
    expect(sql).toContain("exact course_id is required");
    expect(sql).toContain("enrollment_id is required for every item");
    expect(sql).toContain("e.course_id = p_course_id");
    expect(sql.indexOf("e.course_id = p_course_id")).toBeLessThan(
      sql.indexOf("INSERT INTO public.document_number_sequences"),
    );
  });

  it("requires an exact group-course link", () => {
    expect(sql).toContain("v_group_course_id IS NULL OR v_group_course_id <> p_course_id");
  });

  it("reuses an existing original before allocating a new number", () => {
    expect(sql).toContain("Идемпотентность");
    expect(sql).toContain("r.enrollment_id = v_enrollment_id");
    expect(sql).toContain("CONTINUE");
    expect(sql.indexOf("v_existing_id IS NOT NULL")).toBeLessThan(
      sql.indexOf("INSERT INTO public.document_number_sequences"),
    );
  });

  it("rejects empty and oversized batches", () => {
    expect(sql).toContain("jsonb_typeof(p_items)");
    expect(sql).toContain("v_items_count = 0");
    expect(sql).toContain("v_items_count > 500");
  });
});
