import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  sha256CanonicalJson,
} from "../../../../supabase/functions/_shared/docx-ooxml/idempotency";

const FUNCTION_SOURCE = path.resolve(
  __dirname,
  "../../../../supabase/functions/compile-docx-contract/index.ts",
);
const DIALOG_SOURCE = path.resolve(
  __dirname,
  "../../../components/organization/group-folder/GenerateDocxContractDialog.tsx",
);
const MIGRATION_SOURCE = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20260825100000_compile_docx_contract_idempotency.sql",
);

describe("DOCX contract idempotency", () => {
  it("hashes equivalent object snapshots identically while preserving row order", async () => {
    const first = { scalars: { B: "2", A: "1" }, students: [{ fio: "А" }, { fio: "Б" }] };
    const reorderedKeys = { students: [{ fio: "А" }, { fio: "Б" }], scalars: { A: "1", B: "2" } };
    const reorderedRows = { students: [{ fio: "Б" }, { fio: "А" }], scalars: { A: "1", B: "2" } };

    expect(canonicalJson(first)).toBe(canonicalJson(reorderedKeys));
    expect(await sha256CanonicalJson(first)).toBe(await sha256CanonicalJson(reorderedKeys));
    expect(await sha256CanonicalJson(first)).not.toBe(await sha256CanonicalJson(reorderedRows));
  });

  it("has a tenant-scoped unique key and snapshot mismatch guard", () => {
    const migration = fs.readFileSync(MIGRATION_SOURCE, "utf8");
    const edge = fs.readFileSync(FUNCTION_SOURCE, "utf8");

    expect(migration).toMatch(/UNIQUE INDEX[\s\S]*?organization_id, submission_key/);
    expect(migration).toContain("submission_snapshot_sha256");
    expect(edge).toContain("sha256CanonicalJson");
    expect(edge).toContain('.eq("submission_key", body.submissionKey)');
    const insertErrorBranch = edge.slice(edge.indexOf("if (insertError)"));
    expect(insertErrorBranch.indexOf('.eq("submission_key", body.submissionKey)')).toBeGreaterThanOrEqual(0);
    expect(insertErrorBranch.indexOf('.eq("submission_key", body.submissionKey)')).toBeLessThan(
      insertErrorBranch.indexOf("storage.from(BUCKET).remove([docxPath])"),
    );
    expect(insertErrorBranch).toContain("existing.docx_path !== docxPath");
    expect(insertErrorBranch).not.toContain('insertError.code === "23505"');
    expect(edge).toContain("Ключ отправки уже использован для другого снимка договора");
    expect(edge).toContain("idempotent_replay: true");
  });

  it("reuses one browser UUID across a failed response retry", () => {
    const dialog = fs.readFileSync(DIALOG_SOURCE, "utf8");

    expect(dialog).toContain("const submissionKeyRef = useRef<string | null>(null)");
    expect(dialog).toContain("submissionKeyRef.current ??= crypto.randomUUID()");
    expect(dialog).toContain("submissionKeyRef.current = null");
  });

  it("requires the exact active group roster before compilation", () => {
    const edge = fs.readFileSync(FUNCTION_SOURCE, "utf8");

    expect(edge).toContain("validateExactContractRoster");
    expect(edge).toContain('.eq("student_group_id", body.groupId)');
    expect(edge).not.toContain('.in("user_id", uniqueStudentIds)');
  });
});
