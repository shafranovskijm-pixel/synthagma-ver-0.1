import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const importStudentsSource = readFileSync(
  resolve(process.cwd(), "src/components/ImportStudentsForm.tsx"),
  "utf8",
);
const bulkImportSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/StudentBulkImportDialog.tsx"),
  "utf8",
);

describe.each([
  ["ImportStudentsForm", importStudentsSource],
  ["StudentBulkImportDialog", bulkImportSource],
])("%s enrollment writes", (_name, source) => {
  it("uses the verified enrollment API after checking existing rows", () => {
    expect(source).toContain('import { insertEnrollmentsVerified } from "@/api/enrollments"');
    expect(source).toContain('.from("enrollments")');
    expect(source).toContain('.select("course_id")');
    expect(source).toContain("await insertEnrollmentsVerified([{");
  });

  it("does not upsert enrollment rows or reset existing progress", () => {
    expect(source).not.toMatch(/\.from\("enrollments"\)[\s\S]{0,200}\.upsert\(/);
    expect(source).not.toContain('onConflict: "user_id,course_id"');
  });
});

describe("student import partial failures", () => {
  it("keeps confirmed course counts on ImportStudentsForm errors", () => {
    expect(importStudentsSource).toContain("courses_enrolled: confirmedEnrollmentCount");
    expect(importStudentsSource).toContain("enrollmentResult.failures.length > 0");
  });

  it("does not report bulk partial or total failure as success", () => {
    expect(bulkImportSource).toContain("toast.warning(`Импорт завершён частично:");
    expect(bulkImportSource).toContain("toast.error(`Импорт завершён с ошибками:");
    expect(bulkImportSource).toContain("if (registeredCount > 0) onImportComplete();");
  });

  it("verifies pending enrollment persistence before row success", () => {
    expect(bulkImportSource).toContain("insertPendingEnrollmentVerified");
    expect(bulkImportSource).toContain('.select("id")');
    expect(bulkImportSource).toContain(".maybeSingle()");
  });
});
