import { describe, expect, it, vi } from "vitest";
import { parseRows, parseExcelOrCsv, downloadStudentsTemplate } from "../studentsExcelImport";

vi.mock("xlsx", async (importOriginal) => ({ ...await importOriginal<typeof import("xlsx")>(), writeFile: vi.fn() }));

describe("student spreadsheet import", () => {
  it("keeps the previous template compatible", () => {
    const row = parseRows(["Фамилия", "Имя", "Курс 1", "Группа"], [["Иванов", "Иван", "Курс", "Группа"]]).rows[0];
    expect(row.full_name).toBe("Иванов Иван");
    expect(row.course_titles).toEqual(["Курс"]);
    expect(row.department).toBeUndefined();
    expect(row.confirm_identity).toBeUndefined();
    expect(row.detailsError).toBeUndefined();
  });
  it("maps reordered columns and preserves leading zeros", () => {
    const parsed = parseRows(["СНИЛС", "Дата рождения", "ФИО", "Подразделение", "Идентификация подтверждена"], [["00100199832", "15.06.1990", "Иванов Иван", "Участок 2", "Да"]]);
    expect(parsed.rows[0]).toMatchObject({ department: "Участок 2", snils: "001-001-998 32", birth_date: "1990-06-15", confirm_identity: true });
    expect(parsed.detectedColumns.department).toBe(true);
  });
  it("parses a current job position in a reordered CSV and does not infer qualification", async () => {
    const parsed = await parseExcelOrCsv({ name: "students.csv", text: async () => "ФИО;ДОЛЖНОСТЬ;Квалификация\nИванов Иван; Водитель ;Механик" } as File);
    expect(parsed.rows[0].job_position).toBe("Водитель");
    expect(parsed.detectedColumns.job_position).toBe(true);
    expect(parseRows(["ФИО", "Должность"], [["Иванов", ""]]).rows[0].job_position).toBeUndefined();
  });
  it("includes a usable position column in the downloadable Excel template", async () => {
    const XLSX = await import("xlsx");
    await downloadStudentsTemplate();
    const workbook = vi.mocked(XLSX.writeFile).mock.calls.at(-1)![0];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.students_template, { header: 1 });
    const positionColumn = rows[0].indexOf("Должность");
    expect(positionColumn).toBeGreaterThan(-1);
    expect(rows[1][positionColumn]).toBe("Водитель");
    expect(parseRows(rows[0], rows.slice(1)).rows[0].job_position).toBe("Водитель");
  });
  it.each(["", "Нет", "false", "0"])("does not reset verification for %s", (value) => {
    expect(parseRows(["ФИО", "Идентификация подтверждена"], [["Иванов", value]]).rows[0].confirm_identity).toBeUndefined();
  });
  it("reports invalid details on the row without silently importing half of them", () => {
    const parsed = parseRows(["ФИО", "СНИЛС", "Подразделение"], [["Иванов", 100199832, "Участок"]]);
    expect(parsed.rows[0].detailsError).toContain("11 цифр");
    expect(parsed.rows[0].department).toBeUndefined();
  });
  it("rejects ambiguous approvals", () => {
    expect(parseRows(["ФИО", "Идентификация подтверждена"], [["Иванов", "проверить"]]).rows[0].detailsError).toContain("Да или Нет");
  });
  it("reads Excel serial dates in both workbook epochs", () => {
    expect(parseRows(["ФИО", "Дата рождения"], [["Иванов", 33039]]).rows[0].birth_date).toBe("1990-06-15");
    expect(parseRows(["ФИО", "Дата рождения"], [["Иванов", 31577]], true).rows[0].birth_date).toBe("1990-06-15");
    expect(parseRows(["ФИО", "Дата рождения"], [["Иванов", 60]]).rows[0].detailsError).toBeDefined();
  });
  it("reads a formatted numeric SNILS without losing its zero", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["ФИО", "СНИЛС"], ["Иванов", 100199832]]);
    ws.B2.z = "00000000000";
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Ученики");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const parsed = await parseExcelOrCsv({ name: "students.xlsx", arrayBuffer: async () => bytes } as File);
    expect(parsed.rows[0].snils).toBe("001-001-998 32");
  });
});
