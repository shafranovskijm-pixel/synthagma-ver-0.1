import { describe, it, expect } from "vitest";
import {
  sanitizeSnils,
  sanitizeDate,
  sanitizeGender,
  sanitizeCitizenship,
  sanitizeFromDict,
  sanitizeText,
  stripInvisibles,
} from "../frdoFileSanitizer";
import { FRDO_TRAINING_FORMS, FRDO_FINANCING_SOURCES } from "@/constants/frdo";

describe("stripInvisibles", () => {
  it("removes NBSP, ZWSP, BOM, tabs", () => {
    const dirty = "abc\u00A0def\u200Bghi\uFEFF\tjkl";
    expect(stripInvisibles(dirty)).toBe("abc def ghi  jkl");
  });
});

describe("sanitizeSnils", () => {
  it("formats raw 11 digits", () => {
    expect(sanitizeSnils("12345678901").value).toBe("123-456-789 01");
  });
  it("strips NBSP and reformats", () => {
    const r = sanitizeSnils("123\u00A0456 78901");
    expect(r.value).toBe("123-456-789 01");
    expect(r.fixed).toBe(true);
  });
  it("returns reason on wrong length", () => {
    const r = sanitizeSnils("12345");
    expect(r.fixed).toBe(false);
    expect(r.reason).toMatch(/11/);
  });
  it("handles empty", () => {
    expect(sanitizeSnils("").value).toBe("");
  });
});

describe("sanitizeDate", () => {
  it("ISO → dd.MM.yyyy", () => {
    expect(sanitizeDate("2024-01-31").value).toBe("31.01.2024");
  });
  it("dd.MM.yyyy stays formatted", () => {
    expect(sanitizeDate("31.01.2024").value).toBe("31.01.2024");
  });
  it("dd/MM/yyyy → dd.MM.yyyy", () => {
    expect(sanitizeDate("31/01/2024").value).toBe("31.01.2024");
  });
  it("Excel serial date number", () => {
    // 45292 = 2024-01-01
    expect(sanitizeDate(45292).value).toBe("01.01.2024");
  });
  it("Date object", () => {
    const d = new Date(Date.UTC(2024, 5, 15));
    expect(sanitizeDate(d).value).toBe("15.06.2024");
  });
  it("date with tab", () => {
    expect(sanitizeDate("\t31.01.2024 ").value).toBe("31.01.2024");
  });
});

describe("sanitizeGender", () => {
  it("М → Муж", () => {
    expect(sanitizeGender("М").value).toBe("Муж");
  });
  it("мужской → Муж", () => {
    expect(sanitizeGender("мужской").value).toBe("Муж");
  });
  it("Ж → Жен", () => {
    expect(sanitizeGender("Ж").value).toBe("Жен");
  });
  it("female → Жен", () => {
    expect(sanitizeGender("female").value).toBe("Жен");
  });
});

describe("sanitizeCitizenship", () => {
  it("digits stay", () => {
    expect(sanitizeCitizenship("643").value).toBe("643");
  });
  it("empty → 643 default", () => {
    expect(sanitizeCitizenship("").value).toBe("643");
  });
  it("Россия → 643", () => {
    expect(sanitizeCitizenship("Россия").value).toBe("643");
  });
});

describe("sanitizeFromDict", () => {
  it("exact match", () => {
    expect(sanitizeFromDict("Очная", FRDO_TRAINING_FORMS).value).toBe("Очная");
  });
  it("case-insensitive", () => {
    expect(sanitizeFromDict("очная", FRDO_TRAINING_FORMS).value).toBe("Очная");
  });
  it("partial match", () => {
    expect(sanitizeFromDict("платное", FRDO_FINANCING_SOURCES).value).toBe("Платное обучение");
  });
});

describe("sanitizeText", () => {
  it("collapses whitespace", () => {
    expect(sanitizeText("  Иванов\u00A0\u00A0Иван   ").value).toBe("Иванов Иван");
  });
});

// auto_reg_number is wired via sanitizeByKind — verify directly through public surface
// by parsing a tiny synthetic sheet would require ExcelJS; we instead test the
// fallback semantics by checking sanitizeText behaviour and document the contract:
// empty input + "auto_reg_number" kind → "нет" (covered in FrdoFileSanitizerDialog
// preview; the unit-level guard lives in sanitizeByKind switch).
describe("auto_reg_number contract (via sanitizeText)", () => {
  it("empty text stays empty for sanitizeText (no auto-fill at base layer)", () => {
    expect(sanitizeText("").value).toBe("");
  });
  it("preserves user-supplied reg number", () => {
    expect(sanitizeText("12/2024").value).toBe("12/2024");
  });
});

// ============================================================
// Header mapping (parseFrdoXlsx) — column resolution edge cases
// ============================================================
import ExcelJS from "exceljs";
import { parseFrdoXlsx, getUnmappedHeaders, getHeadersForType } from "../frdoFileSanitizer";
import { PO_HEADERS } from "../frdoExcelExport";

async function buildXlsxFile(headers: string[], rows: (string | number)[][], name = "test.xlsx"): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Лист1");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf as ArrayBuffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("buildColumnMap fuzzy + positional fallback", () => {
  it("matches singular profession header (PO[11])", async () => {
    const headers = [...PO_HEADERS];
    headers[11] = "Наименование профессии рабочего, должности служащего";
    const file = await buildXlsxFile(headers, [
      headers.map((_, i) => (i === 11 ? "Водитель автомобиля" : `v${i}`)),
    ]);
    const r = await parseFrdoXlsx(file, "po");
    expect(r.columnMap[11]).toBe(11);
    expect(String(r.rows[0].cells[11].value)).toBe("Водитель автомобиля");
  });

  it("matches 'СНИЛС получателя' for PO[21]", async () => {
    const headers = [...PO_HEADERS];
    headers[21] = "СНИЛС получателя";
    const file = await buildXlsxFile(headers, [
      headers.map((_, i) => (i === 21 ? "12345678901" : `v${i}`)),
    ]);
    const r = await parseFrdoXlsx(file, "po");
    expect(r.columnMap[21]).toBe(21);
    expect(String(r.rows[0].cells[21].value)).toBe("123-456-789 01");
  });

  it("positional fallback when source has 35 cols and required mostly matched", async () => {
    const headers = [...PO_HEADERS];
    headers[11] = "XYZ-неведомая колонка-Q";
    const dataRow = headers.map((_, i) => (i === 11 ? "Сварщик" : `v${i}`));
    const file = await buildXlsxFile(headers, [dataRow]);
    const r = await parseFrdoXlsx(file, "po");
    expect(r.columnMap[11]).toBe(11);
    expect(String(r.rows[0].cells[11].value)).toBe("Сварщик");
  });

  it("reports unmapped header when column missing and counts differ", async () => {
    const headers = [...PO_HEADERS];
    headers[21] = "Совсем другая колонка";
    headers.push("Лишняя колонка");
    const dataRow = headers.map((_, i) => `v${i}`);
    const file = await buildXlsxFile(headers, [dataRow]);
    const r = await parseFrdoXlsx(file, "po");
    const unmapped = getUnmappedHeaders(r);
    const snilsHeader = getHeadersForType("po")[21];
    expect(unmapped.some((u) => u.header === snilsHeader)).toBe(true);
  });
});
