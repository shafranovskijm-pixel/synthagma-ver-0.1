import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const studentsTabSource = readFileSync(
  resolve(process.cwd(), "src/components/organization/tabs/StudentsTab.tsx"),
  "utf8",
);
const resultsDialogSource = readFileSync(
  resolve(process.cwd(), "src/components/organization/tabs/students/StudentTestResultsDialog.tsx"),
  "utf8",
);

describe("StudentsTab test-result actions", () => {
  it("keeps both requested actions on the active students screen", () => {
    expect(studentsTabSource).toContain("Результаты тестирования");
    expect(studentsTabSource).toContain("handleExportStudentResults");
    expect(studentsTabSource).toContain('panelMode === "active"');
    expect(studentsTabSource).toContain("<StudentTestResultsDialog");
  });

  it("states that the report uses the latest result and the configured passing score", () => {
    expect(resultsDialogSource).toContain("Последний результат каждого теста");
    expect(resultsDialogSource).toContain("Проходной балл берётся из настроек конкретного урока");
  });
});
