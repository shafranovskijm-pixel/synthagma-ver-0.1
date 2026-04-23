import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";

const TEMPLATE_PO_PATH = resolve(__dirname, "../../assets/frdo/template-po.xlsx");
const TEMPLATE_DPO_PATH = resolve(__dirname, "../../assets/frdo/template-dpo.xlsx");

describe("frdoTemplateInjector — donor template integrity", () => {
  it("PO template asset exists and is a substantial donor file", () => {
    const buf = readFileSync(TEMPLATE_PO_PATH);
    expect(buf.byteLength).toBeGreaterThan(200 * 1024);
  });

  it("DPO template asset exists and is a substantial donor file", () => {
    const buf = readFileSync(TEMPLATE_DPO_PATH);
    // DPO донор слегка меньше PO (меньше словарей), но всё равно сильно больше
    // 40 KB ExcelJS-сборки с нуля.
    expect(buf.byteLength).toBeGreaterThan(120 * 1024);
  });

  it("PO template contains the hidden Проверки sheet with defined names", async () => {
    const buf = readFileSync(TEMPLATE_PO_PATH);
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("xl/worksheets/sheet2.xml")).toBeTruthy();
    expect(zip.file("xl/worksheets/sheet1.xml")).toBeTruthy();
    const wb = await zip.file("xl/workbook.xml")!.async("string");
    expect(wb).toContain("Вид_документа");
    expect(wb).toContain("гражданство");
  });

  it.each([
    ["PO", TEMPLATE_PO_PATH, 35, 150 * 1024],
    // DPO: после удаления 1000 пустых строк sheet1 ужимается, но critical-парты
    // (sharedStrings, sheet2 со словарями, styles, theme) сохранены — это и
    // проверяется ниже отдельно.
    ["DPO", TEMPLATE_DPO_PATH, 40, 25 * 1024],
  ])(
    "%s — after replacing sheetData, donor structure (sheet2/styles/sharedStrings) is preserved",
    async (_label, path, cellCount, minOutBytes) => {
      const buf = readFileSync(path as string);
      const zip = await JSZip.loadAsync(buf);
      const sheet1 = await zip.file("xl/worksheets/sheet1.xml")!.async("string");

      // Simulate the same surgery our injector performs
      const headerMatch = sheet1.match(/<row r="1"[\s\S]*?<\/row>/);
      expect(headerMatch).toBeTruthy();

      const newInner =
        headerMatch![0] +
        `<row r="2" spans="1:${cellCount}"><c r="A2" t="inlineStr"><is><t>TEST</t></is></c></row>`;
      const replaced = sheet1.replace(
        /(<sheetData[^>]*>)[\s\S]*?(<\/sheetData>)/,
        `$1${newInner}$2`,
      );
      zip.file("xl/worksheets/sheet1.xml", replaced);

      const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
      expect(out.byteLength).toBeGreaterThan(minOutBytes as number);

      // Re-open and verify our row landed AND critical donor parts are preserved
      const zip2 = await JSZip.loadAsync(out);
      const s1 = await zip2.file("xl/worksheets/sheet1.xml")!.async("string");
      expect(s1).toContain(">TEST<");
      expect(zip2.file("xl/sharedStrings.xml")).toBeTruthy();
      expect(zip2.file("xl/styles.xml")).toBeTruthy();
      // sheet2 (Проверки) со словарями — главный «отпечаток» шаблона ФРДО
      expect(zip2.file("xl/worksheets/sheet2.xml")).toBeTruthy();
    },
  );
});
