import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Регрессия на релиз-блокеры RPC create_group_document_batch:
 *  - advisory-блокировка одним 64-битным ключом (pg_advisory_xact_lock(bigint));
 *  - валидация p_docs (null / не массив / пустой / слишком большой) ДО UPDATE is_current.
 *  - точечная смена is_current только для типов документов из p_docs.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../supabase/migrations");

function latestBatchMigration(): string {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();
  const withFn = files.filter(f =>
    fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8").includes("create_group_document_batch"),
  );
  expect(withFn.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, withFn[withFn.length - 1]), "utf8");
}

describe("create_group_document_batch migration", () => {
  const sql = latestBatchMigration();

  it("uses a single 64-bit advisory lock key", () => {
    const lock = sql.match(/pg_advisory_xact_lock\(([\s\S]*?)\);/);
    expect(lock).toBeTruthy();
    const args = lock![1];
    // Ровно один hashtextextended(...) => один bigint-аргумент.
    expect(args.match(/hashtextextended/g)?.length).toBe(1);
    expect(args).toContain("p_organization_id");
    expect(args).toContain("p_group_id");
  });

  it("locks before reading MAX(package_version)", () => {
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(sql.indexOf("MAX(gd.package_version)"));
  });

  it("rejects null / non-array / empty / oversized p_docs", () => {
    expect(sql).toContain("jsonb_typeof(p_docs)");
    expect(sql).toContain("p_docs IS NULL");
    expect(sql).toContain("p_docs must be a non-empty jsonb array");
    expect(sql).toContain("v_docs_count = 0 OR v_docs_count > 500");
    expect(sql).toContain("p_docs count must be between 1 and 500");
  });

  it("validates p_docs before marking previous batches non-current", () => {
    const shapeGuard = sql.indexOf("p_docs must be a non-empty jsonb array");
    const countGuard = sql.indexOf("p_docs count must be between 1 and 500");
    const update = sql.indexOf("SET is_current = false");
    expect(shapeGuard).toBeGreaterThan(-1);
    expect(countGuard).toBeGreaterThan(shapeGuard);
    expect(update).toBeGreaterThan(countGuard);
  });

  it("does not retire unrelated document types", () => {
    const updateStart = sql.indexOf("UPDATE public.group_documents gd");
    const insertStart = sql.indexOf("INSERT INTO public.group_documents", updateStart);
    const update = sql.slice(updateStart, insertStart);

    expect(updateStart).toBeGreaterThan(-1);
    expect(insertStart).toBeGreaterThan(updateStart);
    expect(update).toContain("gd.doc_type IN");
    expect(update).toContain("jsonb_array_elements(p_docs)");
    expect(update).toContain("d->>'doc_type'");
  });

  it("rejects missing doc_type before changing current rows", () => {
    const typeGuard = sql.indexOf("each p_docs item must have a non-empty doc_type");
    const update = sql.indexOf("SET is_current = false");
    expect(typeGuard).toBeGreaterThan(-1);
    expect(typeGuard).toBeLessThan(update);
  });

  it("rejects duplicate doc_type values before changing current rows", () => {
    const duplicateGuard = sql.indexOf("p_docs must contain unique doc_type values");
    const update = sql.indexOf("SET is_current = false");
    expect(duplicateGuard).toBeGreaterThan(-1);
    expect(duplicateGuard).toBeLessThan(update);
  });

  it("repairs existing active rows per organization, group and document type", () => {
    expect(sql).toContain("row_number() OVER");
    expect(sql).toContain("PARTITION BY gd.organization_id, gd.group_id, gd.doc_type");
    expect(sql).toContain("gd.status = 'active'");
    expect(sql).toContain("gd.package_batch_id IS NOT NULL");
    expect(sql).toContain("is_current = (ranked.position = 1)");
  });

  it("enforces one active current version per document type", () => {
    expect(sql).toContain("uq_group_documents_one_current_type");
    expect(sql).toContain("(organization_id, group_id, doc_type)");
    expect(sql).toContain("is_current IS TRUE");
  });
});
