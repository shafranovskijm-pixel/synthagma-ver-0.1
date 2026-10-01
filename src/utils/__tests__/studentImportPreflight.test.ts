import { describe, expect, it } from "vitest";
import { analyzeStudentImport } from "../studentImportPreflight";
import { parseRows } from "../studentsExcelImport";

describe("import duplicate review", () => {
  it("blocks all colliding logins while retaining homonyms and warning on identical passwords", () => {
    const parsed = parseRows(["ФИО","Логин","Пароль"], [
      ["Семёнов Иван", "Shared.Login", "same-secret"],
      ["семенов   Иван", " shared.login ", "same-secret"],
      ["Другой ученик", "unique", "same-secret"],
    ]);
    const checks = analyzeStudentImport(parsed.rows);
    expect(checks[0].blocked).toContain("Логин повторяется в файле");
    expect(checks[1].blocked).toContain("Логин повторяется в файле");
    expect(checks[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining("ФИО повторяется"), expect.stringContaining("Пароль повторяется")]));
    expect(checks[2].blocked).toEqual([]);
    expect(JSON.stringify(checks)).not.toContain("same-secret");
  });
  it("does not block names or reuse passwords as an identity key", () => {
    const rows = parseRows(["ФИО","Логин","Пароль"], [["Иван Иванов","one","shared"],["Иван Иванов","two","shared"]]).rows;
    const checks = analyzeStudentImport(rows, [{ row_index: 1, login_taken: false, name_matches: 2, email_matches: 0 }]);
    expect(checks.map(row => row.blocked)).toEqual([[],[]]);
    expect(checks[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining("(2)")]));
  });
  it("blocks a taken login even when FIO differs and includes an archived account", () => {
    const rows = parseRows(["ФИО","Логин"], [["Новый человек","occupied"]]).rows;
    const check = analyzeStudentImport(rows,[{ row_index: 1, login_taken: true, name_matches: 0, email_matches: 0 }])[0];
    expect(check.blocked).toEqual([expect.stringContaining("Логин уже занят")]);
  });
});
