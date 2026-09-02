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

describe("GORELTECH final-status migration", () => {
  const sql = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "20260902141149_f6ca4d7b-d95c-4a00-ad7c-b29e85b40e46.sql"),
    "utf8",
  );

  it("оставляет legacy RPC совместимым, но принудительно сохраняет ГОРЭЛТЕХ как draft", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.create_group_document_batch(");
    expect(sql).toContain("v_force_goreltech_draft boolean");
    expect(sql).toContain("CASE WHEN v_force_goreltech_draft THEN NULL");
    expect(sql).toContain("WHEN v_force_goreltech_draft THEN 'draft'");
    expect(sql).toContain("Пакет ГОРЭЛТЕХ сохранён как черновик без официального номера.");
    expect(sql).not.toContain("GORELTECH package requires trusted compiler");
  });

  it("доверяет новый batch RPC только service_role и реальному actor", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.create_goreltech_group_document_batch(");
    expect(sql).toContain("p_actor_id uuid");
    expect(sql).toContain("p_organization_id uuid");
    expect(sql).toContain("p_group_id uuid");
    expect(sql).toContain("p_docs jsonb");
    expect(sql).toContain("v_jwt_role IS DISTINCT FROM 'service_role'");
    expect(sql).toContain("public.has_org_staff_permission(p_actor_id");
    expect(sql).toContain("public.is_org_owner(p_actor_id");
    expect(sql).toContain("true, p_actor_id");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("TO service_role");
  });

  it("принимает только полный tenant-scoped DOCX draft без номера", () => {
    expect(sql).toContain("GORELTECH package must contain exactly 9 documents");
    expect(sql).toContain("GORELTECH package document types are invalid");
    expect(sql).toContain("position(v_path_prefix IN (d->>'file_path')) <> 1");
    expect(sql).toContain("COALESCE(NULLIF(d->>'doc_status', ''), 'draft') <> 'draft'");
    expect(sql).toContain("NULLIF(btrim(d->>'document_number'), '') IS NOT NULL");
    expect(sql).toContain("COALESCE(NULLIF(d->>'layout_format', ''), '') <> 'docx_ooxml'");
  });

  it("отзывает прямые INSERT/UPDATE и оставляет серверный draft guard", () => {
    expect(sql).toContain("REVOKE INSERT, UPDATE ON TABLE public.group_documents FROM authenticated");
    expect(sql).toContain('DROP POLICY IF EXISTS "Org staff can insert group documents"');
    expect(sql).toContain('DROP POLICY IF EXISTS "Org staff can update group documents"');
    expect(sql).toContain("NEW.doc_status := 'draft'");
    expect(sql).toContain("NEW.document_number := NULL");
  });
});
