import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Регрессия на релиз-блокеры RPC create_group_document_batch:
 *  - advisory-блокировка одним 64-битным ключом (pg_advisory_xact_lock(bigint));
 *  - валидация p_docs (null / не массив / пустой / слишком большой) ДО UPDATE is_current.
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
    expect(sql).toMatch(/at least one document/);
    expect(sql).toMatch(/max batch size/);
  });

  it("validates p_docs before marking previous batches non-current", () => {
    const guard = sql.indexOf("at least one document");
    const update = sql.indexOf("SET is_current = false");
    expect(guard).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(guard);
  });
});
