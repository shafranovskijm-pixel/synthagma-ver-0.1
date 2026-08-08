import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../supabase/migrations");

function latestIssuanceMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const candidates = files.filter((f) =>
    fs
      .readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")
      .includes("CREATE OR REPLACE FUNCTION public.issue_education_document_batch"),
  );
  expect(candidates.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, candidates.at(-1)!), "utf8");
}

describe("issue_education_document_batch migration", () => {
  const sql = latestIssuanceMigration();
  const batchSql = sql.slice(sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.issue_education_document_batch"));

  it("requires exact course and enrollment before numbering", () => {
    expect(batchSql).toContain("exact course_id is required");
    expect(batchSql).toContain("enrollment_id is required for every item");
    expect(batchSql).toContain("e.course_id = p_course_id");
    expect(batchSql.indexOf("e.course_id = p_course_id")).toBeLessThan(
      batchSql.indexOf("INSERT INTO public.document_number_sequences"),
    );
  });

  it("requires an exact group-course link", () => {
    expect(batchSql).toContain("v_group_course_id IS NULL OR v_group_course_id <> p_course_id");
  });

  it("reuses an existing original before allocating a new number", () => {
    expect(batchSql).toContain("One enrollment has one original education document");
    expect(batchSql).toContain("r.enrollment_id = v_enrollment_id");
    expect(batchSql).toContain("CONTINUE");
    expect(batchSql.indexOf("v_existing_id IS NOT NULL")).toBeLessThan(
      batchSql.indexOf("INSERT INTO public.document_number_sequences"),
    );
  });

  it("rejects empty and oversized batches", () => {
    expect(batchSql).toContain("jsonb_typeof(p_items)");
    expect(batchSql).toContain("v_items_count = 0");
    expect(batchSql).toContain("v_items_count > 500");
  });

  it("uses one tenant-wide sequence and seeds it above historical numbers", () => {
    expect(batchSql).toContain("VALUES (p_organization_id, 'edu_doc', v_year, v_max_doc + 1)");
    expect(batchSql).toContain("VALUES (p_organization_id, 'edu_reg', v_year, v_max_reg + 1)");
    expect(batchSql).toContain("GREATEST(document_number_sequences.last_number + 1, v_max_doc + 1)");
    expect(batchSql).not.toContain("'edu_doc:' || v_doc_type");
    expect(batchSql).not.toContain("'edu_reg:' || v_doc_type");
  });
});

describe("issue_education_document_batch grants", () => {
  const revokeSql = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20260808101500_revoke_anon_issue_education_document_batch.sql"),
    "utf8",
  );

  it("revokes execution from anonymous callers explicitly", () => {
    expect(revokeSql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) FROM anon",
    );
    expect(revokeSql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.issue_education_document_batch(uuid, uuid, uuid, jsonb) FROM PUBLIC",
    );
  });
});
